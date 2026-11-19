// Barème de recrutement (docs/bareme-recrutement.md §8, « Tâche 2 ») : les tests
// d'acceptation du moteur, sur des faits synthétiques et sur les deux fondateurs.

import { describe, expect, it } from "vitest";
import type { CodeReadingResult, CvReading, SchoolTier } from "../../../shared/readings";
import { SCHOOL_RANK_RE, schoolCounted } from "../../../shared/schoolRank";
import { CRITERION_CODES, starsFor, type CriterionCode, type Fact, type Grid, type GridCriterion } from "../../../shared/types";
import type { GithubFacts } from "../github/facts";
import { cvReading, daysAgo, facts, repo, tree } from "./__fixtures__/make";
import {
  FOUNDERS_NOW,
  JACQUES_AI,
  jacquesFacts,
  jacquesProfile,
  jacquesReading,
  lumineFacts,
  lumineProfile,
  lumineReading,
  type FounderProfile,
} from "./__fixtures__/founders";
import { GRID } from "./config";
import { deriveGithub } from "./derive";
import {
  analyzeRoles,
  dossierGrid,
  countedMonths,
  declaredGrid,
  declaredInput,
  finalize,
  githubGrid,
  stackFlags,
  type DatedRole,
} from "./grid";
import { publicGrid } from "../../../shared/publicView";
import employersExample from "../../../data/employers.example.json";
import { parseEmployers, type HighBarList } from "./employers";
import { useTestSchools } from "./__fixtures__/schools";

// Jamais la vraie liste des écoles : celles des lectures d'exemple, puis l'exemple aux écoles inventées.
useTestSchools();

const NOW = Date.parse(FOUNDERS_NOW);
/** La liste d'exemple aux noms inventés (data/employers.example.json), lue par le chargeur du serveur. */
const EXAMPLE_HIGH_BAR: HighBarList = { employers: parseEmployers(employersExample), source: "data/employers.example.json" };
const gh = (f: GithubFacts, ai: CodeReadingResult | null = null) => ({ facts: f, m: deriveGithub(f), ai });
const decl = (r: CvReading, p?: FounderProfile, now = NOW) => declaredInput(r, { profile: p, now });
const score = (g: Grid, code: CriterionCode) => g.criteria.find((c) => c.code === code)!.score;
const crit = (g: Grid, code: CriterionCode) => g.criteria.find((c) => c.code === code)!;
const scores = (g: Grid) => Object.fromEntries(g.criteria.map((c) => [c.code, c.score]));
/** Un texte français sans ses espaces insécables, pour le comparer à une phrase écrite au clavier. */
const sp = (s?: string) => s?.replace(/\u00a0/g, " ");

/** Toutes les notes possibles d'un critère, lues dans sa table. */
const TABLE: Record<CriterionCode, number[]> = {
  EDU: [...Object.values(GRID.EDU.tiers), ...Object.values(GRID.EDU.selection), GRID.EDU.githubScore],
  XP: GRID.XP.levels.map((l) => l.score),
  EMP: Object.values(GRID.EMP.tables).flatMap((rows) => rows.map((l) => l.score)),
  STK: [...GRID.STK.levels.map((l) => l.score), ...GRID.STK.declared.map((l) => l.score)],
  CODE: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  ACT: GRID.ACT.levels.map((l) => l.score),
  OWN: [...GRID.OWN.levels.map((l) => l.score), ...GRID.OWN.declared.map((l) => l.score)],
  OSS: GRID.OSS.levels.map((l) => l.score),
};

function allTexts(g: Grid): Fact[] {
  return g.criteria.flatMap((c) => [c.reached, ...(c.next ? [c.next] : []), ...c.flags, ...(c.evidence ? [c.evidence.text] : [])]);
}

/** Un ingénieur solide : 6 ans dans une startup, école de rang A, GitHub fourni et lu au niveau 5. */
function strongFacts(): GithubFacts {
  const repos = [
    repo("lib", { fullName: "dev/lib", commitCount: 1500, stars: 2400, externalContributors: 30, createdAt: daysAgo(365 * 6), pushedAt: daysAgo(2), releaseDates: [daysAgo(10), daysAgo(90), daysAgo(200)], activity: 80 }),
    repo("api", { fullName: "dev/api", language: "Go", languages: { Go: 300_000 }, commitCount: 400, createdAt: daysAgo(900), activity: 40 }),
    repo("ml", { fullName: "dev/ml", language: "Python", languages: { Python: 200_000 }, commitCount: 300, createdAt: daysAgo(700), activity: 30 }),
    repo("cli", { fullName: "dev/cli", commitCount: 200, activity: 20 }),
    repo("site", { fullName: "dev/site", commitCount: 100, activity: 10 }),
  ];
  return facts({
    repos,
    calendar: { available: true, weeksActive: 50, weeks: 52, totalContributions: 2400 },
    activityByYear: Array.from({ length: 10 }, (_, i) => ({ yearsAgo: i, contributions: 600 })),
    externalMergedPRs: 40,
    trees: repos.map((r) => tree(r.name, { markers: ["dockerfile"] })),
  });
}
const AI5: CodeReadingResult = {
  readings: ["lib", "api", "ml"].map((r) => ({ repo: r, level: 5, evidence_file: "src/index.ts", evidence_quote: "", observed_traits: [] })),
  ai_status: null,
};

function seniorReading(p: Partial<CvReading> = {}): CvReading {
  return cvReading({
    roles: [
      { title: "Staff engineer", company: "Fictiva Labs", start: "2023-01", end: null, responsibilities: ["API TypeScript, PostgreSQL et React"], employer_type: "scaleup" },
      { title: "Software engineer", company: "Fictiva Labs", start: "2019-01", end: "2022-12", responsibilities: ["Front React"], employer_type: "scaleup" },
    ],
    technos_described: ["TypeScript", "React", "PostgreSQL", "Kafka", "Terraform"],
    projects_with_dated_outcome: 4,
    school_name: "",
    school_tier: "none",
    ...p,
  });
}
const fictivaProfile = (): FounderProfile => ({
  roles: [
    { title: "Staff engineer", company: "Fictiva Labs", start: "2023-01", end: null, description: "API TypeScript, PostgreSQL et React." },
    { title: "Software engineer", company: "Fictiva Labs", start: "2019-01", end: "2022-12", description: "Front React." },
  ],
  education: [],
  skills: ["TypeScript", "React"],
});

