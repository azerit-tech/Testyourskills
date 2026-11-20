// Le top de la semaine (SPEC §18.22, §18.84). Semaine du lundi 00:00 UTC au dimanche
// 23:59 UTC. Le top classe des personnes, une ligne par personne, sur leur seule
// note : celle de leur dossier. Entrent les fiches racines de la semaine, sorties
// avec la lecture IA, encore en ligne, pas remplacées par un dossier plus complet :
// - un dossier à deux pièces LinkedIn et GitHub dont le lien est prouvé (GitHub
//   affiche ce LinkedIn, §18.24) : la note du dossier, sous son login ;
// - une fiche GitHub seule : sa note, sous son login ;
// - une fiche LinkedIn seule : sa note, sous le nom de sa fiche.
// Chaque ligne est la vraie personne (§18.88, shared/boardPerson.ts) : le nom de sa
// fiche (le @pseudo d'une fiche GitHub sans nom), sa photo ou ses initiales, et le
// lien vers sa fiche. Personne d'anonyme n'entre : voir la dénonciation plus bas.
// Une pièce d'un dossier n'entre jamais : elle n'a pas de note à elle. Un dossier
// dont le lien n'est pas prouvé (monté par un tiers sur le pseudo d'un autre, ou
// un CV déposé avec un pseudo) ne classe personne. Pour un login : il n'est pas
// masqué, son compte a 5 000 abonnés au plus (les célébrités gardent leur fiche
// mais ne bouchent pas le haut du tableau), et une fiche née d'une dénonciation
// (`cards.denounce_born`) n'entre, et ne porte la spéciale, qu'une fois son login
// revendiqué (`owners`) ; une fiche déjà faite, dénoncée ensuite depuis le cache,
// garde sa place. Une fiche LinkedIn seule née d'une dénonciation n'entre pas.
// Une ligne par personne : son dossier s'il existe, sinon sa fiche seule ; entre
// deux du même genre, la meilleure note de la semaine ; à égalité, la plus ancienne
// passe devant. Tout se calcule à la lecture, rien n'est écrit.
// Le classement d'une semaine est gardé 60 s en mémoire : il est demandé à
// chaque page de fiche, chaque image et chaque lecture du top. La base
// (db.ts) l'oublie dès qu'une fiche naît, part, ou qu'un login est masqué.

import type Database from "better-sqlite3";
import { boardPerson } from "../../shared/boardPerson";
import { fileOf } from "../../shared/caseFile";
import { catalogProfile, withCatalogProfiles } from "../../shared/profileCatalog";
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
  /** La fiche racine qui porte le rang de la personne : son dossier, sinon sa fiche seule. */
  id: string;
  /** Son login GitHub ; null pour une fiche LinkedIn seule. */
  login: string | null;
  overall: number;
  createdAt: number;
  /** Toutes ses fiches racines de la semaine qui entrent au classement. */
  ids: string[];
  /** L'adresse LinkedIn de la fiche qui porte le rang, s'il y en a une (§18.108). */
  linkedinUrl?: string | null;
}

/** Numéro de la semaine ISO de ce lundi (« 2026-W46 » donne 46). */
export function isoWeekNumber(monday: number): number {
  return Number(isoWeekLabel(monday).slice(-2));
}

/** Les abonnés du compte GitHub d'une fiche racine : sur ses faits, ou sur ceux de sa pièce GitHub. */
const FOLLOWERS_SQL = `COALESCE(
           json_extract(c.facts_json, '$.profile.followers'),
           (SELECT json_extract(g.facts_json, '$.profile.followers') FROM cards g WHERE g.parent_id = c.id AND g.source = 'github' LIMIT 1),
           0)`;

/**
 * Les fiches racines `c` qui peuvent porter le rang d'une personne (voir l'en-tête).
 * Paramètres, dans l'ordre : `now` (expiration), le plafond d'abonnés.
 */
