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
    // Après les étoiles, le nom du niveau, comme partout (§18.52) ; le profil ne vient qu'au dossier scellé.
    expect(html).toContain('<span class="denounce-tag">Menace publique</span>');
    expect(html).not.toContain("Machine à livrer");
  });

  it("« Envoyer à @x » d'abord, en rose ; LinkedIn en contour ; X n'est plus un bouton (§18.48)", () => {
    vi.stubGlobal("window", { location: { origin: "https://skills.test", pathname: "/", search: "" }, matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("localStorage", { getItem: () => "fr", setItem: () => undefined });
    const wanted = (card: CardData) =>
      renderToStaticMarkup(createElement(LangProvider, null, createElement(Wanted, { card, toast: () => undefined, onAgain: () => undefined })));
    const html = wanted({ ...FIXTURES.silver, login: "camroux" });
    const buttons = [...html.matchAll(/<button type="button" class="(pill[^"]*)">(.*?)<\/button>/g)].map((m) => [m[1], m[2].replace(/<svg.*?<\/svg>/g, "").replace(/<[^>]+>/g, "")]);
    // Un seul bouton, à la personne : aucun partage public de la fiche d'un tiers.
    expect(buttons).toEqual([["pill pill-big", "Envoyer à @camroux"]]);
    expect(html).not.toMatch(/Poster sur X|x\.com|LinkedIn/);
    expect(html).toContain('<button type="button" class="link-alt">Copier le lien</button>');
    // Le titre seul ; les étoiles et le profil sur leur ligne.
    expect(html).toMatch(/<h2 class="denounce-head"><span class="denounce-who-name">@camroux<\/span> est dans le viseur<\/h2><p class="denounce-level"><span[^>]*role="img"/);
    // Les complices : l'initiale, jamais l'identicône.
    expect(readFileSync(join(__dirname, "Denounce.tsx"), "utf8")).not.toContain("<img");
    // Une fiche tirée d'un LinkedIn n'a pas de pseudo : son nom, sans « @ ».
    const { login: _l, ...noLogin } = FIXTURES.silver;
    const li = wanted({ ...(noLogin as CardData), name: "Camille Ardent" });
    expect(li).toContain("Envoyer à Camille Ardent");
    expect(li).toContain('<span class="denounce-who-name">Camille Ardent</span>');
  });

  it("le message envoyé à la personne : sa fiche, ses étoiles, et « Reprends-la », comme le bloc qui l'attend", () => {
    const fr = (s: string) => s.replace(/\u00a0/g, " ");
    expect(fr(DICTS.fr.denounce.sendText("@camroux", starsLine(4), "Pyromane"))).toBe("@camroux, Azerit a dressé ta fiche de dev : ★★★★☆☆, Pyromane. C'est toi ? Reprends-la :");
    expect(fr(DICTS.fr.denounce.sendText("@camroux", "", "Sous couverture"))).toBe("@camroux, Azerit a dressé ta fiche de dev : Sous couverture. C'est toi ? Reprends-la :");
    expect(DICTS.en.denounce.sendText("@camroux", starsLine(4), "Arsonist")).toBe("@camroux, Azerit drew up your dev rap sheet: ★★★★☆☆, Arsonist. That's you? Take it back:");
    expect(fr(DICTS.fr.denounce.lawyerLinkedinHint)).toMatch(/^Reprends-la : /);
    expect(DICTS.en.denounce.lawyerLinkedinHint).toMatch(/^Take it back: /);
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

  it("« Droit de faire appel » ne s'écrit plus nulle part : faire appel, c'est contester la note", () => {
    expect(JSON.stringify(DICTS.fr.denounce)).not.toContain("Droit de faire appel");
    expect(JSON.stringify(DICTS.en.denounce)).not.toContain("Right to appeal");
  });
});
