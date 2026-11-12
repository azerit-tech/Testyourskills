// Un dossier, une fiche, une note (SPEC §18.36) : la fiche du dossier se fait à la
// lecture, à partir des deux pièces rangées ; elle a la forme d'une fiche seule.
import { describe, expect, it } from "vitest";
import { caseCard, declaredLabel, fileOf, piecesOf } from "./caseFile";
import { FIXTURE_COMPARISON, FIXTURES } from "./fixtures";
import { publicView } from "./publicView";
import type { CardData, ComparisonData, CriterionCode, Grid, GridCriterion, GridSource } from "./types";
import { starsFor } from "./types";

const crit = (code: CriterionCode, score: number | null, source: GridSource): GridCriterion => ({
  code,
  score,
  state: score === null ? "unproven" : "scored",
  counted: score !== null,
  source,
  reached: { fr: "", en: "" },
  flags: [],
});

/** Une grille de dossier : l'expérience et le parcours sur LinkedIn, le code sur GitHub. */
const caseGrid = (overall: number, rule?: Grid["rule"]): Grid => ({
  criteria: [crit("XP", 7, "linkedin"), crit("EMP", 6, "linkedin"), crit("CODE", rule === "empty_file" ? null : 6, "github")],
  overall,
  ...(rule ? { rule } : {}),
});

const piece = (card: CardData, overall: number, grid?: Grid): CardData => ({ ...card, overall, ...(grid ? { grid } : {}) });

/** Jacques : LinkedIn 41, GitHub 61, dossier 57. */
const jacques = (): ComparisonData => ({
  ...FIXTURE_COMPARISON,
  id: "dossier",
  declaredSource: "linkedin",
  cv: piece({ ...FIXTURE_COMPARISON.cv, declaredSource: "linkedin", club: "Azerit" }, 41),
  github: piece({ ...FIXTURE_COMPARISON.github, club: "Octorive", rank: { percent: 12, group: { kind: "all" } } }, 61, { criteria: [crit("CODE", 6, "github")], overall: 61 }),
  grid: caseGrid(57),
});

/** Lumine : LinkedIn 45, GitHub vide (20), dossier 45. */
const lumine = (): ComparisonData => ({
  ...jacques(),
  cv: piece({ ...FIXTURE_COMPARISON.cv, declaredSource: "linkedin" }, 45),
  github: piece({ ...FIXTURES.unknownLang, login: "lumine", name: "Lumine", initials: "LU" }, 20, { criteria: [crit("CODE", null, "github")], overall: 20, rule: "empty_file" }),
  grid: caseGrid(45, "capped_unproven"),
});

