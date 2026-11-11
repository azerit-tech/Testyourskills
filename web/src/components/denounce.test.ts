// La fiche du complice (§18.27) : les six étoiles, pleines puis vides, dans le titre comme dans le texte partagé.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../../../shared/fixtures";
import { starsFor } from "../../../shared/types";
import { starsLine } from "../../../shared/stars";
import { DICTS, LangProvider } from "../i18n";
import { Wanted } from "./Denounce";

afterEach(() => vi.unstubAllGlobals());

describe("Dénoncer : la fiche du complice", () => {
  it("affiche les six étoiles", () => {
    vi.stubGlobal("window", { location: { origin: "https://skills.test", pathname: "/", search: "" }, matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("localStorage", { getItem: () => "fr", setItem: () => undefined });
    const card = FIXTURES.gold;
    const six = starsLine(starsFor(card.overall));
    expect(six).toHaveLength(6);
    const html = renderToStaticMarkup(
      createElement(LangProvider, null, createElement(Wanted, { card, x: null, toast: () => undefined, onAgain: () => undefined })),
    );
    expect(html).toContain(`>${six}</span>`);
    // Dossier vide, pas encore revendiqué : aucune étoile.
    const sealed = renderToStaticMarkup(
      createElement(LangProvider, null, createElement(Wanted, { card: { ...card, sealed: true }, x: null, toast: () => undefined, onAgain: () => undefined })),
    );
    expect(sealed).not.toMatch(/[★☆]/);
    expect(sealed).not.toContain("denounce-stars");
  });

  it("le texte partagé porte les six étoiles", () => {
    expect(DICTS.fr.denounce.shareText("@leamd", starsLine(5), "Sous couverture", null, "https://x.test")).toBe(
      "@leamd est dans le viseur ★★★★★☆ · Sous couverture. Droit de faire appel : https://x.test",
    );
  });

  it("dossier scellé : ni étoiles dans le titre, ni dans le texte partagé", () => {
    expect(DICTS.fr.denounce.shareText("@camroux", "", "Sous couverture", null, "https://x.test")).toBe(
      "@camroux est dans le viseur · Sous couverture. Droit de faire appel : https://x.test",
    );
    expect(DICTS.en.denounce.shareText("@camroux", "", "Undercover", null, "https://x.test")).toBe(
      "@camroux is in the crosshairs · Undercover. Right to appeal: https://x.test",
    );
  });
});
