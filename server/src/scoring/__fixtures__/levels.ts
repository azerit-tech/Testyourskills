// Les dossiers de référence du barème 0.5.0 (SPEC §18.82) : la note dit « quel
// niveau pour cette expérience ». Personnes inventées, au 19 novembre 2026.
//
//   (a) un début de carrière : un stage de 6 mois chez un employeur très sélectif
//       (liste d'exemple du dépôt) et un GitHub correct ;
//   (b) le même, le stage dans une entreprise que rien ne distingue ;
//   (c) douze ans dans le même poste, sans progression, et un GitHub médiocre ;
//   (d) le profil type : une école d'ingénieurs, deux stages dont six mois dans
//       une startup de produit, et un GitHub de quelques commits de cours.

import type { CodeReadingResult, CvReading } from "../../../../shared/readings";
import type { GithubFacts } from "../../github/facts";
import type { DatedRole } from "../grid";
import { cvReading, facts, repo, tree } from "./make";

export const LEVELS_NOW = "2026-11-19T12:00:00Z";

export interface LevelProfile {
  roles: DatedRole[];
  education: { school: string; degree: string; field: string; start: number | null; end: number | null }[];
  skills: string[];
}

const profile = (roles: DatedRole[]): LevelProfile => ({ roles, education: [], skills: [] });
const python = (name: string, commitCount: number, p: Parameters<typeof repo>[1] = {}) =>
  repo(name, { fullName: `dev/${name}`, language: "Python", languages: { Python: commitCount * 1500 }, commitCount, ...p });

// --- (a) et (b) : un début de carrière ------------------------------------------------

/** Le stage de fin d'études, six mois : chez `company`. */
export const internProfile = (company: string): LevelProfile => profile([{ title: "Software Engineer Intern", company, start: "2026-03", end: "2026-09" }]);

export function studentReading(p: Partial<CvReading> = {}): CvReading {
  return cvReading({
    full_name: "Sacha Brémond",
    years_declared: 0,
    seniority_claimed: "junior",
    roles: [],
    technos_listed: ["Python"],
    technos_described: [],
    tests_ci_review_mentions: [],
    projects_with_dated_outcome: 0,
    school_name: "Université de Nantes",
    school_tier: "B",
    ...p,
  });
}

/** Un GitHub correct pour quelqu'un qui débute : Python, 150 commits dans 3 dépôts depuis 14 mois, un projet de 5 mois avec ses tests et sa CI, 20 semaines actives. */
export function studentFacts(): GithubFacts {
  const repos = [
    python("projet-ml", 70, { activity: 30, createdAt: "2026-02-01T10:00:00Z", pushedAt: "2026-07-05T10:00:00Z" }),
    python("api-notes", 50, { activity: 12, createdAt: "2025-09-10T10:00:00Z", pushedAt: "2025-12-20T10:00:00Z" }),
    python("algo", 30, { activity: 8, createdAt: "2025-10-01T10:00:00Z", pushedAt: "2026-10-15T10:00:00Z" }),
  ];
  return facts({
    login: "sacha-bremond",
    collectedAt: LEVELS_NOW,
    profile: { ...facts().profile, login: "sacha-bremond", name: "Sacha Brémond", company: null, createdAt: "2025-09-01T10:00:00Z", publicRepos: repos.length },
    repos,
    repoCount: repos.length,
    activeRepos: repos.map((r) => r.name),
    trees: [tree("projet-ml", { hasCi: true, hasTests: true }), tree("api-notes", { hasCi: false, hasTests: true }), tree("algo", { hasCi: false, hasTests: false, tooling: [] })],
    calendar: { available: true, weeksActive: 20, weeks: 52, totalContributions: 260 },
    activityByYear: [
      { yearsAgo: 0, contributions: 260 },
      { yearsAgo: 1, contributions: 40 },
    ],
    externalMergedPRs: 0,
    firstRealCommit: { repo: "api-notes", date: "2025-09-10T10:00:00Z" },
  });
}

/** Niveau lu 3 sur 5 : structuré et maintenable. */
export const STUDENT_AI: CodeReadingResult = {
  readings: [
    { repo: "projet-ml", level: 3, evidence_file: "src/train.py", evidence_quote: "def train(config: Config) -> Model:", observed_traits: [] },
    { repo: "api-notes", level: 3, evidence_file: "app/main.py", evidence_quote: "@app.get('/notes')", observed_traits: [] },
  ],
  ai_status: null,
};

// --- (c) : douze ans, des preuves médiocres ---------------------------------------------

export const plainSeniorProfile = (): LevelProfile => profile([{ title: "Développeur", company: "Banque Orsay", start: "2014-09", end: null }]);

