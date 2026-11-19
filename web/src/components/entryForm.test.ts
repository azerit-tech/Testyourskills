// Le formulaire d'entrée de l'accueil (§18.48, §18.80), rendu en chaîne : ce que dit le
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

/** Le formulaire rendu avec la configuration que le serveur écrit dans la page. */
async function renderWith(config: Record<string, boolean>, props: { variant?: "full" | "inline" } = {}): Promise<string> {
  vi.resetModules();
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("navigator", { language: "fr-FR" });
  vi.stubGlobal("document", { getElementById: (id: string) => (id === "tys-config" ? { textContent: JSON.stringify(config) } : null) });
  const [{ LangProvider: Provider }, { EntryForm: Form }] = await Promise.all([import("../i18n"), import("./EntryForm")]);
  return renderToStaticMarkup(createElement(Provider, null, createElement(Form, props)));
}

afterEach(() => vi.unstubAllGlobals());

describe("l'entrée par défaut : se connecter, rien à taper (§18.80)", () => {
  it("deux boutons empilés, LinkedIn d'abord et en rose, GitHub en contour ; ni champ, ni portes", () => {
    for (const variant of ["full", "inline"] as const) {
      const html = render("fr-FR", { variant });
      expect(html).toMatch(/class="pill pill-big entry-login"[^>]*>.*Se connecter avec LinkedIn<\/button>/);
      expect(html).toMatch(/class="pill pill-big pill-ghost entry-login"[^>]*>.*Se connecter avec GitHub<\/button>/);
      expect(html.indexOf("Se connecter avec LinkedIn")).toBeLessThan(html.indexOf("Se connecter avec GitHub"));
      expect(html).not.toContain("field-input");
      expect(html).not.toContain("entry-doors");
      expect(html).not.toContain("entry-submit");
      expect(html).not.toContain("field-prefix");
      expect(html).not.toContain("Où est mon lien");
    }
    const en = render("en-US");
    expect(en).toContain("Sign in with LinkedIn");
    expect(en).toContain("Sign in with GitHub");
  });

  it("dessous, une seule petite ligne : « ou avec ton CV · ou colle un lien »", () => {
    for (const variant of ["full", "inline"] as const) {
      const html = render("fr-FR", { variant });
      expect(html).toMatch(/entry-or[^>]*>.*ou avec ton CV<\/button><span aria-hidden="true">·<\/span>.*ou colle un lien<\/button><\/div>/);
      expect(html).not.toContain("Plutôt avec ton CV");
      expect(html).not.toContain("entry-hint");
    }
    expect(render("en-US")).toMatch(/or with your résumé<\/button>.*or paste a link<\/button>/);
    // Le second formulaire de la page dit la même chose.
    expect(render("fr-FR", { secondary: true })).toContain("ou colle un lien");
  });

  it("jamais de bouton mort : les deux boutons sont là, que le serveur ait réglé les connexions ou non", async () => {
    const configs: Record<string, boolean>[] = [{ linkedinEntry: true }, { linkedinEntry: true, linkedinSearch: true, linkedinLogin: true, githubLogin: true }];
    for (const config of configs) {
      const html = await renderWith(config);
      expect(html).toContain("Se connecter avec LinkedIn");
      expect(html).toContain("Se connecter avec GitHub");
      expect(html).not.toContain("disabled");
    }
  });

  it("le serveur ne lit pas LinkedIn : « Se connecter avec GitHub » seul, en rose", async () => {
    const html = await renderWith({ linkedinEntry: false, githubLogin: true });
    expect(html).not.toContain("Se connecter avec LinkedIn");
    expect(html).toMatch(/class="pill pill-big entry-login"[^>]*>.*Se connecter avec GitHub<\/button>/);
    expect(html).toContain("ou colle un lien");
  });
});
