// La base de l'App en Postgres (SPEC §18.95) : trois connexions au plus, sous
// le rôle `testyourskills`, qui se déclare (`azerit.writer`) pour que les
// déclencheurs de l'App (`*_sql_writer`, azerit/db/_sql_writers.py) donnent un
// `uid` et un `rev` à chaque ligne écrite. Que des SELECT et des INSERT ; une
// ligne marquée (`deleted_at`) n'est jamais lue, jamais ressuscitée.
//
// Chaque INSERT ne part que si la ligne manque (NOT EXISTS) : le déclencheur de
// l'App prend un `rev` avant même le contrôle d'unicité, et un ON CONFLICT seul
// en brûlerait un à chaque fiche.

import pg from "pg";
import type { AccountRef, RegistryDb } from "./index";
import type { LinkRow } from "./rules";

/** Le nom sous lequel le jeu écrit (`updated_by` des lignes). */
export const WRITER = "testyourskills";
/** La source des liens que le jeu établit. */
export const LINK_SOURCE = "testyourskills";

/** Ce que le registre demande à un client Postgres : `pg.Pool` en production, un faux en test. */
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
  end?(): Promise<void>;
}

const LINKS_SQL = `
SELECT o.handle_key AS other, o.handle AS handle, l.source, l.strength, l.rejected, l.observed_at, l.recorded_at, l.id
  FROM accounts me
  JOIN account_links l ON l.a_id = me.id AND l.deleted_at IS NULL
  JOIN accounts o ON o.id = l.b_id AND o.deleted_at IS NULL AND o.platform = $3
 WHERE me.platform = $1 AND me.handle_key = $2 AND me.deleted_at IS NULL
UNION ALL
SELECT o.handle_key, o.handle, l.source, l.strength, l.rejected, l.observed_at, l.recorded_at, l.id
  FROM accounts me
  JOIN account_links l ON l.b_id = me.id AND l.deleted_at IS NULL
  JOIN accounts o ON o.id = l.a_id AND o.deleted_at IS NULL AND o.platform = $3
 WHERE me.platform = $1 AND me.handle_key = $2 AND me.deleted_at IS NULL
 ORDER BY recorded_at, id
 LIMIT 200`;

const CV_SQL = `
SELECT c.data, c.fetched_at
  FROM cvs c JOIN accounts a ON a.id = c.account_id
 WHERE a.platform = 'linkedin' AND a.handle_key = $1 AND a.deleted_at IS NULL AND c.deleted_at IS NULL
 LIMIT 1`;

const PHOTO_SQL = `
SELECT p.data, p.content_type
  FROM photo_profiles pp
  JOIN photos p ON p.id = pp.photo_id AND p.deleted_at IS NULL
  JOIN accounts a ON a.id = pp.account_id
 WHERE a.platform = 'linkedin' AND a.handle_key = $1 AND a.deleted_at IS NULL AND pp.deleted_at IS NULL
 LIMIT 1`;

const ACCOUNTS_SQL = `
INSERT INTO accounts (platform, handle_key, handle)
SELECT v.platform, v.handle_key, v.handle
  FROM unnest($1::text[], $2::text[], $3::text[]) AS v(platform, handle_key, handle)
 WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.platform = v.platform AND a.handle_key = v.handle_key)
ON CONFLICT (platform, handle_key) DO NOTHING`;

// `a` est le compte dont la clé texte vient la première (`github:` avant `linkedin:`), comme dans l'App.
const LINK_SQL = `
INSERT INTO account_links (a_id, b_id, source, strength, rejected, campaign, step, observed_at, recorded_at)
SELECT g.id, li.id, '${LINK_SOURCE}', $3, 0, NULL, $4, $5, $5
  FROM accounts g, accounts li
 WHERE g.platform = 'github' AND g.handle_key = $1 AND g.deleted_at IS NULL
   AND li.platform = 'linkedin' AND li.handle_key = $2 AND li.deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM account_links x
                    WHERE x.a_id = g.id AND x.b_id = li.id AND x.source = '${LINK_SOURCE}'
                      AND x.rejected = 0 AND x.strength >= $3)
ON CONFLICT (a_id, b_id, source, strength, rejected) DO NOTHING`;

const ADD_CV_SQL = `
INSERT INTO cvs (account_id, data, sha256, fetched_at)
SELECT a.id, $2, $3, $4
  FROM accounts a
 WHERE a.platform = 'linkedin' AND a.handle_key = $1 AND a.deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM cvs c WHERE c.account_id = a.id)
ON CONFLICT (account_id) DO NOTHING`;

