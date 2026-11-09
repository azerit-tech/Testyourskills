// L'enquête en direct, côté GitHub (§18.26) : des trouvailles datées et chiffrées,
// lues dans les faits déjà collectés, chacune avec sa preuve publique. Pur et
// déterministe (« maintenant » = facts.collectedAt) ; aucun appel ici.
//
// Règles :
// - une trouvaille ne sort que si la donnée est là et assez nette : jamais de
//   trouvaille vide, approximative ou fausse ;
// - ton de procès-verbal, sans « tu » : la phrase passe telle quelle dans le
//   texte de partage ; rien ne s'accorde avec la personne (épicène) ;
// - GitHub public seulement : ni adresse, ni famille, ni âge, ni genre, ni photo,
//   ni localisation (le décalage horaire sert à lire l'heure, jamais affiché) ;
// - elles ne touchent jamais la note.
//
// Score de surprise (0 à 100), fixe et explicable : une base par type (banal →
// rare), plus un bonus borné qui grandit avec la valeur (plus d'étoiles, une
// heure plus tardive, une série plus longue). Table : `BASE` ci-dessous.

import type { Finding, Fact } from "../../../shared/types";
import type { CommitFact, GithubFacts, GithubRepo } from "../github/facts";
import { clock, dayDate, monthYear, num, NBSP, pct, plural, weekday } from "./format";

const DAY = 86_400_000;
const YEAR = 365.25 * DAY;

/** Base de surprise par type : du banal (compte, volume) au rare (heure, habitude, abandon). */
export const BASE = {
  account_age: 8,
  contributions_year: 12,
  busiest_day: 14,
  top_starred: 20,
  external_prs: 28,
  one_day_repos: 30,
  longest_streak: 30,
  abandoned_repo: 34,
  early_bird: 38,
  night_share: 40,
  friday_evening: 40,
  first_commit: 42,
  weekend: 44,
  lazy_message: 46,
  accomplice: 48,
  dead_language: 52,
  sunday_over_monday: 54,
  latest_commit: 56,
} as const;

export type GithubFindingKind = keyof typeof BASE;

/** Échantillons minimaux : en dessous, la proportion ne veut rien dire et la trouvaille ne sort pas. */
const MIN = {
  commitsForShare: 30,
  commitsForHours: 10,
  calendarTotal: 50,
  repos: 5,
  stars: 10,
  externalPRs: 3,
  oneDayRepos: 3,
  abandonedYears: 2,
  deadLanguageYears: 3,
  deadLanguageRepos: 2,
  streakDays: 7,
  lazyRepeats: 4,
  accompliceCommits: 10,
  fridayCommits: 5,
};

/** Messages paresseux qu'on ose citer : une liste fermée, pour ne jamais afficher un message grossier. */
const LAZY_QUOTABLE = /^(fix|fixes|fixed|wip|update|updates|test|tests|final|stuff|asdf|changes|minor|typo|oops|tmp|temp|misc|cleanup|lint|save|done|ok|commit|\.{1,3})$/;

const bounded = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v)));

interface Ctx {
  f: GithubFacts;
  now: number;
  login: string;
  profile: string;
  /** Décalage horaire dominant (minutes), null si inconnu : sans lui, aucune trouvaille d'heure. */
  offset: number | null;
  repoUrl(name: string): string | null;
  commitUrl(c: { repo: string; oid?: string }): string | null;
}

function make(kind: GithubFindingKind, score: number, text: Fact, key: Fact | undefined, proof: string | null): Finding | null {
  if (!proof || !proof.startsWith("https://github.com/")) return null;
  if (!text.fr.trim() || !text.en.trim()) return null;
  // Le chiffre clé doit se lire tel quel dans la phrase, sinon on ne le met pas en rose.
  const k = key && text.fr.includes(key.fr) && text.en.includes(key.en) ? key : undefined;
  return { kind, source: "github", text, ...(k ? { key: k } : {}), proof, score: Math.max(0, Math.min(100, Math.round(score))) };
}

