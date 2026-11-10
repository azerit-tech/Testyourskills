// Origine des fiches (§18.0) : liens partagés ?r=, ref sur POST /api/card,
// migration de la colonne ref_card_id. Mêmes doubles que app.test.ts, base en mémoire.

import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURES } from "../../shared/fixtures";
import type { CardData, StatCode } from "../../shared/types";
import type { CvReading } from "../../shared/readings";
import { createApp } from "./app";
import { Store } from "./db";
import type { CardBody, Deps } from "./pipeline";

function body(card: CardData): CardBody {
  const { id: _id, createdAt: _c, ...rest } = card;
  return rest;
}

const READING = {
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
} satisfies CvReading;

const PDF = new TextEncoder().encode("%PDF-1.7\nfake pdf body");

const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
});

function setup() {
  const store = new Store(":memory:");
  stores.push(store);
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
      return { text: "Développeur passionné. ".repeat(20), pages: 2 };
    },
    cvTextCounts: () => ({ words: 500, pages: 2, buzzwords: {}, buzzwordsPer100: 0, passionCount: 0 }),
    async readCv() {
      return READING;
    },
    scoreCv(_r, _c, { lang, judgedInSeconds }) {
      return { ...body(FIXTURES.cv), lang, judgedInSeconds };
    },
    compareCards(cv, github) {
      const deltas = Object.fromEntries(cv.stats.map((s) => [s.code, 0])) as Record<StatCode, number>;
      return { cv, github, deltas, headline: { fr: "Ton CV a volé 7 points à ton code", en: "Your CV stole 7 points from your code" } };
    },
    async renderImage() {
      return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    },
  };
  const ogDir = mkdtempSync(join(tmpdir(), "tys-og-"));
  const { app, pipeline } = createApp({ store, deps, githubToken: "t", baseUrl: "https://skills.test", ogDir });
  return { app, pipeline, store };
}

type Ctx = ReturnType<typeof setup>;

async function postLogin(ctx: Ctx, login: string, ref?: unknown) {
  const res = await ctx.app.request("/api/card", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login, lang: "fr", ref }),
  });
  const json = (await res.json()) as { id: string; cached?: boolean };
  await ctx.pipeline.wait(json.id);
  return { status: res.status, id: json.id, cached: json.cached };
}

describe("page /c/:id avec ?r=", () => {
  it("sert exactement la même page et les mêmes balises, og:url et canonical sans r", async () => {
    const ctx = setup();
    const { id } = await postLogin(ctx, "leamd");
    const plain = await ctx.app.request(`/c/${id}`);
    const withRef = await ctx.app.request(`/c/${id}?r=${id}`);
    expect(withRef.status).toBe(200);
    const html = await withRef.text();
    expect(html).toBe(await plain.text());
    expect(html).toContain(`<meta property="og:url" content="https://skills.test/c/${id}">`);
    expect(html).toContain(`<link rel="canonical" href="https://skills.test/c/${id}">`);
    expect(html).toContain(`<meta property="og:image" content="https://skills.test/og/${id}.png?v=2">`);
    expect(html).not.toContain("?r=");
    expect(withRef.headers.get("cache-control")).toBe(plain.headers.get("cache-control"));
  });

  it("carte inconnue : même 404 générique, sans r dans les balises", async () => {
    const ctx = setup();
    const plain = await ctx.app.request(`/c/AAAAAAAAAA`);
    const withRef = await ctx.app.request(`/c/AAAAAAAAAA?r=BBBBBBBBBB`);
    expect(withRef.status).toBe(404);
    const html = await withRef.text();
    expect(html).toBe(await plain.text());
    expect(html).not.toContain("BBBBBBBBBB");
  });
});

