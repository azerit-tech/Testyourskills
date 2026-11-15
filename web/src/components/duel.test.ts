// La suite du visiteur (§18.48) : le vote posé mène à « À ton tour », le duel s'envoie.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../../../shared/fixtures";
import type { CardData } from "../../../shared/types";
import { DICTS, LangProvider } from "../i18n";
import { Duel, useDuelSend } from "./Duel";
import { Jury } from "./Jury";
import type { MyCard } from "../lib/session";

/** Le duel tel que la page le monte pour un visiteur : l'envoi en crochet, le bouton en rose. */
function DuelWith({ mine, card: c }: { mine: MyCard; card: CardData }) {
  return createElement(Duel, { mine, card: c, duel: useDuelSend(mine, c, () => undefined), strong: true });
}

const jurySrc = readFileSync(join(__dirname, "Jury.tsx"), "utf8");

function stub(lang: string) {
  vi.stubGlobal("window", {
    location: { origin: "https://skills.test", pathname: "/c/x", search: "" },
    matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("navigator", { userAgent: "test", language: lang });
}
const render = (node: ReturnType<typeof createElement>, lang = "fr-FR") => {
  stub(lang);
  return renderToStaticMarkup(createElement(LangProvider, null, node)).replace(/&#x27;/g, "'");
};

afterEach(() => vi.unstubAllGlobals());

const card: CardData = { ...FIXTURES.silver, id: "DuelCard001", login: "camroux", overall: 68 };
const toast = () => undefined;

describe("le jury, une fois le vote posé", () => {
  const jury = (turn: string | null, mine: "guilty" | null, lang?: string) =>
    render(createElement(Jury, { cardId: card.id, card, jury: { guilty: 3, cleared: 1, mine }, toast, turn }), lang);

  it("« Tu as jugé @x. » et un bouton en contour « À ton tour »", () => {
    const html = jury("@camroux", "guilty");
    expect(html).toContain('<div class="jury-next"><p>Tu as jugé @camroux.</p><button type="button" class="pill">À ton tour</button></div>');
    expect(jury("@camroux", "guilty", "en-US")).toContain('<p>You judged @camroux.</p><button type="button" class="pill">Your turn</button>');
  });

  it("rien avant le vote, rien pour qui a déjà sa fiche ; la page ne défile plus toute seule", () => {
    expect(jury("@camroux", null)).not.toContain("jury-next");
    expect(jury(null, "guilty")).not.toContain("jury-next");
    expect(jurySrc).not.toContain("setTimeout");
  });
});

describe("le duel de qui a déjà sa fiche", () => {
  const duel = (overall: number, over: Partial<CardData> = {}, lang?: string) =>
    render(createElement(DuelWith, { mine: { id: "MyCard00001", login: "leamd", overall }, card: { ...card, ...over } }), lang);

  it("les deux notes en titre, l'écart ensuite ; « Lui envoyer ma note » en rose (le visiteur n'a que ce geste), « Ma fiche » en lien", () => {
    const html = duel(83).replace(/\u00a0/g, " ");
    expect(html).toContain('<h2 id="you-title">83/100 contre 68/100 : une étoile d\'avance</h2>');
    expect(html).toMatch(/<button type="button" class="pill pill-big">Lui envoyer ma note<\/button><a class="link-alt" href="\/c\/MyCard00001">Ma fiche<\/a>/);
    const en = duel(83, {}, "en-US");
    expect(en).toContain(">83/100 vs 68/100: one star ahead</h2>");
    expect(en).toContain(">Send them my rating</button>");
  });

  it("un dossier scellé : ni note, ni score à envoyer", () => {
    const html = duel(83, { sealed: true });
    expect(html).not.toContain("68");
    expect(html).not.toContain("Lui envoyer");
    expect(html).not.toContain("<button");
    expect(html).toContain(">Ma fiche</a>");
  });

  it("le texte envoyé : chaque note avec son échelle, la préposition qui va avec l'écart", () => {
    const { fr, en } = DICTS;
    expect(fr.denounce.duelText(83, 68, fr.denounce.starsAhead(1), "@camroux", "ahead")).toMatch(/^83\/100 contre 68\/100.: une étoile d'avance sur @camroux\. Verdict d'Azerit.:$/);
    expect(fr.denounce.duelText(68, 68, fr.denounce.tie, "@camroux", "tie")).toContain("à égalité avec @camroux.");
    expect(en.denounce.duelText(83, 68, en.denounce.starsAhead(1), "@camroux", "ahead")).toBe("83/100 vs 68/100: one star ahead of @camroux. Azerit's verdict:");
    expect(en.denounce.duelText(60, 68, en.denounce.pointsBehind(8), "@camroux", "behind")).toBe("60/100 vs 68/100: 8 points behind @camroux. Azerit's verdict:");
    expect(en.denounce.duelText(68, 68, en.denounce.tie, "@camroux", "tie")).toBe("68/100 vs 68/100: dead heat with @camroux. Azerit's verdict:");
  });
});
