// Stockage SQLite (SPEC §9, §11). On garde les cartes, les faits GitHub publics
// déjà calculés, l'email si donné et le jeton de suppression. Jamais le CV ni
// son texte, jamais les fichiers de code lus.

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { CardData, ComparisonData, Source } from "../../shared/types";

export const RETENTION_MS = 90 * 24 * 3600 * 1000;
export const CACHE_MS = 24 * 3600 * 1000;

export type CardKind = "card" | "comparison";
export type RowSource = Source | "both";

export interface CardRow {
  id: string;
  parentId: string | null;
  createdAt: number;
  source: RowSource;
  login: string | null;
  kind: CardKind;
  data: CardData | ComparisonData;
  facts: unknown | null;
  email: string | null;
  deleteToken: string;
  expiresAt: number | null;
  /** Fiche par le lien partagé de laquelle on est arrivé (?r=), sinon null (§18.0). */
  refCardId: string | null;
}

export interface NewCardRow {
  id: string;
  parentId?: string | null;
  createdAt: number;
  source: RowSource;
  login?: string | null;
  kind: CardKind;
  data: CardData | ComparisonData;
  facts?: unknown;
  deleteToken: string;
  refCardId?: string | null;
}

interface RawRow {
  id: string;
  parent_id: string | null;
  created_at: number;
  source: RowSource;
  login: string | null;
  kind: CardKind;
  json: string;
  facts_json: string | null;
  email: string | null;
  delete_token: string;
  expires_at: number | null;
  ref_card_id: string | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS cards (
  id           TEXT PRIMARY KEY,
  parent_id    TEXT,              -- comparaison à laquelle appartient la carte, sinon NULL
  created_at   INTEGER NOT NULL,  -- ms epoch
  source       TEXT NOT NULL,     -- github | cv | both
  login        TEXT,              -- pseudo GitHub en minuscules
  kind         TEXT NOT NULL,     -- card | comparison
  json         TEXT NOT NULL,     -- CardData ou ComparisonData, sans deleteToken
  facts_json   TEXT,              -- faits GitHub publics (réutilisés par le cache 24 h)
  email        TEXT,
  delete_token TEXT NOT NULL,
  expires_at   INTEGER,           -- NULL = conservée (email laissé)
  ref_card_id  TEXT               -- fiche d'origine du lien partagé (?r=), sinon NULL ; voir migrate()
);
CREATE INDEX IF NOT EXISTS cards_login ON cards(login, created_at) WHERE parent_id IS NULL;
CREATE INDEX IF NOT EXISTS cards_parent ON cards(parent_id);
CREATE INDEX IF NOT EXISTS cards_expires ON cards(expires_at);

CREATE TABLE IF NOT EXISTS events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      INTEGER NOT NULL,
  event   TEXT NOT NULL,
  card_id TEXT,
  meta    TEXT
);
CREATE INDEX IF NOT EXISTS events_at ON events(at);

CREATE TABLE IF NOT EXISTS ratelimit (
  key TEXT NOT NULL,              -- portée + hash de l'IP, jamais l'IP en clair
  day TEXT NOT NULL,              -- AAAA-MM-JJ (UTC)
  n   INTEGER NOT NULL,
  PRIMARY KEY (key, day)
);

