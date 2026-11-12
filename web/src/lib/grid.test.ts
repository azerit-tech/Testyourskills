// Le bloc « Voici comment un recruteur d'Azerit te lit » (§18.37), ses parties
// pures : l'état d'un critère en étiquettes, l'étiquette de la pièce, la ligne de
// la note finale (jamais un « + n »), et la page partagée sans nom d'école ni
// d'ancien employeur (question 5 du barème).
import { describe, expect, it } from "vitest";
import type { CriterionCode, Grid, GridCriterion, Lang } from "../../../shared/types";
import { DICTS, pick } from "../i18n";
import { finalLines, flagName, keptFrom, repoOf, rowText, safeHref, sourceLabel, stateTags } from "./grid";
import { comparisonGridsMock, declaredGridMock, githubGridMock } from "./mockGrid";

const crit = (code: CriterionCode, score: number | null, over: Partial<GridCriterion> = {}): GridCriterion => ({
  code,
  score,
  state: score === null ? "unproven" : "scored",
  counted: score !== null,
  source: "github",
  reached: { fr: "", en: "" },
  flags: [],
  ...over,
});

const FR = DICTS.fr.grid;
const EN = DICTS.en.grid;
const BONUS = /[+−-]\s?\d/;

describe("l'état d'un critère, en étiquettes lisibles sans la couleur", () => {
  it("noté sur sa source de preuve : aucune étiquette", () => {
    expect(stateTags(crit("CODE", 7))).toEqual([]);
  });

  it("déclaré, à confirmer", () => {
    const tags = stateTags(crit("STK", 6, { state: "declared", source: "linkedin" }));
    expect(tags).toEqual(["declared"]);
    expect(FR.tags.declared).toBe("déclaré, à confirmer");
    expect(EN.tags.declared).toBe("declared, to confirm");
  });

  it("non prouvé et non renseigné sortent de la moyenne", () => {
    expect(stateTags(crit("CODE", null))).toEqual(["unproven", "out"]);
    expect(stateTags(crit("EMP", null, { state: "missing", source: "linkedin" }))).toEqual(["missing", "out"]);
    expect(FR.tags.unproven).toBe("à prouver");
    expect(FR.tags.missing).toBe("pas au dossier");
    expect(FR.tags.out).toBe("ne compte pas contre toi");
    // Vue par quelqu'un d'autre : rien ne s'adresse à la personne fichée.
    expect(FR.tagsThem.out).toBe("ne fait pas baisser la note");
    expect(EN.tagsThem.below).toBe("doesn't lower the rating");
    for (const g of [FR.tagsThem, EN.tagsThem]) for (const v of Object.values(g)) expect(v).not.toMatch(/\btoi\b|\byou\b/);
  });

  it("l'expérience lue sur GitHub est estimée", () => {
    expect(stateTags(crit("XP", 5))).toEqual(["estimated"]);
    expect(stateTags(crit("XP", 5, { source: "linkedin" }))).toEqual([]);
  });

  it("école ou open source sous la moyenne : hors moyenne, sauf dossier vide où rien n'entre", () => {
    expect(stateTags(crit("OSS", 2, { counted: false }))).toEqual(["below"]);
    expect(stateTags(crit("OSS", 2, { counted: false }), { rule: "empty_file" })).toEqual(["out"]);
  });

  it("les quatre états ont chacun leur libellé, dans les deux langues", () => {
    for (const g of [FR, EN]) for (const k of ["declared", "unproven", "missing", "estimated", "below", "out"] as const) expect(g.tags[k]).toBeTruthy();
    const four = [FR.tags.declared, FR.tags.unproven, FR.tags.missing];
    expect(new Set(four).size).toBe(3);
  });
});

