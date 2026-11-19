// /bandes : une ligue rendue en chaîne (sa bande en formation, le tableau, les bandes en
// formation, §18.85). La page d'une bande : les fiches anonymes comptées et réparties par
// étoiles, dans le même bloc que les fiches nommées.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BandBoard, BandStanding } from "../../../shared/bands";
import { LangProvider } from "../i18n";
import { BoardPanel, starSpread } from "./Bands";

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
