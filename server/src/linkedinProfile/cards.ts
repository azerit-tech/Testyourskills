// Fiches LinkedIn déjà calculées (SPEC §18.24) : le cache de 24 h des fiches,
// et l'oubli du profil quand une fiche est supprimée (§11).

import type Database from "better-sqlite3";
import { CACHE_MS } from "../db";
import { forgetLinkedin } from "./store";

/**
 * Fiche LinkedIn de moins de 24 h, sortie avec la lecture IA : par adresse
 * LinkedIn (fiche seule ou comparaison), ou par login (comparaison). L'id, ou null.
 */
export function recentLinkedinCard(db: Database.Database, by: { url?: string; login?: string }, now = Date.now()): string | null {
  const where = by.url ? `json_extract(facts_json, '$.linkedinUrl') = ?` : `login = ?`;
  const key = by.url ?? by.login?.toLowerCase();
  if (!key) return null;
  const r = db
    .prepare(
      `SELECT id FROM cards
       WHERE parent_id IS NULL AND source = 'linkedin' AND degraded = 0 AND created_at > ? AND ${where}
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(now - CACHE_MS, key) as { id: string } | undefined;
  return r?.id ?? null;
}

/** Fiche supprimée : son profil LinkedIn en cache part avec elle. */
export function forgetLinkedinOfCard(db: Database.Database, facts: unknown): void {
  const url = (facts as { linkedinUrl?: unknown } | null)?.linkedinUrl;
  if (typeof url === "string") forgetLinkedin(db, url);
}
