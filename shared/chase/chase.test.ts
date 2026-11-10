// La poursuite (§18.33) : le minutage suit le niveau, l'image est une fonction
// pure du temps, et l'escalade ne recule jamais.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../fixtures";
import type { CardData, Stars } from "../types";
import { BEAT, ChaseFrame, ENDING, escalation, OPENING, chasePlan, radioLines } from "./index";

const OVERALL: Record<Stars, number> = { 1: 12, 2: 33, 3: 50, 4: 66, 5: 80, 6: 93 };
const cardAt = (n: Stars, extra: Partial<CardData> = {}): CardData => ({ ...FIXTURES.silver, id: `t${n}`, overall: OVERALL[n], ...extra });
const LEVELS: Stars[] = [1, 2, 3, 4, 5, 6];
const markup = (card: CardData, t: number, w = 390, h = 844) =>
  renderToStaticMarkup(createElement(ChaseFrame, { t, plan: chasePlan(card), width: w, height: h, lang: "fr", backdropHref: "x.jpg" }));

describe("chasePlan (§18.33)", () => {
  it("1,2 s d'ouverture, 1,4 s par étoile, 1,6 s de fin : 4,2 s pour une étoile, 11,2 s pour six", () => {
    for (const n of LEVELS) {
      const p = chasePlan(cardAt(n));
      expect(p.level).toBe(n);
      expect(p.duration).toBeCloseTo(OPENING + BEAT * n + ENDING, 6);
      expect(p.beats.map((b) => b.star)).toEqual(LEVELS.slice(0, n));
      expect(p.beats[0].at).toBeCloseTo(OPENING, 6);
      expect(p.brakeAt).toBeCloseTo(OPENING + BEAT * n, 6);
      expect(p.flashAt).toBeCloseTo(p.duration - 0.2, 6);
    }
    expect(chasePlan(cardAt(1)).duration).toBeCloseTo(4.2, 6);
    expect(chasePlan(cardAt(6)).duration).toBeCloseTo(11.2, 6);
  });

  it("s'arrête au niveau : l'étoile suivante clignote, sauf à six étoiles", () => {
    for (const n of LEVELS) {
      const p = chasePlan(cardAt(n));
      if (n === 6) expect(p.flicker).toBeNull();
      else {
        expect(p.flicker?.star).toBe(n + 1);
        expect(p.flicker!.at).toBeGreaterThanOrEqual(p.brakeAt);
      }
      expect(escalation(p, p.duration + 1).stars).toBe(n);
    }
  });

  it("la lumière et le décor viennent du profil, `default` sans profil connu", () => {
    expect(chasePlan(cardAt(3, { profile: { ...FIXTURES.silver.profile!, id: "kingpin" } }))).toMatchObject({ light: "pink", scene: "kingpin" });
    expect(chasePlan(cardAt(3, { profile: { ...FIXTURES.silver.profile!, id: "arsonist" } }))).toMatchObject({ light: "gold", scene: "arsonist" });
    expect(chasePlan(cardAt(3, { profile: undefined }))).toMatchObject({ light: "night", scene: "default" });
    expect(chasePlan(cardAt(3, { profile: { ...FIXTURES.silver.profile!, id: "inconnu" } })).scene).toBe("default");
  });

  it("la radio : une ligne par étoile, qui cite les faits, dans les deux langues", () => {
    const fr = radioLines(FIXTURES.silver, "fr");
    expect(fr.beats).toHaveLength(6);
    expect(fr.beats[0]).toContain("Backend");
    expect(fr.beats[1]).toContain("Python");
    expect(fr.beats[3]).toContain("Doctolib");
    expect(fr.beats[4]).toContain(FIXTURES.silver.profile!.label.fr);
    expect(radioLines({ ...FIXTURES.silver, club: null }, "en").beats[3]).toContain("Lone wolf");
    for (const l of [...fr.beats, fr.end]) expect(l.length).toBeGreaterThan(0);
  });
});

describe("escalade (§18.33)", () => {
  it("le nombre de renforts ne baisse jamais ; les hélicoptères n'arrivent qu'à la cinquième étoile", () => {
    for (const n of LEVELS) {
      const p = chasePlan(cardAt(n));
      let units = 0;
      let stars = 0;
      for (let t = 0; t <= p.duration + 0.5; t += 0.05) {
        const e = escalation(p, t);
        expect(e.units.length).toBeGreaterThanOrEqual(units);
        expect(e.stars).toBeGreaterThanOrEqual(stars);
        if (e.stars < 5) expect(e.helicopters).toBe(0);
        units = e.units.length;
        stars = e.stars;
      }
      expect(escalation(p, p.duration).helicopters).toBe(n === 6 ? 3 : n === 5 ? 1 : 0);
    }
  });

  it("l'ouverture est calme : ni étoile ni renfort avant 1,2 s", () => {
    const e = escalation(chasePlan(cardAt(6)), OPENING - 0.01);
    expect(e).toEqual({ stars: 0, units: [], helicopters: 0 });
  });
});

describe("ChaseFrame (§18.33)", () => {
  it("est déterministe : même fiche, même instant, même image", () => {
    for (const t of [0, 1.7, 4.4, 9.3, 11.1]) expect(markup(cardAt(6), t)).toBe(markup(cardAt(6), t));
  });

  it("change avec le temps et la fiche", () => {
    expect(markup(cardAt(6), 2)).not.toBe(markup(cardAt(6), 2.5));
    expect(markup(cardAt(6), 2)).not.toBe(markup(cardAt(6, { id: "autre" }), 2));
  });

  it("reste léger et sans filtre, masque, animation CSS ni foreignObject", () => {
    for (const n of LEVELS) {
      const p = chasePlan(cardAt(n));
      for (const t of [p.beats[n - 1].at + 1, p.duration - 0.1]) {
        const svg = markup(cardAt(n), t);
        expect(svg).not.toMatch(/<filter|<mask|<foreignObject|<animate|<style|class=/);
        // ≈ 150 nœuds au plus fort, toutes tailles d'écran
        for (const [w, h] of [[390, 844], [360, 640], [1440, 900]]) expect((markup(cardAt(n), t, w, h).match(/<[a-zA-Z]/g) ?? []).length).toBeLessThan(170);
      }
    }
  });

  it("le décor peint n'entre qu'à la fin, et le flash blanc à la toute fin", () => {
    const p = chasePlan(cardAt(3));
    expect(markup(cardAt(3), p.brakeAt - 0.1)).not.toContain("<image");
    expect(markup(cardAt(3), p.flashAt - 0.05)).toContain("<image");
    expect(markup(cardAt(3), p.flashAt - 0.05)).not.toContain('fill="#ffffff"');
    expect(markup(cardAt(3), p.duration - 0.01)).toContain('fill="#ffffff"');
  });
});
