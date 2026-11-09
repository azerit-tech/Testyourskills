// Tests de l'API et du pipeline avec des dépendances fausses, base en mémoire.

import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../../shared/fixtures";
import type { CardData, ComparisonData, Fact, JobState, StatCode } from "../../shared/types";
import type { CvReading, CvTextCounts } from "../../shared/readings";
import { createApp, normalizeLogin, purge, type AppOptions } from "./app";
import { RETENTION_MS, Store } from "./db";
import type { CardBody, Deps } from "./pipeline";
import { noteCreditsExhausted, recordUsage, resetBudgetForTests, type AiStatus } from "./ai/budget";
import { ChatHttpError } from "./ai/client";
import { readCode } from "./ai/readCode";
import { fakeClient } from "./ai/testing";

class EngineError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "EngineError";
  }
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

function body(card: CardData): CardBody {
  const { id: _id, createdAt: _c, ...rest } = card;
  return rest;
}

const READING: CvReading = {
  language: "fr",
  position: "FS",
  full_name: "Léa Martin",
  years_declared: 8,
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

const COUNTS: CvTextCounts = { words: 500, pages: 2, buzzwords: { agile: 2, synergie: 1 }, buzzwordsPer100: 0.6, passionCount: 0 };

const PDF = new TextEncoder().encode("%PDF-1.7\nfake pdf body");

function setup(over: Partial<Deps> = {}, appOver: Partial<AppOptions> = {}) {
  const store = new Store(":memory:");
  const ogDir = mkdtempSync(join(tmpdir(), "tys-og-"));
  const calls = { collect: 0, pick: 0, readCode: 0, readCv: 0, render: [] as string[], scoreCvGithub: [] as unknown[] };
  const deps: Deps = {
    async collectGithub(login, { onProgress }) {
      calls.collect++;
      if (login === "ghost") throw new EngineError("unknown_user");
      if (login === "azerit") throw new EngineError("organization");
      if (login === "throttled") throw new EngineError("rate_limited");
      onProgress?.({ key: "lazy_commits", n: 12 });
      onProgress?.({ key: "tests" });
      return { login, readme: 300 };
    },
    async pickFilesForReading() {
      calls.pick++;
      return [{ repo: "r", activity: 1, files: [{ path: "a.ts", content: "x" }] }];
    },
    async readCode() {
      calls.readCode++;
      return { readings: [], ai_status: "ai_typed" };
    },
    aiAvailable: () => true,
    scoreGithub(facts, ai, { lang, judgedInSeconds }) {
      const f = facts as { login: string };
      return { ...body(FIXTURES.gold), login: f.login, lang, judgedInSeconds, scoringVersion: ai ? "ai" : "no-ai" };
    },
    async extractPdfText() {
      return { text: "Développeur passionné, agile. ".repeat(20), pages: 2 };
    },
    cvTextCounts: () => COUNTS,
    async readCv() {
      calls.readCv++;
      return READING;
    },
    scoreCv(_reading, _counts, { lang, judgedInSeconds, github }) {
      calls.scoreCvGithub.push(github);
      return { ...body(FIXTURES.cv), lang, judgedInSeconds };
    },
    compareCards(cv, github) {
      const deltas = Object.fromEntries(
        cv.stats.map((s) => [s.code, github.stats.find((g) => g.code === s.code)!.value - s.value]),
      ) as Record<StatCode, number>;
      return { cv, github, deltas, headline: { fr: "Ton CV a volé 7 points à ton code", en: "Your CV stole 7 points from your code" } };
    },
    async renderImage(input) {
      calls.render.push(input.format + ":" + (input.card ? "card" : "comparison"));
      return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    },
    ...over,
  };
  const { app, pipeline } = createApp({ store, deps, githubToken: "t", baseUrl: "https://skills.test", ogDir, ...appOver });
  stores.push(store);
  return { app, pipeline, store, calls, ogDir };
}

type ApiJson = { id: string; deleteToken?: string; cached?: boolean; state?: string; code?: string; message?: Fact };

const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
});

type Ctx = ReturnType<typeof setup>;

async function postLogin(ctx: Ctx, login: string, headers: Record<string, string> = {}) {
  const res = await ctx.app.request("/api/card", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ login, lang: "fr" }),
  });
  return { res, json: (await res.json()) as ApiJson };
}

async function postCv(ctx: Ctx, file: Uint8Array, login?: string) {
  const form = new FormData();
  form.append("cv", new File([file as BlobPart], "cv.pdf", { type: "application/pdf" }));
  if (login) form.append("login", login);
  form.append("lang", "en");
  const res = await ctx.app.request("/api/card", { method: "POST", body: form });
  return { res, json: (await res.json()) as ApiJson };
}

