// La note sur 100 lue dans la grille (docs/bareme-recrutement.md §4, SPEC §18.37),
// pour l'afficher : le bloc « Voici comment un recruteur d'Azerit te lit » (web)
// et la formule du dos de la fiche (shared/card). Rien n'est recalculé pour
// juger : la note affichée reste `grid.overall`, ce module dit d'où elle vient.
// Aucun terme additif : une note par critère, un coefficient, une moyenne.

import type { CriterionCode, Fact, Grid, GridCriterion, GridSeniority, Lang, SeniorityCode } from "./types";

/**
 * Les coefficients de data/grid.json (un test vérifie qu'ils n'ont pas dérivé). Depuis
 * 0.5.0 (SPEC §18.84) l'expérience ne pèse plus : les années comptées donnent le
 * niveau auquel le dossier est lu, et son poids est passé au parcours et à l'ownership.
 */
export const GRID_WEIGHTS: Record<CriterionCode, number> = { EDU: 1, XP: 0, EMP: 2.5, STK: 1.5, CODE: 2, ACT: 1, OWN: 1.5, OSS: 0.5 };
/** Les coefficients du barème 0.4.0 : ceux d'une grille rangée sans les siens. */
export const LEGACY_GRID_WEIGHTS: Record<CriterionCode, number> = { EDU: 1, XP: 1.5, EMP: 1.5, STK: 1.5, CODE: 2, ACT: 1, OWN: 1, OSS: 0.5 };
/** Les coefficients qui ont fait la moyenne de cette grille : les siens, ou ceux de 0.4.0 pour une grille d'avant. */
export function weightsOf(grid: Pick<Grid, "weights"> | null | undefined): Record<CriterionCode, number> {
  return grid?.weights ?? LEGACY_GRID_WEIGHTS;
}

/** L'ordre de la formule : du plus lourd au plus léger, comme le §4 (« Parcours 6 × 2,5 + Code 7 × 2 + … »). */
export const FORMULA_ORDER: CriterionCode[] = ["EMP", "CODE", "STK", "OWN", "ACT", "EDU", "OSS", "XP"];
/** L'ordre du barème 0.4.0 (« Code 7 × 2 + Stack 6 × 1,5 + … »), pour une grille d'avant. */
export const LEGACY_FORMULA_ORDER: CriterionCode[] = ["CODE", "STK", "XP", "EMP", "OWN", "ACT", "EDU", "OSS"];
export function formulaOrder(grid: Pick<Grid, "weights"> | null | undefined): CriterionCode[] {
  return grid?.weights ? FORMULA_ORDER : LEGACY_FORMULA_ORDER;
}

/** Les niveaux d'expérience (data/grid.json, `seniority` ; un test vérifie les bornes). */
export const SENIORITY_TEXT: Record<SeniorityCode, { name: Fact; range: Fact }> = {
  student: { name: { fr: "Début de carrière", en: "Early career" }, range: { fr: "moins d'un an", en: "under a year" } },
  junior: { name: { fr: "Junior", en: "Junior" }, range: { fr: "de 1 à 3 ans", en: "1 to 3 years" } },
  mid: { name: { fr: "Confirmé", en: "Mid-level" }, range: { fr: "de 3 à 6 ans", en: "3 to 6 years" } },
  senior: { name: { fr: "Senior", en: "Senior" }, range: { fr: "de 6 à 10 ans", en: "6 to 10 years" } },
  expert: { name: { fr: "Expert", en: "Expert" }, range: { fr: "10 ans et plus", en: "10 years and more" } },
};

/**
 * Le niveau en une ligne courte, à côté de la note : « Junior · 1,1 an », « Début de
 * carrière · moins d'un an », « Junior · 2 ans (estimé) » quand GitHub seul l'estime.
 */
