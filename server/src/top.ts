// Le top de la semaine (SPEC §18.22). Semaine du lundi 00:00 UTC au dimanche
// 23:59 UTC. Entrent les fiches GitHub de la semaine (fiche seule ou carte
// GitHub d'une comparaison), sorties avec la lecture IA, encore en ligne, dont le
// login n'est pas masqué, et dont le compte a 5 000 abonnés au plus : les
// célébrités gardent leur fiche mais ne bouchent pas le haut du tableau.
// La carte GitHub d'une comparaison LinkedIn n'entre que si le lien est prouvé
// (GitHub affiche ce LinkedIn, §18.24) : une comparaison montée par un tiers
// sur le pseudo d'un autre ne le classe pas. De même, une fiche née d'une
// dénonciation (`cards.denounced_by`) n'entre, et ne porte la spéciale, qu'une
// fois son login revendiqué (`owners`).
// Une ligne par login : sa meilleure note de la semaine ; à égalité, la fiche la
// plus ancienne passe devant. Tout se calcule à la lecture, rien n'est écrit.
// Le classement d'une semaine est gardé 60 s en mémoire : il est demandé à
// chaque page de fiche, chaque image et chaque lecture du top. La base
// (db.ts) l'oublie dès qu'une fiche naît, part, ou qu'un login est masqué.

import type Database from "better-sqlite3";
import { catalogProfile } from "../../shared/profileCatalog";
import type { CardData, ComparisonData, Fact, TopEntry, WeekRank, WeekTop } from "../../shared/types";
import { starsFor } from "../../shared/types";
import { isoWeekLabel, weekStart } from "./weekly";

export const WEEK_MS = 7 * 24 * 3600 * 1000;
/** Au-delà, le compte est hors concours (célébrité). */
export const CELEBRITY_FOLLOWERS = 5000;
/** Taille du top qui donne la spéciale « Top 5 de la semaine ». */
export const TOP_N = 5;
/** Logins classés qu'il faut dans la semaine pour que la spéciale ait un sens ; semaine close : le total final. */
export const TOTW_MIN_ENTRIES = 20;

interface Ranked {
  id: string;
  login: string;
  overall: number;
  createdAt: number;
}

/** Numéro de la semaine ISO de ce lundi (« 2026-W46 » donne 46). */
export function isoWeekNumber(monday: number): number {
  return Number(isoWeekLabel(monday).slice(-2));
}

/** Écarte la carte `c` d'une comparaison LinkedIn dont le lien avec ce GitHub n'est pas prouvé. */
const PROVEN_SQL = `NOT EXISTS (
           SELECT 1 FROM cards p
           WHERE p.id = c.parent_id AND p.source = 'linkedin'
             AND COALESCE(json_extract(p.facts_json, '$.linkedinProven'), 0) <> 1)`;

/**
 * Écarte la carte `c` née d'une dénonciation (elle, ou la comparaison dont elle
 * est la carte GitHub, a `denounced_by`) tant que son login n'est pas revendiqué :
 * une fiche faite par un tiers ne classe pas quelqu'un qui n'a rien demandé.
 */
const CLAIMED_IF_DENOUNCED_SQL = `(
           EXISTS (SELECT 1 FROM owners o WHERE o.login = c.login)
           OR (c.denounced_by IS NULL
               AND NOT EXISTS (SELECT 1 FROM cards p WHERE p.id = c.parent_id AND p.denounced_by IS NOT NULL)))`;

/** Durée pendant laquelle le classement d'une semaine est gardé en mémoire. */
export const RANK_CACHE_MS = 60_000;

/** Par base, puis par lundi : le classement et l'instant (`now` de l'appel) où il a été calculé. */
const rankCache = new WeakMap<Database.Database, Map<number, { at: number; ranked: Ranked[] }>>();

/** Oublie les classements gardés : une fiche est née, supprimée ou purgée, un login masqué ou revendiqué. */
export function forgetWeekRanks(db: Database.Database): void {
  rankCache.delete(db);
}

/** Le classement d'une semaine, gardé RANK_CACHE_MS. Ne pas modifier le tableau rendu. */
function rankWeek(db: Database.Database, monday: number, now: number): readonly Ranked[] {
  let weeks = rankCache.get(db);
  const hit = weeks?.get(monday);
  if (hit && Math.abs(now - hit.at) < RANK_CACHE_MS) return hit.ranked;
  if (!weeks) rankCache.set(db, (weeks = new Map()));
  // Les semaines qu'on ne regarde plus ne restent pas en mémoire.
  for (const [k, v] of weeks) if (Math.abs(now - v.at) >= RANK_CACHE_MS) weeks.delete(k);
  const ranked = computeWeek(db, monday, now);
  weeks.set(monday, { at: now, ranked });
  return ranked;
}

/**
 * Le classement d'une semaine, du premier au dernier : une ligne par login.
 * La requête rend toutes les fiches qui entrent, dans l'ordre du classement ;
 * la première de chaque login est la sienne.
 */
function computeWeek(db: Database.Database, monday: number, now: number): Ranked[] {
  const rows = db
    .prepare(
      `SELECT c.id, c.login, c.created_at AS createdAt, json_extract(c.json, '$.overall') AS overall
       FROM cards c
       WHERE c.created_at >= ? AND c.created_at < ?
         AND c.kind = 'card' AND c.source = 'github' AND c.login IS NOT NULL
         AND c.degraded = 0
         AND (c.expires_at IS NULL OR c.expires_at > ?)
         AND COALESCE(json_extract(c.facts_json, '$.profile.followers'), 0) <= ?
         AND NOT EXISTS (SELECT 1 FROM owners o WHERE o.login = c.login AND o.hidden = 1)
         AND ${PROVEN_SQL}
         AND ${CLAIMED_IF_DENOUNCED_SQL}
       ORDER BY overall DESC, c.created_at ASC, c.id ASC`,
    )
    .all(monday, monday + WEEK_MS, now, CELEBRITY_FOLLOWERS) as Ranked[];
  const seen = new Set<string>();
  const out: Ranked[] = [];
  for (const r of rows) {
    if (typeof r.overall !== "number" || seen.has(r.login)) continue;
    seen.add(r.login);
    out.push(r);
  }
  return out;
}

