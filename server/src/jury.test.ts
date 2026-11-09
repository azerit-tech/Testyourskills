// Le jury de la page partagée (§18.27), avec un moteur factice.

import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURES } from "../../shared/fixtures";
import type { CardData } from "../../shared/types";
import { createApp, purge } from "./app";
import { SESSION_COOKIE, signSession } from "./auth";
import { migrate, RETENTION_MS, Store, type Jury } from "./db";
import { VOTES_PER_DAY } from "./jury";
import type { CardBody, Deps } from "./pipeline";

const BASE = "https://skills.test";
const SECRET = "s".repeat(40);
const IP = "198.51.100.7";

function body(card: CardData): CardBody {
  const { id: _id, createdAt: _c, ...rest } = card;
  return rest;
}

const deps = {
  async collectGithub(login: string) {
    return { login };
  },
  async pickFilesForReading() {
    return [];
  },
  async readCode() {
    return { readings: [], ai_status: "ai_typed" };
  },
  aiAvailable: () => true,
  scoreGithub(facts: unknown, _ai: unknown, { lang, judgedInSeconds }: { lang: "fr" | "en"; judgedInSeconds: number }) {
    return { ...body(FIXTURES.gold), login: (facts as { login: string }).login, name: (facts as { login: string }).login, lang, judgedInSeconds };
  },
  async renderImage() {
    return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  },
} as unknown as Deps;

const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
});

function setup() {
  const store = new Store(":memory:");
  stores.push(store);
  const ogDir = join(mkdtempSync(join(tmpdir(), "tys-jury-")), "og");
  mkdirSync(ogDir);
  const { app, pipeline } = createApp({
    store,
    deps,
    githubToken: "t",
    baseUrl: BASE,
    ogDir,
    cardsPerDay: 1000,
    githubAuth: { clientId: "gh-client", clientSecret: "x", sessionSecret: SECRET },
  });
  return { app, pipeline, store, ogDir };
}

type Ctx = ReturnType<typeof setup>;

async function card(ctx: Ctx, login: string) {
  const res = await ctx.app.request("/api/card", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.1" },
    body: JSON.stringify({ lang: "fr", login }),
  });
  const json = (await res.json()) as { id: string; deleteToken: string };
  await ctx.pipeline.wait(json.id);
  return json;
}

async function vote(ctx: Ctx, cardId: unknown, verdict: unknown, ip = IP) {
  const res = await ctx.app.request("/api/vote", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ cardId, verdict }),
  });
  return { status: res.status, json: (await res.json()) as { jury?: Jury; code?: string; message?: { fr: string } } };
}

async function juryOf(ctx: Ctx, id: string, ip = IP, headers: Record<string, string> = {}) {
  const res = await ctx.app.request(`/api/card/${id}/case`, { headers: { "x-forwarded-for": ip, ...headers } });
  return { status: res.status, jury: ((await res.json()) as { jury?: Jury }).jury };
}

const asOwner = (login: string, githubId: number) => ({ cookie: `${SESSION_COOKIE}=${encodeURIComponent(signSession(SECRET, { login, githubId }))}` });

