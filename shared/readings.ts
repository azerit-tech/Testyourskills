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

/**
 * Type d'employeur d'un poste, liste fermée (§18.37, critère Parcours). Pas de
 * « forte barre d'embauche » : seule la liste du serveur le donne
 * (server/src/scoring/employers.ts), jamais l'IA.
 */
export const EMPLOYER_TYPES = ["startup", "scaleup", "large_group", "consulting_agency", "public_research", "unknown"] as const;
export type EmployerType = (typeof EMPLOYER_TYPES)[number];

/**
 * Nature d'un poste (§18.37, critère Expérience) : un vrai poste (salarié,
 * freelance, fondateur) compte en plein, stage et alternance pour moitié,
 * association étudiante, bénévolat et projet personnel pour rien.
 */
export const ROLE_KINDS = ["job", "internship", "work_study", "student_association", "volunteer", "personal_project"] as const;
export type RoleKind = (typeof ROLE_KINDS)[number];

export interface CvRole {
  title: string;
  company: string;
  start: string | null; // "YYYY-MM"
  end: string | null;
  responsibilities: string[];
  /** Type d'employeur lu par l'IA ; absent des lectures d'avant le §18.37. */
  employer_type?: EmployerType;
  /**
   * Nature du poste lue par l'IA, corrigée par le code : un employeur qui porte
   * le nom de l'école du profil est une association étudiante. Absent des
   * lectures d'avant le §18.37.
   */
  kind?: RoleKind;
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
  /**
   * Sélections passées hors de l'école (§18.37, critère École et sélection),
   * chacune avec son extrait retrouvé dans le texte lu, sinon jetée. Cinq au
   * plus. Absent des lectures d'avant le §18.37.
   */
  selection_signals?: SelectionSignal[];
  /**
   * Un fait d'encadrement (équipe encadrée, recrutements), avec son extrait
   * retrouvé dans le texte lu ; null sans fait, ou extrait introuvable. Absent
   * des lectures d'avant le §18.37.
   */
  management_fact?: { quote: string } | null;
}

/**
 * Sortes de sélection (§18.37, table École et sélection) : médaille
 * internationale (10), classement cité dans un concours, prix de hackathon,
 * programme sélectif (8), concours ou hackathon sans classement (4).
 */
export const SELECTION_KINDS = ["international_medal", "ranked_contest", "hackathon_prize", "selective_programme", "contest_entry"] as const;
export type SelectionKind = (typeof SELECTION_KINDS)[number];

export interface SelectionSignal {
  kind: SelectionKind;
  /** Extrait exact du texte lu, moins de 200 caractères. */
  quote: string;
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
