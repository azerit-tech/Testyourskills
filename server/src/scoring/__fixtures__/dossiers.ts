// Les dossiers des deux fondateurs, tels que le pipeline les range (SPEC §18.82) :
// un calcul sur les deux pièces (scoreDossier), une grille, une note, et deux pièces
// sans note à elles (asPieces). À côté, pour comparer : la même personne avec une seule
// de ses pièces, qui est alors un dossier à une pièce.

import type { CodeReadingResult, CvReading } from "../../../../shared/readings";
import type { CardData, ComparisonData } from "../../../../shared/types";
import type { GithubFacts } from "../../github/facts";
import { asPieces } from "../../pipeline";
import type { DeclaredProfile } from "../grid";
import { scoreCv, scoreDossier, scoreGithub } from "../index";
import { FOUNDERS_NOW, JACQUES_AI, jacquesFacts, jacquesProfile, jacquesReading, lumineFacts, lumineProfile, lumineReading } from "./founders";
import { cvCounts } from "./make";

const opts = { lang: "fr" as const, judgedInSeconds: 6 };
const card = <T extends object>(c: T, id: string) => ({ ...c, id, createdAt: FOUNDERS_NOW }) as unknown as CardData;

export interface TestDossier {
  /** La personne avec sa seule pièce GitHub : un dossier à une pièce. */
  github: CardData;
  /** La personne avec sa seule pièce LinkedIn : un dossier à une pièce. */
  linkedin: CardData;
  /** Son dossier à deux pièces : la seule note. */
  cmp: Omit<ComparisonData, "id" | "createdAt">;
}

export function dossierOf(reading: CvReading, linkedin: DeclaredProfile | undefined, facts: GithubFacts, ai: CodeReadingResult | null, now: string = FOUNDERS_NOW): TestDossier {
  const declared = { reading, counts: cvCounts(), ...(linkedin ? { linkedin } : {}), now };
  const scored = scoreDossier(declared, { facts, ai }, opts);
  return {
    github: card(scoreGithub(facts, ai, opts), "gh-seul"),
    linkedin: card(scoreCv(reading, cvCounts(), { ...opts, ...(linkedin ? { linkedin } : {}), now }), "li-seul"),
    cmp: asPieces(scored, { cv: { id: "li", createdAt: FOUNDERS_NOW }, github: { id: "gh", createdAt: FOUNDERS_NOW } }),
  };
}

export const jacquesDossier = (): TestDossier => dossierOf(jacquesReading(), jacquesProfile(), jacquesFacts(), JACQUES_AI);
export const lumineDossier = (): TestDossier => dossierOf(lumineReading(), lumineProfile(), lumineFacts(), null);
