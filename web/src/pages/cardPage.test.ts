// La page de la fiche, rendue en chaîne sans navigateur : l'ordre des blocs du
// visiteur (lien partagé) et de qui a fait la fiche (§18.27, §18.28).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../../shared/types";
import { FIXTURE_COMPARISON, FIXTURES } from "../../../shared/fixtures";
import { tileOrder } from "../../../shared/recruiterLine";
import { DICTS } from "../i18n";
import { LangProvider } from "../i18n";
import { Fold, type Shareable } from "../components/After";
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
  it("l'en-tête, la fiche, puis le jury, la peine, le dossier, « Et toi ? »", () => {
    const html = renderResult(card(), { owner: false });
    const order = at(html, ['class="wanted"', 'class="result-stage"', 'class="jury"', 'class="penalty"', 'class="after-block dossier"', 'id="you"']);
    expect(ascending(order), JSON.stringify(order)).toBe(true);
  });

  it("un seul h1, lu « Avis de recherche : @login », sans étoiles, profil ni peine dans l'en-tête", () => {
    const html = renderResult(card(), { owner: false });
    expect(html.match(/<h1/g)).toHaveLength(1);
    const head = /<header class="wanted">.*?<\/header>/.exec(html)?.[0] ?? "";
    const text = head.replace(/<[^>]+>/g, "");
    expect(text).toBe(`Avis de recherche : @${FIXTURES.gold.login}`);
    expect(head).not.toContain("svg");
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

  it("le pari et le jury, la peine, le partage, la dénonciation, le dossier, puis le reste en lignes", () => {
    const html = renderResult(mine("OwnCard0001"), { owner: true, token: "tok", plea: 6 });
    const order = at(html, ['class="after-head"', 'class="plea-verdict"', 'class="penalty"', 'class="after-block out"', 'class="after-block denounce"', 'class="after-block dossier"', 'class="rest"', 'class="after-foot"']);
    expect(ascending(order), JSON.stringify(order)).toBe(true);
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
    expect(rows.map((r) => r[1])).toEqual(["add-source", "email", "contest"]);
    expect(rows.map((r) => r[3])).toEqual(["Ajoute ton CV au dossier", "Recevoir ma fiche par email", "Contester"]);
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
    expect(prove).toBeGreaterThan(html.indexOf('class="after-block dossier"'));
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
    expect(html).toBe('<p class="jury-line">Le jury : 75 % coupable · 4 votes</p>');
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

  it("comparaison : un ciel plus haut, sous son titre", () => {
    const html = renderResult({ kind: "comparison", comparison: FIXTURE_COMPARISON }, { owner: true });
    expect(html).toMatch(/<div class="card-sky sky-(light|dark) is-tall"/);
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

describe("comparaison GitHub contre CV ou LinkedIn", () => {
  const cmp = (login = FIXTURES.gold.login, declaredSource?: "linkedin"): Shareable => ({
    kind: "comparison",
    comparison: { ...FIXTURE_COMPARISON, ...(declaredSource ? { declaredSource } : {}), github: { ...FIXTURE_COMPARISON.github, login } },
  });
  const n = Math.abs(FIXTURE_COMPARISON.cv.overall - FIXTURE_COMPARISON.github.overall);
  const textOf = (html: string, re: RegExp) => (re.exec(html)?.[0] ?? "").replace(/<[^>]+>/g, "");

  it("visiteur : un seul h1, le titre de l'écart parle de @login à la troisième personne", () => {
    const html = renderResult(cmp(), { owner: false });
    expect(html.match(/<h1/g)).toHaveLength(1);
    const head = textOf(html, /<h2 class="cmp-headline[^"]*">.*?<\/h2>/);
    expect(head).toContain(`@${FIXTURES.gold.login}`);
    expect(head).toContain(String(n));
    expect(head).not.toMatch(/\b(ton|ta|tes|toi)\b/i);
    expect(html).toContain("Son parcours, lu sur son CV");
    expect(html).toContain("Son code, lu sur GitHub");
    expect(html).not.toMatch(/Ton (parcours|code), lu/);
  });

  it("visiteur, LinkedIn, en anglais : « their », jamais « your »", () => {
    const html = renderResult(cmp(FIXTURES.gold.login, "linkedin"), { owner: false, lang: "en-US" });
    const head = textOf(html, /<h2 class="cmp-headline[^"]*">.*?<\/h2>/);
    expect(head.replace(/&#x27;/g, "'")).toMatch(new RegExp(`^@${FIXTURES.gold.login}'s (LinkedIn|code) .* their `));
    expect(html).toContain("Their career, read on LinkedIn");
    expect(html).not.toMatch(/Your (career|code), read/);
  });

  it("les chiffres d'un pseudo ne passent pas en couleur, seul l'écart", () => {
    const html = renderResult(cmp("dev42"), { owner: false });
    const head = /<h2 class="cmp-headline[^"]*">.*?<\/h2>/.exec(html)?.[0] ?? "";
    expect(head.match(/<em>(\d+)<\/em>/g)).toEqual([`<em>${n}</em>`]);
    expect(head).toContain("<span>@dev42</span>");
  });

  it("qui a fait la fiche : le titre du serveur, tutoyé, en h1", () => {
    const html = renderResult(cmp(), { owner: true });
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(textOf(html, /<h1 class="cmp-headline[^"]*">.*?<\/h1>/)).toBe(FIXTURE_COMPARISON.headline.fr);
    expect(html).toContain("Ton parcours, lu sur ton CV");
  });
});

describe("la lecture du recruteur (§18.37)", () => {
  const grid = githubGridMock("gold", FIXTURES.gold.login ?? "dev")!;

  it("une fiche sans grille (d'avant, ou dénoncée et non revendiquée) n'affiche ni la grille, ni la ligne, ni les tuiles", () => {
    for (const owner of [true, false]) {
      const html = renderResult(card(), { owner, token: owner ? "tok" : undefined });
      expect(html).not.toContain('id="grille"');
      expect(html).not.toContain('class="after-block rr"');
      expect(html).not.toContain("Ce que la grille retient");
    }
  });

  it("avec sa grille : le titre, huit critères, une jauge lue « n sur 10 », la note, aucun « + n »", () => {
    const html = renderResult(card({ grid, overall: grid.overall }), { owner: true, token: "tok" });
    expect(html).toContain("Voici comment un recruteur d&#x27;Azerit te lit");
    expect(html.match(/class="rg-row /g)).toHaveLength(8);
    expect(html).toMatch(/aria-label="\d+ sur 10"/);
    const block = /<section class="after-block rg".*?<\/section>/s.exec(html)![0].replace(/<[^>]+>/g, " ");
    expect(block).not.toMatch(/(^|\s)[+−]\s?\d/);
  });

  it("vue par un visiteur : le titre à la troisième personne", () => {
    const html = renderResult(card({ grid, overall: grid.overall }), { owner: false });
    expect(html).toContain('id="grille"');
    expect(html).not.toContain("te lit");
  });

  it("la ligne du recruteur et les huit tuiles : sous la fiche, avant le pari", () => {
    const html = renderResult(card({ grid, overall: grid.overall }), { owner: true, token: "tok", plea: 4 });
    const rr = html.indexOf('class="after-block rr"');
    expect(rr).toBeGreaterThan(html.indexOf('class="result-stage"'));
    expect(rr).toBeLessThan(html.indexOf('class="after-head"'));
    expect(html.match(/class="rr-tile /g)).toHaveLength(8);
    expect(html).toMatch(/<p class="rr-line">[^<]+, [^<]+\. Point fort : [^<]+, \d+\/10\./);
    // Les tuiles dans l'ordre du recruteur, les critères sans note en bas.
    const names = [...html.matchAll(/<span class="rr-name">([^<]+)<\/span>/g)].map((m) => m[1]);
    const { scored, pending } = tileOrder(grid);
    expect(names).toEqual([...scored, ...pending].map((c) => DICTS.fr.read.short[c.code]));
    expect(names[0]).toBe("Expérience");
    if (pending.length) expect(html).toContain('<p class="rr-pending">Pas encore au dossier</p>');
    // La personne fichée voit le détail de la grille ouvert.
    expect(html).not.toContain('class="rg-fold"');
  });

  it("fiche GitHub seule : « Ajoute ton LinkedIn au dossier », en miroir de l'ajout du GitHub ; jamais pour un visiteur", () => {
    const own = renderResult(card({ grid, overall: grid.overall }), { owner: true, token: "tok" });
    expect(own).toMatch(/<section class="after-block add-source add-linkedin"[^>]*><h2[^>]*>Ajoute ton LinkedIn au dossier<\/h2>/);
    expect(own.indexOf("add-linkedin")).toBeLessThan(own.indexOf('class="rest"'));
    expect(renderResult(card({ grid, overall: grid.overall }), { owner: false })).not.toContain("add-linkedin");
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
    expect(col.indexOf('class="after-block rr"')).toBeLessThan(col.indexOf('class="after-block rg"'));
    expect(html).toMatch(/<details class="rg-fold"><summary class="rg-fold-sum"><span>Le détail, critère par critère<\/span>/);
    expect(html).toContain("Pas une décision d&#x27;embauche");
    expect(html).toContain("Ce que la grille retient de @");
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
