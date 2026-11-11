import { describe, expect, it } from "vitest";
import { tierFor } from "../../../shared/types";
import { overallOf, reliabilityOf, specialOf, initialsOf, cleanCompany } from "./common";
import { SCORING } from "./config";
import { clampScore, interpolate, scoreOn } from "./scale";

describe("échelles linéaires par morceaux", () => {
  const ship = SCORING.github.SHIP.scale;

  it("rend la valeur exacte sur chaque point", () => {
    for (const [x, y] of ship) expect(interpolate(ship, x)).toBe(y);
  });

  it("interpole entre deux points", () => {
    // 13 → 50, 26 → 70 : 19,5 → 60
    expect(interpolate(ship, 19.5)).toBe(60);
    expect(scoreOn(ship, 31)).toBe(Math.round(70 + (5 / 14) * 15));
  });

  it("borne en dehors des points", () => {
    expect(interpolate(ship, -5)).toBe(20);
    expect(interpolate(ship, 80)).toBe(99);
    expect(interpolate(ship, Number.NaN)).toBe(20);
  });

  it("arrondit et borne à 1..99, bonus compris", () => {
    expect(clampScore(99.6)).toBe(99);
    expect(clampScore(-3)).toBe(1);
    expect(clampScore(54.5)).toBe(55);
    expect(scoreOn(ship, 52, SCORING.github.SHIP.releaseBonus)).toBe(99);
  });

  it("XP : échelle du §4.4", () => {
    const xp = SCORING.github.XP.scale;
    expect(scoreOn(xp, 0)).toBe(25);
    expect(scoreOn(xp, 1)).toBe(40);
    expect(scoreOn(xp, 2)).toBe(50);
    expect(scoreOn(xp, 12)).toBe(99);
    expect(scoreOn(xp, 30)).toBe(99);
  });
});

describe("globale, tiers, spéciales, fiabilité", () => {
  it("pondère TEC 30, SHIP 20, ARCH 20, DOC 15, XP 15 et ignore BUZZ", () => {
    const v = { TEC: 80, SHIP: 70, ARCH: 60, DOC: 50, XP: 40, BUZZ: 99 };
    expect(overallOf(v)).toBe(Math.round(24 + 14 + 12 + 7.5 + 6));
    expect(overallOf({ ...v, BUZZ: 1 })).toBe(overallOf(v));
    const w = SCORING.weights;
    expect(w.TEC + w.SHIP + w.ARCH + w.DOC + w.XP).toBeCloseTo(1);
  });

  it("tiers aux bornes du §3.2", () => {
    expect(tierFor(59)).toBe("bronze");
    expect(tierFor(60)).toBe("silver");
    expect(tierFor(74)).toBe("silver");
    expect(tierFor(75)).toBe("gold");
    expect(tierFor(89)).toBe("gold");
    expect(tierFor(90)).toBe("icon");
  });

  it("wonderkid : XP < 45 et TEC ≥ 70, prioritaire sur flashback", () => {
    const base = { TEC: 70, SHIP: 50, ARCH: 50, DOC: 50, XP: 44, BUZZ: 10 };
    expect(specialOf(base, false)).toBe("wonderkid");
    expect(specialOf({ ...base, XP: 45 }, false)).toBeUndefined();
    expect(specialOf({ ...base, TEC: 69 }, false)).toBeUndefined();
    expect(specialOf(base, true)).toBe("wonderkid");
    expect(specialOf({ ...base, XP: 90 }, true)).toBe("flashback");
  });

  it("fiabilité : 19 par axe suffisant hors BUZZ, max 95", () => {
    const stat = (code: "TEC" | "SHIP" | "ARCH" | "DOC" | "XP" | "BUZZ", sufficient: boolean) => ({ code, value: 50, sufficient, facts: [] });
    const all = (["TEC", "SHIP", "ARCH", "DOC", "XP", "BUZZ"] as const).map((c) => stat(c, true));
    expect(reliabilityOf(all)).toBe(95);
    expect(reliabilityOf(all.map((s) => (s.code === "TEC" ? { ...s, sufficient: false } : s)))).toBe(76);
    expect(reliabilityOf(all.map((s) => (s.code === "BUZZ" ? { ...s, sufficient: false } : s)))).toBe(95);
    expect(reliabilityOf(all.map((s) => ({ ...s, sufficient: false })))).toBe(0);
  });

  it("initiales et club", () => {
    expect(initialsOf("Sindre Sorhus")).toBe("SS");
    expect(initialsOf("kevin-dev42")).toBe("KD");
    expect(initialsOf("torvalds")).toBe("TO");
    expect(initialsOf("Élodie")).toBe("EL");
    expect(cleanCompany("@vercel ")).toBe("vercel");
    expect(cleanCompany("  ")).toBeNull();
    expect(cleanCompany(null)).toBeNull();
  });
});
