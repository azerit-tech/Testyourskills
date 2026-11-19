// Mesures dérivées des faits GitHub, partagées par le barème, les statuts et le poste.
// Pur et déterministe : « maintenant » = facts.collectedAt.

import type { GithubFacts, GithubRepo, RepoTree } from "../github/facts";
import { SCORING } from "./config";

const DAY = 86_400_000;
const YEAR = 365.25 * DAY;
const G = SCORING.github;

const LAZY_RE = new RegExp(G.lazyCommit.pattern, "i");
const TUTORIAL_RE = new RegExp(G.tutorial.pattern, "i");

export function isLazyCommit(message: string): boolean {
  const m = message.trim();
  return m.length < G.lazyCommit.minLength || LAZY_RE.test(m);
}

export function isTutorialRepo(r: Pick<GithubRepo, "name" | "commitCount">): boolean {
  return TUTORIAL_RE.test(r.name) && r.commitCount !== null && r.commitCount < G.tutorial.maxCommits;
}

export interface GithubMetrics {
  now: number;
  accountYears: number;
  repoCount: number;
  listedRepos: number;
  active: GithubRepo[];
  activeTrees: RepoTree[];
  /** Repos actifs dont l'arbre a été lu. */
  treesAnalyzed: number;
  testsRepos: number;
  ciRepos: number;
  toolingRepos: number;
  nodeModulesRepos: number;
  toolingNames: string[];
  activeWithinArchWindow: number;
  readmeKnown: number;
  readmeLongRepos: number;
  readmeWordsActive: number;
  commitsSample: number;
  lazyCount: number;
  lazyShare: number | null;
  lazyExamples: string[];
  readableRepos: number;
  nightCount: number;
  fridayCount: number;
  nightShare: number | null;
  fridayShare: number | null;
  calendarAvailable: boolean;
  weeksActive: number;
  totalContributions: number;
  releasesLastYear: number;
  firstCommitDate: string | null;
  firstCommitYears: number | null;
  maxRepoCommits: number | null;
  /** Les commits de tous les dépôts publics ; null si l'un d'eux n'a pas été compté. */
  allRepoCommits: number | null;
  languageBytes: Record<string, number>;
  languagesOverMin: string[];
  mainLanguage: string | null;
  tutorialRepos: string[];
  tutorialShare: number;
  starsTotal: number;
  aliveCount: number;
  externalPRs: number;
  maxExternal: { repo: string; n: number } | null;
  frontFrameworks: string[];
  oldActivityShare: number | null;
  /** Part ancienne au-dessus du seuil et activité récente modeste (carte Flashback, statut Archéologue). */
  flashback: boolean;
  mainRepo: GithubRepo | null;
  hasAiRepo: boolean;
}

