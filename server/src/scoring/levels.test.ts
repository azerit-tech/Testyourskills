// Barème 0.5.0 (SPEC §18.82) : la note dit « quel niveau pour cette expérience ».
// Les dossiers de référence (__fixtures__/levels.ts), de bout en bout : la fiche
// LinkedIn seule, la fiche GitHub seule, et le dossier à deux pièces : un seul calcul
// (dossierGrid), au niveau d'expérience des postes datés.
//
// Les notes « sous 0.4.0 » ont été mesurées en faisant tourner les mêmes dossiers sur
// le moteur d'avant (commit 478ab52) ; note du dossier, avant → après :
//   (a) 38 → 69    (b) 38 → 55    (c) 53 → 43    (d) 32 → 70 (de bons stages), 32 → 60
// Sous 0.4.0, (a) et (b) avaient la même note, et (c) passait devant par ses années.

import { describe, expect, it } from "vitest";
import { starsFor, type CriterionCode, type Grid } from "../../../shared/types";
import type { CodeReadingResult, CvReading } from "../../../shared/readings";
import type { GithubFacts } from "../github/facts";
import employersExample from "../../../data/employers.example.json";
import { GRID } from "./config";
import { deriveGithub } from "./derive";
import { parseEmployers, type HighBarList } from "./employers";
import { declaredGrid, declaredInput, dossierGrid, githubGrid, ownTable, stkTable } from "./grid";
import {
  COURSEWORK_AI,
  LEVELS_NOW,
  MEDIOCRE_AI,
  STUDENT_AI,
  courseworkFacts,
  engineeringStudentProfile,
  engineeringStudentReading,
  internProfile,
  mediocreFacts,
  plainSeniorProfile,
  plainSeniorReading,
  studentFacts,
  studentReading,
  type LevelProfile,
} from "./__fixtures__/levels";
import { useTestSchools } from "./__fixtures__/schools";

useTestSchools();

const NOW = Date.parse(LEVELS_NOW);
const HIGH_BAR: HighBarList = { employers: parseEmployers(employersExample), source: "data/employers.example.json" };
const gh = (f: GithubFacts, ai: CodeReadingResult | null = null) => ({ facts: f, m: deriveGithub(f), ai });
const scores = (g: Grid) => Object.fromEntries(g.criteria.map((c) => [c.code, c.score])) as Record<CriterionCode, number | null>;
const crit = (g: Grid, code: CriterionCode) => g.criteria.find((c) => c.code === code)!;

/** La personne avec une seule de ses pièces (un dossier à une pièce), et son dossier à deux pièces : un calcul, une note. */
function file(reading: CvReading, profile: LevelProfile, facts: GithubFacts, ai: CodeReadingResult | null) {
  const declared = declaredInput(reading, { profile, now: NOW, highBar: HIGH_BAR });
  const linkedin = declaredGrid(declared);
  const github = githubGrid(gh(facts, ai));
  const dossier = dossierGrid({ declared, github: gh(facts, ai) });
  return { linkedin, github, dossier };
}

