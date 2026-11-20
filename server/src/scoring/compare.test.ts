// Une personne, un dossier, un calcul, une note (§6.5, §18.36, SPEC §18.84). Le garde-fou
// du moteur : un dossier à deux pièces sort UNE grille et UNE note, ses pièces n'en ont
// aucune à elles, et tout ce qui peut se lire d'un dossier donne le même chiffre.

import { describe, expect, it } from "vitest";
import { caseCard, codeJudged, fileOf } from "../../../shared/caseFile";
import { asLinkedinComparison } from "../../../shared/linkedinText";
import { publicView } from "../../../shared/publicView";
import { starsFor, tierFor, type ComparisonData } from "../../../shared/types";
import { FOUNDERS_NOW, JACQUES_AI, jacquesFacts, jacquesProfile, jacquesReading } from "./__fixtures__/founders";
import { jacquesDossier, lumineDossier } from "./__fixtures__/dossiers";
import { cvCounts } from "./__fixtures__/make";
import { deriveGithub } from "./derive";
import { declaredInput, dossierGrid } from "./grid";
import { scoreDossier } from "./index";
import { useTestSchools } from "./__fixtures__/schools";

// Jamais la vraie liste des écoles : celles des lectures d'exemple, puis l'exemple aux écoles inventées.
useTestSchools();

const DOSSIERS = [["Jacques", jacquesDossier], ["Lumine (GitHub vide)", lumineDossier]] as const;
const full = (cmp: Omit<ComparisonData, "id" | "createdAt">): ComparisonData => ({ ...asLinkedinComparison(cmp), id: "dossier", createdAt: FOUNDERS_NOW });

/** Tous les endroits d'un dossier où une note peut se lire, pour la personne comme pour le public. */
function notesOf(cmp: ComparisonData): number[] {
  const views = [cmp, publicView(cmp, { thirdParty: false })];
  return views.flatMap((v) => [v.cv.overall, v.github.overall, fileOf(v).overall, caseCard(v).overall, ...(v.grid ? [v.grid.overall] : []), ...(v.file ? [v.file.overall] : [])]);
}

/** Toute clé `overall` ou `grid` rangée dans l'objet, avec son chemin : rien ne doit en cacher une autre. */
function walk(x: unknown, path = ""): { path: string; key: string; value: unknown }[] {
  if (!x || typeof x !== "object") return [];
  return Object.entries(x as Record<string, unknown>).flatMap(([k, v]) => [
    ...(k === "overall" || k === "grid" || k === "rank" ? [{ path: `${path}.${k}`, key: k, value: v }] : []),
    ...(k === "grid" ? [] : walk(v, `${path}.${k}`)),
  ]);
}

