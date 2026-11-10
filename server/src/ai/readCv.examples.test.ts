// Les deux profils d'exemple du barème (docs/bareme-recrutement.md §7, §8) :
// profil LinkedIn (sortie fictive d'Apify) → profil gardé → texte → lecture
// (réponse d'IA préparée) → lecture vérifiée par le code. Aucun appel réel.
// Profil un : une fondation depuis avril 2026, deux stages, une association
// au nom de son école, une école d'ingénieurs. Profil deux : deux fondations,
// une école d'ingénieurs, un semestre d'échange dans une autre école.

import { beforeEach, describe, expect, it } from "vitest";
import exempleUn from "../linkedinProfile/__fixtures__/apify-exemple-un.json";
import exempleDeux from "../linkedinProfile/__fixtures__/apify-exemple-deux.json";
import { profileFromApifyItem } from "../linkedinProfile/apify";
import { profileToText } from "../linkedinProfile/text";
import { schoolTier } from "../scoring/school";
import lectureUn from "./__fixtures__/reading-exemple-un.json";
import lectureDeux from "./__fixtures__/reading-exemple-deux.json";
import { resetBudgetForTests } from "./budget";
import { readCv } from "./readCv";
import { fakeClient } from "./testing";

beforeEach(() => resetBudgetForTests());

const read = async (text: string, reply: unknown) => (await readCv(text, { client: fakeClient([reply]).client }))!;

describe("profil d'exemple un : fondation, deux stages, association de l'école", () => {
  const profile = profileFromApifyItem("https://www.linkedin.com/in/exemple-un", exempleUn[0])!;
  const text = profileToText(profile);

  it("le profil gardé : le stage typé par le fournisseur sort en stage, sans lieu", () => {
    expect(profile.roles.map((r) => [r.company, r.start, r.end, r.contract ?? null])).toEqual([
      ["Azerit", "2026-04", null, null],
      ["Fonds Exemple", "2025-09", "2026-03", "internship"],
      ["McMaster University", "2025-02", "2025-11", null],
      ["Centrale Méditerranée Finance", "2023-12", "2024-12", null],
    ]);
    expect(text).toContain("Quantitative Research Intern — Fonds Exemple · Internship (2025-09 – 2026-03)");
    expect(JSON.stringify(profile)).not.toMatch(/Marseille|Provence|location/);
  });

  it("la lecture : deux stages, une association étudiante, une fondation ; l'école garde son rang", async () => {
    const r = await read(text, lectureUn);
    expect(r.roles.map((x) => [x.company, x.kind])).toEqual([
      ["Azerit", "job"],
      ["Fonds Exemple", "internship"],
      ["McMaster University", "internship"],
      ["Centrale Méditerranée Finance", "student_association"],
    ]);
    expect(r.roles.map((x) => x.employer_type)).toEqual(["startup", "unknown", "public_research", "public_research"]);
    expect(r).toMatchObject({ school_name: "Centrale Méditerranée", school_tier: "B", selection_signals: [], management_fact: null });
    expect(schoolTier(r.school_name, r.school_tier).tier).toBe("B");
  });

  it("si l'IA prend l'association pour un vrai poste, le code la remet en association étudiante", async () => {
    const roles = lectureUn.roles.map((x) => (x.company === "Centrale Méditerranée Finance" ? { ...x, kind: "job", employer_type: "unknown" } : x));
    const r = await read(text, { ...lectureUn, roles });
    expect(r.roles.find((x) => x.company === "Centrale Méditerranée Finance")!.kind).toBe("student_association");
    // Les stages restent des stages.
    expect(r.roles.filter((x) => x.kind === "internship").map((x) => x.company)).toEqual(["Fonds Exemple", "McMaster University"]);
  });
});

describe("profil d'exemple deux : deux fondations, un semestre d'échange", () => {
  const profile = profileFromApifyItem("https://www.linkedin.com/in/exemple-deux", exempleDeux[0])!;
  const text = profileToText(profile);

  it("la lecture : deux fondations, l'école du diplôme et son rang", async () => {
    expect(text).toContain("Exchange semester, Computer Science — ETH Zürich (2024 – 2024)");
    const r = await read(text, lectureDeux);
    expect(r.roles.map((x) => [x.company, x.kind, x.employer_type])).toEqual([
      ["Azerit", "job", "startup"],
      ["Sejo", "job", "startup"],
    ]);
    expect(r).toMatchObject({ school_name: "CentraleSupélec", school_tier: "A" });
    expect(schoolTier(r.school_name, r.school_tier).tier).toBe("A");
  });

  it("le semestre d'échange ne donne pas de rang, même si l'IA le retient", async () => {
    const r = await read(text, { ...lectureDeux, school_name: "ETH Zürich", school_tier: "S" });
    expect(r).toMatchObject({ school_name: "", school_tier: "none" });
    expect(schoolTier(r.school_name, r.school_tier).tier).toBe("none");
  });
});
