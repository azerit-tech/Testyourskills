// Page vue par un visiteur, sur téléphone (§18.48) : « Fais la tienne » est une barre fixe
// pleine largeur, la même pièce que la barre du pouce de la personne fichée ; plus de pilule flottante.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LangProvider } from "../i18n";
import { MakeYours } from "./MakeYours";

const css = readFileSync(join(__dirname, "../styles.css"), "utf8");
const page = readFileSync(join(__dirname, "../pages/CardPage.tsx"), "utf8");

function render(narrow: boolean, lang = "fr-FR"): string {
  vi.stubGlobal("window", {
    location: { origin: "https://skills.test", pathname: "/c/x", search: "" },
    matchMedia: (q: string) => ({ matches: q.includes("max-width") ? narrow : false, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("navigator", { userAgent: "test", language: lang });
  return renderToStaticMarkup(createElement(LangProvider, null, createElement(MakeYours, {})));
}

afterEach(() => vi.unstubAllGlobals());

describe("la barre « Fais la tienne » du visiteur", () => {
  it("écran étroit : la barre du pouce, un seul bouton rose, cachée tant qu'on ne sait pas ce qui est à l'écran", () => {
    const html = render(true);
    expect(html).toMatch(/^<div class="dock make-yours" role="region" aria-label="Fais la tienne" inert="">/);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('<button type="button" class="pill pill-big dock-main">Fais la tienne</button>');
    expect(render(true, "en-US")).toContain(">Get yours</button>");
  });

  it("pas sur ordinateur : le formulaire est sous la fiche, dans la colonne de droite", () => {
    expect(render(false)).toBe("");
    const desktop = css.slice(css.indexOf("/* ============ ordinateur ============ */"));
    expect(desktop).toMatch(/\.is-visitor \.result-top > \.you \{\s*grid-column: 2;/);
  });

  it("ordinateur, personne fichée : deux colonnes aussi, sa fiche à gauche qui suit le défilement, les blocs à droite", () => {
    const desktop = css.slice(css.indexOf("/* ============ ordinateur ============ */"));
    const own = "\\.page-result:not\\(\\.is-visitor\\)";
    // 360 px de fiche, 72 px d'air, 648 px de blocs : les 1 080 px du site.
    expect(desktop).toMatch(new RegExp(`${own} \\{\\s*display: grid;\\s*grid-template-columns: minmax\\(var\\(--gutter\\), 1fr\\) 360px 72px minmax\\(0, 648px\\) minmax\\(var\\(--gutter\\), 1fr\\);`));
    expect(360 + 72 + 648).toBe(1080);
    expect(desktop).toMatch(new RegExp(`${own} \\.result-stage \\{\\s*grid-column: 2;`));
    expect(desktop).toMatch(new RegExp(`${own} > \\.after \\{\\s*grid-column: 4;`));
    // L'en-tête et le bandeau « fiche cachée » prennent toute la largeur.
    expect(desktop).toMatch(new RegExp(`${own} \\.wanted \\{\\s*grid-column: 2 / 5;`));
    expect(desktop).toMatch(new RegExp(`${own} > \\.hidden-banner \\{\\s*grid-column: 2 / 5;`));
    // La fiche ne colle que sur un écran assez haut pour la montrer entière.
    expect(desktop).toMatch(new RegExp(`@media \\(min-width: 900px\\) and \\(min-height: 700px\\) \\{\\s*${own} \\.result-stage \\{\\s*position: sticky;`));
  });

  it("plus de pilule flottante : la barre prend toute la largeur, le bouton aussi", () => {
    expect(css).not.toMatch(/\.make-yours\s*\{/);
    expect(css).toMatch(/\.dock \{[^}]*right: 0;[^}]*left: 0;/);
    expect(css).toMatch(/\.dock \.dock-main \{[^}]*flex: 1;/);
  });

  it("la barre précède le toast dans la page, qui passe au-dessus d'elle", () => {
    const bar = page.indexOf("<MakeYours");
    const toast = page.indexOf("{toast.node}");
    expect(bar).toBeGreaterThan(0);
    expect(toast).toBeGreaterThan(bar);
    // 10 px + 52 px de bouton + 10 px : le toast part au-delà.
    const rule = /\.dock\.is-on ~ \.toast \{\s*bottom: calc\((\d+)px/.exec(css);
    expect(rule).not.toBeNull();
    expect(Number(rule![1])).toBeGreaterThan(10 + 52 + 10);
  });

  it("téléphones courts : la fiche rétrécit par sa hauteur, elle et son lien tiennent au-dessus de la barre", () => {
    const rule = /@media \(max-width: 640px\) \{\s*\.page-result \{[^}]*--card-w: clamp\((\d+)px, calc\(\(100svh - (\d+)px\) \* ([\d.]+)\), min\(360px, calc\(100vw - 32px\)\)\);/.exec(css);
    expect(rule).not.toBeNull();
    const [min, chrome, ratio] = rule!.slice(1).map(Number);
    // 128 px d'en-tête, 44 px de lien, 73 px de barre : à 375 × 667 et 360 × 640, tout tient.
    for (const [w, h] of [[375, 667], [360, 640], [390, 664]]) {
      const width = Math.max(min, Math.min((h - chrome) * ratio, 360, w - 32));
      expect(128 + width / (360 / 520) + 44).toBeLessThanOrEqual(h - 73);
    }
    // À 390 × 844, la fiche garde sa pleine largeur.
    expect(Math.min((844 - chrome) * ratio, 360, 390 - 32)).toBe(358);
    // À 320 × 568, la fiche au moins tient entière.
    expect(128 + min / (360 / 520)).toBeLessThanOrEqual(568 - 73);
  });

  it("qui a déjà sa fiche n'a pas de barre : « Ma fiche » est dans la barre du haut", () => {
    expect(page).toMatch(/visitor && settled && !other && <MakeYours/);
  });
});
