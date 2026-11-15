// La page de la fiche, rendue en chaîne sans navigateur : l'ordre des blocs du
// visiteur (lien partagé) et de qui a fait la fiche (§18.27, §18.28).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fileOf } from "../../../shared/caseFile";
import type { CardData, ComparisonData } from "../../../shared/types";
import { FIXTURE_COMPARISON, FIXTURES } from "../../../shared/fixtures";
import { tileOrder } from "../../../shared/recruiterLine";
import { DICTS } from "../i18n";
import { LangProvider } from "../i18n";
import { Fold, WeekLine, type Shareable } from "../components/After";
import { linkedinFromField } from "../components/AddLinkedin";
import { skyOf } from "../components/ProfileTile";
import { JuryLine } from "../components/Jury";
import { tokens } from "../lib/api";
import { githubGridMock } from "../lib/mockGrid";
import { setPlea } from "../lib/plea";
import { Result, type ResultProps } from "./CardPage";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

function stub(lang: string) {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    location: { origin: "https://skills.test", pathname: "/c/x", search: "" },
    matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: () => undefined });
  vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  vi.stubGlobal("navigator", { userAgent: IPHONE, language: lang });
  vi.stubGlobal("document", { documentElement: { dataset: {}, classList: { add: () => undefined, remove: () => undefined } }, querySelector: () => null, getElementById: () => null });
}

function renderResult(item: Shareable, opts: { owner: boolean; lang?: string; token?: string; plea?: number }): string {
  stub(opts.lang ?? "fr-FR");
  const id = item.kind === "card" ? item.card.id : item.comparison.id;
  if (opts.token) tokens.set(id, opts.token);
  if (opts.plea) setPlea(id, opts.plea);
  const props: ResultProps = {
    item,
    animate: false,
    start: true,
    abort: false,
    onScene: () => undefined,
    owner: opts.owner,
    fresh: false,
    notice: null,
    me: null,
    onMe: () => undefined,
    onDeleted: () => undefined,
  };
  return renderToStaticMarkup(createElement(LangProvider, null, createElement(Result, props)));
}

/** La position de chaque marqueur dans la page ; -1 s'il manque. */
const at = (html: string, marks: string[]) => marks.map((m) => html.indexOf(m));
const ascending = (xs: number[]) => xs.every((x, i) => x >= 0 && (i === 0 || x > xs[i - 1]));

const FINDINGS: CardData["findings"] = [
  { kind: "night_share", source: "github", text: { fr: "41 % des commits entre 22 h et 5 h.", en: "41% of commits between 10pm and 5am." }, proof: "https://github.com/x", score: 40 },
];
const card = (over: Partial<CardData> = {}): Shareable => ({ kind: "card", card: { ...FIXTURES.gold, id: "VisitCard01", findings: FINDINGS, ...over } });

afterEach(() => vi.unstubAllGlobals());

