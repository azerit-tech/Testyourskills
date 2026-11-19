// GET /api/search/github (SPEC §18.80) : les suggestions du champ « Ton nom ou
// pseudo », sans un seul appel réel à GitHub.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { GithubSuggestion } from "../../../shared/entry";
import { searchGithubUsers, userQuery } from "../github/searchUsers";
import { GITHUB_SEARCHES_PER_IP } from "./githubSearch";
import { setupEntry, type EntryCtx } from "./testing";

const LEA: GithubSuggestion = { login: "leamd", name: "Léa Martin", avatarUrl: "https://avatars.githubusercontent.com/u/1?s=96" };

const ctxs: EntryCtx[] = [];
afterEach(() => {
  while (ctxs.length) ctxs.pop()!.store.close();
  vi.unstubAllGlobals();
});

function setup(reply: (q: string) => GithubSuggestion[] | Error = () => [LEA]) {
  const asked: string[] = [];
  const ctx = setupEntry({
    app: {
      githubUserSearch: async (_auth, q) => {
        asked.push(q);
        const r = reply(q);
        if (r instanceof Error) throw r;
        return r;
      },
    },
  });
  ctxs.push(ctx);
  return { ctx, asked };
}

const search = async (ctx: EntryCtx, q: string, ip = "1.1.1.1") => {
  const res = await ctx.app.request(`/api/search/github?q=${encodeURIComponent(q)}`, { headers: { "x-forwarded-for": ip } });
  return { json: (await res.json()) as { results: GithubSuggestion[] }, res };
};

describe("GET /api/search/github", () => {
  it("rend photo, pseudo et nom, cinq lignes au plus, et garde la réponse dix minutes", async () => {
    const { ctx, asked } = setup(() => Array.from({ length: 6 }, (_, i) => ({ ...LEA, login: `leamd${i}` })));
    const first = await search(ctx, "Léa Martin");
    expect(first.json.results).toHaveLength(5);
    expect(first.json.results[0]).toEqual({ login: "leamd0", name: "Léa Martin", avatarUrl: LEA.avatarUrl });
    expect(first.res.headers.get("cache-control")).toBe("private, max-age=300");
    await search(ctx, "léa  martin");
    expect(asked).toEqual(["Léa Martin"]);
  });

  it("moins de trois frappes, ou une adresse : rien, sans appel", async () => {
    const { ctx, asked } = setup();
    expect((await search(ctx, "le")).json).toEqual({ results: [] });
    expect((await search(ctx, "")).json).toEqual({ results: [] });
    expect(asked).toHaveLength(0);
  });

  it("GitHub muet ou limite atteinte : liste vide, jamais d'erreur, rien en cache", async () => {
    const { ctx, asked } = setup(() => Object.assign(new Error("rate"), { code: "rate_limited" }));
    const { json, res } = await search(ctx, "leamd");
    expect(res.status).toBe(200);
    expect(json).toEqual({ results: [] });
    expect(res.headers.get("cache-control")).toBe("no-store");
    await search(ctx, "leamd");
    expect(asked).toHaveLength(2);
  });

  it("une limite par IP et par jour, sans toucher les autres", async () => {
    const { ctx, asked } = setup();
    for (let i = 0; i < GITHUB_SEARCHES_PER_IP; i++) await search(ctx, `lea${i}`);
    expect((await search(ctx, "encore")).json).toEqual({ results: [] });
    expect(asked).toHaveLength(GITHUB_SEARCHES_PER_IP);
    expect((await search(ctx, "encore", "2.2.2.2")).json.results).toHaveLength(1);
  });
});

describe("la recherche GitHub elle-même", () => {
  it("ce qu'on cherche : des mots, jamais un filtre ni une adresse", () => {
    expect(userQuery("  @leamd ")).toBe("leamd");
    expect(userQuery("Léa  Martin")).toBe("Léa Martin");
    expect(userQuery('lea" org:github')).toBe("lea org github");
    expect(userQuery("le")).toBeNull();
    expect(userQuery("x".repeat(61))).toBeNull();
    expect(userQuery(12)).toBeNull();
  });

  it("avec un jeton : GraphQL, les personnes seulement, le nom avec le pseudo", async () => {
    const bodies: { query: string; variables: { q: string; n: number } }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      expect(String(url)).toBe("https://api.github.com/graphql");
      expect(new Headers(init.headers).get("authorization")).toBe("bearer ghp_test");
      bodies.push(JSON.parse(String(init.body)));
      return new Response(
        JSON.stringify({
          data: {
            search: {
              nodes: [
                { __typename: "User", login: "leamd", name: " Léa Martin ", avatarUrl: "https://avatars.githubusercontent.com/u/1?s=96" },
                { __typename: "Organization" },
                { __typename: "User", login: "lea-sans-nom", name: null, avatarUrl: "https://avatars.githubusercontent.com/u/2?s=96" },
                null,
              ],
            },
          },
        }),
        { status: 200, headers: { "x-ratelimit-remaining": "4999", "x-ratelimit-resource": "graphql" } },
      );
    });
    const found = await searchGithubUsers("ghp_test", "Léa Martin");
    expect(bodies[0]!.variables).toEqual({ q: "Léa Martin in:login in:name type:user", n: 6 });
    expect(found).toEqual([
      { login: "leamd", name: "Léa Martin", avatarUrl: "https://avatars.githubusercontent.com/u/1?s=96" },
      { login: "lea-sans-nom", name: null, avatarUrl: "https://avatars.githubusercontent.com/u/2?s=96" },
    ]);
  });

  it("sans jeton : la recherche REST, sans les noms", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      expect(String(url)).toContain("/search/users?q=leamd%20in%3Alogin%20in%3Aname%20type%3Auser&per_page=6");
      return new Response(JSON.stringify({ items: [{ login: "leamd", avatar_url: "https://avatars.githubusercontent.com/u/1?v=4", type: "User" }, { login: "azerit", type: "Organization" }] }), { status: 200 });
    });
    expect(await searchGithubUsers("", "leamd")).toEqual([{ login: "leamd", name: null, avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4" }]);
  });
});
