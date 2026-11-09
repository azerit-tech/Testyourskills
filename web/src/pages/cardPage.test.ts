// La page de la fiche, rendue en chaîne sans navigateur : l'ordre des blocs du
// visiteur (lien partagé) et de qui a fait la fiche (§18.27, §18.28).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../../shared/types";
import { FIXTURES } from "../../../shared/fixtures";
import { LangProvider } from "../i18n";
import { Fold, type Shareable } from "../components/After";
import { JuryLine } from "../components/Jury";
import { tokens } from "../lib/api";
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
  it("une ligne d'en-tête, la fiche, puis le jury, le profil, le dossier, « Et toi ? »", () => {
    const html = renderResult(card(), { owner: false });
    const order = at(html, ['class="wanted"', 'class="result-stage"', 'class="jury"', 'class="profile-tile', 'class="after-block dossier"', 'id="you"']);
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

  it("le profil et la peine passent dans la tuile, sous la fiche", () => {
    const html = renderResult(card(), { owner: false });
    const tile = html.indexOf('class="profile-tile');
    expect(tile).toBeGreaterThan(html.indexOf('class="result-stage"'));
    if (FIXTURES.gold.sentence) expect(html.indexOf("Peine")).toBeGreaterThan(tile);
  });

  it("ni partage, ni dénonciation, ni pièces à conviction pour le visiteur", () => {
    const html = renderResult(card(), { owner: false });
    expect(html).not.toContain("after-block out");
    expect(html).not.toContain("after-block denounce");
    expect(html).not.toContain('class="fold why"');
  });

  it("sans profil : pas de tuile, le reste en place", () => {
    const { profile: _p, ...bare } = FIXTURES.gold;
    const html = renderResult({ kind: "card", card: { ...(bare as CardData), id: "VisitCard02" } }, { owner: false });
    expect(html).not.toContain("profile-tile");
    expect(ascending(at(html, ['class="result-stage"', 'class="jury"', 'id="you"']))).toBe(true);
  });
});

describe("après-fiche, vue par qui a fait la fiche (§18.27)", () => {
  const mine = (id: string) => card({ id });

  it("le pari et le jury, le profil, le partage, la dénonciation, le dossier, puis le reste en lignes", () => {
    const html = renderResult(mine("OwnCard0001"), { owner: true, token: "tok", plea: 6 });
    const order = at(html, ['class="after-head"', 'class="plea-verdict"', 'class="profile-tile', 'class="after-block out"', 'class="after-block denounce"', 'class="after-block dossier"', 'class="rest"', 'class="after-foot"']);
    expect(ascending(order), JSON.stringify(order)).toBe(true);
    // ni en-tête de visiteur, ni « Et toi ? »
    expect(html).not.toContain('class="wanted"');
    expect(html).not.toContain('id="you"');
  });

  it("le reste : des lignes repliées, chacune un vrai titre et un chevron", () => {
    const html = renderResult(mine("OwnCard0002"), { owner: true, token: "tok" });
    const rest = html.slice(html.indexOf('class="rest"'), html.indexOf('class="after-foot"'));
    const rows = [...rest.matchAll(/<details class="fold ([a-z- ]+)"( open="")?><summary class="fold-row"><span>([^<]+)<\/span><svg class="fold-chevron"/g)];
    expect(rows.map((r) => r[1])).toEqual(["why", "add-source", "email", "contest"]);
    expect(rows.map((r) => r[3])).toEqual(["Pourquoi cette note", "Ajoute ton CV pour voir l&#x27;écart", "Recevoir ma fiche par email", "Contester"]);
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

  it("la peine passe dans la tuile : « Pourquoi cette note » ne la répète pas", () => {
    const html = renderResult(mine("OwnCard0004"), { owner: true });
    expect(html).not.toContain("why-sentence");
  });

  it("le jury du propriétaire : une ligne de texte courant, pas un titre", () => {
    stub("fr-FR");
    const html = renderToStaticMarkup(createElement(LangProvider, null, createElement(JuryLine, { jury: { guilty: 3, cleared: 1, mine: null } })));
    expect(html).toBe('<p class="jury-line">Le jury : 75 % coupable · 4 votes</p>');
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
