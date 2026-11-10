// Branchement de la grille sur les vraies données (§18.37) : chaque champ ajouté
// à la collecte LinkedIn et à la lecture IA, pris sous la forme où il est
// produit (sortie du fournisseur → profil gardé → texte → lecture vérifiée par
// le code), ouvre le niveau de la grille qu'il doit ouvrir. Si un nom de champ
// change d'un côté sans l'autre, ces tests tombent. Aucun appel réel.
// Côté GitHub, la même chose part du faux GitHub de github/collect.test.ts.

import { describe, expect, it } from "vitest";
import { ROLE_KINDS, SELECTION_KINDS, type CvReading } from "../../../shared/readings";
import lectureUn from "../ai/__fixtures__/reading-exemple-un.json";
import lectureDeux from "../ai/__fixtures__/reading-exemple-deux.json";
import { validateCvOutput } from "../ai/readCv";
import exempleUn from "../linkedinProfile/__fixtures__/apify-exemple-un.json";
import exempleDeux from "../linkedinProfile/__fixtures__/apify-exemple-deux.json";
import { profileFromApifyItem } from "../linkedinProfile/apify";
import { CONTRACT_TYPES, type LinkedinProfile } from "../linkedinProfile/profile";
import { profileToText } from "../linkedinProfile/text";
import { cvCounts } from "./__fixtures__/make";
import { FOUNDERS_NOW } from "./__fixtures__/founders";
import employersExample from "../../../data/employers.example.json";
import { GRID } from "./config";
import { EMPLOYERS_ENV, loadHighBarEmployers } from "./employers";
import { analyzeRoles, declaredGrid, declaredInput, type DeclaredInput } from "./grid";
import { scoreCv } from "./index";

const NOW = Date.parse(FOUNDERS_NOW);

type Raw = Record<string, unknown>;
type RawItem = Raw & { experience: Raw[] };
type RawReading = Raw & { roles: Raw[] };

const itemUn = () => structuredClone(exempleUn[0]) as unknown as RawItem;
const itemDeux = () => structuredClone(exempleDeux[0]) as unknown as RawItem;
const rawUn = () => structuredClone(lectureUn) as unknown as RawReading;
const rawDeux = () => structuredClone(lectureDeux) as unknown as RawReading;

/** Change un poste de la sortie du fournisseur (ou de la lecture brute), trouvé par son employeur. */
function edit<T extends Raw>(list: T[], company: string, patch: Raw, key: "companyName" | "company"): void {
  const i = list.findIndex((x) => x[key] === company);
  if (i < 0) throw new Error(`pas de poste chez ${company}`);
  const next = { ...list[i], ...patch } as Raw;
  for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k];
  list[i] = next as T;
}
const editItem = (item: RawItem, company: string, patch: Raw) => edit(item.experience, company, patch, "companyName");
const editReading = (r: RawReading, company: string, patch: Raw) => edit(r.roles, company, patch, "company");

/** Sortie du fournisseur → profil gardé et son texte, comme dans le pipeline. */
function collected(item: RawItem): { profile: LinkedinProfile; text: string } {
  const profile = profileFromApifyItem(String(item.linkedinUrl), item)!;
  return { profile, text: profileToText(profile) };
}

/** Réponse brute de l'IA → lecture vérifiée par le code (readCv sans l'appel). */
function read(raw: RawReading, text: string): CvReading {
  const v = validateCvOutput(raw, text);
  if (!v.ok) throw new Error(v.issues.join("; "));
  return v.value;
}

/** Ce que le pipeline passe au scoreur : le profil rangé (postes, formation, compétences, adresse). */
const declaredLinkedin = (p: LinkedinProfile) => ({ roles: p.roles, education: p.education, skills: p.skills, url: p.url });
const input = (p: LinkedinProfile, r: CvReading): DeclaredInput => declaredInput(r, { profile: declaredLinkedin(p), now: NOW });
const kindAt = (d: DeclaredInput, company: string) => analyzeRoles(d.roles, NOW).find((x) => x.role.company === company)!.kind;
const crit = (d: DeclaredInput, code: string) => declaredGrid(d).criteria.find((c) => c.code === code)!;

