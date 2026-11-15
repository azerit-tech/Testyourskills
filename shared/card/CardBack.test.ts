// Le dos de la fiche (§18.27, §18.48) : les huit critères de la grille, leur
// note sur 10 et leur pièce, puis la formule ; une fiche d'avant la grille garde
// ses six traits. Rendu par resvg comme la face.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Resvg } from "@resvg/resvg-js";
import { describe, expect, it } from "vitest";
import scoring from "../../data/scoring.json";
import { fontFiles } from "../../server/src/render/fonts";
import { FIXTURES } from "../fixtures";
import { publicView } from "../publicView";
import type { CardData, CriterionCode, Grid, GridCriterion, Lang } from "../types";
import { STAT_CODES } from "../types";
import { BACK_LAYOUT, CardBackGraphic, OVERALL_WEIGHTS, backCriteria, clipProof, formulaRule, formulaTerms, gridFormula, packTerms, placeCriteria, strongestFact } from "./CardBack";
import { measure } from "./text";

const FW = 360 - 18 - 20;
const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function back(card: CardData, lang: Lang) {
  return renderToStaticMarkup(createElement(CardBackGraphic, { card, lang }));
}

describe("dos de la fiche", () => {
  it("les poids de la formule sont ceux du barème", () => {
    expect(OVERALL_WEIGHTS).toEqual(scoring.weights);
  });

  for (const lang of ["fr", "en"] as Lang[]) {
    it(`montre les six axes, leur valeur, leur fait le plus fort et la note (${lang})`, () => {
      const card = FIXTURES.jmougeot;
      const svg = back(card, lang);
      expect(svg).toContain(`viewBox="0 0 360 520"`);
      expect(svg).toContain(lang === "fr" ? "PIÈCES À CONVICTION" : "EXHIBITS");
      for (const code of STAT_CODES) {
        const st = card.stats.find((x) => x.code === code)!;
        expect(svg).toContain(`>${code}<`);
        expect(svg).toContain(`>${st.value}<`);
        expect(svg).toContain(esc(strongestFact(st, lang)!));
      }
      expect(svg).toContain(`= ${card.overall}`);
      // BUZZ ne compte pas : il est dit, et n'entre pas dans la formule
      expect(svg).toContain(lang === "fr" ? "HORS NOTE" : "NOT RATED");
      expect(formulaTerms(card, lang).join(" ")).not.toContain("BUZZ");
    });
  }

  it("la formule tient en trois lignes sous la note, aucun terme coupé", () => {
    for (const card of Object.values(FIXTURES) as CardData[]) {
      for (const lang of ["fr", "en"] as Lang[]) {
        const F = BACK_LAYOUT.formula;
        const p = packTerms(formulaTerms(card, lang), F.size, FW);
        expect(p.lines.length).toBeLessThanOrEqual(F.maxLines);
        for (const line of p.lines) expect(measure(line, "sans-500", p.size)).toBeLessThanOrEqual(FW);
        expect(p.lines.join(" ").replace(/ \+/g, "")).toBe(formulaTerms(card, lang).join(" "));
      }
    }
  });

  it("un axe sans fait le dit, sans planter", () => {
    const card = { ...FIXTURES.silver, stats: FIXTURES.silver.stats.map((s) => ({ ...s, facts: [] })) };
    expect(back(card, "fr")).toContain("Aucun fait relevé");
    expect(back(card, "en")).toContain("No fact on file");
  });

  it("avec la grille du barème : les critères notés et leurs coefficients, sans « + n », en trois lignes ; l'école comptée, la moyenne seule", () => {
    const crit = (code: CriterionCode, score: number | null, counted = score !== null): GridCriterion => ({
      code,
      score,
      counted,
      state: score === null ? "unproven" : "scored",
      source: "github",
      reached: { fr: "", en: "" },
      flags: [],
    });
    const full: Grid = { overall: 57, criteria: [crit("XP", 3), crit("EMP", 4), crit("STK", 6), crit("CODE", 7), crit("ACT", 8), crit("OWN", 6), crit("OSS", 6)] };
    const school: Grid = { overall: 57, criteria: [crit("EDU", 6), ...full.criteria] };
    const capped: Grid = { overall: 85, rule: "capped_unproven", criteria: [crit("XP", 9), crit("EMP", 9), crit("CODE", null)] };
    const empty: Grid = { overall: 20, rule: "empty_file", criteria: [crit("STK", 2, false), crit("CODE", null)] };
    const F = BACK_LAYOUT.formula;
    for (const lang of ["fr", "en"] as Lang[]) {
      for (const grid of [full, capped, empty]) {
        const card = { ...FIXTURES.gold, grid, overall: grid.overall };
        const f = gridFormula(card, lang)!;
        const p = packTerms(f.terms, F.size, FW, f.tail);
        expect(p.lines.length).toBeLessThanOrEqual(F.maxLines);
        const text = p.lines.join(" ");
        expect(text).not.toMatch(/[+−]\s?\d/);
        const svg = back(card, lang);
        expect(svg).toContain(lang === "fr" ? ">LA NOTE<" : ">THE RATING<");
        expect(svg).toContain(`= ${grid.overall}`);
        if (grid === empty) expect(f.tail).toBeUndefined();
        else expect(f.tail).toContain("÷");
      }
      expect(gridFormula({ ...FIXTURES.gold, grid: full }, lang)!.terms[0]).toBe("(Code 7\u00a0×\u00a02");
      // L'école comptée : ni sa note ni les autres termes, on en tirerait la sienne ; la moyenne seule, en une phrase.
      const sf = gridFormula({ ...FIXTURES.gold, grid: school }, lang)!;
      expect(sf.sentence).toBe(true);
      expect(sf.tail).toBeUndefined();
      expect(sf.terms.join(" ")).toContain(lang === "fr" ? "Moyenne pondérée des 8 critères notés, école comprise" : "Weighted average of the 8 scored criteria, school included");
      expect(sf.terms.join(" ")).not.toMatch(/×\s?\d,?\d?\s?\+/);
      expect(gridFormula({ ...FIXTURES.gold, grid: capped }, lang)!.tail).toContain("85");
    }
    expect(gridFormula(FIXTURES.gold, "fr")).toBeNull();
  });

  it("se rend en PNG par resvg, comme la face", () => {
    const svg = back(FIXTURES.icon, "fr").replace('width="100%"', 'width="360" height="520"');
    const png = new Resvg(svg, { font: { fontFiles: fontFiles(), loadSystemFonts: false, defaultFontFamily: "Outfit" }, fitTo: { mode: "width", value: 720 } })
      .render()
      .asPng();
    expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(720);
    expect(png.readUInt32BE(20)).toBe(1040);
  });
});

