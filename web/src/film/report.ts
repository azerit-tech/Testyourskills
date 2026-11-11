// L'événement `film` (docs/cinematique-poursuite.md §5.6) : une fois par
// lecture, ce qu'il en est advenu, la variante, le chargement et la lecture.
// La seule mesure du jour du lancement (`__film.stats()` n'existe qu'en
// développement). Aucune donnée personnelle : ni fiche, ni adresse, ni
// navigateur en clair. Pur, testé par report.test.ts contre le schéma du
// serveur (server/src/events.ts, filmMetaSchema).
import type { Quality } from "./net";

export type FilmOutcome = "played" | "gesture" | "timeout" | "nocodec" | "error" | "skipped" | "left";

export interface FilmFacts {
  outcome: FilmOutcome;
  variant: Quality | null;
  bytes: number;
  loadMs: number | null;
  startMs: number | null;
  dropped: number | null;
  switchMs: number | null;
  /** Débit mesuré, en bits par seconde. */
  bps: number | null;
  inApp: boolean;
  gesture: boolean;
}

export interface FilmMeta {
  outcome: FilmOutcome;
  variant: Quality | null;
  bytes: number;
  loadMs: number | null;
  startMs: number | null;
  dropped: number | null;
  switchMs: number | null;
  kbps: number | null;
  inApp: boolean;
  gesture: boolean;
}

/** Un nombre entier borné, ou null s'il n'y a rien de mesuré. */
const int = (v: number | null | undefined, max: number): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Math.min(max, Math.max(0, Math.round(v)));

/** Les mesures d'une lecture, mises au format de l'événement (bornes du serveur comprises). */
export function filmReport(f: FilmFacts): FilmMeta {
  return {
    outcome: f.outcome,
    variant: f.variant,
    bytes: int(f.bytes, 100_000_000) ?? 0,
    loadMs: int(f.loadMs, 3_600_000),
    startMs: int(f.startMs, 60_000),
    dropped: int(f.dropped, 100_000),
    switchMs: int(f.switchMs, 60_000),
    kbps: f.bps === null ? null : int(f.bps / 1000, 10_000_000),
    inApp: f.inApp,
    gesture: f.gesture,
  };
}

/**
 * L'issue d'une lecture qui s'arrête sans être allée au bout : passée par la
 * personne (la révélation close avant la fin), la pilule montrée et jamais
 * touchée, ou la page quittée.
 */
export function interruptedOutcome(o: { closed: boolean; started: boolean; gesture: boolean }): FilmOutcome {
  if (o.closed && o.started) return "skipped";
  if (o.gesture && !o.started) return "gesture";
  return "left";
}
