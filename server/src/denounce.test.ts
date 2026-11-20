// « Dénonce un complice » (§18.6) et la page partagée (§18.7), avec un moteur factice.

import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURES } from "../../shared/fixtures";
import { aliasFor } from "../../shared/punchline";
import type { CardData } from "../../shared/types";
import { createApp } from "./app";
import { SESSION_COOKIE, signSession } from "./auth";
import { migrate, Store } from "./db";
import { DENOUNCE_PER_DAY } from "./denounce";
import type { LinkedinFinder } from "./linkedinProfile/index";
import type { CardBody, Deps, PipelineOptions } from "./pipeline";
import { enteringRootIds } from "./top";
import { fakeDossier } from "./__fixtures__/fakeDossier";

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
  // Le chemin LinkedIn (dénoncer par un lien de profil, §18.48) : une fiche déclarée figée.
  cvTextCounts: () => ({ words: 80, pages: 1, buzzwords: {}, buzzwordsPer100: 0, passionCount: 0 }),
  async readCv() {
    return { language: "fr", position: "FS", full_name: "Camille Ardent", is_dev_profile: true, roles: [], technos_listed: [], technos_described: [] };
  },
  scoreCv(_r: unknown, _c: unknown, { lang, judgedInSeconds }: { lang: "fr" | "en"; judgedInSeconds: number }) {
    return { ...body(FIXTURES.cv), lang, judgedInSeconds };
  },
  // Le dossier LinkedIn + GitHub d'une dénonciation qui trouve son GitHub (§18.121).
  scoreDossier(declared: Parameters<Deps["scoreDossier"]>[0], github: Parameters<Deps["scoreDossier"]>[1], o: Parameters<Deps["scoreDossier"]>[2]) {
    return fakeDossier(deps, declared, github, o);
  },
} as unknown as Deps;

const LINKEDIN = "https://www.linkedin.com/in/camille-ardent";
/** Un lecteur de profils factice : tout lien donne le même profil, sans GitHub relié. */
const linkedinProfiles: LinkedinFinder = {
  async forGithub() {
    return null;
  },
  async forUrl(url) {
    return {
      status: "found",
      githubLogin: null,
      profile: { url, name: "Camille Ardent", headline: "Dev", title: "Dev", summary: "", roles: [], education: [], skills: [] },
    };
  },
};

const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
});

