// Les primes (§18.4, §18.5) : rien sans prime, inscription, classement sans bonus,
// retrait, données privées, purge. Entreprises inventées, moteur factice.

import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURES } from "../../shared/fixtures";
import type { PrimeMe, PrimePageData, Race } from "../../shared/primes";
import type { Prime, Season } from "../../shared/season";
import type { CardData } from "../../shared/types";
import { createApp, purge } from "./app";
import { SESSION_COOKIE, signSession } from "./auth";
import { Store } from "./db";
import type { Deps } from "./pipeline";
import { purgeEntries } from "./primes";
import { publicRules, RULES_MARK } from "./rules";

const BASE = "https://skills.test";
const SECRET = "s".repeat(40);
const DAY = 24 * 3600 * 1000;
const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

const deps = {
  aiAvailable: () => true,
  async renderImage() {
    return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  },
} as unknown as Deps;

const prime = (over: Partial<Prime> = {}): Prime => ({
  id: "demo-stage",
  company: "Entreprise Démo",
  contract: "stage",
  positions: ["BE", "FS"],
  languages: ["Go"],
  interviews: 2,
  place: "Ville Démo",
  remote: false,
  pitch: { fr: "Démo.", en: "Demo." },
  ...over,
});

const seasonWith = (primes: Prime[], extra: Partial<Season> = {}): Season => ({ number: 1, start: day(-30), end: day(60), primes, rulesPublished: false, ...extra });

const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
});

function setup(season: Season | null = seasonWith([prime()]), rules: string | null = null) {
  const store = new Store(":memory:");
  stores.push(store);
  const ogDir = join(mkdtempSync(join(tmpdir(), "tys-primes-")), "og");
  mkdirSync(ogDir);
  const { app } = createApp({ store, deps, githubToken: "t", baseUrl: BASE, ogDir, season, rules, githubAuth: { clientId: "c", clientSecret: "x", sessionSecret: SECRET } });
  return { app, store, ogDir };
}
type Ctx = ReturnType<typeof setup>;

let seq = 0;
interface CardOpts {
  login?: string | null;
  overall?: number;
  reliability?: number;
  position?: CardData["position"];
  createdAt?: number;
  degraded?: boolean;
  linkedinUrl?: string;
}
function insert(store: Store, o: CardOpts = {}): string {
  const id = `Prim${String(++seq).padStart(6, "0")}`;
  const createdAt = o.createdAt ?? Date.now() - 1000;
  const login = o.login === undefined ? `dev${seq}` : o.login;
  const { login: _l, ...base } = FIXTURES.gold;
  const data: CardData = {
    ...base,
    id,
    createdAt: new Date(createdAt).toISOString(),
    overall: o.overall ?? 60,
    reliability: o.reliability ?? 80,
    position: o.position ?? "BE",
    ...(login ? { login } : {}),
    ...(o.linkedinUrl ? { linkedinUrl: o.linkedinUrl, declaredSource: "linkedin" as const, source: "cv" as const } : {}),
  };
  store.insertCards([{ id, createdAt, source: o.linkedinUrl ? "linkedin" : "github", login, kind: "card", data, deleteToken: `tok-${id}`, degraded: o.degraded }]);
  return id;
}

let gh = 100;
/** Une personne qui a revendiqué sa fiche, et le cookie de sa session. */
function owner(store: Store, login: string) {
  const o = store.claimOwner(login, ++gh);
  return { cookie: `${SESSION_COOKIE}=${encodeURIComponent(signSession(SECRET, { login: o.login, githubId: o.githubId }))}` };
}

async function call<T>(ctx: Ctx, path: string, init: { body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": "198.51.100.9", ...(init.headers ?? {}) };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  const res = await ctx.app.request(path, { method: init.body !== undefined ? "POST" : "GET", headers, body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* page */
  }
  return { status: res.status, text, json: json as T & { code?: string }, headers: res.headers };
}

const OK_BODY = { email: "dev@exemple.dev", consent: true, adult: true, placeOk: true, proofs: ["https://exemple.dev/projet"] };
const join_ = (ctx: Ctx, cookie: { cookie: string }, body: Record<string, unknown> = OK_BODY, id = "demo-stage") => call<PrimeMe>(ctx, `/api/primes/${id}/join`, { body, headers: cookie });

