// Les tableaux de l'accueil (§18.48, §18.92, §18.101) : le top de la semaine et ceux des bandes,
// et la ligne de mémoire, rendus en chaîne, sans navigateur ni serveur.
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BandsTop, BandStanding } from "../../../shared/bands";
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
  it("semaine vide : rien, le tableau vient avec la première fiche", () => {
    expect(board(0)).toBe("");
    expect(board(0, "en-US")).toBe("");
  });

  it("top 5 incomplet : les lignes réelles et l'étiquette, aucune ligne de place libre", () => {
    const html = board(2);
    expect(count(html, 'class="board-row"')).toBe(2);
    expect(html).not.toContain("is-free");
    expect(html).not.toContain("libre");
    expect(html).toContain("board-tag");
    expect(board(4)).not.toContain("is-free");
  });

  it("« Top 10 » : jusqu'à dix lignes d'un seul bloc, ce que l'étiquette dit", () => {
    expect(board(5)).not.toContain("is-free");
    const html = board(12);
    expect(count(html, 'class="board-row"')).toBe(10);
    expect(html).not.toContain("is-rest");
    expect(html).toContain('<p class="board-tag">Top 10</p>');
    expect(html).not.toContain("Top 5");
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

describe("les bandes sur l'accueil : un classement par ligue (§18.92, §18.101)", () => {
  const band = (type: "ecole" | "boite", id: string, label: string, score: number, members: number, rank: number | null = null) =>
    ({ type, id, label, score, members, rank, missing: 0, gap: null, ahead: null, hasPage: true }) as BandStanding;
  const view = (top: BandsTop | null, mine: Partial<Record<"ecole" | "boite", string | null>> = {}, language?: string) => render(createElement(BandsTopView, { top, mine, onPlay: () => undefined }), language);
  // La prod du 20 novembre : deux écoles, et chaque boîte dès sa première fiche (§18.38, 20 novembre).
  const prod: BandsTop = {
    ecole: [band("ecole", "centralesupelec", "CentraleSupélec", 11, 3, 1), band("ecole", "centrale-mediterranee", "Centrale Méditerranée", 7, 2, 2)],
    boite: [band("boite", "azerit", "Azerit", 13, 3, 1), band("boite", "quandela", "Quandela", 5, 1, 2), band("boite", "ceva-logistics", "CEVA Logistics", 4, 1, 3)],
  };
  const league = (html: string, type: "ecole" | "boite") => html.slice(html.indexOf(`league-${type}-title`), type === "ecole" ? html.indexOf("league-boite-title") : undefined);

  it("deux tableaux faits comme le top de la semaine, sous l'ancre « classement » : le nom de la ligue, l'onglet « Top 5 », l'unité « Étoiles »", () => {
    const html = view(prod);
    expect(html).toMatch(/^<div class="leagues" id="classement">/);
    expect(html).toMatch(/<h2 id="league-ecole-title">Écoles<\/h2><div class="board-top"><p class="board-tag">Top 5<\/p><span class="board-scale" aria-hidden="true">Étoiles<\/span><ol class="board-list is-top">/);
    expect(html).toMatch(/<h2 id="league-boite-title">Boîtes<\/h2>/);
    expect(count(html, '<section class="board league"')).toBe(2);
    expect(view(prod, {}, "en-US")).toMatch(/<h2 id="league-ecole-title">Schools<\/h2>.*>Stars<\/span>/);
  });

  it("chaque ligne : sa place, son nom, ses fiches, ses étoiles, sans « en formation » ; la ligne s'ouvre sur ses fiches, pas sur une page", () => {
    const html = league(view(prod), "ecole");
    expect(count(html, 'class="board-row band-row league-row has-people"')).toBe(2);
    expect(html).not.toContain("href=");
    expect(count(html, 'aria-expanded="false"')).toBe(2);
    expect(count(html, 'class="league-chev"')).toBe(2);
    expect(html).toContain('<span class="board-rank">1</span><span class="band-name"><span class="board-login">CentraleSupélec</span><span class="band-count">3 fiches</span></span><span class="band-score">11</span>');
    expect(html).toContain('<span class="board-rank">2</span><span class="band-name"><span class="board-login">Centrale Méditerranée</span><span class="band-count">2 fiches</span></span><span class="band-score">7</span>');
    expect(html).toMatch(/aria-label="Place 2\s: Centrale Méditerranée, 7 étoiles, 2 fiches"/);
    // une boîte à une fiche est au classement, comme une école
    const boites = league(view(prod), "boite");
    expect(count(boites, "league-row")).toBe(3);
    expect(boites).toContain('<span class="board-rank">2</span><span class="band-name"><span class="board-login">Quandela</span><span class="band-count">1 fiche</span></span><span class="band-score">5</span>');
    expect(view(prod)).not.toContain("formation");
    expect(view(prod, {}, "en-US")).not.toContain("forming");
  });

  it("aucune ligne de places libres ; une ligue sans bande ne s'affiche pas", () => {
    const html = view(prod);
    expect(html).not.toContain("is-free");
    expect(html).not.toContain("libre");
    const four = view({ ecole: [1, 2, 3, 4].map((r) => band("ecole", `e${r}`, `École ${r}`, 20 - r, 3, r)), boite: [] });
    expect(count(league(four, "ecole"), "league-row")).toBe(4);
    expect(four).not.toContain("league-boite-title");
    const full = view({ ecole: [1, 2, 3, 4, 5, 6].map((r) => band("ecole", `e${r}`, `École ${r}`, 20 - r, 3, r)), boite: [] });
    expect(count(league(full, "ecole"), "league-row")).toBe(5);
  });

  it("la production remise à zéro : aucune ligue affichée, l'ancre reste", () => {
    const html = view({ ecole: [], boite: [] });
    expect(html).toBe('<div class="leagues" id="classement"></div>');
  });

  it("en attendant le serveur : les deux titres et la place des lignes, l'ancre déjà là", () => {
    const html = view(null);
    expect(html).toMatch(/^<div class="leagues" id="classement">/);
    expect(count(html, 'aria-busy="true"')).toBe(2);
    expect(count(html, "board-wait")).toBe(2);
    expect(html).not.toContain("board-row");
  });

  it("sa bande est mise en évidence, comme sa ligne au top de la semaine ; plus bas que la cinquième place, elle vient après un filet", () => {
    const html = view(prod, { ecole: "centrale-mediterranee", boite: null });
    expect(count(html, "is-me")).toBe(1);
    expect(html).toMatch(/class="board-row band-row league-row has-people is-me"[^>]*aria-current="true"[^>]*><span class="board-rank">2<\/span><span class="band-name"><span class="board-login">Centrale Méditerranée/);
    const five = [1, 2, 3, 4, 5].map((r) => band("ecole", `e${r}`, `École ${r}`, 20 - r, 3, r));
    const low = view({ ecole: five, boite: [], mine: { ecole: { place: 8, band: band("ecole", "utc", "UTC", 4, 3, 8) } } }, { ecole: "utc" });
    expect(league(low, "ecole")).toMatch(/<ol class="board-list is-rest" start="8"><li><button type="button" class="board-row band-row league-row has-people is-me"[^>]*><span class="board-rank">8<\/span>/);
    expect(league(low, "boite")).not.toContain("is-rest");
    // déjà dans les cinq lignes : pas de doublon
    expect(view({ ecole: five, boite: [], mine: { ecole: { place: 2, band: five[1]! } } }, { ecole: "e2" })).not.toContain("is-rest");
  });

  it("rien que le classement : ni « Ta bande », ni emplacements, ni partage, ni « Encore N fiches », ni lien vers /bandes", () => {
    const html = view(prod, { ecole: "centrale-mediterranee" });
    for (const gone of ["Ta bande", "band-slots", "band-slot", "Partager", "Encore", "En formation", "Top des bandes", "board-meta", "band-mine", "/bandes", "Toutes les bandes", "bands-top-all"]) expect(html).not.toContain(gone);
  });
});
