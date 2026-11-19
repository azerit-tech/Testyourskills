// « Continuer avec GitHub » (SPEC §18.80) : de la connexion au pseudo, avec un
// faux GitHub. Le retour est partagé avec « C'est moi » (§18.1).

import { afterEach, describe, expect, it, vi } from "vitest";
import { GH_AUTHORIZE_URL, GH_TOKEN_URL, GH_USER_URL, SESSION_COOKIE, STATE_COOKIE } from "../auth";
import { GH_ENTER_COOKIE, GH_ENTER_STARTS_PER_DAY, GH_ENTER_STATE_COOKIE, githubLoginFromEnv } from "./githubLogin";
import { cookiesOf, postCard, setupEntry, type EntryCtx } from "./testing";

const BASE = "https://skills.test";
const ACCESS_TOKEN = "GH-ACCESS-TOKEN";
const SECRET = "s".repeat(40);

const ctxs: EntryCtx[] = [];
afterEach(() => {
  while (ctxs.length) ctxs.pop()!.store.close();
  vi.restoreAllMocks();
});

function setup(o: { login?: boolean; claim?: boolean; user?: unknown } = {}) {
  const exchanged: URLSearchParams[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === GH_TOKEN_URL) {
      exchanged.push(new URLSearchParams(String(init?.body)));
      return Response.json({ access_token: ACCESS_TOKEN });
    }
    if (url === GH_USER_URL) return Response.json(o.user ?? { login: "LeaMD", id: 4242 });
    throw new Error(`appel réseau inattendu : ${url}`);
  }) as unknown as typeof fetch;
  const ctx = setupEntry({
    app: {
      fetchImpl,
      githubLogin: o.login === false ? undefined : { clientId: "enter-client", clientSecret: "enter-secret" },
      githubAuth: o.claim ? { clientId: "claim-client", clientSecret: "claim-secret", sessionSecret: SECRET } : undefined,
    },
  });
  ctxs.push(ctx);
  return { ctx, exchanged };
}

async function signIn(ctx: EntryCtx, returnPath?: string) {
  const start = await ctx.app.request(`/auth/github/enter${returnPath ? `?return=${encodeURIComponent(returnPath)}` : ""}`);
  const to = new URL(start.headers.get("location")!);
  let jar = cookiesOf(start);
  const back = await ctx.app.request(`/auth/github/callback?code=abc&state=${to.searchParams.get("state")}`, { headers: { cookie: jar } });
  jar = cookiesOf(back, jar);
  return { start, to, back, jar };
}

const whoami = async (ctx: EntryCtx, jar: string) => {
  const res = await ctx.app.request("/api/entry/github", { headers: { cookie: jar } });
  return { json: (await res.json()) as { signedIn: boolean; login?: string }, jar: cookiesOf(res, jar) };
};

