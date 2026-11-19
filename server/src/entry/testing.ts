// Banc d'essai des deux portes (SPEC §18.80) : l'API et le pipeline avec de faux
// GitHub, IA, lecteur et chercheur de profils LinkedIn. Aucun appel réel.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FIXTURES } from "../../../shared/fixtures";
import { fakeDossier } from "../__fixtures__/fakeDossier";
import type { CvReading } from "../../../shared/readings";
import type { CardData, JobState } from "../../../shared/types";
import { createApp, type AppOptions } from "../app";
import { Store } from "../db";
import type { LinkedinFinder, ProfilePeek, UrlLookup } from "../linkedinProfile/index";
import type { LinkedinProfile } from "../linkedinProfile/profile";
import type { LinkedinCandidate, LinkedinPeople, SearchResult } from "../linkedinProfile/search";
import type { CardBody, Deps } from "../pipeline";

export const CAMILLE_URL = "https://www.linkedin.com/in/camille-ardent";

export const CAMILLE: LinkedinCandidate = {
  url: CAMILLE_URL,
  name: "Camille Ardent",
  headline: "Senior Full-Stack Engineer",
  photoUrl: "https://media.licdn.com/dms/image/v2/D4E03AQcamille/profile-displayphoto-shrink_200_200/0/1",
};
export const HOMONYM: LinkedinCandidate = { url: "https://www.linkedin.com/in/camille-ardent-2", name: "Camille Ardent", headline: "Cheffe de projet" };

export const PROFILE: LinkedinProfile = {
  url: CAMILLE_URL,
  name: "Camille Ardent",
  headline: "Senior Full-Stack Engineer",
  title: "Senior Full-Stack Engineer",
  summary: "Full-stack depuis 7 ans.",
  roles: [{ title: "Senior Full-Stack Engineer", company: "Paysolde", start: "2022-03", end: null, description: "Refonte du paiement en React." }],
  education: [],
  skills: ["TypeScript", "React"],
};

const READING: CvReading = {
  language: "fr",
  position: "FS",
  full_name: "Camille Ardent",
  years_declared: 7,
  seniority_claimed: "senior",
  roles: [],
  technos_listed: ["react"],
  technos_described: ["react"],
  tests_ci_review_mentions: [],
  projects_with_dated_outcome: 1,
  writing_quality: 3,
  is_dev_profile: true,
  title_mentions_ai: false,
  describes_ai_project: false,
  school_name: "",
  school_tier: "none",
};

function body(card: CardData): CardBody {
  const { id: _id, createdAt: _c, ...rest } = card;
  return rest;
}

export interface EntrySetup {
  /** Ce que la recherche par nom rend ; absent : pas de recherche du tout. */
  people?: { byName?: (raw: string, strict: boolean) => SearchResult | Promise<SearchResult>; byEmail?: (email: string) => LinkedinCandidate | null } | null;
  /** Ce que la lecture d'un profil rend (défaut : le profil de Camille, sans GitHub). */
  forUrl?: (url: string) => UrlLookup | Promise<UrlLookup>;
  /** Le profil lu pour sa photo au retour d'une connexion ; absent : le serveur ne sait pas le lire. */
  peek?: (url: string) => ProfilePeek | null | Promise<ProfilePeek | null>;
  app?: Partial<AppOptions>;
}

