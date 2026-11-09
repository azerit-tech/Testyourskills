// « C'est moi » (§18.1) avec un fetch factice pour GitHub : jamais d'appel réseau réel.

import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../../shared/fixtures";
import type { CardData, ComparisonData, JobState } from "../../shared/types";
import { createApp } from "./app";
import { GH_AUTHORIZE_URL, GH_TOKEN_URL, GH_USER_URL, SESSION_COOKIE, SESSION_TTL_MS, STATE_COOKIE, safeReturnPath, signSession, verifySession } from "./auth";
import { Store } from "./db";
import type { CardBody, Deps } from "./pipeline";

const BASE = "https://skills.test";
const SECRET = "s".repeat(40);
const CLIENT_SECRET = "GH-CLIENT-SECRET";
const ACCESS_TOKEN = "gho_SECRET-ACCESS-TOKEN";
const CODE = "OAUTH-CODE-123";

type GhUser = { login: string; id: number };

function fakeFetch(user: () => GhUser | Response, token: () => Response = () => Response.json({ access_token: ACCESS_TOKEN, token_type: "bearer", scope: "" })) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === GH_TOKEN_URL) {
      const body = new URLSearchParams(String(init?.body));
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("accept")).toBe("application/json");
      expect(body.get("client_id")).toBe("gh-client");
      expect(body.get("client_secret")).toBe(CLIENT_SECRET);
      expect(body.get("code")).toBe(CODE);
      expect(body.get("redirect_uri")).toBe(`${BASE}/auth/github/callback`);
      return token();
    }
    if (url === GH_USER_URL) {
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${ACCESS_TOKEN}`);
      const u = user();
      return u instanceof Response ? u : Response.json({ ...u, name: "Léa", public_repos: 3 });
    }
    throw new Error(`appel réseau inattendu : ${url}`);
  });
}

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
  aiAvailable: () => false,
  scoreGithub(facts: unknown, _ai: unknown, { lang, judgedInSeconds }: { lang: "fr" | "en"; judgedInSeconds: number }) {
    return { ...body(FIXTURES.gold), login: (facts as { login: string }).login, lang, judgedInSeconds };
  },
  async renderImage() {
    return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  },
} as unknown as Deps;

const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
  vi.restoreAllMocks();
});

function setup(opts: { user?: () => GhUser | Response; token?: () => Response; configured?: boolean; indexHtml?: () => Promise<string | null> } = {}) {
  const store = new Store(":memory:");
  stores.push(store);
  const ogDir = join(mkdtempSync(join(tmpdir(), "tys-auth-")), "og");
  mkdirSync(ogDir);
  const fetchImpl = fakeFetch(opts.user ?? (() => ({ login: "LeaMD", id: 4242 })), opts.token);
  const { app, pipeline } = createApp({
    store,
    deps,
    githubToken: "t",
    baseUrl: BASE,
    ogDir,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    indexHtml: opts.indexHtml,
    githubAuth: opts.configured === false ? undefined : { clientId: "gh-client", clientSecret: CLIENT_SECRET, sessionSecret: SECRET },
  });
  return { app, pipeline, store, ogDir, fetchImpl };
}
type Ctx = ReturnType<typeof setup>;

function insertCard(store: Store, id = "CardAAAA01", login = "leamd", createdAt = Date.now()): CardData {
  const card: CardData = { ...FIXTURES.gold, id, name: login, login };
  store.insertCards([{ id, createdAt, source: "github", login, kind: "card", data: card, deleteToken: "tok" }]);
  return card;
}

function insertComparison(store: Store, login = "leamd") {
  const gh: CardData = { ...FIXTURES.gold, id: "GhCardAA01", login };
  const cv: CardData = { ...FIXTURES.cv, id: "CvCardAA01" };
  const cmp: ComparisonData = { id: "CompAAAA01", createdAt: gh.createdAt, cv, github: gh, deltas: {} as ComparisonData["deltas"], headline: { fr: "x", en: "x" } };
  const now = Date.now();
  store.insertCards([
    { id: cmp.id, createdAt: now, source: "both", login, kind: "comparison", data: cmp, deleteToken: "tok" },
    { id: cv.id, parentId: cmp.id, createdAt: now, source: "cv", kind: "card", data: cv, deleteToken: "tok" },
    { id: gh.id, parentId: cmp.id, createdAt: now, source: "github", login, kind: "card", data: gh, deleteToken: "tok" },
  ]);
  return cmp;
}

/** Valeur d'un cookie posé par la réponse, ou null ; "" s'il est effacé. */
function cookieOf(res: Response, name: string): { value: string; raw: string } | null {
  const raw = res.headers.getSetCookie().find((h) => h.startsWith(`${name}=`));
  if (!raw) return null;
  return { value: decodeURIComponent(raw.slice(name.length + 1).split(";")[0]!), raw };
}

async function start(ctx: Ctx, qs: string, headers: Record<string, string> = {}) {
  return ctx.app.request(`/auth/github/start?${qs}`, { headers });
}

/** Lance le flux et rend ce que GitHub renverrait : le state de l'URL et le cookie d'état. */
async function begin(ctx: Ctx, card = "CardAAAA01", extra = "") {
  const res = await start(ctx, `card=${card}${extra}`);
  expect(res.status).toBe(302);
  const state = new URL(res.headers.get("location")!).searchParams.get("state")!;
  const cookie = cookieOf(res, STATE_COOKIE)!.value;
  return { state, cookie };
}

async function callback(ctx: Ctx, qs: string, cookie?: string) {
  const res = await ctx.app.request(`/auth/github/callback?${qs}`, cookie ? { headers: { cookie: `${STATE_COOKIE}=${encodeURIComponent(cookie)}` } } : {});
  expect(res.status).toBe(302);
  return res;
}

/** Revendication complète : rend le cookie de session. */
async function claim(ctx: Ctx, card = "CardAAAA01") {
  const { state, cookie } = await begin(ctx, card);
  const res = await callback(ctx, `code=${CODE}&state=${state}`, cookie);
  const session = cookieOf(res, SESSION_COOKIE);
  expect(session?.value).toBeTruthy();
  return { res, session: session!.value };
}

const asOwner = (session: string, extra: Record<string, string> = {}) => ({ cookie: `${SESSION_COOKIE}=${encodeURIComponent(session)}`, ...extra });

async function me(ctx: Ctx, session?: string) {
  const res = await ctx.app.request("/api/me", session ? { headers: asOwner(session) } : {});
  return res.json() as Promise<{ login: string; hidden: boolean } | null>;
}

describe("configuration", () => {
  it("sans les variables : bouton caché, routes absentes, /api/me nul", async () => {
    const ctx = setup({ configured: false });
    insertCard(ctx.store);
    expect(await (await ctx.app.request("/api/config")).json()).toEqual({ linkedin: false, claim: false, linkedinEntry: false });
    expect((await start(ctx, "card=CardAAAA01")).status).toBe(404);
    expect((await ctx.app.request(`/auth/github/callback?code=${CODE}&state=x`)).status).toBe(404);
    expect((await ctx.app.request("/api/owner/hide", { method: "POST" })).status).toBe(404);
    expect(await me(ctx)).toBeNull();
    // Même un cookie bien signé ne vaut rien quand l'OAuth n'est pas configuré.
    ctx.store.claimOwner("leamd", 4242);
    expect(await me(ctx, signSession(SECRET, { login: "leamd", githubId: 4242 }))).toBeNull();
    expect(ctx.fetchImpl).not.toHaveBeenCalled();
  });

  it("avec les variables : /api/config le dit", async () => {
    const ctx = setup();
    expect(await (await ctx.app.request("/api/config")).json()).toEqual({ linkedin: false, claim: true, linkedinEntry: false });
  });
});

describe("start", () => {
  it("redirige vers GitHub sans aucun scope, avec un state gardé dans un cookie httpOnly", async () => {
    const ctx = setup();
    insertCard(ctx.store);
    const res = await start(ctx, "card=CardAAAA01");
    expect(res.status).toBe(302);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const loc = new URL(res.headers.get("location")!);
    expect(`${loc.origin}${loc.pathname}`).toBe(GH_AUTHORIZE_URL);
    expect(loc.searchParams.has("scope")).toBe(false);
    expect(loc.searchParams.get("client_id")).toBe("gh-client");
    expect(loc.searchParams.get("redirect_uri")).toBe(`${BASE}/auth/github/callback`);
    const state = loc.searchParams.get("state")!;
    expect(state.length).toBeGreaterThanOrEqual(32);
    expect(loc.toString()).not.toContain(CLIENT_SECRET);

    const cookie = cookieOf(res, STATE_COOKIE)!;
    expect(cookie.raw).toMatch(/HttpOnly/i);
    expect(cookie.raw).toMatch(/SameSite=Lax/i);
    expect(cookie.raw).toMatch(/Secure/i);
    expect(cookie.raw).toMatch(/Path=\/auth\/github/);
    expect(cookie.raw).toMatch(/Max-Age=600/);
    // Deux lancements, deux states différents.
    expect((await begin(ctx)).state).not.toBe(state);
  });

  it("refuse une fiche inconnue (404) ou sans pseudo GitHub (400)", async () => {
    const ctx = setup();
    const cv: CardData = { ...FIXTURES.cv, id: "CvOnlyAA01" };
    ctx.store.insertCards([{ id: cv.id, createdAt: Date.now(), source: "cv", kind: "card", data: cv, deleteToken: "tok" }]);
    expect((await start(ctx, "card=Inconnue01")).status).toBe(404);
    expect((await start(ctx, "card=../etc")).status).toBe(404);
    expect((await start(ctx, "card=CvOnlyAA01")).status).toBe(400);
  });

  it("20 lancements par IP et par jour, puis retour sur la fiche avec claim=limited", async () => {
    const ctx = setup();
    insertCard(ctx.store);
    const ip = { "x-forwarded-for": "203.0.113.9" };
    for (let i = 0; i < 20; i++) {
      const res = await start(ctx, "card=CardAAAA01", ip);
      expect(new URL(res.headers.get("location")!).origin).toBe("https://github.com");
    }
    const res = await start(ctx, "card=CardAAAA01", ip);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${BASE}/c/CardAAAA01?claim=limited`);
    expect(cookieOf(res, STATE_COOKIE)).toBeNull();
    // Une autre IP n'est pas touchée.
    expect(new URL((await start(ctx, "card=CardAAAA01", { "x-forwarded-for": "203.0.113.10" })).headers.get("location")!).origin).toBe("https://github.com");
  });
});