describe("dos de la fiche : la note vient des huit critères (§18.48)", () => {
  const fact = (fr: string, en = fr) => ({ fr, en });
  const crit = (code: CriterionCode, score: number | null, extra: Partial<GridCriterion> = {}): GridCriterion => ({
    code,
    score,
    counted: score !== null,
    state: score === null ? "unproven" : "scored",
    source: "github",
    reached: fact(`Niveau atteint ${code}.`, `Level reached ${code}.`),
    flags: [],
    ...extra,
  });
  const grid: Grid = {
    overall: 67,
    criteria: [
      crit("EDU", 8, { source: "linkedin", evidence: { source: "linkedin", text: fact("Diplôme de l'École Secrète, promotion 2019.", "Degree from Secret School, class of 2019.") } }),
      crit("XP", 6, { source: "linkedin", evidence: { source: "linkedin", text: fact("55 mois dans un poste.", "55 months in a role.") } }),
      crit("EMP", 5, { source: "both" }),
      crit("STK", 7, { evidence: { source: "github", text: fact("TypeScript : 734 commits dans 14 dépôts depuis juin 2023, dernier push aujourd'hui. Rust aussi dans le code. Une troisième phrase qui ne tiendra pas sur deux lignes de la fiche, c'est certain.") } }),
      crit("CODE", 8, { evidence: { source: "github", text: fact("`src/parse.test.ts` : niveau 5 sur 5.", "`src/parse.test.ts`: level 5 of 5.") } }),
      crit("ACT", 6),
      crit("OWN", 7),
      crit("OSS", null),
    ],
  };
  const card: CardData = { ...FIXTURES.gold, grid, overall: grid.overall };
  const cmpCard: CardData = { ...card, pieces: ["linkedin", "github"] };

  it("les huit critères dans l'ordre du recruteur, chacun avec sa note sur 10 (sauf l'école), puis la note : plus les six traits", () => {
    for (const lang of ["fr", "en"] as Lang[]) {
      const svg = back(card, lang);
      const order = [...svg.matchAll(/data-criterion="([A-Z]+)"/g)].map((m) => m[1]);
      expect(order).toEqual(["XP", "EMP", "STK", "CODE", "OWN", "ACT", "EDU", "OSS"]);
      expect(svg.match(/>\/10</g)!.length).toBeGreaterThanOrEqual(6);
      expect(svg).toContain(lang === "fr" ? "Moyenne pondérée des 7 critères notés" : "Weighted average of the 7 scored");
      expect(svg).toContain("= 67");
      expect(svg).toContain(">/100<");
      // Les critères viennent avant la formule ; les codes des six traits ne reviennent pas.
      expect(svg.indexOf('data-criterion="OSS"')).toBeLessThan(svg.indexOf("= 67"));
      for (const code of STAT_CODES) expect(svg).not.toContain(`>${code}<`);
    }
  });

  // §18.52 : l'école ne montre jamais de chiffre, à personne, comptée ou non ; deux mots, « comptée » ou « hors moyenne ».
  it("le dos se montre à tout le monde : jamais le nom de l'école, jamais un chiffre d'école ; « comptée » ou « hors moyenne », pareil pour la personne et le visiteur", () => {
    const withEdu = (edu: Partial<GridCriterion>): CardData => ({ ...card, grid: { ...grid, criteria: grid.criteria.map((c) => (c.code === "EDU" ? { ...c, ...edu } : c)) } });
    const cases = [
      { name: "comptée, au-dessus de la moyenne", card: withEdu({ score: 10, counted: true }), word: { fr: "COMPTÉE", en: "COUNTED" } },
      { name: "sous la moyenne, lue sur LinkedIn", card: withEdu({ score: 4, counted: false }), word: { fr: "HORS MOYENNE", en: "NOT AVERAGED" } },
      { name: "sous la moyenne, lue sur GitHub (hackathon)", card: withEdu({ score: 4, counted: false, source: "github", evidence: { source: "github", text: fact("Repo hackathon-2025 : hackathon ou concours.") } }), word: { fr: "HORS MOYENNE", en: "NOT AVERAGED" } },
    ];
    for (const lang of ["fr", "en"] as Lang[]) {
      for (const k of cases) {
        const owner = back(k.card, lang);
        const visitor = back(publicView(k.card, { thirdParty: false }), lang);
        const row = (svg: string) => /data-criterion="EDU">(.*?)<\/g>/.exec(svg)![1];
        for (const svg of [owner, visitor]) {
          expect(svg, k.name).not.toMatch(/Secr[eè]te|Secret School/);
          // Aucun chiffre dans la rangée de l'école : ni note, ni « /10 », ni tiret.
          expect(row(svg).replace(/<[^>]+>/g, " "), `${k.name} ${lang}`).not.toMatch(/\d|–/);
          expect(row(svg), k.name).toContain(`>${k.word[lang]}<`);
          // La formule ne détaille jamais le terme de l'école.
          expect(svg, k.name).not.toMatch(lang === "fr" ? /École \d/ : /School \d/);
        }
        expect(row(visitor), `${k.name} ${lang}`).toBe(row(owner));
      }
    }
    const fr = (c: CardData) => backCriteria(c, "fr").find((x) => x.code === "EDU")!;
    expect(fr(cases[0].card)).toMatchObject({ score: null, hidden: true, counted: true, state: "comptée", proof: "Elle compte dans la note, sans chiffre affiché." });
    expect(fr(cases[1].card)).toMatchObject({ score: null, hidden: true, counted: false, state: "hors moyenne", proof: "Une école ne fait jamais baisser la note." });
  });

  it("chaque critère dit d'où vient sa pièce : GitHub, CV ou LinkedIn selon le dossier ; sans preuve, il le dit", () => {
    const fr = backCriteria(card, "fr");
    expect(fr.find((c) => c.code === "CODE")!.tag).toBe("GitHub");
    expect(fr.find((c) => c.code === "XP")!.tag).toBe("CV");
    expect(fr.find((c) => c.code === "EMP")!.tag).toBe("CV + GitHub");
    expect(fr.find((c) => c.code === "OSS")!).toMatchObject({ score: null, counted: false, tag: "non prouvé" });
    expect(backCriteria(card, "en").find((c) => c.code === "OSS")!.tag).toBe("unproven");
    // La fiche d'un dossier LinkedIn et GitHub : la pièce déclarée est LinkedIn.
    const li = backCriteria(cmpCard, "fr");
    expect(li.find((c) => c.code === "XP")!.tag).toBe("LinkedIn");
    expect(li.find((c) => c.code === "EMP")!.tag).toBe("LinkedIn + GitHub");
    expect(backCriteria({ ...card, declaredSource: "linkedin" }, "fr").find((c) => c.code === "XP")!.tag).toBe("LinkedIn");
  });

  it("la pièce : le fait précis, sans accent grave de code ; à défaut, le niveau atteint", () => {
    const fr = backCriteria(card, "fr");
    expect(fr.find((c) => c.code === "CODE")!.proof).toBe("src/parse.test.ts : niveau 5 sur 5.");
    expect(fr.find((c) => c.code === "ACT")!.proof).toBe("Niveau atteint ACT.");
    expect(backCriteria(card, "en").find((c) => c.code === "ACT")!.proof).toBe("Level reached ACT.");
  });

  it("tout tient entre le titre et la formule : une ligne de pièce, des phrases entières plutôt qu'une phrase coupée", () => {
    const C = BACK_LAYOUT.criteria;
    for (const lang of ["fr", "en"] as Lang[]) {
      const rows = placeCriteria(backCriteria(card, lang));
      expect(rows).toHaveLength(8);
      expect(rows[0].y).toBe(C.top);
      const last = rows[rows.length - 1];
      expect(last.y + last.h).toBeLessThanOrEqual(formulaRule(3) - C.gap + 0.01);
      for (const r of rows) {
        expect(r.lines.length).toBeGreaterThanOrEqual(1);
        expect(r.lines.length).toBeLessThanOrEqual(C.maxLines);
        for (const line of r.lines) expect(measure(line, "sans-500", C.size)).toBeLessThanOrEqual(FW);
      }
    }
    const long = "TypeScript : 734 commits dans 14 dépôts depuis juin 2023, dernier push aujourd'hui. Rust aussi dans le code. Une troisième phrase qui ne tiendra pas sur deux lignes de la fiche, c'est certain.";
    expect(clipProof(long, FW, 2).join(" ")).toBe("TypeScript : 734 commits dans 14 dépôts depuis juin 2023, dernier push aujourd'hui.");
    // Sur une ligne, la première phrase s'arrête avant « depuis », jamais sur un « … ».
    expect(clipProof(long, FW, 1)).toEqual(["TypeScript : 734 commits dans 14 dépôts."]);
    // Une seule phrase trop longue : elle est coupée, et le dit par « … ».
    const one = clipProof("Une seule phrase beaucoup trop longue pour tenir sur une ligne de la fiche sans être coupée quelque part", FW, 1);
    expect(one).toHaveLength(1);
    expect(one[0].endsWith("…")).toBe(true);
    expect(measure(one[0], "sans-500", C.size)).toBeLessThanOrEqual(FW);
  });

  it("les étoiles du dos : les mêmes, en 14 px, remplies de gauche à droite", () => {
    const svg = back({ ...card, overall: 50, grid: { ...grid, overall: 50 } }, "fr");
    expect(BACK_LAYOUT.stars.size).toBe(14);
    expect([...svg.matchAll(/class="tys-star-on" data-star="(\d)"/g)].map((m) => Number(m[1]))).toEqual([0, 1, 2]);
  });

  it("dossier vide : une phrase à la place de la formule, coupée au mot, à côté de la note", () => {
    const empty: Grid = { overall: 20, rule: "empty_file", criteria: [crit("STK", 2, { counted: false }), crit("CODE", null)] };
    for (const lang of ["fr", "en"] as Lang[]) {
      const svg = back({ ...FIXTURES.gold, grid: empty, overall: 20 }, lang);
      expect(svg).toContain("= 20");
      expect(svg).not.toContain("…");
    }
  });

  it("fiche d'avant la grille dont les axes ne donnent pas la note : pas de fausse formule", () => {
    const card = { ...FIXTURES.jmougeot, overall: FIXTURES.jmougeot.overall + 7 };
    expect(back(card, "fr")).not.toContain("× 30 %");
    expect(back(card, "fr")).toContain("grille de recrutement");
    expect(back(card, "en")).toContain("hiring scorecard");
  });
});

// §18.52 : une donnée manquante au dos dit « peu de données » / “thin data”, jamais un mot coupé.
describe("dos d'une fiche d'avant la grille, peu fournie", () => {
  it("chaque trait dit « peu de données » en entier, sans « … »", () => {
    const thin: CardData = { ...FIXTURES.unknownLang, grid: undefined };
    for (const lang of ["fr", "en"] as Lang[]) {
      const svg = back(thin, lang);
      const word = lang === "fr" ? "PEU DE DONNÉES" : "THIN DATA";
      expect(svg.split(word).length - 1, lang).toBeGreaterThanOrEqual(4);
      for (const m of svg.matchAll(/>([^<]*·[^<]*)</g)) expect(m[1], lang).not.toContain("…");
    }
  });
});