export function setupEntry(o: EntrySetup = {}) {
  const store = new Store(":memory:");
  const calls = { collect: [] as string[], byName: [] as { raw: string; strict: boolean; spent: boolean; company?: string }[], byEmail: [] as string[], forUrl: [] as string[], peek: [] as string[] };
  const deps: Deps = {
    async collectGithub(login) {
      calls.collect.push(login);
      if (login === "ghost") throw Object.assign(new Error("unknown_user"), { code: "unknown_user", name: "EngineError" });
      return login === "affiche" ? { login, readme: 300, profile: { login, blog: CAMILLE_URL } } : { login, readme: 300 };
    },
    async pickFilesForReading() {
      return [];
    },
    async readCode() {
      return { readings: [], ai_status: "ai_typed" };
    },
    aiAvailable: () => true,
    scoreGithub(facts, _ai, { lang, judgedInSeconds }) {
      return { ...body(FIXTURES.gold), login: (facts as { login: string }).login, lang, judgedInSeconds };
    },
    async extractPdfText() {
      return { text: "", pages: 1 };
    },
    cvTextCounts: () => ({ words: 80, pages: 1, buzzwords: {}, buzzwordsPer100: 0, passionCount: 0 }),
    async readCv() {
      return READING;
    },
    scoreCv(_r, _c, { lang, judgedInSeconds }) {
      return { ...body(FIXTURES.cv), lang, judgedInSeconds };
    },
    // Comme le moteur (scoring/compare.ts) : les deux pièces et la seule note du dossier.
    scoreDossier(declared, github, o) {
      return fakeDossier(this, declared, github, o);
    },
    async renderImage() {
      return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    },
  };
  const linkedinProfiles: LinkedinFinder = {
    async forGithub() {
      return null;
    },
    async forUrl(url) {
      calls.forUrl.push(url);
      return o.forUrl ? o.forUrl(url) : { status: "found", profile: { ...PROFILE, url }, githubLogin: null };
    },
    ...(o.peek
      ? {
          async peek(url, opts) {
            if (!(opts?.spend?.() ?? true)) return null;
            calls.peek.push(url);
            return o.peek!(url);
          },
        }
      : {}),
  };
  const p = o.people;
  const linkedinPeople: LinkedinPeople | undefined =
    p === null
      ? undefined
      : {
          async byName(raw, opts) {
            const spent = opts?.spend?.() ?? true;
            calls.byName.push({ raw, strict: !!opts?.strict, spent, ...(opts?.company ? { company: opts.company } : {}) });
            if (!spent) return { status: "off" };
            return p?.byName ? p.byName(raw, !!opts?.strict) : { status: "ok", results: [CAMILLE, HOMONYM] };
          },
          async byEmail(email) {
            calls.byEmail.push(email);
            return p?.byEmail ? p.byEmail(email) : null;
          },
        };
  const built = createApp({
    store,
    deps,
    githubToken: "t",
    baseUrl: "https://skills.test",
    ogDir: mkdtempSync(join(tmpdir(), "tys-entry-")),
    linkedinProfiles,
    linkedinPeople,
    ...o.app,
  });
  return { ...built, store, calls };
}

export type EntryCtx = ReturnType<typeof setupEntry>;

/** Demande une fiche et attend sa fin. `cookie` : les cookies du navigateur. */
export async function postCard(ctx: EntryCtx, payload: Record<string, unknown>, cookie?: string) {
  const res = await ctx.app.request("/api/card", {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ lang: "fr", ...payload }),
  });
  const json = (await res.json()) as { id: string; deleteToken?: string; cached?: boolean; code?: string };
  if (res.status === 202) await ctx.pipeline.wait(json.id);
  return { status: res.status, json, res };
}

export async function cardState(ctx: EntryCtx, id: string) {
  return (await (await ctx.app.request(`/api/card/${id}`)).json()) as JobState;
}

/** Les cookies posés par une réponse, prêts à être renvoyés (« nom=valeur; … ») ; un cookie effacé est retiré. */
export function cookiesOf(res: Response, before = ""): string {
  const jar = new Map(before.split(/;\s*/).filter(Boolean).map((kv) => [kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1)] as const));
  for (const line of res.headers.getSetCookie()) {
    const [pair = "", ...attrs] = line.split(/;\s*/);
    const name = pair.slice(0, pair.indexOf("="));
    const value = pair.slice(pair.indexOf("=") + 1);
    const gone = !value || attrs.some((a) => /^max-age=0$/i.test(a));
    if (gone) jar.delete(name);
    else jar.set(name, value);
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}