/** Le haut du classement de la semaine en cours. */
export function weekTop(db: Database.Database, opts: { now?: number; limit?: number } = {}): WeekTop {
  const now = opts.now ?? Date.now();
  const limit = Math.max(0, Math.floor(opts.limit ?? 10));
  const monday = weekStart(now);
  const ranked = rankWeek(db, monday, now);
  const get = db.prepare(`SELECT json FROM cards WHERE id = ?`);
  const entries: TopEntry[] = ranked.slice(0, limit).map((r, i) => {
    const raw = get.get(r.id) as { json: string } | undefined;
    const card = (raw ? JSON.parse(raw.json) : {}) as Partial<CardData>;
    const profile: Fact | undefined = card.profile ? catalogProfile(card.profile).label : undefined;
    return {
      rank: i + 1,
      cardId: r.id,
      login: card.login ?? r.login,
      ...(card.avatarUrl ? { avatarUrl: card.avatarUrl } : {}),
      overall: r.overall,
      stars: starsFor(r.overall),
      ...(profile ? { profile } : {}),
    };
  });
  return { weekStart: monday, endsAt: monday + WEEK_MS, week: isoWeekNumber(monday), total: ranked.length, entries };
}

/**
 * Rang du login de cette fiche dans la semaine où elle est née, ou null si la
 * fiche n'entre pas au classement (CV, sortie sans IA, célébrité, masquée,
 * expirée). `entry` dit si c'est cette fiche-là qui porte le rang du login.
 */
export function weekRankDetail(
  db: Database.Database,
  cardId: string,
  now = Date.now(),
): (WeekRank & { entry: boolean; createdAt: number }) | null {
  const row = db.prepare(`SELECT login, created_at FROM cards WHERE id = ?`).get(cardId) as
    | { login: string | null; created_at: number }
    | undefined;
  if (!row?.login) return null;
  const monday = weekStart(row.created_at);
  const ranked = rankWeek(db, monday, now);
  const i = ranked.findIndex((r) => r.login === row.login);
  if (i < 0) return null;
  // Cette fiche doit entrer elle-même : une fiche dégradée ne prend pas le rang d'une autre.
  const own = db
    .prepare(
      `SELECT 1 FROM cards c
       WHERE c.id = ? AND c.kind = 'card' AND c.source = 'github' AND c.degraded = 0
         AND (c.expires_at IS NULL OR c.expires_at > ?)
         AND COALESCE(json_extract(c.facts_json, '$.profile.followers'), 0) <= ?
         AND ${PROVEN_SQL}
         AND ${CLAIMED_IF_DENOUNCED_SQL}`,
    )
    .get(cardId, now, CELEBRITY_FOLLOWERS);
  if (!own) return null;
  const me = ranked[i]!;
  const fifth = ranked[TOP_N - 1];
  const inTop5 = i < TOP_N;
  return {
    rank: i + 1,
    total: ranked.length,
    // Passer devant le 5e : à égalité, la fiche la plus ancienne garde sa place.
    gapToTop5: inTop5 || !fifth ? 0 : fifth.overall - me.overall + 1,
    inTop5,
    week: isoWeekNumber(monday),
    closed: now >= monday + WEEK_MS,
    entry: me.id === cardId,
    createdAt: row.created_at,
  };
}

function publicRank(d: WeekRank & { entry: boolean; createdAt: number }): WeekRank {
  const { entry: _e, createdAt: _c, ...rank } = d;
  return rank;
}

/** Rang de la semaine pour l'API : sans les détails internes. */
export function weekRank(db: Database.Database, cardId: string, now = Date.now()): WeekRank | null {
  const d = weekRankDetail(db, cardId, now);
  return d ? publicRank(d) : null;
}

/**
 * La spéciale « Top 5 de la semaine », posée à la lecture (jamais écrite) :
 * sur la fiche qui porte le rang d'un login du top 5 de sa semaine, en direct
 * pendant la semaine et pour toujours ensuite. Une fiche qui a déjà une
 * spéciale garde la sienne. Pour une comparaison, c'est sa carte GitHub.
 * Seulement si la semaine compte au moins TOTW_MIN_ENTRIES logins classés
 * (une semaine close : son total final) : portée par tous, elle ne dirait rien.
 * `live` : la semaine de la fiche n'est pas finie, la spéciale peut encore
 * venir ou partir (ses images ne se gardent pas longtemps en cache).
 */
export function withWeekSpecial<T extends CardData | ComparisonData>(
  db: Database.Database,
  data: T,
  now = Date.now(),
): { data: T; totw: boolean; live: boolean; week: WeekRank | null } {
  const isCmp = "cv" in data && "github" in data;
  const card = isCmp ? (data as ComparisonData).github : (data as CardData);
  const born = Date.parse(card.createdAt);
  const live = Number.isFinite(born) && now < weekStart(born) + WEEK_MS;
  const d = weekRankDetail(db, card.id, now);
  const week = d ? publicRank(d) : null;
  if (!d || d.total < TOTW_MIN_ENTRIES || !d.inTop5 || !d.entry || card.special) return { data, totw: false, live, week };
  const marked: CardData = { ...card, special: "totw" };
  const out = (isCmp ? { ...(data as ComparisonData), github: marked } : marked) as T;
  return { data: out, totw: true, live, week };
}