const ok = (iso: unknown): iso is string => typeof iso === "string" && Number.isFinite(Date.parse(iso));

/** L'instant décalé à l'heure locale, à lire avec les champs UTC. */
const local = (iso: string, offset: number) => new Date(Date.parse(iso) + offset * 60_000);

// --- Les trouvailles, une fonction par type ------------------------------------

function accountAge(c: Ctx): Finding | null {
  const at = c.f.profile?.createdAt;
  if (!ok(at)) return null;
  const years = Math.floor((c.now - Date.parse(at)) / YEAR);
  if (years < 1) return null;
  const d = new Date(Date.parse(at));
  const fr = `${years}${NBSP}${plural(years, "an", "ans")}`;
  const en = `${years}${NBSP}${plural(years, "year", "years")}`;
  return make(
    "account_age",
    BASE.account_age + bounded(years / 2, 8),
    { fr: `Compte GitHub ouvert en ${monthYear(d, "fr")} : ${fr} de maison.`, en: `GitHub account opened in ${monthYear(d, "en")}: ${en} on the books.` },
    { fr, en },
    c.profile,
  );
}

function contributionsYear(c: Ctx): Finding | null {
  const cal = c.f.calendar;
  if (!cal?.available || !(cal.totalContributions >= 100)) return null;
  const n = cal.totalContributions;
  return make(
    "contributions_year",
    BASE.contributions_year + bounded(n / 500, 8),
    { fr: `${num(n, "fr")} contributions sur les 12 derniers mois.`, en: `${num(n, "en")} contributions in the last 12 months.` },
    { fr: num(n, "fr"), en: num(n, "en") },
    c.profile,
  );
}

function topStarred(c: Ctx): Finding | null {
  const top = [...c.f.repos].sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name))[0];
  if (!top || !(top.stars >= MIN.stars)) return null;
  const fr = `${num(top.stars, "fr")}${NBSP}${plural(top.stars, "étoile", "étoiles")}`;
  const en = `${num(top.stars, "en")}${NBSP}${plural(top.stars, "star", "stars")}`;
  return make(
    "top_starred",
    BASE.top_starred + bounded(8 * Math.log10(top.stars), 36),
    { fr: `Repo le plus étoilé : ${top.name}, ${fr}.`, en: `Most-starred repo: ${top.name}, ${en}.` },
    { fr, en },
    c.repoUrl(top.name),
  );
}

function externalPRs(c: Ctx): Finding | null {
  const n = c.f.externalMergedPRs;
  if (!(typeof n === "number" && n >= MIN.externalPRs)) return null;
  const q = encodeURIComponent(`type:pr author:${c.login} is:merged -user:${c.login}`);
  return make(
    "external_prs",
    BASE.external_prs + bounded(n / 3, 22),
    {
      fr: `${num(n, "fr")} PR fusionnées dans les repos des autres.`,
      en: `${num(n, "en")} pull requests merged into other people's repos.`,
    },
    { fr: `${num(n, "fr")} PR`, en: `${num(n, "en")} pull requests` },
    `https://github.com/search?q=${q}&type=pullrequests`,
  );
}

function oneDayRepos(c: Ctx): Finding | null {
  const repos = c.f.repos;
  if (repos.length < MIN.repos) return null;
  const k = repos.filter((r) => ok(r.createdAt) && ok(r.pushedAt) && Date.parse(r.pushedAt) - Date.parse(r.createdAt) <= DAY).length;
  if (k < MIN.oneDayRepos) return null;
  const n = repos.length;
  return make(
    "one_day_repos",
    BASE.one_day_repos + bounded((20 * k) / n, 20),
    {
      fr: `${k} repos sur ${n} n'ont jamais reçu de push après leur premier jour.`,
      en: `${k} of ${n} repos never got another push after day one.`,
    },
    { fr: `${k} repos sur ${n}`, en: `${k} of ${n}` },
    `https://github.com/${c.login}?tab=repositories`,
  );
}

