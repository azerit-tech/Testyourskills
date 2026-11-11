// La page partagée (shared/publicView.ts) : ce que reçoit quelqu'un qui n'est
// pas la personne fichée. Ni école, ni recoupement négatif, ni chef d'accusation
// qui joue contre elle ; pas de grille sur une fiche dénoncée non revendiquée.
import { describe, expect, it } from "vitest";
import { FIXTURE_COMPARISON, FIXTURES } from "../../../shared/fixtures";
import { gridMath } from "../../../shared/gridText";
import { publicGrid, publicView, SCHOOL_KEPT } from "../../../shared/publicView";
import type { CardData, ComparisonData, Grid, GridCriterion } from "../../../shared/types";
import { comparisonGridsMock, declaredGridMock, githubGridMock } from "./mockGrid";
import { mockApi } from "./mock";

const byCode = (g: Grid, code: GridCriterion["code"]) => g.criteria.find((c) => c.code === code)!;
const all = (g: Grid) => JSON.stringify(g);

describe("la grille vue par un visiteur", () => {
  const cmp = comparisonGridsMock("LinkedIn", "camille-ardent");

  it("l'école : ni rang ni nom ; sa note seulement si elle a fait monter la note", () => {
    const g = publicGrid(declaredGridMock("LinkedIn"));
    const edu = byCode(g, "EDU");
    expect(all(g)).not.toMatch(/Télécom|rang A|tier A/);
    expect(edu.reached).toEqual(SCHOOL_KEPT);
    expect(edu.evidence).toBeUndefined();
    // Comptée dans la moyenne : sa note reste, la formule tombe juste.
    expect(edu.counted).toBe(true);
    expect(edu.score).toBe(8);
    expect(gridMath(g)).toEqual(gridMath(declaredGridMock("LinkedIn")));
  });

  it("l'école hors moyenne : gardée pour la personne, sans changer la note ni la formule", () => {
    const raw = githubGridMock("wonderkid", "nour-rs")!;
    const rawEdu = byCode(raw, "EDU");
    // La démo a une école sous la moyenne : c'est elle qu'on garde.
    expect(rawEdu.counted).toBe(false);
    const g = publicGrid({ ...raw, criteria: raw.criteria.map((c) => (c.code === "EDU" ? { ...c, source: "linkedin" as const, score: 4 } : c)) });
    const edu = byCode(g, "EDU");
    expect(edu.score).toBeNull();
    expect(edu.private).toBe(true);
    const m = gridMath(g);
    expect(m.terms).toEqual(gridMath(raw).terms);
    expect(m.excluded.map((x) => x.code)).not.toContain("EDU");
  });

  it("les recoupements négatifs restent privés, les positifs se montrent", () => {
    for (const grid of [cmp.cv, cmp.grid]) {
      const g = publicGrid(grid);
      expect(all(g)).not.toMatch(/Moins d'années de code public|Fewer years of public code|Sans trace publique|No public trace|Kubernetes, Kafka, aucune/);
      const stk = byCode(g, "STK");
      if (stk.evidence?.source === "both") expect(stk.evidence.text.fr).toContain("Dans le code : React, Node.js.");
    }
    // L'expérience recoupée « en dessous » redevient la pièce de LinkedIn, sans face-à-face.
    const xp = byCode(publicGrid(cmp.cv), "XP");
    expect(xp.evidence?.source).toBe("linkedin");
    expect(xp.evidence?.text.fr).not.toContain("GitHub");
    // Le même employeur des deux côtés : un recoupement positif, montré.
    expect(byCode(publicGrid(cmp.cv), "EMP").evidence?.publicText?.fr).toContain("Identité recoupée.");
  });

  it("les chefs d'accusation : seulement ceux qui jouent pour la personne", () => {
    const g = publicGrid(cmp.cv);
    const flags = g.criteria.flatMap((c) => c.flags.map((x) => x.fr));
    expect(flags.some((x) => x.startsWith("Équipe encadrée"))).toBe(true);
    expect(flags.some((x) => x.includes("en dessous de la vérité"))).toBe(true);
    expect(flags.some((x) => /sans trace publique|Senior à confirmer|PR entre proches|Activité sans code/i.test(x))).toBe(false);
  });

  it("ni « ce qui manque » ni texte qui nomme ; idempotent", () => {
    const g = publicGrid(cmp.grid);
    expect(g.criteria.every((c) => c.next === undefined)).toBe(true);
    expect(all(g)).not.toMatch(/Stealth|Orsay|Banque|Télécom/);
    expect(publicGrid(g)).toEqual(g);
  });

  it("les pièces GitHub restent entières", () => {
    const raw = githubGridMock("gold", "leamd")!;
    const g = publicGrid(raw);
    for (const code of ["CODE", "ACT", "OSS"] as const) expect(byCode(g, code).evidence).toEqual(byCode(raw, code).evidence);
  });
});

describe("la fiche faite par un tiers", () => {
  const card: CardData = { ...FIXTURES.gold, grid: githubGridMock("gold", "leamd") };
  const grids = comparisonGridsMock("LinkedIn", "x");
  const cmp: ComparisonData = {
    ...FIXTURE_COMPARISON,
    grid: grids.grid,
    cv: { ...FIXTURE_COMPARISON.cv, grid: grids.cv },
    github: { ...FIXTURE_COMPARISON.github, grid: grids.github },
  };

  it("dénoncée, non revendiquée : pas de grille, le jeu reste", () => {
    const seen = publicView(card, { thirdParty: true });
    expect(seen.grid).toBeUndefined();
    expect(seen.overall).toBe(card.overall);
    expect(seen.profile).toEqual(card.profile);
    const c = publicView(cmp, { thirdParty: true });
    expect(c.grid).toBeUndefined();
    expect(c.cv.grid).toBeUndefined();
    expect(c.github.grid).toBeUndefined();
  });

  it("revendiquée, ou faite par la personne : la grille publique", () => {
    const seen = publicView(card, { thirdParty: false });
    expect(seen.grid).toEqual(publicGrid(card.grid!));
  });
});

describe("la démo applique la même vue que le serveur", () => {
  const gridOf = (s: Awaited<ReturnType<typeof mockApi.getJob>>) => {
    if (s.state !== "done") throw new Error("pas finie");
    return s.kind === "card" ? s.card.grid : (s.comparison.grid ?? s.comparison.cv.grid ?? s.comparison.github.grid);
  };

  it("dénoncée anonymement ou par un nom, non revendiquée : pas de grille, ni ligne ni tuiles", async () => {
    expect(gridOf(await mockApi.getJob("m-silver-Dabcd"))).toBeUndefined();
    expect(gridOf(await mockApi.getJob("m-silver-Nabcd"))).toBeUndefined();
    expect(gridOf(await mockApi.getJob("m-licmp-Dabcd"))).toBeUndefined();
    // Quelqu'un d'autre connecté ne change rien.
    expect(gridOf(await mockApi.getJob("m-silver-Dabcd", "leamd"))).toBeUndefined();
  });

  it("revendiquée (« C'est moi » en démo, ou /c/m-…-C…) : la grille revient", async () => {
    expect(gridOf(await mockApi.getJob("m-silver-Dabcd", "camroux"))).toBeDefined();
    expect(gridOf(await mockApi.getJob("m-silver-Cabcd"))).toBeDefined();
    expect(gridOf(await mockApi.getJob("m-silver-abcd"))).toBeDefined();
  });
});
