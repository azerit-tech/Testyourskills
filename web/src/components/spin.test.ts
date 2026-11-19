// La caisse du suspect (SPEC §18.79) : la berline qu'on fait tourner au doigt, sous la fiche.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LangProvider } from "../i18n";
import { Spin } from "./Spin";
import { coast, COAST_MAX, dragTo, FRAMES, loadOrder, Lru, nearest, POSTER, pxPerFrame, releaseSpeed, stillOnly, wrap } from "./spinCore";

const dir = join(__dirname, "spin");
const css = readFileSync(join(__dirname, "spin.css"), "utf8");
const page = readFileSync(join(__dirname, "../pages/CardPage.tsx"), "utf8");
const home = readFileSync(join(__dirname, "../pages/Home.tsx"), "utf8");

function render(ready: boolean, lang = "fr-FR", place: "card" | "home" = "card"): string {
  vi.stubGlobal("window", {
    location: { origin: "https://skills.test", pathname: "/c/x", search: "" },
    matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("navigator", { userAgent: "test", language: lang });
  return renderToStaticMarkup(createElement(LangProvider, null, createElement(Spin, { ready, place })));
}

afterEach(() => vi.unstubAllGlobals());

describe("les images du tour", () => {
  it("144 images AVIF numérotées de 000 à 143, plus l'image au repos en JPEG pour les navigateurs sans AVIF", () => {
    const files = readdirSync(dir);
    const avif = files.filter((f) => f.endsWith(".avif")).sort();
    expect(avif).toHaveLength(FRAMES);
    expect(avif[0]).toBe("000.avif");
    expect(avif[FRAMES - 1]).toBe("143.avif");
    expect(files).toContain("poster.jpg");
  });

  it("1,5 Mo au plus pour tout le tour", () => {
    const total = readdirSync(dir)
      .filter((f) => f.endsWith(".avif"))
      .reduce((n, f) => n + statSync(join(dir, f)).size, 0);
    expect(total).toBeLessThanOrEqual(1.5 * 1024 * 1024);
  });
});

describe("le tour", () => {
  it("boucle sans saut : après 143 vient 0", () => {
    expect(wrap(144)).toBe(0);
    expect(wrap(-1)).toBe(143);
    expect(wrap(143.6)).toBe(0);
  });

  it("un tour pour une largeur et demie glissée ; vers la droite, les images reculent", () => {
    expect(pxPerFrame(360)).toBeCloseTo(3.75);
    expect(dragTo(POSTER, 360 * 1.5, 360)).toBeCloseTo(POSTER - FRAMES);
    expect(dragTo(POSTER, 30, 360)).toBeLessThan(POSTER);
  });

  it("charge l'image au repos d'abord, puis de plus en plus fin, chaque image une fois", () => {
    const order = loadOrder();
    expect(order[0]).toBe(POSTER);
    expect(new Set(order).size).toBe(FRAMES);
    expect(order.slice(1, 9)).toEqual([12, 28, 44, 60, 76, 92, 108, 124]);
  });

  it("une image manque : la plus proche la remplace, de part et d'autre", () => {
    const has = (j: number) => j === 10 || j === 140;
    expect(nearest(12, has)).toBe(10);
    expect(nearest(2, has)).toBe(140);
    expect(nearest(5, () => false)).toBeNull();
  });

  it("l'élan se freine en douceur et s'arrête", () => {
    let v = COAST_MAX;
    let t = 0;
    while (v !== 0 && t < 5000) {
      const next = coast(v, 16);
      expect(Math.abs(next)).toBeLessThan(Math.abs(v));
      v = next;
      t += 16;
    }
    expect(v).toBe(0);
    expect(t).toBeLessThan(1500);
  });

  it("au lâcher, la vitesse du geste, bornée ; pas d'élan si le doigt s'est arrêté", () => {
    const s = [
      { t: 0, pos: 0 },
      { t: 16, pos: 0.5 },
      { t: 32, pos: 1 },
    ];
    expect(releaseSpeed(s, 40)).toBeCloseTo(1 / 32);
    expect(releaseSpeed(s, 300)).toBe(0);
    expect(releaseSpeed([{ t: 0, pos: 0 }, { t: 10, pos: 50 }], 12)).toBe(COAST_MAX);
    expect(releaseSpeed([{ t: 0, pos: 0 }], 5)).toBe(0);
  });

  it("dix images décodées au plus en mémoire ; les plus anciennes sont rendues", () => {
    const dropped: number[] = [];
    const lru = new Lru<number>(10, (v) => dropped.push(v));
    for (let i = 0; i < 14; i++) lru.set(i, i);
    expect(lru.size).toBe(10);
    expect(dropped).toEqual([0, 1, 2, 3]);
    lru.get(4);
    lru.set(99, 99);
    expect(lru.has(4)).toBe(true);
    expect(dropped).toContain(5);
    lru.clear();
    expect(lru.size).toBe(0);
  });

  it("économie de données ou 2G : l'image fixe seule", () => {
    expect(stillOnly({ connection: { saveData: true } })).toBe(true);
    expect(stillOnly({ connection: { effectiveType: "2g" } })).toBe(true);
    expect(stillOnly({ connection: { effectiveType: "slow-2g" } })).toBe(true);
    expect(stillOnly({ connection: { effectiveType: "4g" } })).toBe(false);
    expect(stillOnly({})).toBe(false);
  });
});

describe("l'encart", () => {
  it("pendant le film, rien ne se télécharge, pas même l'image au repos ; la place est gardée", () => {
    const html = render(false);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<source");
    expect(html).toContain('class="spin"');
    expect(css).toMatch(/\.spin \{[^}]*aspect-ratio: 2 \/ 1;/);
  });

  it("le film fini : l'image fixe, AVIF avec un repli JPEG, à sa taille, lue « la caisse du suspect »", () => {
    const html = render(true);
    expect(html).toMatch(/<picture><source srcSet="[^"]*140\.avif[^"]*" type="image\/avif"\/><img class="spin-still" src="[^"]*poster\.jpg[^"]*" width="960" height="480"/);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="La caisse du suspect : une berline rouge des années 60, vue de trois quarts avant."');
    // l'indication ne paraît qu'une fois la rotation prête
    expect(html).not.toContain("spin-hint");
  });

  it("le titre est une légende au-dessus de l'image, jamais posé sur la voiture", () => {
    const html = render(true);
    expect(html).toMatch(/^<figure class="spin-wrap is-card"><figcaption class="spin-title announce" aria-hidden="true">La caisse du suspect<\/figcaption><div[^>]* class="spin"/);
    expect(css).not.toMatch(/\.spin-title \{[^}]*position: absolute/);
  });

  it("sur l'accueil : « La caisse de la poursuite », sans fiche, en français et en anglais", () => {
    const fr = render(true, "fr-FR", "home");
    expect(fr).toContain('class="spin-wrap is-home"');
    expect(fr).toContain(">La caisse de la poursuite</figcaption>");
    expect(fr).not.toContain("suspect");
    expect(render(true, "en-US", "home")).toContain(">The getaway car</figcaption>");
  });

  it("sur l'accueil, sous la fiche d'exemple (la scène, §18.81), jamais au-dessus du champ ; l'accueil n'a pas de film", () => {
    expect(home.match(/<Spin /g)).toHaveLength(1);
    expect(home).toMatch(/<ExampleCard \{\.\.\.showcase\} \/>\n(?:\s*<\/div>\n){2}[^\n]*\n\s*<\/div>\n[^\n]*\n\s*<div className="home-proof">\n[^\n]*§18\.79[^\n]*\n\s*<Spin ready place="home" \/>\n\s*<WeekBoard /);
    expect(home.indexOf("<Spin ")).toBeGreaterThan(home.indexOf("<EntryForm inputRef"));
  });

  it("en anglais", () => {
    expect(render(true, "en-US")).toContain("The suspect&#x27;s ride");
  });

  it("seul le geste horizontal est pris ; le défilement vertical reste à la page", () => {
    expect(css).toMatch(/\.spin \{[^}]*touch-action: pan-y;/);
  });

  it("sous la fiche, juste après le bloc de partage, une seule ligne dans la page", () => {
    expect(page.match(/<Spin /g)).toHaveLength(1);
    expect(page).toMatch(/<ShareBar [^\n]*\n[^\n]*§18\.79[^\n]*\n\s*<Spin ready=\{settled\} \/>/);
  });
});
