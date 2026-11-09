// Collecte GitHub (SPEC §4.2) : profil, repos, arbres, calendrier, commits, PR externes,
// premier vrai commit, langages, stars, contributeurs, releases. Les appels sont
// parallélisés par étapes ; seul l'échec du profil ou de la liste des repos est bloquant.

import { SCORING } from "../scoring/config";
import { isLazyCommit } from "../scoring/derive";
import {
  analyzeTree,
  countReadmeWords,
  manifestsForLanguage,
  MANIFESTS,
  parseLogin,
  parseManifest,
  parsePatchOffset,
  type TreeEntry,
} from "./detect";
import { pickAccomplices, type RawContributor } from "./accomplices";
import { isDefaultGithubAvatar } from "./avatar";
import type { CommitFact, GithubFacts, GithubRepo, RepoTree } from "./facts";
import { EngineError, graphql, headOf, lastPageOf, makeCtx, rawFile, rest, soft, type Ctx, type GithubAuth } from "./http";

export { EngineError } from "./http";
export type { GithubFacts, GithubRepo, GithubProfile, RepoTree, CommitFact } from "./facts";
export { pickFilesForReading } from "./pick";

const DAY = 86_400_000;
const YEAR = 365 * DAY;

/** Limites de collecte (volume d'appels, pas de jugement). */
const LIMITS = {
  maxRepoPages: 10,
  detailRepos: 30,
  manifestRepos: 15,
  commitsPerRepo: 100,
  oldestCandidates: 8,
  firstCommitRepos: 4,
  tutorialCountRepos: 10,
  contributorRepos: 3,
  /** Repos actifs dont les contributeurs deviennent les complices suggérés (§18.6). */
  accompliceRepos: 3,
  maxYears: 20,
  patchSamples: 6,
  /** Au-delà (Ko) : arbre lu en surface, historique non filtré par auteur (trop lent côté GitHub). */
  hugeRepoKb: 300_000,
  /** Au-delà (commits), on ne filtre plus l'historique par auteur côté GitHub (trop lent). */
  hugeHistory: 50_000,
};

interface RestUser {
  login: string;
  type: string;
  name: string | null;
  avatar_url: string;
  bio: string | null;
  blog?: string | null;
  company: string | null;
  followers: number;
  created_at: string;
  public_repos: number;
  node_id: string;
  twitter_username?: string | null;
}

interface RestRepo {
  name: string;
  full_name: string;
  fork: boolean;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  pushed_at: string | null;
  created_at: string;
  archived: boolean;
  topics?: string[];
  license: { spdx_id: string | null } | null;
  size: number;
  default_branch: string;
  owner: { login: string };
}

type Progress = (e: { key: string; n?: number }) => void;