/** Inscrit un login avec une fiche. */
async function enter(ctx: Ctx, login: string, o: CardOpts = {}) {
  insert(ctx.store, { ...o, login });
  const r = await join_(ctx, owner(ctx.store, login));
  expect(r.status).toBe(200);
  return r.json;
}

describe("sans prime, rien ne change", () => {
  for (const season of [seasonWith([]), null]) {
    it(`saison ${season ? "sans prime" : "absente"} : ni page, ni route, ni collecte`, async () => {
      const ctx = setup(season);
      const cfg = (await call<Record<string, unknown>>(ctx, "/api/config")).json;
      expect(cfg).toMatchObject({ primesOpen: false, primesListed: false, rulesPublished: false });
      expect((await call<{ primes: unknown[] }>(ctx, "/api/primes")).json.primes).toEqual([]);
      for (const p of ["/primes", "/primes/demo-stage"]) {
        const r = await ctx.app.request(p);
        expect(r.status).toBe(302);
        expect(r.headers.get("location")).toBe("/");
      }
      expect((await ctx.app.request("/reglement")).status).toBe(404);
      expect((await call(ctx, "/api/rules")).status).toBe(404);
      expect((await call(ctx, "/api/primes/demo-stage")).status).toBe(404);
      const id = insert(ctx.store, { login: "solo" });
      expect((await join_(ctx, owner(ctx.store, "solo"))).status).toBe(404);
      expect((await call<Race>(ctx, `/api/card/${id}/race?league=stage`)).json).toEqual({ needsGithub: false, degraded: false, lines: [] });
      expect(ctx.store.db.prepare(`SELECT COUNT(*) AS n FROM entries`).get()).toEqual({ n: 0 });
    });
  }
});

describe("concourir", () => {
  it("demande la revendication, l'accord, la majorité, un email et la réponse au lieu", async () => {
    const ctx = setup();
    insert(ctx.store, { login: "lea" });
    expect((await call(ctx, "/api/primes/demo-stage/join", { body: OK_BODY })).json.code).toBe("claim");
    const me = owner(ctx.store, "lea");
    expect((await join_(ctx, me, { ...OK_BODY, consent: false })).json.code).toBe("consent");
    expect((await join_(ctx, me, { ...OK_BODY, adult: undefined })).json.code).toBe("adult");
    expect((await join_(ctx, me, { ...OK_BODY, email: "pas-un-email" })).json.code).toBe("email");
    expect((await join_(ctx, me, { ...OK_BODY, placeOk: undefined })).json.code).toBe("place");
    expect((await join_(ctx, me, { ...OK_BODY, proofs: ["javascript:alert(1)"] })).json.code).toBe("proofs");
    expect((await call(ctx, "/api/primes/demo-stage/join", { body: OK_BODY, headers: { ...me, origin: "https://ailleurs.test" } })).status).toBe(403);
    // Répondre non au lieu ne bloque pas : la réponse sert à la relecture, jamais au rang.
    const ok = await join_(ctx, me, { ...OK_BODY, placeOk: false });
    expect(ok.status).toBe(200);
    expect(ok.json.entry).toMatchObject({ rank: 1, total: 1, state: "racing" });
    expect(ctx.store.listEvents("prime_join")).toHaveLength(1);
  });

  it("le poste de la fiche doit être visé ; une fiche sans lecture ne concourt pas", async () => {
    const ctx = setup();
    insert(ctx.store, { login: "front", position: "FE" });
    expect((await join_(ctx, owner(ctx.store, "front"))).json.code).toBe("position");
    insert(ctx.store, { login: "brut", degraded: true });
    expect((await join_(ctx, owner(ctx.store, "brut"))).json.code).toBe("degraded");
    expect((await join_(ctx, owner(ctx.store, "rien"))).json.code).toBe("nocard");
  });

  it("une prime close ou à venir refuse l'inscription", async () => {
    const ctx = setup(seasonWith([prime({ id: "close", from: day(-20), to: day(-2) }), prime({ id: "plus-tard", from: day(5) })]));
    insert(ctx.store, { login: "tard" });
    const me = owner(ctx.store, "tard");
    expect((await join_(ctx, me, OK_BODY, "close")).json.code).toBe("closed");
    expect((await join_(ctx, me, OK_BODY, "plus-tard")).json.code).toBe("closed");
    expect((await call<PrimeMe>(ctx, "/api/primes/close/me", { headers: me })).json.gate).toBe("closed");
  });

  it("une candidature par prime : se réinscrire met à jour, sans doublon", async () => {
    const ctx = setup();
    insert(ctx.store, { login: "deux" });
    const me = owner(ctx.store, "deux");
    await join_(ctx, me);
    await join_(ctx, me, { ...OK_BODY, email: "autre@exemple.dev" });
    expect(ctx.store.db.prepare(`SELECT COUNT(*) AS n, MAX(email) AS e FROM entries`).get()).toEqual({ n: 1, e: "autre@exemple.dev" });
  });
});