describe("redirection ouverte", () => {
  it("safeReturnPath n'accepte que des chemins du site", () => {
    expect(safeReturnPath("/c/CardAAAA01")).toBe("/c/CardAAAA01");
    expect(safeReturnPath("/c/CardAAAA01?x=1#y")).toBe("/c/CardAAAA01?x=1#y");
    for (const bad of [
      "https://evil.example/",
      "http:evil.example",
      "//evil.example/x",
      "/\\evil.example",
      "\\\\evil.example",
      "/\t/evil.example",
      "javascript:alert(1)",
      "c/relatif",
      "",
      "/auth/github/start?card=x",
      "/api/owner/hide",
      "/" + "a".repeat(600),
    ]) {
      expect(safeReturnPath(bad), bad).toBeNull();
    }
  });

  it("un retour externe est remplacé par la fiche, jusqu'au bout du flux", async () => {
    const ctx = setup();
    insertCard(ctx.store);
    for (const ret of ["https://evil.example/phish", "//evil.example", "/%5C%5Cevil.example", "/\\evil.example"]) {
      const { state, cookie } = await begin(ctx, "CardAAAA01", `&return=${encodeURIComponent(ret)}`);
      const res = await callback(ctx, `code=${CODE}&state=${state}`, cookie);
      const loc = new URL(res.headers.get("location")!);
      expect(loc.origin).toBe(BASE);
      if (ret === "/%5C%5Cevil.example") expect(loc.pathname).toBe("/%5C%5Cevil.example");
      else expect(loc.pathname).toBe("/c/CardAAAA01");
    }
  });

  it("un retour du site est gardé", async () => {
    const ctx = setup();
    insertCard(ctx.store);
    const { state, cookie } = await begin(ctx, "CardAAAA01", `&return=${encodeURIComponent("/c/CardAAAA01?from=denounce")}`);
    const res = await callback(ctx, `code=${CODE}&state=${state}`, cookie);
    expect(res.headers.get("location")).toBe(`${BASE}/c/CardAAAA01?from=denounce&claim=ok&as=leamd`);
  });

  it("revendiquer une fiche dénoncée compte denounce_claimed (§18.6), une fiche ordinaire non", async () => {
    const ctx = setup();
    insertCard(ctx.store);
    await claim(ctx);
    expect(ctx.store.listEvents("denounce_claimed")).toHaveLength(0);
    ctx.store.markDenounced("CardAAAA01", "Denonce001", null);
    await claim(ctx);
    expect(ctx.store.listEvents("denounce_claimed")).toMatchObject([{ cardId: "CardAAAA01" }]);
  });
});