async function getState(ctx: Ctx, id: string) {
  const res = await ctx.app.request(`/api/card/${id}`);
  return { status: res.status, state: (await res.json()) as JobState };
}

async function generate(ctx: Ctx, login = "leamd") {
  const { json } = await postLogin(ctx, login);
  await ctx.pipeline.wait(json.id);
  return json as { id: string; deleteToken: string };
}

describe("création d'une carte GitHub", () => {
  it("passe de pending à done, sans jamais exposer le jeton", async () => {
    const gate = deferred();
    const ctx = setup({
      async collectGithub(login, { onProgress }) {
        onProgress?.({ key: "lazy_commits", n: 12 });
        await gate.promise;
        return { login };
      },
    });
    const { res, json } = await postLogin(ctx, "https://github.com/LeaMD/");
    expect(res.status).toBe(202);
    expect(json.id).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(json.deleteToken).toBeTruthy();

    const pending = await getState(ctx, json.id);
    expect(pending.state.state).toBe("pending");
    if (pending.state.state === "pending") {
      expect(pending.state.progress[0]).toMatchObject({ key: "lazy_commits", n: 12 });
      expect(typeof pending.state.progress[0]!.at).toBe("number");
    }

    gate.resolve();
    await ctx.pipeline.wait(json.id);
    const done = await getState(ctx, json.id);
    expect(done.status).toBe(200);
    expect(done.state).toMatchObject({ state: "done", kind: "card" });
    if (done.state.state === "done" && done.state.kind === "card") {
      expect(done.state.card.id).toBe(json.id);
      expect(done.state.card.login).toBe("LeaMD");
      expect(done.state.card.judgedInSeconds).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(done.state)).not.toContain(json.deleteToken!);
      expect(done.state.card.deleteToken).toBeUndefined();
    }
    expect(ctx.store.listEvents("card_generated")).toHaveLength(1);
  });

  it("lit le code quand l'IA est disponible, et s'en passe sinon", async () => {
    const a = setup();
    const { id } = await generate(a);
    expect(a.calls.readCode).toBe(1);
    expect((a.store.getCard(id)!.data as CardData).scoringVersion).toBe("ai");

    const b = setup({ aiAvailable: () => false });
    const r = await generate(b);
    expect(b.calls.readCode).toBe(0);
    expect((b.store.getCard(r.id)!.data as CardData).scoringVersion).toBe("no-ai");
  });

  it("rend une carte quand la lecture IA échoue", async () => {
    const ctx = setup({
      async readCode() {
        throw new Error("schéma invalide");
      },
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { id } = await generate(ctx);
    const s = await getState(ctx, id);
    expect(s.state).toMatchObject({ state: "done", kind: "card" });
    vi.restoreAllMocks();
  });

  it("refuse un pseudo invalide", async () => {
    const ctx = setup();
    const { res } = await postLogin(ctx, "pas un pseudo !");
    expect(res.status).toBe(400);
  });
});

describe("erreurs du moteur", () => {
  it.each([
    ["ghost", "unknown_user", "Ce pseudo n'existe pas sur GitHub"],
    ["azerit", "organization", "C'est une organisation, pas une personne"],
    ["throttled", "rate_limited", "GitHub nous demande de ralentir"],
  ])("%s → %s", async (login, code, fr) => {
    const ctx = setup();
    const { json } = await postLogin(ctx, login);
    await ctx.pipeline.wait(json.id);
    const s = await getState(ctx, json.id);
    expect(s.state).toMatchObject({ state: "error", code });
    if (s.state.state === "error") {
      expect(s.state.message.fr).toContain(fr);
      expect(s.state.message.en.length).toBeGreaterThan(5);
    }
    expect(ctx.store.getCard(json.id)).toBeNull();
  });

  it("erreur inattendue → internal", async () => {
    const ctx = setup({
      scoreGithub() {
        throw new TypeError("boom");
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { json } = await postLogin(ctx, "leamd");
    await ctx.pipeline.wait(json.id);
    expect((await getState(ctx, json.id)).state).toMatchObject({ state: "error", code: "internal" });
    vi.restoreAllMocks();
  });
});

describe("timeout de 30 s", () => {
  it("coupe un module qui écoute le signal", async () => {
    let aborted = false;
    const ctx = setup(
      {
        collectGithub: (_l, { signal }) =>
          new Promise((_, reject) =>
            signal?.addEventListener("abort", () => {
              aborted = true;
              reject(new Error("aborted"));
            }),
          ),
      },
      { timeoutMs: 40 },
    );
    const { json } = await postLogin(ctx, "slow");
    await ctx.pipeline.wait(json.id);
    const s = await getState(ctx, json.id);
    expect(s.state).toMatchObject({ state: "error", code: "timeout" });
    expect(aborted).toBe(true);
    expect(ctx.store.getCard(json.id)).toBeNull();
  });

  it("coupe aussi un module qui ignore le signal, sans carte vide", async () => {
    const ctx = setup({ collectGithub: () => new Promise((r) => setTimeout(() => r({ login: "x" }), 200)) }, { timeoutMs: 40 });
    const { json } = await postLogin(ctx, "slow");
    await ctx.pipeline.wait(json.id);
    expect((await getState(ctx, json.id)).state).toMatchObject({ state: "error", code: "timeout" });
    await new Promise((r) => setTimeout(r, 250));
    expect(ctx.store.getCard(json.id)).toBeNull();
    expect(ctx.store.listEvents("card_generated")).toHaveLength(0);
  });
});

describe("cache 24 h et déduplication", () => {
  it("renvoie la carte existante sans refaire d'appels", async () => {
    const ctx = setup();
    const first = await generate(ctx, "leamd");
    const again = await postLogin(ctx, "LEAMD");
    expect(again.res.status).toBe(200);
    expect(again.json).toMatchObject({ id: first.id, cached: true });
    expect(again.json.deleteToken).toBeUndefined();
    expect(ctx.calls.collect).toBe(1);
  });

  it("refait la carte après 24 h", async () => {
    const ctx = setup();
    const first = await generate(ctx, "leamd");
    ctx.store.db.prepare("UPDATE cards SET created_at = created_at - ?").run(25 * 3600 * 1000);
    const again = await postLogin(ctx, "leamd");
    expect(again.res.status).toBe(202);
    expect(again.json.id).not.toBe(first.id);
  });

  it("déduplique les jobs en cours", async () => {
    const gate = deferred();
    const ctx = setup({
      async collectGithub(login) {
        await gate.promise;
        return { login };
      },
    });
    const a = await postLogin(ctx, "leamd");
    const b = await postLogin(ctx, "leamd");
    expect(b.json).toMatchObject({ id: a.json.id, cached: true });
    gate.resolve();
    await ctx.pipeline.wait(a.json.id);
  });
});

describe("carte vitrine de l'accueil (§6.1)", () => {
  it("lance la carte du pseudo vitrine au premier appel, puis la renvoie sans jeton", async () => {
    const ctx = setup({}, { showcaseLogin: "jmougeot" });
    const first = await ctx.app.request("/api/showcase");
    expect(await first.json()).toEqual({ card: null });
    await ctx.pipeline.drain();
    const res = await ctx.app.request("/api/showcase");
    const json = (await res.json()) as { card: CardData | null };
    expect(json.card?.login).toBe("jmougeot");
    expect(json.card?.deleteToken).toBeUndefined();
    expect(ctx.calls.collect).toBe(1);
    await ctx.app.request("/api/showcase");
    expect(ctx.calls.collect).toBe(1);
  });

  it("ne fait rien sans pseudo vitrine", async () => {
    const ctx = setup();
    const res = await ctx.app.request("/api/showcase");
    expect(await res.json()).toEqual({ card: null });
    expect(ctx.calls.collect).toBe(0);
  });

  it("remplace l'avatar GitHub par la photo vitrine", async () => {
    const ctx = setup({}, { showcaseLogin: "jmougeot", showcasePhoto: "/jmougeot-linkedin.jpg" });
    await ctx.app.request("/api/showcase");
    await ctx.pipeline.drain();
    const json = (await (await ctx.app.request("/api/showcase")).json()) as { card: CardData | null };
    expect(json.card).toMatchObject({ avatarUrl: "/jmougeot-linkedin.jpg", photoSource: "linkedin" });
  });
});

describe("limite de 20 cartes par IP et par jour", () => {
  it("répond 429 avec un message fr/en au-delà", async () => {
    const ctx = setup({}, { cardsPerDay: 2 });
    const ip = { "x-forwarded-for": "203.0.113.9" };
    expect((await postLogin(ctx, "a1", ip)).res.status).toBe(202);
    expect((await postLogin(ctx, "a2", ip)).res.status).toBe(202);
    const third = await postLogin(ctx, "a3", ip);
    expect(third.res.status).toBe(429);
    expect(third.json).toMatchObject({ state: "error", code: "rate_limited" });
    expect(third.json.message?.fr).toContain("20 cartes par jour");
    // Une autre IP n'est pas concernée, la dernière entrée de X-Forwarded-For fait foi.
    expect((await postLogin(ctx, "a3", { "x-forwarded-for": "203.0.113.9, 198.51.100.1" })).res.status).toBe(202);
    await ctx.pipeline.drain();
  });

  it("ne compte pas les cartes servies depuis le cache", async () => {
    const ctx = setup({}, { cardsPerDay: 1 });
    await generate(ctx, "leamd");
    expect((await postLogin(ctx, "leamd")).res.status).toBe(200);
    expect((await postLogin(ctx, "leamd")).res.status).toBe(200);
  });

  it("ne stocke pas l'IP en clair", async () => {
    const ctx = setup();
    await postLogin(ctx, "leamd", { "x-forwarded-for": "203.0.113.9" });
    const keys = ctx.store.db.prepare("SELECT key FROM ratelimit").all() as { key: string }[];
    expect(keys.some((k) => k.key.includes("203.0.113.9"))).toBe(false);
    await ctx.pipeline.drain();
  });
});

describe("CV et comparaison", () => {
  it("carte CV seule, texte jamais stocké", async () => {
    const ctx = setup();
    const { res, json } = await postCv(ctx, PDF.slice());
    expect(res.status).toBe(202);
    await ctx.pipeline.wait(json.id);
    const s = await getState(ctx, json.id);
    expect(s.state).toMatchObject({ state: "done", kind: "card", card: { id: json.id, source: "cv", lang: "en" } });
    const raw = ctx.store.db.prepare("SELECT * FROM cards").all();
    expect(JSON.stringify(raw)).not.toContain("passionné, agile");
  });

  it("publie la progression des buzzwords", async () => {
    const gate = deferred();
    const ctx = setup({
      async readCv() {
        await gate.promise;
        return READING;
      },
    });
    const { json } = await postCv(ctx, PDF.slice());
    await new Promise((r) => setTimeout(r, 10));
    const s = await getState(ctx, json.id);
    expect(s.state.state === "pending" && s.state.progress.find((p) => p.key === "buzzwords")?.n).toBe(3);
    gate.resolve();
    await ctx.pipeline.wait(json.id);
  });

  it("refuse un fichier qui n'est pas un PDF, ou trop lourd", async () => {
    const ctx = setup();
    const notPdf = await postCv(ctx, new TextEncoder().encode("hello"));
    expect(notPdf.res.status).toBe(400);
    expect(notPdf.json).toMatchObject({ code: "not_a_pdf" });

    const big = new Uint8Array(5 * 1024 * 1024 + 10);
    big.set(PDF);
    const tooBig = await postCv(ctx, big);
    expect(tooBig.res.status).toBe(413);
    expect(tooBig.json).toMatchObject({ code: "pdf_too_large" });
  });

  it("plus de 10 pages → pdf_too_large ; PDF sans texte → not_a_pdf", async () => {
    const a = setup({ extractPdfText: async () => ({ text: "x", pages: 14 }) });
    const ja = (await postCv(a, PDF.slice())).json;
    await a.pipeline.wait(ja.id);
    expect((await getState(a, ja.id)).state).toMatchObject({ state: "error", code: "pdf_too_large" });

    const b = setup({ extractPdfText: async () => ({ text: "  ", pages: 1 }) });
    const jb = (await postCv(b, PDF.slice())).json;
    await b.pipeline.wait(jb.id);
    const sb = (await getState(b, jb.id)).state;
    expect(sb).toMatchObject({ state: "error", code: "not_a_pdf" });
    if (sb.state === "error") expect(sb.message.fr).toContain("scan");
  });

  it("CvError de l'extracteur → code correspondant", async () => {
    const ctx = setup({
      async extractPdfText() {
        throw Object.assign(new Error("bad"), { code: "not_a_pdf" });
      },
    });
    const { json } = await postCv(ctx, PDF.slice());
    await ctx.pipeline.wait(json.id);
    expect((await getState(ctx, json.id)).state).toMatchObject({ state: "error", code: "not_a_pdf" });
  });

  it("login + CV → comparaison, trois ids, facts GitHub passés à scoreCv", async () => {
    const ctx = setup();
    const { json } = await postCv(ctx, PDF.slice(), "leamd");
    await ctx.pipeline.wait(json.id);
    const s = await getState(ctx, json.id);
    expect(s.state).toMatchObject({ state: "done", kind: "comparison" });
    if (s.state.state !== "done" || s.state.kind !== "comparison") throw new Error("pas une comparaison");
    const cmp = s.state.comparison;
    expect(cmp.id).toBe(json.id);
    expect(new Set([cmp.id, cmp.cv.id, cmp.github.id]).size).toBe(3);
    expect(ctx.calls.scoreCvGithub[0]).toMatchObject({ login: "leamd" });
    // Chaque carte de la comparaison a sa propre URL.
    expect((await getState(ctx, cmp.cv.id)).state).toMatchObject({ state: "done", kind: "card", card: { source: "cv" } });
    expect((await getState(ctx, cmp.github.id)).state).toMatchObject({ state: "done", kind: "card", card: { source: "github" } });
    expect(ctx.store.listEvents("card_generated")).toHaveLength(1);
  });

  it("comparaison sur un pseudo en cache : pas de nouvel appel GitHub", async () => {
    const ctx = setup();
    await generate(ctx, "leamd");
    const { json } = await postCv(ctx, PDF.slice(), "leamd");
    await ctx.pipeline.wait(json.id);
    expect(ctx.calls.collect).toBe(1);
    expect((await getState(ctx, json.id)).state).toMatchObject({ state: "done", kind: "comparison" });
  });

  it("profil non dev → carte CV seule", async () => {
    const ctx = setup({ readCv: async () => ({ ...READING, is_dev_profile: false, position: "PM" }) });
    const { json } = await postCv(ctx, PDF.slice(), "leamd");
    await ctx.pipeline.wait(json.id);
    expect((await getState(ctx, json.id)).state).toMatchObject({ state: "done", kind: "card", card: { source: "cv" } });
  });

  it("CV illisible : carte GitHub si un pseudo est donné, sinon erreur honnête", async () => {
    const a = setup({ readCv: async () => null });
    const ja = (await postCv(a, PDF.slice(), "leamd")).json;
    await a.pipeline.wait(ja.id);
    expect((await getState(a, ja.id)).state).toMatchObject({ state: "done", kind: "card", card: { source: "github" } });

    const b = setup({ readCv: async () => null });
    const jb = (await postCv(b, PDF.slice())).json;
    await b.pipeline.wait(jb.id);
    expect((await getState(b, jb.id)).state).toMatchObject({ state: "error", code: "internal" });
  });
});

describe("commissariat fermé (plafond IA ou crédit épuisé)", () => {
  /** Erreur telle que la lève ai/client.ts (AiClosedError), reconnue à son code. */
  const closed = (reason: "budget" | "credits") => Object.assign(new Error(reason), { code: "closed", reason });
  const CLOSED_FR = "Le commissariat est fermé pour ce soir. Reviens demain.";
  const CLOSED_EN = "The station is closed for tonight. Come back tomorrow.";

  it("un 402 sur la lecture du code fait échouer la fiche en closed, sans fiche dégradée", async () => {
    // Vrai readCode, faux client OpenRouter qui répond 402.
    const { client, calls: aiCalls } = fakeClient([{ error: new ChatHttpError(402, "Insufficient credits") }]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = setup({ readCode: (repos, opts) => readCode(repos, { ...opts, client }) });
    const { res, json } = await postLogin(ctx, "leamd");
    expect(res.status).toBe(202);
    await ctx.pipeline.wait(json.id);
    const s = await getState(ctx, json.id);
    expect(s.status).toBe(200);
    expect(s.state).toEqual({ state: "error", code: "closed", message: { fr: CLOSED_FR, en: CLOSED_EN } });
    expect(aiCalls).toHaveLength(1);
    expect(ctx.store.getCard(json.id)).toBeNull();
    vi.restoreAllMocks();
  });

  it("ne met pas en cache une fiche closed : le même pseudo repasse dès que le crédit revient", async () => {
    let credit = false;
    const ctx = setup({
      async readCode() {
        if (!credit) throw closed("credits");
        return { readings: [], ai_status: "ai_typed" };
      },
    });
    const first = await generate(ctx, "leamd");
    expect((await getState(ctx, first.id)).state).toMatchObject({ state: "error", code: "closed" });
    expect(ctx.store.findRecentGithub("leamd")).toBeNull();
    expect(ctx.pipeline.inflightFor("leamd")).toBeUndefined();

    credit = true;
    const again = await postLogin(ctx, "leamd");
    expect(again.res.status).toBe(202);
    expect(again.json.cached).toBe(false);
    expect(again.json.id).not.toBe(first.id);
    await ctx.pipeline.wait(again.json.id);
    const done = await getState(ctx, again.json.id);
    expect(done.state).toMatchObject({ state: "done", kind: "card", card: { scoringVersion: "ai" } });
  });

  it("CV seul ou comparaison : closed aussi, jamais une carte sans lecture", async () => {
    const a = setup({ readCv: async () => Promise.reject(closed("credits")) });
    const ja = (await postCv(a, PDF.slice())).json;
    await a.pipeline.wait(ja.id);
    expect((await getState(a, ja.id)).state).toMatchObject({ state: "error", code: "closed" });

    // Comparaison : le CV fermé ne doit pas laisser sortir la carte GitHub seule.
    const b = setup({ readCv: async () => Promise.reject(closed("credits")) });
    const jb = (await postCv(b, PDF.slice(), "leamd")).json;
    await b.pipeline.wait(jb.id);
    expect((await getState(b, jb.id)).state).toMatchObject({ state: "error", code: "closed" });
    expect(b.store.getCard(jb.id)).toBeNull();
  });

  it("plafond du jour atteint : 503 closed tout de suite, sans job ni quota, le cache reste servi", async () => {
    let status: AiStatus = "ok";
    // Quota de 2 : la première carte en prend un, le refus closed ne doit pas prendre le second.
    const ctx = setup({}, { aiStatus: () => status, cardsPerDay: 2 });
    const cachedCard = await generate(ctx, "leamd");

    status = "budget";
    const { res, json } = await postLogin(ctx, "other");
    expect(res.status).toBe(503);
    expect(json).toMatchObject({ state: "error", code: "closed", message: { fr: CLOSED_FR, en: CLOSED_EN } });
    expect(ctx.calls.collect).toBe(1);
    // Une fiche de moins de 24 h n'a pas besoin de l'IA.
    expect((await postLogin(ctx, "leamd")).json).toMatchObject({ id: cachedCard.id, cached: true });

    // Le refus n'a pas entamé le quota : le lendemain (plafond levé), la carte passe.
    status = "ok";
    expect((await postLogin(ctx, "other")).res.status).toBe(202);
    await ctx.pipeline.drain();
  });

  it("un 402 vu ne bloque pas les demandes suivantes", async () => {
    const ctx = setup({}, { aiStatus: () => "credits" });
    const { res } = await postLogin(ctx, "leamd");
    expect(res.status).toBe(202);
    await ctx.pipeline.drain();
  });
});

describe("suppression", () => {
  it("refuse un mauvais jeton, accepte le bon et efface les images", async () => {
    const ctx = setup();
    const { id, deleteToken } = await generate(ctx);
    await ctx.app.request(`/og/${id}.png`);
    expect(existsSync(join(ctx.ogDir, `${id}.png`))).toBe(true);

    expect((await ctx.app.request(`/api/card/${id}?token=nope`, { method: "DELETE" })).status).toBe(403);
    expect((await ctx.app.request(`/api/card/${id}`, { method: "DELETE" })).status).toBe(403);
    expect(ctx.store.getCard(id)).not.toBeNull();

    const ok = await ctx.app.request(`/api/card/${id}?token=${deleteToken}`, { method: "DELETE" });
    expect(ok.status).toBe(200);
    expect(ctx.store.getCard(id)).toBeNull();
    expect(existsSync(join(ctx.ogDir, `${id}.png`))).toBe(false);
    expect((await getState(ctx, id)).status).toBe(404);
  });

  it("lien GET depuis un email, et suppression d'une comparaison entière", async () => {
    const ctx = setup();
    const { json } = await postCv(ctx, PDF.slice(), "leamd");
    await ctx.pipeline.wait(json.id);
    const cmp = ctx.store.getCard(json.id)!.data as ComparisonData;

    const bad = await ctx.app.request(`/api/card/${json.id}/delete?token=x`);
    expect(bad.status).toBe(403);
    const ok = await ctx.app.request(`/api/card/${cmp.cv.id}/delete?token=${json.deleteToken}`);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain("supprimée");
    for (const id of [cmp.id, cmp.cv.id, cmp.github.id]) expect(ctx.store.getCard(id)).toBeNull();
  });
});

describe("page /c/:id et images", () => {
  it("contient les balises Open Graph et Twitter sans JS", async () => {
    const ctx = setup();
    const { id } = await generate(ctx);
    const res = await ctx.app.request(`/c/${id}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    const overall = FIXTURES.gold.overall;
    expect(html).toContain(`<meta property="og:title" content="Fiche ★★★★, ${overall} — Léa Martin-Dubois">`);
    expect(html).toContain(`<meta property="og:image" content="https://skills.test/og/${id}.png">`);
    expect(html).toContain(`<meta property="og:url" content="https://skills.test/c/${id}">`);
    expect(html).toContain(`<meta property="og:image:width" content="1200">`);
    expect(html).toContain(`<meta name="twitter:card" content="summary_large_image">`);
    expect(html).toMatch(/og:description" content="Chef d&#39;accusation : « Typé jusqu&#39;au bout »\. Interrogé par une IA en \d+ s\./);
  });

  it("injecte les balises dans le index.html du front", async () => {
    const template = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Testyourskills</title><meta property="og:title" content="générique"></head><body><div id="root"></div><script type="module" src="/assets/index.js"></script></body></html>`;
    const ctx = setup({}, { indexHtml: async () => template });
    const { id } = await generate(ctx);
    const html = await (await ctx.app.request(`/c/${id}`)).text();
    expect(html).toContain('<script type="module" src="/assets/index.js">');
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html).not.toContain("générique");
    expect(html).toContain('<html lang="fr"');
  });

  it("comparaison : titre et image de la comparaison", async () => {
    const ctx = setup();
    const { json } = await postCv(ctx, PDF.slice(), "leamd");
    await ctx.pipeline.wait(json.id);
    const html = await (await ctx.app.request(`/c/${json.id}`)).text();
    // Demandée en anglais (postCv envoie lang=en).
    expect(html).toContain("Your CV stole 7 points from your code — Léa Martin-Dubois");
    expect(html).toContain('<meta property="og:locale" content="en_US">');
    expect(html).toContain(`/og/${json.id}.png`);
    const png = await ctx.app.request(`/og/${json.id}-portrait.png`);
    expect(png.status).toBe(200);
    expect(ctx.calls.render).toEqual(["portrait:comparison"]);
  });

  it("carte inconnue : 404 avec balises génériques", async () => {
    const ctx = setup();
    const res = await ctx.app.request(`/c/AAAAAAAAAA`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("og:title");
  });

  it("rend le PNG une fois puis le sert depuis le disque", async () => {
    const ctx = setup();
    const { id } = await generate(ctx);
    const a = await ctx.app.request(`/og/${id}.png`);
    expect(a.status).toBe(200);
    expect(a.headers.get("content-type")).toBe("image/png");
    expect(a.headers.get("cache-control")).toContain("max-age=31536000");
    const b = await ctx.app.request(`/og/${id}.png`);
    expect(new Uint8Array(await b.arrayBuffer())[0]).toBe(0x89);
    await ctx.app.request(`/og/${id}-portrait.png`);
    await ctx.app.request(`/og/${id}-card.png`);
    expect(ctx.calls.render).toEqual(["og:card", "portrait:card", "card:card"]);
    expect((await ctx.app.request(`/og/AAAAAAAAAA.png`)).status).toBe(404);
    expect((await ctx.app.request(`/og/${id}.jpg`)).status).toBe(404);
  });
});

describe("email et événements", () => {
  it("stocke l'email, lève l'expiration et relaie au format de la landing", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const ctx = setup({}, { leadsEndpoint: "https://leads.test/hook", fetchImpl: fetchImpl as unknown as typeof fetch });
    const { id } = await generate(ctx);
    const res = await ctx.app.request("/api/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId: id, email: "lea@example.com" }),
    });
    expect(res.status).toBe(200);
    const row = ctx.store.getCard(id)!;
    expect(row.email).toBe("lea@example.com");
    expect(row.expiresAt).toBeNull();
    expect(ctx.store.listEvents("card_email")).toHaveLength(1);
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://leads.test/hook");
    const lead = JSON.parse(String(init.body));
    expect(lead).toMatchObject({ email: "lea@example.com", role: "", event: "card_email", cardId: id, cardUrl: `https://skills.test/c/${id}` });
    expect(lead.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(lead.createdAt).toString()).not.toBe("Invalid Date");
  });

  it("refuse un email invalide ou une carte inconnue", async () => {
    const ctx = setup();
    const { id } = await generate(ctx);
    const post = (b: unknown) =>
      ctx.app.request("/api/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
    expect((await post({ cardId: id, email: "pas-un-email" })).status).toBe(400);
    expect((await post({ cardId: "AAAAAAAAAA", email: "a@b.co" })).status).toBe(404);
  });

  it("enregistre les événements du front, ignore card_generated", async () => {
    const ctx = setup();
    const post = (b: unknown) =>
      ctx.app.request("/api/event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
    expect((await post({ event: "card_shared", cardId: "AbCdEf1234", meta: { network: "linkedin" } })).status).toBe(202);
    expect((await post({ event: "cta_azerit_clicked" })).status).toBe(202);
    expect((await post({ event: "card_generated" })).status).toBe(202);
    expect((await post({ event: "pageview" })).status).toBe(400);
    const events = ctx.store.listEvents();
    expect(events.map((e) => e.event)).toEqual(["card_shared", "cta_azerit_clicked"]);
    expect(events[0]).toMatchObject({ cardId: "AbCdEf1234", meta: { network: "linkedin" } });
  });
});

describe("purge 90 jours", () => {
  it("supprime les cartes expirées sans email et leurs PNG, garde celles avec email", async () => {
    const ctx = setup();
    const old = await generate(ctx, "old");
    const kept = await generate(ctx, "kept");
    await ctx.app.request(`/og/${old.id}.png`);
    ctx.store.setEmail(kept.id, "k@example.com");
    const later = Date.now() + RETENTION_MS + 1000;
    expect(await purge(ctx.store, ctx.ogDir, later)).toBe(1);
    expect(ctx.store.getCard(old.id)).toBeNull();
    expect(ctx.store.getCard(kept.id)).not.toBeNull();
    expect(existsSync(join(ctx.ogDir, `${old.id}.png`))).toBe(false);
  });
});

describe("divers", () => {
  it("normalise les pseudos", () => {
    expect(normalizeLogin(" @lea ")).toBe("lea");
    expect(normalizeLogin("https://github.com/Lea-MD/")).toBe("Lea-MD");
    expect(normalizeLogin("github.com/lea/repo?tab=1")).toBe("lea");
  });

  it("health", async () => {
    const ctx = setup({}, { aiStatus: () => "ok" });
    expect(await (await ctx.app.request("/api/health")).json()).toEqual({ ok: true, ai: "ok", github: true, linkedin: false });
  });

  it.each<AiStatus>(["ok", "budget", "credits", "off"])("health : ai = %s, sans montant", async (status) => {
    const ctx = setup({}, { aiStatus: () => status });
    const res = await ctx.app.request("/api/health");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ ok: true, ai: status });
    expect(text).not.toMatch(/usd|\$|cost|credit_|total/i);
  });

  it("health suit le vrai budget : plafond du jour, puis 402 vu", async () => {
    const saved = { key: process.env.OPENROUTER_API_KEY, budget: process.env.AI_DAILY_BUDGET_USD };
    resetBudgetForTests();
    process.env.OPENROUTER_API_KEY = "test";
    process.env.AI_DAILY_BUDGET_USD = "0.01";
    try {
      const ctx = setup();
      const ai = async () => ((await (await ctx.app.request("/api/health")).json()) as { ai: string }).ai;
      expect(await ai()).toBe("ok");
      recordUsage("anthropic/claude-haiku-4.5", { prompt_tokens: 0, completion_tokens: 0, cost: 0.02 });
      expect(await ai()).toBe("budget");
      noteCreditsExhausted();
      expect(await ai()).toBe("credits");
      noteCreditsExhausted(Date.now() - 11 * 60 * 1000);
      expect(await ai()).toBe("budget");
      delete process.env.OPENROUTER_API_KEY;
      expect(await ai()).toBe("off");
    } finally {
      resetBudgetForTests();
      if (saved.key === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = saved.key;
      if (saved.budget === undefined) delete process.env.AI_DAILY_BUDGET_USD;
      else process.env.AI_DAILY_BUDGET_USD = saved.budget;
    }
  });

  it("prod : sert le front statique avec repli SPA hors /api, /og, /c", async () => {
    const root = mkdtempSync(join(tmpdir(), "tys-web-"));
    mkdirSync(join(root, "assets"));
    const index = "<!doctype html><html><head><title>T</title></head><body>SPA</body></html>";
    writeFileSync(join(root, "index.html"), index);
    writeFileSync(join(root, "assets", "app.js"), "console.log(1)");
    const ctx = setup({}, { staticRoot: root, indexHtml: async () => index });
    const js = await ctx.app.request("/assets/app.js");
    expect(js.status).toBe(200);
    expect(js.headers.get("cache-control")).toContain("immutable");
    const spa = await ctx.app.request("/privacy");
    expect(await spa.text()).toContain("SPA");
    expect((await ctx.app.request("/api/nope")).status).toBe(404);
    expect((await ctx.app.request("/og/nope")).status).toBe(404);
  });
});
