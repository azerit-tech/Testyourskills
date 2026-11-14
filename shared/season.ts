// La saison et ses primes (§18.4, §18.25), lues dans data/season.json : le
// serveur le lit au démarrage et l'expose dans /api/config (`season`,
// `primesOpen`) ; le front y lit le bandeau de saison et choisit la ligne de
// l'accueil (web/src/lib/season.ts). Pur, sans DOM ni fichier.
//
// Forme du fichier :
//   { "number": 1, "start": "AAAA-MM-JJ", "end": "AAAA-MM-JJ", "primes": [] }
// Dates comprises, en jours UTC (début à 00:00, fin à 23:59:59). Une prime :
//   { "id": "…", "from"?: "AAAA-MM-JJ", "to"?: "AAAA-MM-JJ" }
// ouverte de `from` (sinon le début de la saison) à `to` (sinon sa fin). Le reste
// d'une prime (entreprise, poste, règlement) viendra avec les primes elles-mêmes.

export interface SeasonDates {
  number: number;
  /** Premier jour, AAAA-MM-JJ (UTC). */
  start: string;
  /** Dernier jour compris, AAAA-MM-JJ (UTC). */
  end: string;
}

export interface Prime {
  id: string;
  from?: string;
  to?: string;
}

export interface Season extends SeasonDates {
  primes: Prime[];
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 3600 * 1000;

/** Minuit UTC du jour AAAA-MM-JJ, ou NaN. */
export function dayStart(day: string): number {
  return DAY_RE.test(day) ? Date.parse(`${day}T00:00:00Z`) : Number.NaN;
}

const isDay = (v: unknown): v is string => typeof v === "string" && Number.isFinite(dayStart(v));

/** Le contenu de data/season.json validé, ou null s'il est mal formé. */
export function parseSeason(raw: unknown): Season | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Number.isInteger(r.number) || (r.number as number) < 1 || !isDay(r.start) || !isDay(r.end)) return null;
  if (dayStart(r.end) < dayStart(r.start) || !Array.isArray(r.primes)) return null;
  const primes: Prime[] = [];
  for (const p of r.primes as unknown[]) {
    if (!p || typeof p !== "object") return null;
    const { id, from, to } = p as Record<string, unknown>;
    if (typeof id !== "string" || !id || (from !== undefined && !isDay(from)) || (to !== undefined && !isDay(to))) return null;
    primes.push({ id, ...(from ? { from } : {}), ...(to ? { to } : {}) });
  }
  return { number: r.number as number, start: r.start, end: r.end, primes };
}

/** Les dates seules, ce que le front affiche. */
export const seasonDates = (s: SeasonDates): SeasonDates => ({ number: s.number, start: s.start, end: s.end });

/** Où en est la saison à `now` : pas encore ouverte, en cours, finie. */
export function seasonPhase(s: SeasonDates, now: number): "soon" | "on" | "over" {
  if (now < dayStart(s.start)) return "soon";
  return now < dayStart(s.end) + DAY_MS ? "on" : "over";
}

/** Une prime au moins est ouverte à `now`. */
export function primesOpen(s: Season | null, now: number): boolean {
  if (!s) return false;
  return s.primes.some((p) => now >= dayStart(p.from ?? s.start) && now < dayStart(p.to ?? s.end) + DAY_MS);
}
