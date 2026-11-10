// Aperçus de lien d'une comparaison : lus par qui n'a pas fait la fiche, donc à la troisième personne.

import { describe, expect, it } from "vitest";
import { FIXTURE_COMPARISON } from "../../shared/fixtures";
import type { ComparisonData } from "../../shared/types";
import { metaFor } from "./html";

/** Une comparaison où la fiche déclarative a `cv` points et la fiche GitHub `gh`. */
function cmp(cv: number, gh: number, over: Partial<ComparisonData> = {}): ComparisonData {
  return {
    ...FIXTURE_COMPARISON,
    cv: { ...FIXTURE_COMPARISON.cv, overall: cv, lang: "fr" },
    github: { ...FIXTURE_COMPARISON.github, overall: gh, login: "lea" },
    headline: { fr: "CV et code à égalité. Rare, donc suspect.", en: "CV and code are dead even. Rare, so suspicious." },
    ...over,
  };
}

describe("aperçu de lien d'une comparaison", () => {
  it("LinkedIn devant : « Le LinkedIn de @lea a volé 21 points à son code »", () => {
    expect(metaFor(cmp(80, 59, { declaredSource: "linkedin" }), "https://s.test").title).toBe("Le LinkedIn de @lea a volé 21 points à son code");
  });

  it("le code devant : « Le code de @lea vaut 12 points de plus que son CV »", () => {
    expect(metaFor(cmp(60, 72), "https://s.test").title).toBe("Le code de @lea vaut 12 points de plus que son CV");
  });

  it("en anglais, et au singulier", () => {
    const en = (c: ComparisonData) => ({ ...c, cv: { ...c.cv, lang: "en" as const } });
    expect(metaFor(en(cmp(80, 59, { declaredSource: "linkedin" })), "https://s.test").title).toBe("@lea's LinkedIn stole 21 points from their code");
    expect(metaFor(en(cmp(60, 61)), "https://s.test").title).toBe("@lea's code is worth 1 point more than their CV");
  });

  it("sans pseudo, le nom ; à égalité, le titre du catalogue et qui il concerne", () => {
    const anon = cmp(60, 72);
    anon.github = { ...anon.github, login: undefined };
    expect(metaFor(anon, "https://s.test").title).toBe(`Le code de ${anon.github.name} vaut 12 points de plus que son CV`);
    expect(metaFor(cmp(70, 70), "https://s.test").title).toBe("CV et code à égalité. Rare, donc suspect. — @lea");
  });

  it("ne tutoie jamais le lecteur", () => {
    for (const c of [cmp(80, 59), cmp(60, 72), cmp(80, 59, { declaredSource: "linkedin" })]) expect(metaFor(c, "https://s.test").title).not.toMatch(/\bton\b|\bTon\b/);
  });
});
