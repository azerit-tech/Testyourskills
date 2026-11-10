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
import { weekRank, weekTop } from "../top";
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

/** Ce que le chercheur rend quand GitHub affiche lui-même ce LinkedIn : le lien est prouvé. */
const FOUND = { profile: PROFILE, proven: true };

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

type FinderImpl = { forGithub?: LinkedinFinder["forGithub"]; forUrl?: (url: string) => Promise<UrlLookup> };

function setup(finder: FinderImpl | null, over: Partial<Deps> = {}, appOver: Partial<AppOptions> = {}) {
  const store = new Store(":memory:");
  stores.push(store);
  const calls = { collect: [] as string[], readCv: [] as string[], forGithub: [] as { facts: unknown; url?: string }[], forUrl: [] as string[] };
  const deps: Deps = {
    async collectGithub(login) {
      calls.collect.push(login);
      if (login === "ghost") throw Object.assign(new Error("unknown_user"), { code: "unknown_user", name: "EngineError" });
      // « affiche » : ce GitHub met lui-même son LinkedIn dans son champ site.
      return login === "affiche" ? { login, readme: 300, profile: { login, blog: URL_ } } : { login, readme: 300 };
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
    const ctx = setup({ forGithub: async () => FOUND });
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
    expect(ctx.store.getCard(json.id)).toMatchObject({ source: "linkedin", kind: "comparison", login: "camille-ardent", facts: { linkedinUrl: URL_, linkedinProven: true } });
    expect(ctx.store.getCard(cmp.cv.id)).toMatchObject({ source: "linkedin", login: null });
    // La carte GitHub de la comparaison entre au top de la semaine.
    expect(ctx.store.getCard(cmp.github.id)).toMatchObject({ source: "github", login: "camille-ardent" });
    expect(weekRank(ctx.store.db, cmp.github.id)).not.toBeNull();
    // « LinkedIn retrouvé » au dossier de l'enquête (§18.26).
    expect(cmp.github.findings?.find((f) => f.source === "linkedin")).toMatchObject({ kind: "linkedin_found", proof: URL_ });
    // L'aperçu de lien dit « LinkedIn », jamais « CV ».
    const page = await (await ctx.app.request(`/c/${json.id}`)).text();
    expect(page).toContain("LinkedIn : Fiche");
    expect(page).toContain("ce que LinkedIn déclare");
    expect(page).not.toMatch(/\bCV\b/);
  });

  it("cache 24 h : le même pseudo rend la comparaison, sans rien relire", async () => {
    const ctx = setup({ forGithub: async () => FOUND });
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
    const ctx = setup({ forGithub: async () => FOUND }, { readCv: async () => Promise.reject(new Error("ia")) });
    const { json } = await post(ctx, { login: "camille-ardent" });
    expect(await state(ctx, json.id)).toMatchObject({ state: "done", kind: "card", card: { source: "github" } });
    expect(ctx.store.getCard(json.id)?.degraded).toBe(true);
    warn.mockRestore();
  });

  it("profil LinkedIn non dev : la comparaison sort quand même (§18.35)", async () => {
    const ctx = setup({ forGithub: async () => FOUND }, { readCv: async () => ({ ...READING, is_dev_profile: false }) });
    const { json } = await post(ctx, { login: "camille-ardent" });
    const done = (await state(ctx, json.id)) as { state: string; kind: string; comparison: ComparisonData };
    expect(done).toMatchObject({ state: "done", kind: "comparison" });
    expect(done.comparison.cv).toMatchObject({ declaredSource: "linkedin" });
    expect(done.comparison.github).toMatchObject({ source: "github", login: "camille-ardent" });
  });

  it("le lien collé par le joueur avec son pseudo est passé au chercheur", async () => {
    const ctx = setup({ forGithub: async () => FOUND });
    await post(ctx, { login: "camille-ardent", linkedin: "fr.linkedin.com/in/Camille-Ardent/?trk=x" });
    expect(ctx.calls.forGithub[0]!.url).toBe(URL_);
  });

});