describe("callback", () => {
  it("state absent, faux ou cookie falsifié : erreur, aucun appel à GitHub, aucune session", async () => {
    const ctx = setup();
    insertCard(ctx.store);
    const { state, cookie } = await begin(ctx);

    const noCookie = await callback(ctx, `code=${CODE}&state=${state}`);
    expect(noCookie.headers.get("location")).toBe(`${BASE}/?claim=error`);

    const noState = await callback(ctx, `code=${CODE}`, cookie);
    expect(noState.headers.get("location")).toBe(`${BASE}/c/CardAAAA01?claim=error`);

    const wrong = await callback(ctx, `code=${CODE}&state=${state.slice(0, -1)}A`, cookie);
    expect(wrong.headers.get("location")).toBe(`${BASE}/c/CardAAAA01?claim=error`);

    const [payload, mac] = cookie.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload!, "base64url").toString()), s: "x" })).toString("base64url");
    const tampered = await callback(ctx, `code=${CODE}&state=x`, `${forged}.${mac}`);
    expect(tampered.headers.get("location")).toBe(`${BASE}/?claim=error`);

    for (const res of [noCookie, noState, wrong, tampered]) expect(cookieOf(res, SESSION_COOKIE)).toBeNull();
    // Le cookie d'état est effacé à chaque passage (usage unique).
    expect(cookieOf(wrong, STATE_COOKIE)?.value).toBe("");
    expect(ctx.fetchImpl).not.toHaveBeenCalled();
    expect(ctx.store.getOwner("leamd")).toBeNull();
  });

  it("refus côté GitHub (?error=access_denied) : retour sur la fiche, rien d'autre", async () => {
    const ctx = setup();
    insertCard(ctx.store);
    const { state, cookie } = await begin(ctx);
    const res = await callback(ctx, `error=access_denied&state=${state}`, cookie);
    expect(res.headers.get("location")).toBe(`${BASE}/c/CardAAAA01?claim=error`);
    expect(ctx.fetchImpl).not.toHaveBeenCalled();
  });

  it("login qui correspond (casse ignorée) : propriétaire, session de 30 jours, token jeté", async () => {
    const ctx = setup({ user: () => ({ login: "LeaMD", id: 4242 }) });
    insertCard(ctx.store, "CardAAAA01", "leamd");
    insertCard(ctx.store, "CardBBBB02", "leamd", Date.now() - 3 * 24 * 3600 * 1000);
    const log = vi.spyOn(console, "log");
    const warn = vi.spyOn(console, "warn");
    const { res, session } = await claim(ctx);

    expect(res.headers.get("location")).toBe(`${BASE}/c/CardAAAA01?claim=ok&as=leamd`);
    const raw = cookieOf(res, SESSION_COOKIE)!.raw;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
    expect(raw).toMatch(/Secure/i);
    expect(raw).toMatch(/Path=\//);
    expect(raw).toMatch(new RegExp(`Max-Age=${SESSION_TTL_MS / 1000}`));
    expect(verifySession(SECRET, session)).toEqual({ login: "leamd", githubId: 4242 });

    const owner = ctx.store.getOwner("LEAMD")!;
    expect(owner).toMatchObject({ login: "leamd", githubId: 4242, hidden: false, email: null, consentsJson: null });
    expect(await me(ctx, session)).toEqual({ login: "leamd", hidden: false });
    expect(await me(ctx)).toBeNull();

    // Rien du token, du code ni des secrets : ni dans la base, ni dans le cookie, ni dans les logs.
    const dump = JSON.stringify(ctx.store.db.prepare("SELECT * FROM owners").all()) + JSON.stringify(ctx.store.db.prepare("SELECT * FROM cards").all());
    const logged = JSON.stringify([...log.mock.calls, ...warn.mock.calls]);
    for (const secret of [ACCESS_TOKEN, CODE, CLIENT_SECRET, SECRET]) {
      expect(dump).not.toContain(secret);
      expect(logged).not.toContain(secret);
      expect(Buffer.from(session.split(".")[0]!, "base64url").toString()).not.toContain(secret);
    }
  });

  it("login qui ne correspond pas : message avec le vrai login, aucune revendication", async () => {
    const ctx = setup({ user: () => ({ login: "Autre-Dev", id: 99 }) });
    insertCard(ctx.store);
    const { state, cookie } = await begin(ctx);
    const res = await callback(ctx, `code=${CODE}&state=${state}`, cookie);
    expect(res.headers.get("location")).toBe(`${BASE}/c/CardAAAA01?claim=mismatch&as=autre-dev`);
    expect(cookieOf(res, SESSION_COOKIE)).toBeNull();
    expect(ctx.store.getOwner("leamd")).toBeNull();
    expect(ctx.store.getOwner("autre-dev")).toBeNull();
    expect(ctx.store.getCard("CardAAAA01")!.expiresAt).not.toBeNull();
  });

  it("GitHub en panne ou code refusé : erreur, et les logs ne disent ni token ni code", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const ctx of [
      setup({ token: () => Response.json({ error: "bad_verification_code", error_description: `The code ${CODE} is wrong` }) }),
      setup({ user: () => new Response("nope", { status: 500 }) }),
    ]) {
      insertCard(ctx.store);
      const { state, cookie } = await begin(ctx);
      const res = await callback(ctx, `code=${CODE}&state=${state}`, cookie);
      expect(res.headers.get("location")).toBe(`${BASE}/c/CardAAAA01?claim=error`);
      expect(cookieOf(res, SESSION_COOKIE)).toBeNull();
      expect(ctx.store.getOwner("leamd")).toBeNull();
    }
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("bad_verification_code");
    for (const secret of [ACCESS_TOKEN, CODE, CLIENT_SECRET, SECRET]) expect(logged).not.toContain(secret);
  });

  it("renommage : même identifiant GitHub, autre login → une seule ligne, les anciennes fiches suivent", async () => {
    let user: GhUser = { login: "old-name", id: 4242 };
    const ctx = setup({ user: () => user });
    insertCard(ctx.store, "CardOLD001", "old-name");
    const first = await claim(ctx, "CardOLD001");
    ctx.store.setOwnerHidden("old-name", true);

    // Le compte s'appelle désormais new-name ; quelqu'un a fait sa fiche sous ce nom.
    user = { login: "New-Name", id: 4242 };
    insertCard(ctx.store, "CardNEW001", "new-name");
    const second = await claim(ctx, "CardNEW001");

    const rows = ctx.store.db.prepare("SELECT login, github_id, hidden FROM owners").all();
    expect(rows).toEqual([{ login: "new-name", github_id: 4242, hidden: 1 }]);
    expect(ctx.store.getCard("CardOLD001")!.login).toBe("new-name");
    expect(ctx.store.getCard("CardOLD001")!.expiresAt).toBeNull();
    // L'ancien cookie (old-name) désigne toujours la même personne, sous son nouveau nom.
    expect(await me(ctx, first.session)).toEqual({ login: "new-name", hidden: true });
    expect(await me(ctx, second.session)).toEqual({ login: "new-name", hidden: true });
  });

  it("un nom repris par un autre compte remplace l'ancienne revendication", async () => {
    let user: GhUser = { login: "leamd", id: 1 };
    const ctx = setup({ user: () => user });
    insertCard(ctx.store);
    const first = await claim(ctx);
    user = { login: "leamd", id: 2 };
    await claim(ctx);
    expect(ctx.store.db.prepare("SELECT login, github_id FROM owners").all()).toEqual([{ login: "leamd", github_id: 2 }]);
    expect(await me(ctx, first.session)).toBeNull();
  });
});

