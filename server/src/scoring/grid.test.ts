// Barème de recrutement (docs/bareme-recrutement.md §8, « Tâche 2 ») : les tests
// d'acceptation du moteur, sur des faits synthétiques et sur les deux fondateurs.

import { describe, expect, it } from "vitest";
import type { CodeReadingResult, CvReading, SchoolTier } from "../../../shared/readings";
import { CRITERION_CODES, type CriterionCode, type Fact, type Grid, type GridCriterion } from "../../../shared/types";
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
  caseGrid,
  countedMonths,
  declaredGrid,
  declaredInput,
  finalize,
  githubGrid,
  stackFlags,
  type DatedRole,
} from "./grid";
import employersExample from "../../../data/employers.example.json";
import { parseEmployers, type HighBarList } from "./employers";

const NOW = Date.parse(FOUNDERS_NOW);
/** La liste d'exemple aux noms inventés (data/employers.example.json), lue par le chargeur du serveur. */
const EXAMPLE_HIGH_BAR: HighBarList = { employers: parseEmployers(employersExample), source: "data/employers.example.json" };
const gh = (f: GithubFacts, ai: CodeReadingResult | null = null) => ({ facts: f, m: deriveGithub(f), ai });
const decl = (r: CvReading, p?: FounderProfile, now = NOW) => declaredInput(r, { profile: p, now });
const score = (g: Grid, code: CriterionCode) => g.criteria.find((c) => c.code === code)!.score;
const crit = (g: Grid, code: CriterionCode) => g.criteria.find((c) => c.code === code)!;
const scores = (g: Grid) => Object.fromEntries(g.criteria.map((c) => [c.code, c.score]));

