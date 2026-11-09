// Rotation des jetons GitHub : choix du jeton, compteurs par ressource, bascule
// sur limite secondaire. Aucun appel réseau : fetch est remplacé par un faux.

import { afterEach, describe, expect, it, vi } from "vitest";
import { EngineError, graphql, makeCtx, rest } from "./http";
import { resourceOfPath, TokenPool, tokensFromEnv } from "./tokens";

const RESET = Math.floor(Date.now() / 1000) + 1800; // dans 30 min

function limitHeaders(resource: string, remaining: number, limit = 5000, reset = RESET): Record<string, string> {
  return {
    "x-ratelimit-resource": resource,
    "x-ratelimit-remaining": String(remaining),
    "x-ratelimit-limit": String(limit),
    "x-ratelimit-reset": String(reset),
  };
}

/** Faux fetch : chaque appel est noté (jeton, url) et répondu par `respond`. */
function fakeFetch(respond: (token: string, url: string, n: number) => Response) {
  const calls: { token: string; url: string }[] = [];
  const fn = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const auth = new Headers(init?.headers).get("authorization") ?? "";
    const token = auth.replace(/^bearer /i, "");
    calls.push({ token, url: String(url) });
    return respond(token, String(url), calls.length);
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("configuration des jetons", () => {
  it("lit GITHUB_TOKENS, sinon GITHUB_TOKEN, sans doublons ni vides", () => {
    expect(tokensFromEnv({ GITHUB_TOKENS: " a, b,,a ", GITHUB_TOKEN: "z" })).toEqual(["a", "b"]);
    expect(tokensFromEnv({ GITHUB_TOKEN: " z " })).toEqual(["z"]);
    expect(tokensFromEnv({ GITHUB_TOKENS: " , ", GITHUB_TOKEN: "z" })).toEqual(["z"]);
    expect(tokensFromEnv({})).toEqual([]);
  });

  it("reconnaît la ressource d'après le chemin", () => {
    expect(resourceOfPath("https://api.github.com/users/lea")).toBe("core");
    expect(resourceOfPath("https://api.github.com/search/issues?q=x")).toBe("search");
    expect(resourceOfPath("/search/code?q=x")).toBe("code_search");
    expect(resourceOfPath("/graphql")).toBe("graphql");
  });
});

describe("choix du jeton", () => {
  it("prend le jeton qui a le plus de marge d'après la dernière réponse", () => {
    const pool = new TokenPool(["a", "b", "c"]);
    const lease = (t: string) => ({ slot: ["a", "b", "c"].indexOf(t), token: t, resource: "core" });
    pool.record(lease("a"), new Headers(limitHeaders("core", 120)));
    pool.record(lease("b"), new Headers(limitHeaders("core", 4000)));
    pool.record(lease("c"), new Headers(limitHeaders("core", 900)));
    const got = pool.acquire("core");
    expect(got.lease?.token).toBe("b");
  });

  it("répartit à tour de rôle quand les marges sont égales", () => {
    const pool = new TokenPool(["a", "b"]);
    const picks = [1, 2, 3, 4].map(() => pool.acquire("core").lease?.token);
    expect(picks).toEqual(["a", "b", "a", "b"]);
  });

  it("tient un compteur séparé par ressource et par jeton", () => {
    const pool = new TokenPool(["a", "b"]);
    // a : REST épuisé, GraphQL intact ; b : l'inverse.
    pool.record({ slot: 0, token: "a", resource: "core" }, new Headers(limitHeaders("core", 0)));
    pool.record({ slot: 1, token: "b", resource: "graphql" }, new Headers(limitHeaders("graphql", 0)));
    expect(pool.acquire("core").lease?.token).toBe("b");
    expect(pool.acquire("graphql").lease?.token).toBe("a");
    // La recherche (30 par minute) a son propre compteur, épuisé sur les deux.
    pool.record({ slot: 0, token: "a", resource: "search" }, new Headers(limitHeaders("search", 0, 30, RESET)));
    pool.record({ slot: 1, token: "b", resource: "search" }, new Headers(limitHeaders("search", 0, 30, RESET)));
    const search = pool.acquire("search");
    expect(search.lease).toBeNull();
    expect(pool.acquire("core").lease?.token).toBe("b");
  });

  it("suit la ressource annoncée par x-ratelimit-resource, pas celle supposée", () => {
    const pool = new TokenPool(["a"]);
    pool.record({ slot: 0, token: "a", resource: "core" }, new Headers(limitHeaders("search", 3, 30)));
    const snap = pool.snapshot()[0]!.counters;
    expect(snap.search?.remaining).toBe(3);
    expect(snap.core).toBeUndefined();
  });

  it("recompte plein un compteur dont la fenêtre est passée", () => {
    let now = 1_000_000;
    const pool = new TokenPool(["a"], () => now);
    pool.record({ slot: 0, token: "a", resource: "core" }, new Headers(limitHeaders("core", 0, 5000, 1060)));
    expect(pool.acquire("core").lease).toBeNull();
    now = 1_061_000;
    expect(pool.acquire("core").lease?.token).toBe("a");
  });

  it("dit quand une fiche peut démarrer, et combien attendre sinon", () => {
    let now = 1_000_000;
    const pool = new TokenPool(["a", "b"], () => now);
    expect(pool.readiness({ core: 100, graphql: 10 })).toEqual({ ok: true });
    pool.record({ slot: 0, token: "a", resource: "core" }, new Headers(limitHeaders("core", 50, 5000, 1600)));
    pool.record({ slot: 1, token: "b", resource: "core" }, new Headers(limitHeaders("core", 20, 5000, 1300)));
    expect(pool.readiness({ core: 100, graphql: 10 })).toEqual({ ok: false, waitMs: 300_000 });
    expect(pool.readiness({ core: 30 })).toEqual({ ok: true });
    now = 1_300_000;
    expect(pool.readiness({ core: 100 })).toEqual({ ok: true });
  });
});

describe("appels REST et GraphQL", () => {
  it("bascule sur un autre jeton après un 403 de limite secondaire", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const calls = fakeFetch((token) =>
      token === "secret-a"
        ? json({ message: "You have exceeded a secondary rate limit." }, 403, { "retry-after": "60" })
        : json({ login: "lea" }, 200, limitHeaders("core", 4999)),
    );
    const pool = new TokenPool(["secret-a", "secret-b"]);
    const ctx = makeCtx(pool);
    const res = await rest<{ login: string }>(ctx, "/users/lea");
    expect(res.data?.login).toBe("lea");
    expect(calls.map((c) => c.token)).toEqual(["secret-a", "secret-b"]);
    // Le jeton a est écarté pour la minute demandée : l'appel suivant va directement sur b.
    expect(pool.snapshot()[0]!.blockedUntil).toBeGreaterThan(Date.now() + 50_000);
    await rest(ctx, "/users/lea");
    expect(calls.at(-1)?.token).toBe("secret-b");
    // Jamais un jeton dans les journaux.
    expect(warn).toHaveBeenCalled();
    for (const args of warn.mock.calls) expect(args.join(" ")).not.toMatch(/secret-/);
  });

  it("bascule aussi sur un 429 et sur un compteur primaire à zéro", async () => {
    const calls = fakeFetch((token) => {
      if (token === "a") return json({ message: "API rate limit exceeded" }, 403, limitHeaders("core", 0));
      if (token === "b") return json({ message: "Too many requests" }, 429);
      return json({ ok: 1 }, 200, limitHeaders("core", 10));
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const pool = new TokenPool(["a", "b", "c"]);
    const res = await rest<{ ok: number }>(makeCtx(pool), "/users/lea");
    expect(res.data?.ok).toBe(1);
    expect(calls.map((c) => c.token)).toEqual(["a", "b", "c"]);
    expect(pool.snapshot()[0]!.counters.core?.remaining).toBe(0);
  });

  it("tous les jetons limités : EngineError rate_limited, sans jeton dans le message", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fakeFetch(() => json({ message: "secondary rate limit" }, 403, { "retry-after": "120" }));
    const ctx = makeCtx(new TokenPool(["secret-a", "secret-b"]));
    const err = await rest(ctx, "/users/lea").catch((e) => e);
    expect(err).toBeInstanceOf(EngineError);
    expect((err as EngineError).code).toBe("rate_limited");
    expect(String((err as Error).message)).not.toMatch(/secret-/);
  });

  it("un 403 qui n'est pas une limite reste une réponse normale", async () => {
    fakeFetch(() => json({ message: "Resource not accessible" }, 403));
    const res = await rest(makeCtx(new TokenPool(["a", "b"])), "/repos/x/y/contents/z");
    expect(res.status).toBe(403);
    expect(res.data).toBeNull();
  });

  it("GraphQL : compteur à part, bascule sur une erreur RATE_LIMITED", async () => {
    const calls = fakeFetch((token) =>
      token === "a"
        ? json({ errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }] }, 200, limitHeaders("graphql", 0))
        : json({ data: { viewer: { login: "lea" } } }, 200, limitHeaders("graphql", 4000)),
    );
    const pool = new TokenPool(["a", "b"]);
    const res = await graphql<{ viewer: { login: string } }>(makeCtx(pool), "query{viewer{login}}");
    expect(res.data?.viewer.login).toBe("lea");
    expect(calls.map((c) => c.token)).toEqual(["a", "b"]);
    const [a, b] = pool.snapshot();
    expect(a!.counters.graphql?.remaining).toBe(0);
    expect(b!.counters.graphql?.remaining).toBe(4000);
    // REST reste disponible sur a.
    expect(a!.counters.core).toBeUndefined();
    expect(pool.acquire("core").lease).not.toBeNull();
  });

  it("un jeton refusé (401) est écarté quand d'autres restent", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const calls = fakeFetch((token) => (token === "bad" ? json({ message: "Bad credentials" }, 401) : json({ login: "lea" })));
    const res = await rest<{ login: string }>(makeCtx(new TokenPool(["bad", "good"])), "/users/lea");
    expect(res.data?.login).toBe("lea");
    expect(calls.map((c) => c.token)).toEqual(["bad", "good"]);
  });

  it("sans jeton : appel anonyme, sans en-tête authorization", async () => {
    const calls = fakeFetch(() => json({ login: "lea" }));
    const ctx = makeCtx("");
    await rest(ctx, "/users/lea");
    expect(calls[0]!.token).toBe("");
    expect((await graphql(ctx, "query{viewer{login}}")).data).toBeNull();
    expect(calls).toHaveLength(1);
  });
});
