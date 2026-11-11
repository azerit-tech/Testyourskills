// Comparaison CV contre GitHub (SPEC §6.5) : delta par stat, titre par règle, le
// profil criminel revu avec l'écart entre les deux fiches (§18.2, Faussaire), et la
// note du dossier : chaque critère de la grille pris sur sa source de preuve (§18.37).

import type { CardData, ComparisonData, StatCode } from "../../../shared/types";
import { STAT_CODES } from "../../../shared/types";
import { valuesOf } from "./common";
import { caseGrid } from "./grid";
import { ownHeadline } from "../../../shared/compareText";
import { profileWithComparison, type ProfileCtx } from "./profiles";

export function compareCards(cv: CardData, github: CardData): Omit<ComparisonData, "id" | "createdAt"> {
  const value = (c: CardData, code: StatCode) => c.stats.find((s) => s.code === code)?.value ?? 0;
  // Les deux fiches décrivent la même personne : l'écart vaut pour l'une comme pour l'autre.
  // Un GitHub vide (« dossier vide », note plancher) ne prouve rien : un GitHub vide n'est pas
  // un mauvais code (§18.37). Son écart avec le CV ne fait pas un Faussaire, ne se chiffre pas
  // dans le titre, et ne se lit pas comme une perte barre par barre : écarts à zéro (le contrat
  // n'a pas de « non comparable », le front le lit sur `github.grid.rule`).
  const githubEmpty = github.grid?.rule === "empty_file";
  const deltas = Object.fromEntries(STAT_CODES.map((c) => [c, githubEmpty ? 0 : value(github, c) - value(cv, c)])) as Record<StatCode, number>;
  // Le titre de l'écart : la formulation du site (shared/compareText.ts), écrite pour un CV ;
  // une comparaison LinkedIn le réécrit à la sortie (shared/linkedinText.ts). Le front le recalcule.
  const headline = { fr: ownHeadline({ cv, github }, "fr"), en: ownHeadline({ cv, github }, "en") };
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
    headline,
    ...(grid ? { grid } : {}),
  };
}
