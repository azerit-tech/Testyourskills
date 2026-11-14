// data/season.json (shared/season.ts), lu une fois par le serveur. Absent ou mal
// formé : pas de saison, aucune prime ouverte, un avertissement au démarrage qui
// dit ce qui cloche. En dev, SEASON_FILE peut désigner un autre fichier (la
// saison de démonstration, scripts/demo/season-demo.json) : data/ reste vide.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSeasonReason, type Season } from "../../shared/season";

export const DEFAULT_SEASON_FILE = join(dirname(fileURLToPath(import.meta.url)), "../../data/season.json");
export const SEASON_FILE = process.env.SEASON_FILE?.trim() ? resolve(process.env.SEASON_FILE.trim()) : DEFAULT_SEASON_FILE;

export function loadSeason(path = SEASON_FILE): Season | null {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.warn(`[saison] ${path} illisible : ${(err as Error).message}. Pas de saison, aucune prime ouverte.`);
    return null;
  }
  const season = parseSeasonReason(raw);
  if (typeof season === "string") {
    console.warn(`[saison] ${path} mal formé (${season}, voir shared/season.ts). Pas de saison, aucune prime ouverte.`);
    return null;
  }
  return season;
}
