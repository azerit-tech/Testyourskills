// Dossier scellé (shared/publicView.ts) : un dossier vide fait par un tiers, pas
// encore revendiqué. La face et le dos ne disent ni la note ni les étoiles ; une
// fiche non scellée rend exactement comme avant (tests de rendu existants).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../fixtures";
import type { CardData, Lang } from "../types";
import { CardGraphic, sealedFace } from "./Card";
import { CardBackGraphic } from "./CardBack";

const LANGS: Lang[] = ["fr", "en"];
const sealed: CardData = { ...FIXTURES.silver, overall: 20, sealed: true };
const face = (card: CardData, lang: Lang) => renderToStaticMarkup(createElement(CardGraphic, { card, lang, avatarHref: "" }));
const back = (card: CardData, lang: Lang) => renderToStaticMarkup(createElement(CardBackGraphic, { card, lang }));
/** La note en grand (118, ou 92 à 100) sur la face ; « = n » sur le dos. */
const BIG_NOTE = /font-size="(118|92)"/;

describe("dossier scellé", () => {
  it("la face : ni note, ni niveau, ni étoiles ; « Dossier scellé », « Le code reste à prouver »", () => {
    for (const lang of LANGS) {
      const svg = face(sealed, lang);
      expect(svg).not.toMatch(BIG_NOTE);
      expect(svg).not.toContain("tys-star-on");
      expect(svg).not.toContain("data-stars");
      expect(svg).toContain("data-sealed");
      expect(svg).toContain(lang === "fr" ? "SCELLÉ" : "SEALED");
      expect(svg).toContain(lang === "fr" ? "PROUVER" : "PROVE");
      expect(svg).not.toMatch(lang === "fr" ? /étoile/ : /\bstars?\b/);
    }
  });

  it("le dos : ni étoiles, ni formule, ni « = 20 »", () => {
    for (const lang of LANGS) {
      const svg = back(sealed, lang);
      expect(svg).not.toContain("= 20");
      expect(svg).not.toContain("tys-star-on");
      expect(svg).toContain(lang === "fr" ? "Le code reste à prouver" : "Code yet to prove");
    }
  });

  it("le titre tient à gauche de la photo, entier, en deux lignes au plus", () => {
    for (const lang of LANGS) {
      const f = sealedFace(lang, 150);
      expect(f.title.truncated).toBe(false);
      expect(f.title.lines.length).toBeLessThanOrEqual(2);
      expect(f.sub.truncated).toBe(false);
    }
  });

  it("non scellée : la note et les étoiles, comme avant", () => {
    const svg = face({ ...sealed, sealed: undefined }, "fr");
    expect(svg).toMatch(BIG_NOTE);
    expect(svg).toContain("tys-star-on");
    expect(svg).not.toContain("data-sealed");
  });
});
