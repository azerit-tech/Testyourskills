// Les bandes (§18.38) : droits, limites, score, retrait, vue publique, avec un moteur factice.

import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import type { BandBoard, BandPage, BandRef, MyBands } from "../../shared/bands";
import { FIXTURES } from "../../shared/fixtures";
import type { CardData } from "../../shared/types";
import { createApp, purge } from "./app";
import { SESSION_COOKIE, signSession } from "./auth";
import { bandBoard, bandsTop, bandStanding, joinBand } from "./bands";
import { migrate, RETENTION_MS, Store } from "./db";
import type { Deps } from "./pipeline";

const BASE = "https://skills.test";
const SECRET = "s".repeat(40);
const IP = "198.51.100.7";

const deps = {
  aiAvailable: () => true,
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
  const ogDir = join(mkdtempSync(join(tmpdir(), "tys-bands-")), "og");
  mkdirSync(ogDir);
  const { app } = createApp({
    store,
    deps,
    githubToken: "t",
    baseUrl: BASE,
    ogDir,
    githubAuth: { clientId: "gh-client", clientSecret: "x", sessionSecret: SECRET },
  });
  return { app, store, ogDir };
}

type Ctx = ReturnType<typeof setup>;

/** overall → étoiles : 30 → 2, 45 → 3, 60 → 4, 75 → 5, 90 → 6. */
const OVERALL = { 1: 20, 2: 35, 3: 50, 4: 65, 5: 80, 6: 92 } as const;

interface CardOpts {
  login?: string | null;
  stars?: keyof typeof OVERALL;
  school?: string;
  club?: string | null;
  degraded?: boolean;
  linkedinUrl?: string;
  createdAt?: number;
  name?: string;
}

let seq = 0;
/** Une fiche posée directement en base ; son jeton est `tok-{id}`. */
function insert(store: Store, o: CardOpts = {}): string {
  const id = `Card${String(++seq).padStart(6, "0")}`;
  const createdAt = o.createdAt ?? Date.now();
  const login = o.login === undefined ? `dev${seq}` : o.login;
  const { login: _l, ...base } = FIXTURES.gold;
  const data: CardData = {
    ...base,
    id,
    createdAt: new Date(createdAt).toISOString(),
    overall: OVERALL[o.stars ?? 4],
    name: o.name ?? "Camille Ardent",
    club: o.club === undefined ? "Doctolib" : o.club,
    ...(login ? { login } : {}),
    ...(o.school ? { school: o.school } : {}),
    ...(o.linkedinUrl ? { linkedinUrl: o.linkedinUrl, declaredSource: "linkedin" as const, source: "cv" as const } : {}),
  };
  store.insertCards([
    {
      id,
      createdAt,
      source: o.linkedinUrl ? "linkedin" : "github",
      login,
      kind: "card",
      data,
      deleteToken: `tok-${id}`,
      degraded: o.degraded,
      ...(o.linkedinUrl ? { facts: { linkedinUrl: o.linkedinUrl } } : {}),
    },
  ]);
  return id;
}

const asOwner = (login: string, githubId: number) => ({ cookie: `${SESSION_COOKIE}=${encodeURIComponent(signSession(SECRET, { login, githubId }))}` });

