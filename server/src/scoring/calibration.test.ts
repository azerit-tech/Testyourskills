// Barème 0.7.0 (SPEC §18.117) : « tu es trop dur, les gens avec des petits projets ne méritent pas 50 ».
// La calibration de la note, sur les critères de trois dossiers de production du 20 novembre 2026
// (les notes de chaque critère, sans rien d'autre), et sur le moteur de bout en bout pour la table
// du junior qui lit les stages.

import { describe, expect, it } from "vitest";
import { CRITERION_CODES, starsFor, type CriterionCode, type GridCriterion, type GridSeniority } from "../../../shared/types";
import employersExample from "../../../data/employers.example.json";
import { cvReading } from "./__fixtures__/make";
import { useTestSchools } from "./__fixtures__/schools";
import { parseEmployers } from "./employers";
import { declaredGrid, declaredInput, finalize, type DatedRole } from "./grid";

useTestSchools();

type Draft = Omit<GridCriterion, "counted">;
const JUNIOR: GridSeniority = { code: "junior", months: 12, source: "linkedin" };
const STUDENT: GridSeniority = { code: "student", months: 4, source: "linkedin" };

/** Une grille par ses notes, dans l'ordre EDU, XP, EMP, STK, CODE, ACT, OWN, OSS ; null : sans information. */
function drafts(scores: (number | null)[]): Draft[] {
  return CRITERION_CODES.map((code: CriterionCode, i): Draft => ({
    code,
    score: scores[i],
    state: scores[i] === null ? "unproven" : "scored",
    source: "github",
    reached: { fr: "x", en: "x" },
    flags: [],
  }));
}

describe("calibration 0.7.0 : le milieu de son niveau se lit quatre étoiles, le haut ne bouge pas", () => {
  // Étudiant d'école d'ingénieurs, 23 mois de stage (lu « Junior »), quelques petits projets Python lus 3,5 sur 5,
  // 7 semaines actives : 8, 3, 5, 3, 7, 3, 6, 0 sous 0.6.0, 53 avant l'aléa, 50 affiché.
  const smallProjects = [8, 3, 5, 3, 7, 3, 6, 0];
  // Le même dossier, son expérience lue dans la table du junior qui compte les stages (6, recoupé par le code : 7).
  const smallProjectsRead = [8, 3, 7, 3, 7, 3, 6, 0];
  // Junior, 7 mois d'entreprise fondée recoupés, GitHub fort : 77 sous 0.6.0.
  const strongGithub = [8, 3, 7, 7, 8, 9, 9, 7];
  // Junior, 21 mois d'entreprises fondées, GitHub trop mince : 80, le plafond sans code prouvé.
  const strongLinkedin = [8, 3, 8, null, null, null, 8, null];

  it("un junior aux petits projets réels : 63 et plus, quatre étoiles (53 sous 0.6.0)", () => {
    const before = finalize(drafts(smallProjects), JUNIOR).overall;
    expect(before).toBe(64);
    const read = finalize(drafts(smallProjectsRead), JUNIOR).overall;
    expect(read).toBe(69);
    for (const n of [before, read]) {
      expect(n).toBeGreaterThanOrEqual(63);
      expect(starsFor(n)).toBe(4);
    }
    // Même avec le plus mauvais aléa (−3), la note affichée reste dans 65 à 72.
    expect(read - 3).toBeGreaterThanOrEqual(65);
  });

  it("les dossiers forts bougent de 3 points au plus, et gardent leur ordre", () => {
    const g = finalize(drafts(strongGithub), JUNIOR);
    const l = finalize(drafts(strongLinkedin), JUNIOR);
    expect(g.overall).toBe(77);
    expect(l.overall).toBe(80);
    expect(l.rule).toBe("capped_unproven");
    expect(g.overall).toBeLessThan(l.overall);
    expect(finalize(drafts(smallProjectsRead), JUNIOR).overall).toBeLessThan(g.overall);
    // Tous les critères à 8 ou 9 : la moyenne elle-même ; à 10, la borne 99.
    for (const n of [8, 9]) expect(finalize(drafts(CRITERION_CODES.map(() => n)), JUNIOR).overall).toBe(10 * n);
    expect(finalize(drafts(CRITERION_CODES.map(() => 10)), JUNIOR).overall).toBe(99);
  });

  it("un dossier vide ou presque reste bas : 40 au plus", () => {
    // Moins d'un quart des coefficients noté : 20.
    expect(finalize(drafts([6, 2, null, null, null, null, null, null]), STUDENT).overall).toBe(20);
    // Un seul stage, rien d'autre : 30.
    expect(finalize(drafts([null, 2, 3, null, null, null, null, null]), STUDENT).overall).toBe(30);
    // Un GitHub à peine au-dessus du trop mince, chaque critère au bas de sa table, la preuve comprise.
    const thin = finalize(drafts([null, 2, null, 3, 5, 3, 3, 0]), STUDENT).overall;
    expect(thin).toBeLessThanOrEqual(40);
    expect(starsFor(thin)).toBe(2);
  });

  it("au début de carrière et au junior, un signal absent ne vaut pas 0 : le plancher du niveau, 2", () => {
    const g = finalize(drafts([null, 2, 5, 4, 6, 0, 4, 0]), STUDENT);
    const act = g.criteria.find((c) => c.code === "ACT")!;
    expect(act.score).toBe(2);
    expect(act.reached.fr).toMatch(/Plancher du niveau : 2\.$/);
    // L'open source ne compte que pour monter : il garde son 0, hors moyenne.
    expect(g.criteria.find((c) => c.code === "OSS")).toMatchObject({ score: 0, counted: false });
    // À partir du confirmé, aucun plancher : les tables telles quelles.
    const mid = finalize(drafts([null, 5, 5, 4, 6, 0, 4, 0]), { code: "mid", months: 40, source: "linkedin" });
    expect(mid.criteria.find((c) => c.code === "ACT")!.score).toBe(0);
    // Refaite depuis ses propres critères, la note ne bouge plus (le recalcul en dépend).
    expect(finalize(g.criteria.map(({ counted: _c, ...d }) => d), STUDENT).overall).toBe(g.overall);
  });
});

