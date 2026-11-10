// Les grilles de démo (?mock=1) : la note affichée est celle que la grille
// calcule, les quatre états sont couverts, aucun « + n » dans les pièces.
import { describe, expect, it } from "vitest";
import { gridMath } from "../../../shared/gridText";
import type { Grid } from "../../../shared/types";
import { comparisonGridsMock, declaredGridMock, githubGridMock } from "./mockGrid";

const KEYS = ["bronze", "silver", "gold", "wonderkid", "flashback", "lowReliability", "unknownLang"];
const ALL: [string, Grid][] = [
  ...KEYS.map((k): [string, Grid] => [k, githubGridMock(k, "dev")!]),
  ["linkedin", declaredGridMock("LinkedIn")],
  ["cv", declaredGridMock("CV")],
  ...Object.entries(comparisonGridsMock("LinkedIn", "dev")).map(([k, g]): [string, Grid] => [`case-${k}`, g]),
];

describe("les grilles de démo", () => {
  it("chaque note affichée est celle que la grille calcule", () => {
    for (const [k, g] of ALL) {
      const m = gridMath(g);
      const expected = g.rule === "empty_file" ? 20 : Math.min(99, Math.max(1, m.capHit ? 85 : m.raw!));
      expect(g.overall, k).toBe(expected);
    }
  });

  it("les notes attendues : 44, 68, 79, 64, 64, 46, 20 ; 75 déclarée ; 83 pour le dossier", () => {
    expect(KEYS.map((k) => githubGridMock(k, "dev")!.overall)).toEqual([44, 68, 79, 64, 64, 46, 20]);
    expect(declaredGridMock("LinkedIn").overall).toBe(75);
    expect(comparisonGridsMock("LinkedIn", "dev").grid.overall).toBe(83);
  });

  it("couvrent les quatre états, le plafond et le dossier vide", () => {
    const states = new Set(ALL.flatMap(([, g]) => g.criteria.map((c) => c.state)));
    for (const s of ["scored", "declared", "unproven", "missing"]) expect(states.has(s as never), s).toBe(true);
    expect(githubGridMock("lowReliability", "dev")!.rule).toBe("capped_unproven");
    expect(githubGridMock("unknownLang", "dev")!.rule).toBe("empty_file");
  });

  it("aucun bonus « + n » ou « − n » dans les pièces", () => {
    for (const [k, g] of ALL)
      for (const c of g.criteria)
        for (const t of [c.reached, c.next, c.evidence?.text, ...c.flags]) {
          if (!t) continue;
          expect(t.fr, k).not.toMatch(/(^|\s)[+−]\s?\d/);
          expect(t.en, k).not.toMatch(/(^|\s)[+−]\s?\d/);
        }
  });

  it("les fiches de personnes réelles n'ont pas de grille", () => {
    expect(githubGridMock("icon", "dev")).toBeUndefined();
  });
});
