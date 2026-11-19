// Un dossier à deux pièces (SPEC §6.5, §18.36) : la pièce déclarative (CV ou
// LinkedIn) et la pièce GitHub, rangées telles quelles, et la note du dossier :
// chaque critère de la grille pris sur sa source de preuve (§18.37). Le moteur ne
// produit plus d'écart : ni écarts stat par stat, ni titre, ni profil revu.

import { declaredOf, type CardData, type ComparisonData } from "../../../shared/types";
import type { GithubFacts } from "../github/facts";
import { caseGrid, githubGridAt } from "./grid";

/**
 * `label` : la pièce déclarative, « LinkedIn » ou « CV » (défaut : lue sur la fiche déclarative).
 * `githubFacts` : les faits de la pièce GitHub. Avec eux, la stack et l'ownership du dossier se
 * lisent au niveau d'expérience des postes datés (barème 0.5.0), et non à celui que GitHub estime.
 */
export function compareCards(
  cv: CardData,
  github: CardData,
  label: "LinkedIn" | "CV" = declaredOf(cv) === "linkedin" ? "LinkedIn" : "CV",
  githubFacts?: unknown,
): Omit<ComparisonData, "id" | "createdAt"> {
  // Fiches d'avant 0.4.0 (cache de 24 h) : pas de grille, pas de note du dossier.
  if (!cv.grid || !github.grid) return { cv, github };
  const level = cv.grid.seniority;
  const facts = githubFacts as GithubFacts | undefined;
  const relu = level && facts && Array.isArray(facts.repos) && github.grid.seniority?.code !== level.code;
  const proven = relu ? githubGridAt(github.grid, facts, level) : github.grid;
  return { cv, github, grid: caseGrid(cv.grid, proven, label) };
}
