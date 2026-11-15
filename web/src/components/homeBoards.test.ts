// Les tableaux de l'accueil (§18.48) : le top de la semaine et celui des bandes,
// rendus en chaîne, sans navigateur ni serveur.
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BandStanding } from "../../../shared/bands";
import type { TopEntry, WeekTop } from "../../../shared/types";
import { LangProvider } from "../i18n";
import { BandsTopView } from "./BandsTop";
import { WeekBoardView } from "./WeekBoard";

function render(el: ReactElement, language = "fr-FR"): string {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("navigator", { language });
  return renderToStaticMarkup(createElement(LangProvider, null, el));
}

const entry = (rank: number): TopEntry => ({ rank, cardId: `Card00000${rank}`, login: `dev${rank}`, avatarUrl: "", overall: 90 - rank, stars: 5 });
const week = (n: number): WeekTop => ({ weekStart: 0, endsAt: 3_600_000, week: 46, total: n, entries: Array.from({ length: n }, (_, i) => entry(i + 1)) });
const board = (n: number, language?: string) => render(createElement(WeekBoardView, { top: week(n), now: 0, onPlay: () => undefined }), language);
const count = (html: string, needle: string) => html.split(needle).length - 1;

afterEach(() => vi.unstubAllGlobals());

describe("le top de la semaine sur l'accueil", () => {
  it("semaine vide : un seul bloc d'invitation, aucune ligne de place libre", () => {
    const html = board(0);
    expect(count(html, "board-empty")).toBe(1);
    expect(html).toContain("La place n° 1 est libre");
    expect(html).not.toContain("board-row");
    expect(html).not.toContain("board-tag");
    expect(board(0, "en-US")).toContain("Spot #1 is open");
  });

  it("top 5 incomplet : les lignes réelles, l'étiquette, puis une seule ligne pour les places libres", () => {
    const html = board(2);
    expect(count(html, 'class="board-row"')).toBe(2);
    expect(count(html, "is-free")).toBe(1);
    expect(html).toContain("Places 3 à 5 libres");
    expect(html).toContain("Prends-en une");
    expect(html).toContain("board-tag");
    expect(board(1)).toContain("board-tag");
    expect(board(4)).toContain("Place 5 libre");
    expect(board(4)).toContain("Prends-la");
    expect(board(4, "en-US")).toContain("Spot 5 is open");
    expect(board(3, "en-US")).toContain("Spots 4 to 5 are open");
  });

  it("top 5 complet : plus de place libre ; au-delà, les lignes sortent de l'aplat", () => {
    expect(board(5)).not.toContain("is-free");
    const html = board(7);
    expect(count(html, 'class="board-row"')).toBe(7);
    expect(html).toContain("is-rest");
  });
});

describe("les bandes sur l'accueil", () => {
  const band = (id: string) => ({ type: "ecole", id, label: id, score: 12, members: 3, rank: 1, missing: 0, gap: null, ahead: null }) as BandStanding;

  it("aucune bande : pas de section", () => {
    expect(render(createElement(BandsTopView, { top: { ecole: [], boite: [] }, lead: "Fais ta fiche." }))).toBe("");
  });

  it("une bande : le titre, la phrase qui dit pourquoi, puis le tableau", () => {
    const html = render(createElement(BandsTopView, { top: { ecole: [band("ecole-a")], boite: [] }, lead: "Fais ta fiche. Fais gagner ta bande." }));
    expect(html).toMatch(/<h2[^>]*>Top des bandes<\/h2><p class="board-meta">Fais ta fiche\. Fais gagner ta bande\.<\/p>/);
    expect(count(html, "board-tag")).toBe(1);
  });
});
