// Barème 0.4.0 (§18.37) : le pipeline passe au scoreur le profil LinkedIn rangé
// (postes datés, formation, compétences, adresse) et l'heure de la fiche, sur les
// deux chemins LinkedIn : fiche LinkedIn seule et comparaison. Rien d'autre du
// profil n'y va, et rien de neuf n'est gardé hors de la fiche.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURES } from "../../shared/fixtures";
import type { CvReading } from "../../shared/readings";
import type { CardData, JobState, StatCode } from "../../shared/types";
import { createApp } from "./app";
import { Store } from "./db";
import type { LinkedinFinder, UrlLookup } from "./linkedinProfile/index";
import type { LinkedinProfile } from "./linkedinProfile/profile";
import type { CardBody, Deps } from "./pipeline";
import { cvCounts } from "./scoring/__fixtures__/make";
import type { DeclaredProfile } from "./scoring/grid";
import { scoreCv } from "./scoring/index";

const URL_ = "https://www.linkedin.com/in/camille-ardent";

const PROFILE: LinkedinProfile = {
  url: URL_,
  name: "Camille Ardent",
  headline: "Senior Full-Stack Engineer",
  title: "Senior Full-Stack Engineer",
  summary: "Full-stack depuis 7 ans.",
  roles: [
    { title: "Senior Full-Stack Engineer", company: "Paysolde", start: "2022-03", end: null, description: "Refonte du paiement en React." },
    { title: "Stagiaire développeuse", company: "Alan", start: "2021-03", end: "2021-09", description: "" },
  ],
  education: [{ school: "CentraleSupélec", degree: "Ingénieur", field: "Informatique", start: 2018, end: 2021 }],
  skills: ["TypeScript", "React"],
  photoUrl: "https://media.licdn.com/p.jpg",
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

const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
});

type ScoreCvOpts = Parameters<Deps["scoreCv"]>[2];

function setup(finder: { forGithub?: LinkedinFinder["forGithub"]; forUrl?: (url: string) => Promise<UrlLookup> }) {
  const store = new Store(":memory:");
  stores.push(store);
  const seen: ScoreCvOpts[] = [];
  const deps: Deps = {
    async collectGithub(login) {
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
    async readCv() {
      return READING;
    },
    scoreCv(_r, _c, opts) {
      seen.push(opts);
      return { ...body(FIXTURES.cv), lang: opts.lang, judgedInSeconds: opts.judgedInSeconds };
    },
    compareCards(cv, github) {
      const deltas = Object.fromEntries(cv.stats.map((s) => [s.code, github.stats.find((g) => g.code === s.code)!.value - s.value])) as Record<StatCode, number>;
      return { cv, github, deltas, headline: { fr: "Ton CV a volé 7 points à ton code", en: "Your CV stole 7 points from your code" } };
    },
    async renderImage() {
      return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    },
  };
  const linkedinProfiles: LinkedinFinder = {
    async forGithub(facts, opts) {
      return finder.forGithub ? finder.forGithub(facts, opts) : null;
    },
    async forUrl(url) {
      return finder.forUrl ? finder.forUrl(url) : { status: "not_found" };
    },
  };
  const { app, pipeline } = createApp({ store, deps, githubToken: "t", baseUrl: "https://skills.test", ogDir: mkdtempSync(join(tmpdir(), "tys-grid-")), linkedinProfiles });
  return { app, pipeline, store, seen };
}

async function run(ctx: ReturnType<typeof setup>, payload: Record<string, unknown>) {
  const res = await ctx.app.request("/api/card", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang: "fr", ...payload }) });
  const json = (await res.json()) as { id: string };
  if (res.status === 202) await ctx.pipeline.wait(json.id);
  return (await (await ctx.app.request(`/api/card/${json.id}`)).json()) as JobState;
}

/** Ce que la grille lit du profil, et rien d'autre. */
const DECLARED = { roles: PROFILE.roles, education: PROFILE.education, skills: PROFILE.skills, url: URL_ };

describe("le profil LinkedIn rangé va au scoreur (§18.37)", () => {
  it("comparaison : postes datés, formation, compétences et adresse, à l'heure de la fiche", async () => {
    const ctx = setup({ forGithub: async () => ({ profile: PROFILE, proven: true }) });
    const s = await run(ctx, { login: "camille-ardent" });
    if (s.state !== "done" || s.kind !== "comparison") throw new Error(`pas une comparaison : ${JSON.stringify(s)}`);
    expect(ctx.seen).toHaveLength(1);
    expect(ctx.seen[0]!.linkedin).toEqual(DECLARED);
    expect(ctx.seen[0]!.github).toMatchObject({ login: "camille-ardent" });
    expect(ctx.seen[0]!.now).toBe(s.comparison.createdAt);
  });

  it("fiche LinkedIn seule : le même profil rangé, ni nom, ni titre, ni photo", async () => {
    const ctx = setup({ forUrl: async (url) => ({ status: "found", profile: { ...PROFILE, url }, githubLogin: null }) });
    const s = await run(ctx, { linkedin: URL_ });
    if (s.state !== "done" || s.kind !== "card") throw new Error(`pas une fiche : ${JSON.stringify(s)}`);
    expect(ctx.seen).toHaveLength(1);
    expect(ctx.seen[0]!.linkedin).toEqual(DECLARED);
    expect(ctx.seen[0]!.github).toBeUndefined();
    expect(ctx.seen[0]!.now).toBe(s.card.createdAt);
    // Rien du profil n'est gardé en base, hors de ce que la fiche affiche.
    expect(JSON.stringify(ctx.store.getCard(s.card.id))).not.toContain("Paysolde");
  });

  it("le vrai scoreur compte l'expérience sur ces postes : stage à moitié, poste en cours jusqu'à la fiche", () => {
    const fit: DeclaredProfile = DECLARED; // le profil rangé est bien ce que lit la grille
    const card = scoreCv(READING, cvCounts(), { lang: "fr", judgedInSeconds: 6, linkedin: fit, now: "2026-11-10T12:00:00Z" });
    const xp = card.grid!.criteria.find((c) => c.code === "XP")!;
    // 2022-03 → 2026-11 : 56 mois ; stage de 6 mois à moitié : 3 mois. 59 mois, 4,9 ans.
    expect(xp.reached.fr).toMatch(/^4,9 ans comptés/);
    // L'école est celle que retient la lecture du profil, pas la liste de formation brute
    // (un semestre d'échange n'y compte pas) : ici la lecture n'en retient aucune.
    expect(card.grid!.criteria.find((c) => c.code === "EDU")!.state).toBe("missing");
    expect(card.overall).toBe(card.grid!.overall);
  });
});
