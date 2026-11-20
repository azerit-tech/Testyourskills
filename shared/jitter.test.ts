// Le petit aléa de la note (SPEC §18.106) : ±1 à 3 points, fixé par la fiche.
import { describe, expect, it } from "vitest";
import { jitterCard, jitterOf, withJitter } from "./jitter";
import type { CardData, ComparisonData, Grid } from "./types";

const B = { min: 1, max: 99, capUnproven: 80 };
const grid = (overall: number, rule?: Grid["rule"]): Grid => ({ criteria: [], overall, ...(rule ? { rule } : {}) });
const ids = Array.from({ length: 3000 }, (_, i) => `id${i.toString(36)}x${(i * 7919).toString(36)}`);

describe("l'aléa de la fiche", () => {
  it("est fixé par l'id : la même fiche, la même note, à chaque fois", () => {
    for (const id of ids.slice(0, 50)) expect(jitterOf(id)).toBe(jitterOf(id));
    expect(withJitter(grid(64), "Z0sxpp427u", B)).toEqual(withJitter(grid(64), "Z0sxpp427u", B));
  });

  it("jamais 0, jamais plus de 3, des deux côtés, à peu près également", () => {
    const counts = new Map<number, number>();
    for (const id of ids) counts.set(jitterOf(id), (counts.get(jitterOf(id)) ?? 0) + 1);
    expect([...counts.keys()].sort((a, b) => a - b)).toEqual([-3, -2, -1, 1, 2, 3]);
    for (const n of counts.values()) expect(n).toBeGreaterThan(ids.length / 6 - 150);
  });

  it("deux fiches à la même grille ont le plus souvent deux notes", () => {
    const notes = new Set(ids.slice(0, 20).map((id) => withJitter(grid(66), id, B).overall));
    expect(notes.size).toBeGreaterThan(3);
  });

  it("seule la note bouge : les critères restent, et rien de l'aléa n'est rangé dans la grille", () => {
    const g: Grid = { criteria: [{ code: "CODE", score: 7 } as Grid["criteria"][number]], overall: 64 };
    const out = withJitter(g, "abc", B);
    expect(out.criteria).toEqual(g.criteria);
    expect(Math.abs(out.overall - 64)).toBeGreaterThanOrEqual(1);
    expect(Math.abs(out.overall - 64)).toBeLessThanOrEqual(3);
    expect(Object.keys(out).sort()).toEqual(["criteria", "overall"]);
  });

  it("un dossier vide garde son plancher ; le plafond sans code prouvé et les bornes tiennent", () => {
    for (const id of ids.slice(0, 200)) {
      expect(withJitter(grid(20, "empty_file"), id, B).overall).toBe(20);
      expect(withJitter(grid(80, "capped_unproven"), id, B).overall).toBeLessThanOrEqual(80);
      expect(withJitter(grid(99), id, B).overall).toBeLessThanOrEqual(99);
      expect(withJitter(grid(1), id, B).overall).toBeGreaterThanOrEqual(1);
    }
  });

  it("une fiche et un dossier : la note, le niveau et les pièces suivent la grille", () => {
    const card = jitterCard({ grid: grid(74), overall: 74, tier: "silver" } as unknown as CardData, "k1", B);
    expect(card.overall).toBe(card.grid!.overall);
    const cmp = jitterCard({ grid: grid(74), cv: { overall: 74 }, github: { overall: 74 } } as unknown as ComparisonData, "k1", B);
    expect([cmp.cv.overall, cmp.github.overall]).toEqual([cmp.grid!.overall, cmp.grid!.overall]);
    expect(cmp.grid!.overall).toBe(card.grid!.overall);
  });
});