describe("cookie de session", () => {
  it("falsifié, signé avec un autre secret ou expiré : refusé", async () => {
    const ctx = setup();
    ctx.store.claimOwner("leamd", 4242);
    const good = signSession(SECRET, { login: "leamd", githubId: 4242 });
    expect(await me(ctx, good)).toEqual({ login: "leamd", hidden: false });

    const [payload, mac] = good.split(".");
    const p = JSON.parse(Buffer.from(payload!, "base64url").toString());
    const swap = (o: object) => `${Buffer.from(JSON.stringify(o)).toString("base64url")}.${mac}`;
    expect(await me(ctx, swap({ ...p, l: "torvalds" }))).toBeNull();
    expect(await me(ctx, swap({ ...p, e: p.e + SESSION_TTL_MS }))).toBeNull();
    expect(await me(ctx, `${payload}.${mac!.slice(0, -2)}AA`)).toBeNull();
    expect(await me(ctx, `${payload}`)).toBeNull();
    expect(await me(ctx, "n'importe quoi")).toBeNull();
    expect(await me(ctx, signSession("autre-secret-".repeat(4), { login: "leamd", githubId: 4242 }))).toBeNull();

    const expired = signSession(SECRET, { login: "leamd", githubId: 4242 }, Date.now() - SESSION_TTL_MS - 1000);
    expect(verifySession(SECRET, expired)).toBeNull();
    expect(await me(ctx, expired)).toBeNull();
    // Encore valable la veille de ses 30 jours.
    const almost = signSession(SECRET, { login: "leamd", githubId: 4242 }, Date.now() - SESSION_TTL_MS + 60_000);
    expect(await me(ctx, almost)).toEqual({ login: "leamd", hidden: false });
  });

  it("un cookie valide d'un compte que la table ne connaît pas ne vaut rien", async () => {
    const ctx = setup();
    expect(await me(ctx, signSession(SECRET, { login: "leamd", githubId: 4242 }))).toBeNull();
  });

  it("POST /auth/logout efface le cookie", async () => {
    const ctx = setup();
    const res = await ctx.app.request("/auth/logout", { method: "POST", headers: asOwner("x") });
    expect(res.status).toBe(200);
    const cleared = cookieOf(res, SESSION_COOKIE)!;
    expect(cleared.value).toBe("");
    expect(cleared.raw).toMatch(/Max-Age=0/);
  });
});