function abandonedRepo(c: Ctx): Finding | null {
  const old = c.f.repos
    .filter((r) => !r.archived && ok(r.pushedAt) && c.now - Date.parse(r.pushedAt) >= MIN.abandonedYears * YEAR)
    .sort((a, b) => Date.parse(a.pushedAt) - Date.parse(b.pushedAt) || a.name.localeCompare(b.name))[0];
  if (!old) return null;
  const year = String(new Date(Date.parse(old.pushedAt)).getUTCFullYear());
  const years = (c.now - Date.parse(old.pushedAt)) / YEAR;
  return make(
    "abandoned_repo",
    BASE.abandoned_repo + bounded(2 * years, 16),
    { fr: `Repo abandonné le plus ancien : ${old.name}, dernier push en ${year}.`, en: `Oldest abandoned repo: ${old.name}, last push in ${year}.` },
    { fr: year, en: year },
    c.repoUrl(old.name),
  );
}

function deadLanguage(c: Ctx): Finding | null {
  const recent = c.f.repos.filter((r) => ok(r.pushedAt) && c.now - Date.parse(r.pushedAt) < MIN.abandonedYears * YEAR);
  // Encore vivant : langage principal d'un repo récent, ou au moins 15 % de ses octets.
  const alive = (lang: string) =>
    recent.some((r) => {
      if (r.language === lang) return true;
      const bytes = r.languages ?? {};
      const total = Object.values(bytes).reduce((s, b) => s + b, 0);
      return total > 0 && (bytes[lang] ?? 0) / total >= 0.15;
    });
  const byLang = new Map<string, GithubRepo[]>();
  for (const r of c.f.repos) {
    if (!r.language || !ok(r.pushedAt)) continue;
    byLang.set(r.language, [...(byLang.get(r.language) ?? []), r]);
  }
  const dead = [...byLang.entries()]
    .map(([lang, rs]) => ({ lang, rs, last: rs.reduce((a, b) => (Date.parse(b.pushedAt) > Date.parse(a.pushedAt) ? b : a)) }))
    .filter((d) => d.rs.length >= MIN.deadLanguageRepos && c.now - Date.parse(d.last.pushedAt) >= MIN.deadLanguageYears * YEAR && !alive(d.lang))
    .sort((a, b) => b.rs.length - a.rs.length || Date.parse(a.last.pushedAt) - Date.parse(b.last.pushedAt) || a.lang.localeCompare(b.lang))[0];
  if (!dead) return null;
  const year = String(new Date(Date.parse(dead.last.pushedAt)).getUTCFullYear());
  const years = (c.now - Date.parse(dead.last.pushedAt)) / YEAR;
  return make(
    "dead_language",
    BASE.dead_language + bounded(2 * years, 14),
    {
      fr: `Langage abandonné : ${dead.lang}, dernier repo poussé en ${year}.`,
      en: `Abandoned language: ${dead.lang}, last repo pushed in ${year}.`,
    },
    { fr: dead.lang, en: dead.lang },
    c.repoUrl(dead.last.name),
  );
}

/** Les commits datés de l'échantillon, à l'heure locale. */
function localCommits(c: Ctx): { c: CommitFact; d: Date }[] {
  if (c.offset === null) return [];
  return c.f.commits.filter((x) => ok(x.date) && typeof x.oid === "string" && !/^Merge\b/.test(x.message)).map((x) => ({ c: x, d: local(x.date, c.offset!) }));
}

const newest = (list: { c: CommitFact }[]) => [...list].sort((a, b) => Date.parse(b.c.date) - Date.parse(a.c.date))[0];

