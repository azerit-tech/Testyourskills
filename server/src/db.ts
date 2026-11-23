// Stockage SQLite (SPEC §9, §11). On garde les cartes, les faits GitHub publics
// déjà calculés, l'email si donné et le jeton de suppression. Jamais le CV ni
// son texte, jamais les fichiers de code lus.

import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { withCatalogProfiles } from "../../shared/profileCatalog";
import { oneNote } from "../../shared/caseFile";
import { withoutSchoolRank } from "../../shared/schoolRank";
import type { CardData, ComparisonData, Source } from "../../shared/types";
import { ensureLinkedinTables, purgeLinkedin } from "./linkedinProfile/store";
import { forgetWeekRanks } from "./top";
import { ensureBandTables, forgetBands, removeBandMembers } from "./bands";
import { ensurePrimeTables, removeEntriesForCards, removeEntriesForLogin } from "./primes";
import { ensureAccountTables } from "./account";
import { ensureProposalTables, removeProposals } from "./match/store";

export const RETENTION_MS = 90 * 24 * 3600 * 1000;
export const CACHE_MS = 24 * 3600 * 1000;
/** Les événements de mesure (§13) sont gardés 180 jours, puis effacés par la purge horaire. */
export const EVENTS_RETENTION_MS = 180 * 24 * 3600 * 1000;

export type CardKind = "card" | "comparison";
/** `linkedin` : fiche jugée sur un profil LinkedIn, seule ou en comparaison contre GitHub (§18.24). */
export type RowSource = Source | "both" | "linkedin";

export interface CardRow {
  id: string;
  parentId: string | null;
  createdAt: number;
  source: RowSource;
  login: string | null;
  kind: CardKind;
  data: CardData | ComparisonData;
  facts: unknown | null;
  /** La lecture du code par l'IA (pièce GitHub) : donnée brute, sans note, pour recalculer le dossier. Null : rien à lire, ou ligne d'avant. */
  ai: unknown | null;
  /** La lecture a été rangée avec la ligne, même vide (rien à lire) : ses données brutes sont complètes. Faux : ligne d'avant. */
  aiStored: boolean;
  email: string | null;
  deleteToken: string;
  expiresAt: number | null;
  /** Fiche par le lien partagé de laquelle on est arrivé (?r=), sinon null (§18.0). */
  refCardId: string | null;
  /** Sortie sans lecture IA : visible à son adresse, jamais resservie par le cache 24 h (§12). */
  degraded: boolean;
  /** Fiche de la personne qui a dénoncé celle-ci (§18.6), sinon null : à sa naissance ou depuis le cache. */
  denouncedBy: string | null;
  /**
   * Née d'une dénonciation : calculée pour un tiers, son jeton est celui du
   * dénonciateur. Une fiche déjà faite, dénoncée ensuite depuis le cache, garde
   * `denouncedBy` pour la page partagée mais pas ce drapeau : rien ne change pour
   * sa personne (top, grille, bandes, jeton).
   */
  denounceBorn: boolean;
  /** Login du dénonciateur, posé seulement s'il était connecté comme propriétaire de sa fiche ; sinon anonyme. */
  denouncerLogin: string | null;
  /** Le dossier plus complet de la même personne qui remplace cette fiche (SPEC §18.84), sinon null. */
  supersededBy: string | null;
}

export interface OwnerRow {
  login: string;
  githubId: number;
  claimedAt: number;
  hidden: boolean;
  email: string | null;
  consentsJson: string | null;
}

interface RawOwner {
  login: string;
  github_id: number;
  claimed_at: number;
  hidden: number;
  email: string | null;
  consents_json: string | null;
}