export async function collectGithub(
  login: string,
  opts: { token: GithubAuth; onProgress?: Progress; signal?: AbortSignal },
): Promise<GithubFacts> {
  const user = parseLogin(login);
  if (!user) throw new EngineError("unknown_user", `pseudo invalide : ${login}`);
  const ctx = makeCtx(opts.token, opts.signal);
  const emit: Progress = (e) => {
    try {
      opts.onProgress?.(e);
    } catch {
      // un écouteur défaillant ne casse pas la collecte
    }
  };
  const collectedAt = new Date().toISOString();
  const now = Date.parse(collectedAt);

  // --- Étape 0 : profil, calendrier, PR externes, pages de repos -------------
  // Le profil (REST, rapide) débloque la pagination, l'activité par année et la
  // recherche du premier vrai commit sans attendre le calendrier (GraphQL, plus lent).
  const userP = rest<RestUser>(ctx, `/users/${user}`).then((res) => {
    if (res.status === 404) throw new EngineError("unknown_user", `pseudo inconnu : ${user}`);
    if (!res.data) throw new EngineError("internal", `profil GitHub illisible (${res.status})`);
    if (res.data.type === "Organization") throw new EngineError("organization", `${res.data.login} est une organisation`);
    return res.data;
  });
  const calP = soft(ctx, () => fetchCalendar(ctx, user));
  const prsP = soft(ctx, () => fetchExternalPRs(ctx, user));
  const repoPage = (page: number) => rest<RestRepo[]>(ctx, `/users/${user}/repos?type=owner&sort=pushed&per_page=100&page=${page}`);
  const page1P = repoPage(1);
  const reposP = userP.then(async (u) => {
    const pages = Math.min(LIMITS.maxRepoPages, Math.ceil(u.public_repos / 100));
    const [p1, ...more] = await Promise.all([
      page1P,
      ...Array.from({ length: Math.max(0, pages - 1) }, (_, i) => soft(ctx, () => repoPage(i + 2))),
    ]);
    if (!p1?.data) throw new EngineError("internal", "liste des repos illisible");
    return [p1.data, ...more.map((r) => r?.data ?? [])].flat().filter((r) => !r.fork).map(toRepo);
  });
  const yearsP = userP.then((u) => soft(ctx, () => fetchYears(ctx, user, now, Date.parse(u.created_at))));
  // Premier vrai commit : parmi les repos les plus anciens, n'attend que la liste.
  const firstP = Promise.all([userP, reposP]).then(async ([u, repos]) =>
    withOffset(
      ctx,
      repos,
      await findFirstRealCommit(
        ctx,
        [...repos].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, LIMITS.oldestCandidates),
        u.login,
        u.node_id,
      ),
    ),
  );
  // Comptes sociaux affichés (§18.24) : le LinkedIn s'y trouve, un appel de plus, sans bloquer.
  const socialP = soft(ctx, () => rest<{ provider: string; url: string }[]>(ctx, `/users/${user}/social_accounts`));
  // Avatar par défaut (identicon) : une requête sur l'image elle-même, hors API,
  // 2 s au plus ; la fiche montre alors les initiales. Dans le doute, on garde l'avatar.
  const defaultAvatarP = userP.then((u) => isDefaultGithubAvatar(u.avatar_url, { signal: opts.signal })).catch(() => false);
  // Évite les rejets non observés si une étape lève avant l'attente finale.
  for (const p of [calP, prsP, page1P, reposP, yearsP, firstP, socialP]) p.catch(() => {});

  const [u, cal, repos] = await Promise.all([userP, calP, reposP]);
  emit({ key: "recruiter" });
  const reposTruncated = u.public_repos > LIMITS.maxRepoPages * 100;

  // Activité : commits de l'utilisateur sur 12 mois + fraîcheur du dernier push.
  const recentByRepo = new Map<string, number>();
  for (const c of cal?.byRepo ?? []) if (c.owner.toLowerCase() === u.login.toLowerCase()) recentByRepo.set(c.name, c.count);
  const A = SCORING.github.activity;
  for (const r of repos) {
    const days = Math.max(0, (now - Date.parse(r.pushedAt)) / DAY);
    const recent = recentByRepo.get(r.name);
    r.recentUserCommits = cal ? (recent ?? 0) : null;
    r.activity = Math.round(((recent ?? 0) + A.recencyPoints * Math.pow(0.5, days / A.recencyHalfLifeDays)) * 100) / 100;
  }
  repos.sort((a, b) => b.activity - a.activity || b.pushedAt.localeCompare(a.pushedAt) || a.name.localeCompare(b.name));
  const byName = new Map(repos.map((r) => [r.name, r]));
  const active = repos.slice(0, SCORING.github.activeRepos);
  const top = repos.slice(0, SCORING.github.readRepos);

  // --- Étape 1 : tout le reste, en parallèle -------------------------------
  const tutorialRe = new RegExp(SCORING.github.tutorial.pattern, "i");
  const countTargets = uniqRepos([
    ...active,
    ...repos.filter((r) => tutorialRe.test(r.name)).slice(0, LIMITS.tutorialCountRepos),
    ...[...repos].sort((a, b) => b.stars - a.stars).slice(0, LIMITS.contributorRepos),
  ]).filter((r) => r.commitCount === null);
  const detailTargets = uniqRepos([
    ...repos.slice(0, 20),
    ...[...repos].sort((a, b) => b.sizeKb - a.sizeKb).slice(0, 15),
  ]).slice(0, LIMITS.detailRepos);

  const treesP = Promise.all(active.map((r) => collectTree(ctx, r))).then((trees) => {
    emit({ key: "tests", n: trees.filter((t) => t.tree.hasTests).length });
    return trees;
  });
  const readmesP = Promise.all(
    active.map(async (r) => {
      const res = await soft(ctx, () => rest<string>(ctx, `/repos/${r.fullName}/readme`, { accept: "application/vnd.github.raw", raw: true }));
      r.readmeWords = res ? (res.data ? countReadmeWords(res.data) : 0) : null;
    }),
  ).then(() => emit({ key: "readme", n: active.filter((r) => (r.readmeWords ?? 0) > 0).length }));
  const detailsP = soft(ctx, () => fetchDetails(ctx, detailTargets));
  const manifestsP = Promise.all(
    repos.slice(active.length, active.length + LIMITS.manifestRepos).map(async (r) => {
      const files = manifestsForLanguage(r.language);
      const texts = await Promise.all(files.map((f) => soft(ctx, () => rawFile(ctx, r.fullName, r.defaultBranch, f))));
      const deps = new Set<string>();
      files.forEach((f, i) => {
        const t = texts[i];
        if (!t) return;
        const m = parseManifest(f, t);
        for (const d of [...m.deps, ...m.devDeps]) deps.add(d);
      });
      r.deps = [...deps].sort();
    }),
  );
  const commitsP = Promise.all(top.map((r) => soft(ctx, () => fetchUserCommits(ctx, r, u.login, u.node_id)))).then(async (lists) => {
    const commits = lists.flatMap((l) => l ?? []);
    emit({ key: "lazy_commits", n: commits.filter((c) => isLazyCommit(c.message)).length });
    const offset = await soft(ctx, () => detectOffset(ctx, commits, byName));
    return { commits, offset };
  });
  const countsP = Promise.all(
    countTargets.map(async (r) => {
      r.commitCount = (await soft(ctx, () => commitCount(ctx, r)))?.count ?? null;
    }),
  );
  // Une liste de contributeurs par repo, lue une seule fois : elle sert au compte
  // des contributeurs externes (barème) et aux complices suggérés (§18.6).
  const contributorLists = new Map<string, Promise<ContributorsResult>>();
  const contributorsOf = (r: GithubRepo) => {
    let p = contributorLists.get(r.name);
    if (!p) {
      p = fetchContributors(ctx, r);
      p.catch(() => {});
      contributorLists.set(r.name, p);
    }
    return p;
  };
  const contributorsP = Promise.all(
    [...repos]
      .sort((a, b) => b.stars - a.stars)
      .slice(0, LIMITS.contributorRepos)
      .filter((r) => r.stars > 0)
      .map(async (r) => {
        r.externalContributors = await soft(ctx, async () => externalContributors(await contributorsOf(r), u.login));
      }),
  );
  // Les complices : les repos actifs, pas les plus étoilés. Un repo déjà lu
  // ci-dessus ne coûte rien ; les autres, un appel chacun, en parallèle.
  const accomplicesP = Promise.all(
    active.slice(0, LIMITS.accompliceRepos).map((r) => soft(ctx, async () => (await contributorsOf(r)).list)),
  ).then((lists) => pickAccomplices(lists, u.login));

  const timed = <T,>(label: string, p: Promise<T>) =>
    process.env.TYS_DEBUG ? p.then((v) => (console.error(`[collect] ${label} ${Date.now() - now} ms`), v)) : p;
  const [trees, , details, , commitsRes, , , years, externalPRs, firstOld, accomplices] = await Promise.all([
    timed("trees", treesP),
    timed("readmes", readmesP),
    timed("details", detailsP),
    timed("manifests", manifestsP),
    timed("commits", commitsP),
    timed("counts", countsP),
    timed("contributors", contributorsP),
    timed("years", yearsP),
    timed("prs", prsP),
    timed("first", firstP),
    timed("accomplices", accomplicesP),
  ]);
  // Repli rare : aucun vieux repo n'a 10 commits, on cherche dans les repos actifs.
  const firstRealCommit =
    firstOld ??
    (await withOffset(
      ctx,
      repos,
      await findFirstRealCommit(
        ctx,
        active.filter((r) => (r.commitCount ?? 0) >= SCORING.github.XP.sufficientRepoCommits),
        u.login,
        u.node_id,
      ),
    ));

  for (const t of trees) {
    const r = byName.get(t.tree.repo);
    if (r && t.deps) r.deps = t.deps;
  }
  if (details) {
    for (const [name, d] of details) {
      const r = byName.get(name);
      if (!r) continue;
      r.languages = d.languages;
      r.releaseDates = d.releases;
    }
  }
  emit({ key: "compare" });

  const weeks = cal?.weeks.slice(-52) ?? [];
  const social = await socialP.catch(() => null);
  const defaultAvatar = await defaultAvatarP;
  const socialAccounts = Array.isArray(social?.data)
    ? social.data.filter((a) => typeof a?.provider === "string" && typeof a?.url === "string").slice(0, 10).map((a) => ({ provider: a.provider, url: a.url }))
    : [];
  return {
    schema: 1,
    login: u.login,
    collectedAt,
    profile: {
      login: u.login,
      name: u.name,
      // Vide pour l'avatar par défaut : la fiche, le PNG et la texture 3D montrent les initiales.
      avatarUrl: defaultAvatar ? "" : u.avatar_url,
      bio: u.bio,
      blog: u.blog || null,
      socialAccounts,
      company: u.company,
      followers: u.followers,
      createdAt: u.created_at,
      publicRepos: u.public_repos,
      // Le texte de partage d'une dénonciation tague ce compte X (§18.6).
      twitterUsername: typeof u.twitter_username === "string" && /^[A-Za-z0-9_]{1,15}$/.test(u.twitter_username) ? u.twitter_username : null,
    },
    repoCount: reposTruncated ? Math.max(repos.length, u.public_repos) : repos.length,
    reposTruncated,
    repos,
    activeRepos: active.map((r) => r.name),
    calendar: {
      available: !!cal,
      weeksActive: weeks.filter((w) => w > 0).length,
      weeks: weeks.length,
      totalContributions: cal?.total ?? 0,
      ...(cal?.days ? { days: cal.days } : {}),
    },
    activityByYear: years,
    commits: commitsRes.commits,
    utcOffsetMinutes: commitsRes.offset,
    externalMergedPRs: externalPRs ?? 0,
    firstRealCommit,
    trees: trees.map((t) => t.tree),
    accomplices,
  };
}