export function deriveGithub(f: GithubFacts): GithubMetrics {
  const now = Date.parse(f.collectedAt);
  const byName = new Map(f.repos.map((r) => [r.name, r]));
  const active = f.activeRepos.map((n) => byName.get(n)).filter((r): r is GithubRepo => !!r);
  const activeTrees = f.trees.filter((t) => t.available && f.activeRepos.includes(t.repo));

  // Arborescences
  const testsRepos = activeTrees.filter((t) => t.hasTests).length;
  const ciRepos = activeTrees.filter((t) => t.hasCi).length;
  const toolingRepos = activeTrees.filter((t) => t.tooling.length > 0).length;
  const nodeModulesRepos = activeTrees.filter((t) => t.nodeModules).length;
  const toolingNames = [...new Set(activeTrees.flatMap((t) => t.tooling))].sort();
  const activeWithinArchWindow = active.filter((r) => now - Date.parse(r.pushedAt) <= G.ARCH.activeWithinDays * DAY).length;

  // README
  const readmeKnown = active.filter((r) => r.readmeWords !== null).length;
  const readmeLongRepos = active.filter((r) => (r.readmeWords ?? 0) >= G.DOC.readmeWordsAtLeast).length;
  const readmeWordsActive = active.reduce((s, r) => s + (r.readmeWords ?? 0), 0);

  // Commits
  const lazy = f.commits.filter((c) => isLazyCommit(c.message));
  const commitsSample = f.commits.length;
  const perRepo = new Map<string, number>();
  for (const c of f.commits) perRepo.set(c.repo, (perRepo.get(c.repo) ?? 0) + 1);
  const readableRepos = [...perRepo.values()].filter((n) => n >= G.DOC.readableCommitsPerRepo).length;
  const offset = (f.utcOffsetMinutes ?? 0) * 60_000;
  let nightCount = 0;
  let fridayCount = 0;
  for (const c of f.commits) {
    const d = new Date(Date.parse(c.date) + offset);
    const h = d.getUTCHours();
    if (h >= G.nightHours.from && h < G.nightHours.to) nightCount++;
    if (d.getUTCDay() === 5 && h >= G.fridayEveningFromHour) fridayCount++;
  }

  // Releases
  const releasesLastYear = f.repos.reduce(
    (s, r) => s + (r.releaseDates ?? []).filter((d) => now - Date.parse(d) <= G.SHIP.releasesWithinDays * DAY).length,
    0,
  );

  // Ancienneté
  const firstCommitDate = f.firstRealCommit?.date ?? null;
  const firstCommitYears = firstCommitDate ? Math.max(0, (now - Date.parse(firstCommitDate)) / YEAR) : null;
  const counts = f.repos.map((r) => r.commitCount).filter((n): n is number => n !== null);
  const maxRepoCommits = counts.length ? Math.max(...counts) : null;
  const allRepoCommits = counts.length && counts.length === f.repos.length && f.repoCount <= f.repos.length ? counts.reduce((s, n) => s + n, 0) : null;

  // Langages (octets agrégés sur les repos mesurés)
  const languageBytes: Record<string, number> = {};
  for (const r of f.repos) for (const [l, b] of Object.entries(r.languages ?? {})) languageBytes[l] = (languageBytes[l] ?? 0) + b;
  const languagesOverMin = Object.entries(languageBytes)
    .filter(([, b]) => b >= G.XP.breadthMinBytes)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([l]) => l);
  const mainLanguage = mainLanguageOf(f.repos, languageBytes);

  // Tutoriels, stars, repos vivants
  const tutorialRepos = f.repos.filter(isTutorialRepo).map((r) => r.name);
  const tutorialShare = f.repos.length ? tutorialRepos.length / f.repos.length : 0;
  const starsTotal = f.repos.reduce((s, r) => s + r.stars, 0);
  const aliveCount = f.repos.filter((r) => now - Date.parse(r.pushedAt) <= G.aliveWithinDays * DAY).length;

  // Contributeurs externes
  let maxExternal: { repo: string; n: number } | null = null;
  for (const r of f.repos)
    if (r.externalContributors !== null && (!maxExternal || r.externalContributors > maxExternal.n))
      maxExternal = { repo: r.name, n: r.externalContributors };

  // Frameworks front (familles)
  const signals = new Set<string>();
  for (const r of f.repos) {
    for (const d of r.deps ?? []) signals.add(d);
    for (const t of r.topics) signals.add(t.toLowerCase());
    for (const l of Object.keys(r.languages ?? {})) signals.add("lang:" + l);
    if (r.language) signals.add("lang:" + r.language);
  }
  const frontFrameworks = Object.entries(SCORING.frontFrameworks)
    .filter(([k, list]) => !k.startsWith("_") && Array.isArray(list) && list.some((s) => signals.has(s)))
    .map(([k]) => k);

  // Activité ancienne
  let oldActivityShare: number | null = null;
  if (f.activityByYear) {
    const total = f.activityByYear.reduce((s, y) => s + y.contributions, 0);
    const old = f.activityByYear
      .filter((y) => y.yearsAgo >= SCORING.special.flashback.olderThanYears)
      .reduce((s, y) => s + y.contributions, 0);
    if (total >= SCORING.special.flashback.minContributions) oldActivityShare = old / total;
  }

  const aiDeps = new Set(SCORING.cv.aiDeps);
  const aiTopics = new Set(SCORING.cv.aiTopics);
  const hasAiRepo = f.repos.some((r) => (r.deps ?? []).some((d) => aiDeps.has(d)) || r.topics.some((t) => aiTopics.has(t.toLowerCase())));

  return {
    now,
    accountYears: Math.max(0, (now - Date.parse(f.profile.createdAt)) / YEAR),
    repoCount: f.repoCount,
    listedRepos: f.repos.length,
    active,
    activeTrees,
    treesAnalyzed: activeTrees.length,
    testsRepos,
    ciRepos,
    toolingRepos,
    nodeModulesRepos,
    toolingNames,
    activeWithinArchWindow,
    readmeKnown,
    readmeLongRepos,
    readmeWordsActive,
    commitsSample,
    lazyCount: lazy.length,
    lazyShare: commitsSample ? lazy.length / commitsSample : null,
    lazyExamples: [...new Set(lazy.map((c) => c.message.trim()))].slice(0, 3),
    readableRepos,
    nightCount,
    fridayCount,
    nightShare: commitsSample ? nightCount / commitsSample : null,
    fridayShare: commitsSample ? fridayCount / commitsSample : null,
    calendarAvailable: f.calendar.available,
    weeksActive: f.calendar.weeksActive,
    totalContributions: f.calendar.totalContributions,
    releasesLastYear,
    firstCommitDate,
    firstCommitYears,
    maxRepoCommits,
    allRepoCommits,
    languageBytes,
    languagesOverMin,
    mainLanguage,
    tutorialRepos,
    tutorialShare,
    starsTotal,
    aliveCount,
    externalPRs: f.externalMergedPRs,
    maxExternal,
    frontFrameworks,
    oldActivityShare,
    flashback:
      oldActivityShare !== null &&
      oldActivityShare >= SCORING.special.flashback.oldShareAtLeast &&
      f.calendar.weeksActive <= SCORING.special.flashback.maxWeeksActive,
    mainRepo: active[0] ?? null,
    hasAiRepo,
  };
}

/**
 * Langage principal : nombre de repos où il est le langage principal, chaque repo pesant
 * base + ln(1 + activité). Un seul repo énorme ne domine pas. Langages de balisage ignorés
 * s'il existe autre chose ; égalité départagée par les octets.
 */
export function mainLanguageOf(repos: GithubRepo[], languageBytes: Record<string, number>): string | null {
  const M = SCORING.github.mainLanguage;
  const ignored = new Set(M.ignore);
  const score = new Map<string, number>();
  for (const r of repos) {
    if (!r.language) continue;
    const w = M.repoBase + M.activityLogWeight * Math.log1p(Math.max(0, r.activity));
    score.set(r.language, (score.get(r.language) ?? 0) + w);
  }
  const ranked = [...score.entries()].sort(
    (a, b) => b[1] - a[1] || (languageBytes[b[0]] ?? 0) - (languageBytes[a[0]] ?? 0) || a[0].localeCompare(b[0]),
  );
  return (ranked.find(([l]) => !ignored.has(l)) ?? ranked[0])?.[0] ?? null;
}