function hours(c: Ctx): Finding | null {
  const list = localCommits(c);
  if (list.length < MIN.commitsForShare) return null;
  const night = list.filter((x) => x.d.getUTCHours() >= 22 || x.d.getUTCHours() < 5);
  const nightShare = night.length / list.length;
  if (nightShare >= 0.2) {
    return make(
      "night_share",
      BASE.night_share + bounded(60 * nightShare, 30),
      {
        fr: `${pct(nightShare, "fr")} des derniers commits partent entre 22${NBSP}h et 5${NBSP}h.`,
        en: `${pct(nightShare, "en")} of recent commits go out between 10${NBSP}p.m. and 5${NBSP}a.m.`,
      },
      { fr: pct(nightShare, "fr"), en: pct(nightShare, "en") },
      c.commitUrl(newest(night)!.c),
    );
  }
  const early = list.filter((x) => x.d.getUTCHours() >= 5 && x.d.getUTCHours() < 8);
  const earlyShare = early.length / list.length;
  if (earlyShare >= 0.15) {
    return make(
      "early_bird",
      BASE.early_bird + bounded(60 * earlyShare, 27),
      { fr: `${pct(earlyShare, "fr")} des derniers commits partent avant 8${NBSP}h du matin.`, en: `${pct(earlyShare, "en")} of recent commits go out before 8${NBSP}a.m.` },
      { fr: pct(earlyShare, "fr"), en: pct(earlyShare, "en") },
      c.commitUrl(newest(early)!.c),
    );
  }
  return null;
}

function latestCommit(c: Ctx): Finding | null {
  const list = localCommits(c);
  if (list.length < MIN.commitsForHours) return null;
  // Le plus proche de 5 h en partant de 1 h : la nuit la plus longue.
  const late = list
    .filter((x) => x.d.getUTCHours() >= 1 && x.d.getUTCHours() < 5)
    .sort((a, b) => b.d.getUTCHours() * 60 + b.d.getUTCMinutes() - (a.d.getUTCHours() * 60 + a.d.getUTCMinutes()) || a.c.oid.localeCompare(b.c.oid))[0];
  if (!late) return null;
  const h = late.d.getUTCHours();
  const m = late.d.getUTCMinutes();
  return make(
    "latest_commit",
    BASE.latest_commit + (h - 1) * 4,
    {
      fr: `Commit le plus nocturne : ${clock(h, m, "fr")} du matin, dans ${late.c.repo}.`,
      en: `Latest-night commit: ${clock(h, m, "en")}, in ${late.c.repo}.`,
    },
    { fr: clock(h, m, "fr"), en: clock(h, m, "en") },
    c.commitUrl(late.c),
  );
}

function fridayEvening(c: Ctx): Finding | null {
  const list = localCommits(c).filter((x) => x.d.getUTCDay() === 5 && x.d.getUTCHours() >= 18);
  if (list.length < MIN.fridayCommits) return null;
  const n = list.length;
  return make(
    "friday_evening",
    BASE.friday_evening + bounded(n, 16),
    { fr: `${n} commits poussés un vendredi après 18${NBSP}h.`, en: `${n} commits pushed on a Friday after 6${NBSP}p.m.` },
    { fr: `${n} commits`, en: `${n} commits` },
    c.commitUrl(newest(list)!.c),
  );
}

/** Le calendrier jour par jour, s'il est là et cohérent. */
function days(c: Ctx): { start: number; counts: number[] } | null {
  const d = c.f.calendar?.days;
  if (!c.f.calendar?.available || !d || !Array.isArray(d.counts) || !/^\d{4}-\d{2}-\d{2}$/.test(d.start ?? "")) return null;
  const start = Date.parse(`${d.start}T00:00:00Z`);
  if (!Number.isFinite(start) || d.counts.some((n) => typeof n !== "number" || n < 0)) return null;
  return { start, counts: d.counts };
}

