// « Dénonce un complice » (§18.6) et la page partagée (§18.7), avec un moteur factice.

import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURES } from "../../shared/fixtures";
import type { CardData } from "../../shared/types";
import { createApp } from "./app";
import { SESSION_COOKIE, signSession } from "./auth";
import { migrate, Store } from "./db";
import { DENOUNCE_PER_DAY } from "./denounce";
import type { CardBody, Deps } from "./pipeline";

const BASE = "https://skills.test";
const SECRET = "s".repeat(40);

function body(card: CardData): CardBody {
  const { id: _id, createdAt: _c, ...rest } = card;
  return rest;
}

/** Faits factices : un compte X pour « nour-rs », des complices (dont un bot et le joueur) pour « leamd ». */
function factsFor(login: string) {
  return {
    login,
    profile: { login, twitterUsername: login === "nour-rs" ? "nour_codes" : null },
    accomplices:
      login === "leamd"
        ? [
            { login: "camroux", avatarUrl: "https://avatars.githubusercontent.com/u/1" },
            { login: "jplefevre", avatarUrl: "https://avatars.githubusercontent.com/u/2" },
            { login: "nour-rs", avatarUrl: "https://avatars.githubusercontent.com/u/3" },
            { login: "ines-h", avatarUrl: "https://avatars.githubusercontent.com/u/4" },
          ]
        : [],
  };
}

const deps = {
  async collectGithub(login: string) {
    return factsFor(login);
  },
  async pickFilesForReading() {
    return [];
  },
  async readCode() {
    return { readings: [], ai_status: "ai_typed" };
  },
  // IA « disponible » et rien à lire : la fiche n'est pas dégradée, le cache 24 h la ressert.
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
  const ogDir = join(mkdtempSync(join(tmpdir(), "tys-denounce-")), "og");
  mkdirSync(ogDir);
  const { app, pipeline } = createApp({
    store,
    deps,
    githubToken: "t",
    baseUrl: BASE,
    ogDir,
    githubAuth: { clientId: "gh-client", clientSecret: "x", sessionSecret: SECRET },
  });
  return { app, pipeline, store };
}

type Ctx = ReturnType<typeof setup>;

async function post(ctx: Ctx, payload: Record<string, unknown>, headers: Record<string, string> = {}) {
  const res = await ctx.app.request("/api/card", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7", ...headers },
    body: JSON.stringify({ lang: "fr", ...payload }),
  });
  const json = (await res.json()) as { id: string; code?: string; message?: { fr: string } };
  if (json.id) await ctx.pipeline.wait(json.id);
  return { status: res.status, json };
}

async function getCase(ctx: Ctx, id: string, headers: Record<string, string> = {}) {
  const res = await ctx.app.request(`/api/card/${id}/case`, { headers });
  return { status: res.status, json: (await res.json()) as { denounced: boolean; by: string | null; x: string | null; accomplices: { login: string }[] } };
}

const asOwner = (login: string, githubId: number) => ({ cookie: `${SESSION_COOKIE}=${encodeURIComponent(signSession(SECRET, { login, githubId }))}` });