function toRepo(r: RestRepo): GithubRepo {
  return {
    name: r.name,
    fullName: r.full_name,
    description: r.description,
    language: r.language,
    stars: r.stargazers_count,
    forks: r.forks_count,
    pushedAt: r.pushed_at ?? r.created_at,
    createdAt: r.created_at,
    archived: r.archived,
    topics: r.topics ?? [],
    license: r.license?.spdx_id && r.license.spdx_id !== "NOASSERTION" ? r.license.spdx_id : null,
    sizeKb: r.size,
    defaultBranch: r.default_branch,
    recentUserCommits: null,
    activity: 0,
    commitCount: null,
    languages: null,
    deps: null,
    externalContributors: null,
    readmeWords: null,
    releaseDates: null,
  };
}

/** Compte les commits des candidats, puis cherche le plus ancien commit de l'utilisateur dans ceux qui en ont 10 ou plus. */
async function findFirstRealCommit(ctx: Ctx, candidates: GithubRepo[], login: string, userId: string) {
  await Promise.all(
    candidates
      .filter((r) => r.commitCount === null)
      .map(async (r) => {
        r.commitCount = (await soft(ctx, () => commitCount(ctx, r)))?.count ?? null;
      }),
  );
  const eligible = candidates
    .filter((r) => (r.commitCount ?? 0) >= SCORING.github.XP.sufficientRepoCommits)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, LIMITS.firstCommitRepos);
  const dates = await Promise.all(eligible.map((r) => soft(ctx, () => oldestUserCommit(ctx, r, { count: r.commitCount! }, login, userId))));
  let first: { repo: string; date: string; oid?: string } | null = null;
  for (let i = 0; i < eligible.length; i++) {
    const d = dates[i];
    if (d && (!first || Date.parse(d.date) < Date.parse(first.date)))
      first = { repo: eligible[i].name, date: d.date, ...(d.oid ? { oid: d.oid } : {}) };
  }
  return first;
}

