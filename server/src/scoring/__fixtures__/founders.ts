// Les deux fondateurs au 10 novembre 2026 (docs/bareme-recrutement.md §7), calqués
// sur leurs données réelles : profils LinkedIn tels que lus, faits GitHub collectés.
// Noms d'employeurs et de dépôts gardés quand le document les cite, le reste inventé
// à l'identique (nombres de commits, dates, semaines actives).

import type { CodeReadingResult, CvReading } from "../../../../shared/readings";
import type { GithubFacts } from "../../github/facts";
import type { DatedRole } from "../grid";
import { cvReading, facts, repo, tree } from "./make";

export const FOUNDERS_NOW = "2026-11-10T12:00:00Z";

/** Profil LinkedIn réduit (server/src/linkedinProfile/profile.ts) : ce que le barème reçoit. */
export interface FounderProfile {
  roles: DatedRole[];
  education: { school: string; degree: string; field: string; start: number | null; end: number | null }[];
  skills: string[];
}

// --- Jacques (@jmougeot) ---------------------------------------------------------

/** TypeScript : 329 commits dans 7 dépôts depuis novembre 2024 ; Agda en seconde famille ; 43 semaines actives ; 72 PR chez les autres. */
export function jacquesFacts(): GithubFacts {
  const ts = (name: string, commitCount: number, p: Parameters<typeof repo>[1] = {}) =>
    repo(name, { fullName: `jmougeot/${name}`, commitCount, language: "TypeScript", languages: { TypeScript: commitCount * 2000 }, ...p });
  const repos = [
    ts("sequence-mail", 120, { activity: 50, stars: 4, createdAt: "2025-06-02T10:00:00Z", pushedAt: "2026-11-09T18:00:00Z" }),
    ts("Testyourskills", 60, { activity: 30, createdAt: "2026-10-01T10:00:00Z", pushedAt: "2026-11-08T09:00:00Z" }),
    ts("Projet_innovation", 79, { activity: 20, createdAt: "2025-01-10T10:00:00Z", pushedAt: "2025-09-12T10:00:00Z" }),
    ts("hiring-traces", 30, { activity: 8, createdAt: "2024-11-04T10:00:00Z", pushedAt: "2026-08-01T10:00:00Z" }),
    ts("scraper", 20, { activity: 4, createdAt: "2025-03-01T10:00:00Z", pushedAt: "2026-02-01T10:00:00Z" }),
    ts("dotfiles-ts", 12, { activity: 2, createdAt: "2025-05-01T10:00:00Z", pushedAt: "2025-06-01T10:00:00Z" }),
    ts("notes", 8, { activity: 1, createdAt: "2025-07-01T10:00:00Z", pushedAt: "2025-07-20T10:00:00Z" }),
    repo("agda-notes", {
      fullName: "jmougeot/agda-notes",
      language: "Agda",
      languages: { Agda: 5_000_000 },
      commitCount: 25,
      sizeKb: 5000,
      activity: 3,
      createdAt: "2025-02-15T10:00:00Z",
      pushedAt: "2025-11-01T10:00:00Z",
    }),
  ];
  const active = ["sequence-mail", "Testyourskills", "Projet_innovation", "hiring-traces", "scraper"];
  return facts({
    login: "jmougeot",
    collectedAt: FOUNDERS_NOW,
    profile: { ...facts().profile, login: "jmougeot", name: "Jacques Mougeot", company: "Azerit", createdAt: "2019-09-01T10:00:00Z", publicRepos: repos.length },
    repos,
    repoCount: repos.length,
    activeRepos: active,
    trees: [
      tree("sequence-mail", { markers: ["dockerfile"], hasCi: true, hasTests: true }),
      tree("Testyourskills", { hasCi: false, hasTests: true }),
      tree("Projet_innovation", { hasCi: false, hasTests: false, tooling: [] }),
      tree("hiring-traces", { hasCi: false, hasTests: false, tooling: [] }),
      tree("scraper", { hasCi: false, hasTests: false, tooling: [] }),
    ],
    calendar: { available: true, weeksActive: 43, weeks: 52, totalContributions: 1030 },
    activityByYear: [
      { yearsAgo: 0, contributions: 1030 },
      { yearsAgo: 1, contributions: 410 },
      { yearsAgo: 2, contributions: 22 },
      { yearsAgo: 3, contributions: 4 },
    ],
    externalMergedPRs: 72,
    firstRealCommit: { repo: "hiring-traces", date: "2024-11-04T10:00:00Z" },
  });
}

