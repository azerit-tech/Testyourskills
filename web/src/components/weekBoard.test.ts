// Top du mois (§18.27, §18.128) : le nombre de fiches à partir de 20 seulement,
// sur l'accueil comme dans l'après-fiche, en une phrase à virgules, sans point médian.
import { describe, expect, it } from "vitest";
import { MIN_SHOWN_TOTAL } from "../../../shared/week";
import { DICTS } from "../i18n";

const { fr, en } = DICTS;

describe("nombre de fiches du mois", () => {
  it("le seuil est 20", () => expect(MIN_SHOWN_TOTAL).toBe(20));

  it("accueil : sous 20, la ligne se lit sans lui", () => {
    expect(fr.home.top.meta(11, 7, "6 j 1 h")).toBe("Novembre, fin dans 6\u00a0j 1\u00a0h");
    expect(en.home.top.meta(11, 1, "6d 1h")).toBe("November, ends in 6d 1h");
    expect(fr.home.top.meta(11, 0, "2 min")).toBe("Novembre, fin dans 2\u00a0min");
  });

  it("accueil : à partir de 20, il s'affiche", () => {
    expect(fr.home.top.meta(11, 20, "6 j 1 h")).toBe("Novembre, 20 fiches, fin dans 6\u00a0j 1\u00a0h");
    expect(en.home.top.meta(11, 132, "1h 5min")).toBe("November, 132 sheets, ends in 1h 5min");
  });

  it("après-fiche : le rang, avec le total seulement à partir de 20", () => {
    expect(fr.result.week.line(7, 12, 3)).toBe("7e ce mois-ci, à 3 points du top 5");
    expect(fr.result.week.line(7, 40, 1)).toBe("7e sur 40 ce mois-ci, à 1 point du top 5");
    expect(en.result.week.line(7, 19, 2)).toBe("#7 this month, 2 points from the top 5");
    expect(en.result.week.line(7, 20, 2)).toBe("#7 of 20 this month, 2 points from the top 5");
    expect(fr.result.week.closedLine(8, 9, 10)).toBe("8e en octobre");
    expect(en.result.week.closedLine(8, 90, 10)).toBe("#8 of 90 in October");
    expect(fr.result.week.closedTop5(10)).toBe("Top 5 d'octobre");
    expect(fr.result.week.closedTop5(11)).toBe("Top 5 de novembre");
    expect(en.result.week.closedTop5(12)).toBe("Top 5 of December");
  });

  it("le temps restant : jamais une unité à zéro (« 1 j », pas « 1 j 0 h »)", () => {
    expect(fr.home.top.left(1, 0, 12)).toBe("1\u00a0j");
    expect(fr.home.top.left(6, 1, 0)).toBe("6\u00a0j 1\u00a0h");
    expect(fr.home.top.left(0, 5, 0)).toBe("5\u00a0h");
    expect(fr.home.top.left(0, 1, 5)).toBe("1\u00a0h 5\u00a0min");
    expect(fr.home.top.left(0, 0, 2)).toBe("2\u00a0min");
    expect(en.home.top.left(1, 0, 12)).toBe("1 day");
    expect(en.home.top.left(3, 0, 0)).toBe("3 days");
    expect(en.home.top.left(2, 3, 0)).toBe("2d 3h");
    expect(en.home.top.left(0, 1, 0)).toBe("1h");
    for (const s of [fr.home.top.left(1, 0, 0), fr.home.top.left(0, 4, 0), en.home.top.left(1, 0, 0), en.home.top.left(0, 4, 0)]) expect(s).not.toMatch(/\b0/);
  });
});