function toOwner(r: RawOwner): OwnerRow {
  return {
    login: r.login,
    githubId: r.github_id,
    claimedAt: r.claimed_at,
    hidden: r.hidden === 1,
    email: r.email,
    consentsJson: r.consents_json,
  };
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
  /** La lecture du code par l'IA (pièce GitHub), rangée brute. */
  ai?: unknown;
  deleteToken: string;
  refCardId?: string | null;
  /** Sortie sans lecture IA (panne de l'IA) : pas de cache 24 h. */
  degraded?: boolean;
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
  ai_json?: string | null;
  email: string | null;
  delete_token: string;
  expires_at: number | null;
  ref_card_id: string | null;
  degraded: number | null;
  denounced_by?: string | null;
  denouncer_login?: string | null;
  denounce_born?: number | null;
  superseded_by?: string | null;
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
  ref_card_id  TEXT,              -- fiche d'origine du lien partagé (?r=), sinon NULL ; voir migrate()
  degraded     INTEGER NOT NULL DEFAULT 0, -- 1 = sortie sans lecture IA, hors cache 24 h ; voir migrate()
  denounced_by    TEXT,           -- fiche du dénonciateur (§18.6), sinon NULL ; voir migrate()
  denouncer_login TEXT,           -- son login s'il était propriétaire connecté, sinon NULL (anonyme)
  denounce_born   INTEGER NOT NULL DEFAULT 0 -- 1 = née d'une dénonciation (calculée pour un tiers) ; voir migrate()
);
CREATE INDEX IF NOT EXISTS cards_login ON cards(login, created_at) WHERE parent_id IS NULL;
CREATE INDEX IF NOT EXISTS cards_parent ON cards(parent_id);
CREATE INDEX IF NOT EXISTS cards_expires ON cards(expires_at);
-- Top du mois (top.ts) : les fiches nées entre deux dates.
CREATE INDEX IF NOT EXISTS cards_created ON cards(created_at);

CREATE TABLE IF NOT EXISTS events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      INTEGER NOT NULL,
  event   TEXT NOT NULL,
  card_id TEXT,
  meta    TEXT
);
CREATE INDEX IF NOT EXISTS events_at ON events(at);
-- Une fiche supprimée ou purgée délie ses événements (Store.unlinkEvents).
CREATE INDEX IF NOT EXISTS events_card ON events(card_id);

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

