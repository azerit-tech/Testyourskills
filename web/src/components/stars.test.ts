// Les étoiles du site (SPEC §18.48) : un seul dessin, rempli de gauche à droite.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { litStars, StarMark, Stars } from "./Stars";

/** L'état de chaque étoile rendue, dans l'ordre de lecture. */
const states = (html: string) => [...html.matchAll(/class="star-shape( on)?"/g)].map((m) => !!m[1]);

describe("les étoiles", () => {
  it("s'allument de gauche à droite", () => {
    expect(litStars(4)).toEqual([true, true, true, true, false, false]);
    expect(litStars(0)).toEqual([false, false, false, false, false, false]);
    expect(litStars(6)).toEqual([true, true, true, true, true, true]);
  });

  it("restent entre zéro et le total, même sur une valeur douteuse", () => {
    expect(litStars(9).filter(Boolean)).toHaveLength(6);
    expect(litStars(-2).filter(Boolean)).toHaveLength(0);
    expect(litStars(Number.NaN).filter(Boolean)).toHaveLength(0);
    expect(litStars(3, 3)).toEqual([true, true, true]);
  });

  it("six formes par défaut, allumées d'abord", () => {
    const html = renderToStaticMarkup(createElement(Stars, { n: 2 }));
    expect(states(html)).toEqual([true, true, false, false, false, false]);
    expect(html).toContain('class="stars stars-14"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("trois tailles, et un libellé lu à la place du dessin", () => {
    for (const size of [14, 22, 26] as const) expect(renderToStaticMarkup(createElement(Stars, { n: 1, size }))).toContain(`stars-${size}`);
    const html = renderToStaticMarkup(createElement(Stars, { n: 5, size: 22, label: "5 étoiles sur 6" }));
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="5 étoiles sur 6"');
  });

  it("total égal à n : seulement les allumées", () => {
    expect(states(renderToStaticMarkup(createElement(Stars, { n: 4, total: 4 })))).toEqual([true, true, true, true]);
  });

  it("l'étoile seule devant un nombre est allumée", () => {
    expect(renderToStaticMarkup(createElement(StarMark))).toContain('class="star-shape on star-mark"');
  });

  it("le dessin vit une fois dans la feuille du site : crème pleine, contour quand elle est éteinte", () => {
    const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    const off = /\.star-shape \{([^}]*)\}/.exec(css)?.[1] ?? "";
    const on = /\.star-shape\.on \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(off).toContain("fill: none");
    expect(off).toContain("stroke: var(--star-off)");
    expect(on).toContain("fill: var(--star)");
  });
});
