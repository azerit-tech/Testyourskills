// La barre du haut, le bandeau de saison et le pied de page (SPEC §18.48), rendus en chaîne.
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DICTS, LangProvider } from "../i18n";
import { Footer, SeasonBand, TopBar } from "./Chrome";

interface World {
  lang?: "fr" | "en";
  /** La fiche en mémoire dans ce navigateur. */
  mine?: { id: string; login: string | null; overall: number };
  /** La réponse de /api/config gardée pour la session. */
  config?: Record<string, unknown>;
}

const SEASON = { number: 1, start: "2026-11-19", end: "2026-12-31" };

function render(el: ReactElement, { lang = "fr", mine, config }: World = {}): string {
  const local: Record<string, string> = { tys_lang: lang };
  if (mine) local.tys_mine = JSON.stringify(mine);
  const session: Record<string, string> = config ? { tys_config: JSON.stringify(config) } : {};
  vi.stubGlobal("localStorage", { getItem: (k: string) => local[k] ?? null, setItem: () => undefined });
  vi.stubGlobal("sessionStorage", { getItem: (k: string) => session[k] ?? null, setItem: () => undefined, removeItem: () => undefined });
  vi.stubGlobal("window", { location: { origin: "https://skills.test", pathname: "/", search: "" }, matchMedia: () => ({ matches: false }) });
  vi.stubGlobal("navigator", { language: lang === "fr" ? "fr-FR" : "en-US" });
  return renderToStaticMarkup(createElement(LangProvider, null, el));
}

/** Les liens rendus, dans l'ordre : [adresse, texte]. */
const links = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gs)].map((m) => [m[1]!, m[2]!.replace(/<[^>]+>/g, "")]);

afterEach(() => vi.unstubAllGlobals());

describe("la barre du haut", () => {
  it("sans fiche en mémoire : la marque, « Classement » (l'ancre du classement de l'accueil), la langue en deux mots", () => {
    const html = render(createElement(TopBar));
    expect(links(html)).toEqual([
      ["/", "AZERIT"],
      ["/#classement", "Classement"],
    ]);
    expect(html).toContain('aria-label="Azerit, accueil"');
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>FR<\/button>/);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>EN<\/button>/);
  });

  it("une fiche en mémoire : « Ma fiche » mène à elle", () => {
    const html = render(createElement(TopBar), { mine: { id: "Ab12345678", login: "leamd", overall: 71 } });
    expect(links(html)).toEqual([
      ["/", "AZERIT"],
      ["/#classement", "Classement"],
      ["/c/Ab12345678", "Ma fiche"],
    ]);
  });

  it("en anglais", () => {
    const html = render(createElement(TopBar), { lang: "en", mine: { id: "Ab12345678", login: null, overall: 40 } });
    expect(links(html).map((l) => l[1])).toEqual(["AZERIT", "Ranking", "My sheet"]);
    expect(html).toContain('aria-label="Azerit, home"');
  });
});

describe("le bandeau de saison", () => {
  it("se tait tant qu'aucune prime n'est ouverte", () => {
    expect(render(createElement(SeasonBand))).toBe("");
    expect(render(createElement(SeasonBand), { config: { primesOpen: false, primesListed: true, season: SEASON } })).toBe("");
  });

  it("prime ouverte : un lien vers les primes", () => {
    const html = render(createElement(SeasonBand), { config: { primesOpen: true, primesListed: true, season: SEASON } });
    expect(html).toMatch(/^<a class="season-band" href="\/primes"/);
    expect(html).toContain("Saison 1");
    expect(html).toContain("Voir les primes");
  });
});

describe("le pied de page", () => {
  // Le mot de la vie privée appartient au dictionnaire : le test lit le sien.
  it("par défaut : qui fait le site et azerit.tech, puis Classement, vie privée, Crédits", () => {
    const html = render(createElement(Footer));
    expect(html).toContain("Azerit recrute des devs sur preuves");
    expect(links(html)).toEqual([
      ["https://azerit.tech", "azerit.tech ↗"],
      ["/#classement", "Classement"],
      ["/confidentialite", DICTS.fr.footer.privacy],
      ["/credits", "Crédits"],
    ]);
  });

  it("primes listées et règlement publié : leurs liens s'ajoutent, dans l'ordre", () => {
    const html = render(createElement(Footer), { config: { primesOpen: true, primesListed: true, rulesPublished: true, season: SEASON } });
    expect(links(html).map((l) => l[0])).toEqual(["https://azerit.tech", "/#classement", "/primes", "/reglement", "/confidentialite", "/credits"]);
  });

  it("en anglais", () => {
    const html = render(createElement(Footer), { lang: "en", config: { primesListed: true, rulesPublished: true } });
    expect(html).toContain("Azerit hires devs on evidence: experience first, code as proof.");
    expect(links(html)).toEqual([
      ["https://azerit.tech", "azerit.tech ↗"],
      ["/#classement", "Ranking"],
      ["/primes", "Bounties"],
      ["/reglement", "Rules"],
      ["/privacy", DICTS.en.footer.privacy],
      ["/credits", "Credits"],
    ]);
  });
});
