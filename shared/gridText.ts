// La note sur 100 lue dans la grille (docs/bareme-recrutement.md §4, SPEC §18.37),
// pour l'afficher : le bloc « Voici comment un recruteur d'Azerit te lit » (web)
// et la formule du dos de la fiche (shared/card). Rien n'est recalculé pour
// juger : la note affichée reste `grid.overall`, ce module dit d'où elle vient.
// Aucun terme additif : une note par critère, un coefficient, une moyenne.

import type { CriterionCode, Grid, GridCriterion, Lang } from "./types";

/** Les coefficients de data/grid.json (un test vérifie qu'ils n'ont pas dérivé). */
export const GRID_WEIGHTS: Record<CriterionCode, number> = { EDU: 1, XP: 1.5, EMP: 1.5, STK: 1.5, CODE: 2, ACT: 1, OWN: 1, OSS: 0.5 };

/** L'ordre de la formule : du plus lourd au plus léger, comme le §4 (« Code 7 × 2 + Stack 6 × 1,5 + … »). */
export const FORMULA_ORDER: CriterionCode[] = ["CODE", "STK", "XP", "EMP", "OWN", "ACT", "EDU", "OSS"];

/** Plafond sans code prouvé et note du dossier vide (data/grid.json, `final`). */
export const GRID_CAP_UNPROVEN = 85;
export const GRID_EMPTY_SCORE = 20;

/** Décimal court : « 1,5 » en français, « 1.5 » en anglais ; un entier reste entier. */
export function dec(n: number, lang: Lang, digits = 1): string {
  const k = 10 ** digits;
  const s = String(Math.round(n * k) / k);
  return lang === "fr" ? s.replace(".", ",") : s;
}

/** Pourquoi un critère sort de la moyenne : son état, ou l'école / l'open source sous la moyenne des autres. */
export type ExcludedWhy = "unproven" | "missing" | "below";

export interface GridMath {
  /** Les critères comptés, dans l'ordre de la formule. */
  terms: { code: CriterionCode; score: number; weight: number }[];
  /** Somme des notes × coefficients, somme des coefficients. */
  num: number;
  den: number;
  /** Moyenne pondérée sur 10, null si rien n'est compté. */
  mean: number | null;
  /** La moyenne × 10, arrondie au supérieur à ,5 : avant plafond. */
  raw: number | null;
  /** Les critères hors moyenne, dans l'ordre de la formule. */
  excluded: { code: CriterionCode; why: ExcludedWhy }[];
  rule?: Grid["rule"];
  /** Le plafond de 85 a fait baisser la note. */
  capHit: boolean;
  /** La note affichée : toujours celle de la grille. */
  overall: number;
}

/** Hors moyenne : par son état (non prouvé, non renseigné), ou noté mais sous la moyenne des autres. */
export function excludedWhy(c: GridCriterion): ExcludedWhy | null {
  // Gardée pour la personne fichée (page partagée) : hors moyenne, sans dire pourquoi.
  if (c.private) return null;
  if (c.score === null || c.state === "unproven" || c.state === "missing") return c.state === "missing" ? "missing" : "unproven";
  return c.counted ? null : "below";
}

/** D'où vient la note sur 100 : les termes comptés, la moyenne, la règle qui a joué. */
export function gridMath(grid: Grid): GridMath {
  const byCode = new Map(grid.criteria.map((c) => [c.code, c]));
  const ordered = FORMULA_ORDER.map((code) => byCode.get(code)).filter((c): c is GridCriterion => !!c);
  const empty = grid.rule === "empty_file";
  const terms = empty
    ? []
    : ordered.filter((c) => c.counted && c.score !== null).map((c) => ({ code: c.code, score: c.score!, weight: GRID_WEIGHTS[c.code] }));
  const num = terms.reduce((s, x) => s + x.score * x.weight, 0);
  const den = terms.reduce((s, x) => s + x.weight, 0);
  const mean = den ? num / den : null;
  // 10 × num / den, arrondi au supérieur à ,5, en entiers (coefficients doublés) comme le moteur.
  const raw = den ? Math.floor((20 * num * 2 + den * 2) / (2 * den * 2)) : null;
  const excluded = ordered
    .map((c) => ({ code: c.code, why: empty ? (excludedWhy(c) ?? "below") : excludedWhy(c) }))
    .filter((x): x is { code: CriterionCode; why: ExcludedWhy } => x.why !== null && (!empty || x.why !== "below"));
  return {
    terms,
    num,
    den,
    mean,
    raw,
    excluded,
    ...(grid.rule ? { rule: grid.rule } : {}),
    capHit: grid.rule === "capped_unproven" && raw !== null && raw > GRID_CAP_UNPROVEN,
    overall: grid.overall,
  };
}

/** Une grille utilisable à l'écran : huit critères connus, une note entière. Sinon, rien n'est affiché. */
export function usableGrid(grid: Grid | undefined | null): grid is Grid {
  return !!grid && Array.isArray(grid.criteria) && grid.criteria.length > 0 && Number.isFinite(grid.overall);
}