describe("l'étiquette de la pièce", () => {
  it("le dépôt d'une preuve GitHub, jamais search ni orgs", () => {
    expect(repoOf("https://github.com/x/sequence-mail/blob/main/a.ts")).toBe("sequence-mail");
    expect(repoOf("https://github.com/search?q=author:x")).toBeNull();
    expect(repoOf("https://github.com/orgs/acme/people")).toBeNull();
    expect(repoOf("https://github.com/x")).toBeNull();
    expect(repoOf(undefined)).toBeNull();
  });

  it("un lien ne s'ouvre que vers GitHub ou LinkedIn", () => {
    expect(safeHref("https://github.com/x")).toBe("https://github.com/x");
    expect(safeHref("https://www.linkedin.com/in/x")).toBe("https://www.linkedin.com/in/x");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("https://evil.test/github.com/")).toBeNull();
  });

  it("« LinkedIn, postes datés », « GitHub, <dépôt> », « recoupé »", () => {
    const xp = crit("XP", 9, { source: "linkedin", evidence: { text: { fr: "8,4 ans", en: "8.4 years" }, source: "linkedin" } });
    expect(sourceLabel(xp, FR, "linkedin")).toBe("LinkedIn, postes datés");
    expect(sourceLabel(xp, FR, "cv")).toBe("CV, postes datés");
    const code = crit("CODE", 7, { evidence: { text: { fr: "t", en: "t" }, source: "github", proof: "https://github.com/x/sequence-mail/blob/main/a.ts" } });
    expect(sourceLabel(code, FR, "linkedin")).toBe("GitHub, sequence-mail");
    const own = crit("OWN", 8, { source: "both", evidence: { text: { fr: "t", en: "t" }, source: "both" } });
    expect(sourceLabel(own, FR, "linkedin")).toBe("recoupé");
    expect(sourceLabel(crit("CODE", null), FR, "linkedin")).toBeNull();
  });
});

describe("la ligne de la note finale", () => {
  const all = (lines: ReturnType<typeof finalLines>) => [lines.formula, lines.result, lines.rule, ...lines.out].filter(Boolean).join(" | ");

  it("moyenne pondérée : la formule, le résultat, aucun « + n » ni « − n »", () => {
    const grid = githubGridMock("gold", "leamd")!;
    for (const lang of ["fr", "en"] as Lang[]) {
      const f = finalLines(grid, DICTS[lang].grid, lang);
      const g = DICTS[lang].grid;
      expect(f.formula!.startsWith(`(${g.final.term(g.names.CODE, 8, "2")} + ${g.final.term(g.names.STK, 8, lang === "fr" ? "1,5" : "1.5")} + `)).toBe(true);
      expect(f.formula).toContain("÷");
      expect(f.overall).toBe(79);
      expect(f.rule).toBeNull();
      expect(all(f)).not.toMatch(BONUS);
    }
    expect(finalLines(grid, FR, "fr").result).toBe(FR.final.result("7,93"));
    expect(FR.final.result("7,93")).toContain("7,93 sur 10");
  });

  it("le plafond sans code prouvé est dit, avec la note avant plafond quand il a joué", () => {
    const f = finalLines(declaredGridMock("LinkedIn"), FR, "fr");
    expect(f.rule).toContain("85");
    expect(f.out.join(" ")).toContain(FR.names.CODE);
    expect(all(f)).not.toMatch(BONUS);
    const hit: Grid = { overall: 85, rule: "capped_unproven", criteria: [crit("XP", 9, { source: "linkedin" }), crit("EMP", 9, { source: "linkedin" }), crit("CODE", null)] };
    expect(finalLines(hit, FR, "fr").rule).toContain("90");
  });

  it("dossier vide : pas de formule, la règle et la note plancher", () => {
    const f = finalLines(githubGridMock("unknownLang", "x")!, FR, "fr");
    expect(f.formula).toBeNull();
    expect(f.rule).toBe(FR.final.empty);
    expect(f.overall).toBe(20);
  });

  it("l'école sous la moyenne sort, et la ligne dit pourquoi", () => {
    const f = finalLines(githubGridMock("wonderkid", "nour-rs")!, FR, "fr");
    expect(f.out.some((o) => o.includes("École") && o.includes(FR.final.belowWhy))).toBe(true);
  });
});