describe("les deux fondateurs (§7), à un point près", () => {
  const jGithub = githubGrid(gh(jacquesFacts(), JACQUES_AI));
  const jLinkedin = declaredGrid(decl(jacquesReading(), jacquesProfile()), gh(jacquesFacts()));
  const jCase = dossierGrid({ declared: decl(jacquesReading(), jacquesProfile()), github: gh(jacquesFacts(), JACQUES_AI) });
  const lGithub = githubGrid(gh(lumineFacts()));
  const lLinkedin = declaredGrid(decl(lumineReading(), lumineProfile()), gh(lumineFacts()));
  const lCase = dossierGrid({ declared: decl(lumineReading(), lumineProfile()), github: gh(lumineFacts()) });

  // Barème 0.4.0 : LinkedIn 41, GitHub 61, dossier 57. L'expérience (3, puis 4 estimée) pesait 1,5 ;
  // elle donne maintenant le niveau, « Junior », et le parcours, la stack et l'ownership se lisent à ce
  // niveau : Azerit fondée et tenue 7 mois, 6 au lieu de 4 ; 329 commits depuis deux ans et une autre
  // famille de langages, 8 au lieu de 6 ; un projet porté 17 mois avec de quoi mettre en production, 8 au lieu de 6.
  it("Jacques, niveau « Junior » : LinkedIn 60, GitHub 77, dossier 72", () => {
    expect(scores(jLinkedin)).toEqual({ EDU: 6, XP: 3, EMP: 6, STK: null, CODE: null, ACT: null, OWN: 4, OSS: null });
    expect(scores(jGithub)).toEqual({ EDU: null, XP: 4, EMP: null, STK: 8, CODE: 7, ACT: 8, OWN: 8, OSS: 6 });
    expect(scores(jCase)).toEqual({ EDU: 6, XP: 3, EMP: 6, STK: 8, CODE: 7, ACT: 8, OWN: 8, OSS: 6 });
    expect(jLinkedin.seniority).toEqual({ code: "junior", months: 13.5, source: "linkedin" });
    expect(jGithub.seniority).toEqual({ code: "junior", months: 24, source: "github" });
    expect(jCase.seniority).toEqual(jLinkedin.seniority);
    expect(jLinkedin.overall).toBe(60);
    expect(jGithub.overall).toBe(77);
    expect(jCase.overall).toBe(72);
    // L'expérience ne pèse plus, nulle part : elle garde sa lecture, hors moyenne.
    for (const g of [jLinkedin, jGithub, jCase]) expect(crit(g, "XP").counted).toBe(false);
    // L'ownership seulement déclaré (4) est sous le parcours (6) : hors moyenne, comme l'école (6, pas au-dessus).
    expect(crit(jLinkedin, "OWN").counted).toBe(false);
    expect(crit(jLinkedin, "EDU").counted).toBe(false);
    // L'open source (6) n'est au-dessus ni de 7,7 sur la fiche GitHub ni de 7,2 au dossier : hors moyenne.
    expect(crit(jGithub, "OSS").counted).toBe(false);
    expect(crit(jCase, "OSS").counted).toBe(false);
    expect(jLinkedin.rule).toBe("capped_unproven");
    expect(jGithub.rule).toBeUndefined();
  });

  // Barème 0.4.0 : LinkedIn 45, dossier 45.
  it("Lumine, niveau « Junior » : LinkedIn 66, GitHub 20 (dossier vide), dossier 66 « code non prouvé »", () => {
    expect(scores(lLinkedin)).toEqual({ EDU: 8, XP: 3, EMP: 6, STK: null, CODE: null, ACT: null, OWN: 4, OSS: null });
    expect(lLinkedin.seniority?.code).toBe("junior");
    expect(lLinkedin.overall).toBe(66);
    expect(lGithub.overall).toBe(20);
    expect(lGithub.rule).toBe("empty_file");
    expect(lGithub.criteria.every((c) => c.score === null && !c.counted)).toBe(true);
    expect(lCase.overall).toBe(66);
    expect(lCase.rule).toBe("capped_unproven");
    expect(crit(lCase, "STK").state).toBe("unproven");
    expect(crit(lCase, "ACT").state).toBe("unproven");
  });

  it("les pièces se lisent poste par poste, avec les chiffres de la personne", () => {
    expect(crit(declaredGrid(decl(jacquesReading(), jacquesProfile())), "XP").evidence?.text.fr).toBe(
      "1,1 an compté, poste par poste. 13 mois de stage ou d'alternance comptés pour moitié. 7 mois à la tête d'Azerit. Centrale Méditerranée Finance est une association : non compté.",
    );
    expect(sp(crit(jLinkedin, "XP").reached.fr)).toBe("1,1 an compté sur les postes datés : niveau « Junior » (de 1 à 3 ans).");
    expect(crit(jLinkedin, "XP").next).toBeUndefined();
    expect(sp(crit(jLinkedin, "EMP").reached.fr)).toBe("Azerit fondée et tenue 7 mois.");
    expect(sp(crit(jLinkedin, "EMP").next?.fr)).toBe("Pour 8 : un an dans une équipe produit exigeante (startup, scale-up), ou une entreprise fondée tenue un an.");
    // La table lue est celle du niveau, portée par la grille : la ligne obtenue y figure.
    expect(crit(jLinkedin, "EMP").table?.map((r) => r.score)).toEqual(GRID.EMP.tables.junior.map((r) => r.score));
    expect(sp(crit(jLinkedin, "EMP").table?.find((r) => r.score === 6)?.text.fr)).toBe("6 mois dans une équipe produit exigeante (startup, scale-up), ou une entreprise fondée tenue 6 mois, ou un poste tenu 2 ans.");
    expect(sp(crit(jGithub, "STK").next?.fr)).toBe("Pour 10 : 600 commits dans ton langage principal (tu en as 329).");
    expect(sp(crit(jGithub, "OWN").reached.fr)).toBe("Un projet porté 6 mois ou plus (50 commits), et de quoi mettre en production (sequence-mail).");
    expect(sp(crit(jGithub, "OWN").next?.fr)).toBe("Pour 10 : un projet porté un an ou plus (100 commits), publié, utilisé par d'autres (25 stars GitHub ou 2 comptes externes qui contribuent).");
    expect(crit(jGithub, "STK").evidence?.text.fr).toMatch(/^TypeScript : 329 commits dans 7 repos depuis novembre 2024, dernier push hier \(sequence-mail\)\. Agda aussi dans le code\.$/);
    expect(crit(jGithub, "CODE").reached.fr).toBe("Niveau moyen lu 3,6 sur 5, sur 3 repos.");
    expect(crit(jGithub, "CODE").evidence?.text.fr).toMatch(/^sequence-mail, `src\/services\/outreach\.test\.ts` : niveau 4 sur 5\./);
    expect(crit(jGithub, "CODE").evidence?.proof).toBe("https://github.com/jmougeot/sequence-mail/blob/main/src/services/outreach.test.ts");
    expect(crit(jGithub, "ACT").next?.fr).toBe("Pour 10 : 48 semaines actives (tu en as 43).");
    expect(crit(jGithub, "OSS").next?.fr).toMatch(/La destination des PR n'est pas encore lue\.$/);
    expect(crit(jGithub, "XP").reached.fr).toMatch(/^Estimée : 2 années actives/);
  });

  it("la comparaison garde les deux notes de chaque critère, et retient le prouvé", () => {
    const own = crit(jCase, "OWN");
    expect([own.declared, own.proven, own.score, own.source]).toEqual([4, 8, 8, "both"]);
    const stk = crit(jCase, "STK");
    expect([stk.declared, stk.proven, stk.score, stk.source]).toEqual([null, 8, 8, "github"]);
    const xp = crit(jCase, "XP");
    expect([xp.declared, xp.proven, xp.score, xp.source]).toEqual([3, 4, 3, "linkedin"]);
  });
});

describe("les recoupements LinkedIn × GitHub : la pièce « recoupé » (§3, §5)", () => {
  const jDeclared = (f = jacquesFacts()) => declaredGrid(decl(jacquesReading(), jacquesProfile()), gh(f));
  const jCase = (f = jacquesFacts()) => dossierGrid({ declared: decl(jacquesReading(), jacquesProfile()), github: gh(f, JACQUES_AI) });
  const NAMES = /Azerit|McMaster|Hedge Fund|Centrale|Méditerranée|Research Intern|Co-founder|agda-notes|agda-stdlib/;
  const both = (g: Grid) => g.criteria.filter((c) => c.evidence?.source === "both").map((c) => c.code);

  it("Jacques : expérience, parcours, stack et ownership recoupés ; école, code, activité, open source sur leur source", () => {
    const g = jCase();
    expect(both(g)).toEqual(["XP", "EMP", "STK", "OWN"]);
    expect(crit(g, "XP").evidence!.text.fr).toBe(
      "1,1 an compté, poste par poste. 13 mois de stage ou d'alternance comptés pour moitié. 7 mois à la tête d'Azerit. Centrale Méditerranée Finance est une association : non compté. GitHub : 2 années actives (50 contributions ou plus sur douze mois). Recoupé\u00a0: le code public couvre la même période.",
    );
    expect(crit(g, "EMP").evidence!.text.fr).toBe(
      "LinkedIn : Research Intern, McMaster University, février 2025 – novembre 2025. GitHub : agda-notes, 25 commits, actif sur les mêmes mois. Poste confirmé par le code.",
    );
    expect(crit(g, "STK").evidence!.text.fr).toMatch(/\(sequence-mail\)\. Agda aussi dans le code\. Déclarées sur LinkedIn\u00a0: Python, Agda, TypeScript, Kubernetes\. Retrouvées dans le code\u00a0: Agda, TypeScript\.$/);
    expect(crit(g, "OWN").evidence!.text.fr).toBe("sequence-mail : 120 commits sur 17 mois. Sur LinkedIn\u00a0: une entreprise fondée (Azerit). Aucun résultat daté et chiffré.");
    // Un dossier, une fiche, une note (§18.36) : aucune tournure d'écart dans les pièces.
    for (const c of g.criteria) expect(JSON.stringify([c.evidence, c.flags]), c.code).not.toMatch(/Sans trace publique|Moins d'années|Du code public sur plus|en dessous de la vérité|Déclaré :/);
  });

  it("un recoupement ne change aucune note, ni la note du dossier", () => {
    const alone = declaredGrid(decl(jacquesReading(), jacquesProfile()));
    expect(scores(jDeclared())).toEqual(scores(alone));
    expect(jDeclared().overall).toBe(alone.overall);
    // Au dossier, les notes déclarées sont celles de la pièce lue seule.
    for (const c of jCase().criteria) if (c.declared != null) expect(c.declared, c.code).toBe(score(alone, c.code));
  });

  it("moins d'années de code public que de métier compté : la pièce reste celle de LinkedIn, le point passe « à confirmer », pour la personne seule", () => {
    const d = decl(seniorReading(), fictivaProfile());
    const withGh = declaredGrid(d, gh(jacquesFacts()));
    const xp = crit(withGh, "XP");
    expect(xp.score).toBe(crit(declaredGrid(d), "XP").score);
    expect(withGh.overall).toBe(declaredGrid(d).overall);
    expect(xp.evidence!.source).toBe("linkedin");
    expect(xp.evidence!.text.fr).toMatch(/ GitHub : 2 années actives \(50 contributions ou plus sur douze mois\)\.$/);
    expect(xp.evidence!.publicText!.fr).not.toMatch(/GitHub/);
    const flag = "À confirmer en entretien : une partie de ces années ne se voit pas en code public. C'est courant, le code d'entreprise est privé.";
    expect(xp.flags.map((x) => x.fr)).toContain(flag);
    expect(xp.flags.map((x) => x.en)).toContain("To check in an interview: part of these years doesn't show in public code. That's common, company code is private.");
    const pub = publicGrid(withGh).criteria.find((c) => c.code === "XP")!;
    expect(pub.flags).toEqual([]);
    expect(JSON.stringify(pub)).not.toMatch(/À confirmer|To confirm/);
  });

  it("chaque pièce recoupée a sa version publique, sans nom d'employeur, d'école, d'intitulé ni de dépôt du poste", () => {
    for (const g of [jCase(), jDeclared()])
      for (const c of g.criteria.filter((x) => x.evidence?.source === "both"))
        for (const lang of ["fr", "en"] as const) {
          const pub = c.evidence!.publicText?.[lang];
          expect(pub, `${c.code} ${lang}`).toBeTruthy();
          // La stack et l'ownership gardent les noms de technos et de dépôts publics de la pièce GitHub : jamais ceux du poste.
          expect(pub!.replace(/sequence-mail/g, ""), `${c.code} ${lang}`).not.toMatch(NAMES);
        }
  });

  it("le poste confirmé par des PR fusionnées pendant le poste, dans un dépôt qui porte un mot du poste", () => {
    const f = { ...jacquesFacts(), externalMergedPRList: [
      { repo: "agda/agda-stdlib", stars: 700, mergedAt: "2025-04-02T10:00:00Z" },
      { repo: "agda/agda-stdlib", stars: 700, mergedAt: "2025-09-12T10:00:00Z" },
      // hors des mois du poste : pas compté
      { repo: "agda/agda-stdlib", stars: 700, mergedAt: "2024-01-12T10:00:00Z" },
    ] };
    const emp = crit(jCase(f), "EMP").evidence!;
    expect(emp.source).toBe("both");
    expect(emp.text.fr).toContain("GitHub : 2 PR fusionnées dans agda/agda-stdlib sur ces mois. Poste confirmé par le code.");
    expect(emp.publicText!.fr).toBe("LinkedIn : stage ou alternance, février 2025 – novembre 2025. GitHub : 2 PR fusionnées dans un repo public sur ces mois. Poste confirmé par le code.");
  });

  it("sans dépôt du poste : le même employeur sur le profil GitHub, pour le poste en cours", () => {
    const f = jacquesFacts();
    f.repos = f.repos.filter((r) => r.name !== "agda-notes");
    const emp = crit(jCase(f), "EMP").evidence!;
    expect(emp.source).toBe("both");
    expect(emp.text.fr).toBe("LinkedIn : Co-founder, Azerit, depuis avril 2026. Profil GitHub, société : Azerit. Même employeur des deux côtés.");
    expect(emp.publicText!.fr).not.toMatch(NAMES);
    // Ni dépôt, ni société, ni site : la pièce reste celle de LinkedIn.
    f.profile = { ...f.profile, company: null, blog: null };
    expect(crit(jCase(f), "EMP").evidence!.source).toBe("linkedin");
  });

  it("« sans trace publique » ne vise que les technos qu'on sait chercher", () => {
    const r = { ...jacquesReading(), technos_listed: ["Python", "Agda", "TypeScript", "Kubernetes", "Salesforce CPQ"] };
    const stk = crit(declaredGrid(decl(r, jacquesProfile()), gh(jacquesFacts())), "STK").evidence!;
    expect(stk.text.fr).not.toContain("Salesforce");
  });

  it("un GitHub vide ne recoupe rien : les pièces restent celles de LinkedIn", () => {
    const g = dossierGrid({ declared: decl(lumineReading(), lumineProfile()), github: gh(lumineFacts()) });
    expect(both(g)).toEqual([]);
  });
});

describe("aucune note par addition", () => {
  const grids = [
    githubGrid(gh(jacquesFacts(), JACQUES_AI)),
    githubGrid(gh(strongFacts(), AI5)),
    githubGrid(gh(facts())),
    declaredGrid(decl(seniorReading(), fictivaProfile())),
    declaredGrid(decl(jacquesReading(), jacquesProfile())),
  ];

  it("chaque critère rend une note de sa table, entière de 0 à 10", () => {
    for (const g of grids)
      for (const c of g.criteria) {
        if (c.score === null) continue;
        expect(Number.isInteger(c.score), c.code).toBe(true);
        expect(TABLE[c.code], `${c.code} ${c.score}`).toContain(c.score);
      }
  });

  it("la note finale est la moyenne pondérée, vérifiée à la main", () => {
    const c = (code: CriterionCode, score: number | null): Omit<GridCriterion, "counted"> => ({
      code,
      score,
      state: score === null ? "unproven" : "scored",
      source: "github",
      reached: { fr: "x", en: "x" },
      flags: [],
    });
    // L'expérience ne pèse pas (coefficient 0). Sans l'école ni l'open source :
    // (4 × 2,5 + 8 × 2 + 6 × 1,5 + 2 × 1,5 + 10) ÷ 8,5 = 48 ÷ 8,5 = 5,65.
    // École 4 sous 5,65 : dehors. Open source 8 au-dessus : dedans, 52 ÷ 9 = 5,78 → 58.
    const g = finalize([c("EDU", 4), c("XP", 4), c("EMP", 4), c("STK", 6), c("CODE", 8), c("ACT", 10), c("OWN", 2), c("OSS", 8)]);
    expect(g.overall).toBe(58);
    expect(g.criteria.filter((x) => !x.counted).map((x) => x.code)).toEqual(["EDU", "XP"]);
    expect(g.weights).toEqual(GRID.weights);
    // Dix ans ou un an d'expérience : la même note, à critères égaux.
    expect(finalize([c("EDU", 4), c("XP", 10), c("EMP", 4), c("STK", 6), c("CODE", 8), c("ACT", 10), c("OWN", 2), c("OSS", 8)]).overall).toBe(58);
    // Arrondi au supérieur à ,5 : (7 × 2,5 + 7 × 2 + 6 × 1,5 + 6 × 1,5 + 8) ÷ 8,5 = 57,5 ÷ 8,5 = 6,7647 → 68 ; 62,5 ÷ 10 = 6,25 → 63.
    expect(finalize([c("EDU", 6), c("XP", 3), c("EMP", 7), c("STK", 6), c("CODE", 7), c("ACT", 8), c("OWN", 6), c("OSS", 6)]).overall).toBe(68);
    expect(finalize([c("EDU", 7), c("XP", 3), c("EMP", 5), c("STK", 6), c("CODE", 7), c("ACT", 8), c("OWN", 6), c("OSS", 7)]).overall).toBe(63);
    // Rien n'est ajouté à une base : tous les critères à n donnent 10 × n.
    for (const n of [2, 5, 8]) expect(finalize(CRITERION_CODES.map((k) => c(k, n))).overall).toBe(10 * n);
    // Seulement déclaré (LinkedIn ou CV, sans preuve) : jamais vers le bas, comme l'école. Parcours 8 seul = 80 ;
    // une stack déclarée à 4 n'y entre pas, à 6 sous un parcours à 5 elle y entre : (5 × 2,5 + 6 × 1,5) ÷ 4 = 5,375 → 54.
    const declared = (code: CriterionCode, n: number): Omit<GridCriterion, "counted"> => ({ ...c(code, n), state: "declared", source: "linkedin" });
    const none = (code: CriterionCode) => c(code, null);
    const li = (emp: number, stk: number) => finalize([none("EDU"), none("XP"), { ...c("EMP", emp), source: "linkedin" }, declared("STK", stk), none("CODE"), none("ACT"), none("OWN"), none("OSS")]);
    expect(li(8, 4).overall).toBe(80);
    expect(li(8, 4).criteria.find((x) => x.code === "STK")!.counted).toBe(false);
    expect(li(5, 6).overall).toBe(54);
  });

  it("un chef d'accusation ne change aucune note", () => {
    const g = githubGrid(gh(jacquesFacts(), JACQUES_AI));
    const flagged: Grid = { ...g, criteria: g.criteria.map((c) => ({ ...c, flags: [...c.flags, { fr: "Chef", en: "Charge" }] })) };
    expect(finalize(flagged.criteria).overall).toBe(g.overall);
    // Senior à confirmer : le chef sort, l'expérience reste celle des postes.
    const r = cvReading({ roles: [{ title: "Senior developer", company: "Acme", start: "2025-01", end: null, responsibilities: [] }] });
    const p = declaredGrid(decl(r));
    expect(crit(p, "XP").flags[0].fr).toMatch(/^Senior à confirmer/);
    expect(score(p, "XP")).toBe(3);
  });

  it("aucun texte ne se lit « +n » ou « −n », tout existe en français et en anglais", () => {
    for (const g of [...grids, dossierGrid({ declared: decl(jacquesReading(), jacquesProfile()), github: gh(jacquesFacts(), JACQUES_AI) })])
      for (const t of allTexts(g)) {
        for (const s of [t.fr, t.en]) {
          expect(s.trim().length, JSON.stringify(t)).toBeGreaterThan(1);
          expect(s, s).not.toMatch(/(^|[\s(])[+−-]\s?\d/);
          expect(s, s).not.toMatch(/undefined|NaN|\{|\}/);
        }
      }
  });

  it("aucun texte ne s'accorde avec la personne", () => {
    const FR = ["il", "elle", "ils", "elles", "lui", "inscrit", "inscrite", "mainteneur", "mainteneuse", "fondateur", "fondatrice", "diplômé", "diplômée", "né", "née", "seul·e", "doué", "douée"];
    const EN = ["he", "she", "his", "her", "him", "himself", "herself"];
    const withData = [
      ...grids,
      githubGrid(gh({ ...strongFacts(), externalMergedPRList: [{ repo: "big/lib", stars: 5000, mergedAt: "2026-01-01T00:00:00Z" }] }, AI5)),
      githubGrid(gh({ ...jacquesFacts(), accomplices: [{ login: "pal", avatarUrl: "" }], externalMergedPRList: [{ repo: "pal/x", stars: 1, mergedAt: "2026-01-01T00:00:00Z" }] }, JACQUES_AI)),
    ];
    for (const g of withData)
      for (const t of allTexts(g)) {
        // « il y a » est impersonnel.
        const words = (s: string) => s.toLowerCase().replace(/\bil y a\b/g, "").split(/[^\p{L}·]+/u);
        expect(words(t.fr).filter((w) => FR.includes(w)), t.fr).toEqual([]);
        expect(words(t.en).filter((w) => EN.includes(w)), t.en).toEqual([]);
      }
  });

  it("même entrée, même sortie", () => {
    expect(githubGrid(gh(jacquesFacts(), JACQUES_AI))).toEqual(githubGrid(gh(jacquesFacts(), JACQUES_AI)));
    expect(declaredGrid(decl(jacquesReading(), jacquesProfile()))).toEqual(declaredGrid(decl(jacquesReading(), jacquesProfile())));
  });
});

describe("l'école ne peut pas faire baisser la note (§4, règle 2)", () => {
  // Écoles inventées, rangées par la liste d'exemple (data/schools.example.json).
  const TIERS: [string, SchoolTier][] = [
    ["Académie Nébuleuse", "S"],
    ["École Orbitale de Lisière", "A"],
    ["École Orbitale de Brume", "B"],
    ["Institut Zéphyr", "C"],
  ];
  const bases: [string, CvReading, FounderProfile | undefined][] = [
    ["Jacques", jacquesReading(), jacquesProfile()],
    ["Lumine", lumineReading(), lumineProfile()],
    ["senior", seniorReading(), fictivaProfile()],
  ];

  it.each(bases)("%s : ajouter une école, quel que soit son rang, ne baisse jamais la note ; la retirer non plus", (_n, r, p) => {
    const none = declaredGrid(decl({ ...r, school_name: "", school_tier: "none" }, p && { ...p, education: [] }));
    for (const [school_name, school_tier] of TIERS) {
      const withSchool = declaredGrid(decl({ ...r, school_name, school_tier }, p));
      expect(withSchool.overall, school_name).toBeGreaterThanOrEqual(none.overall);
      // Le cas du dossier aussi.
      const file = (d: Parameters<typeof dossierGrid>[0]["declared"]) => dossierGrid({ declared: d, github: gh(jacquesFacts(), JACQUES_AI) }).overall;
      expect(file(decl({ ...r, school_name, school_tier }, p))).toBeGreaterThanOrEqual(file(decl({ ...r, school_name: "", school_tier: "none" }, p && { ...p, education: [] })));
    }
  });

  it("le rang de l'école donne la note, il ne s'écrit nulle part dans la grille (§18.48)", () => {
    const scores: number[] = [];
    for (const [school_name, school_tier] of TIERS) {
      const g = declaredGrid(decl({ ...lumineReading(), school_name, school_tier, selection_signals: [] }, undefined));
      const edu = crit(g, "EDU");
      scores.push(edu.score!);
      expect(JSON.stringify(g), school_name).not.toMatch(SCHOOL_RANK_RE);
      expect(edu.reached, school_name).toEqual(schoolCounted(school_name));
    }
    expect(scores).toEqual([10, 8, 6, 4]);
  });

  it("une personne sans école a exactement la moyenne de ses autres critères", () => {
    const g = declaredGrid(decl({ ...seniorReading(), school_name: "", school_tier: "none" }, fictivaProfile()));
    expect(crit(g, "EDU").state).toBe("missing");
    const others = g.criteria.filter((c) => c.counted);
    const w = (c: GridCriterion) => GRID.weights[c.code];
    const mean = others.reduce((s, c) => s + c.score! * w(c), 0) / others.reduce((s, c) => s + w(c), 0);
    expect(g.overall).toBe(Math.min(GRID.final.capUnproven, Math.round(mean * 10)));
  });

  it("un semestre d'échange n'est pas lu ici : seule l'école retenue par la lecture compte", () => {
    const g = declaredGrid(decl(lumineReading(), lumineProfile()));
    expect(crit(g, "EDU").reached.fr).toBe("CentraleSupélec\u00a0: au dossier.");
  });
});

describe("l'expérience se compte en code, poste par poste (§3.2)", () => {
  const role = (title: string, company: string, start: string, end: string | null): DatedRole => ({ title, company, start, end });
  const months = (roles: DatedRole[]) => countedMonths(analyzeRoles(roles, NOW));

  it("un stage compte pour moitié, une association étudiante pour zéro, deux postes simultanés une fois", () => {
    expect(months([role("Stagiaire développeur", "Acme", "2025-01", "2025-07")])).toBe(3);
    expect(months([role("Software engineering intern", "Acme", "2025-01", "2025-07")])).toBe(3);
    expect(months([role("Alternant", "Acme", "2024-01", "2025-01")])).toBe(6);
    expect(months([role("Développeur", "Acme", "2025-01", "2025-07")])).toBe(6);
    expect(months([role("Trésorier", "BDE Centrale", "2024-01", "2025-01")])).toBe(0);
    expect(months([role("Trésorier", "Centrale Méditerranée Finance", "2024-01", "2025-01")])).toBe(0);
    expect(months([role("Président", "Junior Institut Zéphyr", "2024-01", "2025-01")])).toBe(0);
    // L'école elle-même, ou un poste de recherche dans une de ses associations, reste un poste.
    expect(months([role("Doctorant", "Centrale Méditerranée", "2024-01", "2025-01")])).toBe(12);
    expect(months([role("Chercheur", "CentraleSupélec Robotique", "2024-01", "2025-01")])).toBe(12);
    // Deux postes en même temps : une seule fois, au taux le plus fort.
    expect(months([role("Développeur", "A", "2025-01", "2025-07"), role("Freelance", "B", "2025-03", "2025-09")])).toBe(8);
    expect(months([role("Développeur", "A", "2025-01", "2025-07"), role("Stagiaire", "B", "2025-01", "2025-07")])).toBe(6);
    // Le type de contrat, quand le fournisseur le donne (tâche 1), prime sur l'intitulé.
    expect(months([{ ...role("Développeur", "Acme", "2025-01", "2025-07"), contract: "internship" }])).toBe(3);
  });

  it("changer les années d'études ne change pas l'expérience ; changer l'ordre des postes non plus", () => {
    const base = declaredGrid(decl(jacquesReading(), jacquesProfile()));
    const p = jacquesProfile();
    const studies = { ...p, education: p.education.map((e) => ({ ...e, start: 2015, end: 2018 })) };
    expect(crit(declaredGrid(decl(jacquesReading(), studies)), "XP")).toEqual(crit(base, "XP"));
    const shuffled = { ...p, roles: [p.roles[2], p.roles[0], p.roles[3], p.roles[1]] };
    expect(crit(declaredGrid(decl(jacquesReading(), shuffled)), "XP").score).toBe(crit(base, "XP").score);
    expect(declaredGrid(decl(jacquesReading(), shuffled)).overall).toBe(base.overall);
    // Les années que l'IA compte ne comptent pas.
    expect(crit(declaredGrid(decl({ ...jacquesReading(), years_declared: 12 }, p)), "XP").score).toBe(3);
  });

  it("sans poste daté : des années affirmées, arrêtées à 5 ; sans LinkedIn : GitHub estime, arrêté à 8", () => {
    const claimed = declaredGrid(decl(cvReading({ years_declared: 12, roles: [{ title: "Dev", company: "X", start: null, end: null, responsibilities: [] }] })));
    expect([score(claimed, "XP"), crit(claimed, "XP").state]).toEqual([5, "declared"]);
    expect(score(githubGrid(gh(strongFacts(), AI5)), "XP")).toBe(GRID.XP.githubCap);
  });
});

describe("les plafonds (§4, règles 3 et 4)", () => {
  it("LinkedIn seul ne dépasse jamais 85", () => {
    const best = declaredGrid(
      decl(
        seniorReading({
          school_name: "École polytechnique",
          school_tier: "S",
          projects_with_dated_outcome: 9,
          roles: [
            { title: "Head of engineering", company: "Fictiva Labs", start: "2012-01", end: null, responsibilities: ["TypeScript React PostgreSQL Kafka Terraform"], employer_type: "scaleup" },
            { title: "Engineer", company: "Fictiva Labs", start: "2008-01", end: "2011-12", responsibilities: [] },
          ],
        }),
        { ...fictivaProfile(), roles: [{ title: "Head of engineering", company: "Fictiva Labs", start: "2012-01", end: null }, { title: "Engineer", company: "Fictiva Labs", start: "2008-01", end: "2011-12" }] },
      ),
    );
    expect(best.overall).toBeLessThanOrEqual(85);
    expect(best.rule).toBe("capped_unproven");
  });

  it("GitHub seul peut dépasser 90", () => {
    const g = githubGrid(gh(strongFacts(), AI5));
    expect(g.overall).toBeGreaterThan(90);
    expect(scores(g)).toMatchObject({ STK: 10, CODE: 10, ACT: 10, OWN: 10, OSS: 10 });
  });

  it("un GitHub de moins de 3 dépôts sans commit donne 20 seul, et ne baisse pas la note d'un dossier", () => {
    const thin = facts({
      repos: [repo("a", { commitCount: 0, language: null, languages: {} }), repo("b", { commitCount: 0, language: null, languages: {} })],
      repoCount: 2,
      activeRepos: ["a", "b"],
      calendar: { available: true, weeksActive: 1, weeks: 52, totalContributions: 1 },
      activityByYear: [{ yearsAgo: 0, contributions: 1 }],
      externalMergedPRs: 0,
      firstRealCommit: null,
      commits: [],
    });
    const alone = githubGrid(gh(thin));
    expect([alone.overall, alone.rule]).toEqual([20, "empty_file"]);
    for (const [r, p] of [
      [jacquesReading(), jacquesProfile()],
      [seniorReading(), fictivaProfile()],
    ] as const) {
      const d = declaredGrid(decl(r, p), gh(thin));
      expect(dossierGrid({ declared: decl(r, p), github: gh(thin) }).overall).toBe(d.overall);
    }
  });
});

describe("les traces dans le code (§3.4)", () => {
  it("une techno absente de la table n'est jamais dite « à confirmer »", () => {
    const named = ["Zorglub", "Frobnicator", "Quux DB", "InternalTool", "Proprio", "Kafka-like"];
    const r = cvReading({ technos_listed: named, technos_described: [] });
    expect(stackFlags(decl(r), gh(facts())).filter((x) => /^À confirmer/.test(x.fr))).toEqual([]);
    // Cinq technos de la table, dont quatre absentes du code, plus six hors table : seules les cinq comptent, et seules les absentes sont citées.
    const mixed = cvReading({ technos_listed: [...named, "Kubernetes", "Redis", "MongoDB", "Terraform", "TypeScript"], technos_described: [] });
    const flag = stackFlags(decl(mixed), gh(facts())).find((x) => /^À confirmer/.test(x.fr))!;
    expect(flag.fr).toBe("À confirmer\u00a0: Kubernetes, Redis, MongoDB. Déclarées sur le CV, pas encore visibles dans 5 repos publics.");
    expect(flag.en).toBe("To confirm: Kubernetes, Redis, MongoDB. Listed on the résumé, not visible yet in 5 public repos.");
    for (const n of named) expect(flag.fr).not.toContain(n);
  });

  it("des technos vérifiables absentes du code : « À confirmer », dès la première ; la note ne bouge pas", () => {
    const r = cvReading({ technos_listed: ["Kubernetes", "Terraform", "Redis", "MongoDB", "TypeScript"], technos_described: ["TypeScript", "React"] });
    const flags = stackFlags(decl(r), gh(facts()));
    expect(flags[0].fr).toMatch(/^À confirmer\u00a0: Kubernetes, Terraform, Redis\. Déclarées sur le CV/);
    const withGh = declaredGrid(decl(r), gh(facts()));
    const without = declaredGrid(decl(r));
    expect(crit(withGh, "STK").score).toBe(crit(without, "STK").score);
    expect(withGh.overall).toBe(without.overall);
    // Sans seuil : une techno sur deux absente suffit, la retrouvée n'est pas citée
    const few = cvReading({ technos_listed: ["Kubernetes", "TypeScript"], technos_described: [] });
    expect(stackFlags(decl(few), gh(facts())).filter((x) => /^À confirmer/.test(x.fr)).map((x) => [x.fr, x.en])).toEqual([
      ["À confirmer\u00a0: Kubernetes. Déclarées sur le CV, pas encore visibles dans 5 repos publics.", "To confirm: Kubernetes. Listed on the résumé, not visible yet in 5 public repos."],
    ]);
    // Aucun dépôt public : pas où chercher, rien à confirmer (pas de « 0 dépôt public »)
    expect(stackFlags(decl(few), gh(facts({ repos: [] }))).filter((x) => /^À confirmer/.test(x.fr))).toEqual([]);
    // Tout retrouvé : rien à confirmer
    const all = cvReading({ technos_listed: ["TypeScript"], technos_described: [] });
    expect(stackFlags(decl(all), gh(facts())).filter((x) => /^À confirmer|^To confirm/.test(x.fr))).toEqual([]);
  });

  it("au dossier, sur LinkedIn, deux technos dont une absente : le signal suit la stack, pour la personne seule, et aucune note ne bouge", () => {
    const d = decl(seniorReading({ technos_listed: [], technos_described: ["TypeScript", "Kubernetes"] }), { ...fictivaProfile(), skills: ["TypeScript"] });
    const proven = githubGrid(gh(jacquesFacts(), JACQUES_AI));
    const file = dossierGrid({ declared: d, github: gh(jacquesFacts(), JACQUES_AI) });
    const flag = crit(file, "STK").flags.find((x) => /^À confirmer/.test(x.fr))!;
    expect(flag.fr).toMatch(/^À confirmer\u00a0: Kubernetes\. Déclarées sur LinkedIn, pas encore visibles dans \d+ repos? publics?\.$/);
    expect(flag.fr).not.toContain("TypeScript");
    // Le signal ne note rien : la stack du dossier est celle que GitHub prouve.
    expect(score(file, "STK")).toBe(score(githubGrid(gh(jacquesFacts(), JACQUES_AI), file.seniority), "STK"));
    expect(score(proven, "STK")).not.toBeNull();
    const pub = publicGrid(file).criteria.find((c) => c.code === "STK")!;
    expect(JSON.stringify(pub)).not.toMatch(/À confirmer|To confirm/);
  });

  it("le code prouve une techno que le LinkedIn ne nomme pas : « Stack prouvée au-delà du profil »", () => {
    const r = jacquesReading();
    const flags = stackFlags(decl({ ...r, technos_listed: ["TypeScript"], technos_described: [] }, { ...jacquesProfile(), skills: [] }), gh(jacquesFacts()));
    expect(flags.map((x) => x.fr)).toContain("Stack prouvée au-delà du profil\u00a0: Agda.");
    expect(flags.map((x) => x.en)).toContain("Stack proven beyond the profile: Agda.");
  });
});

describe("données de la tâche 1, facultatives", () => {
  it("sans elles, les niveaux restent fermés ; avec elles, ils s'ouvrent", () => {
    // Open source : la destination des PR ouvre le niveau 8.
    const f0 = jacquesFacts();
    expect(score(githubGrid(gh(f0, JACQUES_AI)), "OSS")).toBe(6);
    const withDest = { ...f0, externalMergedPRList: [{ repo: "agda/agda-stdlib", stars: 1100, mergedAt: "2025-11-03T10:00:00Z" }] };
    const oss = crit(githubGrid(gh(withDest, JACQUES_AI)), "OSS");
    expect(oss.score).toBe(8);
    expect(oss.evidence?.text.fr).toBe("1 PR fusionnée dans agda/agda-stdlib, la dernière en novembre 2025.");
    // PR entre proches : comptées jusqu'au niveau 4.
    const friends = { ...f0, accomplices: [{ login: "lumbuilds0", avatarUrl: "" }], externalMergedPRList: [{ repo: "LumBuilds0/app", stars: 3, mergedAt: "2026-01-01T00:00:00Z" }] };
    const fo = crit(githubGrid(gh(friends, JACQUES_AI)), "OSS");
    expect(fo.score).toBe(4);
    expect(fo.flags[0].fr).toMatch(/^PR entre proches/);

    // Parcours : sans type d'employeur ni liste, deux ans d'un poste donnent 6 ; scale-up lue par l'IA, 8 ; liste et trajectoire, 10.
    const plain = cvReading({ roles: [] });
    const roles: DatedRole[] = [
      { title: "Software engineer", company: "Fictiva Labs", start: "2019-01", end: "2022-12" },
      { title: "Staff engineer", company: "Fictiva Labs", start: "2023-01", end: null },
    ];
    expect(score(declaredGrid(decl(plain, { roles, education: [], skills: [] })), "EMP")).toBe(6);
    expect(score(declaredGrid(decl(seniorReading(), { roles, education: [], skills: [] })), "EMP")).toBe(8);
    expect(score(declaredGrid(declaredInput(seniorReading(), { profile: { roles }, now: NOW, highBar: EXAMPLE_HIGH_BAR })), "EMP")).toBe(10);

    // École : un signal de sélection avec son extrait ; sans extrait, rien.
    const sig = (quote: string): CvReading => ({ ...cvReading(), selection_signals: [{ kind: "international_medal", quote }] });
    expect(score(declaredGrid(decl(sig("Médaille d'or à l'IOI 2019"))), "EDU")).toBe(10);
    expect(score(declaredGrid(decl(sig(""))), "EDU")).toBeNull();
  });
});

describe("des débuts de carrière différents n'ont plus la même note (les trois « 38 » du 19 novembre, SPEC §18.84)", () => {
  // Sous 0.4.0, ces cinq profils LinkedIn valaient tous 38 : expérience 2 (moins d'un an, quel que
  // soit le poste), parcours 4 (deux stages comme dix mois de CDI), école 6 (hors liste, arrêtée là) ;
  // la stack et l'ownership déclarés, à 4, ne déplaçaient pas l'arrondi (3,75 ; 3,82 ; 3,85).
  const NOW_19 = Date.parse("2026-11-19T12:00:00Z");
  const role = (title: string, company: string, start: string, end: string | null, extra: Partial<DatedRole> = {}): DatedRole => ({ title, company, start, end, ...extra });
  const early = (roles: DatedRole[], described: string[] = [], outcomes = 0) =>
    declaredGrid(
      declaredInput(
        cvReading({ roles: [], technos_described: described, technos_listed: described, projects_with_dated_outcome: outcomes, school_name: "Université de Nantes", school_tier: "B", years_declared: 0, seniority_claimed: "junior" }),
        { profile: { roles, education: [], skills: [] }, now: NOW_19, highBar: EXAMPLE_HIGH_BAR },
      ),
    );
  const twoInternships = early([role("Stagiaire développeur", "Atelier Brume", "2026-02", "2026-08"), role("Software Engineer Intern", "Acme", "2025-06", "2025-09")], ["React", "Python"]);
  const shortJobAndInternship = early([role("Développeur", "Conseil Grand Large", "2026-03", null), role("Stagiaire", "Usine Navale", "2025-03", "2025-09")], ["Java", "Spring", "SQL"], 1);
  const apprentice = early([role("Alternant développeur", "Opérateur Télécom", "2025-09", null), role("Stagiaire", "Acme", "2025-04", "2025-08")]);
  const tenMonthsAnywhere = early([role("Software Engineer", "Conseil Grand Large", "2026-01", null)]);
  const tenMonthsHighBar = early([role("Software Engineer", "Fictiva Labs", "2026-01", null)], ["Go", "Kafka", "React"], 2);
  const all = [twoInternships, shortJobAndInternship, apprentice, tenMonthsAnywhere, tenMonthsHighBar];

  it("cinq débuts de carrière, moins d'un an comptés chacun : plus une seule et même note, et plus 38", () => {
    const notes = all.map((g) => g.overall);
    expect(notes).not.toEqual([38, 38, 38, 38, 38]);
    // Deux stages, un premier poste : 60. Dix-huit mois d'alternance et de stage : 70. Dix mois chez un employeur très sélectif : 85, le plafond sans code prouvé.
    expect(notes).toEqual([60, 60, 70, 60, 85]);
    for (const g of all) expect(g.seniority?.code).toBe("student");
  });

  // Les deux fiches réelles du 19 novembre, telles que la prod les a lues (école de rang B, 6).
  it("18 mois de stage et d'alternance (0,8 an compté, LinkedIn seul) : 38 sous 0.4.0, 70 et quatre étoiles", () => {
    const g = early([role("Alternant ingénieur logiciel", "Opérateur Télécom", "2025-09", "2026-09"), role("Stagiaire développeur", "Atelier Brume", "2025-02", "2025-08")]);
    expect(sp(crit(g, "XP").evidence?.text.fr)).toMatch(/^0,8 an compté, poste par poste\. 18 mois de stage ou d'alternance comptés pour moitié\./);
    expect(g.seniority).toEqual({ code: "student", months: 9, source: "linkedin" });
    expect(scores(g)).toMatchObject({ EDU: 6, XP: 2, EMP: 7 });
    expect(sp(crit(g, "EMP").reached.fr)).toBe("18 mois de stage ou d'alternance cumulés.");
    expect(g.overall).toBe(70);
    expect(starsFor(g.overall)).toBe(4);
  });

  it("8 mois de stage (0,3 an compté) : la note suit ce que valent les stages, de 50 à 85", () => {
    const one = early([role("Stagiaire développeur", "Atelier Brume", "2026-01", "2026-09")]);
    const two = early([role("Stagiaire développeur", "Atelier Brume", "2026-03", "2026-09"), role("Stagiaire", "Usine Navale", "2025-06", "2025-08")]);
    const product = early([role("Stagiaire développeur", "Atelier Brume", "2026-03", "2026-09", { employerType: "startup" }), role("Stagiaire", "Usine Navale", "2025-06", "2025-08")]);
    const highBar = early([role("Software Engineer Intern", "Fictiva Labs", "2026-03", "2026-09"), role("Stagiaire", "Usine Navale", "2025-06", "2025-08")]);
    for (const g of [one, two, product, highBar]) expect(g.seniority).toMatchObject({ code: "student", months: 4 });
    expect([one, two, product, highBar].map((g) => score(g, "EMP"))).toEqual([5, 6, 7, 10]);
    expect([one, two, product, highBar].map((g) => g.overall)).toEqual([53, 60, 70, 85]);
    expect(sp(crit(highBar, "EMP").reached.fr)).toBe("Un stage ou une alternance de 6 mois chez Fictiva Labs, employeur très sélectif à l'embauche.");
  });

  it("le parcours se lit à ce niveau : dix mois chez un employeur très sélectif passent devant dix mois ailleurs, qui passent devant un stage long", () => {
    expect(score(tenMonthsHighBar, "EMP")).toBeGreaterThan(score(tenMonthsAnywhere, "EMP")!);
    expect(tenMonthsHighBar.overall).toBeGreaterThan(tenMonthsAnywhere.overall);
    const oneInternship = early([role("Stagiaire développeur", "Atelier Brume", "2026-02", "2026-08")]);
    expect(score(tenMonthsAnywhere, "EMP")).toBeGreaterThan(score(oneInternship, "EMP")!);
    expect(score(twoInternships, "EMP")).toBeGreaterThan(score(oneInternship, "EMP")!);
  });

  it("les années ne sont plus une note dans la moyenne : l'expérience donne le niveau, hors moyenne", () => {
    expect(GRID.weights.XP).toBe(0);
    for (const g of all) expect(crit(g, "XP").counted).toBe(false);
  });
});
