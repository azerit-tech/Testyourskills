// data/season.json (shared/season.ts), lu une fois par le serveur. Absent ou mal
// formé : pas de saison, aucune prime ouverte, un avertissement au démarrage.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSeason, type Season } from "../../shared/season";

export const SEASON_FILE = join(dirname(fileURLToPath(import.meta.url)), "../../data/season.json");

export function loadSeason(path = SEASON_FILE): Season | null {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.warn(`[saison] ${path} illisible : ${(err as Error).message}. Pas de saison, aucune prime ouverte.`);
    return null;
  }
  const season = parseSeason(raw);
  if (!season) console.warn(`[saison] ${path} mal formé (voir shared/season.ts). Pas de saison, aucune prime ouverte.`);
  return season;
}
