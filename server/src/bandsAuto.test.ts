// L'entrée d'office dans les bandes (§18.82), avec un moteur factice : la fiche
// posée entre dans la bande de son école et de sa boîte, sans toucher.

import { fakeDossier } from "./__fixtures__/fakeDossier";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { MyBands } from "../../shared/bands";
import { FIXTURES } from "../../shared/fixtures";
import type { CardData, ComparisonData } from "../../shared/types";
import { fileOf } from "../../shared/caseFile";
import { isColorway } from "../../shared/card/colorways";
import { createApp } from "./app";
import { autoJoinBands, bandStanding, joinBand, leaveBand, starsOfRow } from "./bands";
import { RETENTION_MS, Store } from "./db";
import type { LinkedinFinder } from "./linkedinProfile/index";
import type { CardBody, Deps } from "./pipeline";

const BASE = "https://skills.test";
const SECRET = "s".repeat(40);
const IP = "198.51.100.7";
const LINKEDIN = "https://www.linkedin.com/in/camille-ardent";

function body(card: CardData): CardBody {
  const { id: _id, createdAt: _c, ...rest } = card;
  return rest;
}

/** Le champ « company » du profil GitHub, par pseudo ; les autres n'en ont pas. */
const COMPANY: Record<string, string> = { leamd: "@Qonto", indep: "Freelance", grossier: "Les connards", contact: "jean@dupont.fr" };

const deps = {
  async collectGithub(login: string) {
    return { login, profile: { login } };
  },
  async pickFilesForReading() {
    return [];
  },
  async readCode() {
    return { readings: [], ai_status: "ai_typed" };
  },
  aiAvailable: () => true,
  scoreGithub(facts: unknown, _ai: unknown, { lang, judgedInSeconds }: { lang: "fr" | "en"; judgedInSeconds: number }) {
    const login = (facts as { login: string }).login;
    return { ...body(FIXTURES.gold), login, name: login, club: COMPANY[login] ?? null, lang, judgedInSeconds };
  },
  async renderImage() {
    return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  },
  cvTextCounts: () => ({ words: 80, pages: 1, buzzwords: {}, buzzwordsPer100: 0, passionCount: 0 }),
  async readCv() {
    return { language: "fr", position: "FS", full_name: "Camille Ardent", is_dev_profile: true, roles: [], technos_listed: [], technos_described: [] };
  },
  // Le profil lu : Centrale Méditerranée, en poste chez Doctolib.
  scoreCv(_r: unknown, _c: unknown, { lang, judgedInSeconds }: { lang: "fr" | "en"; judgedInSeconds: number }) {
    return { ...body(FIXTURES.cv), club: "Doctolib", school: "centrale-mediterranee", lang, judgedInSeconds };
  },
  // Comme le moteur (scoring/compare.ts) : les deux pièces et la seule note du dossier.
  scoreDossier(this: Deps, declared: Parameters<Deps["scoreDossier"]>[0], github: Parameters<Deps["scoreDossier"]>[1], o: Parameters<Deps["scoreDossier"]>[2]) {
    return fakeDossier(this, declared, github, o);
  },
} as unknown as Deps;

const profileOf = (url: string) => ({ url, name: "Camille Ardent", headline: "Dev", title: "Dev", summary: "", roles: [], education: [], skills: [] });
/** Un lecteur de profils factice : tout lien donne le même profil, sans GitHub relié ni lien prouvé. */
const linkedinProfiles = {
  async forGithub(_facts: unknown, o: { url?: string }) {
    return o.url ? { profile: profileOf(o.url), proven: false } : null;
  },
  async forUrl(url: string) {
    return { status: "found", githubLogin: null, profile: profileOf(url) };
  },
} as unknown as LinkedinFinder;

const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
});

function setup() {
  const store = new Store(":memory:");
  stores.push(store);
  const ogDir = join(mkdtempSync(join(tmpdir(), "tys-bands-auto-")), "og");
  mkdirSync(ogDir);
  const { app, pipeline } = createApp({
    store,
    deps,
    githubToken: "t",
    baseUrl: BASE,
    ogDir,
    githubAuth: { clientId: "gh-client", clientSecret: "x", sessionSecret: SECRET },
    linkedinProfiles,
  });
  return { app, pipeline, store };
}

type Ctx = ReturnType<typeof setup>;

/** Fait une fiche par la porte du site, et attend qu'elle soit posée (l'entrée d'office comprise). */
async function make(ctx: Ctx, payload: Record<string, unknown>, headers: Record<string, string> = {}) {
  const res = await ctx.app.request("/api/card", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": IP, ...headers },
    body: JSON.stringify({ lang: "fr", ...payload }),
  });
  const json = (await res.json()) as { id: string; deleteToken?: string };
  if (json.id) await ctx.pipeline.wait(json.id);
  // L'entrée d'office suit la fin du calcul d'un tour de microtâches.
  await new Promise((r) => setTimeout(r, 0));
  return { status: res.status, id: json.id, token: json.deleteToken ?? null };
}

