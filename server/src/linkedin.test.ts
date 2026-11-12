// Flux « photo LinkedIn » avec un fetch factice : jamais d'appel réseau réel.

import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../../shared/fixtures";
import type { CardData, ComparisonData } from "../../shared/types";
import { createApp } from "./app";
import { SESSION_COOKIE, signSession } from "./auth";
import { Store } from "./db";
import { AUTHORIZE_URL, LI_STATE_COOKIE, TOKEN_URL, USERINFO_URL } from "./linkedin";
import type { Deps, RenderInput } from "./pipeline";

const BASE = "https://skills.test";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PHOTO_URL = "https://media.licdn.com/dms/image/v2/abc/profile.jpg";
const ACCESS_TOKEN = "SECRET-ACCESS-TOKEN";

type Profile = { picture?: string; name?: string };

function fakeFetch(opts: { profile?: Profile; photo?: Response | (() => Response) } = {}) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === TOKEN_URL) {
      const body = new URLSearchParams(String(init?.body));
      expect(init?.method).toBe("POST");
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("redirect_uri")).toBe(`${BASE}/auth/linkedin/callback`);
      expect(body.get("client_secret")).toBe("secret");
      return Response.json({ access_token: ACCESS_TOKEN, expires_in: 3600 });
    }
    if (url === USERINFO_URL) {
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${ACCESS_TOKEN}`);
      return Response.json(opts.profile ?? { picture: PHOTO_URL, name: "Léa Martin" });
    }
    if (opts.photo) return typeof opts.photo === "function" ? opts.photo() : opts.photo;
    return new Response(JPEG, { headers: { "content-type": "image/jpeg" } });
  });
}

const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
  vi.restoreAllMocks();
});

const SESSION_SECRET = "s".repeat(40);

/** Cookie d'état posé par le dernier /start : le navigateur qui a lancé le flux le renvoie au retour. */
let jar = "";

function setup(fetchImpl: typeof fetch = fakeFetch() as unknown as typeof fetch, linkedin = true, claim = false) {
  jar = "";
  const store = new Store(":memory:");
  stores.push(store);
  const dir = mkdtempSync(join(tmpdir(), "tys-li-"));
  const ogDir = join(dir, "og");
  const avatarDir = join(dir, "avatars");
  mkdirSync(ogDir);
  const renders: RenderInput[] = [];
  const deps = {
    aiAvailable: () => false,
    async renderImage(input: RenderInput) {
      renders.push(input);
      return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    },
  } as unknown as Deps;
  const { app } = createApp({
    store,
    deps,
    githubToken: "t",
    baseUrl: BASE,
    ogDir,
    avatarDir,
    fetchImpl,
    linkedin: linkedin ? { clientId: "client", clientSecret: "secret" } : undefined,
    githubAuth: claim ? { clientId: "gh", clientSecret: "gh-secret", sessionSecret: SESSION_SECRET } : undefined,
  });
  return { app, store, ogDir, avatarDir, renders };
}

function insertCard(store: Store, id = "CardAAAA01", name = "leamd"): CardData {
  const card: CardData = { ...FIXTURES.gold, id, name, login: "leamd", avatarUrl: undefined };
  store.insertCards([{ id, createdAt: Date.now(), source: "github", login: "leamd", kind: "card", data: card, deleteToken: "tok" }]);
  return card;
}

function insertComparison(store: Store) {
  const gh: CardData = { ...FIXTURES.gold, id: "GhCardAA01", name: "leamd", login: "leamd" };
  const cv: CardData = { ...FIXTURES.cv, id: "CvCardAA01" };
  const cmp: ComparisonData = { id: "CompAAAA01", createdAt: gh.createdAt, cv, github: gh, deltas: {} as ComparisonData["deltas"], headline: { fr: "x", en: "x" } };
  const now = Date.now();
  store.insertCards([
    { id: cmp.id, createdAt: now, source: "both", login: "leamd", kind: "comparison", data: cmp, deleteToken: "tok" },
    { id: cv.id, parentId: cmp.id, createdAt: now, source: "cv", kind: "card", data: cv, deleteToken: "tok" },
    { id: gh.id, parentId: cmp.id, createdAt: now, source: "github", login: "leamd", kind: "card", data: gh, deleteToken: "tok" },
  ]);
  return cmp;
}

async function start(ctx: ReturnType<typeof setup>, card: string, token = "tok", headers: Record<string, string> = {}) {
  const res = await ctx.app.request(`/auth/linkedin/start?card=${card}&token=${token}`, { headers });
  const set = res.headers.getSetCookie().find((h) => h.startsWith(`${LI_STATE_COOKIE}=`));
  if (set) jar = set.split(";")[0]!;
  return res;
}

/** Session du propriétaire revendiqué de `login`, comme la pose /auth/github/callback. */
function ownerSession(store: Store, login: string, githubId: number) {
  store.claimOwner(login, githubId);
  return { cookie: `${SESSION_COOKIE}=${encodeURIComponent(signSession(SESSION_SECRET, { login, githubId }))}` };
}

async function stateOf(ctx: ReturnType<typeof setup>, card: string) {
  const res = await start(ctx, card);
  expect(res.status).toBe(302);
  return new URL(res.headers.get("location")!).searchParams.get("state")!;
}

async function callback(ctx: ReturnType<typeof setup>, qs: string, cookie = jar) {
  const res = await ctx.app.request(`/auth/linkedin/callback?${qs}`, cookie ? { headers: { cookie } } : {});
  expect(res.status).toBe(302);
  return res.headers.get("location");
}

describe("configuration", () => {
  it("désactivée sans les variables : health, config, start", async () => {
    const ctx = setup(undefined, false);
    expect(await (await ctx.app.request("/api/config")).json()).toEqual({ linkedin: false, claim: false, linkedinEntry: false });
    expect((await (await ctx.app.request("/api/health")).json()).linkedin).toBe(false);
    insertCard(ctx.store);
    expect((await start(ctx, "CardAAAA01")).status).toBe(404);
  });

  it("activée : config le dit", async () => {
    const ctx = setup();
    expect(await (await ctx.app.request("/api/config")).json()).toEqual({ linkedin: true, claim: false, linkedinEntry: false });
  });
});

describe("start", () => {
  it("refuse un mauvais jeton (403) ou une carte inconnue (404)", async () => {
    const ctx = setup();
    insertCard(ctx.store);
    expect((await start(ctx, "CardAAAA01", "mauvais")).status).toBe(403);
    expect((await ctx.app.request("/auth/linkedin/start?card=CardAAAA01")).status).toBe(403);
    expect((await start(ctx, "Inconnue01")).status).toBe(404);
  });

  it("redirige vers LinkedIn avec les bons paramètres", async () => {
    const ctx = setup();
    insertCard(ctx.store);
    const res = await start(ctx, "CardAAAA01");
    const loc = new URL(res.headers.get("location")!);
    expect(`${loc.origin}${loc.pathname}`).toBe(AUTHORIZE_URL);
    expect(Object.fromEntries(loc.searchParams)).toMatchObject({
      response_type: "code",
      client_id: "client",
      redirect_uri: `${BASE}/auth/linkedin/callback`,
      scope: "openid profile",
    });
    expect(loc.searchParams.get("state")!.length).toBeGreaterThanOrEqual(32);
    // L'état est lié à ce navigateur par un cookie httpOnly signé, qui ne porte pas l'état en clair.
    const set = res.headers.getSetCookie().find((h) => h.startsWith(`${LI_STATE_COOKIE}=`))!;
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=Lax/i);
    expect(set).toMatch(/Path=\/auth\/linkedin/i);
    expect(set).toMatch(/Secure/i);
  });
});

describe("revendication active : la photo est au propriétaire connecté du pseudo", () => {
  it("le jeton de la fiche ne suffit plus pour une fiche à pseudo GitHub, comparaison comprise", async () => {
    const ctx = setup(undefined, true, true);
    insertCard(ctx.store);
    const cmp = insertComparison(ctx.store);
    expect((await start(ctx, "CardAAAA01")).status).toBe(403);
    expect((await start(ctx, cmp.cv.id)).status).toBe(403);
    // Connecté comme propriétaire d'un autre pseudo : refusé aussi.
    expect((await start(ctx, "CardAAAA01", "tok", ownerSession(ctx.store, "autre", 7))).status).toBe(403);
    expect(jar).toBe("");
  });

  it("le propriétaire connecté pose sa photo, sans jeton", async () => {
    const ctx = setup(undefined, true, true);
    insertCard(ctx.store);
    const res = await start(ctx, "CardAAAA01", "", ownerSession(ctx.store, "leamd", 4242));
    expect(res.status).toBe(302);
    const state = new URL(res.headers.get("location")!).searchParams.get("state")!;
    expect(await callback(ctx, `code=abc&state=${state}`)).toBe(`${BASE}/c/CardAAAA01?photo=linkedin`);
    expect((ctx.store.getCard("CardAAAA01")!.data as CardData).photoSource).toBe("linkedin");
  });

  it("une fiche sans pseudo GitHub reste à qui l'a créée", async () => {
    const ctx = setup(undefined, true, true);
    const cv: CardData = { ...FIXTURES.cv, id: "CvSeuleA01" };
    ctx.store.insertCards([{ id: cv.id, createdAt: Date.now(), source: "cv", kind: "card", data: cv, deleteToken: "tok" }]);
    expect((await start(ctx, cv.id, "mauvais")).status).toBe(403);
    expect((await start(ctx, cv.id)).status).toBe(302);
  });
});

describe("callback", () => {
  it("state invalide ou déjà utilisé → redirection error", async () => {
    const ctx = setup();
    insertCard(ctx.store);
    expect(await callback(ctx, "code=c&state=inventé")).toBe(`${BASE}/?photo=error`);
    const state = await stateOf(ctx, "CardAAAA01");
    expect(await callback(ctx, `code=c&state=${state}`)).toBe(`${BASE}/c/CardAAAA01?photo=linkedin`);
    expect(await callback(ctx, `code=c&state=${state}`)).toBe(`${BASE}/?photo=error`);
  });

  it("état lancé par un autre navigateur (sans cookie, ou cookie d'un autre flux) → error, carte inchangée", async () => {
    const fetchImpl = fakeFetch();
    const ctx = setup(fetchImpl as unknown as typeof fetch);
    insertCard(ctx.store);
    insertCard(ctx.store, "CardBBBB02");
    // Lien de retour forgé, ouvert par quelqu'un qui n'a jamais lancé le flux.
    const forged = await stateOf(ctx, "CardAAAA01");
    expect(await callback(ctx, `code=c&state=${forged}`, "")).toBe(`${BASE}/?photo=error`);
    // Ouvert par quelqu'un qui a lancé le sien : son cookie ne vaut pas pour cet état.
    const other = await stateOf(ctx, "CardAAAA01");
    await stateOf(ctx, "CardBBBB02");
    expect(await callback(ctx, `code=c&state=${other}`)).toBe(`${BASE}/?photo=error`);
    // Cookie falsifié.
    const again = await stateOf(ctx, "CardAAAA01");
    expect(await callback(ctx, `code=c&state=${again}`, `${LI_STATE_COOKIE}=${again}`)).toBe(`${BASE}/?photo=error`);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((ctx.store.getCard("CardAAAA01")!.data as CardData).photoSource).toBeUndefined();
  });

  it("annulation sur LinkedIn → /c/:id?photo=error", async () => {
    const ctx = setup();
    insertCard(ctx.store);
    const state = await stateOf(ctx, "CardAAAA01");
    expect(await callback(ctx, `error=user_cancelled_login&state=${state}`)).toBe(`${BASE}/c/CardAAAA01?photo=error`);
  });

  it("flux complet : photo stockée, carte mise à jour, PNG invalidés, token jamais gardé", async () => {
    const warn = vi.spyOn(console, "warn");
    const ctx = setup();
    insertCard(ctx.store);
    writeFileSync(join(ctx.ogDir, "CardAAAA01.png"), "old");
    writeFileSync(join(ctx.ogDir, "CardAAAA01-portrait.png"), "old");

    const state = await stateOf(ctx, "CardAAAA01");
    expect(await callback(ctx, `code=abc&state=${state}`)).toBe(`${BASE}/c/CardAAAA01?photo=linkedin`);

    const card = ctx.store.getCard("CardAAAA01")!.data as CardData;
    expect(card.avatarUrl).toMatch(new RegExp(`^${BASE}/avatar/CardAAAA01\\.jpg\\?v=`));
    expect(card.photoSource).toBe("linkedin");
    expect(card.name).toBe("Léa Martin"); // le bandeau affichait le pseudo
    expect(existsSync(join(ctx.avatarDir, "CardAAAA01.jpg"))).toBe(true);
    expect(existsSync(join(ctx.ogDir, "CardAAAA01.png"))).toBe(false);
    expect(existsSync(join(ctx.ogDir, "CardAAAA01-portrait.png"))).toBe(false);

    // Photo servie par nous, cache long.
    const av = await ctx.app.request("/avatar/CardAAAA01.jpg");
    expect(av.headers.get("content-type")).toBe("image/jpeg");
    expect(av.headers.get("cache-control")).toContain("max-age=31536000");
    expect(new Uint8Array(await av.arrayBuffer())).toEqual(JPEG);

    // Le rendu OG reçoit un data URI, pas notre propre URL.
    expect((await ctx.app.request("/og/CardAAAA01.png")).status).toBe(200);
    expect(ctx.renders[0]!.card!.avatarUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect((ctx.store.getCard("CardAAAA01")!.data as CardData).avatarUrl).toMatch(/^https:/);

    const dump = JSON.stringify(ctx.store.db.prepare("SELECT * FROM cards").all());
    expect(dump).not.toContain(ACCESS_TOKEN);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(ACCESS_TOKEN);
  });

  it("garde le vrai nom quand la carte en a un", async () => {
    const ctx = setup();
    insertCard(ctx.store, "CardAAAA01", "Léa Martin-Dubois");
    await callback(ctx, `code=abc&state=${await stateOf(ctx, "CardAAAA01")}`);
    expect((ctx.store.getCard("CardAAAA01")!.data as CardData).name).toBe("Léa Martin-Dubois");
  });

  it("carte d'une comparaison : la comparaison parente est mise à jour aussi", async () => {
    const ctx = setup();
    const cmp = insertComparison(ctx.store);
    writeFileSync(join(ctx.ogDir, `${cmp.id}.png`), "old");
    await callback(ctx, `code=abc&state=${await stateOf(ctx, cmp.github.id)}`);
    const parent = ctx.store.getCard(cmp.id)!.data as ComparisonData;
    expect(parent.github.photoSource).toBe("linkedin");
    expect(parent.cv.photoSource).toBeUndefined();
    expect((ctx.store.getCard(cmp.github.id)!.data as CardData).photoSource).toBe("linkedin");
    expect(existsSync(join(ctx.ogDir, `${cmp.id}.png`))).toBe(false);

    await ctx.app.request(`/og/${cmp.id}.png`);
    // L'image du dossier : sa fiche, avec la photo de la pièce GitHub.
    expect(ctx.renders[0]!.card!.id).toBe(cmp.id);
    expect(ctx.renders[0]!.card!.avatarUrl).toMatch(/^data:image\/jpeg/);

    // La suppression du groupe efface aussi la photo.
    expect((await ctx.app.request(`/api/card/${cmp.id}?token=tok`, { method: "DELETE" })).status).toBe(200);
    expect(existsSync(join(ctx.avatarDir, `${cmp.github.id}.jpg`))).toBe(false);
  });

  it.each([
    ["domaine étranger", { profile: { picture: "https://evil.example/p.jpg" } }],
    ["pas de photo", { profile: { name: "Léa" } }],
    ["type refusé", { photo: () => new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } }) }],
    ["trop lourde", { photo: () => new Response(new Uint8Array(3 * 1024 * 1024).fill(0xff), { headers: { "content-type": "image/jpeg" } }) }],
    ["contenu qui ment", { photo: () => new Response("pas une image", { headers: { "content-type": "image/png" } }) }],
  ])("%s → error, carte inchangée", async (_label, opts) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = setup(fakeFetch(opts as Parameters<typeof fakeFetch>[0]) as unknown as typeof fetch);
    insertCard(ctx.store);
    expect(await callback(ctx, `code=abc&state=${await stateOf(ctx, "CardAAAA01")}`)).toBe(`${BASE}/c/CardAAAA01?photo=error`);
    expect((ctx.store.getCard("CardAAAA01")!.data as CardData).photoSource).toBeUndefined();
  });
});