function setup(opt: { linkedin?: boolean; propose?: PipelineOptions["propose"] } = {}) {
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
    ...(opt.linkedin ? { linkedinProfiles } : {}),
    ...(opt.propose ? { propose: opt.propose } : {}),
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
  const json = (await res.json()) as { id: string; deleteToken?: string; code?: string; message?: { fr: string } };
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

  it("denounce_born : née d'une dénonciation si son événement précède sa création, sinon dénoncée depuis le cache", () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE cards (id TEXT PRIMARY KEY, parent_id TEXT, created_at INTEGER NOT NULL, source TEXT NOT NULL, login TEXT,
      kind TEXT NOT NULL, json TEXT NOT NULL, facts_json TEXT, email TEXT, delete_token TEXT NOT NULL, expires_at INTEGER,
      denounced_by TEXT, denouncer_login TEXT);
      CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, event TEXT NOT NULL, card_id TEXT, meta TEXT);`);
    const card = db.prepare(`INSERT INTO cards (id, created_at, source, login, kind, json, delete_token, denounced_by) VALUES (?, 1000, 'github', ?, 'card', '{}', 't', ?)`);
    card.run("BornCard01", "a", "Snitch0001");
    card.run("LateCard01", "b", "Snitch0001");
    card.run("NoTrace001", "c", "Snitch0001");
    card.run("PlainCard1", "d", null);
    const ev = db.prepare(`INSERT INTO events (at, event, card_id) VALUES (?, 'denounce_sent', ?)`);
    ev.run(990, "BornCard01");
    ev.run(5000, "LateCard01");
    migrate(db);
    migrate(db);
    expect(db.prepare(`SELECT id, denounce_born FROM cards ORDER BY id`).all()).toEqual([
      { id: "BornCard01", denounce_born: 1 },
      { id: "LateCard01", denounce_born: 0 },
      { id: "NoTrace001", denounce_born: 1 },
      { id: "PlainCard1", denounce_born: 0 },
    ]);
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

  it("une fiche déjà faite, dénoncée ensuite : dite dénoncée, mais sa personne garde ses droits", async () => {
    const ctx = setup();
    const a = await post(ctx, { login: "leamd" });
    const own = await post(ctx, { login: "camroux" });
    const born = await post(ctx, { login: "jplefevre", denouncedBy: a.json.id });
    await post(ctx, { login: "camroux", denouncedBy: a.json.id });
    const row = ctx.store.getCard(own.json.id)!;
    expect(row).toMatchObject({ denouncedBy: a.json.id, denounceBorn: false });
    expect(ctx.store.getCard(born.json.id)).toMatchObject({ denouncedBy: a.json.id, denounceBorn: true });
    expect((await getCase(ctx, own.json.id)).json.denounced).toBe(true);
    // Le jeton de la personne qui a fait la fiche vaut toujours : elle entre dans une bande.
    const join = (id: string, token: string) =>
      ctx.app.request("/api/bands/join", {
        method: "POST",
        headers: { "content-type": "application/json", "x-card-token": token, "x-forwarded-for": "198.51.100.9" },
        body: JSON.stringify({ cardId: id, type: "ecole", id: "epitech" }),
      });
    expect((await join(own.json.id, own.json.deleteToken!)).status).toBe(200);
    // Le jeton d'une fiche née d'une dénonciation est au dénonciateur : refusé.
    expect((await join(born.json.id, born.json.deleteToken!)).status).toBe(403);
  });

  it("par un lien LinkedIn, quand le serveur sait lire LinkedIn : la fiche naît dénoncée, le cache aussi la marque (§18.48)", async () => {
    const ctx = setup({ linkedin: true });
    const mine = await post(ctx, { login: "leamd" });
    const r = await post(ctx, { linkedin: `${LINKEDIN}/?trk=x`, denouncedBy: mine.json.id });
    expect(r.status).toBe(202);
    // La marque suit la fin du calcul d'un tour de boucle (le moteur factice finit avant la réponse).
    await new Promise((res) => setTimeout(res, 0));
    const row = ctx.store.getCard(r.json.id)!;
    expect(row).toMatchObject({ source: "linkedin", denouncedBy: mine.json.id, denounceBorn: true });
    expect((await getCase(ctx, r.json.id)).json).toMatchObject({ denounced: true, by: null });
    expect(ctx.store.listEvents("denounce_sent")).toMatchObject([{ cardId: r.json.id, meta: { by: mine.json.id } }]);
    // Le champ unique envoie aussi le lien dans `login` : même chemin.
    const again = await post(ctx, { login: "linkedin.com/in/camille-ardent", denouncedBy: mine.json.id });
    expect(again.status).toBe(200);
    expect(again.json.id).toBe(r.json.id);
    expect(ctx.store.listEvents("denounce_sent")).toHaveLength(2);
  });

  it("par un lien LinkedIn, avec le nom de la suggestion : son GitHub est cherché à ce nom et attaché, le dossier prouvé entre au top (§18.121)", async () => {
    const searched: string[] = [];
    const ctx = setup({
      linkedin: true,
      propose: {
        githubAccounts: async (name) => {
          searched.push(name);
          // Ce LinkedIn sur son GitHub : le lien est sûr.
          const camille = { login: "camille-ardent", name: "Camille Ardent", avatarUrl: "", bio: null, company: null, websiteUrl: null, socialAccounts: [{ provider: "LINKEDIN", url: LINKEDIN }] };
          return { accounts: [camille], namesakes: 1 };
        },
      },
    });
    const mine = await post(ctx, { login: "leamd" });
    const r = await post(ctx, { linkedin: LINKEDIN, name: "Camille Ardent", denouncedBy: mine.json.id });
    expect(r.status).toBe(202);
    await new Promise((res) => setTimeout(res, 0));
    expect(searched).toEqual(["Camille Ardent"]);
    const row = ctx.store.getCard(r.json.id)!;
    expect(row).toMatchObject({ kind: "comparison", source: "linkedin", login: "camille-ardent", denounceBorn: true });
    expect(row.facts).toMatchObject({ linkedinProven: true });
    expect(enteringRootIds(ctx.store.db)).toContain(r.json.id);
    // Une fiche faite pour soi ne cherche pas ainsi.
    const own = await post(ctx, { linkedin: "https://www.linkedin.com/in/lea-md", name: "Léa Martin" });
    expect(ctx.store.getCard(own.json.id)).toMatchObject({ kind: "card", source: "linkedin" });
    expect(searched).toHaveLength(1);
  });

  it("par un lien LinkedIn : une fiche déjà faite par sa personne est dite dénoncée, pas reprise ; son propre lien n'est pas une dénonciation", async () => {
    const ctx = setup({ linkedin: true });
    const own = await post(ctx, { linkedin: LINKEDIN });
    expect(own.status).toBe(202);
    // Sa propre fiche LinkedIn, passée en denouncedBy avec son propre lien : rien.
    const self = await post(ctx, { linkedin: LINKEDIN, denouncedBy: own.json.id });
    expect(self.json.id).toBe(own.json.id);
    expect(ctx.store.getCard(own.json.id)!.denouncedBy).toBeNull();
    const snitch = await post(ctx, { login: "leamd" });
    const r = await post(ctx, { linkedin: LINKEDIN, denouncedBy: snitch.json.id });
    expect(r.json.id).toBe(own.json.id);
    expect(ctx.store.getCard(own.json.id)).toMatchObject({ denouncedBy: snitch.json.id, denounceBorn: false });
  });

  it("sans lecteur de profils, un lien LinkedIn est refusé, dénonciation ou non", async () => {
    const ctx = setup();
    const mine = await post(ctx, { login: "leamd" });
    const r = await post(ctx, { linkedin: LINKEDIN, denouncedBy: mine.json.id });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("linkedin");
    expect(ctx.store.listEvents("denounce_sent")).toHaveLength(0);
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
    // Un même navigateur tout du long : les dénonciations n'entament pas sa limite de fiches (§18.48).
    const nav = { "x-browser-id": "navigateur-denonce-0123456789" };
    const mine = await post(ctx, { login: "leamd" }, nav);
    for (let i = 0; i < DENOUNCE_PER_DAY; i++) {
      expect((await post(ctx, { login: `suspect-${i}`, denouncedBy: mine.json.id }, nav)).status).toBe(202);
    }
    const over = await post(ctx, { login: "suspect-de-trop", denouncedBy: mine.json.id }, nav);
    expect(over.status).toBe(429);
    expect(over.json.code).toBe("rate_limited");
    expect(over.json.message?.fr).toMatch(/Dix dénonciations/);
    // Une autre IP peut encore dénoncer, et la même IP peut encore faire une fiche normale.
    expect((await post(ctx, { login: "suspect-autre-ip", denouncedBy: mine.json.id }, { "x-forwarded-for": "198.51.100.8", ...nav })).status).toBe(202);
    expect((await post(ctx, { login: "suspect-normal" }, nav)).status).toBe(202);
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
  it("« @X est dans le viseur ★★★★★☆, {profil} »", async () => {
    const ctx = setup();
    const { json } = await post(ctx, { login: "leamd" });
    const html = await (await ctx.app.request(`/c/${json.id}`)).text();
    // Le nom du profil propre à la fiche (§18.107), tiré par son id.
    expect(html).toContain(`<meta property="og:title" content="@leamd est dans le viseur ★★★★★☆, ${aliasFor(FIXTURES.gold.profile!.id, json.id)!.fr}">`);
  });
});
