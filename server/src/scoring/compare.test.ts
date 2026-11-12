// Un dossier à deux pièces (§6.5, §18.36) : le moteur range les deux pièces telles
// quelles et calcule la note du dossier ; plus d'écart, ni de titre, ni de profil revu.

import { describe, expect, it } from "vitest";
import { asLinkedinComparison } from "../../../shared/linkedinText";
import type { CardData } from "../../../shared/types";
import { cvCounts } from "./__fixtures__/make";
import { FOUNDERS_NOW, JACQUES_AI, jacquesFacts, jacquesProfile, jacquesReading, lumineFacts, lumineProfile, lumineReading } from "./__fixtures__/founders";
import { compareCards, scoreCv, scoreGithub } from "./index";

const opts = { lang: "fr" as const, judgedInSeconds: 6 };
const card = <T extends object>(c: T, id: string) => ({ ...c, id, createdAt: FOUNDERS_NOW }) as unknown as CardData;

function lumine() {
  const github = card(scoreGithub(lumineFacts(), null, opts), "gh");
  const linkedin = card(scoreCv(lumineReading(), cvCounts(), { ...opts, linkedin: lumineProfile(), now: FOUNDERS_NOW, github: lumineFacts() }), "li");
  return { github, linkedin };
}

function jacques() {
  const github = card(scoreGithub(jacquesFacts(), JACQUES_AI, opts), "gh");
  const linkedin = card(scoreCv(jacquesReading(), cvCounts(), { ...opts, linkedin: jacquesProfile(), now: FOUNDERS_NOW, github: jacquesFacts() }), "li");
  return { github, linkedin };
}

describe("un dossier à deux pièces : les pièces telles quelles, la note du dossier, aucun écart", () => {
  for (const [name, make] of [["Jacques", jacques], ["Lumine (GitHub vide)", lumine]] as const) {
    it(`${name} : ni écarts, ni titre ; chaque pièce garde son profil`, () => {
      const { github, linkedin } = make();
      const cmp = compareCards(linkedin, github);
      expect(cmp).not.toHaveProperty("deltas");
      expect(cmp).not.toHaveProperty("headline");
      expect(cmp.cv).toBe(linkedin);
      expect(cmp.github).toBe(github);
      expect(cmp.grid).toBeDefined();
      const li = asLinkedinComparison(cmp);
      expect(li).not.toHaveProperty("headline");
      expect(li.declaredSource).toBe("linkedin");
    });
  }

  it("Jacques : la note du dossier, 57 ; Lumine : 45, code non prouvé", () => {
    expect(compareCards(jacques().linkedin, jacques().github).grid!.overall).toBe(57);
    const l = compareCards(lumine().linkedin, lumine().github).grid!;
    expect(l.overall).toBe(45);
    expect(l.rule).toBe("capped_unproven");
  });

  it("un écart de 15 points ou plus ne range plus aucune pièce « Sous couverture »", () => {
    const { github, linkedin } = jacques();
    const cmp = compareCards({ ...linkedin, overall: github.overall + 30 }, github);
    expect(cmp.github.profile?.id).toBe(github.profile?.id);
    expect(cmp.cv.profile?.id).toBe(linkedin.profile?.id);
    expect(cmp.github.profile?.id).not.toBe("forger");
  });

  it("la pièce déclarative d'un dossier ne porte plus de statut d'écart", () => {
    for (const make of [jacques, lumine]) expect(make().linkedin.statuses.filter((s) => s.tone === "gap")).toEqual([]);
  });

  it("sans grille (pièces d'avant 0.4.0) : pas de note du dossier", () => {
    const { github, linkedin } = jacques();
    const { grid: _g, ...bare } = linkedin;
    expect(compareCards(bare as CardData, github)).not.toHaveProperty("grid");
  });
});
