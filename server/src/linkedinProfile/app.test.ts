// LinkedIn contre GitHub de bout en bout (API + pipeline), sans un seul appel
// réel : faux GitHub, fausse IA, faux chercheur de LinkedIn, base en mémoire.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../../../shared/fixtures";
import type { CvReading } from "../../../shared/readings";
import type { CardData, ComparisonData, JobState, StatCode } from "../../../shared/types";
import { createApp, type AppOptions } from "../app";
import { Store } from "../db";
import type { CardBody, Deps } from "../pipeline";
import { weekRank } from "../top";
import type { LinkedinFinder, UrlLookup } from "./index";
import type { LinkedinProfile } from "./profile";
import { LinkedinCache } from "./store";

const URL_ = "https://www.linkedin.com/in/camille-ardent";

const PROFILE: LinkedinProfile = {
  url: URL_,
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
};

function body(card: CardData): CardBody {
  const { id: _id, createdAt: _c, ...rest } = card;
  return rest;
}

const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
});

type FinderImpl = { forGithub?: LinkedinFinder["forGithub"]; forUrl?: (url: string) => Promise<UrlLookup> };

function setup(finder: FinderImpl | null, over: Partial<Deps> = {}, appOver: Partial<AppOptions> = {}) {
  const store = new Store(":memory:");
  stores.push(store);
  const calls = { collect: [] as string[], readCv: [] as string[], forGithub: [] as { facts: unknown; url?: string }[], forUrl: [] as string[] };
  const deps: Deps = {
    async collectGithub(login) {
      calls.collect.push(login);
      if (login === "ghost") throw Object.assign(new Error("unknown_user"), { code: "unknown_user", name: "EngineError" });
      return { login, readme: 300 };
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
    async readCv(text) {
      calls.readCv.push(text);
      return READING;
    },
    scoreCv(_r, _c, { lang, judgedInSeconds }) {
      return { ...body(FIXTURES.cv), lang, judgedInSeconds };
    },
    compareCards(cv, github) {
      const deltas = Object.fromEntries(cv.stats.map((s) => [s.code, github.stats.find((g) => g.code === s.code)!.value - s.value])) as Record<StatCode, number>;
      return { cv, github, deltas, headline: { fr: "Ton CV a volé 7 points à ton code", en: "Your CV stole 7 points from your code" } };
    },
    async renderImage() {
      return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    },
    ...over,
  };
  const linkedinProfiles: LinkedinFinder | undefined = finder
    ? {
        async forGithub(facts, opts) {
          calls.forGithub.push({ facts, url: opts?.url });
          return finder.forGithub ? finder.forGithub(facts, opts) : null;
        },
        async forUrl(url) {
          calls.forUrl.push(url);
          return finder.forUrl ? finder.forUrl(url) : { status: "not_found" };
        },
      }
    : undefined;
  const { app, pipeline } = createApp({
    store,
    deps,
    githubToken: "t",
    baseUrl: "https://skills.test",
    ogDir: mkdtempSync(join(tmpdir(), "tys-li-")),
    linkedinProfiles,
    ...appOver,
  });
  return { app, pipeline, store, calls };
}

type Ctx = ReturnType<typeof setup>;

async function post(ctx: Ctx, payload: Record<string, unknown>) {
  const res = await ctx.app.request("/api/card", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang: "fr", ...payload }) });
  const json = (await res.json()) as { id: string; deleteToken?: string; cached?: boolean; code?: string; message?: { fr: string } };
  if (res.status === 202) await ctx.pipeline.wait(json.id);
  return { status: res.status, json };
}

async function state(ctx: Ctx, id: string) {
  return (await (await ctx.app.request(`/api/card/${id}`)).json()) as JobState;
}

