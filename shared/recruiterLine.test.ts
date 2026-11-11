// La ligne du recruteur et l'ordre des tuiles (shared/recruiterLine.ts) : un
// gabarit, jamais du texte libre ; le point fort jamais l'école ; le point à
// creuser jamais l'école ni l'open source ; « À prouver » d'abord.
import { describe, expect, it } from "vitest";
import { digPoint, recruiterRead, RECRUITER_ORDER, strongPoint, tileOrder, yearsText } from "./recruiterLine";
import type { CriterionCode, Grid, GridCriterion } from "./types";

const crit = (code: CriterionCode, score: number | null, over: Partial<GridCriterion> = {}): GridCriterion => ({
  code,
  score,
  state: score === null ? "unproven" : "scored",
  counted: score !== null,
  source: code === "EDU" || code === "XP" || code === "EMP" ? "linkedin" : "github",
  reached: { fr: "", en: "" },
  flags: [],
  ...over,
});

/** Une grille dans l'ordre du moteur (EDU, XP, EMP, STK, CODE, ACT, OWN, OSS). */
const grid = (s: Partial<Record<CriterionCode, number | null>>, over: Partial<Record<CriterionCode, Partial<GridCriterion>>> = {}): Grid => ({
  criteria: (["EDU", "XP", "EMP", "STK", "CODE", "ACT", "OWN", "OSS"] as CriterionCode[]).map((code) => crit(code, s[code] ?? null, over[code])),
  overall: 61,
});

const card = { position: "FS" as const, mainLanguage: "TypeScript" };

describe("l'ordre des tuiles", () => {
  it("Expérience, Parcours, Stack, Code, Ownership, Activité, École, Open source", () => {
    expect(RECRUITER_ORDER).toEqual(["XP", "EMP", "STK", "CODE", "OWN", "ACT", "EDU", "OSS"]);
  });

  it("les critères sans note descendent sous « Pas encore au dossier », dans le même ordre", () => {
    const { scored, pending } = tileOrder(grid({ XP: 7, STK: 6, CODE: 8, ACT: 5, OWN: 4 }));
    expect(scored.map((c) => c.code)).toEqual(["XP", "STK", "CODE", "OWN", "ACT"]);
    expect(pending.map((c) => c.code)).toEqual(["EMP", "EDU", "OSS"]);
  });

  it("l'école gardée pour la personne reste parmi les critères au dossier", () => {
    const { scored, pending } = tileOrder(grid({ XP: 7, CODE: 8 }, { EDU: { private: true } }));
    expect(scored.map((c) => c.code)).toEqual(["XP", "CODE", "EDU"]);
    expect(pending.map((c) => c.code)).not.toContain("EDU");
  });
});

describe("le point fort et le point à creuser", () => {
  it("le point fort : la note la plus haute, jamais l'école ; à égalité, le plus lourd coefficient", () => {
    expect(strongPoint(grid({ EDU: 10, XP: 7, CODE: 8, STK: 8 }))?.code).toBe("CODE");
    expect(strongPoint(grid({ XP: 4, CODE: 3 }))).toBeNull();
  });

  it("à prouver d'abord : le critère sans pièce le plus lourd, le code avant tout", () => {
    expect(digPoint(grid({ XP: 9, EMP: 8, STK: 6, OWN: 6 }))).toEqual({ kind: "prove", code: "CODE" });
  });

  it("sinon la note la plus basse, jamais l'école ni l'open source", () => {
    const g = grid({ EDU: 2, XP: 7, EMP: 6, STK: 6, CODE: 8, ACT: 5, OWN: 3, OSS: 1 });
    expect(digPoint(g)).toEqual({ kind: "dig", code: "OWN", score: 3 });
  });

  it("« À creuser » seulement pour une note de 6 ou moins, strictement sous le point fort", () => {
    // 6 sous un 8 : à creuser.
    expect(digPoint(grid({ XP: 8, EMP: 7, STK: 7, CODE: 8, ACT: 6, OWN: 7 }))).toEqual({ kind: "dig", code: "ACT", score: 6 });
    // Rien sous 7 : un dossier régulier, « rien sous 7/10 ».
    const even = grid({ XP: 8, EMP: 7, STK: 7, CODE: 9, ACT: 7, OWN: 8, OSS: 2, EDU: 3 });
    expect(digPoint(even)).toEqual({ kind: "even", floor: 7 });
    expect(recruiterRead(card, even, "fr")?.dig).toBe("Dossier régulier\u00a0: rien sous 7/10.");
    expect(recruiterRead(card, even, "en")?.dig).toBe("Even file: nothing under 7/10.");
    // Tout à égalité sous 7 : rien sous le point fort, la ligne s'arrête au point fort.
    const flat = grid({ XP: 6, EMP: 6, STK: 6, CODE: 6, ACT: 6, OWN: 6 });
    expect(digPoint(flat)).toBeNull();
    expect(recruiterRead(card, flat, "fr")?.text).toBe("Full-stack TypeScript, 4\u00a0ans comptés. Point fort\u00a0: niveau du code, 6/10.");
    // Sans point fort, la note basse reste à creuser.
    expect(digPoint(grid({ XP: 4, EMP: 3, STK: 4, CODE: 4, ACT: 4, OWN: 4 }))).toEqual({ kind: "dig", code: "EMP", score: 3 });
  });
});

describe("la ligne", () => {
  it("le métier, le langage, les années comptées, le point fort, le point à creuser", () => {
    const g = grid({ XP: 7, EMP: 6, STK: 6, CODE: 8, ACT: 5, OWN: 3 });
    expect(recruiterRead(card, g, "fr")?.text).toBe("Full-stack TypeScript, 5\u00a0ans comptés. Point fort\u00a0: niveau du code, 8/10. À creuser\u00a0: ownership.");
    expect(recruiterRead(card, g, "en")?.text).toBe("Full-stack TypeScript, 5 years counted. Strong point: code level, 8/10. To dig into: ownership.");
  });

  it("une fiche LinkedIn seule : « À prouver : le code. »", () => {
    const g = grid({ EDU: 8, XP: 9, EMP: 8, STK: 6, OWN: 6 }, { STK: { state: "declared", source: "linkedin" }, OWN: { state: "declared", source: "linkedin" } });
    expect(recruiterRead(card, g, "fr")?.text).toBe("Full-stack TypeScript, 8 ou 9\u00a0ans comptés. Point fort\u00a0: expérience, 9/10. À prouver\u00a0: le code.");
  });

  it("les années : comptées, estimées sur GitHub, ou affirmées", () => {
    expect(yearsText(grid({ XP: 3 }), "fr")).toBe("1\u00a0an compté");
    expect(yearsText(grid({ XP: 6 }, { XP: { source: "github" } }), "fr")).toBe("4\u00a0ans estimés sur GitHub");
    expect(yearsText(grid({ XP: 5 }, { XP: { state: "declared" } }), "fr")).toBe("3\u00a0ans affirmés");
    expect(yearsText(grid({}), "fr")).toBeNull();
  });

  it("sans grille utilisable : rien", () => {
    expect(recruiterRead(card, undefined, "fr")).toBeNull();
    expect(recruiterRead(card, { criteria: [], overall: 50 }, "fr")).toBeNull();
  });

  it("aucun mot qui accuse, épicène", () => {
    const g = grid({ XP: 2, EMP: 3, STK: 2, CODE: 2, ACT: 2, OWN: 2 });
    for (const lang of ["fr", "en"] as const) expect(recruiterRead(card, g, lang)!.text).not.toMatch(/menteu|suspect|faux|fake|liar|\bil\b|\belle\b/i);
  });
});