describe("la vitrine : le serveur se porte garant de son LinkedIn (§18.35)", () => {
  const JACQUES = "https://www.linkedin.com/in/jacquesmougeot";
  const VITRINE = { showcaseLogin: "jmougeot", showcaseLinkedin: JACQUES };
  /** Le chercheur lit l'adresse qu'on lui donne, sans rien prouver : GitHub ne l'affiche pas. */
  const reads: LinkedinFinder["forGithub"] = async (_f, o) => (o?.url ? { profile: { ...PROFILE, url: o.url }, proven: false } : null);
  /** La dernière fiche racine du pseudo. */
  const latest = (ctx: Ctx, login: string) => {
    const r = ctx.store.db.prepare(`SELECT id FROM cards WHERE parent_id IS NULL AND login = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`).get(login) as { id: string } | undefined;
    return r ? ctx.store.getCard(r.id) : null;
  };

  it("la carte vitrine lit ce LinkedIn : comparaison prouvée", async () => {
    const ctx = setup({ forGithub: reads }, {}, VITRINE);
    await ctx.app.request("/api/showcase");
    await ctx.pipeline.drain();
    expect(ctx.calls.forGithub.map((c) => c.url)).toEqual([JACQUES]);
    const row = latest(ctx, "jmougeot");
    expect(row).toMatchObject({ kind: "comparison", source: "linkedin", login: "jmougeot", facts: { linkedinUrl: JACQUES, linkedinProven: true } });
  });

  it("qui tape le pseudo, quelle que soit la casse, lit ce LinkedIn ; le cache 24 h ressert la comparaison", async () => {
    const ctx = setup({ forGithub: reads }, {}, VITRINE);
    const first = await post(ctx, { login: "JMougeot" });
    expect(ctx.calls.forGithub[0]!.url).toBe(JACQUES);
    expect(ctx.store.getCard(first.json.id)).toMatchObject({ kind: "comparison", facts: { linkedinProven: true } });
    expect(await post(ctx, { login: "jmougeot" })).toMatchObject({ status: 200, json: { id: first.json.id, cached: true } });
    expect(ctx.calls.forGithub).toHaveLength(1);
  });

  it("un autre LinkedIn collé avec ce pseudo n'est pas prouvé, ni servi sous le pseudo", async () => {
    const ctx = setup({ forGithub: reads }, {}, VITRINE);
    const forged = await post(ctx, { login: "jmougeot", linkedin: URL_ });
    expect(ctx.calls.forGithub[0]!.url).toBe(URL_);
    expect(ctx.store.getCard(forged.json.id)).toMatchObject({ kind: "comparison", facts: { linkedinUrl: URL_, linkedinProven: false } });
    const typed = await post(ctx, { login: "jmougeot" });
    expect(typed.status).toBe(202);
    expect(ctx.store.getCard(typed.json.id)).toMatchObject({ kind: "comparison", facts: { linkedinUrl: JACQUES, linkedinProven: true } });
    expect(latest(ctx, "jmougeot")?.id).toBe(typed.json.id);
  });

  it("un autre pseudo n'en profite pas", async () => {
    const ctx = setup({ forGithub: reads }, {}, VITRINE);
    const { json } = await post(ctx, { login: "leamd" });
    expect(ctx.calls.forGithub[0]!.url).toBeUndefined();
    expect(await state(ctx, json.id)).toMatchObject({ state: "done", kind: "card" });
    const pasted = await post(ctx, { login: "leamd", linkedin: JACQUES });
    expect(ctx.store.getCard(pasted.json.id)).toMatchObject({ kind: "comparison", facts: { linkedinProven: false } });
  });

  it("entrée LinkedIn par ce lien, sans GitHub dans le profil : la comparaison avec le pseudo de la vitrine, prouvée", async () => {
    const ctx = setup({ forUrl: async (url) => ({ status: "found", profile: { ...PROFILE, url }, githubLogin: null }) }, {}, VITRINE);
    const { json } = await post(ctx, { linkedin: "fr.linkedin.com/in/JacquesMougeot/" });
    expect(ctx.calls.collect).toEqual(["jmougeot"]);
    expect(ctx.store.getCard(json.id)).toMatchObject({ kind: "comparison", login: "jmougeot", facts: { linkedinUrl: JACQUES, linkedinProven: true } });
    expect(await post(ctx, { login: "jmougeot" })).toMatchObject({ status: 200, json: { id: json.id, cached: true } });
  });

  it("entrée LinkedIn par un autre profil qui donne ce GitHub : pas prouvée", async () => {
    const ctx = setup({ forUrl: async () => ({ status: "found", profile: PROFILE, githubLogin: "jmougeot" }) }, {}, VITRINE);
    const { json } = await post(ctx, { linkedin: URL_ });
    expect(ctx.store.getCard(json.id)).toMatchObject({ kind: "comparison", login: "jmougeot", facts: { linkedinProven: false } });
  });

  it("entrée LinkedIn par ce lien, vitrine masquée par son propriétaire : pas de fiche", async () => {
    const ctx = setup({ forUrl: async (url) => ({ status: "found", profile: { ...PROFILE, url }, githubLogin: null }) }, {}, VITRINE);
    ctx.store.claimOwner("jmougeot", 7);
    ctx.store.setOwnerHidden("jmougeot", true);
    const { json } = await post(ctx, { linkedin: JACQUES });
    expect(await state(ctx, json.id)).toMatchObject({ state: "error", code: "gone" });
    expect(ctx.calls.collect).toHaveLength(0);
  });

  type Showcase = { card: CardData | null; href?: string; declared?: { source: string; overall: number } };
  const showcase = async (ctx: Ctx) => (await (await ctx.app.request("/api/showcase")).json()) as Showcase;

  it("l'accueil reçoit la carte GitHub de la comparaison, sa note LinkedIn et le lien vers la comparaison ; l'aperçu de lien suit", async () => {
    const homes: CardData[] = [];
    const ctx = setup(
      { forGithub: reads },
      {
        async renderImage(input) {
          if (input.format === "home") homes.push(input.card!);
          return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
        },
      },
      { ...VITRINE, showcasePhoto: "/jmougeot-linkedin.jpg" },
    );
    expect(await showcase(ctx)).toEqual({ card: null });
    await ctx.pipeline.drain();
    const root = latest(ctx, "jmougeot")!;
    const cmp = root.data as ComparisonData;
    const json = await showcase(ctx);
    expect(json.href).toBe(`/c/${root.id}`);
    expect(json.declared).toEqual({ source: "linkedin", overall: cmp.cv.overall });
    expect(json.card).toMatchObject({ id: cmp.github.id, source: "github", overall: cmp.github.overall, avatarUrl: "/jmougeot-linkedin.jpg", photoSource: "linkedin" });
    expect(json.card?.deleteToken).toBeUndefined();
    // Comparaison sortie : rien n'est relancé avant la semaine.
    await showcase(ctx);
    expect(ctx.calls.collect).toEqual(["jmougeot"]);
    await ctx.app.request("/og/home.png");
    expect(homes.map((c) => c.id)).toEqual([cmp.github.id]);
  });

  it("le LinkedIn n'est pas sorti : la fiche GitHub seule, retentée au bout d'une heure", async () => {
    let up = false;
    const ctx = setup({ forGithub: async (f, o) => (up ? reads(f, o) : null) }, {}, VITRINE);
    await showcase(ctx);
    await ctx.pipeline.drain();
    const alone = await showcase(ctx);
    expect(alone.card).toMatchObject({ source: "github", login: "jmougeot" });
    expect(alone.href).toBe(`/c/${alone.card!.id}`);
    expect(alone.declared).toBeUndefined();
    // Moins d'une heure : on attend.
    await ctx.pipeline.drain();
    expect(ctx.calls.collect).toHaveLength(1);
    ctx.store.db.prepare("UPDATE cards SET created_at = created_at - ?").run(61 * 60 * 1000);
    up = true;
    await showcase(ctx);
    await ctx.pipeline.drain();
    expect(ctx.calls.collect).toHaveLength(2);
    const json = await showcase(ctx);
    expect(json.declared?.source).toBe("linkedin");
    expect(json.href).toBe(`/c/${latest(ctx, "jmougeot")!.id}`);
  });
});

