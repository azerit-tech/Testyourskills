// La note sur 100 lue dans la grille, pour l'affichage (§18.37) : mêmes
// coefficients que data/grid.json, même arrondi que le moteur.
import { describe, expect, it } from "vitest";
import gridJson from "../data/grid.json";
import { dec, excludedWhy, gridMath, GRID_WEIGHTS, usableGrid } from "./gridText";
import type { CriterionCode, Grid, GridCriterion } from "./types";

const crit = (code: CriterionCode, score: number | null, over: Partial<GridCriterion> = {}): GridCriterion => ({
  code,
  score,
  state: score === null ? "unproven" : "scored",
  counted: score !== null,
  source: "github",
  reached: { fr: "", en: "" },
  flags: [],
  ...over,
});

/** Le dossier de Jacques (docs/bareme-recrutement.md §7) : 57. */
const JACQUES: Grid = {
  overall: 57,
  criteria: [
    crit("EDU", 6, { source: "linkedin" }),
    crit("XP", 3, { source: "linkedin" }),
    crit("EMP", 4, { source: "linkedin" }),
    crit("STK", 6),
    crit("CODE", 7),
    crit("ACT", 8),
    crit("OWN", 6, { source: "both" }),
    crit("OSS", 6),
  ],
};

describe("la note sur 100 tirée de la grille", () => {
  it("les coefficients sont ceux de data/grid.json", () => {
    expect(GRID_WEIGHTS).toEqual(gridJson.weights);
  });

  it("refait le calcul du document : 56,5 ÷ 10, soit 57", () => {
    const m = gridMath(JACQUES);
    expect(m.num).toBe(56.5);
    expect(m.den).toBe(10);
    expect(m.raw).toBe(57);
    expect(m.terms.map((t) => t.code)).toEqual(["CODE", "STK", "XP", "EMP", "OWN", "ACT", "EDU", "OSS"]);
    expect(m.excluded).toEqual([]);
  });

  it("dit pourquoi un critère sort de la moyenne", () => {
    const g: Grid = {
      overall: 45,
      rule: "capped_unproven",
      criteria: [
        crit("EDU", 8, { source: "linkedin" }),
        crit("XP", 3, { source: "linkedin" }),
        crit("EMP", null, { state: "missing", source: "linkedin" }),
        crit("CODE", null),
        crit("OSS", 2, { counted: false }),
      ],
    };
    const m = gridMath(g);
    expect(m.excluded).toEqual([
      { code: "CODE", why: "unproven" },
      { code: "EMP", why: "missing" },
      { code: "OSS", why: "below" },
    ]);
    expect(excludedWhy(g.criteria[0])).toBeNull();
    expect(m.capHit).toBe(false);
  });

  it("signale le plafond qui a fait baisser la note", () => {
    const g: Grid = { overall: 85, rule: "capped_unproven", criteria: [crit("XP", 9, { source: "linkedin" }), crit("EMP", 9, { source: "linkedin" }), crit("CODE", null)] };
    const m = gridMath(g);
    expect(m.raw).toBe(90);
    expect(m.capHit).toBe(true);
    expect(m.overall).toBe(85);
  });

  it("dossier vide : aucun terme", () => {
    const g: Grid = { overall: 20, rule: "empty_file", criteria: [crit("STK", 2, { counted: false }), crit("CODE", null)] };
    const m = gridMath(g);
    expect(m.terms).toEqual([]);
    expect(m.mean).toBeNull();
    expect(m.excluded).toEqual([{ code: "CODE", why: "unproven" }]);
  });

  it("décimales à la française ou à l'anglaise", () => {
    expect(dec(1.5, "fr")).toBe("1,5");
    expect(dec(1.5, "en")).toBe("1.5");
    expect(dec(2, "fr")).toBe("2");
    expect(dec(7.933, "fr", 2)).toBe("7,93");
  });

  it("une grille absente ou vide ne s'affiche pas", () => {
    expect(usableGrid(undefined)).toBe(false);
    expect(usableGrid({ criteria: [], overall: 20 })).toBe(false);
    expect(usableGrid(JACQUES)).toBe(true);
  });
});
