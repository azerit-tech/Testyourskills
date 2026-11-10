// Barème 0.4.0 (docs/bareme-recrutement.md §8) : la note de chaque fiche est celle de
// la grille, et la comparaison porte la note du dossier. Vérifié sur les deux fondateurs,
// par les fonctions de fiche elles-mêmes (scoreGithub, scoreCv, compareCards).

import { describe, expect, it } from "vitest";
import type { CardData } from "../../../shared/types";
import { cvCounts } from "./__fixtures__/make";
import {
  FOUNDERS_NOW,
  JACQUES_AI,
  jacquesFacts,
  jacquesProfile,
  jacquesReading,
  lumineFacts,
  lumineProfile,
  lumineReading,
} from "./__fixtures__/founders";
import { compareCards, scoreCv, scoreGithub } from "./index";

const opts = { lang: "fr" as const, judgedInSeconds: 6 };
const card = <T extends object>(c: T, id: string) => ({ ...c, id, createdAt: FOUNDERS_NOW }) as unknown as CardData;

function jacques() {
  const github = scoreGithub(jacquesFacts(), JACQUES_AI, opts);
  const linkedin = scoreCv(jacquesReading(), cvCounts(), { ...opts, linkedin: jacquesProfile(), now: FOUNDERS_NOW, github: jacquesFacts() });
  return { github, linkedin, cmp: compareCards(card(linkedin, "li"), card(github, "gh")) };
}

function lumine() {
  const github = scoreGithub(lumineFacts(), null, opts);
  const linkedin = scoreCv(lumineReading(), cvCounts(), { ...opts, linkedin: lumineProfile(), now: FOUNDERS_NOW, github: lumineFacts() });
  return { github, linkedin, cmp: compareCards(card(linkedin, "li"), card(github, "gh")) };
}

describe("les fiches prennent la note de la grille", () => {
  it("Jacques : LinkedIn 41, GitHub 61, dossier 57 (à un point près)", () => {
    const { github, linkedin, cmp } = jacques();
    expect(Math.abs(linkedin.overall - 41)).toBeLessThanOrEqual(1);
    expect(Math.abs(github.overall - 61)).toBeLessThanOrEqual(1);
    expect(Math.abs(cmp.grid!.overall - 57)).toBeLessThanOrEqual(1);
    expect(linkedin.overall).toBe(linkedin.grid!.overall);
    expect(github.overall).toBe(github.grid!.overall);
  });

  it("Lumine : LinkedIn 45, GitHub 20, dossier 45 (à un point près)", () => {
    const { github, linkedin, cmp } = lumine();
    expect(Math.abs(linkedin.overall - 45)).toBeLessThanOrEqual(1);
    expect(github.overall).toBe(20);
    expect(github.grid!.rule).toBe("empty_file");
    expect(Math.abs(cmp.grid!.overall - 45)).toBeLessThanOrEqual(1);
    expect(cmp.grid!.rule).toBe("capped_unproven");
  });

  it("la barre XP est le critère Expérience × 10", () => {
    const { github, linkedin } = jacques();
    const xp = (c: typeof github) => c.stats.find((s) => s.code === "XP")!;
    const crit = (c: typeof github) => c.grid!.criteria.find((x) => x.code === "XP")!;
    expect(xp(linkedin).value).toBe(crit(linkedin).score! * 10);
    expect(xp(github).value).toBe(crit(github).score! * 10);
    // Sans critère, la barre tombe au plancher et n'est pas suffisante.
    const empty = lumine().github;
    expect(crit(empty).score).toBeNull();
    expect(xp(empty).value).toBe(1);
    expect(xp(empty).sufficient).toBe(false);
  });

  it("la comparaison porte la grille du dossier, chaque critère avec ses deux côtés", () => {
    const { cmp } = jacques();
    expect(cmp.grid!.criteria.map((c) => c.code)).toEqual(["EDU", "XP", "EMP", "STK", "CODE", "ACT", "OWN", "OSS"]);
    const own = cmp.grid!.criteria.find((c) => c.code === "OWN")!;
    expect(own.source).toBe("both");
    expect(own.declared).toBe(4);
    expect(own.proven).toBe(6);
    // Les fiches gardent chacune leur propre grille.
    expect(cmp.cv.grid?.overall).toBe(cmp.cv.overall);
    expect(cmp.github.grid?.overall).toBe(cmp.github.overall);
  });

  it("une fiche d'avant 0.4.0 (sans grille) : pas de note du dossier, pas de plantage", () => {
    const { github, linkedin } = jacques();
    const { grid: _g, ...old } = github;
    const cmp = compareCards(card(linkedin, "li"), card(old, "gh"));
    expect(cmp.grid).toBeUndefined();
  });
});
