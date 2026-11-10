// Chargement typé des fichiers de barème (data/). Aucune valeur de jugement dans le code.

import scoringJson from "../../../data/scoring.json";
import statusesJson from "../../../data/statuses.json";
import buzzwordsJson from "../../../data/buzzwords.json";
import profilesJson from "../../../data/profiles.json";
import sentencesJson from "../../../data/sentences.json";
import type { SchoolTier } from "../../../shared/readings";
import type { Fact, Position, StatCode, StatusTone } from "../../../shared/types";

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
      school: { bonus: Record<Exclude<SchoolTier, "none">, number>; aiMaxTier: SchoolTier; list: { school: string; tier: SchoolTier; pattern: string }[] };
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
}

export interface StatusesConfig {
  version: string;
  maxPerCard: number;
  tonePriority: StatusTone[];
  statuses: StatusDef[];
  comparison: { cvAhead: Fact; codeAhead: Fact; even: Fact };
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

export const SCORING = scoringJson as unknown as ScoringConfig;
export const STATUSES = statusesJson as unknown as StatusesConfig;
export const BUZZWORDS = buzzwordsJson as unknown as BuzzwordsConfig;
export const PROFILES = profilesJson as unknown as ProfilesConfig;
export const SENTENCES = sentencesJson as unknown as SentencesConfig;

/** Clé utilisée dans CvTextCounts.buzzwords pour les mentions d'IA. */
export const AI_BUZZ_KEY = "IA/AI";
