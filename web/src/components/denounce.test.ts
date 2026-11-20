// « Dénonce un complice » : le champ, les lignes de la séance (§18.114), l'envoi à la personne (§18.94).
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
import { Denounce, ShotLine, pendingPct, shotKey, shotsReducer } from "./Denounce";
import type { Shot } from "./Denounce";

afterEach(() => vi.unstubAllGlobals());

const SRC = readFileSync(join(__dirname, "Denounce.tsx"), "utf8");
const desk = () => {
  vi.stubGlobal("window", { location: { origin: "https://skills.test", pathname: "/", search: "" }, matchMedia: () => ({ matches: false }) });
  vi.stubGlobal("localStorage", { getItem: () => "fr", setItem: () => undefined });
};
const done = (card: CardData, key = `gh:${card.login ?? card.id}`): Shot => ({ key, who: `@${card.login}`, since: 0, status: "done", card });
const line = (shot: Shot, extra: { lead?: boolean; mine?: number | null } = {}) =>
  renderToStaticMarkup(createElement(LangProvider, null, createElement(ShotLine, { shot, lead: extra.lead ?? true, now: 10_000, byId: "denouncer1", mine: extra.mine, toast: () => undefined })));
/** Les boutons et liens d'envoi d'une ligne : leur classe et leur nom lu. */
const sends = (html: string) => [...html.matchAll(/<(?:a|button)[^>]*class="(pill[^"]*)"[^>]*aria-label="([^"]*)"/g)].map((m) => [m[1], m[2]]);