describe("le classement", () => {
  it("la note seule, puis la fiabilité, puis l'inscription ; langages et lieu sans effet", async () => {
    const ctx = setup();
    await enter(ctx, "b", { overall: 70, reliability: 60 });
    await enter(ctx, "a", { overall: 72, reliability: 10 });
    await enter(ctx, "c", { overall: 70, reliability: 90 });
    await enter(ctx, "d", { overall: 70, reliability: 60 });
    const page = (await call<PrimePageData>(ctx, "/api/primes/demo-stage")).json;
    expect(page.board.map((r) => [r.rank, r.login])).toEqual([[1, "a"], [2, "c"], [3, "b"], [4, "d"]]);
    expect(page.total).toBe(4);
    expect(page.prime).toMatchObject({ company: "Entreprise Démo", phase: "open", entrants: 4 });
  });

  it("la dernière fiche compte ; une fiche faite après la clôture non", async () => {
    const ctx = setup(seasonWith([prime({ to: day(-1) })]));
    insert(ctx.store, { login: "x", overall: 50, createdAt: Date.now() - 5 * DAY });
    // Inscription posée à la main : la prime est déjà close.
    ctx.store.claimOwner("x", 9);
    ctx.store.db
      .prepare(`INSERT INTO entries (login, prime_id, card_id, contract, email, consent_at, adult, score, reliability, joined_at) VALUES ('x', 'demo-stage', 'none', 'stage', 'x@exemple.dev', 0, 1, 50, 80, 0)`)
      .run();
    insert(ctx.store, { login: "x", overall: 95 });
    const page = (await call<PrimePageData>(ctx, "/api/primes/demo-stage")).json;
    expect(page.board[0]).toMatchObject({ login: "x", overall: 50 });
    expect(page.prime.phase).toBe("closed");
  });

  it("le rang qu'on aurait, sous la fiche, et le rang réel une fois inscrit", async () => {
    const ctx = setup();
    await enter(ctx, "haut", { overall: 80 });
    await enter(ctx, "bas", { overall: 40 });
    const id = insert(ctx.store, { login: "moi", overall: 60 });
    const anon = (await call<Race>(ctx, `/api/card/${id}/race?league=stage`)).json;
    expect(anon.lines).toHaveLength(1);
    expect(anon.lines[0]).toMatchObject({ rank: 2, total: 3, entered: false, gate: "claim" });
    const me = owner(ctx.store, "moi");
    expect((await call<Race>(ctx, `/api/card/${id}/race?league=stage`, { headers: me })).json.lines[0]!.gate).toBe("ok");
    await join_(ctx, me);
    expect((await call<Race>(ctx, `/api/card/${id}/race?league=stage`, { headers: me })).json.lines[0]).toMatchObject({ rank: 2, total: 3, entered: true });
    // Autre ligue, ou pour le fun : rien.
    expect((await call<Race>(ctx, `/api/card/${id}/race?league=cdi`)).json.lines).toEqual([]);
    expect((await call<Race>(ctx, `/api/card/${id}/race?league=fun`)).json.lines).toEqual([]);
  });

  it("une fiche LinkedIn seule : « Ajoute ton GitHub pour concourir »", async () => {
    const ctx = setup();
    const id = insert(ctx.store, { login: null, linkedinUrl: "https://www.linkedin.com/in/demo" });
    expect((await call<Race>(ctx, `/api/card/${id}/race?league=stage`)).json).toEqual({ needsGithub: true, degraded: false, lines: [] });
  });
});

