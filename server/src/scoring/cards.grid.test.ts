// Barème 0.4.0 (docs/bareme-recrutement.md §8) : la note de chaque fiche est celle de
// la grille, et la comparaison porte la note du dossier. Vérifié sur les deux fondateurs,
// par les fonctions de fiche elles-mêmes (scoreGithub, scoreCv, scoreDossier). Une personne a
// une note : « LinkedIn 60, GitHub 77 » sont la même personne avec une seule de ses pièces.

import { describe, expect, it } from "vitest";
import { jacquesDossier as jacques, lumineDossier as lumine } from "./__fixtures__/dossiers";
import { useTestSchools } from "./__fixtures__/schools";

// Jamais la vraie liste des écoles : celles des lectures d'exemple, puis l'exemple aux écoles inventées.
useTestSchools();

describe("les fiches prennent la note de la grille", () => {
  // Barème 0.4.0 : 41, 61, 57. L'expérience donne le niveau (« Junior ») et ne pèse plus (0.5.0) : 60, 77, 72.
  // 0.6.0 : la preuve +1 sur chaque critère montré par GitHub, l'expérience au coefficient 4 : 60, 87, 80.
  // 0.7.0 : la courbe de la note (SPEC §18.117) lève le milieu, pas le haut : 69, 87, 80.
  it("Jacques : LinkedIn 69 (60 sous 0.6.0), GitHub 87, dossier 80 (à un point près)", () => {
    const { github, linkedin, cmp } = jacques();
    expect(Math.abs(linkedin.overall - 69)).toBeLessThanOrEqual(1);
    expect(Math.abs(github.overall - 87)).toBeLessThanOrEqual(1);
    expect(Math.abs(cmp.grid!.overall - 80)).toBeLessThanOrEqual(1);
    expect(cmp.grid!.seniority?.code).toBe("junior");
    expect(linkedin.overall).toBe(linkedin.grid!.overall);
    expect(github.overall).toBe(github.grid!.overall);
  });

  // Barème 0.4.0 : 45, 20, 45 ; 0.5.0 : 66, 20, 66. 0.6.0 : deux entreprises fondées, 21 mois cumulés, l'expérience à 8.
  it("Lumine : LinkedIn 75 (66 sous 0.5.0), GitHub 20, dossier 75 (à un point près)", () => {
    const { github, linkedin, cmp } = lumine();
    expect(Math.abs(linkedin.overall - 75)).toBeLessThanOrEqual(1);
    expect(github.overall).toBe(20);
    expect(github.grid!.rule).toBe("empty_file");
    expect(Math.abs(cmp.grid!.overall - 75)).toBeLessThanOrEqual(1);
    expect(cmp.grid!.rule).toBe("capped_unproven");
  });

  it("la barre XP est le critère Expérience × 10", () => {
    const { github, linkedin } = jacques();
    const xp = (c: typeof github) => c.stats.find((s) => s.code === "XP")!;
    const crit = (c: typeof github) => c.grid!.criteria.find((x) => x.code === "XP")!;
    expect(xp(linkedin).value).toBe(crit(linkedin).score! * 10);
    expect(xp(github).value).toBe(crit(github).score! * 10);
    // Sans critère, la barre tombe au plancher et n'est pas suffisante.
    const empty = lumine().github;
    expect(crit(empty).score).toBeNull();
    expect(xp(empty).value).toBe(1);
    expect(xp(empty).sufficient).toBe(false);
  });

  it("la comparaison porte la grille du dossier, chaque critère avec ses deux côtés (0.6.0 : l'ownership déclaré 6, prouvé 9)", () => {
    const { cmp } = jacques();
    expect(cmp.grid!.criteria.map((c) => c.code)).toEqual(["EDU", "XP", "EMP", "STK", "CODE", "ACT", "OWN", "OSS"]);
    const own = cmp.grid!.criteria.find((c) => c.code === "OWN")!;
    expect(own.source).toBe("both");
    expect(own.declared).toBe(6);
    expect(own.proven).toBe(9);
    // Les pièces n'ont pas de grille à elles : leur note est celle du dossier (SPEC §18.84).
    expect([cmp.cv.grid, cmp.github.grid]).toEqual([undefined, undefined]);
    expect([cmp.cv.overall, cmp.github.overall]).toEqual([cmp.grid!.overall, cmp.grid!.overall]);
  });

  it("Sous couverture ne naît plus d'un écart entre les deux pièces (§18.36)", () => {
    for (const cmp of [jacques().cmp, lumine().cmp]) {
      expect(cmp.cv.profile?.id).not.toBe("forger");
      expect(cmp.github.profile?.id).not.toBe("forger");
    }
  });

});
