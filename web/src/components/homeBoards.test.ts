// Les tableaux de l'accueil (§18.48) : le top de la semaine et celui des bandes,
// et la ligne de mémoire, rendus en chaîne, sans navigateur ni serveur.
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BandStanding } from "../../../shared/bands";
import type { TopEntry, WeekTop } from "../../../shared/types";
import { LangProvider } from "../i18n";
import { BackLine } from "../pages/Home";
import { BandsTopView } from "./BandsTop";
import { WeekBoard, WeekBoardView } from "./WeekBoard";

function render(el: ReactElement, language = "fr-FR"): string {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("navigator", { language });
  return renderToStaticMarkup(createElement(LangProvider, null, el));
}

const entry = (rank: number): TopEntry => ({ rank, cardId: `Card00000${rank}`, login: `dev${rank}`, avatarUrl: "", initials: "DE", overall: 90 - rank, stars: 5 });
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

  it("chaque ligne est la vraie personne : le nom de la fiche, ses initiales, le lien vers elle ; sans nom, le @pseudo (§18.88)", () => {
    const top = week(3);
    // Une fiche LinkedIn seule : un nom, pas de pseudo ; une fiche GitHub avec un nom ; une fiche GitHub sans nom.
    top.entries[0] = { rank: 1, cardId: "Lnkd000001", name: "Florence Delmas", initials: "FD", overall: 88, stars: 5 };
    top.entries[1] = { ...entry(2), name: "Léa Martin-Dubois", initials: "LM" };
    const html = render(createElement(WeekBoardView, { top, now: 0, onPlay: () => undefined }));
    expect(count(html, 'class="board-row"')).toBe(3);
    expect(html).toMatch(/href="\/c\/Lnkd000001" aria-label="Place 1\s: Florence Delmas, note 88\/100"/);
    expect(html).toContain('<span class="board-avatar">FD</span><span class="board-login">Florence Delmas</span>');
    expect(html).toContain('<span class="board-avatar">LM</span><span class="board-login">Léa Martin-Dubois</span>');
    expect(html).toContain('<span class="board-login">@dev3</span>');
    expect(html).toMatch(/aria-label="Place 3\s: @dev3, note 87\/100"/);
    // Plus de ligne anonyme : ni la lettre de remplacement, ni « Fiche LinkedIn ».
    expect(html).not.toMatch(/board-avatar[^>]*>I<|Fiche LinkedIn/);
  });
});

describe("le top de la semaine avant la réponse du serveur", () => {
  it("le titre, l'ancre et la place du top 5 sont là dès le premier rendu", () => {
    const html = render(createElement(WeekBoard, { onPlay: () => undefined }));
    expect(html).toContain('<section class="board" id="semaine"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Top de la semaine");
    expect(count(html, "board-wait")).toBe(1);
    expect(html).not.toContain("board-row");
  });
});

describe("ma ligne au top de la semaine", () => {
  const mine = (m: { id: string; login: string | null }) => render(createElement(WeekBoardView, { top: week(7), now: 0, onPlay: () => undefined, mine: { ...m, overall: 80 } }));

  it("le tableau porte l'ancre « semaine »", () => {
    expect(board(3)).toContain('<section class="board" id="semaine"');
  });

  it("la fiche en mémoire, par son id ou par son pseudo : une seule ligne mise en évidence, dans le top 5 comme après", () => {
    const byId = mine({ id: "Card000002", login: null });
    expect(count(byId, "is-me")).toBe(1);
    expect(byId).toMatch(/class="board-row is-me" href="\/c\/Card000002"[^>]*aria-current="true"/);
    const byLogin = mine({ id: "Autre00000", login: "dev6" });
    expect(count(byLogin, "is-me")).toBe(1);
    expect(byLogin).toMatch(/class="board-row is-me" href="\/c\/Card000006"/);
  });

  it("sans fiche en mémoire, ou hors du tableau : aucune ligne mise en évidence", () => {
    expect(board(7)).not.toContain("is-me");
    expect(mine({ id: "Autre00000", login: "ailleurs" })).not.toContain("is-me");
  });
});

describe("la ligne de mémoire au-dessus du formulaire", () => {
  it("une fiche en mémoire : ses étoiles, sa note sur 100, le lien vers elle", () => {
    const html = render(createElement(BackLine, { mine: { id: "Card000001", login: "dev1", overall: 79 }, pending: null }));
    expect(html).toContain('href="/c/Card000001"');
    expect(html).toContain('aria-label="5 étoiles sur 6"');
    expect(html).toContain("79/100.");
    expect(html).toContain("La revoir");
    expect(render(createElement(BackLine, { mine: { id: "Card000001", login: null, overall: 46 }, pending: null }), "en-US")).toContain("See it again");
  });

  it("un dossier en cours passe devant la fiche déjà faite", () => {
    const html = render(createElement(BackLine, { mine: { id: "Card000001", login: "dev1", overall: 79 }, pending: "Card000009" }));
    expect(html).toContain('href="/c/Card000009"');
    expect(html).toContain("Ton dossier s&#x27;ouvre encore.");
    expect(html).toContain("Y retourner");
    expect(html).not.toContain("79/100");
  });

  it("rien en mémoire : pas de ligne", () => {
    expect(render(createElement(BackLine, { mine: null, pending: null }))).toBe("");
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