function weekdays(c: Ctx): Finding | null {
  const cal = days(c);
  if (!cal) return null;
  const sums = [0, 0, 0, 0, 0, 0, 0];
  cal.counts.forEach((n, i) => (sums[new Date(cal.start + i * DAY).getUTCDay()]! += n));
  const total = sums.reduce((a, b) => a + b, 0);
  if (total < MIN.calendarTotal) return null;
  const [sun, mon] = [sums[0]!, sums[1]!];
  if (sun > mon && sun >= 10) {
    return make(
      "sunday_over_monday",
      BASE.sunday_over_monday + bounded(mon > 0 ? 10 * (sun / mon - 1) : 10, 10),
      {
        fr: `Le dimanche, plus de contributions que le lundi : ${num(sun, "fr")} contre ${num(mon, "fr")} sur un an.`,
        en: `More contributions on Sundays than Mondays: ${num(sun, "en")} vs ${num(mon, "en")} over a year.`,
      },
      { fr: `${num(sun, "fr")} contre ${num(mon, "fr")}`, en: `${num(sun, "en")} vs ${num(mon, "en")}` },
      c.profile,
    );
  }
  const weekendShare = (sun + sums[6]!) / total;
  if (weekendShare >= 0.35) {
    return make(
      "weekend",
      BASE.weekend + bounded(30 * (weekendShare - 0.35), 10),
      { fr: `${pct(weekendShare, "fr")} des contributions tombent le week-end.`, en: `${pct(weekendShare, "en")} of contributions land on weekends.` },
      { fr: pct(weekendShare, "fr"), en: pct(weekendShare, "en") },
      c.profile,
    );
  }
  const best = sums.reduce((bi, v, i) => (v > sums[bi]! ? i : bi), 1);
  return make(
    "busiest_day",
    BASE.busiest_day,
    {
      fr: `Jour le plus chargé : le ${weekday(best, "fr")}, ${num(sums[best]!, "fr")} contributions sur un an.`,
      en: `Busiest day: ${weekday(best, "en")}, ${num(sums[best]!, "en")} contributions over a year.`,
    },
    { fr: weekday(best, "fr"), en: weekday(best, "en") },
    c.profile,
  );
}

function longestStreak(c: Ctx): Finding | null {
  const cal = days(c);
  if (!cal) return null;
  let best = 0;
  let run = 0;
  for (const n of cal.counts) {
    run = n > 0 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  if (best < MIN.streakDays) return null;
  const fr = `${best}${NBSP}jours`;
  const en = `${best}${NBSP}days`;
  return make(
    "longest_streak",
    BASE.longest_streak + bounded(best / 2.5, 40),
    { fr: `Plus longue série de l'année : ${fr} de contributions d'affilée.`, en: `Longest streak of the year: ${en} of contributions in a row.` },
    { fr, en },
    c.profile,
  );
}

function lazyMessage(c: Ctx): Finding | null {
  const counts = new Map<string, CommitFact[]>();
  for (const x of c.f.commits) {
    if (typeof x.message !== "string") continue;
    const m = x.message.trim().toLowerCase().replace(/\s+/g, " ").replace(/[!\s]+$/, "");
    if (!LAZY_QUOTABLE.test(m)) continue;
    counts.set(m, [...(counts.get(m) ?? []), x]);
  }
  const top = [...counts.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0];
  if (!top || top[1].length < MIN.lazyRepeats) return null;
  const [m, list] = top;
  const n = list.length;
  const last = [...list].filter((x) => ok(x.date)).sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0] ?? list[0]!;
  return make(
    "lazy_message",
    BASE.lazy_message + bounded(n, 20),
    { fr: `Message de commit préféré : « ${m} », ${n}${NBSP}fois.`, en: `Favourite commit message: “${m}”, ${n}${NBSP}times.` },
    { fr: `${n}${NBSP}fois`, en: `${n}${NBSP}times` },
    c.commitUrl(last),
  );
}