async function api<T>(ctx: Ctx, path: string, o: { body?: unknown; token?: string | null; ip?: string } = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": o.ip ?? IP };
  if (o.token) headers["x-card-token"] = o.token;
  if (o.body !== undefined) headers["content-type"] = "application/json";
  const res = await ctx.app.request(path, { method: o.body !== undefined ? "POST" : "GET", headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
  return { status: res.status, json: (await res.json().catch(() => null)) as T & { code?: string } };
}

const members = (store: Store) =>
  store.db.prepare(`SELECT person_key AS person, kind, band_id AS band, card_id AS card, stars FROM band_members ORDER BY person_key, kind`).all() as {
    person: string;
    kind: string;
    band: string;
    card: string;
    stars: number;
  }[];

let seq = 0;
/** Une fiche posée directement en base, jeton `tok-{id}`. */
function insert(store: Store, o: { login?: string | null; school?: string; club?: string | null; degraded?: boolean; createdAt?: number; linkedinUrl?: string; overall?: number } = {}): string {
  const id = `Auto${String(++seq).padStart(6, "0")}`;
  const createdAt = o.createdAt ?? Date.now();
  const login = o.login === undefined ? `auto${seq}` : o.login;
  const { login: _l, ...base } = FIXTURES.gold;
  const data: CardData = {
    ...base,
    id,
    createdAt: new Date(createdAt).toISOString(),
    overall: o.overall ?? 65,
    club: o.club === undefined ? "Doctolib" : o.club,
    ...(login ? { login } : {}),
    ...(o.school ? { school: o.school } : {}),
    ...(o.linkedinUrl ? { linkedinUrl: o.linkedinUrl } : {}),
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

describe("la fiche que sa personne fait elle-même", () => {
  it("une fiche LinkedIn entre dans la bande de son école et de son employeur actuel", async () => {
    const ctx = setup();
    const made = await make(ctx, { linkedin: LINKEDIN });
    expect(made.status).toBe(202);
    expect(members(ctx.store)).toEqual([
      { person: `li:${LINKEDIN}`, kind: "boite", band: "doctolib", card: made.id, stars: starsOfRow(ctx.store.getCard(made.id)!) },
      { person: `li:${LINKEDIN}`, kind: "ecole", band: "centrale-mediterranee", card: made.id, stars: starsOfRow(ctx.store.getCard(made.id)!) },
    ]);
    // Sous sa fiche, la personne arrive sur ses bandes déjà remplies.
    const mine = await api<MyBands>(ctx, `/api/card/${made.id}/bands`, { token: made.token });
    expect(mine.json.ecole).toMatchObject({ id: "centrale-mediterranee", label: "Centrale Méditerranée", members: 1 });
    expect(mine.json.boite).toMatchObject({ id: "doctolib", label: "Doctolib", members: 1 });
    expect(ctx.store.listEvents("band_join")).toMatchObject([
      { cardId: made.id, meta: { type: "ecole", auto: true } },
      { cardId: made.id, meta: { type: "boite", auto: true } },
    ]);
    // Le rang d'école du barème n'y est nulle part.
    expect(JSON.stringify(mine.json)).not.toMatch(/rang [SABC]|tier/);
  });

  it("une fiche GitHub entre dans la boîte du champ « company » du profil ; pas d'école", async () => {
    const ctx = setup();
    const made = await make(ctx, { login: "leamd" });
    expect(members(ctx.store)).toMatchObject([{ person: "gh:leamd", kind: "boite", band: "qonto", card: made.id }]);
    const mine = await api<MyBands>(ctx, `/api/card/${made.id}/bands`, { token: made.token });
    expect(mine.json.boite).toMatchObject({ id: "qonto", label: "Qonto" });
    expect(mine.json.ecole).toBeNull();
  });

  it("un champ « company » qui n'est pas une boîte ne fait entrer nulle part", async () => {
    const ctx = setup();
    for (const login of ["sans-boite", "indep", "grossier", "contact"]) await make(ctx, { login });
    expect(members(ctx.store)).toEqual([]);
  });

  it("la limite de trois entrées par jour et par IP n'est pas entamée", async () => {
    const ctx = setup();
    const made = await make(ctx, { linkedin: LINKEDIN });
    expect(members(ctx.store)).toHaveLength(2);
    const move = (id: string) => api<MyBands>(ctx, "/api/bands/join", { body: { cardId: made.id, type: "ecole", id }, token: made.token });
    // Les trois changements à la main du jour restent entiers ; le quatrième est refusé.
    expect((await move("epitech")).status).toBe(200);
    expect((await move("epita")).status).toBe(200);
    expect((await move("efrei")).status).toBe(200);
    expect((await move("esiea")).status).toBe(429);
  });

  it("sortir marche, et la sortie tient : une fiche refaite ne rouvre pas la ligue quittée", async () => {
    const ctx = setup();
    const made = await make(ctx, { linkedin: LINKEDIN });
    const out = await api<MyBands>(ctx, "/api/bands/leave", { body: { cardId: made.id, type: "ecole" }, token: made.token });
    expect(out.status).toBe(200);
    expect(out.json.ecole).toBeNull();
    expect(out.json.boite).toMatchObject({ id: "doctolib" });
    expect(bandStanding(ctx.store.db, "ecole", "centrale-mediterranee")!.members).toBe(0);
    // La même personne refait sa fiche : l'école reste quittée, la boîte reste tenue.
    const again = insert(ctx.store, { login: null, linkedinUrl: LINKEDIN, school: "centrale-mediterranee" });
    expect(autoJoinBands(ctx.store, ctx.store.getCard(again)!)).toEqual([]);
    expect(members(ctx.store)).toMatchObject([{ kind: "boite", band: "doctolib", card: again }]);
    // Y revenir à la main efface la sortie.
    const back = await api<MyBands>(ctx, "/api/bands/join", { body: { cardId: again, type: "ecole", id: "centrale-mediterranee" }, token: `tok-${again}` });
    expect(back.json.ecole).toMatchObject({ id: "centrale-mediterranee", members: 1 });
    expect(ctx.store.db.prepare(`SELECT COUNT(*) AS n FROM band_optouts`).get()).toEqual({ n: 0 });
  });

  it("supprimer la fiche emporte aussi la sortie retenue", async () => {
    const ctx = setup();
    const id = insert(ctx.store, { school: "epitech" });
    const row = ctx.store.getCard(id)!;
    autoJoinBands(ctx.store, row);
    leaveBand(ctx.store, row, "ecole");
    expect(ctx.store.db.prepare(`SELECT COUNT(*) AS n FROM band_optouts`).get()).toEqual({ n: 1 });
    expect((await ctx.app.request(`/api/card/${id}?token=tok-${id}`, { method: "DELETE" })).status).toBe(200);
    expect(ctx.store.db.prepare(`SELECT COUNT(*) AS n FROM band_optouts`).get()).toEqual({ n: 0 });
    expect(members(ctx.store)).toEqual([]);
  });
});

describe("ce que l'entrée d'office ne fait pas", () => {
  it("une bande choisie à la main n'est pas remplacée ; la fiche neuve y rapporte ses étoiles", () => {
    const ctx = setup();
    const first = insert(ctx.store, { login: "leamd", club: null });
    joinBand(ctx.store, ctx.store.getCard(first)!, { type: "ecole", id: "epita", label: "EPITA" });
    const next = insert(ctx.store, { login: "leamd", school: "epitech", club: "Doctolib", overall: 92 });
    expect(autoJoinBands(ctx.store, ctx.store.getCard(next)!)).toEqual(["boite"]);
    expect(members(ctx.store)).toEqual([
      { person: "gh:leamd", kind: "boite", band: "doctolib", card: next, stars: 6 },
      { person: "gh:leamd", kind: "ecole", band: "epita", card: next, stars: 6 },
    ]);
    // Deux fois de suite : rien de plus.
    expect(autoJoinBands(ctx.store, ctx.store.getCard(next)!)).toEqual([]);
    expect(ctx.store.listEvents("band_join")).toHaveLength(1);
  });

  it("une fiche née d'une dénonciation entre dès sa sortie, comme les autres (§18.119)", async () => {
    const ctx = setup();
    const by = await make(ctx, { login: "sans-boite" });
    const tip = await make(ctx, { login: "leamd", denouncedBy: by.id });
    expect(tip.status).toBe(202);
    expect(ctx.store.getCard(tip.id)!.denounceBorn).toBe(true);
    expect(members(ctx.store)).toMatchObject([{ person: "gh:leamd", kind: "boite", band: "qonto", card: tip.id }]);
    // Revendiquée par sa personne : rien de plus, elle y est déjà.
    ctx.store.claimOwner("leamd", 42);
    expect(autoJoinBands(ctx.store, ctx.store.getCard(tip.id)!)).toEqual([]);
    expect(members(ctx.store)).toHaveLength(1);
  });

  it("une fiche sans lecture IA, expirée ou masquée n'entre jamais", () => {
    const ctx = setup();
    const degraded = insert(ctx.store, { school: "epitech", degraded: true });
    const expired = insert(ctx.store, { school: "epitech", createdAt: Date.now() - RETENTION_MS - 1000 });
    const hidden = insert(ctx.store, { login: "cache", school: "epitech" });
    ctx.store.claimOwner("cache", 7);
    ctx.store.setOwnerHidden("cache", true);
    for (const id of [degraded, expired, hidden]) expect(autoJoinBands(ctx.store, ctx.store.getCard(id)!)).toEqual([]);
    expect(members(ctx.store)).toEqual([]);
  });
});

describe("un dossier à deux pièces : une personne, une entrée", () => {
  it("« Ajoute ton GitHub » depuis sa fiche LinkedIn : ses bandes suivent, avec les étoiles du dossier", async () => {
    const ctx = setup();
    const li = await make(ctx, { linkedin: LINKEDIN });
    // Elle avait choisi son école à la main : le dossier la garde.
    await api<MyBands>(ctx, "/api/bands/join", { body: { cardId: li.id, type: "ecole", id: "epita" }, token: li.token });
    const dossier = await make(ctx, { login: "leamd", linkedin: LINKEDIN, from: li.id }, { "x-card-token": li.token! });
    expect(dossier.status).toBe(202);
    const root = ctx.store.getCard(dossier.id)!;
    expect(root.kind).toBe("comparison");
    const stars = starsOfRow(root);
    expect(members(ctx.store)).toEqual([
      { person: "gh:leamd", kind: "boite", band: "doctolib", card: dossier.id, stars },
      { person: "gh:leamd", kind: "ecole", band: "epita", card: dossier.id, stars },
    ]);
    expect(bandStanding(ctx.store.db, "boite", "doctolib")).toMatchObject({ members: 1, score: stars });
    // Une personne, une note (SPEC §18.84) : l'adresse de sa fiche LinkedIn sert maintenant son dossier.
    expect(ctx.store.fileRow(li.id)!.id).toBe(dossier.id);
    // Sa fiche GitHub refaite seule ne prend pas la place du dossier.
    const alone = insert(ctx.store, { login: "leamd", overall: 20 });
    autoJoinBands(ctx.store, ctx.store.getCard(alone)!);
    expect(members(ctx.store).map((m) => [m.card, m.stars])).toEqual([
      [dossier.id, stars],
      [dossier.id, stars],
    ]);
  });

  it("sans le jeton de la fiche complétée, rien ne lui est pris", async () => {
    const ctx = setup();
    const li = await make(ctx, { linkedin: LINKEDIN });
    await make(ctx, { login: "leamd", linkedin: LINKEDIN, from: li.id }, { "x-card-token": "pas-le-bon" });
    // Ni son adresse : la fiche reste la sienne.
    expect(ctx.store.fileRow(li.id)!.id).toBe(li.id);
    expect(members(ctx.store).filter((m) => m.person === `li:${LINKEDIN}`)).toMatchObject([
      { kind: "boite", band: "doctolib", card: li.id },
      { kind: "ecole", band: "centrale-mediterranee", card: li.id },
    ]);
  });
});

describe("le coloris de la fiche (§18.102)", () => {
  const colorOf = (store: Store, id: string) => {
    const row = store.getCard(id)!;
    return row.kind === "comparison" ? fileOf(row.data as ComparisonData).colorway : (row.data as CardData).colorway;
  };

  it("une fiche naît avec un coloris rangé, que la page relit tel quel", async () => {
    const ctx = setup();
    const li = await make(ctx, { linkedin: LINKEDIN });
    const cw = colorOf(ctx.store, li.id);
    expect(isColorway(cw)).toBe(true);
    const page = await api<{ card: CardData }>(ctx, `/api/card/${li.id}`);
    expect(page.json.card.colorway).toBe(cw);
  });

  it("le dossier qui complète sa fiche garde sa couleur ; sans le jeton, il a la sienne", async () => {
    const ctx = setup();
    const li = await make(ctx, { linkedin: LINKEDIN });
    const before = colorOf(ctx.store, li.id);
    const dossier = await make(ctx, { login: "leamd", linkedin: LINKEDIN, from: li.id }, { "x-card-token": li.token! });
    expect(colorOf(ctx.store, dossier.id)).toBe(before);
    // Sans le jeton, rien n'est repris : le dossier tire son coloris (douze tirages, au moins un autre).
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const c = setup();
      const l = await make(c, { linkedin: LINKEDIN });
      const other = await make(c, { login: "leamd", linkedin: LINKEDIN, from: l.id }, { "x-card-token": "pas-le-bon" });
      seen.add(`${colorOf(c.store, l.id)}>${colorOf(c.store, other.id)}`);
    }
    expect([...seen].some((s) => s.split(">")[0] !== s.split(">")[1])).toBe(true);
  });
});
