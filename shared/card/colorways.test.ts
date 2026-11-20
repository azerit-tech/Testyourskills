// Les coloris de la fiche (SPEC §18.102) : lisibles, distincts, stables.
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { caseCard } from "../caseFile";
import { FIXTURES, FIXTURE_COMPARISON } from "../fixtures";
import { publicView } from "../publicView";
import { CardGraphic } from "./Card";
import { COLORWAYS, COLORWAY_KEYS, colorwayFromId, colorwayOf, isColorway, randomColorway } from "./colorways";
import { PALETTE, THEMES, themeFor, themeOf, type ThemeKey } from "./themes";

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
/** Contraste WCAG 2. */
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** `a` posé à l'opacité `t` sur `b`. */
const over = (a: string, b: string, t: number) =>
  "#" + rgb(a).map((v, i) => Math.round((v * t + rgb(b)[i]! * (1 - t)) * 255).toString(16).padStart(2, "0")).join("");
/** Distance en OKLab (×100), pour juger que deux coloris ne se confondent pas. */
const oklab = (hex: string) => {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
const dist = (a: string, b: string) => {
  const [p, q] = [oklab(a), oklab(b)];
  return 100 * Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
};

describe("les douze coloris", () => {
  it("douze, nommés en français et en anglais", () => {
    expect(COLORWAY_KEYS).toHaveLength(12);
    for (const k of COLORWAY_KEYS) {
      expect(COLORWAYS[k].key).toBe(k);
      expect(COLORWAYS[k].label.fr).toBeTruthy();
      expect(COLORWAYS[k].label.en).toBeTruthy();
    }
  });

  it.each(COLORWAY_KEYS)("%s : le crème et l'encre douce se lisent sur le fond (WCAG)", (k) => {
    const cw = COLORWAYS[k];
    // La note, les noms, les valeurs : crème plein, AAA sur les deux bouts du fond.
    for (const bg of cw.bg) expect(contrast(PALETTE.cream, bg)).toBeGreaterThanOrEqual(7);
    // Les étiquettes : l'encre douce à 70 %, AA pour du petit texte, au plus clair du fond.
    expect(contrast(over(cw.inkSoft, cw.bg[0], 0.7), cw.bg[0])).toBeGreaterThanOrEqual(4.5);
    // Les barres : un élément graphique, 3:1 au moins sur le bas du fond (où elles sont).
    expect(contrast(cw.bar, cw.bg[1])).toBeGreaterThanOrEqual(3);
    // Les silhouettes ton sur ton restent dans le ton : pas noires, pas plus claires que le haut du fond d'un cran visible.
    expect(contrast(cw.horizon, cw.bg[0])).toBeLessThan(1.3);
  });

  it.each(COLORWAY_KEYS)("%s : les ciels peints gardent le crème lisible (note, étoiles, niveau)", (k) => {
    for (const sky of [COLORWAYS[k].sky5, COLORWAYS[k].sky6]) {
      // La note et les étoiles sont sur le haut du ciel ; le nom du niveau, aux trois quarts.
      expect(contrast(PALETTE.cream, sky.stops[0])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(PALETTE.cream, sky.stops[1])).toBeGreaterThanOrEqual(4.5);
      const level = over(sky.stops[2], sky.stops[1], (0.735 - 0.5) / 0.34);
      expect(contrast(PALETTE.cream, level)).toBeGreaterThanOrEqual(2.8);
      // Le sol, où tout le reste de la fiche s'écrit.
      expect(contrast(PALETTE.cream, sky.ground)).toBeGreaterThanOrEqual(7);
      expect(contrast(over(COLORWAYS[k].inkSoft, sky.ground, 0.7), sky.ground)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("deux coloris ne se confondent pas, ni au fond ni au ciel de ★★★★★", () => {
    for (let i = 0; i < COLORWAY_KEYS.length; i++) {
      for (let j = i + 1; j < COLORWAY_KEYS.length; j++) {
        const [a, b] = [COLORWAYS[COLORWAY_KEYS[i]!], COLORWAYS[COLORWAY_KEYS[j]!]];
        expect(dist(a.bg[0], b.bg[0]), `${a.key} / ${b.key}`).toBeGreaterThan(4);
        expect(dist(a.sky5.stops[0], b.sky5.stops[0]) + dist(a.sky5.stops[1], b.sky5.stops[1]), `${a.key} / ${b.key} (ciel)`).toBeGreaterThan(8);
      }
    }
  });
});

describe("le coloris d'une fiche", () => {
  it("tiré de l'id quand la fiche n'en a pas rangé : toujours le même", () => {
    expect(colorwayFromId("AbCdEf123")).toBe(colorwayFromId("AbCdEf123"));
    expect(colorwayOf({ id: "AbCdEf123" })).toBe(colorwayFromId("AbCdEf123"));
    // Mille ids : les douze coloris sortent, aucun n'écrase les autres.
    const n = new Map<string, number>();
    for (let i = 0; i < 1200; i++) {
      const k = colorwayFromId(`id${i.toString(36)}x${(i * 7919).toString(36)}`);
      n.set(k, (n.get(k) ?? 0) + 1);
    }
    expect(n.size).toBe(12);
    for (const c of n.values()) expect(c).toBeGreaterThan(50);
  });

  it("le coloris rangé passe devant celui de l'id ; une valeur inconnue est ignorée", () => {
    const id = "AbCdEf123";
    const other = COLORWAY_KEYS.find((k) => k !== colorwayFromId(id))!;
    expect(colorwayOf({ id, colorway: other })).toBe(other);
    expect(colorwayOf({ id, colorway: "fuchsia" as never })).toBe(colorwayFromId(id));
    expect(colorwayOf({})).toBe("marine");
    expect(isColorway("sarcelle")).toBe(true);
    expect(isColorway("sarcelles")).toBe(false);
  });

  it("au hasard à la naissance : chaque coloris peut sortir", () => {
    expect(COLORWAY_KEYS.map((_, i) => randomColorway(() => i))).toEqual([...COLORWAY_KEYS]);
  });

  it("le thème prend le coloris ; la forme reste celle du niveau", () => {
    const keys: ThemeKey[] = ["s1", "s2", "s3", "s4", "s5", "s6", "wonderkid", "flashback", "totw"];
    for (const key of keys) {
      const a = themeFor(key, COLORWAYS.corail);
      const b = themeFor(key, COLORWAYS.sarcelle);
      expect(a.bg).not.toEqual(b.bg);
      expect({ ...a, bg: 0, sky: !!a.sky, horizon: a.horizon?.scale, palm: !!a.palm, bar: 0, inkSoft: 0, accent: 0, accent2: 0, colorway: 0 }).toEqual({
        ...b, bg: 0, sky: !!b.sky, horizon: b.horizon?.scale, palm: !!b.palm, bar: 0, inkSoft: 0, accent: 0, accent2: 0, colorway: 0,
      });
    }
    expect(themeFor("s6", COLORWAYS.olive).rim).toBe(true);
    expect(THEMES.s5.rim).toBe(false);
    expect(themeOf({ ...FIXTURES.gold, colorway: "menthe" }).colorway).toBe("menthe");
  });

  it("le dessin de la fiche suit son coloris, et seulement lui", () => {
    const svg = (colorway: (typeof COLORWAY_KEYS)[number]) => renderToStaticMarkup(createElement(CardGraphic, { card: { ...FIXTURES.silver, colorway }, idPrefix: "t" }));
    expect(svg("prune")).toContain(COLORWAYS.prune.bg[0]);
    expect(svg("prune")).not.toContain(COLORWAYS.cyan.bg[0]);
    expect(svg("cyan")).toBe(svg("cyan"));
  });

  it("un dossier montre son coloris ; la vue publique le garde", () => {
    const cmp = { ...FIXTURE_COMPARISON, colorway: "lavande" as const };
    expect(caseCard(cmp).colorway).toBe("lavande");
    // Une pièce n'impose pas le sien au dossier.
    expect(caseCard({ ...FIXTURE_COMPARISON, github: { ...FIXTURE_COMPARISON.github, colorway: "olive" } }).colorway).toBeUndefined();
    expect(publicView(cmp, { thirdParty: false }).file!.colorway).toBe("lavande");
    expect(publicView({ ...FIXTURES.gold, colorway: "corail" }, { thirdParty: true }).colorway).toBe("corail");
  });
});
