// Les bandes (SPEC §18.38, entrée d'office §18.82) : le classement par école et par boîte.
//
// Qui joue : toute fiche (GitHub, LinkedIn seule, CV, dossier à deux pièces, sa
// note du dossier), sauf les fiches sorties sans lecture IA, expirées ou
// masquées. Une personne (login GitHub, sinon adresse LinkedIn, sinon la fiche),
// une école et une boîte au plus.
//
// L'entrée d'office (autoJoinBands, §18.82) : dès que la fiche est posée, sa
// personne entre dans la bande de l'école lue sur son profil (LinkedIn, CV) et
// dans celle de son employeur actuel (LinkedIn, sinon CV, sinon le champ
// « company » du profil GitHub), si le nom passe les mêmes contrôles qu'un nom
// tapé. Une fiche née d'une dénonciation y entre aussi, dès qu'elle sort, comme
// toute autre fiche (§18.119) ; la revendication la relance (auth.ts). Elle ne remplace jamais une bande déjà tenue, ne
// rouvre pas une ligue quittée (band_optouts), et ne prend rien à la limite par
// IP. Un dossier à deux pièces est une seule personne : la nouvelle fiche reprend
// l'entrée de la pièce qu'elle complète, avec les étoiles du dossier.
//
// À la main : seul le navigateur qui a créé la fiche (son jeton) ou la personne
// connectée comme propriétaire change de bande ou en sort (une fiche née d'une
// dénonciation : sa personne, une fois revendiquée) ; trois entrées par
// jour et par IP, l'entrée d'office non comptée.
//
// Le score d'une bande : la somme des étoiles de ses vingt meilleurs dossiers. À
// égalité : le plus de dossiers, puis la bande la plus ancienne (son premier
// membre encore compté). Au classement dès sa première fiche (§18.38, 20 novembre
// 2026 ; trois avant). Tout se calcule à la lecture (comme top.ts), gardé 60 s
// en mémoire et oublié à chaque entrée, sortie, suppression, purge ou masquage.
//
// Le rang d'école du barème n'apparaît nulle part ici. Sur la page d'une bande,
// chaque membre est la vraie personne (§18.88) : le nom de sa fiche (le @pseudo
// d'une fiche GitHub sans nom), sa photo ou ses initiales, son profil criminel,
// ses étoiles, et le lien vers sa fiche, une fiche née d'une dénonciation comprise
// (§18.119 ; son LinkedIn attend qu'elle soit revendiquée, §18.108) ; un pseudo
// masqué n'y est pas.
//
// Le nom d'une boîte hors alias vient de son premier membre (tapé, ou lu sur son
// profil) : refusé s'il porte une insulte, une adresse, un @ ou un numéro,
// toujours nettoyé ; sa page, son image et sa place au classement viennent avec sa
// première fiche, comme une école (hasPage). Une bande fermée à la main (data/bands.json, blocked)
// n'existe plus pour personne.

import type Database from "better-sqlite3";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { boardPerson } from "../../shared/boardPerson";
import {
  BAND_ID_MAX,
  BAND_ID_RE,
  BAND_JOINS_PER_DAY,
  BAND_MIN_MEMBERS,
  BAND_TOP_MEMBERS,
  BAND_TYPES,
  COMPANY_INPUT_MAX,
  bandHasPage,
  cleanCompanyLabel,
  companyAliasLabel,
  companyBand,
  companyCheck,
  isBandType,
  isBlockedBand,
  schoolById,
  type BandBoard,
  type BandMember,
  type BandPage,
  type BandRef,
  type BandStanding,
  type BandsTop,
  type BandType,
  type MyBands,
} from "../../shared/bands";
import { fileOf } from "../../shared/caseFile";
import type { CardData, ComparisonData, Fact } from "../../shared/types";
import { starsFor } from "../../shared/types";
import { frTypo } from "../../shared/typo";
import type { CardRow, Store } from "./db";
import { clientIp, type RateLimiter } from "./ratelimit";

/** Id d'une fiche (pipeline.ts, ID_RE), recopié : db.ts importe ce module, qui ne doit pas importer le pipeline. */
const ID_RE = /^[A-Za-z0-9]{6,32}$/;

/** Durée pendant laquelle le classement d'une ligue est gardé en mémoire. */
export const BANDS_CACHE_MS = 60_000;
/** Membres listés sur la page d'une bande. */
export const BAND_PAGE_MEMBERS = 50;
/** Bandes du tableau d'une ligue ; l'accueil en montre cinq. */
export const BOARD_SIZE = 20;
export const HOME_SIZE = 5;
/** Bandes sous le seuil listées sous le tableau d'une ligue (aucune depuis le seuil d'une fiche). */
export const FORMING_SIZE = 10;