/** Toutes les notes possibles d'un critère, lues dans sa table. */
const TABLE: Record<CriterionCode, number[]> = {
  EDU: [...Object.values(GRID.EDU.tiers), ...Object.values(GRID.EDU.selection), GRID.EDU.githubScore],
  XP: GRID.XP.levels.map((l) => l.score),
  EMP: GRID.EMP.levels.map((l) => l.score),
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
  const jCase = caseGrid(jLinkedin, jGithub);
  const lGithub = githubGrid(gh(lumineFacts()));
  const lLinkedin = declaredGrid(decl(lumineReading(), lumineProfile()), gh(lumineFacts()));
  const lCase = caseGrid(lLinkedin, lGithub);

  it("Jacques : LinkedIn 41, GitHub 61, dossier 57", () => {
    expect(scores(jLinkedin)).toEqual({ EDU: 6, XP: 3, EMP: 4, STK: null, CODE: null, ACT: null, OWN: 4, OSS: null });
    expect(scores(jGithub)).toEqual({ EDU: null, XP: 4, EMP: null, STK: 6, CODE: 7, ACT: 8, OWN: 6, OSS: 6 });
    expect(scores(jCase)).toEqual({ EDU: 6, XP: 3, EMP: 4, STK: 6, CODE: 7, ACT: 8, OWN: 6, OSS: 6 });
    expect(jLinkedin.overall).toBe(41);
    expect(jGithub.overall).toBe(61);
    expect(jCase.overall).toBe(57);
    // L'open source (6) n'est pas au-dessus de 6,1 sur la fiche GitHub : hors moyenne. Au-dessus de 5,6 au dossier : dedans.
    expect(crit(jGithub, "OSS").counted).toBe(false);
    expect(crit(jCase, "OSS").counted).toBe(true);
    expect(crit(jCase, "EDU").counted).toBe(true);
    expect(jLinkedin.rule).toBe("capped_unproven");
    expect(jGithub.rule).toBeUndefined();
  });

  it("Lumine : LinkedIn 45, GitHub 20 (dossier vide), dossier 45 « code non prouvé »", () => {
    expect(scores(lLinkedin)).toEqual({ EDU: 8, XP: 3, EMP: 4, STK: null, CODE: null, ACT: null, OWN: 4, OSS: null });
    expect(lLinkedin.overall).toBe(45);
    expect(lGithub.overall).toBe(20);
    expect(lGithub.rule).toBe("empty_file");
    expect(lGithub.criteria.every((c) => c.score === null && !c.counted)).toBe(true);
    expect(lCase.overall).toBe(45);
    expect(lCase.rule).toBe("capped_unproven");
    expect(crit(lCase, "STK").state).toBe("unproven");
    expect(crit(lCase, "ACT").state).toBe("unproven");
  });

  it("les pièces se lisent poste par poste, avec les chiffres de la personne", () => {
    expect(crit(jLinkedin, "XP").evidence?.text.fr).toBe(
      "13 mois de stage ou d'alternance comptés pour moitié. 7 mois à la tête d'Azerit. Centrale Méditerranée Finance est une association : non compté. Total : 1,1 an.",
    );
    expect(crit(jLinkedin, "EMP").next?.fr).toBe("Pour 6 : tenir Azerit un an (7 mois aujourd'hui), ou un poste tenu deux ans.");
    expect(crit(jGithub, "STK").next?.fr).toBe("Pour 8 : 500 commits dans ton langage principal (tu en as 329).");
    expect(crit(jGithub, "STK").evidence?.text.fr).toMatch(/^TypeScript : 329 commits dans 7 dépôts depuis novembre 2024, dernier push hier \(sequence-mail\)\. Agda aussi dans le code\.$/);
    expect(crit(jGithub, "CODE").reached.fr).toBe("Niveau moyen lu 3,6 sur 5, sur 3 dépôts.");
    expect(crit(jGithub, "CODE").evidence?.text.fr).toMatch(/^sequence-mail, `src\/services\/outreach\.test\.ts` : niveau 4 sur 5\./);
    expect(crit(jGithub, "CODE").evidence?.proof).toBe("https://github.com/jmougeot/sequence-mail/blob/main/src/services/outreach.test.ts");
    expect(crit(jGithub, "ACT").next?.fr).toBe("Pour 10 : 48 semaines actives (tu en as 43).");
    expect(crit(jGithub, "OSS").next?.fr).toMatch(/La destination des PR n'est pas encore lue\.$/);
    expect(crit(jGithub, "XP").reached.fr).toMatch(/^Estimée : 2 années actives/);
  });

  it("la comparaison garde les deux notes de chaque critère, et retient le prouvé", () => {
    const own = crit(jCase, "OWN");
    expect([own.declared, own.proven, own.score, own.source]).toEqual([4, 6, 6, "both"]);
    const stk = crit(jCase, "STK");
    expect([stk.declared, stk.proven, stk.score, stk.source]).toEqual([null, 6, 6, "github"]);
    const xp = crit(jCase, "XP");
    expect([xp.declared, xp.proven, xp.score, xp.source]).toEqual([3, 4, 3, "linkedin"]);
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
    // Sans l'école ni l'open source : (8 × 2 + 6 × 1,5 + 4 × 1,5 + 4 × 1,5 + 10 + 2) ÷ 8,5 = 49 ÷ 8,5 = 5,76.
    // École 4 sous 5,76 : dehors. Open source 8 au-dessus : dedans, 53 ÷ 9 = 5,89 → 59.
    const g = finalize([c("EDU", 4), c("XP", 4), c("EMP", 4), c("STK", 6), c("CODE", 8), c("ACT", 10), c("OWN", 2), c("OSS", 8)]);
    expect(g.overall).toBe(59);
    expect(g.criteria.filter((x) => !x.counted).map((x) => x.code)).toEqual(["EDU"]);
    // Arrondi au supérieur à ,5 : 56,5 → 57 (l'exemple du §7).
    expect(finalize([c("EDU", 6), c("XP", 3), c("EMP", 4), c("STK", 6), c("CODE", 7), c("ACT", 8), c("OWN", 6), c("OSS", 6)]).overall).toBe(57);
    // Rien n'est ajouté à une base : tous les critères à n donnent 10 × n.
    for (const n of [2, 5, 8]) expect(finalize(CRITERION_CODES.map((k) => c(k, n))).overall).toBe(10 * n);
  });

  it("un chef d'accusation ne change aucune note", () => {
    const g = githubGrid(gh(jacquesFacts(), JACQUES_AI));
    const flagged: Grid = { ...g, criteria: g.criteria.map((c) => ({ ...c, flags: [...c.flags, { fr: "Chef", en: "Charge" }] })) };
    expect(finalize(flagged.criteria).overall).toBe(g.overall);
    // Senior sur parole : le chef sort, l'expérience reste celle des postes.
    const r = cvReading({ roles: [{ title: "Senior developer", company: "Acme", start: "2025-01", end: null, responsibilities: [] }] });
    const p = declaredGrid(decl(r));
    expect(crit(p, "XP").flags[0].fr).toMatch(/^Senior sur parole/);
    expect(score(p, "XP")).toBe(3);
  });

  it("aucun texte ne se lit « +n » ou « −n », tout existe en français et en anglais", () => {
    for (const g of [...grids, caseGrid(grids[4], grids[0])])
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
  const TIERS: [string, SchoolTier][] = [
    ["École polytechnique", "S"],
    ["CentraleSupélec", "A"],
    ["Centrale Méditerranée", "B"],
    ["IUT de Lannion", "C"],
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
      const proof = githubGrid(gh(jacquesFacts(), JACQUES_AI));
      expect(caseGrid(withSchool, proof).overall).toBeGreaterThanOrEqual(caseGrid(none, proof).overall);
    }
  });

  it("une personne sans école a exactement la moyenne de ses autres critères", () => {
    const g = declaredGrid(decl({ ...seniorReading(), school_name: "", school_tier: "none" }, fictivaProfile()));
    expect(crit(g, "EDU").state).toBe("missing");
    const others = g.criteria.filter((c) => c.score !== null);
    const w = (c: GridCriterion) => GRID.weights[c.code];
    const mean = others.reduce((s, c) => s + c.score! * w(c), 0) / others.reduce((s, c) => s + w(c), 0);
    expect(g.overall).toBe(Math.min(GRID.final.capUnproven, Math.round(mean * 10)));
  });

  it("un semestre d'échange n'est pas lu ici : seule l'école retenue par la lecture compte", () => {
    const g = declaredGrid(decl(lumineReading(), lumineProfile()));
    expect(crit(g, "EDU").reached.fr).toBe("CentraleSupélec, rang A.");
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
    expect(months([role("Président", "Junior ISEP", "2024-01", "2025-01")])).toBe(0);
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
      expect(caseGrid(d, alone).overall).toBe(d.overall);
    }
  });
});