async function call<T>(ctx: Ctx, path: string, init: { body?: unknown; token?: string | null; ip?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": init.ip ?? IP, ...(init.headers ?? {}) };
  if (init.token) headers["x-card-token"] = init.token;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  const res = await ctx.app.request(path, { method: init.body !== undefined ? "POST" : "GET", headers, body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
  return { status: res.status, json: (await res.json().catch(() => null)) as T & { code?: string } };
}

const join_ = (ctx: Ctx, cardId: string, body: Record<string, string>, o: { token?: string | null; ip?: string; headers?: Record<string, string> } = {}) =>
  call<MyBands>(ctx, "/api/bands/join", { body: { cardId, ...body }, token: o.token === undefined ? `tok-${cardId}` : o.token, ip: o.ip, headers: o.headers });

const leave = (ctx: Ctx, cardId: string, type: string, token: string | null = `tok-${cardId}`) =>
  call<MyBands>(ctx, "/api/bands/leave", { body: { cardId, type }, token });

const school = (id: string): BandRef => ({ type: "ecole", id, label: id });

/** Fait entrer une fiche par la fonction, sans la limite par IP. */
function put(store: Store, cardId: string, ref: BandRef, at?: number) {
  joinBand(store, store.getCard(cardId)!, ref, at);
}

describe("table band_members", () => {
  it("s'ajoute à une base existante, idempotente", () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE cards (id TEXT PRIMARY KEY, parent_id TEXT, created_at INTEGER NOT NULL, source TEXT NOT NULL, login TEXT,
      kind TEXT NOT NULL, json TEXT NOT NULL, facts_json TEXT, email TEXT, delete_token TEXT NOT NULL, expires_at INTEGER)`);
    migrate(db);
    migrate(db);
    const cols = (db.prepare(`PRAGMA table_info(band_members)`).all() as { name: string }[]).map((c) => c.name);
    expect(cols).toEqual(["person_key", "kind", "band_id", "label", "card_id", "login", "stars", "joined_at"]);
    db.close();
  });
});

describe("entrer et sortir : les droits", () => {
  it("le jeton de la fiche fait entrer ; sans lui, ou avec un autre, refusé", async () => {
    const ctx = setup();
    const id = insert(ctx.store, { school: "epitech" });
    expect((await join_(ctx, id, { type: "ecole", id: "epitech" }, { token: null })).status).toBe(403);
    expect((await join_(ctx, id, { type: "ecole", id: "epitech" }, { token: "tok-autre" })).status).toBe(403);
    const ok = await join_(ctx, id, { type: "ecole", id: "epitech" });
    expect(ok.status).toBe(200);
    expect(ok.json.ecole).toMatchObject({ id: "epitech", label: "Epitech", members: 1, rank: null, missing: 2 });
    expect(ctx.store.listEvents("band_join")).toMatchObject([{ cardId: id, meta: { type: "ecole" } }]);
  });

  it("la personne connectée comme propriétaire entre sans le jeton", async () => {
    const ctx = setup();
    const id = insert(ctx.store, { login: "leamd" });
    ctx.store.claimOwner("leamd", 42);
    const r = await join_(ctx, id, { type: "boite", name: "Doctolib SAS" }, { token: null, headers: asOwner("leamd", 42) });
    expect(r.status).toBe(200);
    expect(r.json.boite).toMatchObject({ id: "doctolib", label: "Doctolib" });
    // Quelqu'un d'autre connecté : refusé.
    ctx.store.claimOwner("autre", 7);
    expect((await join_(ctx, id, { type: "ecole", id: "epita" }, { token: null, headers: asOwner("autre", 7) })).status).toBe(403);
  });

  it("une fiche née d'une dénonciation n'entre qu'une fois revendiquée", async () => {
    const ctx = setup();
    const by = insert(ctx.store);
    const id = insert(ctx.store, { login: "cible" });
    ctx.store.markDenounced(id, by, null);
    const r = await join_(ctx, id, { type: "ecole", id: "epitech" });
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("denounced");
    expect((await call(ctx, `/api/card/${id}/bands`, { token: `tok-${id}` })).status).toBe(403);
    // Revendiquée : la personne connectée y entre ; le jeton (celui du dénonciateur) ne suffit toujours pas.
    ctx.store.claimOwner("cible", 99);
    expect((await join_(ctx, id, { type: "ecole", id: "epitech" })).status).toBe(403);
    expect((await join_(ctx, id, { type: "ecole", id: "epitech" }, { token: null, headers: asOwner("cible", 99) })).status).toBe(200);
  });

  it("une fiche sortie sans lecture IA ne joue pas", async () => {
    const ctx = setup();
    const id = insert(ctx.store, { degraded: true });
    const r = await join_(ctx, id, { type: "ecole", id: "epitech" });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("degraded");
  });

  it("une école hors liste, une boîte qui n'en est pas : refusées", async () => {
    const ctx = setup();
    const id = insert(ctx.store);
    expect((await join_(ctx, id, { type: "ecole", id: "ecole-inventee" })).json.code).toBe("unknown_school");
    for (const name of ["Freelance", "Étudiant", "Stealth Startup", "Indépendant"]) {
      const r = await join_(ctx, id, { type: "boite", name });
      expect(r.status, name).toBe(400);
      expect(r.json.code, name).toBe("not_a_band");
    }
  });

  it("trois entrées par jour et par IP ; rester dans sa bande ne compte pas", async () => {
    const ctx = setup();
    const id = insert(ctx.store);
    expect((await join_(ctx, id, { type: "ecole", id: "epitech" })).status).toBe(200);
    expect((await join_(ctx, id, { type: "ecole", id: "epitech" })).status).toBe(200);
    expect((await join_(ctx, id, { type: "boite", name: "Doctolib" })).status).toBe(200);
    expect((await join_(ctx, id, { type: "ecole", id: "epita" })).status).toBe(200);
    const fourth = await join_(ctx, id, { type: "ecole", id: "efrei" });
    expect(fourth.status).toBe(429);
    expect(fourth.json.code).toBe("rate_limited");
    // Une autre IP passe.
    expect((await join_(ctx, id, { type: "ecole", id: "efrei" }, { ip: "203.0.113.9" })).status).toBe(200);
    // Sortir ne consomme rien.
    expect((await leave(ctx, id, "ecole")).status).toBe(200);
  });

  it("une école et une boîte au plus : entrer ailleurs quitte l'ancienne ; un toucher pour sortir", async () => {
    const ctx = setup();
    const id = insert(ctx.store, { login: "leamd" });
    await join_(ctx, id, { type: "ecole", id: "epitech" });
    await join_(ctx, id, { type: "ecole", id: "epita" });
    expect(bandStanding(ctx.store.db, "ecole", "epitech")!.members).toBe(0);
    expect(bandStanding(ctx.store.db, "ecole", "epita")!.members).toBe(1);
    // Une autre fiche du même login : la même personne, elle déplace sa ligne.
    const again = insert(ctx.store, { login: "leamd", stars: 6 });
    await join_(ctx, again, { type: "ecole", id: "epita" });
    expect(bandStanding(ctx.store.db, "ecole", "epita")).toMatchObject({ members: 1, score: 6 });
    const out = await leave(ctx, again, "ecole");
    expect(out.json.ecole).toBeNull();
    expect(bandStanding(ctx.store.db, "ecole", "epita")!.members).toBe(0);
    expect(ctx.store.listEvents("band_leave")).toHaveLength(1);
    expect((await leave(ctx, again, "ecole", null)).status).toBe(403);
  });

  it("une fiche LinkedIn seule : la personne est son adresse LinkedIn", async () => {
    const ctx = setup();
    const a = insert(ctx.store, { login: null, linkedinUrl: "https://www.linkedin.com/in/camille" });
    const b = insert(ctx.store, { login: null, linkedinUrl: "https://www.linkedin.com/in/camille" });
    put(ctx.store, a, school("epitech"));
    put(ctx.store, b, school("epitech"));
    expect(bandStanding(ctx.store.db, "ecole", "epitech")!.members).toBe(1);
  });
});

describe("GET /api/card/:id/bands", () => {
  it("rend les pastilles lues sur la fiche, à la personne seule", async () => {
    const ctx = setup();
    const id = insert(ctx.store, { school: "centralesupelec", club: "@Doctolib" });
    const r = await call<MyBands>(ctx, `/api/card/${id}/bands`, { token: `tok-${id}` });
    expect(r.status).toBe(200);
    expect(r.json.stars).toBe(4);
    expect(r.json.suggest).toEqual({
      ecole: { type: "ecole", id: "centralesupelec", label: "CentraleSupélec" },
      boite: { type: "boite", id: "doctolib", label: "Doctolib" },
    });
    expect(r.json.ecole).toBeNull();
    // Freelance n'est pas proposé.
    const free = insert(ctx.store, { club: "Freelance" });
    expect((await call<MyBands>(ctx, `/api/card/${free}/bands`, { token: `tok-${free}` })).json.suggest.boite).toBeNull();
    expect((await call(ctx, `/api/card/${id}/bands`)).status).toBe(403);
  });
});

describe("le score d'une bande", () => {
  it("la somme des étoiles de ses vingt meilleurs dossiers", () => {
    const ctx = setup();
    for (let i = 0; i < 22; i++) put(ctx.store, insert(ctx.store, { stars: i < 2 ? 1 : 6 }), school("epitech"));
    expect(bandStanding(ctx.store.db, "ecole", "epitech")).toMatchObject({ score: 120, members: 22, rank: 1 });
    // Un membre de plus ne fait jamais baisser sa bande.
    put(ctx.store, insert(ctx.store, { stars: 1 }), school("epitech"));
    expect(bandStanding(ctx.store.db, "ecole", "epitech")!.score).toBe(120);
  });

  it("à égalité : le plus de dossiers, puis la bande la plus ancienne ; au tableau à partir de trois", () => {
    const ctx = setup();
    const t = 1_800_000_000_000;
    const add = (band: string, stars: (1 | 2 | 3 | 4 | 5 | 6)[], at: number) => stars.forEach((s, i) => put(ctx.store, insert(ctx.store, { stars: s }), school(band), at + i));
    add("epita", [6, 6, 6], t); // 18, 3 dossiers, la plus ancienne
    add("epitech", [5, 5, 4, 4], t + 100); // 18, 4 dossiers
    add("efrei", [6, 6, 6], t + 200); // 18, 3 dossiers, plus récente
    add("esiea", [6, 6], t + 300); // en formation
    const board = bandBoard(ctx.store.db, "ecole");
    expect(board.total).toBe(3);
    expect(board.entries.map((e) => [e.id, e.rank, e.score, e.gap])).toEqual([
      ["epitech", 1, 18, null],
      ["epita", 2, 18, 0],
      ["efrei", 3, 18, 0],
    ]);
    expect(board.entries[1]!.ahead).toEqual({ id: "epitech", label: "Epitech", rank: 1 });
    expect(bandStanding(ctx.store.db, "ecole", "esiea")).toMatchObject({ rank: null, missing: 1, members: 2, score: 12, gap: null, ahead: null });
    // Sa propre bande, plus bas ou en formation, vient en plus.
    expect(bandBoard(ctx.store.db, "ecole", "esiea").extra).toMatchObject({ id: "esiea", missing: 1 });
    expect(bandBoard(ctx.store.db, "ecole", "epita").extra).toBeNull();
    // L'accueil : les cinq premières de chaque ligue.
    expect(bandsTop(ctx.store.db).ecole.map((e) => e.id)).toEqual(["epitech", "epita", "efrei"]);
    expect(bandsTop(ctx.store.db).boite).toEqual([]);
  });

  it("l'écart avec la bande de devant", () => {
    const ctx = setup();
    for (const s of [6, 6, 6] as const) put(ctx.store, insert(ctx.store, { stars: s }), school("epitech"));
    for (const s of [4, 4, 4] as const) put(ctx.store, insert(ctx.store, { stars: s }), school("epita"));
    expect(bandStanding(ctx.store.db, "ecole", "epita")).toMatchObject({ rank: 2, gap: 6, ahead: { id: "epitech", rank: 1 } });
  });
});

describe("retrait", () => {
  async function band(ctx: Ctx, n: number) {
    const ids = Array.from({ length: n }, (_, i) => insert(ctx.store, { login: `m${i}` }));
    for (const id of ids) put(ctx.store, id, school("epitech"));
    return ids;
  }

  it("supprimer sa fiche la retire de ses bandes", async () => {
    const ctx = setup();
    const ids = await band(ctx, 3);
    expect(bandStanding(ctx.store.db, "ecole", "epitech")!.rank).toBe(1);
    const res = await ctx.app.request(`/api/card/${ids[0]}?token=tok-${ids[0]}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(bandStanding(ctx.store.db, "ecole", "epitech")).toMatchObject({ members: 2, rank: null, missing: 1 });
    expect(ctx.store.db.prepare(`SELECT COUNT(*) AS n FROM band_members WHERE card_id = ?`).get(ids[0])).toEqual({ n: 0 });
  });

  it("masquer sa fiche la retire, la rendre visible l'y remet", async () => {
    const ctx = setup();
    await band(ctx, 3);
    ctx.store.claimOwner("m0", 1);
    ctx.store.setOwnerHidden("m0", true);
    expect(bandStanding(ctx.store.db, "ecole", "epitech")!.members).toBe(2);
    ctx.store.setOwnerHidden("m0", false);
    expect(bandStanding(ctx.store.db, "ecole", "epitech")!.members).toBe(3);
  });

  it("une fiche expirée ne compte plus, et la purge l'efface", async () => {
    const ctx = setup();
    const old = insert(ctx.store, { createdAt: Date.now() - RETENTION_MS - 1000 });
    put(ctx.store, old, school("epitech"));
    put(ctx.store, insert(ctx.store), school("epitech"));
    expect(bandStanding(ctx.store.db, "ecole", "epitech")!.members).toBe(1);
    await purge(ctx.store, ctx.ogDir);
    expect(ctx.store.db.prepare(`SELECT COUNT(*) AS n FROM band_members`).get()).toEqual({ n: 1 });
  });
});

describe("pages publiques", () => {
  it("la page d'une bande : jamais un nom ; le @pseudo seulement si la fiche est revendiquée ; aucun rang d'école", async () => {
    const ctx = setup();
    const claimed = insert(ctx.store, { login: "leamd", stars: 6, name: "Léa Martin-Dubois" });
    const plain = insert(ctx.store, { login: "anonyme", stars: 5, name: "Nom Caché" });
    const li = insert(ctx.store, { login: null, stars: 4, linkedinUrl: "https://www.linkedin.com/in/x", name: "Personne LinkedIn" });
    ctx.store.claimOwner("leamd", 3);
    for (const id of [claimed, plain, li]) put(ctx.store, id, school("centralesupelec"));
    const r = await call<BandPage>(ctx, "/api/bands/ecole/centralesupelec");
    expect(r.status).toBe(200);
    expect(r.json.band).toMatchObject({ label: "CentraleSupélec", score: 15, members: 3, rank: 1 });
    expect(r.json.members.map((m) => [m.stars, m.login ?? null, m.cardId ?? null])).toEqual([
      [6, "leamd", claimed],
      [5, null, null],
      [4, null, null],
    ]);
    expect(r.json.members[0]!.profile).toEqual(FIXTURES.gold.profile!.label);
    const text = JSON.stringify(r.json);
    expect(text).not.toMatch(/Léa Martin|Nom Caché|Personne LinkedIn|anonyme|linkedin\.com|rang [SABC]|tier|"school"/);
  });

  it("une école de la liste sans membre existe, en formation ; une boîte inconnue non", async () => {
    const ctx = setup();
    expect((await call<BandPage>(ctx, "/api/bands/ecole/epitech")).json.band).toMatchObject({ members: 0, missing: 3, rank: null });
    expect((await call(ctx, "/api/bands/boite/inconnue")).status).toBe(404);
    expect((await call(ctx, "/api/bands/ville/paris")).status).toBe(404);
  });

  it("les tableaux", async () => {
    const ctx = setup();
    for (let i = 0; i < 3; i++) put(ctx.store, insert(ctx.store), { type: "boite", id: "doctolib", label: "Doctolib" });
    const board = await call<BandBoard>(ctx, "/api/bands?type=boite");
    expect(board.json.entries).toMatchObject([{ id: "doctolib", rank: 1, score: 12, members: 3 }]);
    expect((await call(ctx, "/api/bands?type=ville")).status).toBe(400);
    expect((await call<{ ecole: unknown[]; boite: unknown[] }>(ctx, "/api/bands/top")).json.boite).toHaveLength(1);
  });

  it("la vue publique d'une fiche ne porte pas son école ; la personne fichée la lit", async () => {
    const ctx = setup();
    const id = insert(ctx.store, { school: "centralesupelec" });
    const pub = await ctx.app.request(`/api/card/${id}`);
    expect(JSON.stringify(await pub.json())).not.toMatch(/"school"|centralesupelec/);
    const own = await ctx.app.request(`/api/card/${id}`, { headers: { "x-card-token": `tok-${id}` } });
    expect(((await own.json()) as { card: CardData }).card.school).toBe("centralesupelec");
  });

  it("le front envoie band_view et band_share ; band_join reste au serveur", async () => {
    const ctx = setup();
    const send = (event: string) =>
      ctx.app.request("/api/event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event, meta: { type: "ecole" } }) });
    expect((await send("band_view")).status).toBe(202);
    expect((await send("band_share")).status).toBe(202);
    expect((await send("band_join")).status).toBe(400);
  });
});
