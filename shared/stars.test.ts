// Les six étoiles de recherche (SPEC §18.18) : seuils 30, 45, 60, 75 et 90.
import { describe, expect, it } from "vitest";
import { LEVEL_LABELS, STAR_THRESHOLDS, starsFor, type Stars } from "./types";
import { THEMES, themeOf } from "./card/themes";
import { starsLine } from "./stars";

describe("six étoiles", () => {
  it("allume une étoile à chaque seuil", () => {
    const cases: [number, Stars][] = [
      [1, 1], [29, 1], [30, 2], [44, 2], [45, 3], [59, 3],
      [60, 4], [74, 4], [75, 5], [89, 5], [90, 6], [99, 6],
    ];
    for (const [overall, n] of cases) expect(starsFor(overall), `note ${overall}`).toBe(n);
  });

  it("les seuils exportés sont ceux de starsFor", () => {
    expect([...STAR_THRESHOLDS]).toEqual([30, 45, 60, 75, 90]);
    STAR_THRESHOLDS.forEach((th, i) => {
      expect(starsFor(th)).toBe(i + 2);
      expect(starsFor(th - 1)).toBe(i + 1);
    });
  });

  it("six libellés épicènes, en français et en anglais", () => {
    expect(Object.keys(LEVEL_LABELS)).toHaveLength(6);
    expect(LEVEL_LABELS[1]).toEqual({ fr: "Petit délit", en: "Petty crime" });
    expect(LEVEL_LABELS[3]).toEqual({ fr: "Avis de recherche", en: "Wanted" });
    expect(LEVEL_LABELS[6]).toEqual({ fr: "Priorité absolue", en: "Top priority" });
  });

  it("un thème par niveau", () => {
    for (let n = 1; n <= 6; n++) expect(THEMES[`s${n as Stars}`]).toBeDefined();
    expect(themeOf({ overall: 95 }).key).toBe("s6");
    expect(themeOf({ overall: 95, special: "totw" }).key).toBe("totw");
  });

  it("dans un texte, toujours les six, pleines puis vides (§18.27)", () => {
    expect(starsLine(starsFor(78))).toBe("★★★★★☆");
    expect(starsLine(1)).toBe("★☆☆☆☆☆");
    expect(starsLine(6)).toBe("★★★★★★");
  });
});
