// Collecte complète contre un faux GitHub (fetch remplacé, aucun appel réel) :
// compte les requêtes d'une fiche, et vérifie ce que la collecte garde.

import { afterEach, describe, expect, it, vi } from "vitest";
import gaearon from "../scoring/__fixtures__/gaearon.facts.json";
import qwerty from "../scoring/__fixtures__/qwerty.facts.json";
import { scoreGithub } from "../scoring/index";
import { collectGithub, externalPRList, homepageOf } from "./collect";
import type { GithubFacts } from "./facts";

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

  it("garde la destination des PR fusionnées : dépôt, étoiles, date, jamais un dépôt privé", async () => {
    const { facts, seen } = await collect();
    const search = seen.graphql.find((q) => q.includes("search("))!;
    expect(search).toContain("first:100");
    expect(search).toMatch(/nameWithOwner stargazerCount isPrivate/);
    expect(facts.externalMergedPRs).toBe(3);
    expect(facts.externalMergedPRList).toEqual([
      { repo: "agda/agda-stdlib", stars: 640, mergedAt: "2025-10-02T10:00:00Z", number: 41 },
      { repo: "vitejs/vite", stars: 70000, mergedAt: "2025-03-01T10:00:00Z", number: 12 },
    ]);
  });
});

describe("arbres et dépôts", () => {
  it("les fichiers d'agent d'IA d'un dépôt actif, lus dans l'arbre déjà demandé", async () => {
    const { facts } = await collect();
    expect(facts.trees.find((t) => t.repo === "atelier")?.agentFiles).toEqual([".cursor/rules/style.mdc", "CLAUDE.md"]);
    expect(facts.trees.find((t) => t.repo === "notes")?.agentFiles).toEqual([]);
  });
});

describe("site d'un dépôt (homepage)", () => {
  it("gardé depuis la liste des dépôts, déjà dans la réponse", async () => {
    const { facts } = await collect();
    const by = Object.fromEntries(facts.repos.map((r) => [r.name, r.homepage]));
    expect(by).toEqual({ atelier: "https://atelier.example.dev/", notes: null, vieux: null });
  });
  it.each([
    ["https://atelier.example.dev", "https://atelier.example.dev/"],
    ["atelier.example.dev/docs", "https://atelier.example.dev/docs"],
    ["http://x.example.org", "http://x.example.org/"],
    ["", null],
    ["   ", null],
    [null, null],
    ["javascript:void(0)", null],
    ["ftp://files.example.org", null],
    ["localhost", null],
    ["pas une adresse", null],
    ["https://user:pw@x.example.org", null],
  ])("homepageOf(%j) = %j", (v, out) => {
    expect(homepageOf(v)).toBe(out);
  });
});

describe("faits d'avant et faits d'après (§18.37)", () => {
  it("les faits déjà en base, sans les nouveaux champs, se relisent et se notent", () => {
    for (const f of [gaearon, qwerty] as unknown as GithubFacts[]) {
      expect(f.externalMergedPRList).toBeUndefined();
      expect(f.repos.every((r) => r.homepage === undefined)).toBe(true);
      expect(f.trees.every((t) => t.agentFiles === undefined)).toBe(true);
      const card = scoreGithub(f, null, { lang: "fr", judgedInSeconds: 10 });
      expect(card.overall).toBeGreaterThan(0);
    }
  });

  it("les faits collectés avec les nouveaux champs se notent aussi, passés en JSON comme en base", async () => {
    const { facts } = await collect();
    const stored = JSON.parse(JSON.stringify(facts)) as GithubFacts;
    expect(stored.externalMergedPRList).toHaveLength(2);
    expect(scoreGithub(stored, null, { lang: "fr", judgedInSeconds: 10 }).overall).toBeGreaterThan(0);
  });
});