describe("données privées", () => {
  it("l'email et les preuves ne sortent par aucune route", async () => {
    const ctx = setup();
    const id = insert(ctx.store, { login: "discrete" });
    const me = owner(ctx.store, "discrete");
    await join_(ctx, me, { ...OK_BODY, email: "secret-mail@exemple.dev", proofs: ["https://preuve-secrete.dev/x"] });
    for (const path of ["/api/primes", "/api/primes/demo-stage", "/api/primes/demo-stage/me", `/api/card/${id}/race?league=stage`, `/api/card/${id}`]) {
      const r = await call(ctx, path, { headers: me });
      expect(r.text).not.toContain("secret-mail");
      expect(r.text).not.toContain("preuve-secrete");
    }
  });
});

describe("se retirer", () => {
  it("un toucher efface l'inscription", async () => {
    const ctx = setup();
    insert(ctx.store, { login: "parti" });
    const me = owner(ctx.store, "parti");
    await join_(ctx, me);
    const r = await call<PrimeMe>(ctx, "/api/primes/demo-stage/withdraw", { body: {}, headers: me });
    expect(r.json.entry).toBeNull();
    expect(ctx.store.db.prepare(`SELECT COUNT(*) AS n FROM entries`).get()).toEqual({ n: 0 });
    expect(ctx.store.listEvents("prime_withdraw")).toHaveLength(1);
  });

  it("supprimer sa fiche ou la masquer retire l'inscription", async () => {
    const ctx = setup();
    const id = insert(ctx.store, { login: "efface" });
    await join_(ctx, owner(ctx.store, "efface"));
    ctx.store.deleteGroup(id);
    insert(ctx.store, { login: "cache" });
    await join_(ctx, owner(ctx.store, "cache"));
    ctx.store.setOwnerHidden("cache", true);
    expect(ctx.store.db.prepare(`SELECT COUNT(*) AS n FROM entries`).get()).toEqual({ n: 0 });
  });
});

describe("purge", () => {
  it("sans victoire, effacée 30 jours après la fin de la saison", async () => {
    const season = seasonWith([prime()]);
    const ctx = setup(season);
    await enter(ctx, "perdu");
    await enter(ctx, "gagne");
    ctx.store.db.prepare(`UPDATE entries SET state = 'winner' WHERE login = 'gagne'`).run();
    const end = Date.parse(`${season.end}T00:00:00Z`) + DAY;
    expect(purgeEntries(ctx.store.db, season, end + 29 * DAY)).toBe(0);
    await purge(ctx.store, ctx.ogDir, end + 31 * DAY, undefined, season);
    expect(ctx.store.db.prepare(`SELECT login FROM entries`).all()).toEqual([{ login: "gagne" }]);
  });
});

describe("le règlement (/reglement)", () => {
  const RAW = `# À relire\n\nPoint réservé à l'équipe.\n\n${RULES_MARK}\n\n# Règlement\n\nArticle 1.`;

  it("seul le texte après le repère est public", () => {
    expect(publicRules(RAW)).toBe("# Règlement\n\nArticle 1.");
    expect(publicRules("# Sans repère")).toBeNull();
  });

  it("servi seulement quand la saison le publie et que le texte existe", async () => {
    const text = publicRules(RAW);
    // Publié, texte présent : la page passe au front, l'API rend le texte public seul.
    const on = setup(seasonWith([prime()], { rulesPublished: true }), text);
    expect((await call<Record<string, unknown>>(on, "/api/config")).json).toMatchObject({ rulesPublished: true });
    const r = await call<{ lang: string; text: string }>(on, "/api/rules");
    expect(r.status).toBe(200);
    expect(r.json.text).toBe(text);
    expect(r.text).not.toContain("réservé");
    // Publié mais fichier absent : fermé.
    const missing = setup(seasonWith([prime()], { rulesPublished: true }), null);
    expect((await call<Record<string, unknown>>(missing, "/api/config")).json).toMatchObject({ rulesPublished: false });
    expect((await missing.app.request("/Reglement/")).status).toBe(404);
    // Texte présent mais pas publié : fermé.
    const off = setup(seasonWith([prime()]), text);
    expect((await call(off, "/api/rules")).status).toBe(404);
    expect((await off.app.request("/reglement")).status).toBe(404);
  });
});