export function plainSeniorReading(): CvReading {
  return studentReading({ full_name: "Dominique Vasseur", years_declared: 12, seniority_claimed: "senior", technos_listed: ["Java", "SQL"] });
}

/** Java, 80 commits dans 2 dépôts, rien de poussé depuis dix mois, ni tests ni CI, 6 semaines actives. */
export function mediocreFacts(): GithubFacts {
  const java = (name: string, commitCount: number, p: Parameters<typeof repo>[1] = {}) =>
    repo(name, { fullName: `dvasseur/${name}`, language: "Java", languages: { Java: commitCount * 2000 }, commitCount, ...p });
  const repos = [
    java("outils", 60, { activity: 6, createdAt: "2024-01-10T10:00:00Z", pushedAt: "2026-01-15T10:00:00Z" }),
    java("essais", 20, { activity: 1, createdAt: "2023-05-02T10:00:00Z", pushedAt: "2023-08-20T10:00:00Z" }),
  ];
  return facts({
    login: "dvasseur",
    collectedAt: LEVELS_NOW,
    profile: { ...facts().profile, login: "dvasseur", name: "Dominique Vasseur", company: null, createdAt: "2016-03-01T10:00:00Z", publicRepos: repos.length },
    repos,
    repoCount: repos.length,
    activeRepos: ["outils"],
    trees: [tree("outils", { hasCi: false, hasTests: false, tooling: [] })],
    calendar: { available: true, weeksActive: 6, weeks: 52, totalContributions: 40 },
    activityByYear: [
      { yearsAgo: 0, contributions: 40 },
      { yearsAgo: 1, contributions: 70 },
      { yearsAgo: 2, contributions: 55 },
    ],
    externalMergedPRs: 0,
    firstRealCommit: { repo: "essais", date: "2023-05-02T10:00:00Z" },
  });
}

/** Niveau lu 2 sur 5 : fonctionnel mais brut. */
export const MEDIOCRE_AI: CodeReadingResult = {
  readings: [{ repo: "outils", level: 2, evidence_file: "src/Main.java", evidence_quote: "System.out.println(result);", observed_traits: [] }],
  ai_status: null,
};

// --- (d) : le profil type, une école d'ingénieurs et deux stages -----------------------

/** Deux stages : six mois dans une startup de produit, deux mois ailleurs. `good: false` : les deux dans des entreprises que rien ne distingue. */
export const engineeringStudentProfile = (good = true): LevelProfile =>
  profile([
    { title: "Stagiaire ingénieur logiciel", company: "Atelier Brume", start: "2026-03", end: "2026-09", ...(good ? { employerType: "startup" as const } : {}) },
    { title: "Stagiaire développeur", company: "Usine Navale", start: "2025-06", end: "2025-08" },
  ]);

export function engineeringStudentReading(): CvReading {
  return studentReading({ full_name: "Alix Ferrand", school_name: "Centrale Méditerranée", school_tier: "B" });
}

/** Quelques commits de cours : Python, 28 commits dans 2 dépôts, une année active, 9 semaines actives. */
export function courseworkFacts(): GithubFacts {
  const repos = [
    python("tp-optimisation", 16, { fullName: "alix-ferrand/tp-optimisation", activity: 3, createdAt: "2025-10-01T10:00:00Z", pushedAt: "2025-12-12T10:00:00Z" }),
    python("projet-info", 12, { fullName: "alix-ferrand/projet-info", activity: 2, createdAt: "2026-01-15T10:00:00Z", pushedAt: "2026-02-20T10:00:00Z" }),
  ];
  return facts({
    login: "alix-ferrand",
    collectedAt: LEVELS_NOW,
    profile: { ...facts().profile, login: "alix-ferrand", name: "Alix Ferrand", company: null, createdAt: "2025-09-15T10:00:00Z", publicRepos: repos.length },
    repos,
    repoCount: repos.length,
    activeRepos: repos.map((r) => r.name),
    trees: [tree("tp-optimisation", { hasCi: false, hasTests: false, tooling: [] }), tree("projet-info", { hasCi: false, hasTests: false, tooling: [] })],
    calendar: { available: true, weeksActive: 9, weeks: 52, totalContributions: 60 },
    activityByYear: [
      { yearsAgo: 0, contributions: 60 },
      { yearsAgo: 1, contributions: 8 },
    ],
    externalMergedPRs: 0,
    firstRealCommit: { repo: "tp-optimisation", date: "2025-10-01T10:00:00Z" },
  });
}

export const COURSEWORK_AI: CodeReadingResult = {
  readings: [{ repo: "tp-optimisation", level: 2, evidence_file: "main.py", evidence_quote: "print(res)", observed_traits: [] }],
  ai_status: null,
};
