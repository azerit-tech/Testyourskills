// Collecte complète contre un faux GitHub (fetch remplacé, aucun appel réel) :
// compte les requêtes d'une fiche, et vérifie ce que la collecte garde.

import { afterEach, describe, expect, it, vi } from "vitest";
import { collectGithub } from "./collect";

const LOGIN = "fictif-dev";
const NOW = Date.now();
const iso = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();

const REPOS = [
  {
    name: "atelier",
    full_name: `${LOGIN}/atelier`,
    fork: false,
    description: "Un outil",
    language: "TypeScript",
    stargazers_count: 12,
    forks_count: 1,
    pushed_at: iso(2),
    created_at: iso(500),
    archived: false,
    topics: ["cli"],
    license: { spdx_id: "MIT" },
    size: 900,
    default_branch: "main",
    owner: { login: LOGIN },
    homepage: "https://atelier.example.dev",
  },
  {
    name: "notes",
    full_name: `${LOGIN}/notes`,
    fork: false,
    description: null,
    language: "Python",
    stargazers_count: 0,
    forks_count: 0,
    pushed_at: iso(40),
    created_at: iso(900),
    archived: false,
    topics: [],
    license: null,
    size: 120,
    default_branch: "main",
    owner: { login: LOGIN },
    homepage: "  ",
  },
  {
    name: "vieux",
    full_name: `${LOGIN}/vieux`,
    fork: false,
    description: null,
    language: "Go",
    stargazers_count: 3,
    forks_count: 0,
    pushed_at: iso(800),
    created_at: iso(1200),
    archived: true,
    topics: [],
    license: null,
    size: 50,
    default_branch: "master",
    owner: { login: LOGIN },
    homepage: null,
  },
];

const TREES: Record<string, { path: string; type: string; size?: number }[]> = {
  atelier: [
    { path: "src/index.ts", type: "blob", size: 4000 },
    { path: "src/index.test.ts", type: "blob", size: 2000 },
    { path: "CLAUDE.md", type: "blob", size: 900 },
    { path: ".cursor/rules/style.mdc", type: "blob", size: 300 },
    { path: ".github/workflows/ci.yml", type: "blob", size: 300 },
    { path: "package.json", type: "blob", size: 300 },
  ],
  notes: [{ path: "main.py", type: "blob", size: 3000 }],
  vieux: [{ path: "main.go", type: "blob", size: 3000 }],
};

/** Les PR fusionnées chez les autres, telles que la recherche GraphQL les rend. */
const PR_NODES = [
  { number: 41, mergedAt: "2025-10-02T10:00:00Z", repository: { nameWithOwner: "agda/agda-stdlib", stargazerCount: 640, isPrivate: false } },
  { number: 12, mergedAt: "2025-03-01T10:00:00Z", repository: { nameWithOwner: "vitejs/vite", stargazerCount: 70000, isPrivate: false } },
  { number: 3, mergedAt: "2025-01-01T10:00:00Z", repository: { nameWithOwner: "secret-org/interne", stargazerCount: 0, isPrivate: true } },
  // Un nœud vide (PR sans droit de lecture) : ignoré.
  {},
];

interface Seen {
  rest: string[];
  graphql: string[];
  raw: string[];
  other: string[];
}

const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });

function fakeGithub() {
  const seen: Seen = { rest: [], graphql: [], raw: [], other: [] };
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url === "https://api.github.com/graphql") {
      const { query } = JSON.parse(String(init?.body)) as { query: string };
      seen.graphql.push(query);
      if (query.includes("search(")) return json({ data: { search: { issueCount: 3, nodes: PR_NODES } } });
      if (query.includes("contributionsCollection(from")) return json({ data: { user: { contributionsCollection: { contributionCalendar: { totalContributions: 100 } } } } });
      if (query.includes("contributionCalendar{ totalContributions weeks")) {
        const weeks = Array.from({ length: 53 }, (_, w) => ({
          contributionDays: Array.from({ length: 7 }, (_, d) => ({ contributionCount: (w + d) % 3, date: new Date(NOW - (371 - w * 7 - d) * 86_400_000).toISOString().slice(0, 10) })),
        }));
        return json({
          data: {
            user: {
              id: "U_fictif",
              contributionsCollection: {
                contributionCalendar: { totalContributions: 300, weeks },
                commitContributionsByRepository: [{ repository: { name: "atelier", owner: { login: LOGIN } }, contributions: { totalCount: 80 } }],
              },
            },
          },
        });
      }
      if (query.includes("languages(first")) {
        const data: Record<string, unknown> = {};
        for (let i = 0; i < 8; i++) data[`r${i}`] = { languages: { edges: [{ size: 1000, node: { name: "TypeScript" } }] }, releases: { nodes: [] } };
        return json({ data });
      }
      if (query.includes("history(")) {
        return json({
          data: {
            repository: {
              defaultBranchRef: {
                target: { oid: "head0", history: { totalCount: 20, nodes: [{ oid: "c1", messageHeadline: "Ajoute le cache", authoredDate: iso(3) }] } },
              },
            },
          },
        });
      }
      return json({ data: null, errors: [{ message: "requête inconnue du faux" }] });
    }
    if (url.startsWith("https://api.github.com/")) {
      seen.rest.push(url);
      const path = url.slice("https://api.github.com".length);
      if (path === `/users/${LOGIN}`)
        return json({
          login: LOGIN,
          type: "User",
          name: "Dev Fictif",
          avatar_url: "https://avatars.example.invalid/u/1",
          bio: null,
          blog: "",
          company: null,
          followers: 3,
          created_at: iso(1500),
          public_repos: REPOS.length,
          node_id: "U_fictif",
        });
      if (path.startsWith(`/users/${LOGIN}/repos`)) return json(REPOS);
      if (path === `/users/${LOGIN}/social_accounts`) return json([]);
      const tree = /^\/repos\/[^/]+\/([^/]+)\/git\/trees\//.exec(path);
      if (tree) return json({ tree: TREES[tree[1]!] ?? [], truncated: false });
      if (/\/readme$/.test(path)) return new Response("# Titre\n\nUn outil simple.", { status: 200 });
      if (/\/commits\?per_page=1&/.test(path))
        return json([{}], { link: `<https://api.github.com/x?per_page=1&page=2>; rel="next", <https://api.github.com/x?per_page=1&page=20>; rel="last"` });
      if (/\/commits\?/.test(path)) return json([]);
      if (/\/contributors/.test(path)) return json([{ login: "complice", type: "User", contributions: 4 }]);
      return new Response("", { status: 404 });
    }
    if (url.startsWith("https://raw.githubusercontent.com/")) {
      seen.raw.push(url);
      if (url.endsWith("/package.json")) return new Response('{"dependencies":{"hono":"4"}}', { status: 200 });
      return new Response("", { status: 404 });
    }
    seen.other.push(url);
    if (url.endsWith(".patch")) return new Response("From c1\nDate: Mon, 13 Oct 2026 23:53:40 +0200\n", { status: 200 });
    return new Response("", { status: 404 });
  };
  return { impl, seen };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function collect() {
  const f = fakeGithub();
  vi.stubGlobal("fetch", f.impl);
  const facts = await collectGithub(LOGIN, { token: "ghp_test_not_a_real_token" });
  return { facts, seen: f.seen };
}

describe("collecte complète, faux GitHub", () => {
  it("le nombre de requêtes d'une fiche ne bouge pas", async () => {
    const { seen } = await collect();
    // Les PR externes : une seule requête de recherche, comme avant (le compte seul).
    expect(seen.graphql.filter((q) => q.includes("search("))).toHaveLength(1);
    // Référence prise avant l'ajout des destinations de PR, des fichiers d'agent et de `homepage`.
    expect({ rest: seen.rest.length, graphql: seen.graphql.length, raw: seen.raw.length, other: seen.other.length }).toEqual(BASELINE);
  });
});

const BASELINE = { rest: 18, graphql: 17, raw: 1, other: 4 };
