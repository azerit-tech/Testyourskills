// L'image d'aperçu de l'accueil : la promesse et une fiche, en 1200 × 630.

import { describe, expect, it } from "vitest";
import { FIXTURES } from "../../../shared/fixtures";
import { HOME_PROMISE } from "../../../shared/promise";
import { IMAGE_WORDS } from "./compositions";
import { renderImage, renderSvg } from "./index";

// Sans photo : le rendu ne touche pas au réseau.
const card = { ...FIXTURES.jmougeot, avatarUrl: undefined };

describe("image de l'accueil", () => {
  it("porte la promesse et l'invitation, en français et en anglais", async () => {
    const fr = await renderSvg({ format: "home", card, lang: "fr" });
    expect(fr).toContain(`viewBox="0 0 1200 630"`);
    // Le titre de l'accueil, de shared/promise.ts : deux moitiés de deux lignes (§18.103).
    for (const line of ["DÉCOUVRE À QUEL POINT", "TU ES RECHERCHÉ", "PAR LES", "RECRUTEURS !"]) expect(fr).toContain(`>${line}</text>`);
    expect(fr.toUpperCase()).not.toContain("DIT SENIOR");
    // Aucune prime ouverte (data/season.json) : l'aperçu ne promet pas d'entretien.
    expect(fr).not.toMatch(/entretien/i);
    // L'appel de l'accueil : on y fait sa fiche (« la tienne » n'a rien à quoi se rapporter ici).
    expect(fr).toContain(`>${IMAGE_WORDS.fr.home} :</text>`);
    expect(fr).not.toContain("Fais la tienne");
    const en = await renderSvg({ format: "home", card, lang: "en" });
    expect(en).toContain(`>${IMAGE_WORDS.en.home}:</text>`);
    for (const line of ["SEE HOW MUCH", "RECRUITERS", "WANT", "YOUR PROFILE!"]) expect(en).toContain(`>${line}</text>`);
  });

  /** Ce que la colonne de droite pose, de haut en bas : les lignes du titre, l'appel, les toits et les fenêtres du décor. */
  function column(svg: string) {
    const title = [...svg.matchAll(/<text x="558" y="(\d+)"[^>]*font-size="([\d.]+)"/g)].map((m) => ({ y: Number(m[1]), size: Number(m[2]) }));
    const pill = /<g data-cta=""><rect x="560" y="(\d+)" width="([\d.]+)" height="(\d+)"/.exec(svg)!;
    // Immeubles et fenêtres éclairées du front de mer, là où ils passent sous la colonne de texte.
    const roofs = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="[\d.]+" fill="(?:#463b84|#1d1946|#ffc46b)"/g)]
      .filter((m) => Number(m[1]) + Number(m[3]) > 540)
      .map((m) => Number(m[2]));
    const sun = /<circle cx="([\d.]+)" cy="[\d.]+" r="([\d.]+)"/.exec(svg)!;
    return { title, pillTop: Number(pill[1]), pillBottom: Number(pill[1]) + Number(pill[3]), pillRight: 560 + Number(pill[2]), roof: Math.min(...roofs), sunRight: Number(sun[1]) + Number(sun[2]) };
  }

  it("le titre et l'appel ne mordent pas sur le décor : les toits restent sous l'appel, le soleil derrière la fiche", async () => {
    for (const lang of ["fr", "en"] as const) {
      const c = column(await renderSvg({ format: "home", card, lang }));
      expect(c.title).toHaveLength(4);
      expect(Math.max(...c.title.map((l) => l.y))).toBeLessThanOrEqual(c.pillTop - 20);
      expect(c.pillBottom).toBeLessThanOrEqual(c.roof - 8);
      expect(c.pillRight).toBeLessThanOrEqual(1200 - 64);
      expect(c.sunRight).toBeLessThan(560);
    }
  });

  it("le titre de l'accueil peut changer (shared/promise.ts) : ses quatre lignes tiennent entières, au-dessus de l'appel", async () => {
    const next = {
      fr: { claim: ["Ta fiche", "de dev."], proof: ["Combien", "d’étoiles ?"] },
      en: { claim: ["Your dev", "rap sheet."], proof: ["How many", "stars?"] },
    } as const;
    for (const lang of ["fr", "en"] as const) {
      const kept = { ...HOME_PROMISE[lang] };
      Object.assign(HOME_PROMISE[lang], next[lang]);
      try {
        const svg = await renderSvg({ format: "home", card, lang });
        for (const line of [...next[lang].claim, ...next[lang].proof]) expect(svg).toContain(`>${line.toLocaleUpperCase(lang === "fr" ? "fr-FR" : "en-US")}</text>`);
        expect(svg).not.toContain("…</text>");
        const c = column(svg);
        expect(c.title[0]!.size).toBeGreaterThanOrEqual(88);
        expect(Math.max(...c.title.map((l) => l.y))).toBeLessThanOrEqual(c.pillTop - 20);
      } finally {
        Object.assign(HOME_PROMISE[lang], kept);
      }
    }
  });

  it("sort un PNG de 1200 × 630", async () => {
    const png = await renderImage({ format: "home", card, lang: "fr" });
    expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  }, 30_000);
});
