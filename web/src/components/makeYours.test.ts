// Page vue par un visiteur, sur téléphone (§18.48) : « Faire ma fiche » est une barre fixe
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

function render(narrow: boolean, lang = "fr-FR", props: Record<string, unknown> = {}): string {
  vi.stubGlobal("window", {
    location: { origin: "https://skills.test", pathname: "/c/x", search: "" },
    matchMedia: (q: string) => ({ matches: q.includes("max-width") ? narrow : false, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("navigator", { userAgent: "test", language: lang });
  return renderToStaticMarkup(createElement(LangProvider, null, createElement(MakeYours, props)));
}

afterEach(() => vi.unstubAllGlobals());

describe("la barre « Faire ma fiche » du visiteur", () => {
  it("écran étroit : la barre du pouce, un seul bouton rose, cachée tant qu'on ne sait pas ce qui est à l'écran", () => {
    const html = render(true);
    expect(html).toMatch(/^<div class="dock make-yours" role="region" aria-label="Faire ma fiche" inert="">/);
    expect(html.match(/<button/g)).toHaveLength(1);
    // Un seul libellé pour une action : celui du formulaire.
    expect(html).toContain('<button type="button" class="pill pill-big dock-main">Faire ma fiche</button>');
    expect(render(true, "en-US")).toContain(">Get my rap sheet</button>");
  });

  it("fiche dénoncée qu'on peut reprendre : « C'est moi » en rose, « Faire ma fiche » en contour", () => {
    const html = render(true, "fr-FR", { watch: true, onLawyer: () => undefined });
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).toContain('<button type="button" class="pill pill-big dock-main">C&#x27;est moi</button>');
    expect(html).toContain('<button type="button" class="pill pill-big pill-ghost">Faire ma fiche</button>');
  });

  it("pas sur ordinateur : « À ton tour » ouvre la colonne de droite, sous la tête", () => {
    expect(render(false)).toBe("");
    const desktop = css.slice(css.indexOf("/* ============ ordinateur ============ */"));
    expect(desktop).toMatch(/\.page-result\.is-visitor > \.result-top > \.you \{\s*grid-column: 4;\s*grid-row: 2;/);
    // Fiche dénoncée : son bloc d'abord, « À ton tour » dessous.
    expect(desktop).toMatch(/\.page-result\.is-visitor\.is-wanted \.visitor-col \{\s*grid-row: 2;/);
  });

  it("ordinateur, pour tout le monde : deux colonnes, la fiche à gauche qui suit le défilement, les blocs à droite", () => {
    const desktop = css.slice(css.indexOf("/* ============ ordinateur ============ */"));
    const own = "\\.page-result";
    // 360 px de fiche, 72 px d'air, 648 px de blocs : les 1 080 px du site.
    expect(desktop).toMatch(new RegExp(`${own} \\{\\s*display: grid;\\s*grid-template-columns: minmax\\(var\\(--gutter\\), 1fr\\) 360px 72px minmax\\(0, 648px\\) minmax\\(var\\(--gutter\\), 1fr\\);`));
    expect(360 + 72 + 648).toBe(1080);
    expect(desktop).toMatch(new RegExp(`${own} \\.result-stage \\{\\s*grid-column: 2;`));
    expect(desktop).toMatch(new RegExp(`${own} > \\.after \\{\\s*grid-column: 4;`));
    // L'en-tête et le bandeau « fiche cachée » prennent toute la largeur.
    expect(desktop).toMatch(new RegExp(`${own} \\.wanted \\{\\s*grid-column: 2 / 5;`));
    expect(desktop).toMatch(new RegExp(`${own} > \\.hidden-banner \\{\\s*grid-column: 2 / 5;`));
    // Le visiteur : la fiche court le long des blocs de la colonne de droite.
    expect(desktop).toMatch(/\.page-result\.is-visitor \.result-stage \{\s*grid-row: 2 \/ 6;/);
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

  it("téléphones : la fiche garde au moins 92 % de la largeur, on fait défiler plutôt que de la réduire", () => {
    const rule = /@media \(max-width: 640px\) \{\s*\.page-result \{[^}]*--card-w: clamp\(calc\(\(100vw - 32px\) \* ([\d.]+)\), calc\(\(100svh - (\d+)px\) \* ([\d.]+)\), min\(360px, calc\(100vw - 32px\)\)\);/.exec(css);
    expect(rule).not.toBeNull();
    const [floor, chrome, ratio] = rule!.slice(1).map(Number);
    const width = (w: number, h: number) => Math.max(floor * (w - 32), Math.min((h - chrome) * ratio, 360, w - 32));
    // Les hauteurs réelles (Safari, navigateur de LinkedIn) : jamais sous 92 %.
    for (const [w, h] of [[390, 664], [375, 667], [360, 640], [320, 568]]) expect(width(w, h) / (w - 32)).toBeGreaterThanOrEqual(0.92);
    // À 390 × 844, pleine largeur.
    expect(Math.round(width(390, 844))).toBe(358);
    // Sous 760 px de haut, la tête se masque (la plaque de la fiche dit la même chose) ; « Revoir ma poursuite » passe sous la fiche.
    expect(css).toMatch(/@media \(max-width: 640px\) and \(max-height: 759px\) \{\s*\.page-result > \.result-top > \.wanted \{[^}]*clip-path: inset\(50%\);/);
    expect(page).toMatch(/\{chase && <div className="stage-chase">\{chase\}<\/div>\}/);
  });

  it("qui a déjà sa fiche : « Lui envoyer ma note » dans la barre, le geste du duel ; rien face à un dossier scellé", () => {
    expect(page).toMatch(/visitor && settled && \(!other \|\| duel\.send\) && <MakeYours watch=\{wantedYou\} onLawyer=\{lawyer\} onSend=\{other \? duel\.send : null\} \/>/);
    const html = render(true, "fr-FR", { onSend: () => undefined });
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('<button type="button" class="pill pill-big dock-main">Lui envoyer ma note</button>');
  });
});