const ENTERS_SQL = `c.parent_id IS NULL AND c.degraded = 0
         AND NOT EXISTS (SELECT 1 FROM cards s WHERE s.id = c.superseded_by AND s.denounce_born = 0)
         AND (c.expires_at IS NULL OR c.expires_at > ?)
         AND (
           (c.login IS NOT NULL
             AND ((c.kind = 'card' AND c.source = 'github')
               OR (c.kind = 'comparison' AND c.source = 'linkedin' AND COALESCE(json_extract(c.facts_json, '$.linkedinProven'), 0) = 1))
             AND ${FOLLOWERS_SQL} <= ?
             AND NOT EXISTS (SELECT 1 FROM owners o WHERE o.login = c.login AND o.hidden = 1)
             AND (c.denounce_born = 0 OR EXISTS (SELECT 1 FROM owners o WHERE o.login = c.login)))
           OR (c.login IS NULL AND c.kind = 'card' AND c.source = 'linkedin' AND c.denounce_born = 0)
         )`;

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

interface WeekRow {
  id: string;
  login: string | null;
  kind: "card" | "comparison";
  createdAt: number;
  overall: number | null;
  linkedinUrl: string | null;
}

/**
 * Le classement d'une semaine, du premier au dernier : une ligne par personne,
 * sur la note de son dossier (la seule), sinon de sa fiche seule.
 */
