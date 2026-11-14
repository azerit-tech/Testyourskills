// Les bandes (SPEC §18.38) : le classement par école et par boîte.
//
// Qui joue : toute fiche (GitHub, LinkedIn seule, CV, dossier à deux pièces, sa
// note du dossier), sauf les fiches sorties sans lecture IA, expirées ou
// masquées. Rien n'est compté sans le toucher de la personne : seul le navigateur
// qui a créé la fiche (son jeton) ou la personne connectée comme propriétaire la
// fait entrer ; une fiche née d'une dénonciation n'entre qu'une fois revendiquée.
// Une personne (login GitHub, sinon adresse LinkedIn, sinon la fiche), une école
// et une boîte au plus ; trois entrées par jour et par IP.
//
// Le score d'une bande : la somme des étoiles de ses vingt meilleurs dossiers. À
// égalité : le plus de dossiers, puis la bande la plus ancienne (son premier
// membre encore compté). Au tableau à partir de trois dossiers ; en dessous,
// « bande en formation ». Tout se calcule à la lecture (comme top.ts), gardé 60 s
// en mémoire et oublié à chaque entrée, sortie, suppression, purge ou masquage.
//
// Le rang d'école du barème n'apparaît nulle part ici. Sur la page d'une bande,
// jamais un nom : le profil criminel et les étoiles, le @pseudo seulement pour
// une fiche revendiquée.

