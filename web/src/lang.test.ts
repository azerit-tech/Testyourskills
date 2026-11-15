// L'ordre du choix de la langue (§18.52) : `?lang=`, le choix enregistré, la langue de la fiche, le navigateur.
import { describe, expect, it } from "vitest";
import { cardLangOf, chooseLang, type LangFacts } from "./i18n";

const base: LangFacts = { query: null, stored: null, path: "/", card: null, nav: "en-US" };

describe("chooseLang", () => {
  it("prend `?lang=` avant tout, même contre un choix enregistré", () => {
    expect(chooseLang({ ...base, query: "fr", stored: "en", card: "en" })).toBe("fr");
    expect(chooseLang({ ...base, query: "en", stored: "fr", nav: "fr-FR" })).toBe("en");
  });

  it("ignore un `?lang=` qui n'est pas une langue du site", () => {
    expect(chooseLang({ ...base, query: "de", stored: "fr" })).toBe("fr");
    expect(chooseLang({ ...base, query: "", nav: "fr-CA" })).toBe("fr");
  });

  it("garde le choix enregistré avant la langue de la fiche et celle du navigateur", () => {
    expect(chooseLang({ ...base, stored: "en", card: "fr", nav: "fr-FR" })).toBe("en");
  });

  it("sur une fiche, sans choix : la langue de la fiche avant celle du téléphone", () => {
    expect(chooseLang({ ...base, path: "/c/abc", card: "fr", nav: "en-US" })).toBe("fr");
    expect(chooseLang({ ...base, path: "/c/abc", card: "en", nav: "fr-FR" })).toBe("en");
  });

  it("sans rien d'autre : le navigateur", () => {
    expect(chooseLang({ ...base, nav: "fr-BE" })).toBe("fr");
    expect(chooseLang({ ...base, nav: "es-ES" })).toBe("en");
  });

  it("la vie privée a une adresse par langue, après `?lang=` et le choix enregistré", () => {
    expect(chooseLang({ ...base, path: "/privacy", nav: "fr-FR" })).toBe("en");
    expect(chooseLang({ ...base, path: "/confidentialite" })).toBe("fr");
    expect(chooseLang({ ...base, path: "/confidentialite", query: "en" })).toBe("en");
  });
});

/** Une page servie par le serveur : `<html lang>` et l'image d'aperçu. */
function page(lang: string, image: string | null): Pick<Document, "documentElement" | "querySelector"> {
  return {
    documentElement: { getAttribute: (n: string) => (n === "lang" ? lang : null) } as unknown as HTMLElement,
    querySelector: ((sel: string) => (sel.includes("og:image") && image !== null ? ({ content: image } as HTMLMetaElement) : null)) as Document["querySelector"],
  };
}

describe("cardLangOf", () => {
  it("lit la langue d'une fiche que le serveur connaît (son image d'aperçu est la sienne)", () => {
    expect(cardLangOf(page("fr", "https://x.test/og/k3vin42.png?v=9"), "/c/k3vin42")).toBe("fr");
    expect(cardLangOf(page("en", "https://x.test/og/k3vin42.png?v=9&s=totw"), "/c/k3vin42/")).toBe("en");
  });

  it("ne dit rien hors d'une fiche, ni pour une fiche inconnue (image de l'accueil)", () => {
    expect(cardLangOf(page("fr", "https://x.test/og/home.png"), "/c/k3vin42")).toBeNull();
    expect(cardLangOf(page("fr", null), "/c/k3vin42")).toBeNull();
    expect(cardLangOf(page("fr", "https://x.test/og/k3vin42.png"), "/")).toBeNull();
    expect(cardLangOf(page("fr", "https://x.test/og/k3vin42.png"), "/bandes")).toBeNull();
  });
});