describe("ce que la session du propriétaire ouvre sans le jeton de la fiche", () => {
  const postEmail = (ctx: Ctx, headers: Record<string, string>, cardId = "CardAAAA01") =>
    ctx.app.request("/api/email", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ cardId, email: "lea@example.com" }),
    });

  it("GET /api/card/:id dit `mine` au propriétaire, et à lui seul", async () => {
    const ctx = setup();
    insertCard(ctx.store);
    insertCard(ctx.store, "CardBBBB02", "autre");
    const { session } = await claim(ctx);
    const get = async (id: string, headers: Record<string, string> = {}) =>
      (await (await ctx.app.request(`/api/card/${id}`, { headers })).json()) as JobState & { mine?: boolean };
    expect((await get("CardAAAA01", asOwner(session))).mine).toBe(true);
    expect((await get("CardAAAA01")).mine).toBeUndefined();
    expect((await get("CardBBBB02", asOwner(session))).mine).toBeUndefined();
  });

  it("POST /api/email : accepté pour ses fiches, refusé pour celles d'un autre ou depuis un autre site", async () => {
    const ctx = setup();
    insertCard(ctx.store);
    insertCard(ctx.store, "CardBBBB02", "autre");
    const { session } = await claim(ctx);
    expect((await postEmail(ctx, {})).status).toBe(403);
    expect((await postEmail(ctx, asOwner(session), "CardBBBB02")).status).toBe(403);
    expect((await postEmail(ctx, asOwner(session, { origin: "https://evil.test" }))).status).toBe(403);
    expect(ctx.store.getCard("CardAAAA01")!.email).toBeNull();
    expect((await postEmail(ctx, asOwner(session, { origin: BASE }))).status).toBe(200);
    expect(ctx.store.getCard("CardAAAA01")!.email).toBe("lea@example.com");
  });
});

