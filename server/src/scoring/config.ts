// Chargement typé des fichiers de barème (data/). Aucune valeur de jugement dans le code.

import scoringJson from "../../../data/scoring.json";
import statusesJson from "../../../data/statuses.json";
import buzzwordsJson from "../../../data/buzzwords.json";
import profilesJson from "../../../data/profiles.json";
import sentencesJson from "../../../data/sentences.json";
import gridJson from "../../../data/grid.json";
import type { RoleKind as CvRoleKind, SchoolTier, SelectionKind } from "../../../shared/readings";
import type { ContractType } from "../linkedinProfile/profile";
import type { CriterionCode, Fact, Position, SeniorityCode, StatCode, StatusTone } from "../../../shared/types";

export type Scale = [number, number][];

export interface ScoringConfig {
  version: string;
  bounds: { min: number; max: number };
  weights: Record<Exclude<StatCode, "BUZZ">, number>;
  reliability: { perAxis: number; max: number };
  special: {
    wonderkid: { xpBelow: number; tecAtLeast: number };
    /** Calibration : la carte et le statut exigent aussi une activité récente modeste (semaines actives sur 52). */
    flashback: { oldShareAtLeast: number; olderThanYears: number; minContributions: number; maxWeeksActive: number };
  };
  github: {
    activeRepos: number;
    readRepos: number;
    activity: { recencyPoints: number; recencyHalfLifeDays: number };
    mainLanguage: { repoBase: number; activityLogWeight: number; ignore: string[] };
    lazyCommit: { minLength: number; pattern: string };
    tutorial: { pattern: string; maxCommits: number };
    nightHours: { from: number; to: number };
    fridayEveningFromHour: number;
    aliveWithinDays: number;
    SHIP: { scale: Scale; releaseBonus: number; releasesAtLeast: number; releasesWithinDays: number };
    ARCH: { weights: { tests: number; ci: number; tooling: number }; scale: Scale; sufficientActiveRepos: number; activeWithinDays: number };
    DOC: {
      readmeWordsAtLeast: number;
      weights: { readme: number; commits: number };
      scale: Scale;
      lazyShareWhenUnknown: number;
      readableCommitsPerRepo: number;
      sufficientRepos: number;
    };
    XP: { scale: Scale; breadthMinBytes: number; breadthBonus: [number, number][]; sufficientRepoCommits: number };
    TEC: { levelScale: Scale; fallback: number; externalPrBonus: number; externalPrsAtLeast: number; sufficientRepoCommits: number };
    BUZZ: { weights: { tutorials: number; lazy: number }; scale: Scale };
  };
  cv: {
    TEC: {
      seniority: Record<string, number>;
      perDescribedTechno: number;
      /**
       * Rang d'école : la liste prime, hors liste l'IA est plafonnée à aiMaxTier. La liste vit hors du dépôt
       * (SCHOOL_TIERS_FILE, scoring/school.ts). L'école n'entre plus dans TEC (0.4.0) : elle est le critère EDU de la grille.
       */
      school: { aiMaxTier: SchoolTier };
    };
    SHIP: { scale: Scale };
    ARCH: { scale: Scale };
    DOC: { scale: Scale; longCvWords: number; longCvPenalty: number };
    BUZZ: { scale: Scale };
    sufficiency: { minWords: number };
    cto: { titlePattern: string; unknownCompanyPattern: string };
    languages: string[];
    aiDeps: string[];
    aiTopics: string[];
  };
  position: {
    default: Position;
    fsRatio: number;
    languages: Record<string, Partial<Record<Position, number>>>;
    languageWeight: number;
    depWeight: number;
    maxDepsPerRepo: number;
    deps: Partial<Record<Position, string[]>>;
    markers: Record<string, Partial<Record<Position, number>>>;
    topics: Partial<Record<Position, string[]>>;
    topicWeight: number;
  };
  frontFrameworks: Record<string, string[]>;
}

export type StatusSource = "github" | "cv" | "ai" | "fallback";

