// Pour les tests qui branchent un moteur figé (fiches de shared/fixtures.ts) : le
// dossier comme le rend le vrai moteur (scoring/compare.ts, scoreDossier), deux pièces
// et UNE grille. La note du dossier est ici celle de la fiche GitHub figée.

import type { Grid } from "../../../shared/types";
import type { Deps } from "../pipeline";

export function fakeDossier(
  deps: Pick<Deps, "scoreCv" | "scoreGithub">,
  declared: Parameters<Deps["scoreDossier"]>[0],
  github: Parameters<Deps["scoreDossier"]>[1],
  opts: Parameters<Deps["scoreDossier"]>[2],
): ReturnType<Deps["scoreDossier"]> {
  const { reading, counts, ...rest } = declared;
  const cv = deps.scoreCv(reading, counts, { ...opts, github: github.facts, ...rest });
  const gh = deps.scoreGithub(github.facts, github.ai, opts);
  const grid: Grid = { criteria: [], overall: gh.overall };
  return { cv, github: gh, grid };
}
