// Rang d'école de la carte déclarée : la liste des écoles prime sur l'IA, pour
// qu'une même école ait toujours le même rang. La liste vit hors du dépôt public
// (SPEC §18.50), comme celle des employeurs (employers.ts) : un fichier du
// serveur, au chemin donné par SCHOOL_TIERS_FILE, de la forme de
// data/schools.example.json. Le dépôt n'en garde qu'un exemple aux écoles
// inventées. Le plafond de l'IA (aiMaxTier) reste dans data/scoring.json.
//
// Sans fichier, ou fichier illisible : liste vide, un avertissement au plus,
// rien ne plante ; toute école prend alors le rang de l'IA, plafonné.

import { readFileSync } from "node:fs";
import { SCHOOL_TIERS, type SchoolTier } from "../../../shared/readings";
import { SCORING } from "./config";

export type ListedTier = Exclude<SchoolTier, "none">;

export interface RankedSchool {
  /** Le nom affiché (« École Orbitale de Lisière »). */
  school: string;
  tier: ListedTier;
  /** Le motif, essayé sur le nom normalisé. */
  re: RegExp;
}

export interface RankedSchoolList {
  schools: RankedSchool[];
  /** Le fichier lu ; null sans fichier, ou s'il est illisible. */
  source: string | null;
}

export const SCHOOLS_ENV = "SCHOOL_TIERS_FILE";
const MAX_SCHOOLS = 1000;
const LISTED_TIERS: readonly string[] = SCHOOL_TIERS.filter((t) => t !== "none");

/** Minuscules, sans accents, toute ponctuation ramenée à une espace. */
export function normSchool(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Le contenu d'un fichier de liste → écoles, dans l'ordre ; les entrées mal formées sont ignorées. */
export function parseSchools(json: unknown): RankedSchool[] {
  const list = (json as { schools?: unknown } | null)?.schools;
  if (!Array.isArray(list)) return [];
  const out: RankedSchool[] = [];
  for (const raw of list.slice(0, MAX_SCHOOLS)) {
    const e = raw as { school?: unknown; tier?: unknown; pattern?: unknown } | null;
    if (typeof e?.school !== "string" || !e.school.trim()) continue;
    if (typeof e.tier !== "string" || !LISTED_TIERS.includes(e.tier)) continue;
    if (typeof e.pattern !== "string" || !e.pattern) continue;
    let re: RegExp;
    try {
      re = new RegExp(e.pattern);
    } catch {
      continue;
    }
    out.push({ school: e.school.trim().slice(0, 120), tier: e.tier as ListedTier, re });
  }
  return out;
}

/**
 * Lit la liste au chemin de SCHOOL_TIERS_FILE. Ne lève jamais : sans variable,
 * liste vide sans un mot (le démarrage du serveur le dit, index.ts) ; fichier
 * absent ou illisible, liste vide et un avertissement (sans le contenu).
 */
export function loadRankedSchools(
  env: Record<string, string | undefined> = process.env,
  read: (path: string) => string = (p) => readFileSync(p, "utf8"),
  warn: (msg: string) => void = (m) => console.warn(m),
): RankedSchoolList {
  const path = env[SCHOOLS_ENV]?.trim();
  if (!path) return { schools: [], source: null };
  try {
    const schools = parseSchools(JSON.parse(read(path)));
    if (!schools.length) warn(`[schools] ${SCHOOLS_ENV} : aucune école lisible dans ${path}`);
    return { schools, source: path };
  } catch (e) {
    warn(`[schools] ${SCHOOLS_ENV} illisible (${path}) : ${(e as Error).message.split("\n")[0]!.slice(0, 120)}`);
    return { schools: [], source: null };
  }
}

let cached: RankedSchoolList | null = null;

/** La liste du serveur, lue une fois au premier usage. */
export function rankedSchools(): RankedSchoolList {
  cached ??= loadRankedSchools();
  return cached;
}

/** Pour les tests : oublie la liste lue, ou en pose une. */
export function setRankedSchoolsForTests(list: RankedSchoolList | null): void {
  cached = list;
}

/** Les noms des écoles de la liste, tels qu'écrits. */
export function schoolListNames(list: RankedSchoolList = rankedSchools()): string[] {
  return list.schools.map((e) => e.school);
}

/** Plus petit = mieux classé (S avant A…). */
const rank = (t: SchoolTier) => SCHOOL_TIERS.indexOf(t);

/**
 * Le rang retenu pour une école : celui de la liste si le nom y figure, sinon
 * celui de l'IA plafonné. « none » de l'IA (rien de lié à la tech) reste « none ».
 * `known` : l'entrée de la liste qui a donné le rang.
 */
export function schoolTier(
  name: string | undefined,
  aiTier: SchoolTier | undefined,
  list: RankedSchoolList = rankedSchools(),
): { tier: SchoolTier; known: string | null } {
  const key = normSchool(name ?? "");
  if (!key || !aiTier || aiTier === "none") return { tier: "none", known: null };
  const hit = list.schools.find((e) => e.re.test(key));
  if (hit) return { tier: hit.tier, known: hit.school };
  const cap = SCORING.cv.TEC.school.aiMaxTier;
  return { tier: rank(aiTier) < rank(cap) ? cap : aiTier, known: null };
}