function firstCommit(c: Ctx): Finding | null {
  const first = c.f.firstRealCommit;
  if (!first || !ok(first.date)) return null;
  const years = (c.now - Date.parse(first.date)) / YEAR;
  if (years < 1) return null;
  // L'heure ne s'affiche qu'avec le décalage du commit lui-même : sinon, la date seule.
  const own = typeof first.offsetMinutes === "number" ? first.offsetMinutes : null;
  const d = local(first.date, own ?? c.offset ?? 0);
  const date = { fr: dayDate(d, "fr"), en: dayDate(d, "en") };
  let text: Fact = { fr: `Plus vieux commit retrouvé : ${date.fr}.`, en: `Oldest commit on record: ${date.en}.` };
  let bonus = 0;
  if (own !== null) {
    const h = d.getUTCHours();
    const m = d.getUTCMinutes();
    const night = h < 5;
    text = {
      fr: `Plus vieux commit retrouvé : ${date.fr}, à ${clock(h, m, "fr")}${night ? " du matin" : ""}.`,
      // « a.m. » ou « p.m. » ferme déjà la phrase
      en: `Oldest commit on record: ${date.en}, at ${clock(h, m, "en")}`,
    };
    bonus = night ? 14 : h >= 22 ? 8 : 2;
  }
  return make(
    "first_commit",
    BASE.first_commit + bounded(1.5 * years, 18) + bonus,
    text,
    date,
    c.commitUrl({ repo: first.repo, oid: first.oid }) ?? c.repoUrl(first.repo),
  );
}

function accomplice(c: Ctx): Finding | null {
  const a = c.f.accomplices?.[0];
  if (!a || typeof a.login !== "string" || !/^[A-Za-z0-9-]{1,39}$/.test(a.login)) return null;
  const n = a.commits;
  if (typeof n !== "number" || n < MIN.accompliceCommits) return null;
  return make(
    "accomplice",
    BASE.accomplice + bounded(4 * Math.log10(n), 14),
    {
      fr: `Complice principal : @${a.login}, ${num(n, "fr")} commits sur les mêmes repos.`,
      en: `Main accomplice: @${a.login}, ${num(n, "en")} commits on the same repos.`,
    },
    { fr: `@${a.login}`, en: `@${a.login}` },
    `https://github.com/${a.login}`,
  );
}

const FINDERS = [
  accountAge,
  contributionsYear,
  topStarred,
  externalPRs,
  oneDayRepos,
  abandonedRepo,
  deadLanguage,
  hours,
  latestCommit,
  fridayEvening,
  weekdays,
  longestStreak,
  lazyMessage,
  firstCommit,
  accomplice,
];

/**
 * Toutes les trouvailles GitHub qu'on peut affirmer, sans tri ni plafond (voir
 * `forReveal` et `strongest`). Des faits incomplets (collectés avant le §18.26,
 * ou en partie en échec) donnent moins de trouvailles, jamais une erreur.
 */
export function githubFindings(facts: unknown): Finding[] {
  const f = facts as GithubFacts | null;
  if (!f || typeof f !== "object" || typeof f.login !== "string" || !Array.isArray(f.repos) || !Array.isArray(f.commits)) return [];
  const now = ok(f.collectedAt) ? Date.parse(f.collectedAt) : Date.now();
  const byName = new Map(f.repos.map((r) => [r.name, r]));
  const ctx: Ctx = {
    f,
    now,
    login: f.login,
    profile: `https://github.com/${f.login}`,
    offset: typeof f.utcOffsetMinutes === "number" ? f.utcOffsetMinutes : null,
    repoUrl: (name) => {
      const full = byName.get(name)?.fullName;
      return full ? `https://github.com/${full}` : null;
    },
    commitUrl: ({ repo, oid }) => {
      const full = byName.get(repo)?.fullName;
      return full && oid && /^[0-9a-f]{7,40}$/i.test(oid) ? `https://github.com/${full}/commit/${oid}` : null;
    },
  };
  const out: Finding[] = [];
  for (const find of FINDERS) {
    try {
      const x = find(ctx);
      if (x) out.push(x);
    } catch {
      // une donnée de forme inattendue coûte une trouvaille, pas l'enquête
    }
  }
  return out;
}
