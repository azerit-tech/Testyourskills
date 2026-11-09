// La page de la fiche, rendue en chaîne sans navigateur : l'ordre des blocs du
// visiteur (lien partagé) et de qui a fait la fiche (§18.27, §18.28).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../../shared/types";
import { FIXTURES } from "../../../shared/fixtures";
import { LangProvider } from "../i18n";
import type { Shareable } from "../components/After";
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

export function renderResult(item: Shareable, opts: { owner: boolean; lang?: string }): string {
  stub(opts.lang ?? "fr-FR");
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
