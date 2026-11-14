// La saison et ses primes (§18.4, §18.25), lues dans data/season.json : le
// serveur le lit au démarrage et l'expose dans /api/config (`season`,
// `primesOpen`, `primesListed`, `rulesPublished`) ; le front y lit le bandeau de
// saison et choisit la ligne de l'accueil (web/src/lib/season.ts). Pur, sans DOM
// ni fichier.
//
// Forme du fichier :
//   { "number": 1, "start": "AAAA-MM-JJ", "end": "AAAA-MM-JJ", "primes": [], "rulesPublished"?: false }
// Dates comprises, en jours UTC (début à 00:00, fin à 23:59:59). Une prime :
//   {
//     "id": "backend-stage",                 minuscules, chiffres et tirets
//     "company": "Nom de l'entreprise",
//     "logo"?: "nom.svg",                    fichier de web/public/primes/ ; sans logo, le nom en lettres
//     "contract": "stage" | "alternance" | "cdi",
//     "positions": ["BE", "FS"],             postes du site (Position, shared/types.ts)
//     "languages"?: ["Go", "TypeScript"],    affichés « souhaités », sans effet sur le rang
//     "interviews": 3,
//     "place"?: "Ville",                     posé en question, jamais un critère
//     "remote"?: false,
//     "from"?: "AAAA-MM-JJ", "to"?: "AAAA-MM-JJ",
//     "pitch": { "fr": "…", "en": "…" }
//   }
// ouverte de `from` (sinon le début de la saison) à `to` (sinon sa fin), dates
// comprises. Un fichier mal formé ne casse rien : pas de saison, aucune prime,
// et la raison au démarrage (parseSeasonReason).

import type { Fact, Position } from "./types";

export interface SeasonDates {
  number: number;
  /** Premier jour, AAAA-MM-JJ (UTC). */
  start: string;
  /** Dernier jour compris, AAAA-MM-JJ (UTC). */
  end: string;
}

/** La ligue d'une prime : le contrat cherché (§18.4). */
export type Contract = "stage" | "alternance" | "cdi";
export const CONTRACTS: readonly Contract[] = ["stage", "alternance", "cdi"];

/** Les postes du site (shared/types.ts, Position) qu'une prime peut viser. */
export const POSITIONS: readonly Position[] = ["FS", "BE", "FE", "MOB", "DATA", "ML", "OPS", "SEC", "EMB", "PM", "DESIGN", "CTO"];

export interface Prime {
  id: string;
  company: string;
  /** Fichier de web/public/primes/ ; absent : le nom de l'entreprise en lettres. */
  logo?: string;
  contract: Contract;
  positions: Position[];
  /** Langages souhaités, affichés tels quels ; ils ne changent jamais le rang. */
  languages: string[];
  interviews: number;
  /** La ville, posée en question à l'inscription (« Tu peux travailler à … ? »), jamais un critère. */
  place?: string;
  remote: boolean;
  from?: string;
  to?: string;
  pitch: Fact;
}