describe("Dénoncer à la suite, sans recharger (§18.114)", () => {
  it("trois dénonciations de suite : le champ se vide à chaque fois, trois lignes, la plus récente en haut", () => {
    // Le geste, dans l'ordre : la ligne d'abord, le champ vidé et le focus gardé, avant tout appel au serveur.
    const send = SRC.slice(SRC.indexOf("const send = async"), SRC.indexOf("// Les personnes à ce nom"));
    const order = ['setValue("")', "input.current?.focus({ preventScroll: true })", 'dispatch({ type: "add"', "await api.createCard"].map((s) => send.indexOf(s));
    expect(order.every((i) => i > 0)).toBe(true);
    expect(order[0]).toBeLessThan(order[3]!);
    expect(order[1]).toBeLessThan(order[3]!);
    expect(order[2]).toBeLessThan(order[3]!);
    // Le champ ne quitte jamais le bloc : aucun état qui le remplace, aucune navigation, aucun rechargement.
    expect(SRC).not.toMatch(/if \(state\.s === "(done|pending)"\) return/);
    expect(SRC).not.toMatch(/onLinkClick|navigate\(|location\.(reload|assign|href\s*=)/);
    expect(SRC).toContain('<ul className="denounce-lines"');

    // Trois personnes, l'une après l'autre ; les fiches sortent dans le désordre.
    let lines: Shot[] = [];
    let field = "";
    const who = ["camroux", "jplefevre", "nour-rs"];
    for (const [i, login] of who.entries()) {
      field = login; // ce qu'on tape
      const key = shotKey({ kind: "github", login });
      lines = shotsReducer(lines, { type: "add", shot: { key, who: `@${login}`, login, since: i, status: "pending" } });
      field = ""; // setValue("") dans le geste
      expect(field).toBe("");
      expect(lines).toHaveLength(i + 1);
      expect(lines[0]!.who).toBe(`@${login}`);
    }
    lines = shotsReducer(lines, { type: "done", key: "gh:jplefevre", card: { ...FIXTURES.silver, login: "jplefevre" } });
    lines = shotsReducer(lines, { type: "fail", key: "gh:camroux", error: "Dix dénonciations par jour, c'est le maximum. Reviens demain." });
    lines = shotsReducer(lines, { type: "done", key: "gh:nour-rs", card: { ...FIXTURES.gold, login: "nour-rs" } });
    expect(lines.map((l) => [l.who, l.status])).toEqual([
      ["@nour-rs", "done"],
      ["@jplefevre", "done"],
      ["@camroux", "error"],
    ]);
    // La même personne de nouveau : sa ligne remonte, elle ne se double pas.
    lines = shotsReducer(lines, { type: "add", shot: lines[1]! });
    expect(lines.map((l) => l.who)).toEqual(["@jplefevre", "@nour-rs", "@camroux"]);
    expect(SRC).toContain('if (inFlight.current.has(key) || prev?.status === "done")');
    // Le pseudo ne compte pas sa casse ; un lien LinkedIn est sa propre clé.
    expect(shotKey({ kind: "github", login: "CamRoux" })).toBe("gh:camroux");
    expect(shotKey({ kind: "linkedin", url: "https://www.linkedin.com/in/camille-ardent" })).toBe("li:https://www.linkedin.com/in/camille-ardent");
  });

  it("le bloc rendu : le champ, et « Le suivant ? » une fois la première dénonciation partie", () => {
    desk();
    const html = renderToStaticMarkup(createElement(LangProvider, null, createElement(Denounce, { cardId: "AbCdEf1234", selfLogin: "leamd", toast: () => undefined })));
    expect(html).toMatch(/^<section class="after-block denounce"[^>]*><h2[^>]*>Dénonce un complice<\/h2><p class="denounce-intro">On dresse sa fiche, tu la lui envoies\.<\/p><form class="denounce-form"/);
    expect(html).not.toContain("denounce-lines");
    expect(SRC).toContain("placeholder={lines.length ? d.placeholderNext : liOn ? d.placeholderBoth : d.placeholder}");
    expect(DICTS.fr.denounce.placeholderNext.replace(/\u00a0/g, " ")).toBe("Le suivant ?");
    expect(DICTS.en.denounce.placeholderNext).toBe("Who's next?");
  });

  it("une ligne prête : le visage, le nom, les six étoiles et la note ; scellée, ni étoiles ni note", () => {
    desk();
    const card = { ...FIXTURES.gold, login: "camroux" };
    const html = line(done(card));
    const shapes = [...html.matchAll(/class="star-shape( on)?"/g)].map((m) => (m[1] ? "★" : "☆")).join("");
    expect(shapes).toBe(starsLine(starsFor(card.overall)));
    expect(html).toMatch(/^<li class="denounce-line is-done"><span class="board-avatar">/);
    expect(html).toContain('<span class="denounce-line-name">@camroux</span>');
    expect(html).toContain(`<b>${card.overall}</b>`);
    expect(html).not.toMatch(/[★☆]/);
    const sealed = line(done({ ...card, sealed: true }));
    expect(sealed).not.toContain("star-shape");
    expect(sealed).not.toContain(`<b>${card.overall}</b>`);
    // En attente : la barre ; en échec : le message, sans bouton d'envoi.
    const wait = line({ key: "gh:x", who: "@x", login: "x", since: 0, status: "pending" });
    expect(wait).toContain('class="denounce-bar" style="--p:41%"');
    expect(wait).toContain("Interrogatoire en cours…");
    const err = line({ key: "gh:x", who: "@x", since: 0, status: "error", error: "Reviens demain." });
    expect(err).toContain('<span class="denounce-line-err">Reviens demain.</span>');
    expect(err).not.toContain("pill");
  });

  it("au bureau : WhatsApp et Copier, en ronds ; le rose pour la dernière fiche prête seulement ; aucun partage public", () => {
    desk();
    const card = { ...FIXTURES.silver, login: "camroux" };
    const html = line(done(card), { mine: 79 });
    expect(sends(html)).toEqual([
      ["pill denounce-line-icon is-lead", "Envoyer à @camroux sur WhatsApp"],
      ["pill denounce-line-icon", "Copier le message pour @camroux"],
    ]);
    expect(sends(line(done(card), { lead: false }))[0]![0]).toBe("pill denounce-line-icon");
    expect(html).not.toMatch(/Poster sur X|x\.com|share-offsite/);
    // Le message : le duel en chiffres, puis le lien de la fiche avec ?r= du dénonciateur.
    expect(SRC).toContain("const message = `${text} ${url}`;");
    expect(SRC).toContain("shareUrl(card.id, byId)");
    // Une fiche tirée d'un LinkedIn n'a pas de pseudo : son nom, sans « @ ».
    const { login: _l, ...noLogin } = FIXTURES.silver;
    expect(line(done({ ...(noLogin as CardData), name: "Camille Ardent" }, "li:x"))).toContain('<span class="denounce-line-name">Camille Ardent</span>');
  });

  it("sur téléphone : « Envoyer », la feuille du système, texte et lien sans fichier ; chaque canal compté", () => {
    vi.stubGlobal("window", { location: { origin: "https://skills.test", pathname: "/", search: "" }, matchMedia: (q: string) => ({ matches: q === "(pointer: coarse)" }) });
    vi.stubGlobal("navigator", { share: () => Promise.resolve() });
    vi.stubGlobal("localStorage", { getItem: () => "fr", setItem: () => undefined });
    const html = line(done({ ...FIXTURES.silver, login: "camroux" }), { mine: 79 });
    expect(sends(html)).toEqual([["pill denounce-line-go is-lead", "Envoyer à @camroux"]]);
    expect(html).toContain("<span>Envoyer</span>");
    expect(SRC).toContain('navigator.share({ title: "Azerit", text, url })');
    for (const ch of ["native", "whatsapp", "copy"]) expect(SRC).toContain(`track("${ch}")`);
    expect(SRC).toContain('api.track("card_shared", card.id, { channel, kind: "denounce" })');
    // Un seul rose par écran : le partage, juste dessous, passe en contour dès qu'une fiche est prête.
    expect(readFileSync(join(__dirname, "denounce.css"), "utf8")).toContain(".after-block.denounce ~ .after-block.out .out-main {");
  });
});

describe("Dénoncer : le champ et le message", () => {
  it("le message envoyé : on l'a dénoncé, le duel en chiffres, puis le lien (§18.94)", () => {
    const fr = (s: string) => s.replace(/\u00a0/g, " ");
    const d = DICTS.fr.denounce;
    expect(fr(d.sendText("@camroux", 79, 67, d.iLead(d.starsAhead(1))))).toBe("@camroux, je viens de te dénoncer sur Azerit : 79 contre 67, j'ai une étoile d'avance. À toi de jouer :");
    expect(fr(d.sendText("@camroux", 64, 71, d.youLead(d.pointsAhead(7))))).toBe("@camroux, je viens de te dénoncer sur Azerit : 64 contre 71, tu as 7 points d'avance. À toi de jouer :");
    expect(fr(d.sendText("@camroux", 71, 71, d.sendTie))).toBe("@camroux, je viens de te dénoncer sur Azerit : 71 contre 71, égalité parfaite. À toi de jouer :");
    expect(fr(d.sendText("@camroux", 79, null, ""))).toBe("@camroux, je viens de te dénoncer sur Azerit. Ta fiche t'attend : fais mieux que mes 79 ?");
    expect(fr(d.sendText("@camroux", null, 67, ""))).toBe("@camroux, je viens de te dénoncer sur Azerit. À toi de jouer :");
    const e = DICTS.en.denounce;
    expect(e.sendText("@camroux", 79, 67, e.iLead(e.starsAhead(1)))).toBe("@camroux, I just turned you in on Azerit: 79 vs 67, I'm one star ahead. Your move:");
    expect(e.sendText("@camroux", 79, null, "")).toBe("@camroux, I just turned you in on Azerit. Your sheet is waiting: can you beat my 79?");
    expect(DICTS.fr.denounce.itsMe).toBe("C'est bien moi");
    expect(DICTS.en.denounce.itsMe).toBe("That's me");
  });

  it("le champ : un nom, un pseudo GitHub ou un lien LinkedIn quand le serveur lit LinkedIn, sinon GitHub seul, et il le dit", () => {
    expect(SRC).toContain("detectEntry(raw)");
    expect(SRC).toContain('if (entry.kind === "linkedin" && !liOn) return setError(d.githubOnly);');
    expect(SRC).toMatch(/\{ linkedin: entry\.url, \.\.\.\(name \? \{ name \} : \{\}\) \}\), lang, denouncedBy: cardId/);
    // Le nom de la suggestion touchée part avec le lien : le serveur cherche son GitHub dès le départ (§18.121).
    expect(SRC).toContain(`item.kind === "linkedin" ? item.title : undefined`);
    expect(DICTS.fr.denounce.placeholderBoth).toBe("Son nom, son pseudo ou un lien");
    expect(DICTS.en.denounce.placeholderBoth).toBe("Their name, username or a link");
    expect(DICTS.fr.denounce.githubOnly).toBe("Pour l'instant, par pseudo GitHub seulement.");
  });

  it("rien à coller (§18.83) : le champ propose des personnes, comptes GitHub et profils LinkedIn mêlés, un toucher dénonce", () => {
    desk();
    const html = renderToStaticMarkup(createElement(LangProvider, null, createElement(Denounce, { cardId: "AbCdEf1234", selfLogin: "leamd", toast: () => undefined })));
    expect(html).toMatch(/<div class="field field-who"><label[^>]*>Nom, pseudo GitHub ou lien LinkedIn du complice<\/label><input[^>]*placeholder="Son nom, son pseudo ou un lien"[^>]*role="combobox"/);
    expect(html).toContain('<button type="submit" class="pill pill-big denounce-go">Dénoncer</button>');
    expect(SRC).toContain("useSuggestions(value, { github: true, linkedin: mixed }, false)");
    expect(SRC).toContain("useSuggestBox({ id: `${uid}-sg`, items: people, onPick: pickOne, mixed, label })");
    expect(SRC).toContain("p.login.toLowerCase() === selfLogin.toLowerCase()");
    expect(SRC).toMatch(/const pickOne = \(item: Suggestion\) =>\s*void send\(item\.kind === "github" \? \{ kind: "github", login: item\.login \} : \{ kind: "linkedin", url: item\.url \}/);
    expect(SRC).toContain("if (people.length === 1) return pickOne(people[0]!);");
    expect(SRC).toContain("if (people.length) return box.show();");
  });

  it("la barre de l'interrogatoire avance sur la durée attendue, ralentit ensuite, et ne touche jamais le bout", () => {
    expect(pendingPct(0)).toBe(0);
    expect(pendingPct(10_000)).toBe(41);
    expect(pendingPct(20_000)).toBe(82);
    const later = [30_000, 60_000, 5 * 60_000].map(pendingPct);
    expect(later[0]).toBeGreaterThan(82);
    expect(later[1]).toBeGreaterThanOrEqual(later[0]!);
    expect(later[2]).toBeLessThan(100);
    expect(DICTS.fr.denounce.pending).toBe("Interrogatoire en cours…");
    expect(DICTS.en.denounce.pending).toBe("Interrogation under way…");
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
  });
});
