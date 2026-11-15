// La fiche du complice (§18.27) : les six étoiles, pleines puis vides, dans le titre comme dans le texte partagé.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../../../shared/fixtures";
import type { CardData } from "../../../shared/types";
import { starsFor } from "../../../shared/types";
import { starsLine } from "../../../shared/stars";
import { DICTS, LangProvider } from "../i18n";
import { Wanted } from "./Denounce";

afterEach(() => vi.unstubAllGlobals());

describe("Dénoncer : la fiche du complice", () => {
  it("affiche les six étoiles", () => {
    vi.stubGlobal("window", { location: { origin: "https://skills.test", pathname: "/", search: "" }, matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("localStorage", { getItem: () => "fr", setItem: () => undefined });
    const card = FIXTURES.gold;
    const six = starsLine(starsFor(card.overall));
    expect(six).toHaveLength(6);
    const html = renderToStaticMarkup(
      createElement(LangProvider, null, createElement(Wanted, { card, toast: () => undefined, onAgain: () => undefined })),
    );
    // Le dessin commun du site (SPEC §18.48) : six formes, les allumées d'abord, plus de glyphes dans le titre.
    const shapes = [...html.matchAll(/class="star-shape( on)?"/g)].map((m) => (m[1] ? "★" : "☆")).join("");
    expect(shapes).toBe(six);
    expect(html).toContain('class="stars stars-22"');
    expect(html).not.toMatch(/[★☆]/);
    // Dossier vide, pas encore revendiqué : aucune étoile.
    const sealed = renderToStaticMarkup(
      createElement(LangProvider, null, createElement(Wanted, { card: { ...card, sealed: true }, toast: () => undefined, onAgain: () => undefined })),
    );
    expect(sealed).not.toMatch(/[★☆]/);
    expect(sealed).not.toContain("star-shape");
  });

  it("« Envoyer à @x » d'abord, en rose ; LinkedIn en contour ; X n'est plus un bouton (§18.48)", () => {
    vi.stubGlobal("window", { location: { origin: "https://skills.test", pathname: "/", search: "" }, matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("localStorage", { getItem: () => "fr", setItem: () => undefined });
    const wanted = (card: CardData) =>
      renderToStaticMarkup(createElement(LangProvider, null, createElement(Wanted, { card, toast: () => undefined, onAgain: () => undefined })));
    const html = wanted({ ...FIXTURES.silver, login: "camroux" });
    const buttons = [...html.matchAll(/<button type="button" class="(pill[^"]*)">(.*?)<\/button>/g)].map((m) => [m[1], m[2].replace(/<svg.*?<\/svg>/g, "").replace(/<[^>]+>/g, "")]);
    expect(buttons).toEqual([
      ["pill pill-big", "Envoyer à @camroux"],
      ["pill", "Partager sur LinkedIn"],
    ]);
    expect(html).not.toMatch(/Poster sur X|x\.com/);
    // Une fiche tirée d'un LinkedIn n'a pas de pseudo : son nom, sans « @ ».
    const { login: _l, ...noLogin } = FIXTURES.silver;
    const li = wanted({ ...(noLogin as CardData), name: "Camille Ardent" });
    expect(li).toContain("Envoyer à Camille Ardent");
    expect(li).toContain('<span class="denounce-who-name">Camille Ardent</span>');
  });

  it("le message envoyé à la personne : sa fiche, ses étoiles, son droit de faire appel", () => {
    expect(DICTS.fr.denounce.sendText("@camroux", starsLine(4), "Pyromane")).toBe("@camroux, Azerit a dressé ta fiche de dev : ★★★★☆☆, Pyromane. Droit de faire appel :");
    expect(DICTS.fr.denounce.sendText("@camroux", "", "Sous couverture")).toBe("@camroux, Azerit a dressé ta fiche de dev : Sous couverture. Droit de faire appel :");
    expect(DICTS.en.denounce.sendText("@camroux", starsLine(4), "Arsonist")).toBe("@camroux, Azerit drew up your dev rap sheet: ★★★★☆☆, Arsonist. Right to appeal:");
  });

  it("le champ : un lien LinkedIn ou un pseudo GitHub quand le serveur lit LinkedIn, sinon le pseudo seul, et il le dit", () => {
    const src = readFileSync(join(__dirname, "Denounce.tsx"), "utf8");
    expect(src).toContain("detectEntry(raw)");
    expect(src).toMatch(/entry\.kind === "linkedin" && !liOn\) return setState\(\{ s: "idle", error: d\.githubOnly \}\)/);
    expect(src).toMatch(/\{ linkedin: entry\.url \}\), lang, denouncedBy: cardId/);
    expect(DICTS.fr.denounce.placeholderBoth).toBe("Lien LinkedIn ou pseudo GitHub");
    expect(DICTS.en.denounce.placeholderBoth).toBe("LinkedIn link or GitHub username");
    expect(DICTS.fr.denounce.githubOnly).toBe("Pour l'instant, par pseudo GitHub seulement.");
  });

  it("le texte partagé porte les six étoiles", () => {
    expect(DICTS.fr.denounce.shareText("@leamd", starsLine(5), "Sous couverture", null, "https://x.test")).toBe(
      "@leamd est dans le viseur ★★★★★☆, Sous couverture. Droit de faire appel\u00a0: https://x.test",
    );
  });

  it("dossier scellé : ni étoiles dans le titre, ni dans le texte partagé", () => {
    expect(DICTS.fr.denounce.shareText("@camroux", "", "Sous couverture", null, "https://x.test")).toBe(
      "@camroux est dans le viseur, Sous couverture. Droit de faire appel\u00a0: https://x.test",
    );
    expect(DICTS.en.denounce.shareText("@camroux", "", "Undercover", null, "https://x.test")).toBe(
      "@camroux is in the crosshairs, Undercover. Right to appeal: https://x.test",
    );
  });
});