export interface Season extends SeasonDates {
  primes: Prime[];
  /** Le règlement est servi sur /reglement : faux tant que Jacques ne l'a pas relu. */
  rulesPublished: boolean;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 3600 * 1000;
export const PRIME_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOGO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(?:svg|png|jpe?g|webp)$/;

/** Minuit UTC du jour AAAA-MM-JJ, ou NaN. */
export function dayStart(day: string): number {
  return DAY_RE.test(day) ? Date.parse(`${day}T00:00:00Z`) : Number.NaN;
}

const isDay = (v: unknown): v is string => typeof v === "string" && Number.isFinite(dayStart(v));
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;

/** Une prime validée, ou la raison du refus. */
function parsePrime(raw: unknown): Prime | string {
  if (!raw || typeof raw !== "object") return "une prime n'est pas un objet";
  const p = raw as Record<string, unknown>;
  const id = p.id;
  if (typeof id !== "string" || id.length > 40 || !PRIME_ID_RE.test(id)) return "id : minuscules, chiffres et tirets, 40 signes au plus";
  const at = `prime « ${id} »`;
  if (!text(p.company, 60)) return `${at} : company manquant (60 signes au plus)`;
  if (p.logo !== undefined && (typeof p.logo !== "string" || !LOGO_RE.test(p.logo))) return `${at} : logo, un nom de fichier .svg, .png, .jpg ou .webp`;
  if (!CONTRACTS.includes(p.contract as Contract)) return `${at} : contract vaut stage, alternance ou cdi`;
  if (!Array.isArray(p.positions) || p.positions.length === 0 || !p.positions.every((x) => POSITIONS.includes(x as Position))) {
    return `${at} : positions, une liste parmi ${POSITIONS.join(", ")}`;
  }
  const languages = p.languages ?? [];
  if (!Array.isArray(languages) || languages.length > 8 || !languages.every((l) => text(l, 30))) return `${at} : languages, huit noms au plus`;
  if (!Number.isInteger(p.interviews) || (p.interviews as number) < 1 || (p.interviews as number) > 50) return `${at} : interviews, un entier de 1 à 50`;
  if (p.place !== undefined && !text(p.place, 60)) return `${at} : place, une ville`;
  if (p.remote !== undefined && typeof p.remote !== "boolean") return `${at} : remote vaut true ou false`;
  if ((p.from !== undefined && !isDay(p.from)) || (p.to !== undefined && !isDay(p.to))) return `${at} : from et to au format AAAA-MM-JJ`;
  if (isDay(p.from) && isDay(p.to) && dayStart(p.to) < dayStart(p.from)) return `${at} : to avant from`;
  const pitch = p.pitch as Record<string, unknown> | undefined;
  if (!pitch || !text(pitch.fr, 240) || !text(pitch.en, 240)) return `${at} : pitch { fr, en }, 240 signes au plus chacun`;
  return {
    id,
    company: (p.company as string).trim(),
    ...(p.logo ? { logo: p.logo as string } : {}),
    contract: p.contract as Contract,
    positions: [...new Set(p.positions as Position[])],
    languages: (languages as string[]).map((l) => l.trim()),
    interviews: p.interviews as number,
    ...(p.place ? { place: (p.place as string).trim() } : {}),
    remote: p.remote === true,
    ...(p.from ? { from: p.from as string } : {}),
    ...(p.to ? { to: p.to as string } : {}),
    pitch: { fr: (pitch.fr as string).trim(), en: (pitch.en as string).trim() },
  };
}

/** Le contenu de data/season.json validé, ou la raison du refus. */
export function parseSeasonReason(raw: unknown): Season | string {
  if (!raw || typeof raw !== "object") return "pas un objet";
  const r = raw as Record<string, unknown>;
  if (!Number.isInteger(r.number) || (r.number as number) < 1) return "number, un entier à partir de 1";
  if (!isDay(r.start) || !isDay(r.end)) return "start et end au format AAAA-MM-JJ";
  if (dayStart(r.end) < dayStart(r.start)) return "end avant start";
  if (!Array.isArray(r.primes)) return "primes, une liste";
  if (r.rulesPublished !== undefined && typeof r.rulesPublished !== "boolean") return "rulesPublished vaut true ou false";
  const primes: Prime[] = [];
  for (const raw of r.primes as unknown[]) {
    const p = parsePrime(raw);
    if (typeof p === "string") return p;
    if (primes.some((q) => q.id === p.id)) return `deux primes « ${p.id} »`;
    primes.push(p);
  }
  return { number: r.number as number, start: r.start, end: r.end, primes, rulesPublished: r.rulesPublished === true };
}

/** Le contenu de data/season.json validé, ou null s'il est mal formé. */
export function parseSeason(raw: unknown): Season | null {
  const s = parseSeasonReason(raw);
  return typeof s === "string" ? null : s;
}

/** Les dates seules, ce que le front affiche. */
export const seasonDates = (s: SeasonDates): SeasonDates => ({ number: s.number, start: s.start, end: s.end });

/** Où en est la saison à `now` : pas encore ouverte, en cours, finie. */
export function seasonPhase(s: SeasonDates, now: number): "soon" | "on" | "over" {
  if (now < dayStart(s.start)) return "soon";
  return now < dayStart(s.end) + DAY_MS ? "on" : "over";
}

/** Ouverture (minuit du premier jour) et clôture (minuit après le dernier jour) d'une prime, en ms. */
export function primeWindow(s: SeasonDates, p: Pick<Prime, "from" | "to">): { opens: number; closes: number } {
  return { opens: dayStart(p.from ?? s.start), closes: dayStart(p.to ?? s.end) + DAY_MS };
}

/** Une prime à `now` : pas encore ouverte, ouverte, close. */
export function primePhase(s: SeasonDates, p: Pick<Prime, "from" | "to">, now: number): "soon" | "open" | "closed" {
  const w = primeWindow(s, p);
  if (now < w.opens) return "soon";
  return now < w.closes ? "open" : "closed";
}

/** Une prime au moins est ouverte à `now`. */
export function primesOpen(s: Season | null, now: number): boolean {
  if (!s) return false;
  return s.primes.some((p) => primePhase(s, p, now) === "open");
}