describe("entrée GitHub : le LinkedIn trouvé devient une comparaison", () => {
  it("LinkedIn contre GitHub : lu par le chemin CV, textes en LinkedIn, ligne racine « linkedin »", async () => {
    const ctx = setup({ forGithub: async () => PROFILE });
    const { status, json } = await post(ctx, { login: "camille-ardent" });
    expect(status).toBe(202);
    const s = await state(ctx, json.id);
    if (s.state !== "done" || s.kind !== "comparison") throw new Error(`pas une comparaison : ${JSON.stringify(s)}`);
    const cmp = s.comparison;
    expect(cmp.declaredSource).toBe("linkedin");
    expect(cmp.cv.declaredSource).toBe("linkedin");
    expect(cmp.headline.fr).toBe("Ton LinkedIn a volé 7 points à ton code");
    expect(cmp.headline.en).toBe("Your LinkedIn stole 7 points from your code");
    // L'IA a lu le texte du profil, jamais stocké.
    expect(ctx.calls.readCv[0]).toContain("Senior Full-Stack Engineer — Paysolde (2022-03 – present)");
    expect(JSON.stringify(ctx.store.getCard(json.id))).not.toContain("Refonte du paiement");
    expect(ctx.store.getCard(json.id)).toMatchObject({ source: "linkedin", kind: "comparison", login: "camille-ardent", facts: { linkedinUrl: URL_ } });
    expect(ctx.store.getCard(cmp.cv.id)).toMatchObject({ source: "linkedin", login: null });
    // La carte GitHub de la comparaison entre au top de la semaine.
    expect(ctx.store.getCard(cmp.github.id)).toMatchObject({ source: "github", login: "camille-ardent" });
    expect(weekRank(ctx.store.db, cmp.github.id)).not.toBeNull();
  });

  it("cache 24 h : le même pseudo rend la comparaison, sans rien relire", async () => {
    const ctx = setup({ forGithub: async () => PROFILE });
    const first = await post(ctx, { login: "camille-ardent" });
    const again = await post(ctx, { login: "camille-ardent" });
    expect(again).toMatchObject({ status: 200, json: { id: first.json.id, cached: true } });
    expect(ctx.calls.collect).toHaveLength(1);
    expect(ctx.calls.forGithub).toHaveLength(1);
  });

  it("aucun LinkedIn, ou une panne : la fiche GitHub sort seule", async () => {
    for (const forGithub of [async () => null, async () => Promise.reject(new Error("boom"))]) {
      const ctx = setup({ forGithub });
      const { json } = await post(ctx, { login: "camille-ardent" });
      expect(await state(ctx, json.id)).toMatchObject({ state: "done", kind: "card", card: { source: "github" } });
      expect(ctx.calls.readCv).toHaveLength(0);
    }
  });

  it("lecture IA du profil en échec : la fiche GitHub, hors cache", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = setup({ forGithub: async () => PROFILE }, { readCv: async () => Promise.reject(new Error("ia")) });
    const { json } = await post(ctx, { login: "camille-ardent" });
    expect(await state(ctx, json.id)).toMatchObject({ state: "done", kind: "card", card: { source: "github" } });
    expect(ctx.store.getCard(json.id)?.degraded).toBe(true);
    warn.mockRestore();
  });

  it("profil LinkedIn non dev : la fiche GitHub seule", async () => {
    const ctx = setup({ forGithub: async () => PROFILE }, { readCv: async () => ({ ...READING, is_dev_profile: false }) });
    const { json } = await post(ctx, { login: "camille-ardent" });
    expect(await state(ctx, json.id)).toMatchObject({ state: "done", kind: "card", card: { source: "github" } });
  });

  it("le lien collé par le joueur avec son pseudo est passé au chercheur", async () => {
    const ctx = setup({ forGithub: async () => PROFILE });
    await post(ctx, { login: "camille-ardent", linkedin: "fr.linkedin.com/in/Camille-Ardent/?trk=x" });
    expect(ctx.calls.forGithub[0]!.url).toBe(URL_);
  });

  it("la carte vitrine ne cherche jamais de LinkedIn", async () => {
    const ctx = setup({ forGithub: async () => PROFILE }, {}, { showcaseLogin: "jmougeot" });
    await ctx.app.request("/api/showcase");
    await ctx.pipeline.drain();
    expect(ctx.calls.forGithub).toHaveLength(0);
  });
});