export interface StatusDef {
  id: string;
  source: StatusSource;
  tone: StatusTone;
  /** Clé de la règle implémentée dans le code (rules.ts). */
  rule: string;
  params?: Record<string, number>;
  label: Fact;
  /** Libellé de repli quand un placeholder n'a pas de valeur (ex. année inconnue). */
  labelAlt?: Fact;
  ruleText: Fact;
  ruleTextAlt?: Fact;
  /**
   * Retiré : plus jamais produit, et sa règle n'existe plus. L'entrée reste au
   * catalogue (ids stables) parce que des fiches rangées la citent encore.
   */
  retired?: boolean;
}

export interface StatusesConfig {
  version: string;
  maxPerCard: number;
  tonePriority: StatusTone[];
  statuses: StatusDef[];
}

export interface BuzzwordsConfig {
  version: string;
  words: { fr: string[]; en: string[] };
  /** Mentions d'IA : comptées comme mot creux seulement si aucun projet IA n'est décrit. */
  ai: { caseSensitive: string[]; caseInsensitive: string[] };
  /** Racines comptées pour « Passion citée {n} fois ». */
  passionStems: string[];
}

/** Une condition de profil : une clé de règle et ses seuils. */
export interface ProfileCondition {
  rule: string;
  params?: Record<string, number>;
}

export interface ProfileDef {
  id: string;
  /** Une condition vraie suffit. */
  any?: ProfileCondition[];
  /** Toutes les conditions doivent être vraies. */
  all?: ProfileCondition[];
  /** Repli quand rien ne s'applique ; le dernier de la liste. */
  fallback?: boolean;
  label: Fact;
  tagline: Fact;
}

export interface ProfilesConfig {
  version: string;
  profiles: ProfileDef[];
}

export type SentenceAxis = Exclude<StatCode, "XP" | "BUZZ">;

export interface SentencesConfig {
  version: string;
  rule: string;
  params: { threshold: number; step: number };
  /** Ordre de départage à égalité. */
  axes: SentenceAxis[];
  sentences: Record<SentenceAxis, { label: Fact; labelOne: Fact }>;
  acquittal: Fact;
  /** Caution par id de statut (data/statuses.json). */
  bail: Record<string, Fact>;
}

/** Comment un poste compte dans l'expérience (§3.2) : en plein, à moitié, pour rien (association, bénévolat), pour rien (projet personnel). */
export type GridRoleKind = "full" | "internship" | "association" | "project";

/**
 * Une condition d'une ligne de la table du parcours (0.5.0). role : un vrai poste chez un
 * même employeur ; founded : une entreprise fondée ; internship : un stage ou une alternance
 * chez un même employeur ; internships : `count` stages, ou `months` cumulés. `at` : équipe
 * produit (startup, scale-up, ou liste à forte barre) ou liste à forte barre seule.
 */
export interface EmpCondition {
  what: "role" | "founded" | "internship" | "internships";
  at?: "product" | "highBar";
  months?: number;
  count?: number;
  riseOrTeam?: boolean;
  riseAndTeam?: boolean;
}
export interface EmpRow {
  score: number;
  any: EmpCondition[];
}
/** Une ligne de la table de la stack : commits du langage principal, années de pratique, autres familles, fraîcheur. */
export interface StkRow {
  score: number;
  commits: number;
  years: number;
  otherFamilies: number;
  freshMonths: number | null;
}
/** Une ligne de la table de l'ownership : un projet porté, publié, utilisé ; de quoi mettre en production. */
export interface OwnRow {
  score: number;
  stars?: number;
  external?: number;
  releasesInYear?: number;
  months?: number;
  commits?: number;
  published?: boolean;
  deployable?: boolean;
  anyRepo?: boolean;
}

/** Une ligne déclarée de la stack : technos rattachées à un poste ou une réalisation, dont tant de récentes. */
export interface StkDeclaredRow {
  score: number;
  tied: number;
  recent: number;
}
/** Une ligne déclarée de l'ownership : résultats datés et chiffrés, ou une entreprise fondée tenue tant de mois avec tant de résultats. */
export interface OwnDeclaredRow {
  score: number;
  outcomes: number;
  foundedMonths: number;
  foundedOutcomes?: number;
}

