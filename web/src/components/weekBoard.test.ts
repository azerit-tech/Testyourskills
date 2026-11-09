// Top de la semaine (§18.27) : le nombre de dossiers à partir de 20 seulement,
// sur l'accueil comme dans l'après-fiche, sans séparateur orphelin.
import { describe, expect, it } from "vitest";
import { MIN_SHOWN_TOTAL } from "../../../shared/week";
import { DICTS } from "../i18n";

const { fr, en } = DICTS;

describe("nombre de dossiers de la semaine", () => {
  it("le seuil est 20", () => expect(MIN_SHOWN_TOTAL).toBe(20));

  it("accueil : sous 20, la ligne se lit sans lui", () => {
    expect(fr.home.top.meta(46, 7, "6 j 1 h")).toBe("Semaine 46 · fin dans 6 j 1 h");
    expect(en.home.top.meta(46, 1, "6 d 1 h")).toBe("Week 46 · ends in 6 d 1 h");
    expect(fr.home.top.meta(46, 0, "2 min")).toBe("Semaine 46 · fin dans 2 min");
  });

  it("accueil : à partir de 20, il s'affiche", () => {
    expect(fr.home.top.meta(46, 20, "6 j 1 h")).toBe("Semaine 46 · 20 dossiers · fin dans 6 j 1 h");
    expect(en.home.top.meta(46, 132, "1 h 5 min")).toBe("Week 46 · 132 files · ends in 1 h 5 min");
  });

  it("après-fiche : le rang, avec le total seulement à partir de 20", () => {
    expect(fr.result.week.line(7, 12, 3)).toBe("7e cette semaine · 3 points du top 5");
    expect(fr.result.week.line(7, 40, 1)).toBe("7e sur 40 cette semaine · 1 point du top 5");
    expect(en.result.week.line(7, 19, 2)).toBe("#7 this week · 2 points from the top 5");
    expect(en.result.week.line(7, 20, 2)).toBe("#7 of 20 this week · 2 points from the top 5");
    expect(fr.result.week.closedLine(8, 9, 45)).toBe("8e, semaine 45");
    expect(en.result.week.closedLine(8, 90, 45)).toBe("#8 of 90, week 45");
  });
});