-- Propriétaires revendiqués par GitHub OAuth (§18.1). Une table neuve : CREATE
-- TABLE IF NOT EXISTS suffit aussi sur une base déjà en production.
CREATE TABLE IF NOT EXISTS owners (
  login         TEXT PRIMARY KEY,         -- pseudo GitHub en minuscules
  github_id     INTEGER NOT NULL UNIQUE,  -- identifiant numérique : fait foi si le compte est renommé
  claimed_at    INTEGER NOT NULL,         -- ms epoch, première revendication
  hidden        INTEGER NOT NULL DEFAULT 0, -- 1 = fiches masquées à tous sauf au propriétaire
  email         TEXT,                     -- pour plus tard (concours, §18.4)
  consents_json TEXT                      -- pour plus tard (consentements, §18.4)
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
    // Le nom et la phrase du profil se relisent au catalogue (shared/profileCatalog.ts) ;
    // une grille rangée avant le §18.48 perd le rang de son école (shared/schoolRank.ts).
    // Un dossier rangé avant 0.5.0 : ses pièces ne rendent que la note du dossier (shared/caseFile.ts, oneNote).
    data: oneNote(withoutSchoolRank(withCatalogProfiles(JSON.parse(r.json)))),
    facts: r.facts_json ? JSON.parse(r.facts_json) : null,
    ai: r.ai_json ? JSON.parse(r.ai_json) : null,
    aiStored: r.ai_json != null,
    email: r.email,
    deleteToken: r.delete_token,
    expiresAt: r.expires_at,
    refCardId: r.ref_card_id ?? null,
    degraded: r.degraded === 1,
    denouncedBy: r.denounced_by ?? null,
    denouncerLogin: r.denouncer_login ?? null,
    denounceBorn: r.denounce_born === 1,
    supersededBy: r.superseded_by ?? null,
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
  // Une personne, un dossier, une note (SPEC §18.84) : la lecture du code rangée brute, et la
  // fiche que remplace un dossier plus complet de la même personne. Deux colonnes ajoutées, rien de réécrit.
  if (!cols.has("ai_json")) db.exec(`ALTER TABLE cards ADD COLUMN ai_json TEXT`);
  if (!cols.has("superseded_by")) db.exec(`ALTER TABLE cards ADD COLUMN superseded_by TEXT`);
  if (!cols.has("degraded")) db.exec(`ALTER TABLE cards ADD COLUMN degraded INTEGER NOT NULL DEFAULT 0`);
  if (!cols.has("denounced_by")) db.exec(`ALTER TABLE cards ADD COLUMN denounced_by TEXT`);
  if (!cols.has("denouncer_login")) db.exec(`ALTER TABLE cards ADD COLUMN denouncer_login TEXT`);
  if (!cols.has("denounce_born")) {
    db.exec(`ALTER TABLE cards ADD COLUMN denounce_born INTEGER NOT NULL DEFAULT 0`);
    // Les fiches déjà dénoncées : nées d'une dénonciation si son événement précède
    // leur création (la demande part avant le calcul), ou s'il n'en reste aucune
    // trace ; dénoncées depuis le cache si l'événement vient après.
    const events = db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'events'`).get();
    db.exec(
      events
        ? `UPDATE cards SET denounce_born = 1 WHERE denounced_by IS NOT NULL AND (
             NOT EXISTS (SELECT 1 FROM events e WHERE e.card_id = cards.id AND e.event = 'denounce_sent')
             OR EXISTS (SELECT 1 FROM events e WHERE e.card_id = cards.id AND e.event = 'denounce_sent' AND e.at <= cards.created_at))`
        : `UPDATE cards SET denounce_born = 1 WHERE denounced_by IS NOT NULL`,
    );
  }
  // Cache et budget de la lecture des profils LinkedIn (§18.24) : tables neuves.
  ensureLinkedinTables(db);
  // L'ancien jury de la page partagée (§18.27, retiré au §18.129) : plus rien ne lit ni n'écrit cette table.
  // Elle reste en place, sans migration ; ses lignes partent encore avec leur fiche (deleteGroup, purgeExpired).
  db.exec(`CREATE TABLE IF NOT EXISTS votes (
    card_id    TEXT NOT NULL,
    ip_hash    TEXT NOT NULL,
    verdict    TEXT NOT NULL CHECK (verdict IN ('guilty', 'cleared')),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (card_id, ip_hash)
  )`);
  // Les bandes (§18.38) : une ligne par personne et par ligue, posée par son toucher.
  ensureBandTables(db);
  // Les primes (§18.4) : une inscription par login et par prime, posée par « Concourir ».
  ensurePrimeTables(db);
  // Le compte léger (§18.91) : une ligne par personne connectée, rien qui la nomme.
  ensureAccountTables(db);
  // Les propositions sous une fiche (§18.100) : son GitHub ou son LinkedIn, à confirmer d'un toucher.
  ensureProposalTables(db);
}

export class Store {
  readonly db: Database.Database;
  /**
   * Origine (?r=) des fiches en cours de calcul, posée par l'API au lancement et
   * écrite dans la ligne à son insertion : le pipeline n'a pas à la connaître.
   */
  private pendingRefs = new Map<string, string>();
  /**
   * Fiches en cours de calcul pour une dénonciation (§18.6) : marquées nées d'une dénonciation
   * juste après leur insertion. Le dossier qu'elles font ne prend pas les comptes (§18.106).
   */
  private pendingDenounced = new Set<string>();

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

  /** La fiche lancée est calculée pour une dénonciation : son dossier ne prendra pas les comptes (§18.106). */
  expectDenounced(id: string) {
    this.pendingDenounced.add(id);
  }

  forgetDenounced(id: string) {
    this.pendingDenounced.delete(id);
  }

  /**
   * Le compte suit le dossier (§18.106) : chaque compte (§18.91) dont la fiche est l'une de
   * `ids` passe à la fiche qui se montre à son adresse (`fileRow` : au bout de `superseded_by`,
   * jamais un dossier né d'une dénonciation). Sans `ids` : tous les comptes dont la fiche est
   * remplacée ou est une pièce.
   */
  followAccounts(ids?: string[]) {
    if (ids && !ids.length) return;
    const rows = (
      ids
        ? this.db.prepare(`SELECT id, card_id FROM accounts WHERE card_id IN (${ids.map(() => "?").join(",")})`).all(...ids)
        : this.db
            .prepare(`SELECT a.id, a.card_id FROM accounts a JOIN cards c ON c.id = a.card_id WHERE c.superseded_by IS NOT NULL OR c.parent_id IS NOT NULL`)
            .all()
    ) as { id: string; card_id: string }[];
    const move = this.db.prepare(`UPDATE accounts SET card_id = ? WHERE id = ?`);
    for (const a of rows) {
      const to = this.fileRow(a.card_id);
      if (to && to.id !== a.card_id) move.run(to.id, a.id);
    }
  }

  /** Insère une carte, ou une comparaison et ses deux cartes, en une transaction. */
  insertCards(rows: NewCardRow[]) {
    const stmt = this.db.prepare(
      `INSERT INTO cards (id, parent_id, created_at, source, login, kind, json, facts_json, ai_json, email, delete_token, expires_at, ref_card_id, degraded)
       VALUES (@id, @parent_id, @created_at, @source, @login, @kind, @json, @facts_json, @ai_json, NULL, @delete_token, @expires_at, @ref_card_id, @degraded)`,
    );
    const tx = this.db.transaction((list: NewCardRow[]) => {
      // Login revendiqué : ses nouvelles fiches sont à son propriétaire et n'expirent pas non plus (§18.1).
      const kept = list.some((r) => r.login && this.getOwner(r.login));
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
          // Une lecture vide (rien à lire) se range « null » : la ligne a ses données brutes.
          ai_json: r.ai === undefined ? null : JSON.stringify(r.ai),
          delete_token: r.deleteToken,
          expires_at: kept ? null : r.createdAt + RETENTION_MS,
          // L'origine va sur la fiche racine seule, pas sur les cartes d'une comparaison.
          ref_card_id: r.refCardId ?? (r.parentId ? null : (this.pendingRefs.get(r.id) ?? null)),
          degraded: r.degraded ? 1 : 0,
        });
      }
    });
    tx(rows);
    for (const r of rows) this.pendingRefs.delete(r.id);
    for (const r of rows) this.supersede(r);
    // Le classement du mois gardé en mémoire (top.ts) : la fiche née doit y lire son rang tout de suite.
    forgetWeekRanks(this.db);
  }

  getCard(id: string): CardRow | null {
    const r = this.db.prepare(`SELECT * FROM cards WHERE id = ?`).get(id) as RawRow | undefined;
    return r ? toRow(r) : null;
  }

  /**
   * Une personne, un dossier, une note (SPEC §18.84) : un dossier à deux pièces dont le
   * lien est prouvé remplace les fiches plus anciennes de la même personne, sa fiche
   * GitHub seule, sa fiche LinkedIn seule et ses dossiers d'avant. Rien n'est réécrit
   * ni supprimé : les anciennes lignes pointent le dossier (`superseded_by`), et leurs
   * adresses le servent (`fileRow`). Un dossier non prouvé ne remplace rien : un tiers
   * ne déplace pas la fiche d'un autre.
   */
  private supersede(r: NewCardRow) {
    if (r.parentId || r.kind !== "comparison" || r.source !== "linkedin" || !r.login) return;
    const facts = r.facts as { linkedinUrl?: unknown; linkedinProven?: unknown } | null | undefined;
    if (facts?.linkedinProven !== true) return;
    const login = r.login;
    const mark = this.db.prepare(
      `UPDATE cards SET superseded_by = @id
       WHERE parent_id IS NULL AND id <> @id AND created_at <= @at AND (
         (login = @login AND (
           (kind = 'card' AND source = 'github')
           OR (kind = 'comparison' AND source = 'linkedin' AND json_extract(facts_json, '$.linkedinProven') = 1)))
         OR (login IS NULL AND kind = 'card' AND source = 'linkedin' AND json_extract(facts_json, '$.linkedinUrl') = @url))`,
    );
    this.db.transaction(() => {
      mark.run({ id: r.id, at: r.createdAt, login: login.toLowerCase(), url: typeof facts.linkedinUrl === "string" ? facts.linkedinUrl : null });
      // Les comptes des fiches remplacées passent au dossier (§18.106), sauf s'il est né d'une dénonciation.
      if (!this.pendingDenounced.has(r.id)) this.followAccounts(this.supersededIds(r.id));
    })();
  }

  /**
   * Le lien de ce dossier LinkedIn + GitHub prouvé après coup (rattrapage du §18.116,
   * `ops/rattrapage-dossiers-connectes.ts`) : `linkedinProven` et sa raison, puis il
   * remplace les fiches plus anciennes de sa personne, comme s'il était né prouvé.
   */
  proveLinkedin(id: string, proof: string): boolean {
    const row = this.getCard(id);
    if (!row || row.parentId || row.kind !== "comparison" || row.source !== "linkedin" || !row.login || row.denounceBorn) return false;
    const facts = { ...((row.facts as Record<string, unknown> | null) ?? {}), linkedinProven: true, linkedinProof: proof };
    this.db.prepare(`UPDATE cards SET facts_json = ? WHERE id = ?`).run(JSON.stringify(facts), id);
    this.supersede({ id, parentId: null, createdAt: row.createdAt, source: row.source, login: row.login, kind: row.kind, data: row.data, facts, deleteToken: row.deleteToken });
    forgetWeekRanks(this.db);
    return true;
  }

  /** Les fiches que ce dossier remplace. */
  private supersededIds(id: string): string[] {
    return (this.db.prepare(`SELECT id FROM cards WHERE superseded_by = ?`).all(id) as { id: string }[]).map((x) => x.id);
  }

  /**
   * « Ajoute ton GitHub », « Ajoute ton LinkedIn » : la personne complète sa fiche (elle en
   * tient le jeton, ou elle est connectée) et obtient son dossier à deux pièces. Sa fiche
   * à une pièce est remplacée par ce dossier : la même adresse, la note recalculée.
   */
  completedBy(old: CardRow, dossier: CardRow) {
    if (old.id === dossier.id || old.parentId || dossier.parentId || old.kind !== "card" || dossier.kind !== "comparison") return;
    this.db.transaction(() => {
      this.db.prepare(`UPDATE cards SET superseded_by = ? WHERE id = ? AND created_at <= ?`).run(dossier.id, old.id, dossier.createdAt);
      // Le compte qui avait la fiche complétée a désormais le dossier (§18.106).
      this.followAccounts(this.supersededIds(dossier.id));
    })();
    forgetWeekRanks(this.db);
  }

  /**
   * La fiche qui se montre à cette adresse : le dossier. L'id d'une pièce donne son
   * dossier (une pièce n'a pas de note à elle, rien ne la montre seule) ; l'id d'une
   * fiche remplacée donne le dossier qui l'a remplacée, tant qu'il est en ligne et
   * n'est pas né d'une dénonciation (une fiche faite par un tiers ne prend pas l'adresse
   * de celle que la personne a faite). Sans rien de tout cela, la fiche elle-même.
   */
  fileRow(id: string): CardRow | null {
    let row = this.getCard(id);
    for (let hops = 0; row && hops < 8; hops++) {
      const next = row.parentId ?? row.supersededBy;
      const target = next ? this.getCard(next) : null;
      if (!target || (!row.parentId && target.denounceBorn)) break;
      row = target;
    }
    return row;
  }

  /**
   * Carte GitHub seule pour ce pseudo, de moins de 24 h (SPEC §4.7, §12). Une
   * fiche sortie sans lecture IA n'en est pas : la demande suivante la recalcule.
   */
  findRecentGithub(login: string, now = Date.now()): CardRow | null {
    const r = this.db
      .prepare(
        `SELECT * FROM cards
         WHERE parent_id IS NULL AND kind = 'card' AND source = 'github' AND login = ? AND created_at > ? AND degraded = 0
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(login.toLowerCase(), now - CACHE_MS) as RawRow | undefined;
    return r ? toRow(r) : null;
  }

  /** Dernière carte GitHub seule d'un pseudo, quel que soit son âge (les faits d'une comparaison, denounce.ts). */
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

  /**
   * Dernier jugement de la vitrine (§6.1, §18.35), quel que soit son âge : une
   * fiche GitHub seule, ou une comparaison LinkedIn contre GitHub prouvée.
   */
  findLatestShowcase(login: string): CardRow | null {
    const r = this.db
      .prepare(
        `SELECT * FROM cards
         WHERE parent_id IS NULL AND login = ? AND (
           (kind = 'card' AND source = 'github')
           OR (kind = 'comparison' AND source = 'linkedin' AND json_extract(facts_json, '$.linkedinProven') = 1)
         )
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(login.toLowerCase()) as RawRow | undefined;
    return r ? toRow(r) : null;
  }

  /**
   * Marque une fiche comme dénoncée (§18.6). La première dénonciation reste :
   * une fiche déjà dénoncée garde son dénonciateur. `born` : la fiche vient
   * d'être calculée pour cette dénonciation ; faux pour une fiche reprise du
   * cache ou d'un calcul déjà lancé, qui ne change pas de statut.
   */
  markDenounced(id: string, byCardId: string, byLogin: string | null, born = true) {
    this.db
      .prepare(`UPDATE cards SET denounced_by = ?, denouncer_login = ?, denounce_born = ? WHERE id = ? AND denounced_by IS NULL`)
      .run(byCardId, byLogin ? byLogin.toLowerCase() : null, born ? 1 : 0, id);
    // Son statut change la ligne de classement (son LinkedIn, top.ts) : le classement gardé est oublié.
    forgetWeekRanks(this.db);
  }

  /**
   * « C'est bien moi » par LinkedIn (§18.118) : la personne connectée, dont le profil est celui de
   * cette fiche née d'une dénonciation, la reprend. Elle n'est plus « née d'une dénonciation » : elle
   * entre dans ses bandes, la vue publique rend sa grille, et un jeton neuf,
   * rendu à ce navigateur, remplace celui du dénonciateur. Rend le jeton, ou null (rien à reprendre).
   */
  claimDenouncedByLinkedin(id: string): string | null {
    const token = randomBytes(24).toString("base64url");
    const done = this.db.prepare(`UPDATE cards SET denounce_born = 0, delete_token = ? WHERE id = ? AND parent_id IS NULL AND denounce_born = 1`).run(token, id);
    if (!done.changes) return null;
    forgetWeekRanks(this.db);
    forgetBands(this.db);
    return token;
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

  /**
   * Une fiche partie : ses événements restent comptés par `npm run weekly` (clics,
   * visites, à leur date), mais ne la nomment plus, ni par `card_id` ni dans `meta`.
   */
  private unlinkEvents(id: string) {
    this.db.prepare(`UPDATE events SET card_id = NULL, meta = json_remove(meta, '$.ref') WHERE card_id = ?`).run(id);
    this.db.prepare(`UPDATE events SET meta = json_remove(meta, '$.by') WHERE event = 'denounce_sent' AND json_extract(meta, '$.by') = ?`).run(id);
  }

  /** Supprime la carte et son groupe. Renvoie les ids supprimés. */
  deleteGroup(id: string): string[] {
    const ids = this.groupIds(id);
    const stmt = this.db.prepare(`DELETE FROM cards WHERE id = ?`);
    const votes = this.db.prepare(`DELETE FROM votes WHERE card_id = ?`);
    this.db.transaction(() =>
      ids.forEach((i) => {
        stmt.run(i);
        votes.run(i);
        this.unlinkEvents(i);
      }),
    )();
    forgetWeekRanks(this.db);
    // Supprimer sa fiche la retire de ses bandes (§18.38).
    removeBandMembers(this.db, ids);
    // Et de ses primes (§18.4) : l'inscription qu'elle portait est effacée.
    removeEntriesForCards(this.db, ids);
    removeProposals(this.db, ids);
    return ids;
  }

  /**
   * Supprime les cartes expirées sans email (leurs événements perdent leur lien),
   * et les événements de plus de EVENTS_RETENTION_MS. Renvoie les ids des cartes pour effacer les PNG.
   */
  purgeExpired(now = Date.now()): string[] {
    const rows = this.db
      .prepare(`SELECT id FROM cards WHERE email IS NULL AND expires_at IS NOT NULL AND expires_at < ?`)
      .all(now) as { id: string }[];
    const ids = rows.map((r) => r.id);
    const stmt = this.db.prepare(`DELETE FROM cards WHERE id = ?`);
    const votes = this.db.prepare(`DELETE FROM votes WHERE card_id = ?`);
    this.db.transaction(() => {
      // Avant de partir, une fiche remplacée passe ses comptes au dossier (§18.106).
      this.followAccounts(ids);
      ids.forEach((i) => {
        stmt.run(i);
        votes.run(i);
        this.unlinkEvents(i);
      });
      this.fallBackAccounts(ids);
    })();
    this.db.prepare(`DELETE FROM events WHERE at < ?`).run(now - EVENTS_RETENTION_MS);
    // Compteurs de limite : on ne garde que les deux derniers jours.
    const cutoff = new Date(now - 2 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    this.db.prepare(`DELETE FROM ratelimit WHERE day < ?`).run(cutoff);
    purgeLinkedin(this.db, now);
    if (ids.length) forgetWeekRanks(this.db);
    removeBandMembers(this.db, ids);
    removeEntriesForCards(this.db, ids);
    removeProposals(this.db, ids);
    return ids;
  }

  /**
   * Un dossier parti (§18.106) : ses comptes retombent sur la plus récente des fiches qu'il
   * remplaçait et qui reste (celle qui porte un email n'expire pas, son dossier si).
   */
  private fallBackAccounts(gone: string[]) {
    if (!gone.length) return;
    const back = this.db.prepare(`SELECT id FROM cards WHERE superseded_by = ? AND parent_id IS NULL ORDER BY created_at DESC LIMIT 1`);
    const move = this.db.prepare(`UPDATE accounts SET card_id = ? WHERE card_id = ?`);
    for (const id of gone) {
      const prev = back.get(id) as { id: string } | undefined;
      if (prev) move.run(prev.id, id);
    }
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

  // --- Propriétaires (§18.1) -----------------------------------------------

  /** Login d'une fiche : le sien, ou celui de sa comparaison (la carte CV d'une comparaison n'en a pas). */
  loginOf(row: Pick<CardRow, "login" | "parentId">): string | null {
    if (row.login) return row.login;
    if (!row.parentId) return null;
    const p = this.db.prepare(`SELECT login FROM cards WHERE id = ?`).get(row.parentId) as { login: string | null } | undefined;
    return p?.login ?? null;
  }

  /** Ids de toutes les fiches d'un login, cartes CV de ses comparaisons comprises. */
  idsForLogin(login: string): string[] {
    const l = login.toLowerCase();
    const rows = this.db
      .prepare(`SELECT id FROM cards WHERE login = ? OR parent_id IN (SELECT id FROM cards WHERE login = ?)`)
      .all(l, l) as { id: string }[];
    return rows.map((r) => r.id);
  }

  getOwner(login: string): OwnerRow | null {
    const r = this.db.prepare(`SELECT * FROM owners WHERE login = ?`).get(login.toLowerCase()) as RawOwner | undefined;
    return r ? toOwner(r) : null;
  }

  getOwnerById(githubId: number): OwnerRow | null {
    const r = this.db.prepare(`SELECT * FROM owners WHERE github_id = ?`).get(githubId) as RawOwner | undefined;
    return r ? toOwner(r) : null;
  }

  /**
   * Revendication : le compte GitHub `githubId`, aujourd'hui nommé `login`,
   * devient propriétaire de toutes les fiches de ce login, qui n'expirent plus.
   * L'identifiant numérique fait foi : un compte renommé garde sa ligne (date de
   * revendication, masquage) et ses anciennes fiches passent sous le nouveau
   * nom ; une ligne d'un autre compte sur ce même nom (nom libéré puis repris)
   * est remplacée.
   */
  claimOwner(login: string, githubId: number, now = Date.now()): OwnerRow {
    const l = login.toLowerCase();
    this.db.transaction(() => {
      this.db.prepare(`DELETE FROM owners WHERE login = ? AND github_id <> ?`).run(l, githubId);
      const prev = this.getOwnerById(githubId);
      if (!prev) {
        this.db.prepare(`INSERT INTO owners (login, github_id, claimed_at, hidden) VALUES (?, ?, ?, 0)`).run(l, githubId, now);
      } else if (prev.login !== l) {
        this.db.prepare(`UPDATE owners SET login = ? WHERE github_id = ?`).run(l, githubId);
        this.db.prepare(`UPDATE cards SET login = ? WHERE login = ?`).run(l, prev.login);
      }
      this.db
        .prepare(`UPDATE cards SET expires_at = NULL WHERE login = ? OR parent_id IN (SELECT id FROM cards WHERE login = ?)`)
        .run(l, l);
    })();
    // Un renommage déplace des fiches d'un login à l'autre.
    forgetWeekRanks(this.db);
    forgetBands(this.db);
    return this.getOwner(l)!;
  }

  setOwnerHidden(login: string, hidden: boolean) {
    this.db.prepare(`UPDATE owners SET hidden = ? WHERE login = ?`).run(hidden ? 1 : 0, login.toLowerCase());
    forgetWeekRanks(this.db);
    // Une fiche masquée ne compte plus dans ses bandes (§18.38) ; rendue visible, elle y revient.
    forgetBands(this.db);
    // Masquer ses fiches vaut retrait de toutes ses primes (§18.4) : les inscriptions sont effacées.
    if (hidden) removeEntriesForLogin(this.db, login);
  }

  /** true si le propriétaire de ce login a masqué ses fiches. */
  isHidden(login: string | null | undefined): boolean {
    if (!login) return false;
    const r = this.db.prepare(`SELECT hidden FROM owners WHERE login = ?`).get(login.toLowerCase()) as { hidden: number } | undefined;
    return r?.hidden === 1;
  }
}