describe("garde-fou : une personne, une note", () => {
  for (const [name, make] of DOSSIERS) {
    it(`${name} : une grille, au dossier ; aucune pièce n'a de grille, de rang ni de note à elle`, () => {
      const cmp = full(make().cmp);
      expect(cmp.grid).toBeDefined();
      const found = walk(cmp);
      // Une seule grille dans tout ce qui est rangé : celle du dossier.
      expect(found.filter((f) => f.key === "grid").map((f) => f.path)).toEqual([".grid"]);
      expect(found.filter((f) => f.key === "rank")).toEqual([]);
      // Toute note rangée est celle du dossier.
      for (const f of found.filter((x) => x.key === "overall")) expect(f.value, f.path).toBe(cmp.grid!.overall);
      for (const piece of [cmp.cv, cmp.github]) {
        expect(piece.tier).toBe(tierFor(cmp.grid!.overall));
        expect(starsFor(piece.overall)).toBe(starsFor(cmp.grid!.overall));
      }
    });

    it(`${name} : la fiche, la vue publique, les pièces et la grille donnent le même chiffre`, () => {
      const cmp = full(make().cmp);
      expect(new Set(notesOf(cmp))).toEqual(new Set([cmp.grid!.overall]));
      // Un dossier fait par un tiers : la grille ne part pas, la note qui reste est la même.
      const third = publicView(cmp, { thirdParty: true });
      expect(third.grid).toBeUndefined();
      const shown = [third.cv, third.github, fileOf(third)].filter((c) => !c.sealed).map((c) => c.overall);
      expect(new Set(shown).size).toBeLessThanOrEqual(1);
      for (const n of shown) expect(n).toBe(cmp.grid!.overall);
    });
  }

  it("la note du dossier se calcule une fois, sur les données brutes des deux pièces", () => {
    const now = Date.parse(FOUNDERS_NOW);
    const facts = jacquesFacts();
    const direct = dossierGrid({
      declared: declaredInput(jacquesReading(), { profile: jacquesProfile(), now }),
      github: { facts, m: deriveGithub(facts), ai: JACQUES_AI },
    });
    const scored = scoreDossier({ reading: jacquesReading(), counts: cvCounts(), linkedin: jacquesProfile(), now: FOUNDERS_NOW }, { facts, ai: JACQUES_AI }, { lang: "fr", judgedInSeconds: 6 });
    expect(scored.grid).toEqual(direct);
    // Les pièces sortent du moteur sans grille : il n'existe pas de note GitHub ni de note LinkedIn à recouper.
    expect([scored.cv.grid, scored.github.grid]).toEqual([undefined, undefined]);
    expect([scored.cv.overall, scored.github.overall]).toEqual([direct.overall, direct.overall]);
    // Un dossier sans pièce n'existe pas.
    expect(() => dossierGrid({})).toThrow();
  });

  it("une fiche à une seule source est un dossier à une pièce : même moteur, une grille, une note", () => {
    const now = Date.parse(FOUNDERS_NOW);
    const facts = jacquesFacts();
    const { github, linkedin } = jacquesDossier();
    expect(github.grid).toEqual(dossierGrid({ github: { facts, m: deriveGithub(facts), ai: JACQUES_AI } }));
    expect(linkedin.grid).toEqual(dossierGrid({ declared: declaredInput(jacquesReading(), { profile: jacquesProfile(), now }) }));
    for (const c of [github, linkedin]) expect(c.overall).toBe(c.grid!.overall);
  });
});

describe("un dossier à deux pièces : aucun écart, aucun titre", () => {
  for (const [name, make] of DOSSIERS) {
    it(`${name} : ni écarts, ni titre ; chaque pièce garde ce qui se montre de sa source`, () => {
      const { cmp, github, linkedin } = make();
      expect(cmp).not.toHaveProperty("deltas");
      expect(cmp).not.toHaveProperty("headline");
      // Le profil et le nom : ceux de la pièce, que la personne ait une pièce ou deux.
      expect([cmp.github.profile?.id, cmp.github.login, cmp.github.name]).toEqual([github.profile?.id, github.login, github.name]);
      expect(cmp.cv.profile?.id).toBe(linkedin.profile?.id);
      expect(cmp.github.profile?.id).not.toBe("forger");
      expect(cmp.cv.statuses.filter((s) => s.tone === "gap")).toEqual([]);
      const li = asLinkedinComparison(cmp);
      expect(li).not.toHaveProperty("headline");
      expect(li.declaredSource).toBe("linkedin");
    });
  }

  it("Jacques : la note du dossier, 80 (72 sous 0.5.0, la preuve +1) ; Lumine : 75 (66, les mois de fondatrice cumulés), code non prouvé, pièce GitHub trop mince pour juger", () => {
    const j = jacquesDossier().cmp;
    expect(j.grid!.overall).toBe(80);
    expect(j.github.unjudged).toBeUndefined();
    expect(codeJudged(j)).toBe(true);
    const l = lumineDossier().cmp;
    expect(l.grid!.overall).toBe(75);
    expect(l.grid!.rule).toBe("capped_unproven");
    expect(l.github.unjudged).toBe(true);
    expect(codeJudged(l)).toBe(false);
  });
});
