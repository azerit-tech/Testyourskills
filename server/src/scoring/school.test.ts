import { describe, expect, it } from "vitest";
import { SCHOOL_TIERS } from "../../../shared/readings";
import { SCORING } from "./config";
import { normSchool, schoolTier } from "./school";

const tier = (name: string, ai: "S" | "A" | "B" | "C" | "none" = "C") => schoolTier(name, ai);

describe("liste des écoles", () => {
  it("chaque entrée compile, a un rang valable, et son propre nom tombe sur elle (l'ordre ne la masque pas)", () => {
    const list = SCORING.cv.TEC.school.list;
    expect(list.length).toBeGreaterThanOrEqual(60);
    expect(list.length).toBeLessThanOrEqual(80);
    for (const e of list) {
      expect(SCHOOL_TIERS).toContain(e.tier);
      expect(() => new RegExp(e.pattern)).not.toThrow();
      expect(tier(e.school), e.school).toEqual({ tier: e.tier, known: e.school });
    }
    expect(new Set(list.map((e) => e.school)).size).toBe(list.length);
  });

  it("normalise casse, accents et ponctuation", () => {
    expect(normSchool("  École CentraleSupélec — Paris-Saclay ")).toBe("ecole centralesupelec paris saclay");
    expect(normSchool("l'X")).toBe("l x");
  });
});

