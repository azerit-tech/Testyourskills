// Les logos LinkedIn et GitHub (§18.108) : sous le nom d'une fiche, au bout des lignes de classement,
// le compte proposé ; et la démo, qui suit la règle du serveur.
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { boardPerson } from "../../../shared/boardPerson";
import { FIXTURES } from "../../../shared/fixtures";
import type { TopEntry, WeekTop } from "../../../shared/types";
import { LangProvider } from "../i18n";
import { mockApi } from "../lib/mock";
import { WantedHead } from "../pages/CardPage";
import { ProfileLinks } from "./ProfileLinks";
import { Propose } from "./Propose";
import { WeekBoardView } from "./WeekBoard";

function render(el: ReactElement, language = "fr-FR"): string {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("navigator", { language });
  return renderToStaticMarkup(createElement(LangProvider, null, el));
}
afterEach(() => vi.unstubAllGlobals());

const LI = "https://www.linkedin.com/in/lea-martin-dubois";
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("le rendu des logos", () => {
  it("les deux, dans un nouvel onglet, nommés pour le lecteur d'écran, sans texte à côté", () => {
    const html = render(createElement(ProfileLinks, { links: { linkedin: LI, github: "https://github.com/leamd" }, who: "Léa Martin" }));
    expect(html).toContain(`href="${LI}" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn de Léa Martin"`);
    expect(html).toContain('href="https://github.com/leamd" target="_blank" rel="noopener noreferrer" aria-label="GitHub de Léa Martin"');
    expect(html.replace(/<[^>]+>/g, "")).toBe("");
    // LinkedIn d'abord, comme partout dans le site.
    expect(html.indexOf("is-linkedin")).toBeLessThan(html.indexOf("is-github"));
  });

  it("une seule source, aucune, l'anglais, l'élision", () => {
    expect(count(render(createElement(ProfileLinks, { links: { github: "https://github.com/leamd" }, who: "@leamd" })), 'class="plink is-')).toBe(1);
    expect(render(createElement(ProfileLinks, { links: {}, who: "x" }))).toBe("");
    expect(render(createElement(ProfileLinks, { links: null, who: "x" }))).toBe("");
    expect(render(createElement(ProfileLinks, { links: { linkedin: LI }, who: "Inès" }))).toContain("LinkedIn d’Inès");
    expect(render(createElement(ProfileLinks, { links: { linkedin: LI }, who: "Léa" }), "en-US")).toContain('aria-label="Léa&#x27;s LinkedIn"');
  });

  it("la tête de la fiche : au bout du nom, hors du titre ; rien sans lien", () => {
    const card = { ...FIXTURES.gold, id: "Card000001" };
    const html = render(createElement(WantedHead, { card, links: { linkedin: LI, github: "https://github.com/leamd" } }));
    expect(html).toMatch(/<\/h1><span class="plinks wanted-links"/);
    expect(html).toContain('aria-label="GitHub de @leamd"');
    expect(render(createElement(WantedHead, { card }))).not.toContain("plinks");
  });
});

describe("les lignes du top de la semaine", () => {
  const row = (rank: number, p: Parameters<typeof boardPerson>[0], li?: string): TopEntry => ({ rank, ...boardPerson(p, `Card00000${rank}`, null, li), overall: 90 - rank, stars: 5 });
  const top = (entries: TopEntry[]): WeekTop => ({ weekStart: 0, endsAt: 3_600_000, week: 47, total: entries.length, entries });

  it("dossier, GitHub seule, LinkedIn seule : leurs logos au bout de la ligne, à côté du lien vers la fiche, jamais dedans", () => {
    const html = render(
      createElement(WeekBoardView, {
        top: top([row(1, { name: "Léa Martin-Dubois", login: "leamd" }, LI), row(2, { login: "nour-rs" }), row(3, { name: "Inès Carpentier" }, "https://www.linkedin.com/in/ines-carpentier")]),
        now: 0,
        onPlay: () => undefined,
      }),
    );
    expect(count(html, 'class="plinks"')).toBe(3);
    expect(count(html, "is-linkedin")).toBe(2);
    expect(count(html, "is-github")).toBe(2);
    // Le logo suit le lien de la ligne, il n'est pas dedans (pas de lien dans un lien).
    expect(html).toMatch(/<span class="board-score">89<span class="board-pct">%<\/span><\/span><\/a><span class="plinks"/);
    expect(html).toContain('href="https://github.com/nour-rs"');
  });
});

describe("le compte proposé", () => {
  it("« C'est ton GitHub ? » : le @pseudo mène à son GitHub ; « C'est ton LinkedIn ? » : le nom à son profil", () => {
    const card = { id: "abc123", login: undefined, linkedinUrl: LI };
    const gh = render(createElement(Propose, { proposal: { kind: "github", login: "jmougeot", name: "Jacques", avatarUrl: "", sure: false }, card, onNo: () => undefined }));
    expect(gh).toContain('<a class="propose-name" href="https://github.com/jmougeot" target="_blank" rel="noopener noreferrer">@jmougeot</a>');
    const li = render(
      createElement(Propose, { proposal: { kind: "linkedin", url: LI, name: "Léa Martin", headline: "", sure: false }, card: { id: "def456", login: "leamd", linkedinUrl: undefined }, onNo: () => undefined }),
    );
    expect(li).toContain(`<a class="propose-name" href="${LI}"`);
  });
});

describe("la démo suit la règle du serveur", () => {
  const linksOf = async (id: string, me: string | null = null) => {
    const s = await mockApi.getJob(id, me);
    return s.state === "done" ? (s.links ?? null) : "pending";
  };

  it("dossier LinkedIn + GitHub, GitHub seule, LinkedIn seule", async () => {
    expect(await linksOf("m-licmp-abc123")).toEqual({ linkedin: "https://www.linkedin.com/in/camille-ardent", github: "https://github.com/leamd" });
    expect(await linksOf("m-gold-abc123")).toEqual({ github: "https://github.com/leamd" });
    expect(await linksOf("m-li-abc123")).toEqual({ linkedin: "https://www.linkedin.com/in/sans-github" });
  });

  it("dénoncée ou revendiquée : les mêmes logos", async () => {
    expect(await linksOf("m-li-Dabc123")).toEqual({ linkedin: "https://www.linkedin.com/in/sans-github" });
    expect(await linksOf("m-licmp-Dabc123")).toEqual({ linkedin: "https://www.linkedin.com/in/camille-ardent", github: "https://github.com/leamd" });
    expect(await linksOf("m-licmp-Cabc123")).toEqual({ linkedin: "https://www.linkedin.com/in/camille-ardent", github: "https://github.com/leamd" });
    expect(await linksOf("m-licmp-Dabc124", "leamd")).toEqual({ linkedin: "https://www.linkedin.com/in/camille-ardent", github: "https://github.com/leamd" });
  });
});