describe("POST /api/card avec ref", () => {
  it("retient une ref qui désigne une fiche existante", async () => {
    const ctx = setup();
    const origin = await postLogin(ctx, "leamd");
    const child = await postLogin(ctx, "tomdev", origin.id);
    expect(child.status).toBe(202);
    expect(ctx.store.getCard(child.id)!.refCardId).toBe(origin.id);
    expect(ctx.store.getCard(origin.id)!.refCardId).toBeNull();
  });

  it("ignore en silence une ref invalide ou inconnue, sans jamais d'erreur", async () => {
    const ctx = setup();
    for (const [login, ref] of [
      ["a1", "pas un id!"],
      ["a2", 1234567890],
      ["a3", { id: "x" }],
      ["a4", "ZZZZZZZZZZ"], // bon format, aucune fiche
      ["a5", ""],
    ] as const) {
      const r = await postLogin(ctx, login, ref);
      expect(r.status).toBe(202);
      expect(ctx.store.getCard(r.id)!.refCardId).toBeNull();
    }
  });

  it("une fiche servie depuis le cache 24 h garde son origine d'avant", async () => {
    const ctx = setup();
    const origin = await postLogin(ctx, "leamd");
    const first = await postLogin(ctx, "tomdev");
    const again = await postLogin(ctx, "tomdev", origin.id);
    expect(again.cached).toBe(true);
    expect(again.id).toBe(first.id);
    expect(ctx.store.getCard(first.id)!.refCardId).toBeNull();
  });

  it("même login que la fiche d'origine : la ref est stockée quand même", async () => {
    const ctx = setup();
    const origin = await postLogin(ctx, "leamd");
    const res = await ctx.app.request("/api/card", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login: "leamd", ref: origin.id }),
    });
    // Le pseudo est en cache : pas de nouvelle fiche, rien à enregistrer.
    expect(((await res.json()) as { cached: boolean }).cached).toBe(true);
    // Une comparaison CV + GitHub sur le même pseudo crée bien une fiche : sa ref est gardée.
    const form = new FormData();
    form.append("cv", new File([PDF as BlobPart], "cv.pdf", { type: "application/pdf" }));
    form.append("login", "leamd");
    form.append("ref", origin.id);
    const cmpRes = await ctx.app.request("/api/card", { method: "POST", body: form });
    const { id } = (await cmpRes.json()) as { id: string };
    await ctx.pipeline.wait(id);
    const row = ctx.store.getCard(id)!;
    expect(row.kind).toBe("comparison");
    expect(row.refCardId).toBe(origin.id);
  });

  it("comparaison : la ref va sur la fiche racine, pas sur ses deux cartes", async () => {
    const ctx = setup();
    const origin = await postLogin(ctx, "leamd");
    const form = new FormData();
    form.append("cv", new File([PDF as BlobPart], "cv.pdf", { type: "application/pdf" }));
    form.append("login", "tomdev");
    form.append("ref", origin.id);
    const res = await ctx.app.request("/api/card", { method: "POST", body: form });
    expect(res.status).toBe(202);
    const { id } = (await res.json()) as { id: string };
    await ctx.pipeline.wait(id);
    const ids = ctx.store.groupIds(id);
    expect(ids).toHaveLength(3);
    for (const i of ids) expect(ctx.store.getCard(i)!.refCardId).toBe(i === id ? origin.id : null);
  });

  it("CV seul en multipart : ref invalide ignorée", async () => {
    const ctx = setup();
    const form = new FormData();
    form.append("cv", new File([PDF as BlobPart], "cv.pdf", { type: "application/pdf" }));
    form.append("ref", "../../etc");
    const res = await ctx.app.request("/api/card", { method: "POST", body: form });
    expect(res.status).toBe(202);
    const { id } = (await res.json()) as { id: string };
    await ctx.pipeline.wait(id);
    expect(ctx.store.getCard(id)!.refCardId).toBeNull();
  });
});

describe("événement shared_visit", () => {
  it("est accepté avec la fiche d'origine", async () => {
    const ctx = setup();
    const res = await ctx.app.request("/api/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "shared_visit", cardId: "AbCdEf1234", meta: { ref: "AbCdEf1234" } }),
    });
    expect(res.status).toBe(202);
    expect(ctx.store.listEvents("shared_visit")).toEqual([
      expect.objectContaining({ cardId: "AbCdEf1234", meta: { ref: "AbCdEf1234" } }),
    ]);
  });
});

describe("migration de ref_card_id", () => {
  it("ajoute la colonne à une base créée sans elle, sans perdre les fiches", () => {
    const path = join(mkdtempSync(join(tmpdir(), "tys-db-")), "cards.db");
    // Schéma de production d'avant la colonne.
    const old = new Database(path);
    old.exec(`CREATE TABLE cards (
      id TEXT PRIMARY KEY, parent_id TEXT, created_at INTEGER NOT NULL, source TEXT NOT NULL, login TEXT,
      kind TEXT NOT NULL, json TEXT NOT NULL, facts_json TEXT, email TEXT, delete_token TEXT NOT NULL, expires_at INTEGER)`);
    old
      .prepare(`INSERT INTO cards VALUES ('OldCard001', NULL, 1, 'github', 'lea', 'card', ?, NULL, 'l@x.co', 'tok', NULL)`)
      .run(JSON.stringify({ ...FIXTURES.gold, id: "OldCard001" }));
    old.close();

    const store = new Store(path);
    stores.push(store);
    const cols = (store.db.prepare(`PRAGMA table_info(cards)`).all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain("ref_card_id");
    const kept = store.getCard("OldCard001")!;
    expect(kept).toMatchObject({ login: "lea", email: "l@x.co", deleteToken: "tok", refCardId: null });
    expect((kept.data as CardData).name).toBe(FIXTURES.gold.name);

    // Nouvelle fiche avec origine, puis réouverture : la migration est idempotente.
    store.insertCards([
      { id: "NewCard001", createdAt: 2, source: "github", login: "tom", kind: "card", data: { ...FIXTURES.gold, id: "NewCard001" }, deleteToken: "t2", refCardId: "OldCard001" },
    ]);
    store.close();
    stores.pop();
    const again = new Store(path);
    stores.push(again);
    expect(again.getCard("NewCard001")!.refCardId).toBe("OldCard001");
    expect(again.getCard("OldCard001")!.refCardId).toBeNull();
  });
});