/**
 * L'heure locale du premier commit (§18.26) : son propre décalage UTC, lu dans
 * l'en-tête de son patch (4 Ko au plus), plutôt que celui d'aujourd'hui.
 */
async function withOffset<T extends { repo: string; oid?: string }>(ctx: Ctx, repos: GithubRepo[], first: T | null) {
  if (!first?.oid) return first;
  const full = repos.find((r) => r.name === first.repo)?.fullName;
  if (!full) return first;
  const head = await soft(ctx, () => headOf(ctx, `https://github.com/${full}/commit/${first.oid}.patch`, /^Date:.*$/m, 4096));
  return { ...first, offsetMinutes: head ? parsePatchOffset(head) : null };
}

function uniqRepos(rs: GithubRepo[]): GithubRepo[] {
  const seen = new Set<string>();
  return rs.filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));
}

// --- Calendrier, PR externes, activité par repo (GraphQL) -------------------

interface CalendarResult {
  userId: string;
  total: number;
  /** Contributions par semaine, de la plus ancienne à la plus récente. */
  weeks: number[];
  byRepo: { owner: string; name: string; count: number }[];
  /** Jour par jour, du plus ancien au plus récent (§18.26). Absent si les dates ne se suivent pas. */
  days?: { start: string; counts: number[] };
}

