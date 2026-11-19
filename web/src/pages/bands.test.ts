// /bandes : une ligue rendue en chaîne (sa bande en formation, le tableau, les bandes en
// formation, §18.85). La page d'une bande : le classement de sa ligue, sa ligne marquée
// (§18.87) ; les fiches anonymes comptées et réparties par étoiles, dans le même bloc que
// les fiches nommées.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BandBoard, BandStanding } from "../../../shared/bands";
import { LangProvider } from "../i18n";
import { BandBoardSection, boardAround, BoardPanel, PAGE_BOARD_ROWS, PAGE_FORMING_ROWS, starSpread } from "./Bands";

const band = (id: string, label: string, members: number, score: number, rank: number | null = null): BandStanding => ({
  type: "ecole",
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
const CS = band("centralesupelec", "CentraleSupélec", 1, 3);
const CM = band("centrale-mediterranee", "Centrale Méditerranée", 1, 2);
const ESIEA = band("esiea", "ESIEA", 2, 8);
const EPITECH = band("epitech", "Epitech", 23, 88, 1);

function panel(board: Partial<BandBoard>, language = "fr-FR"): string {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("navigator", { language });
  const full: BandBoard = { type: "ecole", total: board.entries?.length ?? 0, entries: [], forming: [], extra: null, ...board };
  return renderToStaticMarkup(createElement(LangProvider, null, createElement(BoardPanel, { board: full, type: "ecole", on: true, onShare: () => undefined, native: false })));
}
const count = (html: string, needle: string) => html.split(needle).length - 1;

afterEach(() => vi.unstubAllGlobals());

describe("une ligue de /bandes", () => {
  it("rien au tableau, sa bande en formation : un seul bloc, sans phrase vide, sans étoiles", () => {
    const html = panel({ extra: CS });
    expect(count(html, "bands-mine")).toBe(1);
    expect(html).toContain("Ta bande");
    expect(html).toContain('href="/bandes/ecole/centralesupelec"');
    expect(html).toContain('aria-label="1\u00a0fiche sur 3"');
    expect(count(html, "band-slot is-on")).toBe(1);
    expect(html).toContain("Encore 2\u00a0fiches pour entrer au tableau.");
    expect(html).toContain("Partager la bande");
    expect(html).not.toContain("Aucune école");
    expect(html).not.toContain("Étoiles");
    expect(html).not.toContain("band-score");
    expect(html).not.toContain("board-row");
  });

  it("les bandes en formation des autres : une ligne chacune, ce qu'il manque, pas d'étoiles", () => {
    const html = panel({ forming: [ESIEA, CM] });
    expect(html).toContain("En formation");
    expect(count(html, "is-forming")).toBe(2);
    expect(html).toContain('aria-label="ESIEA, en formation, 2\u00a0fiches sur 3"');
    expect(html).toContain("Encore 1\u00a0fiche<");
    expect(html).toContain("Encore 2\u00a0fiches<");
    expect(html).toContain('href="/bandes/ecole/centrale-mediterranee"');
    expect(html).not.toContain("Aucune école");
    expect(html).not.toContain("band-score");
    expect(html).not.toContain("Étoiles");
    expect(html).not.toContain("bands-mine");
  });

  it("le tableau, sa bande en formation au-dessus, les bandes en formation dessous", () => {
    const html = panel({ entries: [EPITECH], forming: [ESIEA], extra: CS });
    const at = (s: string) => html.indexOf(s);
    expect(at("bands-mine")).toBeGreaterThan(-1);
    expect(at("bands-mine")).toBeLessThan(at("Au tableau"));
    expect(at("Au tableau")).toBeLessThan(at("En formation"));
    expect(count(html, "Étoiles")).toBe(1);
    expect(count(html, "band-score")).toBe(1);
  });

  it("sa bande classée plus bas : sa ligne, avec son rang et ses étoiles", () => {
    const html = panel({ entries: [EPITECH], extra: band("utc", "UTC", 3, 9, 24) });
    expect(html).toContain("bands-yours");
    expect(html).not.toContain("bands-mine");
    expect(count(html, "Étoiles")).toBe(2);
    expect(html).toContain('aria-label="24e, UTC, 9\u00a0étoiles, 3\u00a0fiches"');
  });

  it("une ligue sans rien à montrer garde sa phrase", () => {
    const html = panel({});
    expect(html).toContain("Aucune école au tableau pour l&#x27;instant.");
    expect(html).not.toContain("board-tag");
  });

  it("en anglais", () => {
    const html = panel({ forming: [ESIEA], extra: CS }, "en-US");
    expect(html).toContain("Your crew");
    expect(html).toContain("2\u00a0more sheets to make the board.");
    expect(html).toContain('aria-label="1 of 3 sheets"');
    expect(html).toContain('aria-label="ESIEA, forming, 2 of 3 sheets"');
    expect(html).toContain("1\u00a0more sheet<");
  });
});

describe("le classement sur la page d'une bande", () => {
  const league = (n: number) => Array.from({ length: n }, (_, i) => band(`b${i + 1}`, `Bande ${i + 1}`, 20 - i, 100 - i, i + 1));
  const full = (board: Partial<BandBoard>): BandBoard => ({ type: "ecole", total: board.entries?.length ?? 0, entries: [], forming: [], extra: null, ...board });
  const section = (board: Partial<BandBoard> | null, b: BandStanding, language = "fr-FR") => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
    vi.stubGlobal("navigator", { language });
    return renderToStaticMarkup(createElement(LangProvider, null, createElement(BandBoardSection, { board: board ? full(board) : null, band: b })));
  };

  it("dans les dix premières : sa ligne à sa place, les dix lignes, pas de bloc à part", () => {
    const all = league(14);
    const lists = boardAround(full({ entries: all, forming: [ESIEA, CM] }), all[6]!);
    expect(lists.entries.map((b) => b.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(lists.entries).toHaveLength(PAGE_BOARD_ROWS);
    expect(lists.lower).toBeNull();
    expect(lists.forming.map((b) => b.id)).toEqual(["esiea", "centrale-mediterranee"]);
  });

  it("plus bas que les dix premières : seule sous son étiquette, qu'elle vienne du tableau ou de `extra`", () => {
    const all = league(14);
    expect(boardAround(full({ entries: all }), all[12]!).lower?.id).toBe("b13");
    const far = band("utc", "UTC", 3, 9, 24);
    const lists = boardAround(full({ entries: all, extra: far }), far);
    expect(lists.entries).toHaveLength(10);
    expect(lists.lower).toBe(far);
  });

  it("sa propre place vient de la page, plus fraîche que le tableau", () => {
    const all = league(3);
    const fresh = { ...all[1]!, score: 150, members: 30 };
    expect(boardAround(full({ entries: all }), fresh).entries[1]).toBe(fresh);
    // Le tableau la dit encore en formation, la page la dit classée : une seule ligne, classée.
    const up = band("esiea", "ESIEA", 3, 12, 4);
    const lists = boardAround(full({ entries: all, forming: [ESIEA, CM] }), up);
    expect(lists.lower).toBe(up);
    expect(lists.forming.map((b) => b.id)).toEqual(["centrale-mediterranee"]);
  });

  it("en formation : à sa place parmi les bandes en formation, toujours dans la liste, cinq au plus", () => {
    expect(boardAround(full({ forming: [ESIEA, CM], extra: CS }), CS).forming.map((b) => b.id)).toEqual(["esiea", "centralesupelec", "centrale-mediterranee"]);
    const many = Array.from({ length: 10 }, (_, i) => band(`f${i}`, `F${i}`, 2, 12 - i));
    const lists = boardAround(full({ forming: many, extra: CS }), CS);
    expect(lists.forming).toHaveLength(PAGE_FORMING_ROWS);
    expect(lists.forming.at(-1)).toBe(CS);
    // Une école de la liste sans fiche : le tableau ne la rend pas, la page si.
    const none = band("epita", "EPITA", 0, 0);
    expect(boardAround(full({ forming: [CM] }), none).forming.map((b) => b.id)).toEqual(["centrale-mediterranee", "epita"]);
  });

  it("la section : sa ligne marquée, sans lien vers elle-même, puis « Toutes les bandes » sur sa ligue", () => {
    const all = league(12);
    const html = section({ entries: all, forming: [ESIEA] }, all[6]!);
    expect(html).toContain("Le classement");
    expect(html).toContain("Au tableau");
    expect(count(html, 'aria-current="page"')).toBe(1);
    expect(count(html, "is-current")).toBe(1);
    expect(html).not.toContain('href="/bandes/ecole/b7"');
    expect(html).toContain('<span class="sr-only">7e, Bande 7, 94\u00a0étoiles, 14\u00a0fiches</span>');
    expect(count(html, "<a ")).toBe(9 + 1 + 1);
    expect(html).toContain('href="/bandes?t=ecole"');
    expect(html).not.toContain("Trois fiches pour entrer");
    expect(html).not.toContain("Cette bande");
  });

  it("rien au tableau, elle seule en formation : la règle, sa ligne, aucune phrase « Aucune … »", () => {
    const html = section({ extra: CS }, CS);
    expect(html).toContain("Trois fiches pour entrer au tableau.");
    expect(html).toContain("En formation");
    expect(html).toContain("is-forming is-current");
    expect(html).not.toContain("Aucune");
    expect(html).not.toContain("Étoiles");
    expect(html).not.toContain("Au tableau<");
    expect(section({ extra: CS }, CS, "en-US")).toContain("Three sheets to make the board.");
  });

  it("plus bas : « Cette bande » ; le tableau pas encore lu : le titre et le lien seuls", () => {
    const all = league(14);
    expect(section({ entries: all }, all[12]!)).toContain("Cette bande");
    const waiting = section(null, CS);
    expect(waiting).toContain("Le classement");
    expect(waiting).toContain('aria-busy="true"');
    expect(waiting).not.toContain("board-row");
  });
});

describe("les fiches anonymes d'une bande", () => {
  it("leur répartition va du plus étoilé au moins étoilé", () => {
    const m = (stars: number) => ({ stars, profile: null });
    expect(starSpread([m(4), m(6), m(4), m(5), m(6), m(4)])).toEqual([
      [6, 2],
      [5, 1],
      [4, 3],
    ]);
    expect(starSpread([])).toEqual([]);
  });
});