describe("la fiche du dossier", () => {
  it("Jacques : la note du dossier (57), trois étoiles, la grille du dossier, une seule fiche", () => {
    const f = caseCard(jacques());
    expect(f.overall).toBe(57);
    expect(starsFor(f.overall)).toBe(3);
    expect(f.tier).toBe("bronze");
    expect(f.grid).toEqual(jacques().grid);
    expect(f.id).toBe("dossier");
    expect(f.pieces).toEqual(["linkedin", "github"]);
    // La base est la pièce GitHub : son nom, son profil, son métier, son langage.
    expect(f.source).toBe("github");
    expect(f.login).toBe(FIXTURE_COMPARISON.github.login);
    expect(f.profile).toEqual(FIXTURE_COMPARISON.github.profile);
    expect(f.mainLanguage).toBe(FIXTURE_COMPARISON.github.mainLanguage);
    // L'employeur : LinkedIn d'abord. Le rang en centiles est retiré.
    expect(f.club).toBe("Azerit");
    expect(f.rank).toBeUndefined();
  });

  it("Lumine : un GitHub vide, la base est la pièce déclarative ; la note du dossier (45), le profil de la pièce GitHub", () => {
    const f = caseCard(lumine());
    expect(f.overall).toBe(45);
    expect(f.source).toBe("cv");
    expect(f.declaredSource).toBe("linkedin");
    expect(f.profile?.id).toBe("ghost");
    expect(f.login).toBe("lumine");
  });

  it("la barre XP vient de la pièce où la grille a pris l'expérience", () => {
    const xpOf = (c: CardData) => c.stats.find((s) => s.code === "XP")!.value;
    const cmp = jacques();
    expect(xpOf(caseCard(cmp))).toBe(xpOf(cmp.cv));
    expect(xpOf(caseCard(cmp))).not.toBe(xpOf(cmp.github));
    // L'expérience prise sur GitHub : la barre de la pièce GitHub.
    const gh = { ...cmp, grid: { ...cmp.grid!, criteria: cmp.grid!.criteria.map((c) => (c.code === "XP" ? { ...c, source: "github" as const } : c)) } };
    expect(xpOf(caseCard(gh))).toBe(xpOf(cmp.github));
    // Les autres barres sont celles de la base.
    expect(caseCard(cmp).stats.find((s) => s.code === "TEC")).toEqual(cmp.github.stats.find((s) => s.code === "TEC"));
  });

  it("aucun chef d'accusation de ton « écart »", () => {
    const base = lumine();
    expect(base.cv.statuses.some((s) => s.tone === "gap")).toBe(true);
    expect(caseCard(base).statuses.some((s) => s.tone === "gap")).toBe(false);
    expect(caseCard(jacques()).statuses.every((s) => s.tone !== "gap")).toBe(true);
  });

  it("une caution qui citait un statut d'écart retiré passe à la suivante, ou part", () => {
    const gap = { id: "cv_senior_from_cv", tone: "gap" as const, label: { fr: "Senior, à prouver", en: "Senior, yet to prove" }, rule: { fr: "", en: "" } };
    const neg = (id: string) => ({ id, tone: "negative" as const, label: { fr: id, en: id }, rule: { fr: "", en: "" } });
    const oldBail = { fr: "Caution : des dates exactes sur le profil LinkedIn", en: "Bail: exact dates on the LinkedIn profile" };
    const sentence = { label: { fr: "Peine : 4 mois de tests unitaires", en: "Sentence: 4 months of unit tests" }, bail: oldBail };
    const withCv = (statuses: CardData["statuses"]): ComparisonData => ({ ...lumine(), cv: { ...lumine().cv, statuses, sentence } });
    // La suivante : celle des mots creux, réécrite pour LinkedIn.
    const next = caseCard(withCv([gap, neg("cv_buzzwords")]));
    expect(next.sentence?.label).toEqual(sentence.label);
    expect(next.sentence?.bail).toEqual({ fr: "Caution : rayer « synergie » du profil LinkedIn", en: "Bail: strike “synergy” from LinkedIn" });
    // Aucune autre caution : la peine reste, sans caution.
    const none = caseCard(withCv([gap, { ...neg("fallback_clean_record"), tone: "positive" }]));
    expect(none.sentence).toEqual({ label: sentence.label });
    // Sans statut d'écart, la caution rangée ne bouge pas.
    expect(caseCard(withCv([neg("cv_buzzwords")])).sentence).toEqual(sentence);
  });

  it("plus aucun chef d'accusation après le retrait : « Casier vierge », comme le moteur, jamais un bloc vide", () => {
    const gap = { id: "cv_longer_than_readmes", tone: "gap" as const, label: { fr: "x", en: "x" }, rule: { fr: "", en: "" } };
    const f = caseCard({ ...lumine(), cv: { ...lumine().cv, statuses: [gap] } });
    expect(f.statuses.map((s) => [s.id, s.label.fr, s.label.en])).toEqual([["fallback_clean_record", "Casier vierge", "Clean record"]]);
  });

  it("sans grille rangée (dossier d'avant 0.4.0) : la note de la fiche de base", () => {
    const { grid: _g, ...old } = jacques();
    const f = caseCard({ ...old, github: { ...old.github, grid: undefined } });
    expect(f.overall).toBe(61);
    expect(f.grid).toBeUndefined();
  });

  it("« Débarque en ville » se retire quand l'expérience vient de LinkedIn", () => {
    const cmp = jacques();
    expect(caseCard({ ...cmp, github: { ...cmp.github, special: "wonderkid" } }).special).toBeUndefined();
    expect(caseCard({ ...cmp, github: { ...cmp.github, special: "totw" } }).special).toBe("totw");
  });

  it("les pièces et leur libellé", () => {
    expect(piecesOf({ declaredSource: "linkedin" })).toEqual(["linkedin", "github"]);
    expect(piecesOf({})).toEqual(["cv", "github"]);
    expect(declaredLabel({ declaredSource: "linkedin" })).toBe("LinkedIn");
    expect(declaredLabel({})).toBe("CV");
  });
});

describe("la fiche du dossier vue par un visiteur", () => {
  it("revendiquée, ou faite par la personne : la note et la grille publique du dossier", () => {
    const seen = publicView(jacques(), { thirdParty: false });
    expect(fileOf(seen).overall).toBe(57);
    expect(fileOf(seen).grid?.overall).toBe(57);
  });

  it("faite par un tiers, non revendiquée : la note du dossier reste, sans grille ni tuiles", () => {
    const seen = publicView(jacques(), { thirdParty: true });
    expect(seen.grid).toBeUndefined();
    expect(fileOf(seen).overall).toBe(57);
    expect(fileOf(seen).grid).toBeUndefined();
    expect(fileOf(seen).sealed).toBeUndefined();
    // Idempotent.
    expect(publicView(seen, { thirdParty: true })).toEqual(seen);
  });

  it("un dossier vide fait par un tiers est scellé", () => {
    const empty = { ...jacques(), grid: caseGrid(20, "empty_file") };
    expect(fileOf(publicView(empty, { thirdParty: true })).sealed).toBe(true);
    expect(fileOf(publicView(empty, { thirdParty: false })).sealed).toBeUndefined();
  });
});