import type Database from "better-sqlite3";
import type { Context, Hono } from "hono";
import { z } from "zod";
import {
  BAND_ID_MAX,
  BAND_ID_RE,
  BAND_JOINS_PER_DAY,
  BAND_MIN_MEMBERS,
  BAND_TOP_MEMBERS,
  COMPANY_INPUT_MAX,
  companyAliasLabel,
  companyBand,
  isBandType,
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

const f = (fr: string, en: string): Fact => ({ fr, en });

export const BAND_MESSAGES = {
  forbidden: f("Seule la personne fichée fait entrer sa fiche dans une bande.", "Only the person on file can put their sheet in a gang."),
  denounced: f("Une fiche née d'une dénonciation entre dans une bande une fois revendiquée.", "A sheet born from a tip-off joins a gang once it's claimed."),
  degraded: f("Cette fiche est sortie sans lecture. Refais-la pour rejoindre une bande.", "This sheet came out unread. Make it again to join a gang."),
  notBand: f("Pas une bande. Donne le nom de ta boîte.", "Not a gang. Give your company's name."),
  unknownSchool: f("Choisis une école de la liste.", "Pick a school from the list."),
  limited: f("Trois entrées par jour, c'est le maximum. Reviens demain.", "Three joins a day is the limit. Come back tomorrow."),
  notFound: f("Cette bande n'existe pas, ou plus.", "This gang doesn't exist, or no longer does."),
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
  CREATE INDEX IF NOT EXISTS band_members_card ON band_members(card_id);`);
}

/** Supprime les membres portés par ces fiches (fiche supprimée ou purgée). */
export function removeBandMembers(db: Database.Database, cardIds: string[]): void {
  if (!cardIds.length) return;
  const stmt = db.prepare(`DELETE FROM band_members WHERE card_id = ?`);
  for (const id of cardIds) stmt.run(id);
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
  /** Au tableau (trois dossiers ou plus), du premier au dernier. */
  ranked: League[];
}

const cache = new WeakMap<Database.Database, Map<BandType, { at: number; data: Computed }>>();

/** Oublie les classements gardés : une entrée, une sortie, une fiche supprimée, purgée ou masquée. */
export function forgetBands(db: Database.Database): void {
  cache.delete(db);
}

/** Le libellé d'une bande : la liste pour une école, l'alias ou le premier membre pour une boîte. */
function labelOf(type: BandType, id: string, first: string): string {
  if (type === "ecole") return schoolById(id)?.label ?? first;
  return companyAliasLabel(id) ?? first;
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
  const base = { type: b.type, id: b.id, label: b.label, score: b.score, members: b.members };
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

/** Une école de la liste sans membre compté : en formation, il manque trois complices. */
function emptyStanding(ref: BandRef): BandStanding {
  return { ...ref, score: 0, members: 0, rank: null, missing: BAND_MIN_MEMBERS, gap: null, ahead: null };
}

/** La place d'une bande ; une école de la liste existe toujours, une boîte sans membre non. */
export function bandStanding(db: Database.Database, type: BandType, id: string, now = Date.now()): BandStanding | null {
  const c = league(db, type, now);
  const b = c.all.get(id);
  if (b) return toStanding(c, b);
  const school = type === "ecole" ? schoolById(id) : null;
  return school ? emptyStanding(school) : null;
}

/** Le tableau d'une ligue : les vingt premières, et `withId` si elle est plus bas ou en formation. */
export function bandBoard(db: Database.Database, type: BandType, withId?: string | null, now = Date.now()): BandBoard {
  const c = league(db, type, now);
  const entries = c.ranked.slice(0, BOARD_SIZE).map((b) => toStanding(c, b));
  const extra = withId && !entries.some((e) => e.id === withId) ? bandStanding(db, type, withId, now) : null;
  return { type, total: c.ranked.length, entries, extra: extra && extra.members > 0 ? extra : null };
}

/** Les cinq premières de chaque ligue, pour l'accueil. */
export function bandsTop(db: Database.Database, now = Date.now()): BandsTop {
  const top = (type: BandType) => {
    const c = league(db, type, now);
    return c.ranked.slice(0, HOME_SIZE).map((b) => toStanding(c, b));
  };
  return { ecole: top("ecole"), boite: top("boite") };
}

/** Les membres d'une bande, du plus étoilé au moins étoilé : jamais un nom. */
function bandMembers(store: Store, type: BandType, id: string, now: number): BandMember[] {
  const rows = store.db
    .prepare(
      `SELECT m.card_id AS cardId, m.login, m.person_key AS personKey, m.stars
       FROM band_members m JOIN cards c ON c.id = m.card_id
       WHERE m.kind = ? AND m.band_id = ? AND c.degraded = 0
         AND (c.expires_at IS NULL OR c.expires_at > ?)
         AND NOT EXISTS (SELECT 1 FROM owners o WHERE o.login = m.login AND o.hidden = 1)
       ORDER BY m.stars DESC, m.joined_at ASC
       LIMIT ?`,
    )
    .all(type, id, now, BAND_PAGE_MEMBERS) as { cardId: string; login: string | null; personKey: string; stars: number }[];
  return rows.map((r) => {
    const row = store.getCard(r.cardId);
    const card = row ? mainCard(row) : null;
    const profile = card?.profile?.label ?? null;
    // Le @pseudo seulement pour une fiche revendiquée par ce login, jamais le nom d'une fiche LinkedIn ou CV.
    const claimed = !!r.login && r.personKey === `gh:${r.login}` && !!store.getOwner(r.login);
    return { stars: r.stars, profile, ...(claimed ? { login: card?.login ?? r.login!, cardId: r.cardId } : {}) };
  });
}

/** La page d'une bande ; null si elle n'existe pas. */
export function bandPage(store: Store, type: BandType, id: string, now = Date.now()): BandPage | null {
  const band = bandStanding(store.db, type, id, now);
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
  const club = mainCard(root).club;
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
    if (!m) return null;
    // Sa propre fiche ne compte plus (masquée, expirée) : la bande reste nommée, à zéro.
    return bandStanding(store.db, type, m.band_id, now) ?? emptyStanding({ type, id: m.band_id, label: m.label });
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
  forgetBands(store.db);
  return { changed: true };
}

/** La personne de cette fiche quitte sa bande de cette ligue. false si elle n'en avait pas. */
export function leaveBand(store: Store, root: CardRow, type: BandType): boolean {
  const r = store.db.prepare(`DELETE FROM band_members WHERE person_key = ? AND kind = ?`).run(personKey(store, root), type);
  forgetBands(store.db);
  return r.changes > 0;
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
 * dénonciation ; une fiche dénoncée ne joue qu'une fois revendiquée.
 */
function authorize(o: BandsOptions, c: Context, cardId: string, now: number): { root: CardRow } | Refusal {
  const row = o.store.getCard(cardId);
  const root = row ? rootOf(o.store, row) : null;
  if (!root || (root.expiresAt !== null && root.expiresAt < now)) return { status: 404, code: "internal", message: o.notFound };
  if (o.hiddenFrom(c, o.store.loginOf(root))) return { status: 410, code: "gone", message: o.withdrawn };
  const login = o.store.loginOf(root);
  const claimed = !!login && !!o.store.getOwner(login);
  if (root.denouncedBy && !claimed) return { status: 403, code: "denounced", message: BAND_MESSAGES.denounced };
  const mine = o.ownedBy(c, root);
  const token = !root.denouncedBy && o.tokenMatches(c.req.header("x-card-token"), root.deleteToken);
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

  // GET /api/bands/top : les cinq premières de chaque ligue (l'accueil).
  app.get("/api/bands/top", (c) => {
    c.header("Cache-Control", "public, max-age=60");
    return c.json(bandsTop(store.db));
  });

  // GET /api/bands/:type/:id : la page d'une bande.
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
      // Une boîte déjà au tableau (sa page, une pastille) par son id, sinon le nom tapé, normalisé.
      const known = id ? bandStanding(store.db, "boite", id, now) : null;
      ref = known ? { type: "boite", id: known.id, label: known.label } : companyBand(name);
      if (!ref) return c.json({ state: "error", code: "not_a_band", message: BAND_MESSAGES.notBand }, 400);
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
