// Comparaison CV contre GitHub (SPEC §6.5) : delta par stat, titre par règle, le
// profil criminel revu avec l'écart entre les deux fiches (§18.2, Faussaire), et la
// note du dossier : chaque critère de la grille pris sur sa source de preuve (§18.37).

import type { CardData, ComparisonData, StatCode } from "../../../shared/types";
import { STAT_CODES } from "../../../shared/types";
import { valuesOf } from "./common";
import { caseGrid } from "./grid";
import { STATUSES } from "./config";
import { profileWithComparison, type ProfileCtx } from "./profiles";
import { fillTemplate } from "./statuses";

export function compareCards(cv: CardData, github: CardData): Omit<ComparisonData, "id" | "createdAt"> {
  const value = (c: CardData, code: StatCode) => c.stats.find((s) => s.code === code)?.value ?? 0;
  const deltas = Object.fromEntries(STAT_CODES.map((c) => [c, value(github, c) - value(cv, c)])) as Record<StatCode, number>;
  const n = cv.overall - github.overall;
  const tpl = n > 0 ? STATUSES.comparison.cvAhead : n < 0 ? STATUSES.comparison.codeAhead : STATUSES.comparison.even;
  const vars = { n: Math.abs(n) };
  // Les deux fiches décrivent la même personne : l'écart vaut pour l'une comme pour l'autre.
  // Un GitHub vide (« dossier vide », note plancher) ne prouve rien : son écart avec le CV ne fait pas un Faussaire.
  const githubEmpty = github.grid?.rule === "empty_file";
  const comparison: ProfileCtx["comparison"] = { cvOverall: cv.overall, githubOverall: github.overall, cvBuzz: value(cv, "BUZZ"), ...(githubEmpty ? { githubEmpty } : {}) };
  const withProfile = (c: CardData): CardData => {
    const profile = profileWithComparison(c.profile, { stats: valuesOf(c.stats), comparison });
    return profile === c.profile ? c : { ...c, profile };
  };
  // Fiches d'avant 0.4.0 (cache de 24 h) : pas de grille, pas de note du dossier.
  const grid = cv.grid && github.grid ? caseGrid(cv.grid, github.grid) : undefined;
  return {
    cv: withProfile(cv),
    github: withProfile(github),
    deltas,
    headline: { fr: fillTemplate(tpl.fr, vars, "fr")!, en: fillTemplate(tpl.en, vars, "en")! },
    ...(grid ? { grid } : {}),
  };
}