describe("destinations des PR, nœuds bruts", () => {
  it("ignore l'illisible, ses propres dépôts, le privé ; cent au plus, les plus récentes d'abord", () => {
    const node = (repo: string, mergedAt: string, extra: object = {}) => ({ mergedAt, repository: { nameWithOwner: repo, stargazerCount: 5, isPrivate: false }, ...extra });
    expect(
      externalPRList(
        [
          null,
          {},
          { mergedAt: "2025-01-01T00:00:00Z" },
          node("pas un dépôt", "2025-01-01T00:00:00Z"),
          node("a/b", "pas une date"),
          node(`${LOGIN.toUpperCase()}/perso`, "2025-01-01T00:00:00Z"),
          { mergedAt: "2025-01-01T00:00:00Z", repository: { nameWithOwner: "x/y", stargazerCount: 1 } }, // isPrivate inconnu : écarté
          node("old/one", "2024-01-01T00:00:00Z", { number: 7 }),
          node("new/one", "2025-06-01T00:00:00Z"),
        ],
        LOGIN,
      ),
    ).toEqual([
      { repo: "new/one", stars: 5, mergedAt: "2025-06-01T00:00:00Z" },
      { repo: "old/one", stars: 5, mergedAt: "2024-01-01T00:00:00Z", number: 7 },
    ]);
    const many = Array.from({ length: 150 }, (_, i) => node(`o/r${i}`, new Date(Date.UTC(2020, 0, 1 + i)).toISOString()));
    const kept = externalPRList(many, LOGIN);
    expect(kept).toHaveLength(100);
    expect(kept[0]!.repo).toBe("o/r149");
  });
});

// Le barème lit ces champs sous leurs noms typés (scoring/grid.ts) : partis des
// faits collectés sur le faux GitHub, chacun ouvre son niveau, et le retirer le
// referme. Si la collecte ou la grille renomme le champ, ces tests tombent.
describe("de la collecte à la grille (§18.37)", () => {
  const crit = (f: GithubFacts, code: string) => scoreGithub(JSON.parse(JSON.stringify(f)) as GithubFacts, null, { lang: "fr", judgedInSeconds: 10 }).grid!.criteria.find((c) => c.code === code)!;

  it("externalMergedPRList : une PR fusionnée dans un projet de 1 000 étoiles (vitejs/vite) ouvre le 8 de l'open source", async () => {
    const { facts } = await collect();
    expect(crit(facts, "OSS").score).toBe(8);
    const { externalMergedPRList: _l, ...before } = facts;
    // Sans la destination, les trois PR ne valent que leur nombre.
    expect(crit(before, "OSS").score).toBe(2);
  });

  it("agentFiles : « IA dans l'atelier » sur la stack, sans toucher la note", async () => {
    const { facts } = await collect();
    const stk = crit(facts, "STK");
    expect(stk.flags.map((x) => x.fr)).toContain("IA dans l'atelier : des fichiers d'agent dans atelier.");
    const without = { ...facts, trees: facts.trees.map(({ agentFiles: _a, ...t }) => t) };
    const bare = crit(without, "STK");
    expect(bare.flags.map((x) => x.fr).filter((x) => x.startsWith("IA dans l'atelier"))).toEqual([]);
    expect(bare.score).toBe(stk.score);
  });

  it("homepage : un site en ligne publie le projet et ouvre le 8 de l'ownership", async () => {
    const { facts } = await collect();
    // Un projet porté plus d'un an, 150 commits, 120 étoiles, aucune release : seul son site le dit publié.
    const used = { ...facts, repos: facts.repos.map((r) => (r.name === "atelier" ? { ...r, commitCount: 150, stars: 120, releaseDates: [] } : r)) };
    expect(used.repos.find((r) => r.name === "atelier")!.homepage).toBe("https://atelier.example.dev/");
    expect(crit(used, "OWN").score).toBe(8);
    const offline = { ...used, repos: used.repos.map((r) => (r.name === "atelier" ? { ...r, homepage: null } : r)) };
    expect(crit(offline, "OWN").score).toBe(6);
  });
});

const BASELINE = { rest: 18, graphql: 17, raw: 1, other: 4 };
