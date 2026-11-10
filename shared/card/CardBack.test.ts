// Le dos de la fiche (§18.27) : chaque axe avec sa valeur et son fait le plus
// fort, puis la formule ; rendu par resvg comme la face.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Resvg } from "@resvg/resvg-js";
import { describe, expect, it } from "vitest";
import scoring from "../../data/scoring.json";
import { fontFiles } from "../../server/src/render/fonts";
import { FIXTURES } from "../fixtures";
import type { CardData, CriterionCode, Grid, GridCriterion, Lang } from "../types";
import { STAT_CODES } from "../types";
import { BACK_LAYOUT, CardBackGraphic, OVERALL_WEIGHTS, formulaTerms, gridFormula, packTerms, strongestFact } from "./CardBack";
import { measure } from "./text";

const FW = 360 - 18 - 20;
const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function back(card: CardData, lang: Lang) {
  return renderToStaticMarkup(createElement(CardBackGraphic, { card, lang }));
}

describe("dos de la fiche", () => {
  it("les poids de la formule sont ceux du barème", () => {
    expect(OVERALL_WEIGHTS).toEqual(scoring.weights);
  });

  for (const lang of ["fr", "en"] as Lang[]) {
    it(`montre les six axes, leur valeur, leur fait le plus fort et la note (${lang})`, () => {
      const card = FIXTURES.jmougeot;
      const svg = back(card, lang);
      expect(svg).toContain(`viewBox="0 0 360 520"`);
      expect(svg).toContain(lang === "fr" ? "PIÈCES À CONVICTION" : "EXHIBITS");
      for (const code of STAT_CODES) {
        const st = card.stats.find((x) => x.code === code)!;
        expect(svg).toContain(`>${code}<`);
        expect(svg).toContain(`>${st.value}<`);
        expect(svg).toContain(esc(strongestFact(st, lang)!));
      }
      expect(svg).toContain(`= ${card.overall}`);
      // BUZZ ne compte pas : il est dit, et n'entre pas dans la formule
      expect(svg).toContain(lang === "fr" ? "HORS NOTE" : "NOT RATED");
      expect(formulaTerms(card, lang).join(" ")).not.toContain("BUZZ");
    });
  }

  it("la formule tient en trois lignes à côté de la note, aucun terme coupé", () => {
    for (const card of Object.values(FIXTURES) as CardData[]) {
      for (const lang of ["fr", "en"] as Lang[]) {
        const F = BACK_LAYOUT.formula;
        const resultW = measure(`= ${card.overall}`, "display-800", F.result, -1) + 12;
        const p = packTerms(formulaTerms(card, lang), F.size, FW - resultW);
        expect(p.lines.length).toBeLessThanOrEqual(F.maxLines);
        for (const line of p.lines) expect(measure(line, "sans-500", p.size)).toBeLessThanOrEqual(FW - resultW);
        expect(p.lines.join(" ").replace(/ \+/g, "")).toBe(formulaTerms(card, lang).join(" "));
      }
    }
  });

  it("un axe sans fait le dit, sans planter", () => {
    const card = { ...FIXTURES.silver, stats: FIXTURES.silver.stats.map((s) => ({ ...s, facts: [] })) };
    expect(back(card, "fr")).toContain("Aucun fait relevé");
    expect(back(card, "en")).toContain("No fact on file");
  });

  it("avec la grille du barème : les critères notés et leurs coefficients, sans « + n », en trois lignes", () => {
    const crit = (code: CriterionCode, score: number | null, counted = score !== null): GridCriterion => ({
      code,
      score,
      counted,
      state: score === null ? "unproven" : "scored",
      source: "github",
      reached: { fr: "", en: "" },
      flags: [],
    });
    const full: Grid = { overall: 57, criteria: [crit("EDU", 6), crit("XP", 3), crit("EMP", 4), crit("STK", 6), crit("CODE", 7), crit("ACT", 8), crit("OWN", 6), crit("OSS", 6)] };
    const capped: Grid = { overall: 85, rule: "capped_unproven", criteria: [crit("XP", 9), crit("EMP", 9), crit("CODE", null)] };
    const empty: Grid = { overall: 20, rule: "empty_file", criteria: [crit("STK", 2, false), crit("CODE", null)] };
    const F = BACK_LAYOUT.formula;
    for (const lang of ["fr", "en"] as Lang[]) {
      for (const grid of [full, capped, empty]) {
        const card = { ...FIXTURES.gold, grid, overall: grid.overall };
        const f = gridFormula(card, lang)!;
        const resultW = measure(`= ${card.overall}`, "display-800", F.result, -1) + 12;
        const p = packTerms(f.terms, F.size, FW - resultW, f.tail);
        expect(p.lines.length).toBeLessThanOrEqual(F.maxLines);
        const text = p.lines.join(" ");
        expect(text).not.toMatch(/[+−]\s?\d/);
        const svg = back(card, lang);
        expect(svg).toContain(lang === "fr" ? "MOYENNE PONDÉRÉE" : "WEIGHTED MEAN");
        expect(svg).toContain(`= ${grid.overall}`);
        if (grid === empty) expect(f.tail).toBeUndefined();
        else expect(f.tail).toContain("÷");
      }
      expect(gridFormula({ ...FIXTURES.gold, grid: full }, lang)!.terms[0]).toBe("Code 7 × 2");
      expect(gridFormula({ ...FIXTURES.gold, grid: capped }, lang)!.tail).toContain("85");
    }
    expect(gridFormula(FIXTURES.gold, "fr")).toBeNull();
  });

  it("se rend en PNG par resvg, comme la face", () => {
    const svg = back(FIXTURES.icon, "fr").replace('width="100%"', 'width="360" height="520"');
    const png = new Resvg(svg, { font: { fontFiles: fontFiles(), loadSystemFonts: false, defaultFontFamily: "Outfit" }, fitTo: { mode: "width", value: 720 } })
      .render()
      .asPng();
    expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(720);
    expect(png.readUInt32BE(20)).toBe(1040);
  });
});
