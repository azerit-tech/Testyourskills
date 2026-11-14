// Le rang d'une école (S, A, B, C) reste dans le barème interne (server/src/scoring,
// docs/bareme-recrutement.md) : il donne la note du critère École, sur 10, et ne
// s'affiche nulle part, pas même à la personne fichée (SPEC §18.48). Ici, les
// phrases que le moteur écrit à la place, et la réécriture des grilles rangées
// avant cette règle, appliquée à la lecture en base (server/src/db.ts).

import type { CardData, ComparisonData, Fact, Grid, GridCriterion } from "./types";

const f = (fr: string, en: string): Fact => ({ fr, en });

/** Un rang d'école dans un texte : « rang A », « tier S ». Aucun texte affichable ne doit le porter. */
export const SCHOOL_RANK_RE = /\b(?:rang|tier) [SABC]\b/i;

/** La pièce de l'école, chez la personne fichée : « CentraleSupélec : comptée au dossier. » */
export const schoolCounted = (name: string): Fact => f(`${name} : comptée au dossier.`, `${name}: counted in the file.`);

/** La même, sans le nom (version publique de la pièce). */
export const SCHOOL_COUNTED: Fact = f("École comptée au dossier.", "School counted in the file.");

/** Ce qui manque pour le niveau suivant, selon la note atteinte (table de docs/bareme-recrutement.md §3, sans les lettres). */
export const EDU_NEXT: Record<number, Fact> = {
  4: f("Pour 6 : une école sélective.", "For 6: a selective school."),
  6: f(
    "Pour 8 : une école très sélective, ou une sélection prouvée hors école (classement dans un concours, prix de hackathon, programme sélectif).",
    "For 8: a highly selective school, or a proven selection outside school (competition ranking, hackathon prize, selective programme).",
  ),
  8: f(
    "Pour 10 : une école parmi les plus sélectives, ou une médaille internationale (olympiade, finale mondiale d'un concours de programmation).",
    "For 10: one of the most selective schools, or an international medal (olympiad, world final of a programming contest).",
  ),
};

/** Lue sur GitHub (un hackathon, 4/10) : la suite se lit sur LinkedIn. */
export const EDU_NEXT_GITHUB: Fact = f("Pour 6 : une école sélective, sur LinkedIn.", "For 6: a selective school, on LinkedIn.");

// --- Les grilles rangées avant la règle ---------------------------------------------

const FR_SCHOOL: Record<string, string> = { S: "une école parmi les plus sélectives", A: "une école très sélective", B: "une école sélective", C: "une autre école de tech" };
const EN_SCHOOL: Record<string, string> = { S: "one of the most selective schools", A: "a highly selective school", B: "a selective school", C: "another tech school" };

function rewriteFr(s: string): string {
  return s
    .replace(/^École de rang [SABC]\./, SCHOOL_COUNTED.fr)
    .replace(/, rang [SABC]\./g, " : comptée au dossier.")
    .replace(/une école de rang ([SABC])/g, (_m, t: string) => FR_SCHOOL[t]!)
    .replace(/ de rang [SABC]\b/g, "")
    .replace(/,? rang [SABC]\b/g, "");
}

function rewriteEn(s: string): string {
  return s
    .replace(/^Tier [SABC] school\./, SCHOOL_COUNTED.en)
    .replace(/, tier [SABC]\./g, ": counted in the file.")
    .replace(/a tier ([SABC]) school/g, (_m, t: string) => EN_SCHOOL[t]!)
    .replace(/,? tier [SABC]\b/gi, "");
}

const fact = (x: Fact | undefined): Fact | undefined => (x && (SCHOOL_RANK_RE.test(x.fr) || SCHOOL_RANK_RE.test(x.en)) ? f(rewriteFr(x.fr), rewriteEn(x.en)) : x);

function criterion(c: GridCriterion): GridCriterion {
  if (c.code !== "EDU") return c;
  const out: GridCriterion = { ...c, reached: fact(c.reached)!, flags: c.flags.map((x) => fact(x)!) };
  if (c.next) out.next = fact(c.next);
  if (c.evidence) out.evidence = { ...c.evidence, text: fact(c.evidence.text)!, ...(c.evidence.publicText ? { publicText: fact(c.evidence.publicText) } : {}) };
  return out;
}

const grid = (g: Grid | undefined): Grid | undefined => (g && Array.isArray(g.criteria) ? { ...g, criteria: g.criteria.map(criterion) } : g);

function card<T extends Partial<CardData>>(c: T): T {
  return c && c.grid ? { ...c, grid: grid(c.grid) } : c;
}

/** Une fiche ou une comparaison lue en base, sans aucun rang d'école dans ses textes. Idempotent. */
export function withoutSchoolRank<T>(data: T): T {
  if (!data || typeof data !== "object") return data;
  const d = data as unknown as Partial<ComparisonData> & Partial<CardData>;
  if (d.cv && d.github) {
    const out: Partial<ComparisonData> = { ...d, cv: card(d.cv), github: card(d.github) };
    if (d.file) out.file = card(d.file);
    if (d.grid) out.grid = grid(d.grid);
    return out as unknown as T;
  }
  return card(d) as unknown as T;
}