describe("entrée LinkedIn (le champ unique)", () => {
  it("GitHub trouvé dans le profil : la même comparaison", async () => {
    const ctx = setup({ forUrl: async () => ({ status: "found", profile: PROFILE, githubLogin: "camille-ardent" }) });
    const { json } = await post(ctx, { login: "https://www.linkedin.com/in/Camille-Ardent/" });
    expect(ctx.calls.forUrl).toEqual([URL_]);
    expect(ctx.calls.collect).toEqual(["camille-ardent"]);
    expect(ctx.calls.forGithub).toHaveLength(0); // le profil est déjà lu
    const s = await state(ctx, json.id);
    expect(s).toMatchObject({ state: "done", kind: "comparison", comparison: { declaredSource: "linkedin" } });
  });

  it("pas de GitHub : une fiche LinkedIn seule, hors top, en cache 24 h par adresse", async () => {
    const ctx = setup({ forUrl: async () => ({ status: "found", profile: PROFILE, githubLogin: null }) });
    const { json } = await post(ctx, { linkedin: "linkedin.com/in/camille-ardent" });
    const s = await state(ctx, json.id);
    expect(s).toMatchObject({ state: "done", kind: "card", card: { source: "cv", declaredSource: "linkedin" } });
    expect(ctx.store.getCard(json.id)).toMatchObject({ source: "linkedin", login: null, facts: { linkedinUrl: URL_ } });
    expect(weekRank(ctx.store.db, json.id)).toBeNull();
    expect(ctx.calls.collect).toHaveLength(0);
    const again = await post(ctx, { linkedin: "https://fr.linkedin.com/in/camille-ardent?trk=abc" });
    expect(again).toMatchObject({ status: 200, json: { id: json.id, cached: true } });
    expect(ctx.calls.forUrl).toHaveLength(1);
  });

  it("le GitHub du profil n'existe plus : la fiche LinkedIn seule", async () => {
    const ctx = setup({ forUrl: async () => ({ status: "found", profile: PROFILE, githubLogin: "ghost" }) });
    const { json } = await post(ctx, { linkedin: URL_ });
    expect(await state(ctx, json.id)).toMatchObject({ state: "done", kind: "card", card: { declaredSource: "linkedin" } });
  });

  it("« Ajoute ton GitHub pour prouver » : pseudo + adresse relancent en comparaison", async () => {
    const ctx = setup({ forGithub: async (_f, o) => (o?.url === URL_ ? PROFILE : null) });
    const { json } = await post(ctx, { login: "camille-ardent", linkedin: URL_ });
    expect(await state(ctx, json.id)).toMatchObject({ state: "done", kind: "comparison" });
  });

  it("sans fournisseur : message clair ; avec un pseudo, le lien est ignoré", async () => {
    const ctx = setup(null);
    const r = await post(ctx, { login: "linkedin.com/in/camille-ardent" });
    expect(r).toMatchObject({ status: 400, json: { code: "linkedin" } });
    expect(r.json.message?.fr).toBe("Entrée LinkedIn indisponible, tape ton pseudo GitHub.");
    const both = await post(ctx, { login: "camille-ardent", linkedin: URL_ });
    expect(await state(ctx, both.json.id)).toMatchObject({ state: "done", kind: "card", card: { source: "github" } });
  });

  it("adresse qui n'est pas un profil : 400", async () => {
    const ctx = setup({});
    for (const linkedin of ["https://www.linkedin.com/company/brumes", "linkedin.com/in/"]) {
      expect(await post(ctx, { linkedin })).toMatchObject({ status: 400, json: { code: "linkedin" } });
    }
    expect(ctx.calls.forUrl).toHaveLength(0);
  });

  it("introuvable ou plafond du jour : une erreur claire, pas de fiche", async () => {
    for (const [status, fr] of [
      ["not_found", "introuvable"],
      ["unavailable", "aujourd'hui"],
    ] as const) {
      const ctx = setup({ forUrl: async () => ({ status }) });
      const { json } = await post(ctx, { linkedin: URL_ });
      const s = await state(ctx, json.id);
      expect(s).toMatchObject({ state: "error", code: "linkedin" });
      expect(s.state === "error" && s.message.fr).toContain(fr);
    }
  });

  it("le GitHub lié est masqué par son propriétaire : pas de fiche", async () => {
    const ctx = setup({ forUrl: async () => ({ status: "found", profile: PROFILE, githubLogin: "camille-ardent" }) });
    ctx.store.claimOwner("camille-ardent", 42);
    ctx.store.setOwnerHidden("camille-ardent", true);
    const { json } = await post(ctx, { linkedin: URL_ });
    expect(await state(ctx, json.id)).toMatchObject({ state: "error", code: "gone" });
  });

  it("supprimer la fiche oublie le profil gardé en cache", async () => {
    const ctx = setup({ forUrl: async () => ({ status: "found", profile: PROFILE, githubLogin: null }) });
    const cache = new LinkedinCache(ctx.store.db);
    cache.putProfile(URL_, PROFILE, null);
    const { json } = await post(ctx, { linkedin: URL_ });
    const res = await ctx.app.request(`/api/card/${json.id}?token=${json.deleteToken}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(cache.getProfile(URL_)).toBeNull();
  });

  it("config : l'entrée LinkedIn n'est annoncée qu'avec un fournisseur", async () => {
    expect(await (await setup({}).app.request("/api/config")).json()).toMatchObject({ linkedinEntry: true });
    expect(await (await setup(null).app.request("/api/config")).json()).toMatchObject({ linkedinEntry: false });
  });
});

// Type-only : la comparaison garde la forme commune.
export type _Check = ComparisonData["declaredSource"];
