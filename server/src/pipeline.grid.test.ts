// Barème 0.4.0 (§18.37) : le pipeline passe au scoreur le profil LinkedIn rangé
// (postes datés, formation, compétences, adresse) et l'heure de la fiche, sur les
// deux chemins LinkedIn : fiche LinkedIn seule et comparaison. Rien d'autre du
// profil n'y va, et rien de neuf n'est gardé hors de la fiche. Il y passe aussi la
// liste des employeurs à forte barre du serveur (HIGH_BAR_EMPLOYERS_FILE).

import { copyFileSync, mkdtempSync } from "node:fs";
import { fakeDossier } from "./__fixtures__/fakeDossier";
import { fileOf } from "../../shared/caseFile";
import { starsFor, type ComparisonData } from "../../shared/types";
import { starsOfRow } from "./bands";
import { latestCard, mainCard } from "./primes";
import { weekRank, weekTop } from "./top";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURES } from "../../shared/fixtures";
import type { CvReading } from "../../shared/readings";
import type { CardData, Grid, JobState } from "../../shared/types";
import { createApp } from "./app";
import { Store } from "./db";
import type { LinkedinFinder, UrlLookup } from "./linkedinProfile/index";
import type { LinkedinProfile } from "./linkedinProfile/profile";
import type { CardBody, Deps } from "./pipeline";
import { cvCounts, facts as githubFacts } from "./scoring/__fixtures__/make";
import { EMPLOYERS_ENV, setHighBarEmployersForTests } from "./scoring/employers";
import type { DeclaredProfile } from "./scoring/grid";
import { scoreCv, scoreDossier } from "./scoring/index";

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
  const rendered: Parameters<Deps["renderImage"]>[0][] = [];
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
    // Comme le moteur (scoring/compare.ts) : les deux pièces et la seule note du dossier.
    scoreDossier(declared, github, o) {
      if (opt.realScore) return scoreDossier(declared as Parameters<typeof scoreDossier>[0], github as Parameters<typeof scoreDossier>[1], o);
      return fakeDossier(this, declared, github, o);
    },
    async renderImage(input) {
      rendered.push(input);
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
  return { app, pipeline, store, seen, rendered };
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
    expect(xp.reached.fr).toMatch(/^4,9 ans comptés/);
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
    expect(emp(s.card).reached.fr).toMatch(/employeur très sélectif à l'embauche, et une trajectoire qui monte\.$/);
  });

  it("comparaison : la même liste, sur la fiche déclarée", async () => {
    withListFile();
    const ctx = setup({ forGithub: async () => ({ profile: HIGH_BAR_PROFILE, proven: true }) }, { realScore: true });
    const s = await run(ctx, { login: "camille-ardent" });
    if (s.state !== "done" || s.kind !== "comparison") throw new Error(`pas une comparaison : ${JSON.stringify(s)}`);
    // Un dossier, un calcul (SPEC §18.82) : la grille est celle du dossier, ses pièces n'en ont pas.
    expect(s.comparison.grid!.criteria.find((c) => c.code === "EMP")!.score).toBe(10);
    expect([s.comparison.cv.grid, s.comparison.github.grid]).toEqual([undefined, undefined]);
    expect([s.comparison.cv.overall, s.comparison.github.overall]).toEqual([s.comparison.grid!.overall, s.comparison.grid!.overall]);
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
    expect(after.comparison.grid).toBeDefined();
    expect(after.comparison.grid!.criteria.some((c) => c.next)).toBe(false);
    expect(after.comparison.cv.grid).toBeUndefined();
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

  it("dossier vide fait par un tiers : l'image est scellée, en cache court ; revendiquée, une autre image, la note revient", async () => {
    const githubGrid: Grid = {
      criteria: [{ code: "CODE", score: null, state: "unproven", counted: false, source: "github", reached: { fr: "", en: "" }, flags: [] }],
      overall: 20,
      rule: "empty_file",
    };
    const ctx = setup({}, { githubGrid });
    const post = async (payload: Record<string, unknown>) => {
      const res = await ctx.app.request("/api/card", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang: "fr", ...payload }) });
      const json = (await res.json()) as { id: string };
      await ctx.pipeline.wait(json.id);
      return json.id;
    };
    const by = await post({ login: "leamd" });
    const target = await post({ login: "camroux", denouncedBy: by });
    const og = () => ctx.app.request(`/og/${target}.png`);

    const sealed = await og();
    expect(sealed.status).toBe(200);
    expect(sealed.headers.get("cache-control")).toBe("public, max-age=300");
    expect(ctx.rendered).toHaveLength(1);
    const first = ctx.rendered[0]!.card!;
    expect(first.sealed).toBe(true);
    expect(first.grid).toBeUndefined();
    // Servie du cache : pas de second rendu.
    await og();
    expect(ctx.rendered).toHaveLength(1);

    // Revendiquée : un autre fichier de cache, la fiche entière, le cache long.
    ctx.store.claimOwner("camroux", 7);
    const claimed = await og();
    expect(claimed.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(ctx.rendered).toHaveLength(2);
    expect(ctx.rendered[1]!.card!.sealed).toBeUndefined();

    // La fiche de qui a dénoncé n'est jamais scellée.
    await ctx.app.request(`/og/${by}.png`);
    expect(ctx.rendered[2]!.card!.sealed).toBeUndefined();
  });
});