export function seniorityLabel(s: GridSeniority, lang: Lang): string {
  const name = SENIORITY_TEXT[s.code].name[lang];
  const y = Math.round((s.months / 12) * 10) / 10;
  const span =
    s.months < 12
      ? SENIORITY_TEXT.student.range[lang]
      : lang === "fr"
        ? `${dec(y, "fr")} an${y >= 2 ? "s" : ""}`
        : `${dec(y, "en")} year${y === 1 ? "" : "s"}`;
  const how = s.source === "github" ? (lang === "fr" ? " (estimé)" : " (estimated)") : s.claimed ? (lang === "fr" ? " (affirmé)" : " (claimed)") : "";
  return `${name} · ${span}${how}`;
}

/** Plafond sans code prouvé et note du dossier vide (data/grid.json, `final`). */
export const GRID_CAP_UNPROVEN = 85;
export const GRID_EMPTY_SCORE = 20;

/** Décimal court : « 1,5 » en français, « 1.5 » en anglais ; un entier reste entier. */
export function dec(n: number, lang: Lang, digits = 1): string {
  const k = 10 ** digits;
  const s = String(Math.round(n * k) / k);
  return lang === "fr" ? s.replace(".", ",") : s;
}

/**
 * Pourquoi un critère sort de la moyenne : son état, l'école / l'open source / le déclaré
 * sous la moyenne des autres, ou (0.5.0) l'expérience, qui donne le niveau et ne pèse pas.
 */
export type ExcludedWhy = "unproven" | "missing" | "below" | "level";

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
  // L'expérience notée et hors moyenne : une grille 0.5.0, où elle donne le niveau.
  if (!c.counted && c.code === "XP") return "level";
  return c.counted ? null : "below";
}

/** Ce que l'école dit d'elle-même : « comptée » ou « hors moyenne », rien d'autre. */
export type SchoolState = "counted" | "out";

/**
 * L'école (SPEC §18.52) : jamais un chiffre, à personne, comptée ou non. Deux mots
 * seulement, « comptée » (dans la moyenne) ou « hors moyenne » (sous la moyenne des
 * autres, sans école de tech, ou gardée pour la personne sur la page partagée) : la
 * personne fichée lit la même chose que le visiteur. null : pas une école, ou une
 * école pas encore lue sur une fiche GitHub seule (elle se lit sur LinkedIn ou le CV).
 */
export function schoolState(c: Pick<GridCriterion, "code" | "score" | "counted" | "private" | "source">): SchoolState | null {
  if (c.code !== "EDU") return null;
  if (c.private) return "out";
  if (c.score === null && c.source === "github") return null;
  return c.counted && c.score !== null ? "counted" : "out";
}

/** D'où vient la note sur 100 : les termes comptés, la moyenne, la règle qui a joué. */
export function gridMath(grid: Grid): GridMath {
  const byCode = new Map(grid.criteria.map((c) => [c.code, c]));
  const ordered = formulaOrder(grid).map((code) => byCode.get(code)).filter((c): c is GridCriterion => !!c);
  const empty = grid.rule === "empty_file";
  const weights = weightsOf(grid);
  const terms = empty
    ? []
    : ordered.filter((c) => c.counted && c.score !== null).map((c) => ({ code: c.code, score: c.score!, weight: weights[c.code] }));
  const num = terms.reduce((s, x) => s + x.score * x.weight, 0);
  const den = terms.reduce((s, x) => s + x.weight, 0);
  const mean = den ? num / den : null;
  // 10 × num / den, arrondi au supérieur à ,5, en entiers (coefficients doublés) comme le moteur.
  const raw = den ? Math.floor((20 * num * 2 + den * 2) / (2 * den * 2)) : null;
  const excluded = ordered
    .map((c) => ({ code: c.code, why: empty ? (excludedWhy(c) ?? "below") : excludedWhy(c) }))
    .filter((x): x is { code: CriterionCode; why: ExcludedWhy } => x.why !== null && (!empty || (x.why !== "below" && x.why !== "level")));
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