describe("page partagée, vue par un visiteur", () => {
  it("l'en-tête, la fiche, la phrase qui dit ce que c'est, le jury et sa peine, le dossier replié, « À ton tour » (§18.48)", () => {
    const html = renderResult(card(), { owner: false });
    const order = at(html, ['class="wanted"', 'class="result-stage"', 'class="visitor-lead"', 'class="jury"', 'class="penalty"', 'class="fold dossier"', 'id="you"']);
    expect(ascending(order), JSON.stringify(order)).toBe(true);
    // La peine est dans le bloc du jury, « À ton tour » hors de la colonne (au bureau, il passe sous la fiche).
    expect(html).toMatch(/<section class="jury".*?<p class="penalty">.*?<\/p><\/section>/);
    expect(html).toMatch(/<\/div><section class="you" id="you"/);
    expect(html).toContain(">À ton tour</h2>");
  });

  it("la phrase du visiteur : ce qu'il regarde, et ce que coûte la sienne ; jamais pour qui a fait la fiche", () => {
    const login = FIXTURES.gold.login;
    const fr = renderResult(card(), { owner: false });
    expect(fr.replace(/&#x27;/g, "'")).toContain(
      `<p class="visitor-lead">Azerit a dressé la fiche de dev de @${login} comme en recrutement : l'expérience d'abord, le code en preuve. La tienne prend une minute, sans compte.</p>`,
    );
    const en = renderResult(card(), { owner: false, lang: "en-US" });
    expect(en.replace(/&#x27;/g, "'")).toContain(`Azerit drew up @${login}'s dev rap sheet the way a recruiter would: experience first, code as proof. Yours takes one minute, no account.</p>`);
    expect(renderResult(card({ id: "LeadOwner01" }), { owner: true })).not.toContain("visitor-lead");
  });

  it("un seul h1, lu « Avis de recherche : @login », sans étoiles, profil ni peine dans l'en-tête", () => {
    const html = renderResult(card(), { owner: false });
    expect(html.match(/<h1/g)).toHaveLength(1);
    const head = /<h1 class="wanted-head"[^>]*>.*?<\/h1>/.exec(html)?.[0] ?? "";
    const text = head.replace(/<[^>]+>/g, "");
    expect(text).toBe(`Avis de recherche : @${FIXTURES.gold.login}`);
    expect(head).not.toContain("svg");
  });

  it("« Voir la poursuite » dans l'en-tête, hors du titre, sans rien charger du film (§18.48)", () => {
    const html = renderResult(card(), { owner: false });
    const head = /<header class="wanted">.*?<\/header>/.exec(html)?.[0] ?? "";
    expect(head).toContain('class="chase-link"');
    expect(head.replace(/<[^>]+>/g, "")).toContain("Voir la poursuite");
    expect(html).not.toContain("<video");
    expect(html).not.toContain("film-stage");
    const mine = renderResult(card(), { owner: true, lang: "en-US" });
    expect(/<header class="wanted">.*?<\/header>/.exec(mine)?.[0]).toContain("Replay my chase");
  });

  it("la peine, en texte sous la fiche : l'image du profil est en ciel de page, plus en tuile", () => {
    const html = renderResult(card(), { owner: false });
    const penalty = html.indexOf('class="penalty"');
    expect(penalty).toBeGreaterThan(html.indexOf('class="result-stage"'));
    expect(html.indexOf("Peine")).toBeGreaterThan(penalty);
    expect(html.match(/<img src="\/profiles\//g)).toHaveLength(1);
  });

  it("ni partage, ni dénonciation, ni pièces à conviction pour le visiteur", () => {
    const html = renderResult(card(), { owner: false });
    expect(html).not.toContain("after-block out");
    expect(html).not.toContain("after-block denounce");
    expect(html).not.toContain('class="fold why"');
  });

  it("sans profil : la peine reste, le reste en place", () => {
    const { profile: _p, ...bare } = FIXTURES.gold;
    const html = renderResult({ kind: "card", card: { ...(bare as CardData), id: "VisitCard02" } }, { owner: false });
    expect(ascending(at(html, ['class="result-stage"', 'class="jury"', 'class="penalty"', 'id="you"']))).toBe(true);
  });
});

describe("après-fiche, vue par qui a fait la fiche (§18.27)", () => {
  const mine = (id: string) => card({ id });

  it("le verdict (pari, peine) en un bloc, le partage, la dénonciation, puis le reste en lignes, « Aussi au dossier » compris (§18.48)", () => {
    const html = renderResult(mine("OwnCard0001"), { owner: true, token: "tok", plea: 6 });
    const order = at(html, ['class="after-head"', 'class="plea-verdict"', 'class="penalty"', 'class="after-block out"', 'class="after-block denounce"', 'class="rest"', 'class="fold dossier"', 'class="after-foot"']);
    expect(ascending(order), JSON.stringify(order)).toBe(true);
    // La peine vit dans le bloc du verdict : plus de ligne flottante entre deux blocs.
    expect(html).toMatch(/<div class="after-head"><section class="plea-verdict".*?<\/section><p class="penalty">/);
    expect(html).not.toContain('class="after-block dossier"');
    // l'en-tête sur le ciel, en tête de page, et un seul h1 ; pas de « Et toi ? »
    expect(html.indexOf('class="wanted"')).toBeLessThan(html.indexOf('class="result-stage"'));
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).not.toContain('id="you"');
  });

  it("le reste : des lignes repliées, chacune un vrai titre et un chevron", () => {
    const html = renderResult(mine("OwnCard0002"), { owner: true, token: "tok" });
    const rest = html.slice(html.indexOf('class="rest"'), html.indexOf('class="after-foot"'));
    const rows = [...rest.matchAll(/<details class="fold ([a-z- ]+)"( open="")?><summary class="fold-row"><span>([^<]+)<\/span><svg class="fold-chevron"/g)];
    // Fiche seule : « Pourquoi cette note » est au dos de la fiche, plus dans les lignes.
    expect(rows.map((r) => r[1])).toEqual(["dossier", "add-source", "email", "contest"]);
    expect(rows.map((r) => r[3])).toEqual(["Aussi au dossier", "Ajoute ton CV au dossier", "Recevoir ma fiche par email", "Contester"]);
    // toutes fermées au départ
    expect(rows.every((r) => !r[2])).toBe(true);
    // le contenu reste monté, fermé : le formulaire d'email est là
    expect(rest).toContain('id="email-input"');
  });

  it("sans jeton de cette fiche, pas de ligne d'email ; fiche LinkedIn seule, « Ajoute ton GitHub » en bloc, hors des lignes", () => {
    const li = card({ id: "OwnCard0003", source: "cv", declaredSource: "linkedin", linkedinUrl: "https://www.linkedin.com/in/x" });
    const html = renderResult(li, { owner: true });
    expect(html).not.toContain("fold email");
    const prove = html.indexOf('class="after-block add-source"');
    expect(prove).toBeGreaterThan(html.indexOf('class="after-block denounce"'));
    expect(prove).toBeLessThan(html.indexOf('class="rest"'));
    expect(html).not.toContain("fold add-source");
  });

  it("la peine est sous la fiche : « Pourquoi cette note » ne la répète pas", () => {
    const html = renderResult(mine("OwnCard0004"), { owner: true });
    expect(html).not.toContain("why-sentence");
    // comparaison sans profil : la peine une fois, sous les fiches, pas dans la ligne repliée
    const { profile: _p, ...gh } = { ...FIXTURE_COMPARISON.github, sentence: FIXTURES.gold.sentence };
    const cmp = renderResult({ kind: "comparison", comparison: { ...FIXTURE_COMPARISON, id: "OwnCmp0001", github: gh as CardData } }, { owner: true });
    expect(cmp).toContain('class="penalty"');
    expect(cmp).not.toContain("why-sentence");
  });

  it("le jury du propriétaire : une ligne de texte courant, pas un titre", () => {
    stub("fr-FR");
    const html = renderToStaticMarkup(createElement(LangProvider, null, createElement(JuryLine, { jury: { guilty: 3, cleared: 1, mine: null } })));
    expect(html).toBe('<p class="jury-line">Jury\u00a0: 75\u00a0% coupable (4\u00a0votes)</p>');
    // Une phrase, sans point médian.
    expect(html).not.toContain("·");
  });
});

describe("le ciel de la page (§18.29)", () => {
  it("l'illustration du profil en premier, derrière la barre, chargée en priorité, muette pour les lecteurs d'écran", () => {
    for (const owner of [false, true]) {
      const html = renderResult(card({ id: owner ? "SkyCard0002" : "SkyCard0001" }), { owner });
      const sky = /<div class="card-sky[^"]*" aria-hidden="true"><img[^>]*><\/div>/.exec(html)?.[0] ?? "";
      expect(html).toContain(`id="main">${sky}`);
      expect(sky).toContain(`src="/profiles/${FIXTURES.gold.profile!.id}.jpg"`);
      expect(sky).toMatch(/width="1152" height="768" alt="" decoding="async" fetchpriority="high"/i);
      // pas encore chargée : le texte reste crème sur l'encre
      expect(sky).not.toContain("is-in");
    }
  });

  it("le ton suit l'heure de l'image : l'heure rose est claire, l'heure bleue et l'image par défaut sombres", () => {
    expect(skyOf("arsonist")).toEqual({ src: "/profiles/arsonist.jpg", tone: "light" });
    expect(skyOf("night_owl").tone).toBe("dark");
    expect(skyOf(undefined)).toEqual({ src: "/profiles/default.jpg", tone: "dark" });
    expect(skyOf("../x").src).toBe("/profiles/default.jpg");
    const { profile: _p, ...bare } = FIXTURES.gold;
    const html = renderResult({ kind: "card", card: { ...(bare as CardData), id: "SkyCard0003" } }, { owner: false });
    expect(html).toContain('<div class="card-sky sky-dark" aria-hidden="true"><img src="/profiles/default.jpg"');
  });

  it("dossier à deux pièces : le même ciel qu'une fiche seule", () => {
    const html = renderResult({ kind: "comparison", comparison: FIXTURE_COMPARISON }, { owner: true });
    expect(html).toMatch(/<div class="card-sky sky-(light|dark)" aria-hidden="true">/);
    expect(html).not.toContain("is-tall");
  });
});

describe("demander le retrait d'une fiche sans pseudo GitHub", () => {
  const linkedin = () => card({ id: "LinkedIn001", login: undefined, source: "cv", declaredSource: "linkedin" } as Partial<CardData>);
  it("sur la page partagée d'une fiche LinkedIn ou CV, après « Et toi ? », un lien discret", () => {
    const html = renderResult(linkedin(), { owner: false });
    expect(html).toContain("Ce n&#x27;est pas toi qui as fait cette fiche\u00a0? Demander son retrait");
    expect(html.indexOf('class="removal"')).toBeGreaterThan(html.indexOf('id="you"'));
    expect(renderResult(linkedin(), { owner: false, lang: "en-US" })).toContain("Didn&#x27;t make this sheet yourself? Ask for its removal");
  });

  it("jamais pour qui a fait la fiche, ni sur une fiche qui a un pseudo GitHub (« C'est moi » y suffit)", () => {
    expect(renderResult(linkedin(), { owner: true })).not.toContain('class="removal"');
    expect(renderResult(card({ id: "GhCard00001" }), { owner: false })).not.toContain('class="removal"');
  });
});

describe("bloc recruteur", () => {
  it("en fin de page, pour le visiteur comme pour qui a fait la fiche : un titre, une phrase, une pilule vers azerit.tech", () => {
    const visitor = renderResult(card({ id: "HireCard001" }), { owner: false });
    const owner = renderResult(card({ id: "HireCard002" }), { owner: true });
    expect(visitor.indexOf('class="after-block hire"')).toBeGreaterThan(visitor.indexOf('id="you"'));
    expect(owner.indexOf('class="after-block hire"')).toBeGreaterThan(owner.indexOf('class="rest"'));
    expect(owner.indexOf('class="after-block hire"')).toBeLessThan(owner.indexOf('class="after-foot"'));
    const block = /<section class="after-block hire".*?<\/section>/.exec(visitor)?.[0] ?? "";
    expect(block).toContain('<h2 id="hire-title">Vous recrutez ?</h2>');
    expect(block).toMatch(/<a class="pill pill-ghost" href="https:\/\/azerit\.tech" target="_blank" rel="noopener">azerit\.tech/);
    expect(visitor).not.toContain("azerit-cta");
  });

  it("en anglais : « Hiring? »", () => {
    expect(renderResult(card({ id: "HireCard003" }), { owner: false, lang: "en-US" })).toContain(">Hiring?</h2>");
  });
});

describe("un dossier, une fiche, une note (§18.36)", () => {
  const cmp = (over: Partial<ComparisonData> = {}): Shareable => ({ kind: "comparison", comparison: { ...FIXTURE_COMPARISON, ...over } });
  const file = fileOf(FIXTURE_COMPARISON);
  const textOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
  // Ce que la page ne dit plus : une pièce contre l'autre.
  const VERSUS = /sous-vend|annonce \d|en montre plus|undersell|claims \d|shows more/i;

  it("pour le visiteur comme pour qui l'a fait, en français comme en anglais : un h1, une fiche, une note, ses pièces dessous", () => {
    for (const owner of [false, true])
      for (const lang of ["fr-FR", "en-US"]) {
        const html = renderResult(cmp({ id: `Dossier${owner ? 1 : 0}${lang.slice(0, 2)}`, declaredSource: "linkedin" }), { owner, lang });
        expect(html.match(/<h1/g)).toHaveLength(1);
        expect(html.match(/class="tys-card /g)).toHaveLength(1);
        expect(html.match(new RegExp(`>${file.overall}<`, "g"))).toHaveLength(1);
        expect(html).not.toContain(`>${FIXTURE_COMPARISON.cv.overall}<`);
        expect(html).not.toMatch(/class="cmp[ -"]/);
        expect(textOf(html)).not.toMatch(VERSUS);
        // L'en-tête d'une fiche seule, au-dessus de la fiche ; les pièces dessous.
        expect(html.indexOf('class="wanted"')).toBeLessThan(html.indexOf('class="result-stage"'));
        const line = lang === "fr-FR" ? "Sources au dossier\u00a0: LinkedIn et GitHub" : "Sources on file: LinkedIn and GitHub";
        expect(html).toContain(`<p class="pieces-line">${line}</p>`);
        expect(html.indexOf('class="pieces"')).toBeGreaterThan(html.indexOf('class="tys-card '));
      }
  });

  it("un CV au dossier : « CV et GitHub » ; le lien non prouvé et le code à prouver sur leur ligne", () => {
    expect(renderResult(cmp({ id: "DossierCv01" }), { owner: true })).toContain("Sources au dossier\u00a0: CV et GitHub");
    const unproven = renderResult(cmp({ id: "DossierLi01", declaredSource: "linkedin", linkUnproven: true }), { owner: false });
    expect(unproven).toContain('<p class="pieces-note">Lien entre les deux sources\u00a0: à confirmer</p>');
    expect(unproven).not.toContain("Code à prouver");
    const empty = renderResult(cmp({ id: "DossierEm01", github: { ...FIXTURE_COMPARISON.github, sealed: true } }), { owner: false });
    expect(empty).toContain('<p class="pieces-note">Code à prouver</p>');
  });

  it("un dossier scellé ne dit sa note ni au lecteur d'écran, ni dans le duel", () => {
    const sealed: CardData = { ...file, sealed: true };
    const html = renderResult(cmp({ id: "DossierSeal1", file: sealed }), { owner: false });
    expect(html).toContain("Dossier scellé\u00a0: le code reste à prouver.");
    expect(html).not.toMatch(/note \d+\./);
    expect(html).not.toContain('class="versus-line"');
  });
});

describe("la lecture du recruteur (§18.37)", () => {
  const grid = githubGridMock("gold", FIXTURES.gold.login ?? "dev")!;

  it("une fiche sans grille (d'avant, ou dénoncée et non revendiquée) n'affiche ni la grille, ni la ligne, ni les tuiles", () => {
    for (const owner of [true, false]) {
      const html = renderResult(card(), { owner, token: owner ? "tok" : undefined });
      expect(html).not.toContain('id="grille"');
      expect(html).not.toContain('class="after-block rr"');
      expect(html).not.toContain("Voici comment Azerit");
    }
  });

  it("avec sa grille : un seul bloc, un seul titre, huit critères, une jauge lue « n sur 10 », la note, aucun « + n »", () => {
    const html = renderResult(card({ grid, overall: grid.overall }), { owner: true, token: "tok" });
    expect(html.match(/Voici comment Azerit te lit/g)).toHaveLength(1);
    expect(html.match(/class="rg-row /g)).toHaveLength(8);
    expect(html).toMatch(/aria-label="\d+ sur 10"/);
    const block = /<section class="after-block rr" id="grille".*?<\/section>/s.exec(html)![0].replace(/<[^>]+>/g, " ");
    expect(block).not.toMatch(/(^|\s)[+−]\s?\d/);
    // Les deux blocs d'avant n'en font qu'un (§18.48) : plus de second titre, plus de lien vers une ancre.
    expect(html).not.toContain('class="after-block rg"');
    expect(html).not.toContain("Ce que la grille retient");
    expect(html).not.toContain("rr-more");
  });

  it("vue par un visiteur : le titre à la troisième personne", () => {
    const html = renderResult(card({ grid, overall: grid.overall }), { owner: false });
    expect(html).toContain('id="grille"');
    expect(html).not.toContain("te lit");
  });

  it("la ligne du recruteur et les huit tuiles : après le verdict, le partage et la dénonciation, avant le reste replié (§18.48)", () => {
    const html = renderResult(card({ grid, overall: grid.overall }), { owner: true, token: "tok", plea: 4 });
    const rr = html.indexOf('class="after-block rr"');
    const order = at(html, ['class="result-stage"', 'class="after-head"', 'class="after-block out"', 'class="after-block denounce"', 'class="after-block rr"', 'class="rest"']);
    expect(ascending(order), JSON.stringify(order)).toBe(true);
    expect(rr).toBeLessThan(html.indexOf("add-linkedin"));
    expect(html.match(/class="rr-tile /g)).toHaveLength(8);
    expect(html).toMatch(/<p class="rr-line">[^<]+, [^<]+\. Point fort\u00a0: [^<]+, \d+\/10\./);
    // Les tuiles dans l'ordre du recruteur, les critères sans note en bas (deux au plus en tuiles).
    const names = [...html.matchAll(/<span class="rr-name">([^<]+)<\/span>/g)].map((m) => m[1]);
    const { scored, pending } = tileOrder(grid);
    expect(pending.length).toBeLessThanOrEqual(2);
    expect(names).toEqual([...scored, ...pending].map((c) => DICTS.fr.read.short[c.code]));
    expect(names[0]).toBe("Expérience");
    if (pending.length) expect(html).toContain('<p class="rr-pending">Pas encore au dossier</p>');
    // Le détail de la grille : replié pour la personne fichée aussi (§18.48), dans le même bloc.
    const block = /<section class="after-block rr" id="grille".*?<\/section>/s.exec(html)![0];
    expect(block).toMatch(/<details class="rg rg-fold"><summary class="rg-fold-sum"><span>Le détail, critère par critère<\/span>/);
  });

  it("plus de deux critères sans note : une ligne, pas un mur de cases vides (§18.48)", () => {
    const low = githubGridMock("unknownLang", "x")!;
    const { scored, pending } = tileOrder(low);
    expect(pending.length).toBeGreaterThan(2);
    const html = renderResult(card({ grid: low, overall: low.overall }), { owner: true, token: "tok" });
    expect(html.match(/class="rr-tile /g) ?? []).toHaveLength(scored.length);
    const line = /<p class="rr-pending-line">([^<]+)<\/p>/.exec(html)?.[1] ?? "";
    expect(line).toBe(DICTS.fr.read.pendingLine(pending.map((c) => DICTS.fr.read.short[c.code]).join(", ")));
    expect(line).toMatch(/^Pas encore au dossier.: /);
    expect(html).not.toContain('class="rr-pending"');
    // Le détail garde les huit lignes, repliées.
    expect(html.match(/class="rg-row /g)).toHaveLength(8);
  });

  it("fiche GitHub seule : « Ajoute ton LinkedIn au dossier », en miroir de l'ajout du GitHub ; jamais pour un visiteur", () => {
    const own = renderResult(card({ grid, overall: grid.overall }), { owner: true, token: "tok" });
    expect(own).toMatch(/<section class="after-block add-source add-linkedin"[^>]*><h2[^>]*>Ajoute ton LinkedIn au dossier<\/h2>/);
    expect(own.indexOf("add-linkedin")).toBeLessThan(own.indexOf('class="rest"'));
    expect(renderResult(card({ grid, overall: grid.overall }), { owner: false })).not.toContain("add-linkedin");
  });

  it("sous trois étoiles : la source qui manque remonte sous le verdict, avant le partage ; à trois et plus, sous les critères (§18.48)", () => {
    const low = githubGridMock("unknownLang", "x")!;
    const one = renderResult(card({ id: "LowCard0001", grid: low, overall: low.overall }), { owner: true, token: "tok", plea: 3 });
    const order = at(one, ['class="after-head"', 'class="after-block add-source add-linkedin"', 'class="after-block out"', 'class="after-block rr"']);
    expect(ascending(order), JSON.stringify(order)).toBe(true);
    const five = renderResult(card({ id: "HighCard001", grid, overall: grid.overall }), { owner: true, token: "tok" });
    const high = at(five, ['class="after-block out"', 'class="after-block rr"', 'class="after-block add-source add-linkedin"', 'class="rest"']);
    expect(ascending(high), JSON.stringify(high)).toBe(true);
    // Fiche LinkedIn seule sous trois étoiles : « Ajoute ton GitHub » remonte de même.
    const li = renderResult(card({ id: "LowCard0002", overall: 30, source: "cv", declaredSource: "linkedin", linkedinUrl: "https://www.linkedin.com/in/x" }), { owner: true });
    expect(li.indexOf('class="after-block add-source"')).toBeLessThan(li.indexOf('class="after-block out"'));
    // Le bouton de la source reste secondaire : le rose de la page est au partage.
    expect(one).toMatch(/<button type="submit" class="pill pill-big pill-ghost entry-submit"/);
  });

  it("sous trois étoiles, le rang ne s'affiche que dans le top 10 ; au-delà de trois étoiles, toujours", () => {
    const week = (rank: number) => ({ week: 46, rank, total: 40, gapToTop5: 12, inTop5: false, closed: false });
    const line = (rank: number, low: boolean) => {
      stub("fr-FR");
      return renderToStaticMarkup(createElement(LangProvider, null, createElement(WeekLine, { week: week(rank), low })));
    };
    expect(line(14, true)).toBe("");
    expect(line(8, true)).toContain("8e");
    expect(line(14, false)).toContain("14e");
  });

  it("le champ LinkedIn : le lien entier, ou ce qui suit linkedin.com/in/", () => {
    expect(linkedinFromField("camille-ardent")).toBe("https://www.linkedin.com/in/camille-ardent");
    expect(linkedinFromField("https://www.linkedin.com/in/camille-ardent/")).toBe("https://www.linkedin.com/in/camille-ardent");
    expect(linkedinFromField("  ")).toBeNull();
    expect(linkedinFromField("https://github.com/x")).toBeNull();
  });

  it("vue par un visiteur : les tuiles juste sous la fiche, le détail de la grille replié, le jeu dit", () => {
    const html = renderResult(card({ grid, overall: grid.overall }), { owner: false });
    const col = html.slice(html.indexOf('class="visitor-col"'));
    expect(col.indexOf('class="after-block rr"')).toBeGreaterThan(-1);
    expect(html).toMatch(/<details class="rg rg-fold"><summary class="rg-fold-sum"><span>Le détail, critère par critère<\/span>/);
    expect(html).toContain("Pas une décision d&#x27;embauche");
    expect(html.match(/Voici comment Azerit lit @/g)).toHaveLength(1);
  });
});

describe("ligne repliée", () => {
  const fold = (attention: boolean) =>
    renderToStaticMarkup(createElement(Fold, { name: "email", title: "Recevoir ma fiche par email", attention, children: createElement("p", null, "corps") }));

  it("fermée par défaut, le contenu monté", () => {
    expect(fold(false)).toBe(
      '<details class="fold email"><summary class="fold-row"><span>Recevoir ma fiche par email</span><svg class="fold-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg></summary><div class="fold-body"><p>corps</p></div></details>',
    );
  });

  it("un état qui demande l'attention l'ouvre", () => {
    expect(fold(true)).toMatch(/^<details class="fold email" open="">/);
  });
});
