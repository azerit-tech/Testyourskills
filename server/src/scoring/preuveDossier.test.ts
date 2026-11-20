// Barème 0.8.0 (SPEC §18.124) : au dossier, GitHub ne fait que monter, et un GitHub prouvé
// et actif ajoute de 3 à 5 points. Le cas d'origine : Florent, LinkedIn seul 73, puis son
// dossier avec un GitHub de 19 dépôts, 74 (exact 75 puis 72 : le GitHub faisait baisser la
// moyenne, l'aléa le cachait). Ses critères rangés en production, tels quels.

import { describe, expect, it } from "vitest";
import type { CodeReadingResult, CvReading } from "../../../shared/readings";
import type { CriterionCode, GridCriterion, GridSeniority } from "../../../shared/types";
import employersExample from "../../../data/employers.example.json";
import type { GithubFacts } from "../github/facts";
import { GRID } from "./config";
import { deriveGithub } from "./derive";
import { parseEmployers, type HighBarList } from "./employers";
import { declaredGrid, declaredInput, dossierGrid, finalize } from "./grid";
import { jacquesDossier, lumineDossier } from "./__fixtures__/dossiers";
import * as L from "./__fixtures__/levels";
import { useTestSchools } from "./__fixtures__/schools";

useTestSchools();

type Stored = Omit<GridCriterion, "counted" | "reached" | "flags">;
const draft = (c: Stored) => ({ ...c, reached: { fr: "", en: "" }, flags: [] });
const STUDENT: GridSeniority = { code: "student", months: 9, source: "linkedin" };

/** UPtWIsLmtS : sa fiche LinkedIn seule, née d'une dénonciation (73 affiché). */
const FLORENT_LINKEDIN: Stored[] = [
  { code: "EDU", score: 8, state: "scored", source: "linkedin" },
  { code: "XP", score: 2, state: "scored", source: "linkedin" },
  { code: "EMP", score: 7, state: "scored", source: "linkedin" },
  { code: "STK", score: null, state: "missing", source: "linkedin" },
  { code: "CODE", score: null, state: "unproven", source: "linkedin" },
  { code: "ACT", score: null, state: "unproven", source: "linkedin" },
  { code: "OWN", score: null, state: "missing", source: "linkedin" },
  { code: "OSS", score: null, state: "unproven", source: "linkedin" },
];

/** TDm4QYDjj4 : son dossier LinkedIn + GitHub (74 affiché sous 0.7.0). */
const FLORENT_DOSSIER: Stored[] = [
  { code: "EDU", score: 8, state: "scored", source: "linkedin", declared: 8, proven: null },
  { code: "XP", score: 2, state: "scored", source: "linkedin", declared: 2, proven: 3 },
  { code: "EMP", score: 7, state: "scored", source: "linkedin", declared: 7, proven: null },
  { code: "STK", score: 7, state: "scored", source: "github", declared: null, proven: 7, bonus: 1 },
  { code: "CODE", score: 5, state: "scored", source: "github", declared: null, proven: 5, bonus: 1 },
  { code: "ACT", score: 5, state: "scored", source: "github", declared: null, proven: 5, bonus: 1 },
  { code: "OWN", score: 7, state: "scored", source: "github", declared: null, proven: 7, bonus: 1 },
  { code: "OSS", score: 0, state: "scored", source: "github", declared: null, proven: 0 },
];

const counted = (g: { criteria: GridCriterion[] }) => g.criteria.filter((c) => c.counted).map((c) => c.code);

