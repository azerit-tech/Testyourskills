// Les primes (SPEC §18.4, §18.5) : ce que le serveur (server/src/primes.ts) et
// le front (web/src/lib/primes.ts) se disent, et les règles pures du classement.
//
// Le classement d'une prime : la note globale de la fiche, point. Pas de bonus
// d'adéquation (règle du 10 novembre 2026 : une note qui se lit). À égalité :
// la fiabilité des preuves, puis la date d'inscription. Les langages et le lieu
// ne changent jamais le rang.

import type { Contract, Prime, SeasonDates } from "./season";
import { primePhase, primeWindow } from "./season";
import type { Fact, Position, Stars } from "./types";

/** La réponse à « Tu cherches un stage, une alternance, un CDI, ou rien ? » : la ligue, ou le jeu pour le fun. */
export type League = Contract | "fun";
export const LEAGUES: readonly League[] = ["stage", "alternance", "cdi", "fun"];
export const isLeague = (v: unknown): v is League => typeof v === "string" && (LEAGUES as readonly string[]).includes(v);

/** Places montrées au classement public d'une prime. */
export const BOARD_SIZE = 20;
/** Finalistes sortis à la clôture (scripts/finalists.ts). */
export const FINALISTS = 10;
/** Liens de preuves facultatifs. */
export const MAX_PROOFS = 3;
export const PROOF_MAX = 300;
/** Inscriptions effacées 30 jours après la fin de la saison, sauf victoire. */
export const ENTRY_RETENTION_DAYS = 30;

export type PrimePhase = "soon" | "open" | "closed";

/** Une prime telle qu'elle s'affiche : ses champs, ses dates résolues, sa phase et ses inscrits. */
export interface PrimeView extends Omit<Prime, "from" | "to"> {
  /** Premier et dernier jour, AAAA-MM-JJ (ceux de la saison si la prime n'en dit rien). */
  from: string;
  to: string;
  phase: PrimePhase;
  /** Jours pleins qui restent après aujourd'hui ; 0 le dernier jour. Null hors phase ouverte. */
  daysLeft: number | null;
  /** Inscriptions en course. */
  entrants: number;
}

/** Une place du classement public : le pseudo GitHub d'une fiche revendiquée, jamais un nom. */
export interface BoardRow {
  rank: number;
  login: string;
  cardId: string;
  overall: number;
  stars: Stars;
  profile?: Fact;
}

export interface PrimePageData {
  prime: PrimeView;
  /** Les vingt premiers. */
  board: BoardRow[];
  total: number;
}

export type EntryState = "racing" | "finalist" | "winner" | "withdrawn";

/** L'inscription de la personne connectée : son rang, jamais son email ni ses preuves. */
export interface MyEntry {
  rank: number;
  total: number;
  state: EntryState;
  cardId: string;
  overall: number;
}

/** Pourquoi la personne connectée peut, ou ne peut pas encore, concourir pour une prime. */
export type JoinGate =
  /** Connectée, sa dernière fiche vise un poste de la prime : le formulaire. */
  | "ok"
  /** Pas connectée comme propriétaire d'une fiche GitHub : « C'est moi » d'abord. */
  | "claim"
  /** Sa dernière fiche ne vise aucun poste de la prime. */
  | "position"
  /** Sa dernière fiche est sortie sans lecture : à refaire. */
  | "degraded"
  /** Connectée, mais aucune fiche à son pseudo. */
  | "nocard"
  /** Prime pas encore ouverte, ou close. */
  | "closed";

/** GET /api/primes/:id/me */
export interface PrimeMe {
  login: string | null;
  entry: MyEntry | null;
  gate: JoinGate;
  /** La fiche qui concourrait : celle-là et sa note, pour la ligne « Tu serais 7e sur 143 ». */
  card: { id: string; overall: number; position: Position } | null;
  /** Son rang si elle s'inscrivait maintenant. */
  wouldBe: { rank: number; total: number } | null;
}

/** Une ligne de « Tu es en course » sous une fiche (§18.5). */
export interface RaceLine {
  prime: PrimeView;
  /** Rang (réel si inscrite, sinon celui qu'elle aurait) et nombre d'inscrits, elle comprise. */
  rank: number;
  total: number;
  entered: boolean;
  /** ok : la personne connectée peut concourir ; claim : « C'est moi » d'abord. */
  gate: "ok" | "claim";
}

/** GET /api/card/:id/race?league=… */
export interface Race {
  /** Fiche sans pseudo GitHub (LinkedIn seule, CV) : « Ajoute ton GitHub pour concourir ». */
  needsGithub: boolean;
  /** Fiche sortie sans lecture IA : elle ne concourt pas. */
  degraded: boolean;
  /** Les primes ouvertes de cette ligue qui visent le poste de la fiche. */
  lines: RaceLine[];
}

/** Ce qui classe une inscription. */
export interface Ranked {
  login: string;
  overall: number;
  reliability: number;
  joinedAt: number;
}

/** L'ordre d'une prime : la note, puis la fiabilité, puis l'inscription la plus ancienne. */
export function compareEntries(a: Ranked, b: Ranked): number {
  return b.overall - a.overall || b.reliability - a.reliability || a.joinedAt - b.joinedAt || a.login.localeCompare(b.login);
}

/**
 * Le rang qu'aurait une fiche pas encore inscrite : derrière toute inscription
 * de note plus haute, ou de même note et de fiabilité au moins égale (elle
 * s'inscrirait la dernière). `total` la compte.
 */
export function wouldRank(entries: Pick<Ranked, "overall" | "reliability">[], overall: number, reliability: number): { rank: number; total: number } {
  const ahead = entries.filter((e) => e.overall > overall || (e.overall === overall && e.reliability >= reliability)).length;
  return { rank: ahead + 1, total: entries.length + 1 };
}

const DAY_MS = 24 * 3600 * 1000;

/** Les dates résolues, la phase et les jours qui restent. */
export function primeView(season: SeasonDates, p: Prime, entrants: number, now: number): PrimeView {
  const { from: _f, to: _t, ...rest } = p;
  const phase = primePhase(season, p, now);
  const { closes } = primeWindow(season, p);
  return {
    ...rest,
    from: p.from ?? season.start,
    to: p.to ?? season.end,
    phase,
    daysLeft: phase === "open" ? Math.max(0, Math.ceil((closes - now) / DAY_MS) - 1) : null,
    entrants,
  };
}

/** Un lien de preuve accepté : http ou https, 300 signes au plus, sans espace. Null sinon. */
export function cleanProof(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > PROOF_MAX || /\s/.test(s)) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Adresse de la page d'une prime. */
export const primePath = (id: string): string => `/primes/${id}`;
