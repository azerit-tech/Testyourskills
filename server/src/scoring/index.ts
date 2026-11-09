// Point d'entrée du moteur de jugement : barème, statuts, comparaison, comptages CV.
// Pur et déterministe, sans IA (SPEC §4.1).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scoreGithub as scoreGithubBare } from "./github";
import { parsePercentileTable, withReference, type PercentileTable } from "./percentile";

export { cvTextCounts, scoreCv } from "./cv";
export { compareCards } from "./compare";
export { SCORING, STATUSES, BUZZWORDS } from "./config";
export { isLazyCommit } from "./derive";

/** Table de référence écrite par scripts/percentiles.ts (§18.3). Absente tant que Jacques ne l'a pas lancé. */
export const PERCENTILES_PATH = join(import.meta.dirname, "../../../data/percentiles.json");

let reference: PercentileTable | null | undefined;

/** La table de référence, lue une fois. null si le fichier manque ou est illisible : pas de rang, rien d'autre ne change. */
export function referenceTable(): PercentileTable | null {
  if (reference !== undefined) return reference;
  reference = loadPercentileTable(PERCENTILES_PATH);
  return reference;
}

export function loadPercentileTable(path: string): PercentileTable | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null; // pas encore de référence
  }
  try {
    const table = parsePercentileTable(JSON.parse(raw));
    if (!table) console.warn(`[scoring] ${path} ne ressemble pas à une table de centiles : ignorée`);
    return table;
  } catch (err) {
    console.warn(`[scoring] ${path} illisible, ignorée :`, (err as Error).message);
    return null;
  }
}

/**
 * Carte GitHub (§4.4), avec son rang et la rareté de ses statuts (§18.3) quand
 * data/percentiles.json existe pour ce barème.
 */
export function scoreGithub(...args: Parameters<typeof scoreGithubBare>): ReturnType<typeof scoreGithubBare> {
  return withReference(scoreGithubBare(...args), referenceTable());
}
