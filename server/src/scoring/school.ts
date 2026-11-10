// Rang d'école de la carte déclarée : la liste du barème (data/scoring.json,
// cv.TEC.school) prime sur l'IA, pour qu'une même école ait toujours le même rang.

import { SCHOOL_TIERS, type SchoolTier } from "../../../shared/readings";
import { SCORING } from "./config";

const S = SCORING.cv.TEC.school;
const LIST = S.list.map((e) => ({ ...e, re: new RegExp(e.pattern) }));

/** Minuscules, sans accents, toute ponctuation ramenée à une espace. */
export function normSchool(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Les noms des écoles de la liste, tels qu'écrits (« Centrale Méditerranée »). */
export function schoolListNames(): string[] {
  return LIST.map((e) => e.school);
}

/** Plus petit = mieux classé (S avant A…). */
const rank = (t: SchoolTier) => SCHOOL_TIERS.indexOf(t);

/**
 * Le rang retenu pour une école : celui de la liste si le nom y figure, sinon
 * celui de l'IA plafonné. « none » de l'IA (rien de lié à la tech) reste « none ».
 * `known` : l'entrée de la liste qui a donné le rang.
 */
export function schoolTier(name: string | undefined, aiTier: SchoolTier | undefined): { tier: SchoolTier; known: string | null } {
  const key = normSchool(name ?? "");
  if (!key || !aiTier || aiTier === "none") return { tier: "none", known: null };
  const hit = LIST.find((e) => e.re.test(key));
  if (hit) return { tier: hit.tier, known: hit.school };
  return { tier: rank(aiTier) < rank(S.aiMaxTier) ? S.aiMaxTier : aiTier, known: null };
}