async function fetchCalendar(ctx: Ctx, login: string): Promise<CalendarResult | null> {
  const q = `query($login:String!){
    user(login:$login){ id
      contributionsCollection{
        contributionCalendar{ totalContributions weeks{ contributionDays{ contributionCount date } } }
        commitContributionsByRepository(maxRepositories:25){ repository{ name owner{ login } } contributions{ totalCount } }
      }
    }
  }`;
  type D = {
    user: {
      id: string;
      contributionsCollection: {
        contributionCalendar: { totalContributions: number; weeks: { contributionDays: { contributionCount: number; date?: string }[] }[] };
        commitContributionsByRepository: { repository: { name: string; owner: { login: string } }; contributions: { totalCount: number } }[];
      };
    } | null;
  };
  const { data } = await graphql<D>(ctx, q, { login });
  if (!data?.user) return null;
  const cc = data.user.contributionsCollection;
  const flat = cc.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
  return {
    days: dailyCounts(flat),
    userId: data.user.id,
    total: cc.contributionCalendar.totalContributions,
    weeks: cc.contributionCalendar.weeks.map((w) => w.contributionDays.reduce((s, d) => s + d.contributionCount, 0)),
    byRepo: cc.commitContributionsByRepository.map((c) => ({
      owner: c.repository.owner.login,
      name: c.repository.name,
      count: c.contributions.totalCount,
    })),
  };
}

/** Le calendrier jour par jour, gardé seulement si chaque jour suit le précédent (pas de trou, pas de date illisible). */
function dailyCounts(days: { contributionCount: number; date?: string }[]): CalendarResult["days"] {
  const start = days[0]?.date;
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return undefined;
  const t0 = Date.parse(`${start}T00:00:00Z`);
  for (let i = 0; i < days.length; i++) {
    if (days[i]!.date !== new Date(t0 + i * DAY).toISOString().slice(0, 10)) return undefined;
  }
  return { start, counts: days.map((d) => d.contributionCount) };
}

/** PR fusionnées dans les repos des autres. */
async function fetchExternalPRs(ctx: Ctx, login: string): Promise<number | null> {
  const q = `query($q:String!){ search(query:$q, type:ISSUE, first:0){ issueCount } }`;
  const { data } = await graphql<{ search: { issueCount: number } }>(ctx, q, { q: `type:pr author:${login} is:merged -user:${login}` });
  return data?.search.issueCount ?? null;
}

