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
      createElement(LangProvider, null, createElement(Wanted, { card, byId: "denouncer1", toast: () => undefined, onAgain: () => undefined })),
    );
    // Le dessin commun du site (SPEC §18.48) : six formes, les allumées d'abord, plus de glyphes dans le titre.
    const shapes = [...html.matchAll(/class="star-shape( on)?"/g)].map((m) => (m[1] ? "★" : "☆")).join("");
    expect(shapes).toBe(six);
    expect(html).toContain('class="stars stars-22"');
    expect(html).not.toMatch(/[★☆]/);
    // Dossier vide, pas encore revendiqué : aucune étoile.
    const sealed = renderToStaticMarkup(
      createElement(LangProvider, null, createElement(Wanted, { card: { ...card, sealed: true }, byId: "denouncer1", toast: () => undefined, onAgain: () => undefined })),
    );
    expect(sealed).not.toMatch(/[★☆]/);
    expect(sealed).not.toContain("star-shape");
    // Après les étoiles, le nom du niveau, comme partout (§18.52) ; le profil ne vient qu'au dossier scellé.
    expect(html).toContain('<span class="denounce-tag">Menace publique</span>');
    expect(html).not.toContain("Machine à livrer");
  });

  it("au bureau : la rangée des canaux, WhatsApp en rose ; aucun partage public, X n'est pas un bouton (§18.48, §18.94)", () => {
    vi.stubGlobal("window", { location: { origin: "https://skills.test", pathname: "/", search: "" }, matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("localStorage", { getItem: () => "fr", setItem: () => undefined });
    const wanted = (card: CardData) =>
      renderToStaticMarkup(createElement(LangProvider, null, createElement(Wanted, { card, byId: "denouncer1", mine: 79, toast: () => undefined, onAgain: () => undefined })));
    const html = wanted({ ...FIXTURES.silver, login: "camroux" });
    const via = [...html.matchAll(/<(?:a|button)[^>]*class="(pill[^"]*)"[^>]*>(.*?)<\/(?:a|button)>/g)].map((m) => [m[1], m[2].replace(/<svg.*?<\/svg>/g, "").replace(/<[^>]+>/g, "")]);
    expect(via).toEqual([
      ["pill pill-big denounce-via", "WhatsApp"],
      ["pill denounce-via", "E-mail"],
      ["pill denounce-via", "LinkedIn"],
      ["pill denounce-via", "Copier"],
    ]);
    // Un message à une personne : aucun partage public de la fiche d'un tiers.
    expect(html).not.toMatch(/Poster sur X|x\.com|share-offsite/);
    // L'e-mail : objet et corps, le lien de la fiche avec ?r= du dénonciateur.
    const mail = /href="(mailto:[^"]+)"/.exec(html)![1]!.replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
    const q = new URLSearchParams(mail.slice("mailto:?".length));
    expect(q.get("subject")).toBe("Je viens de te dénoncer sur Azerit");
    expect(q.get("body")).toMatch(/^@camroux, je viens de te dénoncer sur Azerit.: 79 contre 67, j'ai une étoile d'avance\. À toi de jouer.:\n\nhttps:\/\/skills\.test\/c\/[A-Za-z0-9]+\?r=denouncer1$/);
    // Au bureau, « Copier » copie le message ; « Copier le lien » ne double pas.
    expect(html).not.toContain(">Copier le lien<");
    // Le titre seul ; les étoiles et le profil sur leur ligne.
    expect(html).toMatch(/<h2 class="denounce-head"><span class="denounce-who-name">@camroux<\/span> est dans le viseur<\/h2><p class="denounce-level"><span[^>]*role="img"/);
    // Les complices : l'initiale, jamais l'identicône.
    expect(readFileSync(join(__dirname, "Denounce.tsx"), "utf8")).not.toContain("identicon");
    // Une fiche tirée d'un LinkedIn n'a pas de pseudo : son nom, sans « @ ».
    const { login: _l, ...noLogin } = FIXTURES.silver;
    const li = wanted({ ...(noLogin as CardData), name: "Camille Ardent" });
    expect(li).toContain('<span class="denounce-who-name">Camille Ardent</span>');
    expect(li).toContain("Camille%20Ardent%2C%20je%20viens%20de%20te%20d%C3%A9noncer");
  });

  it("sur téléphone : « Envoyer à @x » en rose (la feuille du système), WhatsApp et SMS dessous", () => {
    vi.stubGlobal("window", { location: { origin: "https://skills.test", pathname: "/", search: "" }, matchMedia: (q: string) => ({ matches: q === "(pointer: coarse)" }) });
    vi.stubGlobal("navigator", { share: () => Promise.resolve() });
    vi.stubGlobal("localStorage", { getItem: () => "fr", setItem: () => undefined });
    const html = renderToStaticMarkup(
      createElement(LangProvider, null, createElement(Wanted, { card: { ...FIXTURES.silver, login: "camroux" }, byId: "denouncer1", mine: 79, toast: () => undefined, onAgain: () => undefined })),
    );
    const via = [...html.matchAll(/<(?:a|button)[^>]*class="(pill[^"]*)"[^>]*>(.*?)<\/(?:a|button)>/g)].map((m) => [m[1], m[2].replace(/<svg.*?<\/svg>/g, "").replace(/<[^>]+>/g, "")]);
    expect(via).toEqual([
      ["pill pill-big", "Envoyer à @camroux"],
      ["pill denounce-via", "WhatsApp"],
      ["pill denounce-via", "SMS"],
    ]);
    expect(html).toMatch(/href="sms:\?&amp;body=%40camroux%2C%20je%20viens/);
    expect(html).toContain('<button type="button" class="link-alt">Copier le lien</button>');
    // La feuille du système reçoit le texte et le lien, jamais un fichier : la messagerie bâtit l'aperçu.
    const src = readFileSync(join(__dirname, "Denounce.tsx"), "utf8");
    expect(src).toContain('navigator.share({ title: "Azerit", text, url })');
    // Chaque canal compté.
    for (const ch of ["native", "whatsapp", "sms", "email", "linkedin", "copy", "copy_link"]) expect(src).toContain(`track("${ch}")`);
    expect(src).toContain('api.track("card_shared", card.id, { channel, kind: "denounce" })');
  });

  it("l'aperçu de ce qui part : l'image du duel, paresseuse, ratio réservé (§18.94)", () => {
    vi.stubGlobal("window", { location: { origin: "https://skills.test", pathname: "/", search: "" }, matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("localStorage", { getItem: () => "fr", setItem: () => undefined });
    const card = { ...FIXTURES.silver, login: "camroux" };
    const html = renderToStaticMarkup(createElement(LangProvider, null, createElement(Wanted, { card, byId: "denouncer1", toast: () => undefined, onAgain: () => undefined })));
    const img = /<img [^>]*class="denounce-preview"[^>]*>/.exec(html)![0];
    expect(img).toContain(`src="/og/${card.id}-vs-denouncer1.png?v=`);
    expect(img).toContain('width="1200"');
    expect(img).toContain('height="630"');
    expect(img).toContain('loading="lazy"');
    expect(img).toContain('alt="Le face-à-face envoyé à @camroux"');
    // Avant les boutons.
    expect(html.indexOf("denounce-preview")).toBeLessThan(html.indexOf("denounce-via"));
    expect(readFileSync(join(__dirname, "denounce.css"), "utf8")).toMatch(/\.denounce-preview \{[^}]*aspect-ratio: 1200 \/ 630;[^}]*border-radius/);
  });

  it("le message envoyé : on l'a dénoncé, le duel en chiffres, puis le lien (§18.94)", () => {
    const fr = (s: string) => s.replace(/ /g, " ");
    const d = DICTS.fr.denounce;
    expect(fr(d.sendText("@camroux", 79, 67, d.iLead(d.starsAhead(1))))).toBe("@camroux, je viens de te dénoncer sur Azerit : 79 contre 67, j'ai une étoile d'avance. À toi de jouer :");
    expect(fr(d.sendText("@camroux", 64, 71, d.youLead(d.pointsAhead(7))))).toBe("@camroux, je viens de te dénoncer sur Azerit : 64 contre 71, tu as 7 points d'avance. À toi de jouer :");
    expect(fr(d.sendText("@camroux", 71, 71, d.sendTie))).toBe("@camroux, je viens de te dénoncer sur Azerit : 71 contre 71, égalité parfaite. À toi de jouer :");
    // Dossier scellé : sa note ne se dit pas, la mienne invite.
    expect(fr(d.sendText("@camroux", 79, null, ""))).toBe("@camroux, je viens de te dénoncer sur Azerit. Ta fiche t'attend : fais mieux que mes 79 ?");
    expect(fr(d.sendText("@camroux", null, 67, ""))).toBe("@camroux, je viens de te dénoncer sur Azerit. À toi de jouer :");
    const e = DICTS.en.denounce;
    expect(e.sendText("@camroux", 79, 67, e.iLead(e.starsAhead(1)))).toBe("@camroux, I just turned you in on Azerit: 79 vs 67, I'm one star ahead. Your move:");
    expect(e.sendText("@camroux", 79, null, "")).toBe("@camroux, I just turned you in on Azerit. Your sheet is waiting: can you beat my 79?");
    // Ce que la personne reçue voit d'abord : vérifier elle-même (§18.104).
    expect(DICTS.fr.denounce.verify).toBe("Vérifie-la toi-même");
    expect(DICTS.en.denounce.verify).toBe("Check it yourself");
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

  it("rien à coller (§18.83) : le champ propose des personnes, comptes GitHub et profils LinkedIn mêlés, un toucher dénonce", () => {
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

  it("« @x est dans le viseur » tout de suite, avec sa barre qui avance, dans le bloc (§18.83)", () => {
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

describe("Dénoncer : le lien envoyé (§18.94)", () => {
  it("porte ?r= de la fiche du dénonciateur, pas celle du complice", async () => {
    vi.stubGlobal("window", { location: { origin: "https://skills.test" } });
    const { shareUrl } = await import("../lib/util");
    expect(shareUrl("abc123")).toBe("https://skills.test/c/abc123?r=abc123");
    expect(shareUrl("target1", "denouncer1")).toBe("https://skills.test/c/target1?r=denouncer1");
    expect(readFileSync(join(__dirname, "Denounce.tsx"), "utf8")).toContain("shareUrl(card.id, byId)");
  });
});
