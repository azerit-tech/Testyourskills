// Mode démo : le top de la semaine (§18.22) avec des données fictives. Sept
// classés, pour voir les places libres comme au lancement.
import type { TopEntry, WeekTop } from "../../../shared/types";
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

const PLAYERS: [string, number][] = [
  ["sindresorhus", 91],
  ["leamd", 84],
  ["nour-rs", 79],
  ["camroux", 74],
  ["jplefevre", 68],
  ["kevin-dev42", 52],
  ["ghost-coder", 31],
];

export function mockTop(now = Date.now()): WeekTop {
  const monday = mondayOf(now);
  const entries: TopEntry[] = PLAYERS.map(([login, overall], i) => ({
    rank: i + 1,
    // Une fiche de démo qui s'ouvre vraiment (mock.ts lit le type dans l'id).
    cardId: `m-gold-${login.replace(/[^a-z0-9]/g, "")}`,
    login,
    avatarUrl: `https://github.com/${login}.png?size=64`,
    overall,
    stars: starsFor(overall),
  }));
  return { weekStart: monday, endsAt: monday + WEEK, week: isoWeek(monday), total: entries.length, entries };
}
