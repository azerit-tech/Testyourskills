// Le rang d'une école ne s'affiche nulle part (§18.48) : les grilles rangées avant
// la règle perdent la lettre à la lecture, la note sur 10 reste.
import { describe, expect, it } from "vitest";
import { FIXTURE_COMPARISON, FIXTURES } from "./fixtures";
import { EDU_NEXT, SCHOOL_COUNTED, SCHOOL_RANK_RE, schoolCounted, withoutSchoolRank } from "./schoolRank";
import type { CardData, ComparisonData, Grid, GridCriterion } from "./types";

const f = (fr: string, en: string) => ({ fr, en });

/** Le critère École tel que le moteur l'écrivait avant le §18.48. */
const legacyEdu = (tier: "S" | "A" | "B" | "C", score: number): GridCriterion => ({
  code: "EDU",
  score,
  state: "scored",
  counted: true,
  source: "linkedin",
  reached: f(`École Démo, rang ${tier}.`, `École Démo, tier ${tier}.`),
  next: f(`Pour 10 : une école de rang S, ou une médaille internationale.`, `For 10: a tier S school, or an international medal.`),
  flags: [],
  evidence: { text: f(`École Démo, rang ${tier}.`, `École Démo, tier ${tier}.`), publicText: f(`École de rang ${tier}.`, `Tier ${tier} school.`), source: "linkedin" },
});

const legacyGrid = (): Grid => ({ overall: 70, criteria: [legacyEdu("A", 8)] });

describe("withoutSchoolRank", () => {
  it("réécrit la pièce, la version publique et la suite, sans toucher à la note", () => {
    const card = withoutSchoolRank({ ...FIXTURES.jmougeot, grid: legacyGrid() } as CardData);
    const edu = card.grid!.criteria[0]!;
    expect(JSON.stringify(card)).not.toMatch(SCHOOL_RANK_RE);
    expect(edu.score).toBe(8);
    expect(edu.reached).toEqual(schoolCounted("École Démo"));
    expect(edu.evidence!.text).toEqual(schoolCounted("École Démo"));
    expect(edu.evidence!.publicText).toEqual(SCHOOL_COUNTED);
    expect(edu.next!.fr).toBe("Pour 10 : une école parmi les plus sélectives, ou une médaille internationale.");
    expect(edu.next!.en).toBe("For 10: one of the most selective schools, or an international medal.");
  });

  it("les suites des quatre rangs, comme le moteur les écrit maintenant", () => {
    const next = (fr: string, en: string) => withoutSchoolRank({ ...FIXTURES.jmougeot, grid: { overall: 50, criteria: [{ ...legacyEdu("C", 4), next: f(fr, en) }] } } as CardData).grid!.criteria[0]!.next;
    expect(next("Pour 6 : une école de rang B.", "For 6: a tier B school.")).toEqual(EDU_NEXT[4]);
    expect(
      next(
        "Pour 8 : une école de rang A, ou une sélection prouvée hors école (classement dans un concours, prix de hackathon, programme sélectif).",
        "For 8: a tier A school, or a proven selection outside school (competition ranking, hackathon prize, selective programme).",
      ),
    ).toEqual(EDU_NEXT[6]);
  });

  it("chaque grille d'un dossier à deux pièces, et idempotent", () => {
    const cmp: ComparisonData = {
      ...FIXTURE_COMPARISON,
      grid: legacyGrid(),
      cv: { ...FIXTURE_COMPARISON.cv, grid: legacyGrid() },
      github: { ...FIXTURE_COMPARISON.github, grid: legacyGrid() },
      file: { ...FIXTURE_COMPARISON.github, grid: legacyGrid() },
    };
    const once = withoutSchoolRank(cmp);
    expect(JSON.stringify(once)).not.toMatch(SCHOOL_RANK_RE);
    expect(withoutSchoolRank(once)).toEqual(once);
  });

  it("une fiche sans grille, ou sans rang, passe telle quelle", () => {
    expect(withoutSchoolRank(FIXTURES.jmougeot)).toEqual(FIXTURES.jmougeot);
    expect(withoutSchoolRank(null)).toBeNull();
  });
});
