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
import { Denounce, Wanted, pendingPct } from "./Denounce";

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

  it("le champ : un nom, un pseudo GitHub ou un lien LinkedIn quand le serveur lit LinkedIn, sinon GitHub seul, et il le dit", () => {
    const src = readFileSync(join(__dirname, "Denounce.tsx"), "utf8");
    expect(src).toContain("detectEntry(raw)");
    expect(src).toMatch(/entry\.kind === "linkedin" && !liOn\) return setState\(\{ s: "idle", error: d\.githubOnly \}\)/);
    expect(src).toMatch(/\{ linkedin: entry\.url \}\), lang, denouncedBy: cardId/);
    expect(DICTS.fr.denounce.placeholderBoth).toBe("Son nom, son pseudo ou un lien");
    expect(DICTS.en.denounce.placeholderBoth).toBe("Their name, username or a link");
    expect(DICTS.fr.denounce.githubOnly).toBe("Pour l'instant, par pseudo GitHub seulement.");
  });

  it("rien à coller (§18.82) : le champ propose des personnes, comptes GitHub et profils LinkedIn mêlés, un toucher dénonce", () => {
    vi.stubGlobal("localStorage", { getItem: () => "fr", setItem: () => undefined });
    const html = renderToStaticMarkup(createElement(LangProvider, null, createElement(Denounce, { cardId: "AbCdEf1234", selfLogin: "leamd", toast: () => undefined })));
    // Le titre, une ligne, le champ à suggestions (combobox), « Dénoncer » en contour. Plus de préfixe « @ ».
    expect(html).toMatch(/^<section class="after-block denounce"[^>]*><h2[^>]*>Dénonce un complice<\/h2><p class="denounce-intro">On dresse sa fiche, tu la lui envoies\.<\/p><form class="denounce-form"/);
    expect(html).toMatch(/<div class="field field-who"><label[^>]*>Nom, pseudo GitHub ou lien LinkedIn du complice<\/label><input[^>]*placeholder="Son nom, son pseudo ou un lien"[^>]*role="combobox"/);
    expect(html).toContain('<button type="submit" class="pill">Dénoncer</button>');
    expect(html).not.toContain("field-prefix");
    const src = readFileSync(join(__dirname, "Denounce.tsx"), "utf8");
    // Les deux sources dans une liste, chaque ligne dit la sienne ; son propre compte n'y est pas.
    expect(src).toContain("useSuggestions(value, { github: true, linkedin: mixed }, state.s !== \"idle\")");
    expect(src).toContain("useSuggestBox({ id: `${uid}-sg`, items: people, onPick: pickOne, mixed, label })");
    expect(src).toContain('p.login.toLowerCase() === selfLogin.toLowerCase()');
    // Un toucher : la dénonciation part, par le pseudo du compte ou l'adresse du profil.
    expect(src).toMatch(/const pickOne = \(item: Suggestion\) => \{\s*setValue\(item\.title\);\s*void send\(item\.kind === "github" \? \{ kind: "github", login: item\.login \} : \{ kind: "linkedin", url: item\.url \}/);
    // Un nom envoyé sans ligne choisie : une seule personne, c'est elle ; plusieurs, la liste ; aucune, l'erreur.
    expect(src).toContain("if (people.length === 1) return pickOne(people[0]!);");
    expect(src).toContain("if (people.length) return box.show();");
  });

  it("« @x est dans le viseur » tout de suite, avec sa barre qui avance, dans le bloc (§18.82)", () => {
    const src = readFileSync(join(__dirname, "Denounce.tsx"), "utf8");
    // L'attente porte déjà le titre de la fiche prête : la personne, « est dans le viseur », puis la barre.
    expect(src).toMatch(/<section className="after-block denounce is-pending" aria-busy>\s*<h2 className="denounce-head">\s*<span className="denounce-who-name">\{state\.who\}<\/span> \{d\.inSights\}\s*<\/h2>/);
    expect(src).toContain('style={{ "--p": `${pendingPct(now - state.since)}%` } as CSSProperties}');
    // La barre avance sur la durée attendue, ralentit ensuite, et ne touche jamais le bout avant la fiche.
    expect(pendingPct(0)).toBe(0);
    expect(pendingPct(10_000)).toBe(41);
    expect(pendingPct(20_000)).toBe(82);
    const later = [30_000, 60_000, 5 * 60_000].map(pendingPct);
    expect(later[0]).toBeGreaterThan(82);
    expect(later[1]).toBeGreaterThanOrEqual(later[0]!);
    expect(later[2]).toBeLessThan(100);
    expect(DICTS.fr.denounce.pending).toBe("Interrogatoire en cours…");
    expect(DICTS.en.denounce.pending).toBe("Interrogation under way…");
    // Prête, elle garde « Envoyer à @x » en premier, seul rose : le partage juste dessous passe en contour.
    expect(readFileSync(join(__dirname, "denounce.css"), "utf8")).toContain(".after-block.denounce.is-done ~ .after-block.out .out-main {");
  });

  it("« Droit de faire appel » ne s'écrit plus nulle part : faire appel, c'est contester la note", () => {
    expect(JSON.stringify(DICTS.fr.denounce)).not.toContain("Droit de faire appel");
    expect(JSON.stringify(DICTS.en.denounce)).not.toContain("Right to appeal");
  });
});