const f = (fr: string, en: string): Fact => ({ fr: frTypo(fr), en });

export const BAND_MESSAGES = {
  forbidden: f("Seule la personne fichée fait entrer sa fiche dans une bande.", "Only the person on file can put their sheet in a crew."),
  denounced: f("Une fiche faite par quelqu'un d'autre change de bande une fois revendiquée.", "A sheet someone else made changes crew once it's claimed."),
  degraded: f("Cette fiche est sortie sans que le code soit lu. Refais-la pour rejoindre une bande.", "This sheet came out without the code being read. Make it again to join a crew."),
  notBand: f("Pas une bande. Donne le nom de ta boîte.", "Not a crew. Give your company's name."),
  unknownSchool: f("Choisis une école de la liste.", "Pick a school from the list."),
  limited: f("Trois entrées par jour, c'est le maximum. Reviens demain.", "Three joins a day is the limit. Come back tomorrow."),
  notFound: f("Cette bande n'existe pas, ou plus.", "This crew doesn't exist, or no longer does."),
  refusedWord: f("Ce nom ne passe pas. Donne le nom de ta boîte, tel qu'il s'écrit.", "That name won't do. Give your company's name as it's written."),
  refusedContact: f("Le nom de la boîte seulement : ni adresse, ni @, ni numéro.", "Just the company's name: no address, no @, no number."),
} as const;

// --- Table --------------------------------------------------------------------

