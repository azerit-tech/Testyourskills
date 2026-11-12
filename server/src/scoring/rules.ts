// Règles des statuts (SPEC §5.2). Chaque clé est référencée par data/statuses.json
// (champ `rule`) ; les seuils viennent de `params`. Une règle rend les valeurs des
// placeholders si elle se déclenche, null sinon.

import type { CvReading, CvTextCounts } from "../../../shared/readings";
import type { Fact, StatCode } from "../../../shared/types";
import type { GithubFacts } from "../github/facts";
import { SCORING } from "./config";
import type { GithubMetrics } from "./derive";

/** Valeurs des placeholders ; un Fact permet un accord différent en fr et en en. */
export type Vars = Record<string, number | string | Fact>;

export interface RuleCtx {
  /** Stats de la carte en cours de notation. */
  stats: Record<StatCode, number>;
  /** Faits GitHub : la carte GitHub, ou le GitHub fourni en mode comparaison pour une carte CV. */
  github?: { facts: GithubFacts; m: GithubMetrics };
  cv?: { reading: CvReading; counts: CvTextCounts; buzzPer100: number };
}

type Params = Record<string, number>;
type Rule = (ctx: RuleCtx, p: Params) => Vars | null;

const pct = (x: number) => Math.round(x * 100);

function gh(ctx: RuleCtx) {
  return ctx.github;
}