describe("suppression par le propriétaire (§11)", () => {
  const del = (ctx: Ctx, id: string, headers: Record<string, string> = {}) => ctx.app.request(`/api/card/${id}`, { method: "DELETE", headers });

  it("DELETE sans jeton : accepté pour ses fiches, comparaison entière et images comprises", async () => {
    const ctx = setup();
    const cmp = insertComparison(ctx.store);
    insertCard(ctx.store);
    writeFileSync(join(ctx.ogDir, `${cmp.id}.png`), "png");
    const { session } = await claim(ctx);
    expect((await del(ctx, cmp.id)).status).toBe(403);
    const ok = await del(ctx, cmp.cv.id, asOwner(session, { origin: BASE }));
    expect(ok.status).toBe(200);
    for (const id of [cmp.id, cmp.cv.id, cmp.github.id]) expect(ctx.store.getCard(id)).toBeNull();
    expect(existsSync(join(ctx.ogDir, `${cmp.id}.png`))).toBe(false);
    // Ses autres fiches restent : on supprime une fiche, pas un compte.
    expect(ctx.store.getCard("CardAAAA01")).not.toBeNull();
  });

  it("refusé pour la fiche d'un autre, depuis un autre site, et par le lien GET sans jeton", async () => {
    const ctx = setup();
    insertCard(ctx.store);
    insertCard(ctx.store, "CardBBBB02", "autre");
    const { session } = await claim(ctx);
    expect((await del(ctx, "CardBBBB02", asOwner(session))).status).toBe(403);
    expect((await del(ctx, "CardAAAA01", asOwner(session, { origin: "https://evil.test" }))).status).toBe(403);
    expect((await ctx.app.request("/api/card/CardAAAA01/delete", { headers: asOwner(session) })).status).toBe(403);
    expect(ctx.store.getCard("CardAAAA01")).not.toBeNull();
    expect(ctx.store.getCard("CardBBBB02")).not.toBeNull();
  });
});

