// Cache et budget de la lecture des profils LinkedIn (SPEC §18.24), dans la
// base du serveur. Trois tables neuves, créées par migrate() (db.ts) : une base
// déjà en production les gagne au démarrage, sans rien perdre.
//
// - linkedin_profiles : profil réduit par adresse normalisée, 30 jours ;
//   « introuvable » aussi, 7 jours.
// - linkedin_lookups : le LinkedIn trouvé (ou non) par la recherche payante
//   facultative (LINKEDIN_AUTOFIND=crustdata) pour un login GitHub, mêmes durées.
// - linkedin_reads : profils lus (et recherches) par jour UTC, comme ai_spend :
//   un redémarrage ne remet pas le compteur à zéro.

import type Database from "better-sqlite3";
import type { LinkedinProfile } from "./profile";

export const FOUND_TTL_MS = 30 * 24 * 3600 * 1000;
export const NOT_FOUND_TTL_MS = 7 * 24 * 3600 * 1000;

export const LINKEDIN_SCHEMA = `
CREATE TABLE IF NOT EXISTS linkedin_profiles (
  url          TEXT PRIMARY KEY,  -- https://www.linkedin.com/in/<slug>, slug en minuscules
  fetched_at   INTEGER NOT NULL,  -- ms epoch
  expires_at   INTEGER NOT NULL,  -- 30 jours trouvé, 7 jours introuvable
  github_login TEXT,              -- compte GitHub lié ; '' = aucun connu ; NULL = pas demandé
  json         TEXT               -- profil réduit (profile.ts), sans photo ; NULL = introuvable
);
CREATE INDEX IF NOT EXISTS linkedin_profiles_expires ON linkedin_profiles(expires_at);

CREATE TABLE IF NOT EXISTS linkedin_lookups (
  login      TEXT PRIMARY KEY,    -- pseudo GitHub en minuscules
  url        TEXT,                -- LinkedIn trouvé ; NULL = rien trouvé
  looked_at  INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS linkedin_reads (
  day   TEXT PRIMARY KEY,         -- AAAA-MM-JJ (UTC)
  reads INTEGER NOT NULL          -- appels au fournisseur (profils lus, recherches)
);
`;

/** Crée les tables si elles manquent (appelé par migrate()). Idempotent. */
export function ensureLinkedinTables(db: Database.Database): void {
  db.exec(LINKEDIN_SCHEMA);
}

/** Supprime les entrées expirées (purge horaire, avec les fiches). */
export function purgeLinkedin(db: Database.Database, now = Date.now()): void {
  db.prepare(`DELETE FROM linkedin_profiles WHERE expires_at < ?`).run(now);
  db.prepare(`DELETE FROM linkedin_lookups WHERE expires_at < ?`).run(now);
  const cutoff = new Date(now - 60 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  db.prepare(`DELETE FROM linkedin_reads WHERE day < ?`).run(cutoff);
}

/** Oublie un profil et les recherches qui y mènent (suppression d'une fiche, §11). */
export function forgetLinkedin(db: Database.Database, url: string): void {
  db.prepare(`DELETE FROM linkedin_profiles WHERE url = ?`).run(url);
  db.prepare(`DELETE FROM linkedin_lookups WHERE url = ?`).run(url);
}

/**
 * `githubLogin` : le compte GitHub lié ; null si personne n'en connaît ;
 * undefined si personne ne l'a encore demandé.
 * En base : NULL = pas demandé, '' = demandé, rien trouvé.
 */
export type CachedProfile =
  | { found: true; profile: LinkedinProfile; githubLogin: string | null | undefined }
  | { found: false };

const day = (now: number) => new Date(now).toISOString().slice(0, 10);

export class LinkedinCache {
  constructor(private readonly db: Database.Database) {
    ensureLinkedinTables(db);
  }

  getProfile(url: string, now = Date.now()): CachedProfile | null {
    const r = this.db.prepare(`SELECT json, github_login FROM linkedin_profiles WHERE url = ? AND expires_at > ?`).get(url, now) as
      | { json: string | null; github_login: string | null }
      | undefined;
    if (!r) return null;
    if (!r.json) return { found: false };
    try {
      const githubLogin = r.github_login === null ? undefined : r.github_login || null;
      return { found: true, profile: JSON.parse(r.json) as LinkedinProfile, githubLogin };
    } catch {
      return null;
    }
  }

  /** La photo n'est jamais gardée : elle ne sert pas au jugement. */
  putProfile(url: string, profile: LinkedinProfile | null, githubLogin: string | null | undefined, now = Date.now()): void {
    const gh = githubLogin === undefined ? null : (githubLogin?.toLowerCase() ?? "");
    const kept = profile ? JSON.stringify({ ...profile, photoUrl: undefined }) : null;
    this.db
      .prepare(
        `INSERT INTO linkedin_profiles (url, fetched_at, expires_at, github_login, json) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(url) DO UPDATE SET fetched_at = excluded.fetched_at, expires_at = excluded.expires_at,
           github_login = excluded.github_login, json = excluded.json`,
      )
      .run(url, now, now + (profile ? FOUND_TTL_MS : NOT_FOUND_TTL_MS), gh, kept);
  }

  /** Lie un profil en cache au compte GitHub qui le déclare (ou qui y mène par la recherche). */
  linkGithub(url: string, githubLogin: string): void {
    this.db.prepare(`UPDATE linkedin_profiles SET github_login = ? WHERE url = ? AND json IS NOT NULL`).run(githubLogin.toLowerCase(), url);
  }

  /** undefined : jamais cherché (ou expiré) ; null : cherché, rien trouvé. */
  getLookup(login: string, now = Date.now()): string | null | undefined {
    const r = this.db.prepare(`SELECT url FROM linkedin_lookups WHERE login = ? AND expires_at > ?`).get(login.toLowerCase(), now) as
      | { url: string | null }
      | undefined;
    return r ? r.url : undefined;
  }

  putLookup(login: string, url: string | null, now = Date.now()): void {
    this.db
      .prepare(
        `INSERT INTO linkedin_lookups (login, url, looked_at, expires_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(login) DO UPDATE SET url = excluded.url, looked_at = excluded.looked_at, expires_at = excluded.expires_at`,
      )
      .run(login.toLowerCase(), url, now, now + (url ? FOUND_TTL_MS : NOT_FOUND_TTL_MS));
  }

  /** Appels au fournisseur aujourd'hui (UTC). */
  readsToday(now = Date.now()): number {
    const r = this.db.prepare(`SELECT reads FROM linkedin_reads WHERE day = ?`).get(day(now)) as { reads: number } | undefined;
    return r?.reads ?? 0;
  }

  addRead(now = Date.now()): void {
    this.db
      .prepare(`INSERT INTO linkedin_reads (day, reads) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET reads = reads + 1`)
      .run(day(now));
  }
}