describe("comparaison non prouvée : jamais sous le pseudo d'un tiers", () => {
  /** N'importe quel LinkedIn collé au pseudo d'un autre : le chercheur lit le profil, sans rien prouver. */
  const anyLinkedin = () => setup({ forGithub: async (_f, o) => (o?.url ? { profile: PROFILE, proven: false } : null) });

  it("elle sort et se lit à son adresse, mais qui tape le pseudo reçoit la fiche GitHub", async () => {
    const ctx = anyLinkedin();
    const forged = await post(ctx, { login: "victime", linkedin: URL_ });
    expect(await state(ctx, forged.json.id)).toMatchObject({ state: "done", kind: "comparison" });
    expect(ctx.store.getCard(forged.json.id)).toMatchObject({ login: "victime", facts: { linkedinUrl: URL_, linkedinProven: false } });
    expect((await ctx.app.request(`/c/${forged.json.id}`)).status).toBe(200);

    const typed = await post(ctx, { login: "victime" });
    expect(typed.status).toBe(202);
    expect(typed.json.id).not.toBe(forged.json.id);
    expect(await state(ctx, typed.json.id)).toMatchObject({ state: "done", kind: "card", card: { source: "github", login: "victime" } });
    // Ensuite, c'est la fiche GitHub que le cache du pseudo ressert.
    expect(await post(ctx, { login: "victime" })).toMatchObject({ status: 200, json: { id: typed.json.id, cached: true } });
  });

  it("le cache par adresse LinkedIn la ressert toujours", async () => {
    const ctx = anyLinkedin();
    const forged = await post(ctx, { login: "victime", linkedin: URL_ });
    expect(await post(ctx, { linkedin: URL_ })).toMatchObject({ status: 200, json: { id: forged.json.id, cached: true } });
  });

  it("sa carte GitHub n'entre pas au top de la semaine ; la fiche GitHub du pseudo, si", async () => {
    const ctx = anyLinkedin();
    const forged = await post(ctx, { login: "victime", linkedin: URL_ });
    const cmp = ctx.store.getCard(forged.json.id)!.data as ComparisonData;
    expect(weekRank(ctx.store.db, cmp.github.id)).toBeNull();
    expect(weekTop(ctx.store.db).total).toBe(0);
    const s = await state(ctx, forged.json.id);
    expect(s.state === "done" && s.week).toBeUndefined();

    const typed = await post(ctx, { login: "victime" });
    expect(weekRank(ctx.store.db, typed.json.id)).toMatchObject({ rank: 1, total: 1 });
    expect(weekTop(ctx.store.db).entries.map((e) => e.cardId)).toEqual([typed.json.id]);
    // La carte de la comparaison non prouvée ne prend pas le rang de l'autre.
    expect(weekRank(ctx.store.db, cmp.github.id)).toBeNull();
  });

  it("entrée LinkedIn : le GitHub que le profil donne ne le lui rend pas, la comparaison reste hors du pseudo", async () => {
    const ctx = setup({ forUrl: async () => ({ status: "found", profile: PROFILE, githubLogin: "victime" }) });
    const { json } = await post(ctx, { linkedin: URL_ });
    expect(ctx.store.getCard(json.id)).toMatchObject({ kind: "comparison", login: "victime", facts: { linkedinProven: false } });
    const typed = await post(ctx, { login: "victime" });
    expect(typed.json.id).not.toBe(json.id);
    expect(await state(ctx, typed.json.id)).toMatchObject({ state: "done", kind: "card" });
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
    expect(s).toMatchObject({ state: "done", kind: "card", card: { source: "cv", declaredSource: "linkedin", linkedinUrl: URL_ } });
    expect(ctx.store.getCard(json.id)).toMatchObject({ source: "linkedin", login: null, facts: { linkedinUrl: URL_ } });
    expect(weekRank(ctx.store.db, json.id)).toBeNull();
    expect(ctx.calls.collect).toHaveLength(0);
    expect(s.state === "done" && s.kind === "card" && s.card.findings?.[0]?.text.fr).toBe("LinkedIn retrouvé : « Senior Full-Stack Engineer ».");
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
    const ctx = setup({ forGithub: async (_f, o) => (o?.url === URL_ ? { profile: PROFILE, proven: false } : null) });
    const { json } = await post(ctx, { login: "camille-ardent", linkedin: URL_ });
    expect(await state(ctx, json.id)).toMatchObject({ state: "done", kind: "comparison" });
  });

  it("le GitHub que le profil donne affiche ce LinkedIn en retour : comparaison prouvée, servie aussi sous le pseudo", async () => {
    const ctx = setup({ forUrl: async () => ({ status: "found", profile: PROFILE, githubLogin: "affiche" }) });
    const { json } = await post(ctx, { linkedin: URL_ });
    expect(ctx.store.getCard(json.id)).toMatchObject({ kind: "comparison", login: "affiche", facts: { linkedinUrl: URL_, linkedinProven: true } });
    expect(await post(ctx, { login: "affiche" })).toMatchObject({ status: 200, json: { id: json.id, cached: true } });
    const cmp = ctx.store.getCard(json.id)!.data as ComparisonData;
    expect(weekRank(ctx.store.db, cmp.github.id)?.rank).toBe(1);
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