/** Contributions par fenêtre glissante d'un an, depuis la création du compte (une requête par fenêtre, en parallèle). */
async function fetchYears(ctx: Ctx, login: string, now: number, createdAt: number) {
  const n = Math.min(LIMITS.maxYears, Math.ceil((now - createdAt) / YEAR));
  if (n <= 0) return [];
  const q = `query($login:String!, $from:DateTime!, $to:DateTime!){
    user(login:$login){ contributionsCollection(from:$from, to:$to){ contributionCalendar{ totalContributions } } } }`;
  type D = { user: { contributionsCollection: { contributionCalendar: { totalContributions: number } } } | null };
  const windows = await Promise.all(
    Array.from({ length: n }, (_, k) =>
      graphql<D>(
        ctx,
        q,
        { login, to: new Date(now - k * YEAR).toISOString(), from: new Date(now - (k + 1) * YEAR + 1000).toISOString() },
        { timeoutMs: 8000 },
      ).then((r) => r.data?.user?.contributionsCollection.contributionCalendar.totalContributions ?? null),
    ),
  );
  // Une fenêtre manquante fausserait la part ancienne : tout ou rien.
  if (windows.some((w) => w === null)) return null;
  return windows.map((contributions, yearsAgo) => ({ yearsAgo, contributions: contributions! }));
}

// --- Langages et releases (GraphQL, alias par repo) ---------------------------

async function fetchDetails(ctx: Ctx, targets: GithubRepo[]) {
  const out = new Map<string, { languages: Record<string, number>; releases: string[] }>();
  const chunks: GithubRepo[][] = [];
  for (let i = 0; i < targets.length; i += 8) chunks.push(targets.slice(i, i + 8));
  type R = { languages: { edges: { size: number; node: { name: string } }[] }; releases: { nodes: { createdAt: string }[] } } | null;
  await Promise.all(
    chunks.map(async (chunk) => {
      const parts = chunk.map((r, i) => {
        const [owner, name] = r.fullName.split("/");
        return `r${i}: repository(owner:${JSON.stringify(owner)}, name:${JSON.stringify(name)}){
          languages(first:12, orderBy:{field:SIZE, direction:DESC}){ edges{ size node{ name } } }
          releases(first:10, orderBy:{field:CREATED_AT, direction:DESC}){ nodes{ createdAt } }
        }`;
      });
      const res = await soft(ctx, () => graphql<Record<string, R>>(ctx, `query{ ${parts.join("\n")} }`, {}, { timeoutMs: 8000 }));
      chunk.forEach((r, i) => {
        const d = res?.data?.[`r${i}`];
        if (d)
          out.set(r.name, {
            languages: Object.fromEntries(d.languages.edges.map((e) => [e.node.name, e.size])),
            releases: d.releases.nodes.map((n) => n.createdAt),
          });
      });
    }),
  );
  return out;
}

// --- Arborescence et manifestes ------------------------------------------------

async function collectTree(ctx: Ctx, r: GithubRepo): Promise<{ tree: RepoTree; deps: string[] | null }> {
  const empty: RepoTree = {
    repo: r.name,
    available: false,
    truncated: false,
    entries: 0,
    testFiles: 0,
    hasTests: false,
    hasCi: false,
    tooling: [],
    nodeModules: false,
    markers: [],
    sourceFiles: [],
  };
  const ref = encodeURIComponent(r.defaultBranch);
  const path = `/repos/${r.fullName}/git/trees/${ref}`;
  type T = { tree: TreeEntry[]; truncated: boolean };
  // Repo énorme (ou arbre récursif en échec) : racine seulement, plus le dossier des workflows.
  let shallow = r.sizeKb > LIMITS.hugeRepoKb;
  let res = shallow ? null : await soft(ctx, () => rest<T>(ctx, `${path}?recursive=1`, { timeoutMs: 10_000 }));
  if (!res?.data) {
    res = await soft(ctx, () => rest<T>(ctx, path));
    shallow = true;
  }
  if (!res?.data) return { tree: empty, deps: null };
  let entries = res.data.tree;
  if (shallow) {
    const wf = await soft(ctx, () => rest<{ name: string; type: string }[]>(ctx, `/repos/${r.fullName}/contents/.github/workflows`));
    if (Array.isArray(wf?.data)) entries = [...entries, ...wf.data.map((f) => ({ path: `.github/workflows/${f.name}`, type: "blob" as const }))];
  }
  const rootFiles = new Set(entries.filter((e) => e.type === "blob" && !e.path.includes("/")).map((e) => e.path));
  const toRead = [...MANIFESTS.filter((m) => rootFiles.has(m)), ...["tsconfig.json"].filter((f) => rootFiles.has(f))];
  if (rootFiles.has("pyproject.toml") && !toRead.includes("pyproject.toml")) toRead.push("pyproject.toml");
  const texts = await Promise.all(toRead.map((f) => soft(ctx, () => rawFile(ctx, r.fullName, r.defaultBranch, f))));
  const file = (name: string) => texts[toRead.indexOf(name)] ?? null;
  const deps = new Set<string>();
  const devDeps = new Set<string>();
  toRead.forEach((f, i) => {
    const t = texts[i];
    if (!t || f === "tsconfig.json") return;
    const p = parseManifest(f, t);
    p.deps.forEach((d) => deps.add(d));
    p.devDeps.forEach((d) => devDeps.add(d));
  });
  const tree = analyzeTree(r.name, entries, {
    truncated: shallow || res.data.truncated,
    tsconfig: file("tsconfig.json"),
    pyproject: file("pyproject.toml"),
    devDeps: [...devDeps],
  });
  return { tree, deps: [...new Set([...deps, ...devDeps])].sort() };
}