describe("la page partagée : ni école ni ancien employeur", () => {
  const NAMES = /Halbrune|Stealth|Orsay|Junior/;
  const rows = (grid: Grid, shared: boolean, lang: Lang = "fr") =>
    grid.criteria.map((c) => rowText(c, { g: DICTS[lang].grid, pick: (f) => pick(f, lang), declared: "linkedin", shared }));
  const text = (r: ReturnType<typeof rowText>) => [r.line, r.label, r.href, r.reached, r.next, ...r.flags].filter(Boolean).join(" | ");

  it("la personne fichée voit tout", () => {
    const own = rows(declaredGridMock("LinkedIn", "https://www.linkedin.com/in/sans-github"), false);
    expect(own.map(text).join(" ")).toMatch(NAMES);
    expect(own.some((r) => r.next)).toBe(true);
  });

  for (const lang of ["fr", "en"] as Lang[]) {
    it(`un visiteur ne lit aucun nom, ni lien LinkedIn, ni « pour le suivant » (${lang})`, () => {
      for (const grid of [declaredGridMock("LinkedIn", "https://www.linkedin.com/in/sans-github"), comparisonGridsMock("LinkedIn", "camille-ardent").grid]) {
        const seen = rows(grid, true, lang);
        for (const r of seen) {
          expect(text(r)).not.toMatch(NAMES);
          expect(r.next).toBeNull();
          if (r.href) expect(r.href.startsWith("https://github.com/")).toBe(true);
        }
      }
    });
  }

  it("ce qui reste : la version publique de la pièce, écrite par le moteur, et le nom du chef d'accusation", () => {
    const [edu, xp, emp] = rows(declaredGridMock("LinkedIn"), true);
    // L'école, ni rang ni nom : gardée pour la personne fichée.
    expect(edu.line).toBe("École gardée pour la personne fichée.");
    expect(xp.line).toContain("8,4 ans");
    expect(xp.line).toContain("41 mois à la tête d'une entreprise fondée");
    expect(emp.line).toBe("Entreprise fondée : depuis juin 2023, 41 mois. Poste : janvier 2019 – août 2023, 4,6 ans.");
    expect(emp.flags).toEqual(["Équipe encadrée"]);
    expect(edu.redacted && xp.redacted && emp.redacted).toBe(true);
  });

  it("une fiche d'avant, sans version publique : l'école gardée, les années comptées, le niveau atteint", () => {
    const old: Grid = { ...declaredGridMock("LinkedIn") };
    old.criteria = old.criteria.map((c) => (c.evidence ? { ...c, evidence: { text: c.evidence.text, source: c.evidence.source } } : c));
    const [edu, xp, emp] = rows(old, true);
    expect(edu.line).toBe("École gardée pour la personne fichée.");
    expect(xp.line).toContain("8,4 ans");
    expect(emp.line).toBe(FR.levels.EMP.find(([n]) => n <= 8)![1]);
    for (const r of rows(old, true)) expect(text(r)).not.toMatch(NAMES);
  });

  it("les pièces GitHub restent entières", () => {
    const seen = rows(githubGridMock("gold", "leamd")!, true);
    const own = rows(githubGridMock("gold", "leamd")!, false);
    expect(seen.map((r) => r.line)).toEqual(own.map((r) => r.line));
    expect(seen.every((r) => !r.redacted)).toBe(true);
  });

  it("nom de chef d'accusation", () => {
    expect(flagName("Senior sur parole : « Lead dev », 1,1 an")).toBe("Senior sur parole");
    expect(flagName("Activité sans code visible")).toBe("Activité sans code visible");
  });
});

describe("la pièce où chaque note d'un dossier a été lue (§18.36)", () => {
  it("« lu sur LinkedIn », « lu sur le CV », « lu sur GitHub », « lu sur les deux pièces »", () => {
    const grid = comparisonGridsMock("LinkedIn", "camille-ardent").grid;
    const by = (code: CriterionCode) => grid.criteria.find((c) => c.code === code)!;
    const EN = DICTS.en.grid;
    for (const c of grid.criteria) {
      const want = c.source === "both" ? FR.compare.keptFrom.both : c.source === "github" ? FR.compare.keptFrom.github : FR.compare.keptFrom.linkedin;
      expect(keptFrom(c, FR, "linkedin"), c.code).toBe(want);
    }
    expect(keptFrom({ ...by("EDU"), source: "linkedin" }, FR, "cv")).toBe("lu sur le CV");
    expect(keptFrom({ ...by("CODE"), source: "github" }, EN, "linkedin")).toBe("read on GitHub");
    expect(keptFrom({ ...by("OWN"), source: "both" }, EN, "cv")).toBe("read on both exhibits");
  });

  it("aucun mot de duel dans ces libellés", () => {
    for (const k of [FR.compare.keptFrom, DICTS.en.grid.compare.keptFrom]) expect(Object.values(k).join(" ")).not.toMatch(/plus haute|higher|contre|against|retenu|kept/i);
  });

  it("la démo montre « recoupé » là où le moteur le pose : parcours, stack, ownership", () => {
    const grid = comparisonGridsMock("LinkedIn", "camille-ardent").grid;
    const crossed = grid.criteria.filter((c) => sourceLabel(c, FR, "linkedin") === FR.source.both).map((c) => c.code);
    // L'expérience de la démo compte moins d'années de code public : sa pièce reste celle de LinkedIn, le point passe « à confirmer ».
    expect(crossed).toEqual(["EMP", "STK", "OWN"]);
    expect(grid.criteria.find((c) => c.code === "XP")!.flags.map((x) => x.fr)).toContain(
      "À confirmer en entretien\u00a0: une partie de ces années ne se voit pas en code public. C'est courant, le code d'entreprise est privé.",
    );
  });
});
