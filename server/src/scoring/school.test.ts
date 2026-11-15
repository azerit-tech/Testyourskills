import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SCHOOL_TIERS, type SchoolTier } from "../../../shared/readings";
import example from "../../../data/schools.example.json";
import { SCORING } from "./config";
import {
  SCHOOLS_ENV,
  loadRankedSchools,
  normSchool,
  parseSchools,
  rankedSchools,
  schoolListNames,
  schoolTier,
  setRankedSchoolsForTests,
  type RankedSchoolList,
} from "./school";

const EXAMPLE_PATH = new URL("../../../data/schools.example.json", import.meta.url).pathname;
// La vraie liste, hors du dépôt (§18.50) : absente en intégration continue, vérifiée seulement si elle est là.
const REAL_PATH = new URL("../../../data/schools.json", import.meta.url).pathname;
const HAS_REAL = existsSync(REAL_PATH);

type Check = { name: string; ai: SchoolTier; tier: SchoolTier; known: string | null };
type ListFile = { schools: { school: string; tier: string; pattern: string }[]; checks?: Check[] };

afterEach(() => setRankedSchoolsForTests(null));

/** Chaque entrée compile, a un rang, et son propre nom tombe sur elle (l'ordre ne la masque pas) ; puis les contrôles du fichier. */
function checkFile(path: string): void {
  const raw = JSON.parse(readFileSync(path, "utf8")) as ListFile;
  const list = loadRankedSchools({ [SCHOOLS_ENV]: path });
  expect(list.source).toBe(path);
  expect(list.schools.length).toBe(raw.schools.length);
  expect(new Set(schoolListNames(list)).size).toBe(list.schools.length);
  for (const e of raw.schools) {
    expect(SCHOOL_TIERS, e.school).toContain(e.tier);
    expect(e.tier).not.toBe("none");
    expect(schoolTier(e.school, "C", list), e.school).toEqual({ tier: e.tier, known: e.school });
  }
  for (const c of raw.checks ?? []) expect(schoolTier(c.name, c.ai, list), `${c.name} (${c.ai})`).toEqual({ tier: c.tier, known: c.known });
}

describe("la liste des écoles, hors du dépôt (§18.50)", () => {
  it("l'exemple du dépôt se lit, avec ses écoles inventées, et tient ses contrôles", () => {
    const list = loadRankedSchools({ [SCHOOLS_ENV]: EXAMPLE_PATH });
    expect(schoolListNames(list)).toEqual(["Académie Nébuleuse", "École Orbitale de Lisière", "École Orbitale (autres)", "Institut Zéphyr"]);
    expect(parseSchools(example)).toEqual(list.schools);
    expect(example.checks.length).toBeGreaterThan(0);
    checkFile(EXAMPLE_PATH);
  });

  it.skipIf(!HAS_REAL)("la vraie liste, si elle est posée ici : même forme, et ses propres contrôles", () => {
    checkFile(REAL_PATH);
  });

  it("sans fichier : liste vide, aucun avertissement, rien ne plante ; toute école prend le rang de l'IA, plafonné", () => {
    const warn = vi.fn();
    expect(loadRankedSchools({}, undefined, warn)).toEqual({ schools: [], source: null });
    expect(loadRankedSchools({ [SCHOOLS_ENV]: "  " }, undefined, warn)).toEqual({ schools: [], source: null });
    expect(warn).not.toHaveBeenCalled();
    // La liste du processus de test : aucune variable, donc vide.
    expect(rankedSchools().schools).toEqual([]);
    expect(schoolTier("Académie Nébuleuse", "S")).toEqual({ tier: SCORING.cv.TEC.school.aiMaxTier, known: null });
    expect(schoolTier("Institut Zéphyr", "C")).toEqual({ tier: "C", known: null });
  });

  it("fichier absent, illisible ou vide : liste vide et un avertissement, sans lever", () => {
    const warn = vi.fn();
    expect(loadRankedSchools({ [SCHOOLS_ENV]: "/nulle/part/schools.json" }, undefined, warn).schools).toEqual([]);
    expect(loadRankedSchools({ [SCHOOLS_ENV]: "x.json" }, () => "{pas du json", warn).schools).toEqual([]);
    expect(loadRankedSchools({ [SCHOOLS_ENV]: "x.json" }, () => '{"schools":[{"school":""},{"tier":"S"},3]}', warn).schools).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it("une entrée mal formée est ignorée : rang inconnu, motif qui ne compile pas, nom vide", () => {
    const schools = parseSchools({
      schools: [
        { school: "Bon", tier: "A", pattern: "\\bbon\\b" },
        { school: "Rang inconnu", tier: "Z", pattern: "x" },
        { school: "Rang none", tier: "none", pattern: "x" },
        { school: "Motif cassé", tier: "B", pattern: "(" },
        { school: "  ", tier: "B", pattern: "x" },
      ],
    });
    expect(schools.map((e) => e.school)).toEqual(["Bon"]);
  });

  it("le dépôt ne garde que l'exemple : le fichier réel est ignoré, la variable documentée sans valeur, le barème sans liste", () => {
    const env = readFileSync(new URL("../../../.env.example", import.meta.url), "utf8");
    expect(env).toMatch(/^SCHOOL_TIERS_FILE=$/m);
    const ignore = readFileSync(new URL("../../../.gitignore", import.meta.url), "utf8");
    expect(ignore).toMatch(/^data\/schools\.json$/m);
    expect(Object.keys(SCORING.cv.TEC.school).sort()).toEqual(["_doc", "aiMaxTier"]);
  });
});

describe("le rang d'une école", () => {
  const list: RankedSchoolList = { schools: parseSchools(example), source: "exemple" };
  const tier = (name: string, ai: SchoolTier = "C") => schoolTier(name, ai, list);

  it("normalise casse, accents et ponctuation", () => {
    expect(normSchool("  École Orbitale — de-Lisière ")).toBe("ecole orbitale de lisiere");
    expect(normSchool("l'X")).toBe("l x");
  });

  it("le cas particulier avant sa famille ; jamais un morceau de mot", () => {
    expect(tier("École Orbitale de Lisière")).toEqual({ tier: "A", known: "École Orbitale de Lisière" });
    expect(tier("École Orbitale de Brume")).toEqual({ tier: "B", known: "École Orbitale (autres)" });
    expect(tier("Institut Zéphyrin", "C")).toEqual({ tier: "C", known: null });
  });

  it("la liste prime, même contre l'IA ; hors liste l'IA est plafonnée, jamais relevée", () => {
    expect(tier("Institut Zéphyr", "S").tier).toBe("C");
    expect(tier("Académie Nébuleuse", "C").tier).toBe("S");
    expect(tier("Université de Nulle Part", "S")).toEqual({ tier: "B", known: null });
    expect(tier("Université de Nulle Part", "A").tier).toBe("B");
    expect(tier("Université de Nulle Part", "B").tier).toBe("B");
    expect(tier("Université de Nulle Part", "C").tier).toBe("C");
  });

  it("« none » de l'IA et un nom vide restent none", () => {
    expect(tier("Académie Nébuleuse", "none")).toEqual({ tier: "none", known: null });
    expect(tier("", "A")).toEqual({ tier: "none", known: null });
    expect(schoolTier(undefined, undefined, list)).toEqual({ tier: "none", known: null });
  });
});
