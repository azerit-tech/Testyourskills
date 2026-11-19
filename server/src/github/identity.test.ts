// Le GitHub d'après l'identité (SPEC §18.80) : l'email est une preuve, le nom un
// indice, et au moindre doute rien. Aucun appel réel à GitHub.

import { afterEach, describe, expect, it, vi } from "vitest";
import { githubByEmail, githubByName, resolveGithubIdentity } from "./identity";

afterEach(() => vi.unstubAllGlobals());

type Reply = unknown | ((url: URL, body: { variables?: { q?: string } } | null) => unknown);

/** Faux GitHub : une réponse par chemin (`/search/commits`, `/search/users`, `/graphql`, `/users/x`). */
function github(routes: Record<string, Reply>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const body = init?.body ? (JSON.parse(String(init.body)) as { variables?: { q?: string } }) : null;
    calls.push(url.pathname === "/graphql" ? `graphql ${body?.variables?.q}` : `${url.pathname}?q=${url.searchParams.get("q") ?? ""}`);
    const route = routes[url.pathname];
    if (route === undefined) return new Response("{}", { status: 404 });
    if (route instanceof Error) throw route;
    const data = typeof route === "function" ? (route as (u: URL, b: unknown) => unknown)(url, body) : route;
    return new Response(JSON.stringify(data), { status: 200, headers: { "x-ratelimit-remaining": "4999" } });
  });
  return calls;
}

const user = (login: string, type = "User") => ({ login, type });
const nodes = (...list: { login: string; name: string | null; org?: boolean }[]) => ({
  data: { search: { nodes: list.map((n) => (n.org ? { __typename: "Organization" } : { __typename: "User", login: n.login, name: n.name })) } },
});