describe("les traces dans le code (§3.4)", () => {
  it("une techno absente de la table n'est jamais dite « sans trace »", () => {
    const named = ["Zorglub", "Frobnicator", "Quux DB", "InternalTool", "Proprio", "Kafka-like"];
    const r = cvReading({ technos_listed: named, technos_described: [] });
    expect(stackFlags(decl(r), gh(facts())).filter((x) => /sans trace/.test(x.fr))).toEqual([]);
    // Cinq technos de la table, dont quatre absentes du code, plus six hors table : seules les cinq comptent, et seules les absentes sont citées.
    const mixed = cvReading({ technos_listed: [...named, "Kubernetes", "Redis", "MongoDB", "Terraform", "TypeScript"], technos_described: [] });
    const flag = stackFlags(decl(mixed), gh(facts())).find((x) => /sans trace/.test(x.fr))!;
    expect(flag.fr).toBe("Stack déclarée, sans trace publique : Kubernetes, Redis, MongoDB, aucune trace dans 5 dépôts.");
    for (const n of named) expect(flag.fr).not.toContain(n);
  });

  it("cinq technos vérifiables, moins d'un tiers retrouvées : « Stack déclarée, sans trace publique » ; la note ne bouge pas", () => {
    const r = cvReading({ technos_listed: ["Kubernetes", "Terraform", "Redis", "MongoDB", "TypeScript"], technos_described: ["TypeScript", "React"] });
    const flags = stackFlags(decl(r), gh(facts()));
    expect(flags[0].fr).toMatch(/^Stack déclarée, sans trace publique : Kubernetes, Terraform, Redis/);
    const withGh = declaredGrid(decl(r), gh(facts()));
    const without = declaredGrid(decl(r));
    expect(crit(withGh, "STK").score).toBe(crit(without, "STK").score);
    expect(withGh.overall).toBe(without.overall);
  });

  it("le code prouve une techno que le LinkedIn ne nomme pas : « LinkedIn en dessous de la vérité »", () => {
    const r = jacquesReading();
    const flags = stackFlags(decl({ ...r, technos_listed: ["TypeScript"], technos_described: [] }, { ...jacquesProfile(), skills: [] }), gh(jacquesFacts()));
    expect(flags.map((x) => x.fr)).toContain("LinkedIn en dessous de la vérité : Agda prouvé par le code, absent de LinkedIn.");
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
