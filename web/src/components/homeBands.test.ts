// Les bandes sur l'accueil de qui a sa fiche (§18.89), rendues en chaîne, sans
// navigateur ni serveur.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BandBoard, BandStanding, BandType } from "../../../shared/bands";
import { LangProvider } from "../i18n";
import { HomeBandsView, type HomeBandsData } from "./HomeBands";

const st = (type: BandType, id: string, label: string, members: number, rank: number | null = null, score = members * 4): BandStanding => ({
  type,
  id,
  label,
  score,
  members,
  rank,
  missing: Math.max(0, 3 - members),
  gap: null,
  ahead: null,
  hasPage: true,
});
const board = (type: BandType, entries: BandStanding[] = [], forming: BandStanding[] = [], extra: BandStanding | null = null): BandBoard => ({ type, total: entries.length, entries, forming, extra });

const cs = st("ecole", "centralesupelec", "CentraleSupélec", 1);
const cm = st("ecole", "centrale-mediterranee", "Centrale Méditerranée", 1);
const az = st("boite", "azerit", "Azerit", 1);
const ranked = [st("ecole", "epitech", "Epitech", 23, 1), st("ecole", "ecole-42", "École 42", 19, 2), st("ecole", "insa-lyon", "INSA Lyon", 9, 3), st("ecole", "utc", "UTC", 7, 4)];

function render(data: HomeBandsData, language = "fr-FR"): string {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("navigator", { language });
  return renderToStaticMarkup(createElement(LangProvider, null, createElement(HomeBandsView, { data, onShare: () => undefined, native: false })));
}
const count = (html: string, needle: string) => html.split(needle).length - 1;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

afterEach(() => vi.unstubAllGlobals());

describe("les bandes sur l'accueil de qui a sa fiche", () => {
  it("aucune bande au tableau (la production du 19 novembre) : ses deux bandes en formation, chacune dans son bloc, puis les autres en formation", () => {
    const html = render({ mine: { ecole: cs, boite: az }, boards: { ecole: board("ecole", [], [cm], cs), boite: board("boite", [], [], az) }, stars: 4 });
    expect(html).toContain("<h2 id=\"home-bands-title\">Les bandes</h2>");
    expect(html.indexOf(">Écoles<")).toBeLessThan(html.indexOf(">Boîtes<"));
    expect(count(html, "bands-mine")).toBe(2);
    expect(count(html, "Encore 2\u00a0fiches pour entrer au tableau.")).toBe(2);
    expect(count(html, "Partager la bande")).toBe(2);
    expect(html).toContain('<a href="/bandes/ecole/centralesupelec">CentraleSupélec</a>');
    // les autres bandes en formation de la ligue, sans la sienne ; pas de tableau vide
    expect(html).toContain("En formation");
    expect(html).toContain("Centrale Méditerranée");
    expect(count(html, "is-forming")).toBe(1);
    expect(html).not.toContain("Au tableau");
    expect(html).not.toContain("Aucune");
    expect(html).toMatch(/<a class="link-alt bands-top-all" href="\/bandes">Toutes les bandes<\/a>/);
    // un seul bouton principal sur la page : le partage d'une bande est un contour
    expect(html).not.toContain("btn-primary");
    expect(html).not.toContain("pill-big");
  });

  it("des bandes au tableau : les trois premières de la ligue ; la sienne, dedans, est mise en évidence", () => {
    const mine = ranked[1]!;
    const html = render({ mine: { ecole: mine, boite: null }, boards: { ecole: board("ecole", ranked, [cm]), boite: board("boite") }, stars: 4 });
    expect(html).toContain("Au tableau");
    expect(count(html, "band-row")).toBe(3);
    expect(html).not.toContain("UTC");
    expect(count(html, "is-me")).toBe(1);
    expect(html).toMatch(/class="board-row band-row is-me" href="\/bandes\/ecole\/ecole-42"[^>]*aria-current="true"/);
    // un tableau existe : les bandes en formation restent sur /bandes
    expect(html).not.toContain("En formation");
    expect(html).not.toContain("Ta bande");
    // la ligue vide ne laisse ni titre ni phrase
    expect(html).not.toContain("Boîtes");
  });

  it("sa bande classée plus bas que les trois premières : sa ligne à part, sous « Ta bande »", () => {
    const mine = st("ecole", "centralesupelec", "CentraleSupélec", 4, 5);
    const html = render({ mine: { ecole: mine, boite: null }, boards: { ecole: board("ecole", [...ranked, mine]), boite: board("boite") }, stars: 4 });
    expect(count(html, "band-row")).toBe(4);
    expect(html.indexOf("Au tableau")).toBeLessThan(html.indexOf("Ta bande"));
    expect(html).toMatch(/bands-yours.*class="board-row band-row is-me" href="\/bandes\/ecole\/centralesupelec"/s);
    expect(count(html, "is-me")).toBe(1);
  });

  it("sa bande en formation à côté d'un tableau : son bloc d'abord, puis le tableau", () => {
    const html = render({ mine: { ecole: cs, boite: null }, boards: { ecole: board("ecole", ranked, [cm], cs), boite: board("boite", [], [az]) }, stars: 4 });
    expect(html.indexOf("bands-mine")).toBeLessThan(html.indexOf("Au tableau"));
    expect(count(html, "is-me")).toBe(0);
    // sans bande à elle dans la ligue des boîtes : les boîtes en formation
    expect(text(html)).toMatch(/Boîtes En formation Azerit Encore 2 fiches/);
  });

  it("une boîte au nom libre, sans page publique avant trois fiches : son nom sans lien", () => {
    const free = { ...st("boite", "petite-boite", "Petite Boîte", 1), hasPage: false };
    const html = render({ mine: { ecole: null, boite: free }, boards: { ecole: board("ecole"), boite: board("boite") }, stars: 4 });
    expect(html).toContain('<h3 class="t-block">Petite Boîte</h3>');
    expect(html).not.toContain("/bandes/boite/petite-boite");
  });

  it("rien à montrer : pas de section", () => {
    expect(render({ mine: { ecole: null, boite: null }, boards: { ecole: board("ecole"), boite: board("boite") }, stars: null })).toBe("");
  });

  it("en anglais", () => {
    const html = render({ mine: { ecole: cs, boite: null }, boards: { ecole: board("ecole", [], [cm], cs), boite: board("boite") }, stars: 4 }, "en-US");
    expect(html).toContain("Your crew");
    expect(html).toContain("All crews");
  });
});
