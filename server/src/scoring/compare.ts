// Un dossier à deux pièces (SPEC §6.5, §18.36) : la pièce déclarative (CV ou
// LinkedIn) et la pièce GitHub, rangées telles quelles, et la note du dossier :
// chaque critère de la grille pris sur sa source de preuve (§18.37). Le moteur ne
// produit plus d'écart : ni écarts stat par stat, ni titre, ni profil revu.

import type { CardData, ComparisonData } from "../../../shared/types";
import { caseGrid } from "./grid";

export function compareCards(cv: CardData, github: CardData): Omit<ComparisonData, "id" | "createdAt"> {
  // Fiches d'avant 0.4.0 (cache de 24 h) : pas de grille, pas de note du dossier.
  const grid = cv.grid && github.grid ? caseGrid(cv.grid, github.grid) : undefined;
  return { cv, github, ...(grid ? { grid } : {}) };
}
