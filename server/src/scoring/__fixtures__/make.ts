// Fabriques de faits synthétiques pour les tests du barème.

import type { CvReading, CvTextCounts } from "../../../../shared/readings";
import type { GithubFacts, GithubRepo, RepoTree } from "../../github/facts";

export const NOW = "2026-10-14T12:00:00Z";
const DAY = 86_400_000;
export const daysAgo = (d: number) => new Date(Date.parse(NOW) - d * DAY).toISOString();

export function repo(name: string, p: Partial<GithubRepo> = {}): GithubRepo {
  return {
    name,
    fullName: `dev/${name}`,
    description: null,
    language: "TypeScript",
    stars: 0,
    forks: 0,
    pushedAt: daysAgo(10),
    createdAt: daysAgo(800),
    archived: false,
    topics: [],
    license: null,
    sizeKb: 100,
    defaultBranch: "main",
    recentUserCommits: 10,
    activity: 10,
    commitCount: 50,
    languages: { TypeScript: 50_000 },
    deps: [],
    externalContributors: null,
    readmeWords: 400,
    releaseDates: [],
    ...p,
  };
}

export function tree(name: string, p: Partial<RepoTree> = {}): RepoTree {
  return {
    repo: name,
    available: true,
    truncated: false,
    entries: 100,
    testFiles: 3,
    hasTests: true,
    hasCi: true,
    tooling: ["eslint"],
    nodeModules: false,
    markers: [],
    sourceFiles: [{ path: "src/index.ts", size: 2000 }],
    ...p,
  };
}

/** Profil « moyen » : 5 repos actifs, tests et CI partout, 40 semaines actives. */
export function facts(p: Partial<GithubFacts> = {}): GithubFacts {
  const repos = p.repos ?? ["a", "b", "c", "d", "e"].map((n) => repo(n));
  const activeRepos = p.activeRepos ?? repos.slice(0, 5).map((r) => r.name);
  return {
    schema: 1,
    login: "dev",
    collectedAt: NOW,
    profile: {
      login: "dev",
      name: "Ada Lovelace",
      avatarUrl: "https://avatars.githubusercontent.com/u/1",
      bio: null,
      company: "@acme",
      followers: 10,
      createdAt: daysAgo(365 * 6),
      publicRepos: repos.length,
    },
    repoCount: repos.length,
    reposTruncated: false,
    repos,
    activeRepos,
    calendar: { available: true, weeksActive: 40, weeks: 52, totalContributions: 800 },
    activityByYear: [
      { yearsAgo: 0, contributions: 800 },
      { yearsAgo: 1, contributions: 600 },
    ],
    commits: Array.from({ length: 50 }, (_, i) => ({
      repo: activeRepos[i % activeRepos.length],
      oid: String(i).padStart(40, "0"),
      message: `Add feature number ${i} with a decent message`,
      date: "2026-10-07T10:00:00Z", // mercredi 10 h UTC
    })),
    utcOffsetMinutes: 0,
    externalMergedPRs: 2,
    firstRealCommit: { repo: "a", date: daysAgo(365.25 * 5) },
    trees: activeRepos.map((n) => tree(n)),
    ...p,
  };
}

export function cvReading(p: Partial<CvReading> = {}): CvReading {
  return {
    language: "fr",
    position: "FS",
    full_name: "Camille Roux",
    years_declared: 6,
    seniority_claimed: "senior",
    roles: [
      { title: "Développeuse senior", company: "Doctolib", start: "2022-03", end: null, responsibilities: ["API de prise de rendez-vous"] },
      { title: "Développeuse", company: "Alan", start: "2019-01", end: "2022-02", responsibilities: ["Front React"] },
    ],
    technos_listed: ["TypeScript", "React", "Node.js", "PostgreSQL"],
    technos_described: ["TypeScript", "React", "PostgreSQL"],
    tests_ci_review_mentions: [{ quote: "Mise en place de tests end-to-end avec Playwright" }],
    projects_with_dated_outcome: 2,
    writing_quality: 4,
    is_dev_profile: true,
    title_mentions_ai: false,
    describes_ai_project: false,
    school_name: "",
    school_tier: "none",
    ...p,
  };
}

export function cvCounts(p: Partial<CvTextCounts> = {}): CvTextCounts {
  return { words: 500, pages: 2, buzzwords: {}, buzzwordsPer100: 0, passionCount: 0, ...p };
}
