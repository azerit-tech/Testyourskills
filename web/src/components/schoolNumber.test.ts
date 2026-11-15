// L'école ne montre jamais de chiffre, à personne, comptée ou non (SPEC §18.52) :
// ni sur la tuile, ni dans le détail, ni dans la formule, ni dans « sous la moyenne
// des autres ». Deux mots seulement, « comptée » ou « hors moyenne », et la personne
// fichée lit la même chose que le visiteur. Rendu en chaîne, sans navigateur, pour
// une école sous la moyenne des autres et une école au-dessus, en français et en anglais.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../../../shared/fixtures";
import { publicView } from "../../../shared/publicView";
import type { CardData, CriterionCode, Grid, GridCriterion } from "../../../shared/types";
import { DICTS, LangProvider } from "../i18n";
import type { Shareable } from "./After";
import { RecruiterRead } from "./RecruiterRead";

afterEach(() => vi.unstubAllGlobals());

function render(item: Shareable, shared: boolean, lang: string): string {
  vi.stubGlobal("window", {
    location: { origin: "https://skills.test", pathname: "/c/x", search: "" },
    matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("navigator", { userAgent: "test", language: lang });
  vi.stubGlobal("document", { documentElement: { dataset: {}, classList: { add: () => undefined, remove: () => undefined } }, querySelector: () => null, getElementById: () => null });
  return renderToStaticMarkup(createElement(LangProvider, null, createElement(RecruiterRead, { item, shared, who: "@dev" })));
}

const f = (fr: string, en = fr) => ({ fr, en });
const crit = (code: CriterionCode, score: number | null, counted: boolean, more: Partial<GridCriterion> = {}): GridCriterion => ({
  code,
  score,
  counted,
  state: score === null ? "unproven" : "scored",
  source: "github",
  reached: f(`Niveau atteint ${code}.`),
  flags: [],
  ...more,
});

/** Une fiche LinkedIn et GitHub ; l'école lue sur LinkedIn, notée `edu`, comptée ou non. */
function cardWith(edu: number, counted: boolean): CardData {
  const grid: Grid = {
    overall: counted ? 80 : 70,
    criteria: [
      crit("EDU", edu, counted, {
        source: "linkedin",
        reached: f("École Halbrune : au dossier.", "École Halbrune: on file."),
        evidence: { text: f("École Halbrune : au dossier.", "École Halbrune: on file."), publicText: f("École au dossier.", "School on file."), source: "linkedin" },
        next: f("Pour 6 : une école sélective.", "For 6: a selective school."),
      }),
      crit("XP", 7, true, { source: "linkedin" }),
      crit("EMP", 7, true, { source: "linkedin" }),
      crit("STK", 7, true),
      crit("CODE", 7, true),
      crit("ACT", 7, true),
      crit("OWN", 7, true),
      crit("OSS", null, false),
    ],
  };
  return { ...FIXTURES.gold, grid, overall: grid.overall, pieces: ["linkedin", "github"] };
}

/** La tuile de l'école, sa ligne dans le détail (sans la table des niveaux, qui est l'échelle) et la note de la fiche. */
function schoolParts(html: string, lang: "fr" | "en") {
  const D = DICTS[lang];
  const tile = new RegExp(`<button[^>]*class="rr-tile[^"]*"[^>]*><span class="rr-name">${D.read.short.EDU}</span>.*?</button>`).exec(html)![0];
  const row = html.split('<li class="rg-row').find((chunk) => chunk.includes(`<span class="rg-name">${D.grid.names.EDU}</span>`))!;
  // Le coefficient d'une école comptée reste (« coef. 1 ») : c'est la grille, pas sa note.
  const head = row.slice(0, row.indexOf('<div id="')).replace(/<span class="rg-coef">[^<]*<\/span>/, "");
  const final = html.slice(html.indexOf('class="rg-final"'));
  return { tile, head, final };
}

const row = (html: string) => html.split('<li class="rg-row').find((chunk) => /<span class="rg-name">(École et sélection|School and selectivity)<\/span>/.test(chunk))!.split('<div id="')[0];

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'");

describe("l'école ne montre jamais de chiffre (§18.52)", () => {
  for (const [name, edu, counted] of [
    ["sous la moyenne des autres", 4, false],
    ["au-dessus de la moyenne", 10, true],
  ] as const) {
    for (const [locale, lang] of [
      ["fr-FR", "fr"],
      ["en-US", "en"],
    ] as const) {
      it(`${name}, ${lang} : ni la personne fichée ni le visiteur ne lisent un chiffre d'école, et les deux lisent la même chose`, () => {
        const card = cardWith(edu, counted);
        const D = DICTS[lang];
        const word = counted ? D.read.counted : D.read.out;
        const seen: string[] = [];
        for (const shared of [false, true]) {
          const item: Shareable = { kind: "card", card: shared ? publicView(card, { thirdParty: false }) : card };
          const html = render(item, shared, locale);
          const { tile, head, final } = schoolParts(html, lang);
          // La tuile et la ligne : le mot, aucun chiffre (ni note, ni « /10 », ni coefficient hors moyenne).
          for (const part of [tile, head]) {
            expect(text(part), `${shared ? "visiteur" : "personne"} : ${text(part)}`).not.toMatch(/\d/);
            expect(part).toContain(word);
          }
          expect(tile).toContain(`aria-label="${(counted ? D.read.tileCounted : D.read.tileKept)(D.read.short.EDU).replace(/'/g, "&#x27;")}"`);
          // La formule : l'école jamais avec sa note ; hors moyenne, sur sa propre ligne, jamais « sous la moyenne des autres ».
          expect(text(final)).not.toMatch(new RegExp(`${D.grid.names.EDU} \\d`));
          const below = text(final).split(D.grid.final.out.below)[1] ?? "";
          expect(below.split(".")[0]).not.toContain(D.grid.names.EDU);
          if (!counted) expect(text(final)).toContain(D.grid.final.schoolOut(D.grid.names.EDU));
          // Et nulle part dans le bloc, hors des tables de niveaux (l'échelle) : « École 4 », « École : 4 sur 10 ».
          expect(text(html.replace(/<ol class="rg-table">.*?<\/ol>/g, ""))).not.toMatch(new RegExp(`(${D.read.short.EDU}|${D.grid.names.EDU})\\s*:?\\s*${edu}\\b`));
          if (counted) expect(row(html)).toContain('class="rg-coef"');
          else expect(row(html)).not.toContain('class="rg-coef"');
          // Ce qui se compare : la tuile, la classe de la ligne, son mot, et la phrase qui finit sa pièce (le nom de l'école reste à la personne).
          const piece = /<p class="rg-piece">([^<]*)<\/p>/.exec(head)![1];
          seen.push([tile, /^[^"]*"/.exec(head)![0], /<span class="rg-score[^>]*>[^<]*<\/span>/.exec(head)![0], piece.slice(piece.indexOf(". ") + 2)].join(" | "));
        }
        // La même chose pour la personne fichée et pour le visiteur.
        expect(seen[1]).toBe(seen[0]);
      });
    }
  }
});