describe("les tables de data/grid.json couvrent les listes fermées de la collecte et de la lecture", () => {
  it("chaque type de contrat, chaque nature de poste, chaque sorte de sélection a sa ligne, et rien d'autre", () => {
    expect(Object.keys(GRID.XP.byContract).sort()).toEqual([...CONTRACT_TYPES].sort());
    expect(Object.keys(GRID.XP.byAiKind).sort()).toEqual([...ROLE_KINDS].sort());
    expect(Object.keys(GRID.EDU.selection).sort()).toEqual([...SELECTION_KINDS].sort());
    for (const k of [...Object.values(GRID.XP.byContract), ...Object.values(GRID.XP.byAiKind)]) expect(GRID.XP.share[k], k).toBeTypeOf("number");
  });
});

describe("LinkedinRole.contract → Expérience", () => {
  it("un contrat de stage, sans « intern » dans l'intitulé, compte pour moitié ; sans contrat, en plein", () => {
    const item = itemUn();
    editItem(item, "Fonds Exemple", { position: "Quantitative Researcher" });
    const { profile, text } = collected(item);
    expect(profile.roles.find((r) => r.company === "Fonds Exemple")!.contract).toBe("internship");
    const reading = read({ ...rawUn(), roles: [] }, text);
    const d = input(profile, reading);
    expect(kindAt(d, "Fonds Exemple")).toBe("internship");
    expect(crit(d, "XP").evidence!.text.fr).toMatch(/^13 mois de stage ou d'alternance comptés pour moitié\./);

    editItem(item, "Fonds Exemple", { employmentType: undefined });
    const plain = collected(item);
    expect(plain.profile.roles.find((r) => r.company === "Fonds Exemple")!.contract).toBeUndefined();
    expect(kindAt(input(plain.profile, reading), "Fonds Exemple")).toBe("full");
  });
});

describe("CvRole.kind → Expérience, rattaché au poste du profil par l'entreprise et la date de début", () => {
  it("la nature lue par l'IA fait le stage quand ni l'intitulé ni le contrat ne le disent", () => {
    const item = itemUn();
    editItem(item, "McMaster University", { position: "Researcher" });
    const { profile, text } = collected(item);
    const reading = read(rawUn(), text);
    expect(reading.roles.find((r) => r.company === "McMaster University")!.kind).toBe("internship");
    expect(kindAt(input(profile, reading), "McMaster University")).toBe("internship");

    // Sans la nature lue, ou lue sur un autre poste (autre date de début) : un vrai poste.
    const raw = rawUn();
    editReading(raw, "McMaster University", { kind: undefined });
    expect(kindAt(input(profile, read(raw, text)), "McMaster University")).toBe("full");
    const shifted = rawUn();
    editReading(shifted, "McMaster University", { start: "2025-03" });
    expect(kindAt(input(profile, read(shifted, text)), "McMaster University")).toBe("full");
  });

  it("le contrat du fournisseur l'emporte sur l'IA, dans les deux sens", () => {
    const item = itemUn();
    editItem(item, "Fonds Exemple", { position: "Quantitative Researcher", employmentType: "Full-time" });
    const full = collected(item);
    expect(full.profile.roles.find((r) => r.company === "Fonds Exemple")!.contract).toBe("full_time");
    // L'IA dit stage, le contrat dit salarié : salarié.
    expect(kindAt(input(full.profile, read(rawUn(), full.text)), "Fonds Exemple")).toBe("full");

    editItem(item, "Fonds Exemple", { employmentType: "Internship" });
    const intern = collected(item);
    const raw = rawUn();
    editReading(raw, "Fonds Exemple", { kind: "job" });
    // L'IA dit poste, le contrat dit stage : stage.
    expect(kindAt(input(intern.profile, read(raw, intern.text)), "Fonds Exemple")).toBe("internship");
  });

  it("une association ou un bénévolat lus par l'IA ne comptent jamais, quel que soit le contrat ; un projet personnel, seulement sans contrat", () => {
    const item = itemUn();
    const extra = (companyName: string, year: number): Raw => ({
      position: "Coordinateur",
      companyName,
      employmentType: "Full-time",
      startDate: { month: "Jan", year, text: `Jan ${year}` },
      endDate: { month: "Dec", year, text: `Dec ${year}` },
    });
    item.experience.push(extra("Les Paniers Solidaires", 2022), extra("Atelier Perso", 2021));
    const { profile, text } = collected(item);
    expect(profile.roles.find((r) => r.company === "Les Paniers Solidaires")!.contract).toBe("full_time");
    const raw = rawUn();
    const role = (company: string, start: string, end: string, kind: string): Raw => ({ title: "Coordinateur", company, start, end, responsibilities: [], employer_type: "unknown", kind });
    raw.roles.push(role("Les Paniers Solidaires", "2022-01", "2022-12", "volunteer"), role("Atelier Perso", "2021-01", "2021-12", "personal_project"));
    const d = input(profile, read(raw, text));
    expect(kindAt(d, "Les Paniers Solidaires")).toBe("association");
    // Le contrat de salarié l'emporte sur « projet personnel ».
    expect(kindAt(d, "Atelier Perso")).toBe("full");

    // Sans contrat, le projet personnel ne compte pas : la pièce le dit, et le total ne bouge pas.
    editItem(item, "Atelier Perso", { employmentType: undefined });
    editItem(item, "Les Paniers Solidaires", { employmentType: undefined });
    const bare = collected(item);
    const d2 = input(bare.profile, read(raw, bare.text));
    expect(kindAt(d2, "Atelier Perso")).toBe("project");
    const xp = crit(d2, "XP");
    expect(xp.evidence!.text.fr).toContain("Atelier Perso est un projet personnel : non compté.");
    expect(xp.evidence!.text.fr).toMatch(/Total : 1,1 an\.$/);
  });
});

describe("CvRole.employer_type → Parcours", () => {
  it("un an dans une startup de produit ouvre le 6 ; sans le type d'employeur, 4", () => {
    const item = itemDeux();
    editItem(item, "Sejo", { position: "Product Manager", endDate: { month: "Sep", year: 2025, text: "Sep 2025" } });
    const { profile, text } = collected(item);
    const raw = rawDeux();
    editReading(raw, "Sejo", { title: "Product Manager", end: "2025-09" });
    const emp = crit(input(profile, read(raw, text)), "EMP");
    expect(emp.score).toBe(6);
    expect(emp.reached.fr).toBe("12 mois dans une startup de produit : Sejo.");

    editReading(raw, "Sejo", { employer_type: undefined });
    expect(crit(input(profile, read(raw, text)), "EMP").score).toBe(4);
  });
});

describe("CvReading.selection_signals → École et sélection", () => {
  it("un prix de hackathon cité dans les distinctions, extrait retrouvé : 8 au-dessus d'une école de rang B ; sans extrait dans le texte, rien", () => {
    const item = { ...itemUn(), honorsAndAwards: [{ title: "Prix du jury, Hackathon Exemple 2024", issuer: "Hackathon Exemple" }] };
    const { profile, text } = collected(item);
    expect(text).toContain("Prix du jury, Hackathon Exemple 2024");
    const raw = { ...rawUn(), selection_signals: [{ kind: "hackathon_prize", quote: "Prix du jury, Hackathon Exemple 2024" }] };
    const reading = read(raw, text);
    expect(reading.selection_signals).toEqual([{ kind: "hackathon_prize", quote: "Prix du jury, Hackathon Exemple 2024" }]);
    const edu = crit(input(profile, reading), "EDU");
    expect([edu.score, edu.reached.fr]).toEqual([8, "Sélection : prix de hackathon."]);

    const invented = read({ ...rawUn(), selection_signals: [{ kind: "hackathon_prize", quote: "Prix au hackathon de la Lune" }] }, text);
    expect(crit(input(profile, invented), "EDU").score).toBe(6);
  });

  it.each(SELECTION_KINDS)("la sorte « %s » donne la note de sa ligne", (kind) => {
    const item = { ...itemDeux(), honorsAndAwards: [{ title: "Distinction Exemple", issuer: "Concours Exemple" }] };
    const { profile, text } = collected(item);
    const reading = read({ ...rawDeux(), school_name: "", school_tier: "none", selection_signals: [{ kind, quote: "Distinction Exemple" }] }, text);
    expect(crit(input(profile, reading), "EDU").score).toBe(GRID.EDU.selection[kind]);
  });
});

describe("CvReading.management_fact → Parcours", () => {
  it("un fait d'encadrement retrouvé dans le texte s'affiche sur le parcours ; inventé, rien", () => {
    const item = itemUn();
    editItem(item, "Azerit", { description: "Recrutement d'ingénieurs à partir de leur code public. Encadrement d'une équipe de trois développeurs." });
    const { profile, text } = collected(item);
    const reading = read({ ...rawUn(), management_quote: "Encadrement d'une équipe de trois développeurs." }, text);
    expect(reading.management_fact).toEqual({ quote: "Encadrement d'une équipe de trois développeurs." });
    expect(crit(input(profile, reading), "EMP").flags.map((x) => x.fr)).toEqual(["Équipe encadrée : « Encadrement d'une équipe de trois développeurs. »"]);

    const invented = read({ ...rawUn(), management_quote: "A dirigé cinquante personnes." }, text);
    expect(invented.management_fact).toBeNull();
    expect(crit(input(profile, invented), "EMP").flags).toEqual([]);
  });
});

describe("la liste des employeurs à forte barre → Parcours, niveau 10", () => {
  // La liste d'exemple aux noms inventés, lue par le chargeur du serveur.
  const list = loadHighBarEmployers({ [EMPLOYERS_ENV]: "employers.json" }, () => JSON.stringify(employersExample));
  const item = () => {
    const it = itemUn();
    it.experience.unshift({
      position: "Engineering manager",
      companyName: "Fictiva Labs Paris",
      description: "Encadrement d'une équipe de six ingénieurs.",
      startDate: { month: "Jan", year: 2019, text: "Jan 2019" },
      endDate: { month: "Dec", year: 2022, text: "Dec 2022" },
    });
    return it;
  };

  it("deux ans chez un employeur de la liste et une équipe encadrée, fait cité : 10 ; sans la liste, 6", () => {
    const { profile, text } = collected(item());
    const reading = read({ ...rawUn(), management_quote: "Encadrement d'une équipe de six ingénieurs." }, text);
    const withList = declaredGrid(declaredInput(reading, { profile: declaredLinkedin(profile), now: NOW, highBar: list })).criteria.find((c) => c.code === "EMP")!;
    expect(list.employers.length).toBe(3);
    expect(withList.score).toBe(10);
    expect(withList.reached.fr).toBe("3,9 ans chez Fictiva Labs Paris, employeur à forte barre d'embauche, et une équipe encadrée.");
    expect(crit(input(profile, reading), "EMP").score).toBe(6);
  });

  it("l'IA ne donne jamais ce rang : un « high_bar » lu devient « unknown »", () => {
    const { profile, text } = collected(item());
    const raw = rawUn();
    raw.roles.unshift({ title: "Engineering manager", company: "Fictiva Labs Paris", start: "2019-01", end: "2022-12", responsibilities: [], employer_type: "high_bar", kind: "job" });
    const reading = read({ ...raw, management_quote: "Encadrement d'une équipe de six ingénieurs." }, text);
    expect(reading.roles[0]!.employer_type).toBe("unknown");
    expect(crit(input(profile, reading), "EMP").score).toBe(6);
  });
});

describe("les deux profils d'exemple, du fournisseur à la note de la fiche LinkedIn", () => {
  const card = (item: RawItem, raw: RawReading) => {
    const { profile, text } = collected(item);
    return scoreCv(read(raw, text), cvCounts(), { lang: "fr", judgedInSeconds: 6, linkedin: declaredLinkedin(profile), now: FOUNDERS_NOW });
  };

  it("exemple un : 41 ; exemple deux : 45 (docs/bareme-recrutement.md §7)", () => {
    const un = card(itemUn(), rawUn());
    expect(un.grid!.criteria.find((c) => c.code === "XP")!.evidence!.text.fr).toBe(
      "13 mois de stage ou d'alternance comptés pour moitié. 7 mois à la tête d'Azerit. Centrale Méditerranée Finance est une association : non compté. Total : 1,1 an.",
    );
    expect(un.overall).toBe(41);
    expect(card(itemDeux(), rawDeux()).overall).toBe(45);
  });
});