export const RULES: Record<string, Rule> = {
  // --- GitHub ---
  few_public_repos: (c, p) => {
    const g = gh(c);
    if (!g) return null;
    return g.m.repoCount < p.below ? { n: g.m.repoCount, t: p.below } : null;
  },
  old_activity: (c) => {
    const g = gh(c);
    const s = g?.m.oldActivityShare;
    const t = SCORING.special.flashback.oldShareAtLeast;
    return g?.m.flashback && s != null ? { n: pct(s), t: pct(t) } : null;
  },
  lazy_commits: (c, p) => {
    const g = gh(c);
    if (!g || g.m.commitsSample < p.minSample || g.m.lazyShare == null) return null;
    return g.m.lazyShare >= p.minShare ? { n: pct(g.m.lazyShare), t: pct(p.minShare) } : null;
  },
  no_tests: (c, p) => {
    const g = gh(c);
    if (!g || g.m.treesAnalyzed < p.minRepos) return null;
    return g.m.testsRepos === 0 ? { n: g.m.treesAnalyzed } : null;
  },
  readme_wip: (c, p) => {
    const g = gh(c);
    const r = g?.m.mainRepo;
    if (!g || !r || r.readmeWords === null) return null;
    const ageYears = (g.m.now - Date.parse(r.createdAt)) / (365.25 * 86_400_000);
    if (r.readmeWords >= p.maxWords || ageYears < p.minAgeYears) return null;
    return { n: r.readmeWords, t: p.maxWords, year: new Date(r.createdAt).getUTCFullYear() };
  },
  friday_evening: (c, p) => {
    const g = gh(c);
    if (!g || g.m.commitsSample < p.minSample || g.m.fridayShare == null) return null;
    return g.m.fridayShare >= p.minShare ? { n: pct(g.m.fridayShare), t: pct(p.minShare) } : null;
  },
  night_commits: (c, p) => {
    const g = gh(c);
    if (!g || g.m.commitsSample < p.minSample || g.m.nightShare == null) return null;
    return g.m.nightShare >= p.minShare ? { n: pct(g.m.nightShare), t: pct(p.minShare) } : null;
  },
  tutorial_repos: (c, p) => {
    const g = gh(c);
    return g && g.m.tutorialRepos.length >= p.atLeast ? { n: g.m.tutorialRepos.length, t: p.atLeast } : null;
  },
  repos_alive: (c, p) => {
    const g = gh(c);
    if (!g || g.m.repoCount < p.minRepos) return null;
    // Si la liste est tronquée, on rapporte les vivants à ce qui a été listé.
    const n = g.facts.reposTruncated ? g.m.listedRepos : g.m.repoCount;
    const m = g.m.aliveCount;
    const alive = { fr: m > 1 ? "vivants" : "vivant", en: "alive" };
    return m / n <= p.maxAliveShare ? { n: g.m.repoCount, m, alive, t: pct(p.maxAliveShare) } : null;
  },
  ghost_contributor: (c, p) => {
    const g = gh(c);
    if (!g || g.m.externalPRs > 0 || g.m.accountYears < p.minAccountYears) return null;
    return { n: Math.floor(g.m.accountYears) };
  },
  framework_hopper: (c, p) => {
    const g = gh(c);
    return g && g.m.frontFrameworks.length >= p.atLeast ? { n: g.m.frontFrameworks.length, t: p.atLeast } : null;
  },
  few_stars: (c, p) => {
    const g = gh(c);
    if (!g || g.m.repoCount < p.minRepos) return null;
    return g.m.starsTotal <= p.maxStars ? { n: g.m.starsTotal, m: g.m.repoCount } : null;
  },
  polyglot: (c, p) => {
    const g = gh(c);
    return g && g.m.languagesOverMin.length >= p.atLeast ? { n: g.m.languagesOverMin.length, t: p.atLeast } : null;
  },
  node_modules: (c) => {
    const g = gh(c);
    return g && g.m.nodeModulesRepos > 0 ? { n: g.m.nodeModulesRepos } : null;
  },
  external_prs: (c, p) => {
    const g = gh(c);
    return g && g.m.externalPRs >= p.atLeast ? { n: g.m.externalPRs, t: p.atLeast } : null;
  },
  stars_total: (c, p) => {
    const g = gh(c);
    return g && g.m.starsTotal >= p.atLeast ? { n: g.m.starsTotal, t: p.atLeast } : null;
  },
  maintainer: (c, p) => {
    const g = gh(c);
    const x = g?.m.maxExternal;
    return x && x.n >= p.atLeast ? { n: x.n >= 100 ? "100+" : x.n, m: x.repo, t: p.atLeast } : null;
  },

  // --- Commun : seuil sur une stat de la carte ---
  stat_at_least: (c, p) => {
    const [code, t] = Object.entries(p)[0] as [StatCode, number];
    return c.stats[code] >= t ? { n: c.stats[code], t } : null;
  },

  // --- CV ---
  buzz_density: (c, p) => {
    if (!c.cv) return null;
    const v = c.cv.buzzPer100;
    return v >= p.per100AtLeast ? { n: Math.round(v * 10) / 10, t: p.per100AtLeast } : null;
  },
  passion: (c, p) => (c.cv && c.cv.counts.passionCount >= p.atLeast ? { n: c.cv.counts.passionCount, t: p.atLeast } : null),
  many_technos_listed: (c, p) => {
    if (!c.cv) return null;
    const n = new Set(c.cv.reading.technos_listed.map((t) => t.trim().toLowerCase()).filter(Boolean)).size;
    return n >= p.atLeast ? { n, t: p.atLeast } : null;
  },
  ai_in_title: (c) => {
    if (!c.cv) return null;
    const r = c.cv.reading;
    if (!r.title_mentions_ai || r.describes_ai_project) return null;
    if (c.github?.m.hasAiRepo) return null;
    const current = currentRole(r);
    const year = current?.start ? Number(current.start.slice(0, 4)) : NaN;
    return Number.isFinite(year) ? { year } : ({} as Vars);
  },
  described_technos: (c, p) => {
    if (!c.cv) return null;
    const n = new Set(c.cv.reading.technos_described.map((t) => t.trim().toLowerCase()).filter(Boolean)).size;
    return n >= p.atLeast ? { n, t: p.atLeast } : null;
  },

  // Posés hors règles : IA (liste fermée) et repli.
  ai: () => null,
  fallback: () => null,
};

/** Rôle actuel : sans date de fin, sinon le plus récent par date de début. */
export function currentRole(r: CvReading) {
  const open = r.roles.filter((x) => !x.end);
  const pool = open.length ? open : r.roles;
  return [...pool].sort((a, b) => (b.start ?? "").localeCompare(a.start ?? ""))[0] ?? null;
}

