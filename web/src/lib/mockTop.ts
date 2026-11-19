// Mode démo : le top de la semaine (§18.22) avec des données fictives. Sept
// classés par défaut ; `?top=1` montre le lancement, `?top=8` le bloc du 6e au 8e.
import { boardPerson } from "../../../shared/boardPerson";
import type { CardData, TopEntry, WeekRank, WeekTop } from "../../../shared/types";
import { starsFor } from "../../../shared/types";

const DAY = 24 * 3600 * 1000;
const WEEK = 7 * DAY;

/** Lundi 00:00 UTC de la semaine de `t`. */
function mondayOf(t: number): number {
  const d = new Date(t);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return midnight - ((d.getUTCDay() + 6) % 7) * DAY;
}

/** Numéro de semaine ISO 8601 (l'année est celle du jeudi). */
function isoWeek(monday: number): number {
  const thursday = new Date(monday + 3 * DAY);
  const jan4 = Date.UTC(thursday.getUTCFullYear(), 0, 4);
  return Math.floor((thursday.getTime() - mondayOf(jan4)) / WEEK) + 1;
}

/**
 * Les classés fictifs, comme le serveur les rend (§18.88) : des fiches GitHub avec le nom
 * de la fiche ou le pseudo seul, et des fiches LinkedIn seules (un nom, pas de pseudo).
 */
interface Player {
  login?: string;
  name?: string;
  overall: number;
}

const ALL: Player[] = [
  { login: "svaaland", name: "Sigrun Vaaland", overall: 91 },
  { login: "leamd", name: "Léa Martin-Dubois", overall: 84 },
  { login: "nour-rs", overall: 79 },
  { name: "Inès Carpentier", overall: 74 },
  { login: "jplefevre", name: "Jean-Pierre Lefèvre", overall: 68 },
  { name: "Yanis Belkacem", overall: 52 },
  { login: "ghost-coder", overall: 31 },
  { login: "mira-k", name: "Mira Kowalczyk", overall: 27 },
  { name: "Théo Dubois", overall: 22 },
  { login: "pixel-ops", overall: 18 },
];

/** Combien de classés fictifs : 7 par défaut, `?top=1` pour le lancement, `?top=8`… (0 à 10). */
function players(): Player[] {
  let n = 7;
  try {
    const q = new URLSearchParams(window.location.search).get("top");
    if (q !== null && /^\d+$/.test(q)) n = Math.min(ALL.length, Number(q));
  } catch {
    /* hors navigateur : le défaut */
  }
  return ALL.slice(0, n);
}

/** Rang de démo d'une fiche fraîche parmi les classés fictifs ; null pour une fiche CV. */
export function mockWeekRank(card: CardData, now = Date.now()): WeekRank | null {
  if (card.source !== "github") return null;
  const PLAYERS = players();
  const monday = mondayOf(now);
  const rank = PLAYERS.filter((p) => p.overall >= card.overall).length + 1;
  const fifth = PLAYERS[4]?.overall ?? 0;
  const inTop5 = rank <= 5;
  return { rank, total: PLAYERS.length + 1, gapToTop5: inTop5 ? 0 : fifth - card.overall + 1, inTop5, week: isoWeek(monday), closed: false };
}

export function mockTop(now = Date.now()): WeekTop {
  const monday = mondayOf(now);
  const entries: TopEntry[] = players().map(({ login, name, overall }, i) => ({
    rank: i + 1,
    // Une fiche de démo qui s'ouvre vraiment (mock.ts lit le type dans l'id) : GitHub, ou LinkedIn seule.
    ...boardPerson({ name, login, ...(login ? { avatarUrl: `https://github.com/${login}.png?size=64` } : {}) }, login ? `m-gold-${login.replace(/[^a-z0-9]/g, "")}` : `m-li-top${i + 1}`),
    overall,
    stars: starsFor(overall),
  }));
  return { weekStart: monday, endsAt: monday + WEEK, week: isoWeek(monday), total: entries.length, entries };
}
