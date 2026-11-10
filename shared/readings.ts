// Contrat entre la collecte (server/src/github), la lecture IA (server/src/ai)
// et le barème (server/src/scoring). L'IA ne rend jamais de nombre qui finit
// sur la carte : elle rend ces constats, le barème les transforme (SPEC §4.1).

import type { Lang, Position } from "./types";

/** Fichiers choisis par le code pour la lecture IA (§4.3) : ≤ 3 repos, ≤ 10 fichiers, ≤ 40 Ko au total. */
export interface RepoFiles {
  repo: string;
  /** Poids d'activité utilisé pour pondérer TEC. */
  activity: number;
  files: { path: string; content: string }[];
}

/** Traits observables, liste fermée (§5.3). */
export const CODE_TRAITS = [
  "handles_errors",
  "typed_strictly",
  "clean_architecture",
  "short_variable_names",
  "huge_function",
  "franglais_comments",
  "console_log_in_prod",
  "copy_paste",
] as const;
export type CodeTrait = (typeof CODE_TRAITS)[number];

/** Statuts que l'IA peut poser (un seul par carte, §5.3). Ids stables de data/statuses.json. */
export const AI_STATUS_IDS = [
  "ai_short_vars",
  "ai_400_lines",
  "ai_franglais",
  "ai_console_log",
  "ai_copy_paste",
  "ai_handles_errors",
  "ai_typed",
  "ai_clean_arch",
] as const;
export type AIStatusId = (typeof AI_STATUS_IDS)[number];

export interface CodeReading {
  repo: string;
  level: 1 | 2 | 3 | 4 | 5;
  evidence_file: string;
  evidence_quote: string; // < 200 caractères
  observed_traits: CodeTrait[];
}

export interface CodeReadingResult {
  readings: CodeReading[];
  /** Le statut choisi par l'IA dans la liste fermée, ou null. */
  ai_status: AIStatusId | null;
}

export type Seniority = "junior" | "mid" | "senior" | "lead" | "staff";

export interface CvRole {
  title: string;
  company: string;
  start: string | null; // "YYYY-MM"
  end: string | null;
  responsibilities: string[];
}

export interface CvReading {
  language: Lang;
  position: Position;
  /** Nom tel qu'écrit en tête du CV (pour le bandeau). */
  full_name: string | null;
  years_declared: number;
  seniority_claimed: Seniority;
  roles: CvRole[];
  technos_listed: string[];
  technos_described: string[];
  tests_ci_review_mentions: { quote: string }[];
  projects_with_dated_outcome: number;
  writing_quality: 1 | 2 | 3 | 4 | 5;
  is_dev_profile: boolean;
  /** Le titre principal du CV contient IA/AI. */
  title_mentions_ai: boolean;
  /** Au moins un projet IA décrit concrètement. */
  describes_ai_project: boolean;
  /** L'école la mieux classée du profil, telle qu'écrite ; "" sans études supérieures. */
  school_name: string;
  /** Rang donné par l'IA ; le barème le remplace par celui de sa liste (server/src/scoring/school.ts). */
  school_tier: SchoolTier;
}

export const SCHOOL_TIERS = ["S", "A", "B", "C", "none"] as const;
export type SchoolTier = (typeof SCHOOL_TIERS)[number];

/** Comptages faits par le code sur le texte du CV, avant de jeter le texte (§4.5, §6). */
export interface CvTextCounts {
  words: number;
  pages: number;
  /** Occurrences par mot creux (data/buzzwords.json). */
  buzzwords: Record<string, number>;
  buzzwordsPer100: number;
  passionCount: number;
}