/** Niveau moyen lu 3,6 sur 5, pondéré par l'activité : (4 × 50 + 4 × 30 + 2 × 20) / 100. */
export const JACQUES_AI: CodeReadingResult = {
  readings: [
    { repo: "sequence-mail", level: 4, evidence_file: "src/services/outreach.test.ts", evidence_quote: "it('retries a failed send once', …)", observed_traits: ["handles_errors"] },
    { repo: "Testyourskills", level: 4, evidence_file: "server/src/scoring/grid.ts", evidence_quote: "export function finalize(", observed_traits: ["typed_strictly"] },
    { repo: "Projet_innovation", level: 2, evidence_file: "src/main.ts", evidence_quote: "console.log(data)", observed_traits: [] },
  ],
  ai_status: null,
};

/** La lecture IA du LinkedIn de Jacques : elle compte 3 ans (stages en plein, association comprise) ; le barème n'en tient pas compte. */
export function jacquesReading(): CvReading {
  return cvReading({
    full_name: "Jacques Mougeot",
    position: "ML",
    years_declared: 3,
    seniority_claimed: "junior",
    is_dev_profile: true,
    roles: [
      { title: "Co-founder", company: "Azerit", start: "2026-04", end: null, responsibilities: ["Recrutement d'ingénieurs sur preuve GitHub"] },
      { title: "Research Intern", company: "McMaster University", start: "2025-02", end: "2025-11", responsibilities: ["Bibliothèque standard d'Agda"] },
    ],
    technos_listed: ["Python", "Agda", "TypeScript", "Kubernetes"],
    technos_described: ["Python"],
    tests_ci_review_mentions: [],
    projects_with_dated_outcome: 0,
    writing_quality: 3,
    school_name: "Centrale Méditerranée",
    school_tier: "B",
  });
}

export function jacquesProfile(): FounderProfile {
  return {
    roles: [
      { title: "Co-founder", company: "Azerit", start: "2026-04", end: null, description: "Recrutement d'ingénieurs sur preuve GitHub." },
      { title: "Quantitative Research Intern", company: "Hedge Fund SA", start: "2025-11", end: "2026-03", description: "Modèles de volatilité en Python." },
      { title: "Research Intern", company: "McMaster University", start: "2025-02", end: "2025-11", description: "Bibliothèque standard d'Agda." },
      { title: "Trésorier", company: "Centrale Méditerranée Finance", start: "2023-09", end: "2025-01", description: "" },
    ],
    education: [{ school: "Centrale Méditerranée", degree: "Diplôme d'ingénieur", field: "Mathématiques appliquées", start: 2022, end: 2026 }],
    skills: ["Python", "Agda", "TypeScript"],
  };
}

// --- Lumine (@LumBuilds0) --------------------------------------------------------

/** Un dépôt public, sans commit ; 2 semaines actives sur 52 : son code est dans des dépôts privés. */
export function lumineFacts(): GithubFacts {
  const repos = [repo("LumBuilds0", { fullName: "LumBuilds0/LumBuilds0", commitCount: 0, language: null, languages: {}, readmeWords: 20, activity: 0 })];
  return facts({
    login: "LumBuilds0",
    collectedAt: FOUNDERS_NOW,
    profile: { ...facts().profile, login: "LumBuilds0", name: "Lumine Trentelivres", company: null, createdAt: "2023-09-01T10:00:00Z", publicRepos: 1 },
    repos,
    repoCount: 1,
    activeRepos: ["LumBuilds0"],
    trees: [tree("LumBuilds0", { hasTests: false, hasCi: false, tooling: [], sourceFiles: [] })],
    calendar: { available: true, weeksActive: 2, weeks: 52, totalContributions: 2 },
    activityByYear: [
      { yearsAgo: 0, contributions: 2 },
      { yearsAgo: 1, contributions: 0 },
    ],
    commits: [],
    externalMergedPRs: 0,
    firstRealCommit: null,
  });
}

export function lumineReading(): CvReading {
  return cvReading({
    full_name: "Lumine Trentelivres",
    position: "PM",
    years_declared: 2,
    seniority_claimed: "junior",
    is_dev_profile: false,
    roles: [
      { title: "Co-founder", company: "Azerit", start: "2026-01", end: null, responsibilities: [] },
      { title: "Co-founder & CEO", company: "Sejo", start: "2024-09", end: "2025-08", responsibilities: [] },
    ],
    technos_listed: [],
    technos_described: [],
    tests_ci_review_mentions: [],
    projects_with_dated_outcome: 0,
    writing_quality: 3,
    school_name: "CentraleSupélec",
    school_tier: "A",
  });
}

export function lumineProfile(): FounderProfile {
  return {
    roles: [
      { title: "Co-founder", company: "Azerit", start: "2026-01", end: null, description: "" },
      { title: "Co-founder & CEO", company: "Sejo", start: "2024-09", end: "2025-08", description: "" },
    ],
    education: [
      { school: "CentraleSupélec", degree: "Diplôme d'ingénieur", field: "", start: 2021, end: 2025 },
      { school: "Stanford University", degree: "Semestre d'échange", field: "", start: 2023, end: 2023 },
    ],
    skills: [],
  };
}