describe("Florent : son GitHub ne fait plus baisser son dossier, il le fait monter", () => {
  const linkedin = finalize(FLORENT_LINKEDIN.map(draft), STUDENT);
  const dossier = finalize(FLORENT_DOSSIER.map(draft), STUDENT);

  it("LinkedIn seul 75 (exact) ; le dossier 78 : sa pièce LinkedIn, plus la preuve, +3 (72 sous 0.7.0)", () => {
    expect(linkedin.overall).toBe(75);
    expect(linkedin.githubBonus).toBeUndefined();
    expect(dossier.overall).toBe(78);
    expect(dossier.githubBonus).toBe(3);
    expect(dossier.overall).toBeGreaterThanOrEqual(linkedin.overall + dossier.githubBonus!);
    expect(dossier.rule).toBeUndefined();
  });

  it("stack, code, activité, ownership sous sa moyenne LinkedIn : hors moyenne, sans la faire baisser", () => {
    expect(counted(dossier)).toEqual(["EDU", "EMP"]);
  });

  it("idempotent : refaite depuis ses propres critères, la note ne bouge pas", () => {
    const again = finalize(dossier.criteria.map(({ counted: _c, ...d }) => d), STUDENT);
    expect([again.overall, again.githubBonus, counted(again)]).toEqual([dossier.overall, dossier.githubBonus, counted(dossier)]);
  });

  it("le même GitHub sans activité (moins de 13 semaines actives) : aucune preuve ajoutée, et toujours rien de perdu", () => {
    const quiet = FLORENT_DOSSIER.map((c) => (c.code === "ACT" ? { ...c, score: 4, proven: 4 } : c));
    const g = finalize(quiet.map(draft), STUDENT);
    expect(g.githubBonus).toBeUndefined();
    expect(g.overall).toBe(linkedin.overall);
  });

  it("la preuve va de 3 à 5 : la moitié de la moyenne GitHub, preuve comprise", () => {
    const strong = FLORENT_DOSSIER.map((c) => (["STK", "CODE", "ACT", "OWN"].includes(c.code) ? { ...c, score: 10, proven: 10 } : c));
    expect(finalize(strong.map(draft), STUDENT).githubBonus).toBe(GRID.final.githubBonus.max);
    expect(GRID.final.githubBonus).toEqual({ minActLevel: 4, min: 3, max: 5 });
  });
});

describe("ajouter un GitHub ne fait jamais baisser une note (les dossiers de référence)", () => {
  const NOW = Date.parse(L.LEVELS_NOW);
  const HIGH_BAR: HighBarList = { employers: parseEmployers(employersExample), source: "data/employers.example.json" };
  const gh = (f: GithubFacts, ai: CodeReadingResult | null) => ({ facts: f, m: deriveGithub(f), ai });
  const pair = (reading: CvReading, profile: L.LevelProfile, facts: GithubFacts, ai: CodeReadingResult | null) => {
    const declared = declaredInput(reading, { profile, now: NOW, highBar: HIGH_BAR });
    return { linkedin: declaredGrid(declared), dossier: dossierGrid({ declared, github: gh(facts, ai) }) };
  };
  const cases: [string, { linkedin: { overall: number }; dossier: { overall: number; githubBonus?: number } }, number][] = [
    ["(a) stage très sélectif, GitHub correct et actif", pair(L.studentReading(), L.internProfile("Fictiva Labs"), L.studentFacts(), L.STUDENT_AI), 3],
    ["(b) stage ordinaire, même GitHub", pair(L.studentReading(), L.internProfile("Conseil Grand Large"), L.studentFacts(), L.STUDENT_AI), 3],
    ["(c) douze ans, GitHub médiocre et peu actif", pair(L.plainSeniorReading(), L.plainSeniorProfile(), L.mediocreFacts(), L.MEDIOCRE_AI), 0],
    ["(d) commits de cours, trop minces", pair(L.engineeringStudentReading(), L.engineeringStudentProfile(), L.courseworkFacts(), L.COURSEWORK_AI), 0],
    ["Jacques", { linkedin: jacquesDossier().linkedin, dossier: jacquesDossier().cmp.grid! }, 4],
    ["Lumine, GitHub trop mince", { linkedin: lumineDossier().linkedin, dossier: lumineDossier().cmp.grid! }, 0],
  ];
  for (const [label, { linkedin, dossier }, bonus] of cases) {
    it(`${label} : dossier ≥ LinkedIn seul + ${bonus}`, () => {
      expect(dossier.githubBonus ?? 0).toBe(bonus);
      expect(dossier.overall).toBeGreaterThanOrEqual(linkedin.overall + bonus);
    });
  }

  it("une pièce seule n'a jamais de preuve de dossier", () => {
    const codes: CriterionCode[] = ["STK", "CODE", "ACT", "OWN"];
    const githubOnly = FLORENT_DOSSIER.map(({ declared: _d, proven: _p, ...c }) => (codes.includes(c.code) ? c : { ...c, score: null }));
    expect(finalize(githubOnly.map(draft), STUDENT).githubBonus).toBeUndefined();
  });
});