describe("par l'email", () => {
  it("un commit signé de cette adresse, rattaché par GitHub à un compte : c'est lui", async () => {
    const calls = github({ "/search/commits": { items: [{ author: user("Camille-Dev") }, { author: null }, { author: user("camille-dev") }] } });
    expect(await githubByEmail("ghp_t", " camille@ardent.dev ")).toBe("Camille-Dev");
    expect(calls).toEqual(["/search/commits?q=author-email:camille@ardent.dev"]);
  });

  it("pas de commit : le compte qui affiche cette adresse", async () => {
    const calls = github({ "/search/commits": { items: [] }, "/search/users": { items: [user("camille-dev")] } });
    expect(await githubByEmail("ghp_t", "camille@ardent.dev")).toBe("camille-dev");
    expect(calls[1]).toBe("/search/users?q=camille@ardent.dev in:email");
  });

  it("deux comptes pour une adresse, un robot, une organisation : rien", async () => {
    github({ "/search/commits": { items: [{ author: user("un") }, { author: user("deux") }] }, "/search/users": { items: [user("un")] } });
    expect(await githubByEmail("ghp_t", "camille@ardent.dev")).toBeNull();
    github({ "/search/commits": { items: [{ author: user("dependabot[bot]", "Bot") }] }, "/search/users": { items: [user("azerit", "Organization")] } });
    expect(await githubByEmail("ghp_t", "camille@ardent.dev")).toBeNull();
    github({ "/search/commits": { items: [] }, "/search/users": { items: [user("un"), user("deux")] } });
    expect(await githubByEmail("ghp_t", "camille@ardent.dev")).toBeNull();
  });

  it("une adresse qui se lirait comme un filtre n'est jamais envoyée", async () => {
    const calls = github({});
    for (const bad of ["a b@x.fr", 'a"@x.fr', "a@x.fr user:torvalds", "pas-une-adresse", "a@x"]) expect(await githubByEmail("ghp_t", bad)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("GitHub muet : rien, sans erreur, et l'adresse hors des journaux", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    github({ "/search/commits": new Error("réseau") });
    expect(await githubByEmail("ghp_t", "camille@ardent.dev")).toBeNull();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("camille@ardent.dev");
    warn.mockRestore();
  });
});

describe("par le nom", () => {
  it("un seul compte de personne porte ce nom complet : c'est un indice", async () => {
    const calls = github({ "/graphql": nodes({ login: "camille-dev", name: "Camille ARDENT" }, { login: "ardent-co", name: "Ardent", org: true }, { login: "cam", name: "Camille" }, { login: "sans", name: null }) });
    expect(await githubByName("ghp_t", "Camille Ardent")).toBe("camille-dev");
    expect(calls).toEqual(['graphql "Camille Ardent" in:name']);
  });

  it("accents et nom d'usage : les mots de l'un sont dans l'autre", async () => {
    github({ "/graphql": nodes({ login: "lea", name: "Lea Martin-Dupont" }) });
    expect(await githubByName("ghp_t", "Léa Martin")).toBe("lea");
  });

  it("deux homonymes, ou aucun : rien", async () => {
    github({ "/graphql": nodes({ login: "un", name: "Camille Ardent" }, { login: "deux", name: "camille ardent" }) });
    expect(await githubByName("ghp_t", "Camille Ardent")).toBeNull();
    github({ "/graphql": nodes({ login: "autre", name: "Camille Autre" }) });
    expect(await githubByName("ghp_t", "Camille Ardent")).toBeNull();
  });

  it("il faut deux mots d'au moins deux lettres : sinon aucun appel", async () => {
    const calls = github({ "/graphql": nodes({ login: "x", name: "Camille" }) });
    for (const short of ["Camille", "Camille A", "C A", "  ", "x".repeat(90) + " yy"]) expect(await githubByName("ghp_t", short)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("un guillemet dans le nom ne sort pas de la recherche", async () => {
    const calls = github({ "/graphql": nodes() });
    await githubByName("ghp_t", 'Camille" user:torvalds "Ardent');
    expect(calls).toEqual(['graphql "Camille user:torvalds Ardent" in:name']);
  });

  it("sans jeton : la recherche REST, puis le nom de chaque compte", async () => {
    const calls = github({
      "/search/users": { items: [user("camille-dev"), user("ardent-co", "Organization"), user("autre")] },
      "/users/camille-dev": { login: "camille-dev", type: "User", name: "Camille Ardent" },
      "/users/autre": { login: "autre", type: "User", name: "Camille Autre" },
    });
    expect(await githubByName("", "Camille Ardent")).toBe("camille-dev");
    expect(calls.map((c) => c.split("?")[0])).toEqual(["/search/users", "/users/camille-dev", "/users/autre"]);
  });
});

describe("l'email d'abord, le nom ensuite", () => {
  it("l'email suffit : le nom n'est pas cherché", async () => {
    const calls = github({ "/search/commits": { items: [{ author: user("par-email") }] }, "/graphql": nodes({ login: "par-nom", name: "Camille Ardent" }) });
    expect(await resolveGithubIdentity("ghp_t", { name: "Camille Ardent", email: "camille@ardent.dev" })).toEqual({ login: "par-email", how: "email" });
    expect(calls).toHaveLength(1);
  });

  it("l'email ne donne rien, ou LinkedIn n'en rend pas : le nom, dit comme tel", async () => {
    github({ "/search/commits": { items: [] }, "/search/users": { items: [] }, "/graphql": nodes({ login: "par-nom", name: "Camille Ardent" }) });
    expect(await resolveGithubIdentity("ghp_t", { name: "Camille Ardent", email: "camille@ardent.dev" })).toEqual({ login: "par-nom", how: "name" });
    expect(await resolveGithubIdentity("ghp_t", { name: "Camille Ardent" })).toEqual({ login: "par-nom", how: "name" });
    github({ "/graphql": nodes() });
    expect(await resolveGithubIdentity("ghp_t", { name: "Camille Ardent" })).toBeNull();
  });
});
