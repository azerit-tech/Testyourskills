// Barème 0.4.0 (§18.37) : le pipeline passe au scoreur le profil LinkedIn rangé
// (postes datés, formation, compétences, adresse) et l'heure de la fiche, sur les
// deux chemins LinkedIn : fiche LinkedIn seule et comparaison. Rien d'autre du
// profil n'y va, et rien de neuf n'est gardé hors de la fiche. Il y passe aussi la
// liste des employeurs à forte barre du serveur (HIGH_BAR_EMPLOYERS_FILE).

import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURES } from "../../shared/fixtures";
import type { CvReading } from "../../shared/readings";
import type { CardData, Grid, JobState, StatCode } from "../../shared/types";
import { createApp } from "./app";
import { Store } from "./db";
import type { LinkedinFinder, UrlLookup } from "./linkedinProfile/index";
import type { LinkedinProfile } from "./linkedinProfile/profile";
import type { CardBody, Deps } from "./pipeline";
import { cvCounts, facts as githubFacts } from "./scoring/__fixtures__/make";
import { EMPLOYERS_ENV, setHighBarEmployersForTests } from "./scoring/employers";
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

/** `realScore` : le vrai scoreur de fiche déclarée (et des faits GitHub de forme réelle), au lieu de la fiche figée. */
function setup(finder: { forGithub?: LinkedinFinder["forGithub"]; forUrl?: (url: string) => Promise<UrlLookup> }, opt: { realScore?: boolean; githubGrid?: Grid } = {}) {
  const store = new Store(":memory:");
  stores.push(store);
  const seen: ScoreCvOpts[] = [];
  const deps: Deps = {
    async collectGithub(login) {
      return opt.realScore ? githubFacts({ login }) : { login, readme: 300 };
    },
    async pickFilesForReading() {
      return [];
    },
    async readCode() {
      return { readings: [], ai_status: "ai_typed" };
    },
    aiAvailable: () => true,
    scoreGithub(facts, _ai, { lang, judgedInSeconds }) {
      const grid = opt.githubGrid ? { grid: opt.githubGrid, overall: opt.githubGrid.overall } : {};
      return { ...body(FIXTURES.gold), login: (facts as { login: string }).login, lang, judgedInSeconds, ...grid };
    },
    async extractPdfText() {
      return { text: "", pages: 1 };
    },
    cvTextCounts: () => ({ words: 80, pages: 1, buzzwords: {}, buzzwordsPer100: 0, passionCount: 0 }),
    async readCv() {
      return READING;
    },
    scoreCv(r, c, opts) {
      seen.push(opts);
      if (opt.realScore) return scoreCv(r, c, opts as Parameters<typeof scoreCv>[2]);
      return { ...body(FIXTURES.cv), lang: opts.lang, judgedInSeconds: opts.judgedInSeconds };
    },
    compareCards(cv, github) {
      const deltas = Object.fromEntries(cv.stats.map((s) => [s.code, github.stats.find((g) => g.code === s.code)!.value - s.value])) as Record<StatCode, number>;
      return { cv, github, deltas, headline: { fr: "Ton CV annonce 7 points que ton code public ne montre pas encore.", en: "Your CV claims 7 points your public code doesn't show yet." } };
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

/** La fiche telle que la personne fichée la relit : avec le jeton de la fiche (`as: "visitor"` : sans). */
async function run(ctx: ReturnType<typeof setup>, payload: Record<string, unknown>, as: "person" | "visitor" = "person") {
  const res = await ctx.app.request("/api/card", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang: "fr", ...payload }) });
  const json = (await res.json()) as { id: string; deleteToken?: string };
  if (res.status === 202) await ctx.pipeline.wait(json.id);
  const headers: Record<string, string> = as === "person" && json.deleteToken ? { "x-card-token": json.deleteToken } : {};
  return (await (await ctx.app.request(`/api/card/${json.id}`, { headers })).json()) as JobState;
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

describe("la liste des employeurs à forte barre, lue dans son fichier, va au scoreur (§18.37)", () => {
  // Noms inventés : la liste d'exemple du dépôt, posée comme le serait celle du serveur.
  const HIGH_BAR_PROFILE: LinkedinProfile = {
    ...PROFILE,
    roles: [
      { title: "Staff engineer", company: "Fictiva Labs Paris", start: "2023-01", end: null, description: "Plateforme de paiement." },
      { title: "Software engineer", company: "Fictiva Labs Paris", start: "2020-01", end: "2022-12", description: "Front React." },
    ],
  };
  const emp = (card: CardData) => card.grid!.criteria.find((c) => c.code === "EMP")!;

  function withListFile(): string {
    const file = join(mkdtempSync(join(tmpdir(), "tys-employers-")), "employers.json");
    copyFileSync(join(import.meta.dirname, "../../data/employers.example.json"), file);
    process.env[EMPLOYERS_ENV] = file;
    setHighBarEmployersForTests(null);
    return file;
  }
  afterEach(() => {
    delete process.env[EMPLOYERS_ENV];
    setHighBarEmployersForTests(null);
  });

  it("fiche LinkedIn seule : deux ans chez un employeur de la liste, et une trajectoire qui monte, ouvrent le 10 du parcours", async () => {
    const file = withListFile();
    const ctx = setup({ forUrl: async (url) => ({ status: "found", profile: { ...HIGH_BAR_PROFILE, url }, githubLogin: null }) }, { realScore: true });
    const s = await run(ctx, { linkedin: URL_ });
    if (s.state !== "done" || s.kind !== "card") throw new Error(`pas une fiche : ${JSON.stringify(s)}`);
    expect(ctx.seen[0]!.highBar?.source).toBe(file);
    expect(ctx.seen[0]!.highBar?.employers.map((e) => e.name)).toEqual(["Fictiva Labs", "Orbe Quantique", "Nimbus Atelier"]);
    expect(emp(s.card).score).toBe(10);
    expect(emp(s.card).reached.fr).toMatch(/employeur à forte barre d'embauche, et une trajectoire qui monte\.$/);
  });

  it("comparaison : la même liste, sur la fiche déclarée", async () => {
    withListFile();
    const ctx = setup({ forGithub: async () => ({ profile: HIGH_BAR_PROFILE, proven: true }) }, { realScore: true });
    const s = await run(ctx, { login: "camille-ardent" });
    if (s.state !== "done" || s.kind !== "comparison") throw new Error(`pas une comparaison : ${JSON.stringify(s)}`);
    expect(ctx.seen[0]!.github).toMatchObject({ login: "camille-ardent" });
    expect(emp(s.comparison.cv).score).toBe(10);
  });

  it("sans fichier : liste vide, rien ne plante, le parcours s'arrête au poste tenu deux ans", async () => {
    setHighBarEmployersForTests(null);
    const ctx = setup({ forUrl: async (url) => ({ status: "found", profile: { ...HIGH_BAR_PROFILE, url }, githubLogin: null }) }, { realScore: true });
    const s = await run(ctx, { linkedin: URL_ });
    if (s.state !== "done" || s.kind !== "card") throw new Error(`pas une fiche : ${JSON.stringify(s)}`);
    expect(ctx.seen[0]!.highBar).toEqual({ employers: [], source: null });
    expect(emp(s.card).score).toBe(6);
  });
});

describe("la page partagée : le serveur ne rend la grille entière qu'à la personne fichée (§18.37)", () => {
  it("sans le jeton : la grille publique, sans « ce qui manque » ; la note ne bouge pas", async () => {
    const ctx = setup({ forUrl: async (url) => ({ status: "found", profile: { ...PROFILE, url }, githubLogin: null }) }, { realScore: true });
    const own = await run(ctx, { linkedin: URL_ });
    if (own.state !== "done" || own.kind !== "card") throw new Error("pas une fiche");
    const seen = (await (await ctx.app.request(`/api/card/${own.card.id}`)).json()) as JobState;
    if (seen.state !== "done" || seen.kind !== "card") throw new Error("pas une fiche");
    expect(own.card.grid!.criteria.some((c) => c.next)).toBe(true);
    expect(seen.card.grid!.criteria.some((c) => c.next)).toBe(false);
    expect(seen.card.grid!.overall).toBe(own.card.grid!.overall);
    expect(seen.card.overall).toBe(own.card.overall);
  });

  it("fiche dénoncée, non revendiquée : pas de grille, même pour qui tient le jeton ; revendiquée : la grille publique", async () => {
    const ctx = setup(
      { forUrl: async (url) => ({ status: "found", profile: { ...PROFILE, url }, githubLogin: null }), forGithub: async () => ({ profile: PROFILE, proven: true }) },
      { realScore: true },
    );
    const by = await run(ctx, { linkedin: URL_ });
    if (by.state !== "done" || by.kind !== "card") throw new Error("pas une fiche");
    const s = await run(ctx, { login: "camille-ardent", denouncedBy: by.card.id });
    if (s.state !== "done" || s.kind !== "comparison") throw new Error(`pas une comparaison : ${JSON.stringify(s)}`);
    expect(ctx.store.getCard(s.comparison.id)!.denouncedBy).toBe(by.card.id);
    expect(s.comparison.cv.grid).toBeUndefined();
    expect(s.comparison.grid).toBeUndefined();
    // Le jeu reste : la note de la fiche.
    expect(s.comparison.github.overall).toBeGreaterThan(0);
    ctx.store.claimOwner("camille-ardent", 42);
    const after = (await (await ctx.app.request(`/api/card/${s.comparison.id}`)).json()) as JobState;
    if (after.state !== "done" || after.kind !== "comparison") throw new Error("pas une comparaison");
    expect(after.comparison.cv.grid).toBeDefined();
    expect(after.comparison.cv.grid!.criteria.some((c) => c.next)).toBe(false);
  });

  it("fiche GitHub dénoncée, non revendiquée : aucune grille, ni au visiteur, ni au dénonciateur ; revendiquée : la grille revient", async () => {
    const githubGrid: Grid = {
      criteria: [
        { code: "CODE", score: 7, state: "scored", counted: true, source: "github", reached: { fr: "Niveau 3,5 sur 5.", en: "Level 3.5 out of 5." }, next: { fr: "Pour 8 : …", en: "For 8: …" }, flags: [] },
        { code: "ACT", score: 6, state: "scored", counted: true, source: "github", reached: { fr: "30 semaines.", en: "30 weeks." }, flags: [] },
      ],
      overall: 66,
    };
    const ctx = setup({}, { githubGrid });
    const post = async (payload: Record<string, unknown>) => {
      const res = await ctx.app.request("/api/card", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang: "fr", ...payload }) });
      const json = (await res.json()) as { id: string; deleteToken: string };
      await ctx.pipeline.wait(json.id);
      return json;
    };
    const get = async (id: string, token?: string) => {
      const s = (await (await ctx.app.request(`/api/card/${id}`, { headers: token ? { "x-card-token": token } : {} })).json()) as JobState;
      if (s.state !== "done" || s.kind !== "card") throw new Error(`pas une fiche : ${JSON.stringify(s)}`);
      return s.card;
    };
    const by = await post({ login: "leamd" });
    const target = await post({ login: "camroux", denouncedBy: by.id });
    expect(ctx.store.getCard(target.id)!.denouncedBy).toBe(by.id);
    // Le dénonciateur tient le jeton de la fiche : il n'est pas la personne fichée.
    for (const token of [undefined, target.deleteToken]) {
      const card = await get(target.id, token);
      expect(card.grid).toBeUndefined();
      expect(JSON.stringify(card)).not.toContain('"criteria"');
      expect(card.overall).toBeGreaterThan(0);
    }
    // La fiche de qui a dénoncé, faite pour soi, garde sa grille entière.
    expect((await get(by.id, by.deleteToken)).grid!.criteria.some((c) => c.next)).toBe(true);
    ctx.store.claimOwner("camroux", 7);
    for (const token of [undefined, target.deleteToken]) {
      const card = await get(target.id, token);
      expect(card.grid?.overall).toBe(66);
      // La version publique : jamais « ce qui manque », même avec le jeton du dénonciateur.
      expect(card.grid!.criteria.some((c) => c.next)).toBe(false);
    }
  });
});