/** La table des membres, ajoutée par migrate() (db.ts). Une ligne par personne et par ligue. */
export function ensureBandTables(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS band_members (
    person_key TEXT NOT NULL,              -- gh:{login} | li:{adresse LinkedIn normalisée} | card:{id}
    kind       TEXT NOT NULL CHECK (kind IN ('ecole', 'boite')),
    band_id    TEXT NOT NULL,              -- data/bands.json pour une école, nom normalisé pour une boîte
    label      TEXT NOT NULL,              -- libellé au moment d'entrer
    card_id    TEXT NOT NULL,              -- la fiche qui rapporte ses étoiles
    login      TEXT,                       -- login GitHub de la personne, pour le masquage et le @pseudo revendiqué
    stars      INTEGER NOT NULL,
    joined_at  INTEGER NOT NULL,           -- ms epoch
    PRIMARY KEY (person_key, kind)
  );
  CREATE INDEX IF NOT EXISTS band_members_band ON band_members(kind, band_id);
  CREATE INDEX IF NOT EXISTS band_members_card ON band_members(card_id);
  -- Une ligue quittée à la main : l'entrée d'office ne la rouvre pas (§18.82). Part avec la fiche.
  CREATE TABLE IF NOT EXISTS band_optouts (
    person_key TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('ecole', 'boite')),
    card_id    TEXT NOT NULL,              -- la fiche d'où la personne est sortie
    at         INTEGER NOT NULL,           -- ms epoch
    PRIMARY KEY (person_key, kind)
  );
  CREATE INDEX IF NOT EXISTS band_optouts_card ON band_optouts(card_id);`);
}

/** Supprime les membres portés par ces fiches (fiche supprimée ou purgée). */
export function removeBandMembers(db: Database.Database, cardIds: string[]): void {
  if (!cardIds.length) return;
  const stmt = db.prepare(`DELETE FROM band_members WHERE card_id = ?`);
  const out = db.prepare(`DELETE FROM band_optouts WHERE card_id = ?`);
  for (const id of cardIds) {
    stmt.run(id);
    out.run(id);
  }
  forgetBands(db);
}

// --- Classement, calculé à la lecture -----------------------------------------

interface League {
  type: BandType;
  id: string;
  label: string;
  score: number;
  members: number;
  /** Arrivée du plus ancien membre encore compté : départage les égalités. */
  since: number;
}

interface Computed {
  all: Map<string, League>;
  /** Au classement (BAND_MIN_MEMBERS dossiers ou plus : une fiche), du premier au dernier. */
  ranked: League[];
}

const cache = new WeakMap<Database.Database, Map<BandType, { at: number; data: Computed }>>();

/** Oublie les classements gardés : une entrée, une sortie, une fiche supprimée, purgée ou masquée. */
export function forgetBands(db: Database.Database): void {
  cache.delete(db);
}

/** Le libellé d'une bande : la liste pour une école, l'alias ou le nom nettoyé du premier membre pour une boîte. */
function labelOf(type: BandType, id: string, first: string): string {
  if (type === "ecole") return schoolById(id)?.label ?? first;
  return companyAliasLabel(id) ?? (cleanCompanyLabel(first) || id);
}

function compute(db: Database.Database, type: BandType, now: number): Computed {
  const rows = db
    .prepare(
      `SELECT m.band_id AS id, m.label, m.stars, m.joined_at AS joinedAt
       FROM band_members m JOIN cards c ON c.id = m.card_id
       WHERE m.kind = ? AND c.degraded = 0
         AND (c.expires_at IS NULL OR c.expires_at > ?)
         AND NOT EXISTS (SELECT 1 FROM owners o WHERE o.login = m.login AND o.hidden = 1)
       ORDER BY m.band_id, m.stars DESC, m.joined_at ASC`,
    )
    .all(type, now) as { id: string; label: string; stars: number; joinedAt: number }[];
  const groups = new Map<string, { stars: number[]; first: { label: string; at: number } }>();
  for (const r of rows) {
    let g = groups.get(r.id);
    if (!g) groups.set(r.id, (g = { stars: [], first: { label: r.label, at: r.joinedAt } }));
    g.stars.push(r.stars);
    if (r.joinedAt < g.first.at) g.first = { label: r.label, at: r.joinedAt };
  }
  const all = new Map<string, League>();
  for (const [id, g] of groups) {
    // Fermée à la main, ou nom refusé : la bande n'existe plus, ni au tableau ni ailleurs.
    if (isBlockedBand(type, id, g.first.label)) continue;
    const score = g.stars.slice(0, BAND_TOP_MEMBERS).reduce((s, n) => s + n, 0);
    all.set(id, { type, id, label: labelOf(type, id, g.first.label), score, members: g.stars.length, since: g.first.at });
  }
  const ranked = [...all.values()]
    .filter((b) => b.members >= BAND_MIN_MEMBERS)
    .sort((a, b) => b.score - a.score || b.members - a.members || a.since - b.since || a.id.localeCompare(b.id));
  return { all, ranked };
}

function league(db: Database.Database, type: BandType, now: number): Computed {
  let byType = cache.get(db);
  const hit = byType?.get(type);
  if (hit && Math.abs(now - hit.at) < BANDS_CACHE_MS) return hit.data;
  if (!byType) cache.set(db, (byType = new Map()));
  const data = compute(db, type, now);
  byType.set(type, { at: now, data });
  return data;
}

function toStanding(c: Computed, b: League): BandStanding {
  const i = c.ranked.indexOf(b);
  const base = { type: b.type, id: b.id, label: b.label, score: b.score, members: b.members, hasPage: bandHasPage(b.type, b.id, b.members) };
  if (i < 0) return { ...base, rank: null, missing: Math.max(0, BAND_MIN_MEMBERS - b.members), gap: null, ahead: null };
  const prev = i > 0 ? c.ranked[i - 1]! : null;
  return {
    ...base,
    rank: i + 1,
    missing: 0,
    gap: prev ? prev.score - b.score : null,
    ahead: prev ? { id: prev.id, label: prev.label, rank: i } : null,
  };
}

/** Une école de la liste sans membre compté : hors classement, il lui manque une fiche. */
function emptyStanding(ref: BandRef): BandStanding {
  return { ...ref, score: 0, members: 0, rank: null, missing: BAND_MIN_MEMBERS, gap: null, ahead: null, hasPage: bandHasPage(ref.type, ref.id, 0) };
}

/** La place d'une bande ; une école de la liste existe toujours, une boîte sans membre non, une bande fermée non plus. */
export function bandStanding(db: Database.Database, type: BandType, id: string, now = Date.now()): BandStanding | null {
  if (isBlockedBand(type, id)) return null;
  const c = league(db, type, now);
  const b = c.all.get(id);
  if (b) return toStanding(c, b);
  const school = type === "ecole" ? schoolById(id) : null;
  return school ? emptyStanding(school) : null;
}

/** La place d'une bande qui a sa page publique (hasPage). */
export function publicBandStanding(db: Database.Database, type: BandType, id: string, now = Date.now()): BandStanding | null {
  const b = bandStanding(db, type, id, now);
  return b?.hasPage ? b : null;
}

/**
 * Le tableau d'une ligue : les vingt premières ; `withId` si elle est plus bas ou en
 * formation ; puis les bandes sous le seuil qui ont leur page publique, les plus
 * avancées d'abord (aucune depuis le seuil d'une fiche, 20 novembre 2026).
 */
export function bandBoard(db: Database.Database, type: BandType, withId?: string | null, now = Date.now()): BandBoard {
  const c = league(db, type, now);
  const entries = c.ranked.slice(0, BOARD_SIZE).map((b) => toStanding(c, b));
  const found = withId && !entries.some((e) => e.id === withId) ? publicBandStanding(db, type, withId, now) : null;
  const extra = found && found.members > 0 ? found : null;
  const forming = [...c.all.values()]
    .filter((b) => b.members < BAND_MIN_MEMBERS && b.id !== extra?.id && bandHasPage(b.type, b.id, b.members))
    .sort((a, b) => b.members - a.members || b.score - a.score || a.since - b.since || a.id.localeCompare(b.id))
    .slice(0, FORMING_SIZE)
    .map((b) => toStanding(c, b));
  return { type, total: c.ranked.length, entries, forming, extra };
}

/**
 * L'ordre de l'accueil (§18.92) : les bandes au classement, toutes dès leur première
 * fiche (20 novembre 2026), puis celles sous le seuil qui ont leur page publique, le
 * plus d'étoiles d'abord, puis le plus de dossiers, puis la plus ancienne.
 */
function homeOrder(c: Computed): League[] {
  const forming = [...c.all.values()]
    .filter((b) => b.members < BAND_MIN_MEMBERS && bandHasPage(b.type, b.id, b.members))
    .sort((a, b) => b.score - a.score || b.members - a.members || a.since - b.since || a.id.localeCompare(b.id));
  return [...c.ranked, ...forming];
}

/**
 * Le classement de chaque ligue pour l'accueil : cinq lignes au plus, le tableau d'abord,
 * les bandes sous le seuil pour les places qui restent. `mine` : la bande de la personne
 * dans chaque ligue ; plus bas que les cinq lignes, elle vient en plus, avec sa place.
 */
export function bandsTop(db: Database.Database, now = Date.now(), mine: Partial<Record<BandType, string | null>> = {}): BandsTop {
  const out: BandsTop = { ecole: [], boite: [] };
  for (const type of BAND_TYPES) {
    const c = league(db, type, now);
    const order = homeOrder(c);
    out[type] = order.slice(0, HOME_SIZE).map((b) => toStanding(c, b));
    const i = mine[type] ? order.findIndex((b) => b.id === mine[type]) : -1;
    if (i >= HOME_SIZE) (out.mine ??= {})[type] = { place: i + 1, band: toStanding(c, order[i]!) };
  }
  return out;
}

/**
 * Les membres d'une bande, du plus étoilé au moins étoilé : la personne de chaque
 * fiche (§18.88), une fiche née d'une dénonciation comprise (§18.119).
 */
function bandMembers(store: Store, type: BandType, id: string, now: number): BandMember[] {
  const rows = store.db
    .prepare(
      `SELECT m.card_id AS cardId, m.login, m.stars
       FROM band_members m JOIN cards c ON c.id = m.card_id
       WHERE m.kind = ? AND m.band_id = ? AND c.degraded = 0
         AND (c.expires_at IS NULL OR c.expires_at > ?)
         AND NOT EXISTS (SELECT 1 FROM owners o WHERE o.login = m.login AND o.hidden = 1)
       ORDER BY m.stars DESC, m.joined_at ASC
       LIMIT ?`,
    )
    .all(type, id, now, BAND_PAGE_MEMBERS) as { cardId: string; login: string | null; stars: number }[];
  return rows.map((r) => {
    const row = store.getCard(r.cardId);
    const card = row ? mainCard(row) : null;
    const profile = card?.profile?.label ?? null;
    // Le poste, déjà sur la fiche publique : deux dossiers du même profil ne se lisent plus comme un doublon.
    const position = card?.position;
    const root = row ? rootOf(store, row) : null;
    const login = r.login ?? (root ? store.loginOf(root) : null);
    // Son LinkedIn (§18.108), revendiquée ou non : ce ne sont que des données publiques.
    const linkedinUrl = root ? linkedinOf(root) : null;
    return { stars: r.stars, profile, ...(position ? { position } : {}), ...(card && root ? boardPerson(card, r.cardId, login, linkedinUrl) : {}) };
  });
}

/** La page d'une bande ; null si elle n'existe pas ou n'a pas encore de page publique. */
export function bandPage(store: Store, type: BandType, id: string, now = Date.now()): BandPage | null {
  const band = publicBandStanding(store.db, type, id, now);
  if (!band) return null;
  return { band, members: band.members > 0 ? bandMembers(store, type, id, now) : [] };
}

// --- La personne et ses bandes -------------------------------------------------

/** La fiche racine : un dossier à deux pièces pour ses cartes. */
export function rootOf(store: Store, row: CardRow): CardRow | null {
  return row.parentId ? store.getCard(row.parentId) : row;
}

/** La fiche telle qu'elle se montre : celle du dossier pour deux pièces (§18.36). */
function mainCard(row: CardRow): CardData {
  return row.kind === "comparison" ? fileOf(row.data as ComparisonData) : (row.data as CardData);
}

/** Les étoiles qu'une fiche rapporte : celles de sa note, la note du dossier pour deux pièces. */
export function starsOfRow(row: CardRow): number {
  return starsFor(mainCard(row).overall);
}

/** La personne d'une fiche : son login GitHub, sinon son adresse LinkedIn, sinon la fiche elle-même. */
export function personKey(store: Store, root: CardRow): string {
  const login = store.loginOf(root);
  if (login) return `gh:${login.toLowerCase()}`;
  const facts = root.facts as { linkedinUrl?: unknown } | null;
  const url = typeof facts?.linkedinUrl === "string" ? facts.linkedinUrl : (root.data as CardData).linkedinUrl;
  if (typeof url === "string" && url) return `li:${url}`;
  return `card:${root.id}`;
}

/** L'école lue et l'employeur actuel de la fiche, ramenés aux bandes. */
function suggestions(root: CardRow): MyBands["suggest"] {
  const data = root.data as CardData | ComparisonData;
  const cmp = root.kind === "comparison" ? (data as ComparisonData) : null;
  const schoolId = cmp ? (cmp.cv.school ?? cmp.github.school) : (data as CardData).school;
  // L'employeur lu s'écrit parfois « @Doctolib » : ce @ de tête part ; tapé à la main, un @ est refusé.
  const club = mainCard(root).club?.replace(/^\s*@\s*/, "");
  return { ecole: schoolId ? schoolById(schoolId) : null, boite: companyBand(club) };
}

interface MemberRow {
  band_id: string;
  label: string;
  card_id: string;
  joined_at: number;
}

function membership(db: Database.Database, key: string, type: BandType): MemberRow | null {
  return (db.prepare(`SELECT band_id, label, card_id, joined_at FROM band_members WHERE person_key = ? AND kind = ?`).get(key, type) as MemberRow | undefined) ?? null;
}

/** Les bandes de la personne de cette fiche, et les pastilles proposées. */
export function myBands(store: Store, root: CardRow, now = Date.now()): MyBands {
  const key = personKey(store, root);
  const standing = (type: BandType): BandStanding | null => {
    const m = membership(store.db, key, type);
    // Une bande fermée à la main : la personne n'en est plus, elle peut en choisir une autre.
    if (!m || isBlockedBand(type, m.band_id, m.label)) return null;
    // Sa propre fiche ne compte plus (masquée, expirée) : la bande reste nommée, à zéro.
    return bandStanding(store.db, type, m.band_id, now) ?? emptyStanding({ type, id: m.band_id, label: labelOf(type, m.band_id, m.label) });
  };
  return { stars: starsOfRow(root), ecole: standing("ecole"), boite: standing("boite"), suggest: suggestions(root) };
}

/**
 * Fait entrer la personne de cette fiche dans une bande, à la place de celle
 * qu'elle avait dans cette ligue. `changed` : une vraie entrée (comptée dans la
 * limite par IP) ; rester dans la même bande ne fait que relire la fiche et ses étoiles.
 */
export function joinBand(store: Store, root: CardRow, ref: BandRef, now = Date.now()): { changed: boolean } {
  const key = personKey(store, root);
  const login = store.loginOf(root)?.toLowerCase() ?? null;
  const stars = starsOfRow(root);
  const prev = membership(store.db, key, ref.type);
  if (prev && prev.band_id === ref.id) {
    store.db.prepare(`UPDATE band_members SET card_id = ?, stars = ?, login = ? WHERE person_key = ? AND kind = ?`).run(root.id, stars, login, key, ref.type);
    forgetBands(store.db);
    return { changed: false };
  }
  store.db
    .prepare(
      `INSERT INTO band_members (person_key, kind, band_id, label, card_id, login, stars, joined_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(person_key, kind) DO UPDATE SET band_id = excluded.band_id, label = excluded.label,
         card_id = excluded.card_id, login = excluded.login, stars = excluded.stars, joined_at = excluded.joined_at`,
    )
    .run(key, ref.type, ref.id, ref.label.slice(0, BAND_ID_MAX), root.id, login, stars, now);
  // Entrer efface la sortie d'avant : la ligue n'est plus quittée.
  store.db.prepare(`DELETE FROM band_optouts WHERE person_key = ? AND kind = ?`).run(key, ref.type);
  forgetBands(store.db);
  return { changed: true };
}

/**
 * La personne de cette fiche quitte sa bande de cette ligue. false si elle n'en
 * avait pas. La sortie est retenue : l'entrée d'office ne rouvre pas cette ligue
 * (§18.82), seule une entrée à la main le fait.
 */
export function leaveBand(store: Store, root: CardRow, type: BandType, now = Date.now()): boolean {
  const key = personKey(store, root);
  const r = store.db.prepare(`DELETE FROM band_members WHERE person_key = ? AND kind = ?`).run(key, type);
  if (r.changes > 0) {
    store.db
      .prepare(
        `INSERT INTO band_optouts (person_key, kind, card_id, at) VALUES (?, ?, ?, ?)
         ON CONFLICT(person_key, kind) DO UPDATE SET card_id = excluded.card_id, at = excluded.at`,
      )
      .run(key, type, root.id, now);
  }
  forgetBands(store.db);
  return r.changes > 0;
}

// --- L'entrée d'office (§18.82) ---------------------------------------------------

/** La fiche compte encore : en base, lue par l'IA, pas expirée. */
function counts(row: CardRow | null, now: number): row is CardRow {
  return !!row && !row.degraded && (row.expiresAt === null || row.expiresAt > now);
}

/** L'adresse LinkedIn d'une fiche racine (ses faits, sinon la fiche), ou null. */
function linkedinOf(root: CardRow): string | null {
  const facts = root.facts as { linkedinUrl?: unknown } | null;
  const url = typeof facts?.linkedinUrl === "string" ? facts.linkedinUrl : root.kind === "card" ? (root.data as CardData).linkedinUrl : undefined;
  return typeof url === "string" && url ? url : null;
}

/**
 * La nouvelle fiche complète-t-elle celle-ci (« Ajoute ton GitHub », « Ajoute ton
 * LinkedIn ») ? Même login, ou même adresse LinkedIn. Le navigateur a déjà prouvé
 * qu'il tient le jeton de l'ancienne (app.ts).
 */
function samePerson(store: Store, root: CardRow, from: CardRow): boolean {
  const a = store.loginOf(root)?.toLowerCase();
  const b = store.loginOf(from)?.toLowerCase();
  if (a && b) return a === b;
  const la = linkedinOf(root);
  return !!la && la === linkedinOf(from);
}

/** Les entrées et les sorties tenues sous l'ancienne clé passent sous la nouvelle ; la nouvelle garde les siennes. */
function adoptKey(db: Database.Database, from: string, to: string): void {
  for (const table of ["band_members", "band_optouts"] as const) {
    db.prepare(`UPDATE OR IGNORE ${table} SET person_key = ? WHERE person_key = ?`).run(to, from);
    db.prepare(`DELETE FROM ${table} WHERE person_key = ?`).run(from);
  }
}

export interface AutoJoinOptions {
  now?: number;
  /**
   * La fiche que celle-ci complète, faite par le même navigateur (son jeton
   * vérifié par l'appelant) : ses bandes suivent, une personne reste une entrée.
   */
  from?: CardRow | null;
  /**
   * Une ligue déjà tenue n'est pas touchée du tout, pas même ses étoiles : pour le
   * rattrapage (rattrapageBandes.ts), qui ne fait qu'ajouter les entrées manquantes.
   */
  keepHeld?: boolean;
}

/**
 * L'entrée d'office (§18.82) : la personne de cette fiche entre dans la bande de
 * l'école lue sur son profil et dans celle de son employeur actuel. Rend les
 * ligues où elle vient d'entrer.
 *
 * - Jamais pour une fiche sans lecture IA, expirée ou masquée. Une fiche née d'une
 *   dénonciation entre comme les autres (§18.119).
 * - Une ligue déjà tenue n'est pas remplacée : la fiche neuve y rapporte seulement
 *   ses étoiles (celles du dossier pour deux pièces ; une pièce seule ne prend pas
 *   la place d'un dossier qui compte encore).
 * - Une ligue quittée à la main reste quittée ; une bande fermée reste fermée.
 * - Rien n'est pris à la limite par IP : elle ne garde que les entrées à la main.
 */
export function autoJoinBands(store: Store, row: CardRow, o: AutoJoinOptions = {}): BandType[] {
  const now = o.now ?? Date.now();
  const root = rootOf(store, row);
  if (!counts(root, now)) return [];
  const login = store.loginOf(root);
  if (login && store.isHidden(login)) return [];

  const key = personKey(store, root);
  const from = o.from ? rootOf(store, o.from) : null;
  if (from && from.id !== root.id && !from.denounceBorn && samePerson(store, root, from)) {
    const old = personKey(store, from);
    if (old !== key) adoptKey(store.db, old, key);
  }

  const suggest = suggestions(root);
  const stars = starsOfRow(root);
  const joined: BandType[] = [];
  for (const type of ["ecole", "boite"] as const) {
    const held = membership(store.db, key, type);
    if (held) {
      if (o.keepHeld || held.card_id === root.id) continue;
      const before = store.getCard(held.card_id);
      // Le dossier porte la note de la personne : une pièce seule refaite après lui ne la rabaisse pas.
      if (counts(before, now) && before.kind === "comparison" && root.kind !== "comparison") continue;
      store.db
        .prepare(`UPDATE band_members SET card_id = ?, stars = ?, login = ? WHERE person_key = ? AND kind = ?`)
        .run(root.id, stars, login?.toLowerCase() ?? null, key, type);
      continue;
    }
    const left = store.db.prepare(`SELECT 1 FROM band_optouts WHERE person_key = ? AND kind = ?`).get(key, type);
    const ref = suggest[type];
    if (left || !ref || isBlockedBand(type, ref.id, ref.label)) continue;
    joinBand(store, root, ref, now);
    store.recordEvent("band_join", root.id, { type, auto: true });
    joined.push(type);
  }
  forgetBands(store.db);
  return joined;
}

// --- API -------------------------------------------------------------------------

const typeSchema = z.enum(["ecole", "boite"]);

const joinSchema = z.object({
  cardId: z.string().regex(ID_RE),
  type: typeSchema,
  /** Une école de la liste, ou une boîte déjà au tableau. */
  id: z.string().max(BAND_ID_MAX).regex(BAND_ID_RE).optional(),
  /** Une boîte tapée ou lue sur la fiche. */
  name: z.string().max(COMPANY_INPUT_MAX).optional(),
});

const leaveSchema = z.object({ cardId: z.string().regex(ID_RE), type: typeSchema });

export interface BandsOptions {
  store: Store;
  limiter: RateLimiter;
  /** La personne connectée est propriétaire revendiquée du login de cette fiche, requête venue du site. */
  ownedBy: (c: Context, row: CardRow) => boolean;
  tokenMatches: (given: string | undefined, expected: string) => boolean;
  /** Login masqué, vu par quelqu'un d'autre que son propriétaire. */
  hiddenFrom: (c: Context, login: string | null | undefined) => boolean;
  notFound: Fact;
  withdrawn: Fact;
}

type Refusal = { status: 403 | 404 | 409 | 410; code: string; message: Fact };

/**
 * La fiche, si la requête vient de sa personne : le propriétaire connecté, ou le
 * jeton de la fiche (en-tête X-Card-Token) quand elle n'est pas née d'une
 * dénonciation ; une fiche née d'une dénonciation ne joue qu'une fois revendiquée.
 */
function authorize(o: BandsOptions, c: Context, cardId: string, now: number): { root: CardRow } | Refusal {
  const row = o.store.getCard(cardId);
  const root = row ? rootOf(o.store, row) : null;
  if (!root || (root.expiresAt !== null && root.expiresAt < now)) return { status: 404, code: "internal", message: o.notFound };
  if (o.hiddenFrom(c, o.store.loginOf(root))) return { status: 410, code: "gone", message: o.withdrawn };
  const login = o.store.loginOf(root);
  const claimed = !!login && !!o.store.getOwner(login);
  if (root.denounceBorn && !claimed) return { status: 403, code: "denounced", message: BAND_MESSAGES.denounced };
  const mine = o.ownedBy(c, root);
  const token = !root.denounceBorn && o.tokenMatches(c.req.header("x-card-token"), root.deleteToken);
  if (!mine && !token) return { status: 403, code: "forbidden", message: BAND_MESSAGES.forbidden };
  return { root };
}

const refuse = (c: Context, r: Refusal) => c.json({ state: "error", code: r.code, message: r.message }, r.status);

export function mountBands(app: Hono, o: BandsOptions): void {
  const { store, limiter } = o;

  // GET /api/bands?type=ecole&with=id : le tableau d'une ligue, et sa propre bande si elle est plus bas.
  app.get("/api/bands", (c) => {
    const type = c.req.query("type");
    if (!isBandType(type)) return c.json({ state: "error", code: "internal", message: BAND_MESSAGES.notFound }, 400);
    const w = c.req.query("with");
    c.header("Cache-Control", "public, max-age=60");
    return c.json(bandBoard(store.db, type, w && BAND_ID_RE.test(w) ? w : null));
  });

  // GET /api/bands/top : le classement de chaque ligue pour l'accueil ; `?ecole=`, `?boite=` : sa propre bande, si elle est plus bas.
  app.get("/api/bands/top", (c) => {
    const own = (type: BandType) => {
      const id = c.req.query(type);
      return id && BAND_ID_RE.test(id) ? id : null;
    };
    c.header("Cache-Control", "public, max-age=60");
    return c.json(bandsTop(store.db, Date.now(), { ecole: own("ecole"), boite: own("boite") }));
  });

  // GET /api/bands/:type/:id : une bande et ses fiches (ouverte au classement de l'accueil, §18.101).
  app.get("/api/bands/:type/:id", (c) => {
    const type = c.req.param("type");
    const id = c.req.param("id");
    const page = isBandType(type) && BAND_ID_RE.test(id) ? bandPage(store, type, id) : null;
    if (!page) return c.json({ state: "error", code: "internal", message: BAND_MESSAGES.notFound }, 404);
    c.header("Cache-Control", "public, max-age=60");
    return c.json(page);
  });

  // GET /api/card/:id/bands : les bandes de la personne fichée et les pastilles proposées. Pour elle seule.
  app.get("/api/card/:id/bands", (c) => {
    c.header("Cache-Control", "no-store");
    const id = c.req.param("id");
    if (!ID_RE.test(id)) return c.json({ state: "error", code: "internal", message: o.notFound }, 404);
    const now = Date.now();
    const a = authorize(o, c, id, now);
    if ("status" in a) return refuse(c, a);
    if (a.root.degraded) return refuse(c, { status: 409, code: "degraded", message: BAND_MESSAGES.degraded });
    return c.json(myBands(store, a.root, now));
  });

  // POST /api/bands/join { cardId, type, id? | name? } : un toucher, et la personne y est.
  app.post("/api/bands/join", async (c) => {
    c.header("Cache-Control", "no-store");
    const parsed = joinSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ state: "error", code: "internal", message: BAND_MESSAGES.notBand }, 400);
    const { cardId, type, id, name } = parsed.data;
    const now = Date.now();
    const a = authorize(o, c, cardId, now);
    if ("status" in a) return refuse(c, a);
    if (a.root.degraded) return refuse(c, { status: 409, code: "degraded", message: BAND_MESSAGES.degraded });

    let ref: BandRef | null;
    if (type === "ecole") {
      ref = id ? schoolById(id) : null;
      if (!ref) return c.json({ state: "error", code: "unknown_school", message: BAND_MESSAGES.unknownSchool }, 400);
    } else {
      // Une boîte qui a déjà des membres (sa page, une pastille) par son id, sinon le nom tapé, vérifié et normalisé.
      const known = id ? bandStanding(store.db, "boite", id, now) : null;
      const check = known ? null : companyCheck(name);
      if (check && "refused" in check) {
        const message = check.refused === "word" ? BAND_MESSAGES.refusedWord : check.refused === "contact" ? BAND_MESSAGES.refusedContact : BAND_MESSAGES.notBand;
        return c.json({ state: "error", code: check.refused === "none" ? "not_a_band" : "refused", message }, 400);
      }
      ref = known ? { type: "boite", id: known.id, label: known.label } : check!.ref;
    }

    const ip = clientIp(c);
    const prev = membership(store.db, personKey(store, a.root), type);
    const moving = !prev || prev.band_id !== ref.id;
    if (moving && !limiter.allowed("band", ip, BAND_JOINS_PER_DAY)) {
      return c.json({ state: "error", code: "rate_limited", message: BAND_MESSAGES.limited }, 429);
    }
    const { changed } = joinBand(store, a.root, ref, now);
    if (changed) {
      limiter.take("band", ip, BAND_JOINS_PER_DAY);
      store.recordEvent("band_join", a.root.id, { type });
    }
    return c.json(myBands(store, a.root, now));
  });

  // POST /api/bands/leave { cardId, type } : un toucher pour en sortir.
  app.post("/api/bands/leave", async (c) => {
    c.header("Cache-Control", "no-store");
    const parsed = leaveSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ state: "error", code: "internal", message: o.notFound }, 400);
    const now = Date.now();
    const a = authorize(o, c, parsed.data.cardId, now);
    if ("status" in a) return refuse(c, a);
    if (leaveBand(store, a.root, parsed.data.type)) store.recordEvent("band_leave", a.root.id, { type: parsed.data.type });
    return c.json(myBands(store, a.root, now));
  });
}