CREATE TABLE IF NOT EXISTS ai_spend (
  day           TEXT PRIMARY KEY, -- AAAA-MM-JJ (UTC)
  usd           REAL NOT NULL,    -- dépense IA du jour, en dollars
  input_tokens  INTEGER,
  output_tokens INTEGER,
  calls         INTEGER
);
`;

function toRow(r: RawRow): CardRow {
  return {
    id: r.id,
    parentId: r.parent_id,
    createdAt: r.created_at,
    source: r.source,
    login: r.login,
    kind: r.kind,
    data: JSON.parse(r.json),
    facts: r.facts_json ? JSON.parse(r.facts_json) : null,
    email: r.email,
    deleteToken: r.delete_token,
    expiresAt: r.expires_at,
    refCardId: r.ref_card_id ?? null,
  };
}

/** Retire le jeton de suppression d'une carte ou d'une comparaison avant stockage ou réponse. */
export function stripToken<T extends CardData | ComparisonData>(data: T): T {
  if ("cv" in data && "github" in data) {
    return { ...data, cv: stripToken(data.cv), github: stripToken(data.github) };
  }
  const { deleteToken: _drop, ...rest } = data as CardData;
  return rest as T;
}

/**
 * Migrations des bases déjà en production : CREATE TABLE IF NOT EXISTS ne touche
 * pas une table existante, on ajoute donc ici les colonnes qui lui manquent.
 * Idempotent, sans perte de données.
 */
export function migrate(db: Database.Database) {
  const cols = new Set((db.prepare(`PRAGMA table_info(cards)`).all() as { name: string }[]).map((c) => c.name));
  if (!cols.has("ref_card_id")) db.exec(`ALTER TABLE cards ADD COLUMN ref_card_id TEXT`);
}

export class Store {
  readonly db: Database.Database;
  /**
   * Origine (?r=) des fiches en cours de calcul, posée par l'API au lancement et
   * écrite dans la ligne à son insertion : le pipeline n'a pas à la connaître.
   */
  private pendingRefs = new Map<string, string>();

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.db.exec(SCHEMA);
    migrate(this.db);
  }

  close() {
    this.db.close();
  }

  /** Retient l'origine d'une fiche lancée, écrite quand sa ligne sera insérée. */
  expectRef(id: string, refCardId: string) {
    this.pendingRefs.set(id, refCardId);
  }

  /** Oublie l'origine d'une fiche dont le calcul est fini (insérée ou en erreur). */
  forgetRef(id: string) {
    this.pendingRefs.delete(id);
  }

  /** Insère une carte, ou une comparaison et ses deux cartes, en une transaction. */
  insertCards(rows: NewCardRow[]) {
    const stmt = this.db.prepare(
      `INSERT INTO cards (id, parent_id, created_at, source, login, kind, json, facts_json, email, delete_token, expires_at, ref_card_id)
       VALUES (@id, @parent_id, @created_at, @source, @login, @kind, @json, @facts_json, NULL, @delete_token, @expires_at, @ref_card_id)`,
    );
    const tx = this.db.transaction((list: NewCardRow[]) => {
      for (const r of list) {
        stmt.run({
          id: r.id,
          parent_id: r.parentId ?? null,
          created_at: r.createdAt,
          source: r.source,
          login: r.login ? r.login.toLowerCase() : null,
          kind: r.kind,
          json: JSON.stringify(stripToken(r.data)),
          facts_json: r.facts === undefined || r.facts === null ? null : JSON.stringify(r.facts),
          delete_token: r.deleteToken,
          expires_at: r.createdAt + RETENTION_MS,
          // L'origine va sur la fiche racine seule, pas sur les cartes d'une comparaison.
          ref_card_id: r.refCardId ?? (r.parentId ? null : (this.pendingRefs.get(r.id) ?? null)),
        });
      }
    });
    tx(rows);
    for (const r of rows) this.pendingRefs.delete(r.id);
  }

  getCard(id: string): CardRow | null {
    const r = this.db.prepare(`SELECT * FROM cards WHERE id = ?`).get(id) as RawRow | undefined;
    return r ? toRow(r) : null;
  }

  /** Carte GitHub seule pour ce pseudo, de moins de 24 h (SPEC §4.7, §12). */
  findRecentGithub(login: string, now = Date.now()): CardRow | null {
    const r = this.db
      .prepare(
        `SELECT * FROM cards
         WHERE parent_id IS NULL AND kind = 'card' AND source = 'github' AND login = ? AND created_at > ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(login.toLowerCase(), now - CACHE_MS) as RawRow | undefined;
    return r ? toRow(r) : null;
  }

  /** Dernière carte GitHub seule d'un pseudo, quel que soit son âge (carte vitrine de l'accueil). */
  findLatestGithub(login: string): CardRow | null {
    const r = this.db
      .prepare(
        `SELECT * FROM cards
         WHERE parent_id IS NULL AND kind = 'card' AND source = 'github' AND login = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(login.toLowerCase()) as RawRow | undefined;
    return r ? toRow(r) : null;
  }

  /** Remplace le JSON d'une carte ou d'une comparaison (photo LinkedIn). */
  updateData(id: string, data: CardData | ComparisonData) {
    this.db.prepare(`UPDATE cards SET json = ? WHERE id = ?`).run(JSON.stringify(stripToken(data)), id);
  }

  /** Ids de la carte et des cartes rattachées (une comparaison et ses deux cartes). */
  groupIds(id: string): string[] {
    const row = this.getCard(id);
    if (!row) return [];
    const rootId = row.parentId ?? row.id;
    const rows = this.db
      .prepare(`SELECT id FROM cards WHERE id = ? OR parent_id = ?`)
      .all(rootId, rootId) as { id: string }[];
    return rows.map((r) => r.id);
  }

  /** Email laissé : il s'applique au groupe et lève l'expiration à 90 jours (§11). */
  setEmail(id: string, email: string): string[] {
    const ids = this.groupIds(id);
    const stmt = this.db.prepare(`UPDATE cards SET email = ?, expires_at = NULL WHERE id = ?`);
    this.db.transaction(() => ids.forEach((i) => stmt.run(email, i)))();
    return ids;
  }

  /** Supprime la carte et son groupe. Renvoie les ids supprimés. */
  deleteGroup(id: string): string[] {
    const ids = this.groupIds(id);
    const stmt = this.db.prepare(`DELETE FROM cards WHERE id = ?`);
    this.db.transaction(() => ids.forEach((i) => stmt.run(i)))();
    return ids;
  }

  /** Supprime les cartes expirées sans email. Renvoie leurs ids pour effacer les PNG. */
  purgeExpired(now = Date.now()): string[] {
    const rows = this.db
      .prepare(`SELECT id FROM cards WHERE email IS NULL AND expires_at IS NOT NULL AND expires_at < ?`)
      .all(now) as { id: string }[];
    const ids = rows.map((r) => r.id);
    const stmt = this.db.prepare(`DELETE FROM cards WHERE id = ?`);
    this.db.transaction(() => ids.forEach((i) => stmt.run(i)))();
    // Compteurs de limite : on ne garde que les deux derniers jours.
    const cutoff = new Date(now - 2 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    this.db.prepare(`DELETE FROM ratelimit WHERE day < ?`).run(cutoff);
    return ids;
  }

  recordEvent(event: string, cardId?: string | null, meta?: unknown, at = Date.now()) {
    this.db
      .prepare(`INSERT INTO events (at, event, card_id, meta) VALUES (?, ?, ?, ?)`)
      .run(at, event, cardId ?? null, meta === undefined ? null : JSON.stringify(meta));
  }

  listEvents(event?: string): { at: number; event: string; cardId: string | null; meta: unknown }[] {
    const rows = (
      event
        ? this.db.prepare(`SELECT * FROM events WHERE event = ? ORDER BY id`).all(event)
        : this.db.prepare(`SELECT * FROM events ORDER BY id`).all()
    ) as { at: number; event: string; card_id: string | null; meta: string | null }[];
    return rows.map((r) => ({ at: r.at, event: r.event, cardId: r.card_id, meta: r.meta ? JSON.parse(r.meta) : null }));
  }

  /** Incrémente un compteur journalier et renvoie sa nouvelle valeur. */
  bump(key: string, day: string): number {
    const r = this.db
      .prepare(
        `INSERT INTO ratelimit (key, day, n) VALUES (?, ?, 1)
         ON CONFLICT(key, day) DO UPDATE SET n = n + 1
         RETURNING n`,
      )
      .get(key, day) as { n: number };
    return r.n;
  }

  count(key: string, day: string): number {
    const r = this.db.prepare(`SELECT n FROM ratelimit WHERE key = ? AND day = ?`).get(key, day) as
      | { n: number }
      | undefined;
    return r?.n ?? 0;
  }
}