describe("conservation", () => {
  it("expires_at à NULL après revendication, cartes CV des comparaisons comprises, et pour les fiches suivantes", async () => {
    const ctx = setup();
    insertCard(ctx.store);
    insertComparison(ctx.store);
    insertCard(ctx.store, "OtherAAA01", "someone");
    expect(ctx.store.getCard("CardAAAA01")!.expiresAt).not.toBeNull();
    await claim(ctx);
    for (const id of ["CardAAAA01", "CompAAAA01", "CvCardAA01", "GhCardAA01"]) expect(ctx.store.getCard(id)!.expiresAt, id).toBeNull();
    expect(ctx.store.getCard("OtherAAA01")!.expiresAt).not.toBeNull();
    insertCard(ctx.store, "LaterAAA01", "leamd");
    expect(ctx.store.getCard("LaterAAA01")!.expiresAt).toBeNull();
    // La purge des 90 jours ne les touche plus.
    expect(ctx.store.purgeExpired(Date.now() + 365 * 24 * 3600 * 1000)).toEqual(["OtherAAA01"]);
  });
});

describe("masquer", () => {
  const TEMPLATE = `<!doctype html><html lang="fr"><head><title>T</title><meta property="og:title" content="générique"></head><body><div id="root"></div></body></html>`;

  async function hidden(ctx: Ctx) {
    insertCard(ctx.store, "CardAAAA01", "leamd", Date.now() - 2 * 24 * 3600 * 1000);
    insertComparison(ctx.store);
    const { session } = await claim(ctx);
    const res = await ctx.app.request("/api/owner/hide", { method: "POST", headers: asOwner(session) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, login: "leamd", hidden: true });
    return session;
  }

  it("réservé au propriétaire, et à une requête du site", async () => {
    const ctx = setup();
    insertCard(ctx.store);
    expect((await ctx.app.request("/api/owner/hide", { method: "POST" })).status).toBe(401);
    expect((await ctx.app.request("/api/owner/hide", { method: "POST", headers: asOwner(signSession("faux".repeat(10), { login: "leamd", githubId: 4242 })) })).status).toBe(401);
    const { session } = await claim(ctx);
    const cross = await ctx.app.request("/api/owner/hide", { method: "POST", headers: asOwner(session, { origin: "https://evil.example" }) });
    expect(cross.status).toBe(403);
    expect(ctx.store.isHidden("leamd")).toBe(false);
    const same = await ctx.app.request("/api/owner/hide", { method: "POST", headers: asOwner(session, { origin: BASE }) });
    expect(same.status).toBe(200);
    expect(await me(ctx, session)).toEqual({ login: "leamd", hidden: true });
  });

  it("masquée : /c/:id en 410 avec balises génériques et sans image, /og en 404, l'API en gone", async () => {
    const ctx = setup({ indexHtml: async () => TEMPLATE });
    // Un PNG déjà rendu : il est effacé au masquage.
    writeFileSync(join(ctx.ogDir, "CardAAAA01.png"), "png");
    const session = await hidden(ctx);
    expect(existsSync(join(ctx.ogDir, "CardAAAA01.png"))).toBe(false);

    for (const id of ["CardAAAA01", "CompAAAA01", "CvCardAA01"]) {
      const page = await ctx.app.request(`/c/${id}`);
      expect(page.status, id).toBe(410);
      expect(page.headers.get("cache-control")).toBe("private, no-store");
      const html = await page.text();
      expect(html).toContain("og:title");
      expect(html).not.toContain("og:image");
      expect(html).not.toContain(FIXTURES.gold.name);
      expect(html).not.toContain(`/og/${id}`);
      expect(html).toContain('<div id="root">');

      expect((await ctx.app.request(`/og/${id}.png`)).status).toBe(404);
      expect((await ctx.app.request(`/og/${id}-portrait.png`)).status).toBe(404);

      const api = await ctx.app.request(`/api/card/${id}`);
      expect(api.status).toBe(410);
      const state = (await api.json()) as JobState;
      expect(state).toMatchObject({ state: "error", code: "gone", message: { fr: "Fiche retirée par son propriétaire." } });
    }

    // Le propriétaire, lui, voit toujours ses fiches (mais pas d'image OG publique).
    const mine = await ctx.app.request("/c/CardAAAA01", { headers: asOwner(session) });
    expect(mine.status).toBe(200);
    expect(await mine.text()).not.toContain("og:image");
    const api = await ctx.app.request("/api/card/CardAAAA01", { headers: asOwner(session) });
    expect(api.status).toBe(200);
    expect(((await api.json()) as JobState).state).toBe("done");
  });

  it("sans front buildé : la page dit « Fiche retirée par son propriétaire »", async () => {
    const ctx = setup();
    await hidden(ctx);
    const page = await ctx.app.request("/c/CardAAAA01");
    expect(page.status).toBe(410);
    const html = await page.text();
    expect(html).toContain("Fiche retirée par son propriétaire.");
    expect(html).toContain("og:title");
    expect(html).not.toContain("og:image");
  });

  it("nouvelle fiche refusée en gone pour un autre, acceptée pour le propriétaire", async () => {
    const ctx = setup();
    const session = await hidden(ctx);
    const post = (headers: Record<string, string> = {}) =>
      ctx.app.request("/api/card", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ login: "LeaMD", lang: "fr" }),
      });

    const refused = await post();
    expect(refused.status).toBe(410);
    const body = (await refused.json()) as JobState;
    expect(body).toMatchObject({ state: "error", code: "gone", message: { fr: expect.stringContaining("Ce dossier a quitté la ville"), en: expect.stringContaining("left town") } });

    // CV + pseudo masqué : refusé aussi.
    const form = new FormData();
    form.append("cv", new File([new TextEncoder().encode("%PDF-1.7 x")], "cv.pdf", { type: "application/pdf" }));
    form.append("login", "leamd");
    expect((await ctx.app.request("/api/card", { method: "POST", body: form })).status).toBe(410);

    const accepted = await post(asOwner(session));
    expect(accepted.status).toBe(202);
    const { id } = (await accepted.json()) as { id: string };
    await ctx.pipeline.wait(id);
    expect(ctx.store.getCard(id)!.expiresAt).toBeNull();
    // Masquée elle aussi pour les autres.
    expect((await ctx.app.request(`/api/card/${id}`)).status).toBe(410);
  });

  it("rendre visible : tout revient", async () => {
    const ctx = setup();
    const session = await hidden(ctx);
    const res = await ctx.app.request("/api/owner/unhide", { method: "POST", headers: asOwner(session) });
    expect(await res.json()).toEqual({ ok: true, login: "leamd", hidden: false });
    expect((await ctx.app.request("/c/CardAAAA01")).status).toBe(200);
    expect((await ctx.app.request("/og/CardAAAA01.png")).status).toBe(200);
    expect((await ctx.app.request("/api/card/CardAAAA01")).status).toBe(200);
  });
});