describe("la table du junior lit les stages : un stage de plus ne fait plus tomber l'expérience à 3", () => {
  const NOW = Date.parse("2026-11-20T12:00:00Z");
  const HIGH_BAR = { employers: parseEmployers(employersExample), source: "data/employers.example.json" };
  const role = (title: string, company: string, start: string, end: string | null): DatedRole => ({ title, company, start, end });
  const grid = (roles: DatedRole[]) =>
    declaredGrid(
      declaredInput(cvReading({ roles: [], technos_described: [], technos_listed: [], projects_with_dated_outcome: 0, school_tier: "B", years_declared: 0, seniority_claimed: "junior" }), {
        profile: { roles, education: [], skills: [] },
        now: NOW,
        highBar: HIGH_BAR,
      }),
    );
  // 23 mois de stage (comptés pour moitié) et un mois de vrai poste : 12 mois comptés, niveau « Junior ».
  const interns = [
    role("Data Science Research Intern", "Hôpital Lagon", "2026-03", "2026-08"),
    role("Machine Learning Intern", "Atelier Brume", "2025-06", "2025-12"),
    role("Stagiaire ingénieur", "Usine Navale", "2024-09", "2025-03"),
    role("Stagiaire", "Conseil Grand Large", "2024-02", "2024-08"),
  ];
  const job = role("Agent de tri", "Opérateur Postal", "2023-07", "2023-08");

  it("un étudiant passé junior par ses stages : 6 (4 sous 0.6.0, le mois de vrai poste ; 3 pour les stages)", () => {
    const g = grid([...interns, job]);
    expect(g.seniority?.code).toBe("junior");
    const emp = g.criteria.find((c) => c.code === "EMP")!;
    expect(emp.score).toBe(6);
    expect(emp.reached.fr.replace(/ /g, " ")).toMatch(/mois de stage ou d'alternance cumulés\.$/);
  });

  it("deux stages et un vrai poste de moins d'un an : 5, la ligne d'un poste tenu un an (4 sous 0.6.0)", () => {
    const two = grid([role("Stagiaire", "Atelier Brume", "2025-06", "2025-09"), role("Stagiaire", "Usine Navale", "2025-01", "2025-03"), role("Développeur", "Conseil Grand Large", "2026-01", null)]);
    expect(two.seniority?.code).toBe("junior");
    expect(two.criteria.find((c) => c.code === "EMP")!.score).toBe(5);
  });
});