function computeWeek(db: Database.Database, monday: number, now: number): Ranked[] {
  const rows = db
    .prepare(
      `SELECT c.id, c.login, c.kind, c.created_at AS createdAt,
              CASE WHEN c.kind = 'comparison'
                   THEN COALESCE(json_extract(c.json, '$.grid.overall'), json_extract(c.json, '$.github.overall'))
                   ELSE json_extract(c.json, '$.overall') END AS overall,
              COALESCE(json_extract(c.facts_json, '$.linkedinUrl'), json_extract(c.json, '$.linkedinUrl')) AS linkedinUrl
       FROM cards c
       WHERE c.created_at >= ? AND c.created_at < ?
         AND ${ENTERS_SQL}
       ORDER BY overall DESC, c.created_at ASC, c.id ASC`,
    )
    .all(monday, monday + WEEK_MS, now, CELEBRITY_FOLLOWERS) as WeekRow[];
  // La personne d'une fiche : son login ; une fiche LinkedIn seule dont un dossier de la
  // semaine porte l'adresse est celle de ce login ; sinon son adresse LinkedIn.
  const loginOf = new Map<string, string>();
  for (const r of rows) if (r.login && r.linkedinUrl) loginOf.set(r.linkedinUrl, r.login);
  const person = (r: WeekRow) => (r.login ? `gh:${r.login}` : r.linkedinUrl ? (loginOf.has(r.linkedinUrl) ? `gh:${loginOf.get(r.linkedinUrl)}` : `li:${r.linkedinUrl}`) : `card:${r.id}`);
  // Les lignes arrivent dans l'ordre du classement : la première de chaque personne est
  // la sienne, sauf si elle a un dossier plus bas, qui passe devant ses fiches seules.
  const best = new Map<string, { row: WeekRow; ids: string[] }>();
  for (const r of rows) {
    if (typeof r.overall !== "number") continue;
    const key = person(r);
    const cur = best.get(key);
    if (!cur) best.set(key, { row: r, ids: [r.id] });
    else {
      cur.ids.push(r.id);
      if (r.kind === "comparison" && cur.row.kind !== "comparison") cur.row = r;
    }
  }
  return [...best.values()]
    .map(({ row, ids }) => ({ id: row.id, login: row.login, overall: row.overall!, createdAt: row.createdAt, ids, linkedinUrl: row.linkedinUrl }))
    .sort((a, b) => b.overall - a.overall || a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
}

/** Le haut du classement de la semaine en cours. */
export function weekTop(db: Database.Database, opts: { now?: number; limit?: number } = {}): WeekTop {
  const now = opts.now ?? Date.now();
  const limit = Math.max(0, Math.floor(opts.limit ?? 10));
  const monday = weekStart(now);
  const ranked = rankWeek(db, monday, now);
  const get = db.prepare(`SELECT json, kind FROM cards WHERE id = ?`);
  const entries: TopEntry[] = ranked.slice(0, limit).map((r, i) => {
    const raw = get.get(r.id) as { json: string; kind: string } | undefined;
    // Le nom du profil propre à la fiche (§18.107), comme sur sa page.
    const data = raw ? withCatalogProfiles(JSON.parse(raw.json)) : {};
    // La fiche telle qu'elle se montre : celle du dossier pour deux pièces (§18.36).
    const card = (raw?.kind === "comparison" ? fileOf(data as ComparisonData) : data) as Partial<CardData>;
    const profile: Fact | undefined = card.profile ? catalogProfile(card.profile).label : undefined;
    return {
      rank: i + 1,
      // La personne de la fiche : son nom, son visage, sa fiche (une fiche LinkedIn seule comprise).
      // Son LinkedIn (§18.108) : n'entre au top qu'une fiche faite ou revendiquée par sa personne (ENTERS_SQL).
      ...boardPerson(card, r.id, r.login, r.linkedinUrl),
      overall: r.overall,
      stars: starsFor(r.overall),
      ...(profile ? { profile } : {}),
    };
  });
  return { weekStart: monday, endsAt: monday + WEEK_MS, week: isoWeekNumber(monday), total: ranked.length, entries };
}

/**
 * Rang de la personne de cette fiche dans la semaine où la fiche est née, ou null si
 * la fiche n'entre pas au classement (CV, sortie sans IA, célébrité, masquée, expirée,
 * lien non prouvé, remplacée). L'id d'une pièce vaut celui de son dossier. `entry` dit
 * si c'est cette fiche-là qui porte le rang de la personne.
 */
export function weekRankDetail(
  db: Database.Database,
  cardId: string,
  now = Date.now(),
): (WeekRank & { entry: boolean; createdAt: number }) | null {
  // La fiche qui se montre à cette adresse : le dossier d'une pièce, ou celui qui a remplacé la fiche (db.ts, fileRow).
  const get = db.prepare(
    `SELECT c.id, c.created_at, COALESCE(c.parent_id, (SELECT s.id FROM cards s WHERE s.id = c.superseded_by AND s.denounce_born = 0)) AS next
     FROM cards c WHERE c.id = ?`,
  );
  type Hop = { id: string; created_at: number; next: string | null };
  let row = get.get(cardId) as Hop | undefined;
  for (let hops = 0; row?.next && hops < 8; hops++) row = (get.get(row.next) as Hop | undefined) ?? { ...row, next: null };
  if (!row) return null;
  const rootId = row.id;
  const monday = weekStart(row.created_at);
  const ranked = rankWeek(db, monday, now);
  // Cette fiche doit entrer elle-même : une fiche dégradée ne prend pas le rang d'une autre.
  const i = ranked.findIndex((r) => r.ids.includes(rootId));
  if (i < 0) return null;
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
    entry: me.id === rootId,
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
 * sur la fiche qui porte le rang d'une personne du top 5 de sa semaine, en direct
 * pendant la semaine et pour toujours ensuite. Une fiche qui a déjà une
 * spéciale garde la sienne. Pour un dossier, elle se pose sur sa pièce GitHub,
 * d'où la fiche du dossier la lit (shared/caseFile.ts).
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
  // Le rang est celui de la personne, sur la note de son dossier : la fiche racine.
  const d = weekRankDetail(db, data.id, now);
  const week = d ? publicRank(d) : null;
  if (!d || d.total < TOTW_MIN_ENTRIES || !d.inTop5 || !d.entry || card.special) return { data, totw: false, live, week };
  const marked: CardData = { ...card, special: "totw" };
  const out = (isCmp ? { ...(data as ComparisonData), github: marked } : marked) as T;
  return { data: out, totw: true, live, week };
}
