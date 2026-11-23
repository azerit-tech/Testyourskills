// Mode démo : le top du mois (§18.22) avec des données fictives. Sept
// classés par défaut ; `?top=1` montre le lancement, `?top=8` le bloc du 6e au 8e,
// `?top=27` « Voir tout le classement (27) » (§18.126), soixante au plus.
import { boardPerson } from "../../../shared/boardPerson";
import type { CardData, SeniorityCode, TopEntry, WeekRank, WeekTop } from "../../../shared/types";
import { starsFor } from "../../../shared/types";
import { periodEnd, periodMonth, periodStart } from "../../../shared/week";

/**
 * Les classés fictifs, comme le serveur les rend (§18.88) : des fiches GitHub avec le nom
 * de la fiche ou le pseudo seul, et des fiches LinkedIn seules (un nom, pas de pseudo).
 */
interface Player {
  login?: string;
  name?: string;
  overall: number;
}

/** Les niveaux de démo (§18.127), un par ligne, en boucle. */
const LEVELS: SeniorityCode[] = ["senior", "mid", "junior", "student", "expert", "junior", "mid", "student"];

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

/** Au-delà des dix nommés : des pseudos et des noms de démo, la note qui descend (§18.126). */
const FIRST = ["Hugo", "Sarah", "Malik", "Chloé", "Lucas", "Amina", "Noah", "Jade", "Karim", "Emma"];
const LAST = ["Garnier", "Benali", "Moreau", "Nguyen", "Lambert", "Diallo", "Roussel", "Fontaine"];
function extra(i: number): Player {
  const name = `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}`;
  const overall = Math.max(4, 17 - Math.floor(i / 4));
  const handle = `${FIRST[i % FIRST.length]!.toLowerCase()}-${LAST[(i + 3) % LAST.length]!.toLowerCase()}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (i % 3 === 0) return { login: handle, overall };
  if (i % 3 === 1) return { name, overall };
  return { login: handle.replace("-", ""), name, overall };
}
const MAX = 60;

/** Combien de classés fictifs : 7 par défaut, `?top=1` pour le lancement, `?top=8`, `?top=27`… (0 à 60). */
function players(): Player[] {
  let n = 7;
  try {
    const q = new URLSearchParams(window.location.search).get("top");
    if (q !== null && /^\d+$/.test(q)) n = Math.min(MAX, Number(q));
  } catch {
    /* hors navigateur : le défaut */
  }
  return [...ALL, ...Array.from({ length: Math.max(0, n - ALL.length) }, (_, i) => extra(i))].slice(0, n);
}

/** Rang de démo d'une fiche fraîche parmi les classés fictifs ; null pour une fiche CV. */
export function mockWeekRank(card: CardData, now = Date.now()): WeekRank | null {
  if (card.source !== "github") return null;
  const PLAYERS = players();
  const rank = PLAYERS.filter((p) => p.overall >= card.overall).length + 1;
  const fifth = PLAYERS[4]?.overall ?? 0;
  const inTop5 = rank <= 5;
  return { rank, total: PLAYERS.length + 1, gapToTop5: inTop5 ? 0 : fifth - card.overall + 1, inTop5, week: periodMonth(periodStart(now)), closed: false };
}

/** Comme le serveur : les dix premiers, et le nombre de classés. */
export function mockTop(now = Date.now()): WeekTop {
  return mockTopPage(0, 10, now);
}

/** Comme `GET /api/top?offset=&limit=` (§18.126) : `limit` lignes après les `offset` premières, 100 au plus. */
export function mockTopPage(offset: number, limit: number, now = Date.now()): WeekTop {
  const start = periodStart(now);
  const all = players();
  const entries: TopEntry[] = all.map(({ login, name, overall }, i) => ({
    rank: i + 1,
    // Une fiche de démo qui s'ouvre vraiment (mock.ts lit le type dans l'id) : GitHub, ou LinkedIn seule.
    // Les pseudos inventés au-delà des dix nommés n'ont pas de photo : leurs initiales.
    ...boardPerson({ name, login, ...(login && i < ALL.length ? { avatarUrl: `https://github.com/${login}.png?size=64` } : {}) }, login ? `m-gold-${login.replace(/[^a-z0-9]/g, "")}` : `m-li-top${i + 1}`, null, LEVELS[i % LEVELS.length]),
    overall,
    stars: starsFor(overall),
  }));
  const from = Math.max(0, offset);
  return { weekStart: start, endsAt: periodEnd(start), week: periodMonth(start), total: all.length, entries: entries.slice(from, from + Math.min(100, Math.max(0, limit))) };
}