describe("« Continuer avec GitHub »", () => {
  it("va chez GitHub sans aucun scope, et revient avec le pseudo dans un cookie, jamais dans l'adresse", async () => {
    const { ctx, exchanged } = setup();
    const { start, to, back, jar } = await signIn(ctx, "/c/abc");
    expect(start.status).toBe(302);
    expect(`${to.origin}${to.pathname}`).toBe(GH_AUTHORIZE_URL);
    expect(to.searchParams.get("client_id")).toBe("enter-client");
    expect(to.searchParams.get("redirect_uri")).toBe(`${BASE}/auth/github/callback`);
    expect(to.searchParams.has("scope")).toBe(false);
    expect(exchanged[0]!.get("client_id")).toBe("enter-client");
    expect(exchanged[0]!.get("client_secret")).toBe("enter-secret");
    expect(back.headers.get("location")).toBe(`${BASE}/c/abc?gh=1`);
    const set = back.headers.getSetCookie().find((l) => l.startsWith(`${GH_ENTER_COOKIE}=`))!;
    expect(set).toMatch(/HttpOnly/i);
    expect(set).not.toContain(ACCESS_TOKEN);
    expect(jar).not.toContain(GH_ENTER_STATE_COOKIE);
    // Sans revendication configurée : pas de session propriétaire.
    expect(jar).not.toContain(SESSION_COOKIE);

    // Le pseudo sort une seule fois.
    const first = await whoami(ctx, jar);
    expect(first.json).toEqual({ signedIn: true, login: "leamd" });
    expect(first.jar).not.toContain(GH_ENTER_COOKIE);
    expect((await whoami(ctx, first.jar)).json).toEqual({ signedIn: false });
    // Et la fiche part comme un pseudo tapé.
    const { status } = await postCard(ctx, { login: first.json.login });
    expect(status).toBe(202);
    expect(ctx.calls.collect).toEqual(["leamd"]);
  });

  it("avec « C'est moi » configuré, la connexion vaut revendication du compte", async () => {
    const { ctx } = setup({ claim: true });
    const { jar } = await signIn(ctx);
    expect(jar).toContain(`${SESSION_COOKIE}=`);
    expect(ctx.store.getOwnerById(4242)?.login).toBe("leamd");
    expect(await (await ctx.app.request("/api/me", { headers: { cookie: jar } })).json()).toMatchObject({ login: "leamd" });
  });

  it("ne prend que ses propres retours : une revendication passe à « C'est moi »", async () => {
    const { ctx, exchanged } = setup({ claim: true });
    const card = await postCard(ctx, { login: "leamd" });
    const start = await ctx.app.request(`/auth/github/start?card=${card.json.id}`);
    const to = new URL(start.headers.get("location")!);
    expect(to.searchParams.get("client_id")).toBe("claim-client");
    const jar = cookiesOf(start);
    expect(jar).toContain(STATE_COOKIE);
    const back = await ctx.app.request(`/auth/github/callback?code=abc&state=${to.searchParams.get("state")}`, { headers: { cookie: jar } });
    expect(back.headers.get("location")).toBe(`${BASE}/c/${card.json.id}?claim=ok&as=leamd`);
    expect(exchanged[0]!.get("client_id")).toBe("claim-client");
    expect(cookiesOf(back, jar)).not.toContain(GH_ENTER_COOKIE);
  });

  it("refus, état d'un autre navigateur, compte illisible : pas de pseudo", async () => {
    const { ctx } = setup({ user: { login: "pas un pseudo", id: 1 } });
    const start = await ctx.app.request("/auth/github/enter?return=/c/abc");
    const state = new URL(start.headers.get("location")!).searchParams.get("state");
    const refused = await ctx.app.request(`/auth/github/callback?error=access_denied&state=${state}`, { headers: { cookie: cookiesOf(start) } });
    expect(refused.headers.get("location")).toBe(`${BASE}/c/abc?gh=cancel`);

    // L'état d'un autre navigateur : sans le cookie, ce n'est pas une entrée.
    const other = await ctx.app.request("/auth/github/enter");
    const stolen = new URL(other.headers.get("location")!).searchParams.get("state");
    const noCookie = await ctx.app.request(`/auth/github/callback?code=abc&state=${stolen}`);
    expect(cookiesOf(noCookie)).not.toContain(GH_ENTER_COOKIE);
    expect(noCookie.headers.get("location") ?? "").not.toContain("gh=1");

    const { back, jar } = await signIn(ctx);
    expect(back.headers.get("location")).toBe(`${BASE}/?gh=error`);
    expect((await whoami(ctx, jar)).json).toEqual({ signedIn: false });
    expect((await whoami(ctx, `${GH_ENTER_COOKIE}=faux.faux`)).json).toEqual({ signedIn: false });
  });

  it("une adresse de retour étrangère est ignorée, et vingt connexions par IP et par jour", async () => {
    const { ctx } = setup();
    expect((await signIn(ctx, "https://evil.example/")).back.headers.get("location")).toBe(`${BASE}/?gh=1`);
    for (let i = 1; i < GH_ENTER_STARTS_PER_DAY; i++) await ctx.app.request("/auth/github/enter");
    expect((await ctx.app.request("/auth/github/enter")).headers.get("location")).toBe(`${BASE}/?gh=error`);
  });

  it("le bouton n'existe que si l'application OAuth est configurée", async () => {
    const on = setup().ctx;
    expect(await (await on.app.request("/api/config")).json()).toMatchObject({ githubLogin: true });
    const off = setup({ login: false }).ctx;
    expect(await (await off.app.request("/api/config")).json()).toMatchObject({ githubLogin: false });
    expect((await off.app.request("/auth/github/enter")).headers.get("location") ?? "").not.toContain("github.com");
    expect((await whoami(off, "")).json).toEqual({ signedIn: false });
  });

  it("GITHUB_OAUTH_CLIENT_ID / _SECRET, sinon l'application de « C'est moi » ; jamais un mélange des deux", () => {
    expect(githubLoginFromEnv({ GITHUB_OAUTH_CLIENT_ID: "a", GITHUB_OAUTH_CLIENT_SECRET: "b", GITHUB_CLIENT_ID: "c", GITHUB_CLIENT_SECRET: "d" })).toEqual({ clientId: "a", clientSecret: "b" });
    expect(githubLoginFromEnv({ GITHUB_CLIENT_ID: "c", GITHUB_CLIENT_SECRET: "d" })).toEqual({ clientId: "c", clientSecret: "d" });
    expect(githubLoginFromEnv({ GITHUB_OAUTH_CLIENT_ID: "a", GITHUB_CLIENT_ID: "c", GITHUB_CLIENT_SECRET: "d" })).toBeUndefined();
    expect(githubLoginFromEnv({ GITHUB_OAUTH_CLIENT_ID: "a" })).toBeUndefined();
    expect(githubLoginFromEnv({})).toBeUndefined();
  });
});