// Les comptes LinkedIn dont l'adresse commence par l'un de ces débuts (names.ts) : une
// tranche de l'index unique (platform, handle_key) chacune, avec le CV et « a une photo ».
const NAMESAKES_SQL = `
SELECT a.handle_key, c.data, c.fetched_at,
       EXISTS (SELECT 1 FROM photo_profiles pp WHERE pp.account_id = a.id AND pp.deleted_at IS NULL) AS has_photo
  FROM unnest($1::text[], $2::text[]) AS r(lo, hi)
  CROSS JOIN LATERAL (
        SELECT id, handle_key FROM accounts
         WHERE platform = 'linkedin' AND handle_key >= r.lo AND handle_key < r.hi AND deleted_at IS NULL
         ORDER BY handle_key
         LIMIT $3) a
  LEFT JOIN cvs c ON c.account_id = a.id AND c.deleted_at IS NULL`;

// Le LinkedIn d'un email vérifié, par la fonction que l'App prête au jeu
// (ops/registre-email.sql) : l'email entre, jamais un email ne sort.
const EMAIL_SQL = `SELECT handle_key FROM testyourskills_linkedin_by_email($1) LIMIT 5`;

export const SQL = { LINKS_SQL, CV_SQL, PHOTO_SQL, ACCOUNTS_SQL, LINK_SQL, ADD_CV_SQL, NAMESAKES_SQL, EMAIL_SQL };

const bytes = (v: unknown): Uint8Array | null => (v instanceof Uint8Array ? v : null);

export class PgRegistryDb implements RegistryDb {
  private readonly client: Queryable;

  constructor(url: string | Queryable) {
    if (typeof url !== "string") {
      this.client = url;
      return;
    }
    const pool = new pg.Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 60_000,
      connectionTimeoutMillis: 2000,
      // Une requête qui traîne ne garde jamais une des trois connexions.
      statement_timeout: 2000,
      application_name: WRITER,
      // Les déclencheurs de l'App ne donnent `uid` et `rev` qu'à une connexion qui se déclare.
      options: `-c azerit.writer=${WRITER}`,
    });
    // Une connexion inactive coupée par la base ne doit pas faire tomber le serveur.
    pool.on("error", () => {});
    this.client = pool;
  }

  async links(from: { platform: AccountRef["platform"]; key: string }, otherPlatform: AccountRef["platform"]) {
    const { rows } = await this.client.query(LINKS_SQL, [from.platform, from.key, otherPlatform]);
    return rows.map(
      (r): LinkRow & { handle: string } => ({
        other: String(r.other ?? ""),
        handle: String(r.handle ?? r.other ?? ""),
        source: String(r.source ?? ""),
        strength: Number(r.strength ?? 0),
        rejected: Number(r.rejected ?? 0) !== 0,
        observedAt: String(r.observed_at ?? ""),
      }),
    );
  }

  async cv(key: string) {
    const r = (await this.client.query(CV_SQL, [key])).rows[0];
    const data = bytes(r?.data);
    return r && data ? { data, fetchedAt: String(r.fetched_at ?? "") } : null;
  }

  async photo(key: string) {
    const r = (await this.client.query(PHOTO_SQL, [key])).rows[0];
    const data = bytes(r?.data);
    return r && data ? { data, contentType: String(r.content_type ?? "") } : null;
  }

  async namesakes(ranges: { lo: string; hi: string }[], perRange: number) {
    if (!ranges.length) return [];
    const { rows } = await this.client.query(NAMESAKES_SQL, [ranges.map((r) => r.lo), ranges.map((r) => r.hi), perRange]);
    return rows.map((r) => {
      const data = bytes(r.data);
      return { key: String(r.handle_key ?? ""), cv: data ? { data, fetchedAt: String(r.fetched_at ?? "") } : null, hasPhoto: r.has_photo === true };
    });
  }

  async linkedinByEmail(email: string) {
    const { rows } = await this.client.query(EMAIL_SQL, [email]);
    return rows.map((r) => String(r.handle_key ?? "")).filter(Boolean);
  }

  async addAccounts(accounts: AccountRef[]) {
    if (!accounts.length) return 0;
    const r = await this.client.query(ACCOUNTS_SQL, [accounts.map((a) => a.platform), accounts.map((a) => a.key), accounts.map((a) => a.handle)]);
    return r.rowCount ?? 0;
  }

  async addLink(l: { github: AccountRef; linkedin: AccountRef; strength: number; step: string; at: string }) {
    const r = await this.client.query(LINK_SQL, [l.github.key, l.linkedin.key, l.strength, l.step, l.at]);
    return (r.rowCount ?? 0) > 0;
  }

  async addCv(linkedin: AccountRef, cv: { data: Buffer; sha256: string; fetchedAt: string }) {
    const r = await this.client.query(ADD_CV_SQL, [linkedin.key, cv.data, cv.sha256, cv.fetchedAt]);
    return (r.rowCount ?? 0) > 0;
  }

  async close() {
    await this.client.end?.();
  }
}