describe("colonne cards.denounced_by", () => {
  it("s'ajoute à une base existante sans perdre ses fiches", () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE cards (id TEXT PRIMARY KEY, parent_id TEXT, created_at INTEGER NOT NULL, source TEXT NOT NULL, login TEXT,
      kind TEXT NOT NULL, json TEXT NOT NULL, facts_json TEXT, email TEXT, delete_token TEXT NOT NULL, expires_at INTEGER)`);
    db.prepare(`INSERT INTO cards (id, created_at, source, login, kind, json, delete_token) VALUES ('OldCard001', 1, 'github', 'leamd', 'card', '{}', 't')`).run();
    migrate(db);
    migrate(db); // idempotent
    const cols = (db.prepare(`PRAGMA table_info(cards)`).all() as { name: string }[]).map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(["denounced_by", "denouncer_login", "ref_card_id", "degraded"]));
    expect(db.prepare(`SELECT id, denounced_by FROM cards`).all()).toEqual([{ id: "OldCard001", denounced_by: null }]);
    db.close();
  });
});

describe("POST /api/card avec denouncedBy", () => {
  it("marque la fiche du complice, compte denounce_sent, et reste anonyme sans revendication", async () => {
    const ctx = setup();
    const mine = await post(ctx, { login: "leamd" });
    const r = await post(ctx, { login: "camroux", denouncedBy: mine.json.id });
    expect(r.status).toBe(202);
    const row = ctx.store.getCard(r.json.id)!;
    expect(row.denouncedBy).toBe(mine.json.id);
    expect(row.denouncerLogin).toBeNull();
    expect(ctx.store.listEvents("denounce_sent")).toMatchObject([{ cardId: r.json.id, meta: { by: mine.json.id } }]);
    const { json } = await getCase(ctx, r.json.id);
    expect(json).toMatchObject({ denounced: true, by: null });
    // La fiche du dénonciateur, elle, n'est pas dénoncée.
    expect((await getCase(ctx, mine.json.id)).json.denounced).toBe(false);
  });

  it("nomme le dénonciateur seulement s'il est connecté comme propriétaire de sa fiche", async () => {
    const ctx = setup();
    const mine = await post(ctx, { login: "leamd" });
    ctx.store.claimOwner("leamd", 4242);
    // Connecté comme quelqu'un d'autre : anonyme, même avec l'id de la fiche de leamd.
    const other = ctx.store.claimOwner("camroux", 7);
    const spoof = await post(ctx, { login: "jplefevre", denouncedBy: mine.json.id }, asOwner(other.login, 7));
    expect((await getCase(ctx, spoof.json.id)).json.by).toBeNull();
    // Connecté comme leamd : nommé.
    const named = await post(ctx, { login: "nour-rs", denouncedBy: mine.json.id }, asOwner("leamd", 4242));
    expect(ctx.store.getCard(named.json.id)!.denouncerLogin).toBe("leamd");
    expect((await getCase(ctx, named.json.id)).json.by).toBe("leamd");
    // Le dénonciateur masque ses fiches : il redevient anonyme.
    ctx.store.setOwnerHidden("leamd", true);
    expect((await getCase(ctx, named.json.id)).json.by).toBeNull();
  });

  it("dénonce aussi une fiche déjà en cache, sans la recalculer ni changer son premier dénonciateur", async () => {
    const ctx = setup();
    const a = await post(ctx, { login: "leamd" });
    const b = await post(ctx, { login: "jplefevre" });
    const target = await post(ctx, { login: "camroux" });
    const first = await post(ctx, { login: "camroux", denouncedBy: a.json.id });
    expect(first.status).toBe(200);
    expect(first.json.id).toBe(target.json.id);
    await post(ctx, { login: "camroux", denouncedBy: b.json.id });
    expect(ctx.store.getCard(target.json.id)!.denouncedBy).toBe(a.json.id);
  });

  it("ignore un denouncedBy inconnu, mal formé ou qui vise sa propre fiche", async () => {
    const ctx = setup();
    const mine = await post(ctx, { login: "leamd" });
    for (const [login, by] of [["camroux", "Inconnue01"], ["jplefevre", "../x"], ["leamd", mine.json.id]] as const) {
      const r = await post(ctx, { login, denouncedBy: by });
      expect(ctx.store.getCard(r.json.id)!.denouncedBy).toBeNull();
    }
    expect(ctx.store.listEvents("denounce_sent")).toHaveLength(0);
  });

  it(`limite à ${DENOUNCE_PER_DAY} dénonciations par jour et par IP`, async () => {
    const ctx = setup();
    const mine = await post(ctx, { login: "leamd" });
    for (let i = 0; i < DENOUNCE_PER_DAY; i++) {
      expect((await post(ctx, { login: `suspect-${i}`, denouncedBy: mine.json.id })).status).toBe(202);
    }
    const sixth = await post(ctx, { login: "suspect-6", denouncedBy: mine.json.id });
    expect(sixth.status).toBe(429);
    expect(sixth.json.code).toBe("rate_limited");
    expect(sixth.json.message?.fr).toMatch(/Cinq dénonciations/);
    // Une autre IP peut encore dénoncer, et la même IP peut encore faire une fiche normale.
    expect((await post(ctx, { login: "suspect-7", denouncedBy: mine.json.id }, { "x-forwarded-for": "198.51.100.8" })).status).toBe(202);
    expect((await post(ctx, { login: "suspect-8" })).status).toBe(202);
  });
});

describe("GET /api/card/:id/case", () => {
  it("suggère au plus trois complices, jamais ceux qui ont masqué leurs fiches", async () => {
    const ctx = setup();
    const mine = await post(ctx, { login: "leamd" });
    expect((await getCase(ctx, mine.json.id)).json.accomplices.map((a) => a.login)).toEqual(["camroux", "jplefevre", "nour-rs"]);
    ctx.store.claimOwner("jplefevre", 9);
    ctx.store.setOwnerHidden("jplefevre", true);
    expect((await getCase(ctx, mine.json.id)).json.accomplices.map((a) => a.login)).toEqual(["camroux", "nour-rs", "ines-h"]);
  });

  it("donne le compte X déclaré sur GitHub, sinon null", async () => {
    const ctx = setup();
    const nour = await post(ctx, { login: "nour-rs" });
    const lea = await post(ctx, { login: "leamd" });
    expect((await getCase(ctx, nour.json.id)).json.x).toBe("nour_codes");
    expect((await getCase(ctx, lea.json.id)).json.x).toBeNull();
  });

  it("404 pour une fiche inconnue, 410 pour une fiche masquée vue par un autre", async () => {
    const ctx = setup();
    expect((await getCase(ctx, "Inconnue01")).status).toBe(404);
    const mine = await post(ctx, { login: "leamd" });
    ctx.store.claimOwner("leamd", 4242);
    ctx.store.setOwnerHidden("leamd", true);
    expect((await getCase(ctx, mine.json.id)).status).toBe(410);
    expect((await getCase(ctx, mine.json.id, asOwner("leamd", 4242))).status).toBe(200);
  });
});

describe("événements de la dénonciation", () => {
  it("le front peut envoyer denounce_landed, pas denounce_sent ni denounce_claimed", async () => {
    const ctx = setup();
    const send = (event: string) =>
      ctx.app.request("/api/event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event, cardId: "AbCdEf1234" }) });
    expect((await send("denounce_landed")).status).toBe(202);
    expect((await send("denounce_sent")).status).toBe(400);
    expect((await send("denounce_claimed")).status).toBe(400);
    expect(ctx.store.listEvents("denounce_landed")).toHaveLength(1);
  });
});

describe("balises OG de /c/:id (§18.7)", () => {
  it("« @X est dans le viseur ★★★★★ · {profil} »", async () => {
    const ctx = setup();
    const { json } = await post(ctx, { login: "leamd" });
    const html = await (await ctx.app.request(`/c/${json.id}`)).text();
    expect(html).toContain(`<meta property="og:title" content="@leamd est dans le viseur ★★★★★ · ${FIXTURES.gold.profile!.label.fr}">`);
  });
});
