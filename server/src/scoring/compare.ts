// Un dossier à deux pièces (SPEC §6.5, §18.36, §18.82) : une personne, un calcul, une note.
// Le moteur reçoit tout ce qu'on sait de la personne, la pièce déclarative (CV ou
// LinkedIn) et la pièce GitHub, et sort UNE grille et UNE note (grid.ts, dossierGrid).
// Il n'existe pas de note par source : les deux pièces rangées ne portent ni grille ni
// note à elles, seulement ce qui se montre d'une source (chefs d'accusation, profil,
// preuves), et la note du dossier, la même partout.

import type { CodeReadingResult, CvReading, CvTextCounts } from "../../../shared/readings";
import type { CardData, Grid, Lang } from "../../../shared/types";
import type { GithubFacts } from "../github/facts";
import { GRID } from "./config";
import { scoreCv } from "./cv";
import { deriveGithub } from "./derive";
import type { HighBarList } from "./employers";
import { scoreGithub } from "./github";
import { declaredInput, dossierGrid, type DeclaredProfile } from "./grid";

type Piece = Omit<CardData, "id" | "createdAt">;

/** La pièce déclarative d'un dossier : ce que LinkedIn ou le CV a donné à lire. */
export interface DeclaredPiece {
  reading: CvReading;
  counts: CvTextCounts;
  /** Le profil LinkedIn rangé (postes datés, formation, compétences). Absent : un CV. */
  linkedin?: DeclaredProfile;
  /** « Maintenant » (ISO) : la fin d'un poste en cours. Défaut : la collecte GitHub. */
  now?: string;
  highBar?: HighBarList;
}

/** La pièce GitHub d'un dossier : les faits collectés et la lecture du code par l'IA. */
export interface GithubPiece {
  facts: GithubFacts;
  ai: CodeReadingResult | null;
}

/** La part des coefficients que GitHub prouve au dossier : sous le quart, la pièce GitHub est trop mince pour juger. */
function githubJudged(grid: Grid): boolean {
  const w2 = (c: Grid["criteria"][number]) => Math.round(GRID.weights[c.code] * 2);
  const total2 = grid.criteria.reduce((s, c) => s + w2(c), 0);
  const proven2 = grid.criteria.filter((c) => c.proven != null).reduce((s, c) => s + w2(c), 0);
  return proven2 >= GRID.final.emptyBelowShare * total2;
}

/**
 * Le dossier d'une personne dont on a les deux pièces : la grille et la note, calculées
 * une fois sur les données brutes, et les deux pièces sans note à elles.
 */
export function scoreDossier(declared: DeclaredPiece, github: GithubPiece, opts: { lang: Lang; judgedInSeconds: number }): { cv: Piece; github: Piece; grid: Grid } {
  const { facts, ai } = github;
  const nowIso = declared.now ?? facts.collectedAt;
  const now = nowIso && !Number.isNaN(Date.parse(nowIso)) ? Date.parse(nowIso) : Date.now();
  const grid = dossierGrid({
    declared: declaredInput(declared.reading, { profile: declared.linkedin, now, ...(declared.highBar ? { highBar: declared.highBar } : {}) }),
    github: { facts, m: deriveGithub(facts), ai },
  });
  const cv = scoreCv(declared.reading, declared.counts, {
    ...opts,
    github: facts,
    ...(declared.linkedin ? { linkedin: declared.linkedin } : {}),
    ...(declared.now ? { now: declared.now } : {}),
    ...(declared.highBar ? { highBar: declared.highBar } : {}),
    dossier: grid,
  });
  const gh = scoreGithub(facts, ai, { ...opts, dossier: grid });
  return { cv, github: githubJudged(grid) ? gh : { ...gh, unjudged: true }, grid };
}