/** Barème de recrutement (data/grid.json) : tables de niveaux, coefficients, familles, traces. */
export interface GridConfig {
  weights: Record<CriterionCode, number>;
  /** Le niveau d'expérience auquel le dossier est lu : seuils en mois comptés, du plus haut au plus bas. */
  seniority: { levels: { code: SeniorityCode; months: number }[]; default: SeniorityCode };
  final: { neverLower: CriterionCode[]; proofBonus: number; capUnproven: number; emptyBelowShare: number; emptyScore: number; bounds: { min: number; max: number } };
  thinGithub: { minRepos: number; repoCommits: number; minCommits: number };
  EDU: { tiers: Record<Exclude<SchoolTier, "none">, number>; selection: Record<SelectionKind, number>; githubPattern: string; githubScore: number };
  XP: {
    share: Record<GridRoleKind, number>;
    levels: { score: number; years: number }[];
    githubCap: number;
    githubActiveYearContributions: number;
    claimedCap: number;
    internshipPattern: string;
    /** Le type de contrat du fournisseur (`LinkedinRole.contract`) → comment le poste compte. */
    byContract: Record<ContractType, GridRoleKind>;
    /** La nature lue par l'IA (`CvRole.kind`) → comment le poste compte. */
    byAiKind: Record<CvRoleKind, GridRoleKind>;
    associationPattern: string;
    schoolRoleExceptPattern: string;
    schoolAssociationWords: string;
    seniorTitlePattern: string;
    seniorOnPaperBelowYears: number;
  };
  EMP: {
    founderPattern: string;
    productTypes: string[];
    /** Une table par niveau d'expérience, du plus haut au plus bas : la plus haute ligne dont une condition est remplie. */
    tables: Record<SeniorityCode, EmpRow[]>;
    rankPatterns: { rank: number; pattern: string }[];
    defaultRank: number;
  };
  STK: {
    levels: StkRow[];
    /** La table d'un niveau d'expérience, à la place de `levels` (0.5.0). */
    byLevel?: Partial<Record<SeniorityCode, StkRow[]>>;
    familyRepoCommits: number;
    dumped: { maxCommits: number; minSizeKb: number };
    recentMonths: number;
    /** L'équivalent LinkedIn ou CV des lignes de la même note (0.6.0), par niveau ; `default` pour confirmé et plus. */
    declared: Record<"student" | "junior" | "default", StkDeclaredRow[]>;
    undersellMinBytes: number;
    ignoredLanguages: string[];
    families: Record<string, string[]>;
  };
  CODE: { multiplier: number; testsFrom: number; testsShare: number; capWithoutTests: number; commitsFrom: number; repoCommits: number; capWithoutCommits: number };
  ACT: { levels: { score: number; weeks: number }[]; codeFrom: number; codeRepoCommits: number; capWithoutCode: number };
  OWN: {
    levels: OwnRow[];
    /** La table d'un niveau d'expérience, à la place de `levels` (0.5.0). */
    byLevel?: Partial<Record<SeniorityCode, OwnRow[]>>;
    /** L'équivalent LinkedIn ou CV des lignes de la même note (0.6.0), par niveau ; `default` pour confirmé et plus. */
    declared: Record<"student" | "junior" | "default", OwnDeclaredRow[]>;
  };
  OSS: {
    bigStars: number;
    levels: { score: number; maintainerStars?: number; bigPrs?: number; ownStars?: number; external?: number; prs?: number }[];
    friendsCap: number;
  };
  traces: { list: { name: string; aliases: string[]; languages?: string[]; deps?: string[]; topics?: string[]; markers?: string[] }[] };
}

export const SCORING = scoringJson as unknown as ScoringConfig;
export const GRID = gridJson as unknown as GridConfig;
export const STATUSES = statusesJson as unknown as StatusesConfig;
export const BUZZWORDS = buzzwordsJson as unknown as BuzzwordsConfig;
export const PROFILES = profilesJson as unknown as ProfilesConfig;
export const SENTENCES = sentencesJson as unknown as SentencesConfig;

/** Clé utilisée dans CvTextCounts.buzzwords pour les mentions d'IA. */
export const AI_BUZZ_KEY = "IA/AI";
