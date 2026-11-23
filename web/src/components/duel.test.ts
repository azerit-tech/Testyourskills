// La suite du visiteur (§18.48) : le duel s'envoie.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../../../shared/fixtures";
import type { CardData } from "../../../shared/types";
import { DICTS, LangProvider } from "../i18n";
import { Duel, useDuelSend } from "./Duel";
import type { MyCard } from "../lib/session";

/** Le duel tel que la page le monte pour un visiteur : plus bas que la fiche, l'envoi en contour (§18.104). */
function DuelWith({ mine, card: c, info }: { mine: MyCard; card: CardData; info?: boolean }) {
  return createElement(Duel, { mine, card: c, duel: useDuelSend(mine, c, () => undefined), info });
}

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

describe("le duel de qui a déjà sa fiche", () => {
  const duel = (overall: number, over: Partial<CardData> = {}, lang?: string, info?: boolean) =>
    render(createElement(DuelWith, { mine: { id: "MyCard00001", login: "leamd", overall }, card: { ...card, ...over }, info }), lang);

  it("les deux notes en titre, l'écart ensuite ; « Lui envoyer ma note » en contour, jamais le rose (§18.104), « Ma fiche » en lien", () => {
    const html = duel(83).replace(/\u00a0/g, " ");
    expect(html).toContain('<h2 id="you-title">83 % contre 68 % : une étoile d\'avance</h2>');
    expect(html).toMatch(/<button type="button" class="pill">Lui envoyer ma note<\/button><a class="link-alt" href="\/c\/MyCard00001">Ma fiche<\/a>/);
    expect(html).not.toContain("pill-big");
    const en = duel(83, {}, "en-US");
    expect(en).toContain(">83% vs 68%: one star ahead</h2>");
    expect(en).toContain(">Send them my rating</button>");
  });

  it("sur une fiche dénoncée : l'écart pour information, rien à envoyer (§18.104)", () => {
    const html = duel(83, {}, undefined, true).replace(/\u00a0/g, " ");
    expect(html).toContain(">83 % contre 68 % : une étoile d'avance</h2>");
    expect(html).not.toContain("<button");
    expect(html).toContain(">Ma fiche</a>");
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
    expect(fr.denounce.duelText(83, 68, fr.denounce.starsAhead(1), "@camroux", "ahead")).toMatch(/^83.% contre 68.%.: une étoile d'avance sur @camroux\. Verdict d'Azerit.:$/);
    expect(fr.denounce.duelText(68, 68, fr.denounce.tie, "@camroux", "tie")).toContain("à égalité avec @camroux.");
    expect(en.denounce.duelText(83, 68, en.denounce.starsAhead(1), "@camroux", "ahead")).toBe("83% vs 68%: one star ahead of @camroux. Azerit's verdict:");
    expect(en.denounce.duelText(60, 68, en.denounce.pointsBehind(8), "@camroux", "behind")).toBe("60% vs 68%: 8 points behind @camroux. Azerit's verdict:");
    expect(en.denounce.duelText(68, 68, en.denounce.tie, "@camroux", "tie")).toBe("68% vs 68%: dead heat with @camroux. Azerit's verdict:");
  });
});
