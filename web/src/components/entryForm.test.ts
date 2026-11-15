// Le formulaire d'entrée de l'accueil (§18.48), rendu en chaîne : ce que dit le
// premier rendu, sans navigateur ni serveur.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LangProvider } from "../i18n";
import { EntryForm } from "./EntryForm";

function render(language = "fr-FR", props: { secondary?: boolean; variant?: "full" | "inline" } = {}): string {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("navigator", { language });
  return renderToStaticMarkup(createElement(LangProvider, null, createElement(EntryForm, props)));
}

afterEach(() => vi.unstubAllGlobals());

describe("le formulaire d'entrée de l'accueil", () => {
  it("porte LinkedIn d'abord : sous le champ, ce qu'elle sait lire", () => {
    const html = render();
    expect(html).toMatch(/<p id="[^"]+-note" class="entry-hint">Profil public seulement\.<\/p>/);
    expect(render("en-US")).toContain("Public profile only.");
    // Le second formulaire de la page dit la même chose.
    expect(render("fr-FR", { secondary: true })).toContain("Profil public seulement.");
  });

  it("le CV est à un lien, un seul : plus de « ou les deux » depuis l'accueil", () => {
    const html = render();
    expect(html).toContain("Plutôt avec ton CV");
    expect(html).not.toContain("ou les deux");
  });

  it("le formulaire court d'une fiche (« Et toi ? ») ne change pas", () => {
    expect(render("fr-FR", { variant: "inline" })).not.toContain("entry-hint");
  });
});