// --- Commits -------------------------------------------------------------------

/** Nombre de commits de la branche par défaut (pagination REST à 1 par page). */
async function commitCount(ctx: Ctx, r: GithubRepo): Promise<{ count: number } | null> {
  const res = await rest<unknown[]>(ctx, `/repos/${r.fullName}/commits?per_page=1&sha=${encodeURIComponent(r.defaultBranch)}`);
  if (res.status === 409) return { count: 0 }; // repo vide
  if (!res.data) return null;
  return { count: lastPageOf(res.headers.get("link")) ?? res.data.length };
}

interface HistoryNode {
  oid: string;
  messageHeadline: string;
  authoredDate: string;
  author?: { user: { login: string } | null } | null;
}

async function history(ctx: Ctx, r: GithubRepo, args: string, fields: string, timeoutMs: number) {
  const [owner, name] = r.fullName.split("/");
  const q = `query{ repository(owner:${JSON.stringify(owner)}, name:${JSON.stringify(name)}){
    defaultBranchRef{ target{ oid ... on Commit{ history(${args}){ totalCount nodes{ ${fields} } } } } } } }`;
  type D = { repository: { defaultBranchRef: { target: { oid: string; history: { totalCount: number; nodes: HistoryNode[] } } } | null } | null };
  const { data, errors } = await graphql<D>(ctx, q, {}, { timeoutMs });
  const t = data?.repository?.defaultBranchRef?.target;
  if (!t?.history) throw new Error(errors[0]?.message ?? "historique illisible");
  return { head: t.oid, ...t.history };
}

/** Les 100 derniers commits de l'utilisateur dans un repo. */
async function fetchUserCommits(ctx: Ctx, r: GithubRepo, login: string, userId: string): Promise<CommitFact[]> {
  const toFact = (n: HistoryNode): CommitFact => ({ repo: r.name, oid: n.oid, message: n.messageHeadline.slice(0, 100), date: n.authoredDate });
  if (userId && r.sizeKb <= LIMITS.hugeRepoKb) {
    const h = await soft(ctx, () =>
      history(ctx, r, `first:${LIMITS.commitsPerRepo}, author:{id:${JSON.stringify(userId)}}`, "oid messageHeadline authoredDate", 6000),
    );
    if (h) return h.nodes.map(toFact);
  }
  // Repli (repos énormes) : derniers commits non filtrés en REST, filtrés ici par auteur.
  const res = await rest<{ sha: string; commit: { message: string; author: { date: string } }; author: { login: string } | null }[]>(
    ctx,
    `/repos/${r.fullName}/commits?per_page=${LIMITS.commitsPerRepo}&sha=${encodeURIComponent(r.defaultBranch)}`,
  );
  return (res.data ?? [])
    .filter((c) => c.author?.login?.toLowerCase() === login.toLowerCase())
    .map((c) => ({ repo: r.name, oid: c.sha, message: c.commit.message.split("\n")[0].slice(0, 100), date: c.commit.author.date }));
}