describe("la note dit « quel niveau pour cette expérience » (barème 0.5.0)", () => {
  const a = file(studentReading(), internProfile("Fictiva Labs"), studentFacts(), STUDENT_AI);
  const b = file(studentReading(), internProfile("Conseil Grand Large"), studentFacts(), STUDENT_AI);
  const c = file(plainSeniorReading(), plainSeniorProfile(), mediocreFacts(), MEDIOCRE_AI);

  it("(a) un stage de six mois chez un employeur très sélectif et un GitHub correct : quatre étoiles (deux sous 0.4.0)", () => {
    expect(a.dossier.seniority).toEqual({ code: "student", months: 3, source: "linkedin" });
    expect(scores(a.dossier)).toEqual({ EDU: 6, XP: 2, EMP: 10, STK: 6, CODE: 6, ACT: 4, OWN: 6, OSS: 0 });
    // (10 × 2,5 + 6 × 2 + 6 × 1,5 + 6 × 1,5 + 4) ÷ 8,5 = 59 ÷ 8,5 = 6,94.
    expect(a.dossier.overall).toBe(69);
    expect(starsFor(a.dossier.overall)).toBe(4);
    expect(a.linkedin.overall).toBe(85);
    expect(starsFor(a.linkedin.overall)).toBe(5);
  });

  it("(b) le même stage dans une entreprise que rien ne distingue : nettement plus bas", () => {
    expect(scores(b.dossier)).toMatchObject({ EMP: 5, STK: 6, CODE: 6, ACT: 4, OWN: 6 });
    expect(b.dossier.overall).toBe(55);
    expect(starsFor(b.dossier.overall)).toBe(3);
    expect(a.dossier.overall - b.dossier.overall).toBeGreaterThanOrEqual(10);
    expect(a.linkedin.overall - b.linkedin.overall).toBeGreaterThanOrEqual(25);
  });

  it("(c) douze ans dans le même poste et des preuves médiocres ne passent plus devant (a) par les années", () => {
    expect(c.dossier.seniority).toMatchObject({ code: "expert", source: "linkedin" });
    expect(scores(c.dossier)).toMatchObject({ XP: 10, EMP: 5, STK: 4, CODE: 4, ACT: 2, OWN: 4 });
    expect(crit(c.dossier, "XP").counted).toBe(false);
    expect(c.dossier.overall).toBe(43);
    expect(starsFor(c.dossier.overall)).toBe(2);
    expect(c.dossier.overall).toBeLessThan(b.dossier.overall);
    expect(c.linkedin.overall).toBeLessThan(a.linkedin.overall);
  });

  it("la stack et l'ownership prouvés se lisent dans la table du niveau : celle de quelqu'un qui débute, pas celle d'un senior", () => {
    // Jugée seule, la pièce GitHub est lue au niveau que GitHub estime (une année active : « Junior ») ;
    // au dossier, au niveau des postes datés (« Début de carrière »).
    expect(a.github.seniority).toEqual({ code: "junior", months: 12, source: "github" });
    expect(scores(a.github)).toMatchObject({ STK: 6, OWN: 4 });
    const relu = githubGrid(gh(studentFacts(), STUDENT_AI), a.linkedin.seniority!);
    expect(scores(relu)).toMatchObject({ STK: 6, CODE: 6, ACT: 4, OWN: 6 });
    expect(crit(relu, "STK").table).toEqual(stkTable("student"));
    expect(crit(relu, "OWN").table).toEqual(ownTable("student"));
    expect(crit(a.dossier, "STK").table).toEqual(stkTable("student"));
    // Les mêmes faits lus dans la table d'un senior : 4 et 2.
    const senior = githubGrid(gh(studentFacts(), STUDENT_AI), { code: "senior", months: 90, source: "linkedin" });
    expect(scores(senior)).toMatchObject({ STK: 4, OWN: 2 });
    // À partir du niveau confirmé, la table commune, inchangée.
    for (const code of ["mid", "senior", "expert"] as const) {
      expect(stkTable(code).map((r) => r.score)).toEqual(GRID.STK.levels.map((l) => l.score));
      expect(ownTable(code)).toEqual(ownTable("mid"));
    }
    expect(crit(relu, "OWN").reached.fr.replace(/ /g, " ")).toBe("Un projet porté 3 mois ou plus (30 commits).");
  });
});

describe("le profil type : une école d'ingénieurs, deux stages, quelques commits de cours", () => {
  const good = file(engineeringStudentReading(), engineeringStudentProfile(), courseworkFacts(), COURSEWORK_AI);
  const plain = file(engineeringStudentReading(), engineeringStudentProfile(false), courseworkFacts(), COURSEWORK_AI);

  it("de bons stages : quatre étoiles, seul comme au dossier", () => {
    expect(good.linkedin.seniority).toEqual({ code: "student", months: 4, source: "linkedin" });
    expect(scores(good.linkedin)).toMatchObject({ EDU: 6, XP: 2, EMP: 7 });
    expect(good.linkedin.overall).toBe(70);
    expect(good.dossier.overall).toBe(70);
    expect(starsFor(good.dossier.overall)).toBe(4);
  });

  it("28 commits publics ne prouvent rien, ni en bien ni en mal : trop mince pour juger, le dossier garde la note de LinkedIn", () => {
    expect(deriveGithub(courseworkFacts()).allRepoCommits).toBe(28);
    expect([good.github.overall, good.github.rule]).toEqual([20, "empty_file"]);
    for (const code of ["STK", "CODE", "ACT", "OWN"] as const) expect(crit(good.dossier, code).state).toBe("unproven");
    expect(crit(good.dossier, "STK").reached.fr).toBe("GitHub trop mince pour juger.");
    expect(good.dossier.rule).toBe("capped_unproven");
    // Avec un GitHub fourni, le même dossier est jugé sur ses preuves.
    const proven = file(engineeringStudentReading(), engineeringStudentProfile(), studentFacts(), STUDENT_AI);
    expect(crit(proven.dossier, "CODE").state).toBe("scored");
  });

  it("deux stages que rien ne distingue : 60, la note suit ce que valent les stages", () => {
    expect(scores(plain.linkedin)).toMatchObject({ EMP: 6 });
    expect(plain.dossier.overall).toBe(60);
    expect(plain.linkedin.overall).toBe(60);
  });
});