describe("garde-fou : une personne, un dossier, une note, partout (SPEC §18.82)", () => {
  it("LinkedIn seul puis GitHub : un seul dossier, un seul chiffre en base, à l'API, au top, aux bandes, aux primes, dans l'aperçu et l'image", async () => {
    const ctx = setup(
      { forUrl: async (url) => ({ status: "found", profile: { ...PROFILE, url }, githubLogin: null }), forGithub: async () => ({ profile: PROFILE, proven: true }) },
      { realScore: true },
    );
    // La personne entre par LinkedIn, sans GitHub : un dossier à une pièce.
    const alone = await run(ctx, { linkedin: URL_ });
    if (alone.state !== "done" || alone.kind !== "card") throw new Error("pas une fiche");
    // Son GitHub arrive, lien prouvé : le dossier à deux pièces, recalculé sur tout ce qu'on sait d'elle.
    const s = await run(ctx, { login: "camille-ardent" });
    if (s.state !== "done" || s.kind !== "comparison") throw new Error(`pas un dossier : ${JSON.stringify(s)}`);
    const id = s.comparison.id;
    const note = s.comparison.grid!.overall;
    const pieces = [s.comparison.cv.id, s.comparison.github.id];
    const seen: [string, number][] = [];

    // En base : la note est sur la ligne du dossier ; ses pièces n'ont ni grille ni note à elles.
    expect(ctx.store.groupIds(id).sort()).toEqual([id, ...pieces].sort());
    for (const rowId of ctx.store.groupIds(id)) {
      const row = ctx.store.getCard(rowId)!;
      if (row.kind === "comparison") seen.push([`base ${rowId}`, (row.data as ComparisonData).grid!.overall]);
      else {
        expect((row.data as CardData).grid, rowId).toBeUndefined();
        expect((row.data as CardData).rank, rowId).toBeUndefined();
        seen.push([`base ${rowId}`, (row.data as CardData).overall]);
      }
    }
    // Les données brutes de la pièce GitHub sont rangées sans note : les faits et la lecture du code.
    const ghRow = ctx.store.getCard(s.comparison.github.id)!;
    expect(ghRow.facts).toMatchObject({ login: "camille-ardent" });
    expect(ghRow.aiStored).toBe(true);

    // L'API : l'adresse du dossier, de chaque pièce et de l'ancienne fiche LinkedIn seule servent le même dossier.
    for (const address of [id, ...pieces, alone.card.id]) {
      const got = (await (await ctx.app.request(`/api/card/${address}`)).json()) as JobState;
      if (got.state !== "done" || got.kind !== "comparison") throw new Error(`${address} ne sert pas le dossier`);
      expect(got.comparison.id).toBe(id);
      seen.push([`api ${address} fiche`, fileOf(got.comparison).overall], [`api ${address} pièce`, got.comparison.cv.overall], [`api ${address} pièce`, got.comparison.github.overall]);
      if (got.comparison.grid) seen.push([`api ${address} grille`, got.comparison.grid.overall]);
    }
    // La page : une pièce ou l'ancienne fiche mènent au dossier ; son aperçu dit sa note.
    for (const address of [...pieces, alone.card.id]) {
      const page = await ctx.app.request(`/c/${address}`);
      expect([page.status, page.headers.get("location")], address).toEqual([302, `/c/${id}`]);
    }
    expect(await (await ctx.app.request(`/c/${id}`)).text()).toContain(`${note}/100`);
    // L'image : celle du dossier, quelle que soit l'adresse.
    for (const address of [id, ...pieces, alone.card.id]) {
      ctx.rendered.length = 0;
      expect((await ctx.app.request(`/og/${address}.png`)).status, address).toBe(200);
      for (const r of ctx.rendered) seen.push([`image ${address}`, r.comparison ? fileOf(r.comparison).overall : r.card!.overall]);
    }
    // Le top de la semaine : une ligne pour la personne, sur la note du dossier.
    const top = weekTop(ctx.store.db);
    expect(top.entries.map((e) => e.cardId)).toEqual([id]);
    seen.push(["top", top.entries[0]!.overall]);
    for (const address of [id, ...pieces, alone.card.id]) expect(weekRank(ctx.store.db, address), address).toMatchObject({ rank: 1, total: 1 });
    // Les bandes et les primes lisent la fiche du dossier.
    const root = ctx.store.getCard(id)!;
    expect(starsOfRow(root)).toBe(starsFor(note));
    seen.push(["primes", mainCard(root).overall], ["primes, dernière fiche", mainCard(latestCard(ctx.store, "camille-ardent", Date.now() + 1000)!).overall]);

    expect(seen.length).toBeGreaterThan(20);
    for (const [where, n] of seen) expect(n, where).toBe(note);
    // Et ce n'est pas un hasard : seule avec son LinkedIn, la même personne avait une autre note.
    expect(alone.card.overall).not.toBe(note);
  });
});