/** Date et oid du plus ancien commit de l'utilisateur dans un repo (curseur « oid N » de l'historique). */
async function oldestUserCommit(
  ctx: Ctx,
  r: GithubRepo,
  c: { count: number },
  login: string,
  userId: string,
): Promise<{ date: string; oid?: string } | null> {
  const found = (n: HistoryNode | undefined) => (n ? { date: n.authoredDate, oid: n.oid } : null);
  if (userId && c.count <= LIMITS.hugeHistory) {
    const authorArg = `author:{id:${JSON.stringify(userId)}}`;
    const first = await soft(ctx, () => history(ctx, r, `first:1, ${authorArg}`, "oid authoredDate", 5000));
    if (first) {
      if (first.totalCount === 0) return null;
      if (first.totalCount === 1) return found(first.nodes[0]);
      const last = await soft(ctx, () =>
        history(ctx, r, `first:1, ${authorArg}, after:${JSON.stringify(`${first.head} ${first.totalCount - 2}`)}`, "oid authoredDate", 5000),
      );
      if (last?.nodes[0]) return found(last.nodes[0]);
    }
  }
  // Repli : plus ancien commit du repo, retenu s'il est de l'utilisateur.
  const res = await rest<
    { sha?: string; commit: { author: { date: string } }; author: { login: string } | null; committer: { login: string } | null }[]
  >(ctx, `/repos/${r.fullName}/commits?per_page=1&page=${c.count}&sha=${encodeURIComponent(r.defaultBranch)}`);
  const o = res.data?.[0];
  if (!o) return null;
  const mine = [o.author?.login, o.committer?.login].some((l) => l?.toLowerCase() === login.toLowerCase());
  return mine ? { date: o.commit.author.date, ...(typeof o.sha === "string" ? { oid: o.sha } : {}) } : null;
}

/** Décalage UTC dominant, lu dans l'en-tête Date des patchs (l'API ne donne que l'UTC). */
async function detectOffset(ctx: Ctx, commits: CommitFact[], byName: Map<string, GithubRepo>): Promise<number | null> {
  // Échantillon réparti sur tout l'historique lu (pas seulement les plus récents).
  const pool = commits.filter((c) => !/^Merge\b/.test(c.message));
  const step = Math.max(1, pool.length / LIMITS.patchSamples);
  const sample = Array.from({ length: Math.min(LIMITS.patchSamples, pool.length) }, (_, i) => pool[Math.floor(i * step)]);
  const offsets = await Promise.all(
    sample.map(async (c) => {
      const full = byName.get(c.repo)?.fullName;
      if (!full) return null;
      const head = await soft(ctx, () => headOf(ctx, `https://github.com/${full}/commit/${c.oid}.patch`, /^Date:.*$/m, 4096));
      return head ? parsePatchOffset(head) : null;
    }),
  );
  const counts = new Map<number, number>();
  for (const o of offsets) if (o !== null) counts.set(o, (counts.get(o) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
}

interface ContributorsResult {
  status: number;
  /** Les 100 premiers contributeurs, par nombre de commits ; null si GitHub ne les donne pas. */
  list: (RawContributor & { login: string; type: string })[] | null;
}

/** Un seul appel par repo : GET /repos/{repo}/contributors, 100 au plus. */
async function fetchContributors(ctx: Ctx, r: GithubRepo): Promise<ContributorsResult> {
  const res = await rest<NonNullable<ContributorsResult["list"]>>(ctx, `/repos/${r.fullName}/contributors?per_page=100`);
  return { status: res.status, list: Array.isArray(res.data) ? res.data : null };
}

/** Contributeurs hors propriétaire et bots, plafonné à 100. Liste trop grande pour l'API → 100. */
function externalContributors(res: ContributorsResult, login: string): number | null {
  if (res.status === 403) return 100;
  if (res.status === 204) return 0;
  if (!res.list) return res.status === 200 ? 0 : null;
  return res.list.filter((c) => c.type !== "Bot" && !c.login.endsWith("[bot]") && c.login.toLowerCase() !== login.toLowerCase()).length;
}