describe("table votes", () => {
  it("s'ajoute à une base existante sans perdre ses fiches", () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE cards (id TEXT PRIMARY KEY, parent_id TEXT, created_at INTEGER NOT NULL, source TEXT NOT NULL, login TEXT,
      kind TEXT NOT NULL, json TEXT NOT NULL, facts_json TEXT, email TEXT, delete_token TEXT NOT NULL, expires_at INTEGER)`);
    db.prepare(`INSERT INTO cards (id, created_at, source, login, kind, json, delete_token) VALUES ('OldCard001', 1, 'github', 'leamd', 'card', '{}', 't')`).run();
    migrate(db);
    migrate(db); // idempotent
    const cols = (db.prepare(`PRAGMA table_info(votes)`).all() as { name: string; pk: number }[]).map((c) => [c.name, c.pk]);
    expect(cols).toEqual([["card_id", 1], ["ip_hash", 2], ["verdict", 0], ["created_at", 0]]);
    expect(db.prepare(`SELECT id FROM cards`).all()).toEqual([{ id: "OldCard001" }]);
    db.close();
  });
});

describe("POST /api/vote", () => {
  it("pose le vote, rend le décompte, et le serveur compte jury_vote", async () => {
    const ctx = setup();
    const { id } = await card(ctx, "leamd");
    expect((await juryOf(ctx, id)).jury).toEqual({ guilty: 0, cleared: 0, mine: null });

    const first = await vote(ctx, id, "guilty");
    expect(first.status).toBe(200);
    expect(first.json.jury).toEqual({ guilty: 1, cleared: 0, mine: "guilty" });
    const second = await vote(ctx, id, "cleared", "198.51.100.8");
    expect(second.json.jury).toEqual({ guilty: 1, cleared: 1, mine: "cleared" });

    // /case porte le même décompte ; `mine` suit l'IP qui demande.
    expect((await juryOf(ctx, id)).jury).toEqual({ guilty: 1, cleared: 1, mine: "guilty" });
    expect((await juryOf(ctx, id, "198.51.100.9")).jury).toEqual({ guilty: 1, cleared: 1, mine: null });
    expect(ctx.store.listEvents("jury_vote")).toMatchObject([
      { cardId: id, meta: { verdict: "guilty" } },
      { cardId: id, meta: { verdict: "cleared" } },
    ]);
  });

  it("un vote par fiche et par IP : le premier reste, le second appel rend le vote déjà posé", async () => {
    const ctx = setup();
    const { id } = await card(ctx, "leamd");
    await vote(ctx, id, "guilty");
    const again = await vote(ctx, id, "cleared");
    expect(again.status).toBe(200);
    expect(again.json.jury).toEqual({ guilty: 1, cleared: 0, mine: "guilty" });
    expect(ctx.store.listEvents("jury_vote")).toHaveLength(1);
    // La même IP vote encore sur une autre fiche.
    const other = await card(ctx, "camroux");
    expect((await vote(ctx, other.id, "cleared")).json.jury).toEqual({ guilty: 0, cleared: 1, mine: "cleared" });
  });

  it("ne garde jamais l'IP en clair", async () => {
    const ctx = setup();
    const { id } = await card(ctx, "leamd");
    await vote(ctx, id, "guilty");
    const rows = ctx.store.db.prepare(`SELECT * FROM votes`).all() as { card_id: string; ip_hash: string; verdict: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ card_id: id, verdict: "guilty" });
    expect(rows[0]!.ip_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(rows)).not.toContain(IP);
  });

  it("refuse une fiche inconnue, expirée, ou une demande mal formée", async () => {
    const ctx = setup();
    const { id } = await card(ctx, "leamd");
    expect((await vote(ctx, "Inconnue01", "guilty")).status).toBe(404);
    expect((await vote(ctx, "../x", "guilty")).status).toBe(400);
    expect((await vote(ctx, id, "pendu")).status).toBe(400);
    expect((await vote(ctx, id, undefined)).status).toBe(400);
    // Expirée, pas encore purgée.
    ctx.store.db.prepare(`UPDATE cards SET expires_at = ? WHERE id = ?`).run(Date.now() - 1000, id);
    expect((await vote(ctx, id, "guilty")).status).toBe(404);
    expect(ctx.store.db.prepare(`SELECT COUNT(*) AS n FROM votes`).get()).toEqual({ n: 0 });
  });

  it("aucun vote sur une fiche masquée par son propriétaire, pas même le sien", async () => {
    const ctx = setup();
    const { id } = await card(ctx, "leamd");
    await vote(ctx, id, "guilty");
    ctx.store.claimOwner("leamd", 4242);
    ctx.store.setOwnerHidden("leamd", true);

    const hidden = await vote(ctx, id, "cleared", "198.51.100.8");
    expect(hidden.status).toBe(410);
    expect(hidden.json.code).toBe("gone");
    const res = await ctx.app.request("/api/vote", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.9", ...asOwner("leamd", 4242) },
      body: JSON.stringify({ cardId: id, verdict: "cleared" }),
    });
    expect(res.status).toBe(410);
    // Le décompte ne sort pas pour les autres ; le propriétaire le lit encore.
    expect((await juryOf(ctx, id)).status).toBe(410);
    expect((await juryOf(ctx, id, IP, asOwner("leamd", 4242))).jury).toMatchObject({ guilty: 1, cleared: 0 });

    // Fiches rendues visibles : le jury rouvre.
    ctx.store.setOwnerHidden("leamd", false);
    expect((await vote(ctx, id, "cleared", "198.51.100.8")).json.jury).toEqual({ guilty: 1, cleared: 1, mine: "cleared" });
  });

  it(`limite à ${VOTES_PER_DAY} votes par jour et par IP`, async () => {
    const ctx = setup();
    const ids: string[] = [];
    for (let i = 0; i <= VOTES_PER_DAY; i++) ids.push((await card(ctx, `suspect-${i}`)).id);
    for (let i = 0; i < VOTES_PER_DAY; i++) expect((await vote(ctx, ids[i], "guilty")).status).toBe(200);

    const over = await vote(ctx, ids[VOTES_PER_DAY], "guilty");
    expect(over.status).toBe(429);
    expect(over.json.code).toBe("rate_limited");
    expect(over.json.message?.fr).toMatch(/Soixante votes/);
    expect((await juryOf(ctx, ids[VOTES_PER_DAY]!)).jury).toEqual({ guilty: 0, cleared: 0, mine: null });
    // Relire un vote déjà posé ne coûte rien ; une autre IP vote encore.
    expect((await vote(ctx, ids[0], "cleared")).json.jury).toEqual({ guilty: 1, cleared: 0, mine: "guilty" });
    expect((await vote(ctx, ids[VOTES_PER_DAY], "cleared", "198.51.100.8")).status).toBe(200);
  });

  it("le front ne peut pas envoyer jury_vote lui-même", async () => {
    const ctx = setup();
    const res = await ctx.app.request("/api/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "jury_vote", cardId: "AbCdEf1234" }),
    });
    expect(res.status).toBe(400);
    expect(ctx.store.listEvents("jury_vote")).toHaveLength(0);
  });
});

describe("suppression d'une fiche", () => {
  it("supprime aussi ses votes, pas ceux des autres fiches", async () => {
    const ctx = setup();
    const a = await card(ctx, "leamd");
    const b = await card(ctx, "camroux");
    await vote(ctx, a.id, "guilty");
    await vote(ctx, a.id, "cleared", "198.51.100.8");
    await vote(ctx, b.id, "guilty");

    const del = await ctx.app.request(`/api/card/${a.id}?token=${a.deleteToken}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    expect(ctx.store.db.prepare(`SELECT card_id FROM votes`).all()).toEqual([{ card_id: b.id }]);
    expect((await vote(ctx, a.id, "guilty")).status).toBe(404);
  });

  it("la purge des fiches expirées emporte leurs votes", async () => {
    const ctx = setup();
    const { id } = await card(ctx, "leamd");
    await vote(ctx, id, "guilty");
    expect(await purge(ctx.store, ctx.ogDir, Date.now() + RETENTION_MS + 1000)).toBe(1);
    expect(ctx.store.db.prepare(`SELECT COUNT(*) AS n FROM votes`).get()).toEqual({ n: 0 });
  });
});