describe("alias", () => {
  it("CentraleSupélec : rang A sous toutes ses graphies", () => {
    for (const n of ["CentraleSupélec", "Centrale Supelec", "Centrale-Supélec", "CENTRALESUPELEC", "École Centrale Paris", "Ecole Centrale de Paris", "Supélec", "CentraleSupélec - Université Paris-Saclay"]) {
      expect(tier(n), n).toEqual({ tier: "A", known: "CentraleSupélec" });
    }
  });

  it("Centrale Méditerranée, ex-Centrale Marseille : rang B", () => {
    for (const n of ["Centrale Méditerranée", "Centrale Mediterranee", "Centrale Marseille", "École Centrale de Marseille", "Ecole Centrale Marseille"]) {
      expect(tier(n), n).toEqual({ tier: "B", known: "Centrale Méditerranée" });
    }
    expect(tier("École Centrale de Lyon").known).toBe("Centrale Lyon");
    expect(tier("École Centrale Casablanca")).toEqual({ tier: "B", known: "Centrale (autres)" });
  });

  it("École centrale d'électronique n'est pas une Centrale", () => {
    expect(tier("École Centrale d'Électronique")).toEqual({ tier: "C", known: "ECE" });
    expect(tier("ECE Paris").known).toBe("ECE");
  });

  it("l'X et Polytechnique, mais pas Polytech ni les autres « polytechniques »", () => {
    for (const n of ["X", "l'X", "X2015", "École polytechnique", "Ecole Polytechnique (X)", "Polytechnique", "École polytechnique, Palaiseau", "Ecole polytechnique de Paris"]) {
      expect(tier(n), n).toEqual({ tier: "S", known: "École polytechnique" });
    }
    for (const n of ["Polytech Nantes", "Polytech Sorbonne", "Polytech' Lille", "École polytechnique universitaire de Lille", "Polytech Paris-Saclay"]) {
      expect(tier(n), n).toEqual({ tier: "C", known: "Polytech" });
    }
    expect(tier("Polytechnique Montréal").known).toBe("Polytechnique Montréal");
    expect(tier("École Polytechnique de Montréal").tier).toBe("B");
    expect(tier("École Polytechnique Fédérale de Lausanne")).toEqual({ tier: "A", known: "EPFL" });
    expect(tier("Institut Polytechnique de Paris")).toEqual({ tier: "A", known: "Institut Polytechnique de Paris" });
    expect(tier("Grenoble INP - Institut polytechnique de Grenoble").known).toBe("Grenoble INP");
    expect(tier("Institut National Polytechnique de Toulouse").known).toBe("Toulouse INP - ENSEEIHT");
    // Hors liste : le rang de l'IA, plafonné.
    for (const n of ["École nationale polytechnique d'Alger", "Université Polytechnique Hauts-de-France", "École Polytechnique de Tunisie", "SpaceX Academy"]) {
      expect(tier(n, "S"), n).toEqual({ tier: "B", known: null });
    }
  });

  it("les ENS, Mines, Télécom, ENSTA : l'école de Paris d'abord, puis la famille", () => {
    expect(tier("ENS Ulm").tier).toBe("S");
    expect(tier("École normale supérieure - PSL").tier).toBe("S");
    expect(tier("École Normale Supérieure").tier).toBe("S");
    expect(tier("ENS Paris-Saclay")).toEqual({ tier: "A", known: "ENS Paris-Saclay" });
    expect(tier("ENS Cachan").known).toBe("ENS Paris-Saclay");
    expect(tier("École normale supérieure de Lyon").known).toBe("ENS Lyon");
    expect(tier("ENS Rennes").tier).toBe("B");
    expect(tier("École normale supérieure de Tunis", "A")).toEqual({ tier: "B", known: null });
    expect(tier("Mines ParisTech")).toEqual({ tier: "A", known: "Mines Paris" });
    expect(tier("Mines Paris - PSL").known).toBe("Mines Paris");
    expect(tier("École des mines de Paris").known).toBe("Mines Paris");
    expect(tier("Mines Saint-Étienne")).toEqual({ tier: "B", known: "Mines (autres)" });
    expect(tier("IMT Mines Albi").tier).toBe("B");
    expect(tier("Télécom ParisTech")).toEqual({ tier: "A", known: "Télécom Paris" });
    expect(tier("Télécom SudParis")).toEqual({ tier: "B", known: "Télécom (autres)" });
    expect(tier("ENST Bretagne").tier).toBe("B");
    expect(tier("ENSTA Paris").tier).toBe("A");
    expect(tier("ENSTA Bretagne").tier).toBe("B");
    expect(tier("École des Ponts ParisTech").tier).toBe("A");
    expect(tier("Grenoble INP - Ensimag").known).toBe("Ensimag");
  });

  it("homonymes et écoles voisines", () => {
    expect(tier("Oxford Brookes University", "B")).toEqual({ tier: "B", known: null });
    expect(tier("University of Oxford").tier).toBe("S");
    expect(tier("MIT Manipal", "A")).toEqual({ tier: "B", known: null });
    expect(tier("Massachusetts Institute of Technology").known).toBe("MIT");
    expect(tier("ETH Zürich").tier).toBe("S");
    expect(tier("Technische Universität München").known).toBe("TU Munich");
    expect(tier("INSA Lyon")).toEqual({ tier: "B", known: "INSA" });
    expect(tier("École 42").known).toBe("42");
    expect(tier("42 Paris").known).toBe("42");
    expect(tier("Epitech").tier).toBe("C");
    expect(tier("EPITA").tier).toBe("B");
    expect(tier("Polytech Sorbonne").known).toBe("Polytech");
    expect(tier("Sorbonne Université").known).toBe("Sorbonne Université");
  });
});

describe("l'IA hors liste", () => {
  it("plafonnée à B, jamais relevée", () => {
    expect(tier("Université de Bordeaux", "S")).toEqual({ tier: "B", known: null });
    expect(tier("Université de Bordeaux", "A").tier).toBe("B");
    expect(tier("Université de Bordeaux", "B").tier).toBe("B");
    expect(tier("IUT de Lannion", "C").tier).toBe("C");
  });

  it("la liste prime, même contre l'IA ; « none » et un nom vide restent none", () => {
    expect(tier("CentraleSupélec", "C").tier).toBe("A");
    expect(tier("École polytechnique", "B").tier).toBe("S");
    expect(tier("Epitech", "A").tier).toBe("C");
    expect(tier("Stanford Graduate School of Business", "none")).toEqual({ tier: "none", known: null });
    expect(tier("", "A")).toEqual({ tier: "none", known: null });
    expect(schoolTier(undefined, undefined)).toEqual({ tier: "none", known: null });
  });
});
