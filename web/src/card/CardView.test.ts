// Les options de CardView, désactivées par défaut : la vitrine, le top et la
// révélation ne changent pas tant qu'on ne les demande pas.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../../../shared/fixtures";
import { CardView, CardViewOptions } from "./CardView";

const card = { ...FIXTURES.silver, avatarUrl: undefined };

describe("la fiche se retourne", () => {
  it("désactivé par défaut : pas de dos, pas de bouton", () => {
    const html = renderToStaticMarkup(createElement(CardView, { card }));
    expect(html).not.toContain("tys-card__flip");
    expect(html).not.toContain('data-side="back"');
  });

  it("activé : le dos est là, caché, et le bouton rond se lit en FR et en EN", () => {
    const fr = renderToStaticMarkup(createElement(CardView, { card, lang: "fr", flippable: true }));
    expect(fr).toContain('data-side="back"');
    expect(fr).toContain('aria-label="Retourner la fiche"');
    expect(fr).toContain('aria-pressed="false"');
    expect(fr).toMatch(/class="tys-card__face tys-card__back" aria-hidden="true"/);
    const en = renderToStaticMarkup(createElement(CardView, { card, lang: "en", flippable: true }));
    expect(en).toContain('aria-label="Flip the card"');
  });

  it("se branche par le contexte, et seulement sur une fiche interactive", () => {
    const viaContext = renderToStaticMarkup(createElement(CardViewOptions.Provider, { value: { flippable: true } }, createElement(CardView, { card })));
    expect(viaContext).toContain("tys-card__flip");
    const still = renderToStaticMarkup(createElement(CardView, { card, flippable: true, interactive: false }));
    expect(still).not.toContain("tys-card__flip");
  });
});
