// Le GitHub plausiblement celui d'une personne connectée à LinkedIn (SPEC §18.116).

import { describe, expect, it } from "vitest";
import { githubFitsName } from "./names";

describe("githubFitsName", () => {
  it("les deux dossiers de production : « Jacques » @jmougeot, @raphael-crv", () => {
    expect(githubFitsName("Jacques Mougeot", "jmougeot", "Jacques")).toBe(true);
    expect(githubFitsName("Jacques Mougeot", "jmougeot", null)).toBe(true);
    expect(githubFitsName("Raphael Cerveau", "raphael-crv", "Raphael-Crv")).toBe(true);
    expect(githubFitsName("Raphaël Cerveau", "raphael-crv", null)).toBe(true);
    expect(githubFitsName("Raphael Cerveau", "rcrv", "Raphael-Crv")).toBe(true);
  });

  it("le nom complet affiché, le nom de famille dans le pseudo, le prénom seul affiché", () => {
    expect(githubFitsName("Camille Ardent", "zz-42", "Camille Ardent")).toBe(true);
    expect(githubFitsName("Florent de La Tour", "flo-delatour", null)).toBe(true);
    expect(githubFitsName("Florent de La Tour", "ftour", null)).toBe(true);
    expect(githubFitsName("Camille Ardent", "cam42", "Camille")).toBe(true);
  });

  it("rien qui la relie : ni le nom, ni le pseudo, ni un prénom suivi d'un autre nom", () => {
    expect(githubFitsName("Camille Ardent", "zorro-42", null)).toBe(false);
    expect(githubFitsName("Camille Ardent", "zorro-42", "Zorro")).toBe(false);
    expect(githubFitsName("Jacques Mougeot", "jdupont", "Jacques Dupont")).toBe(false);
    expect(githubFitsName("Jacques", "jacques", "Jacques")).toBe(false);
    expect(githubFitsName("Anna Li", "lion-king", null)).toBe(false);
  });
});
