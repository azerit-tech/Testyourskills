// Faits GitHub collectés pour un pseudo. Sérialisable JSON, sans calcul de note :
// le barème (server/src/scoring) transforme ces faits en carte. SPEC §4.2.

import type { Accomplice } from "./accomplices";

export interface GithubProfile {
  login: string;
  name: string | null;
  avatarUrl: string;
  bio: string | null;
  company: string | null;
  followers: number;
  createdAt: string; // ISO
  /** Repos publics déclarés par GitHub (forks compris). */
  publicRepos: number;
  /** Compte X déclaré sur le profil (`twitter_username`), sans @ ; absent des faits collectés avant le §18.6. */
  twitterUsername?: string | null;
}

export interface GithubRepo {
  name: string;
  fullName: string;
  description: string | null;
  /** Langage principal linguist. */
  language: string | null;
  stars: number;
  forks: number;
  pushedAt: string;
  createdAt: string;
  archived: boolean;
  topics: string[];
  license: string | null;
  sizeKb: number;
  defaultBranch: string;
  /** Commits de l'utilisateur sur 12 mois (calendrier GitHub), null si inconnu. */
  recentUserCommits: number | null;
  /** Poids d'activité (commits récents + fraîcheur du dernier push), sert au classement et à TEC. */
  activity: number;
  /** Commits sur la branche par défaut, null si non mesuré. */
  commitCount: number | null;
  /** Octets par langage, null si non mesuré. */
  languages: Record<string, number> | null;
  /** Dépendances déclarées (package.json, requirements, Cargo, go.mod…), en minuscules, null si non lues. */
  deps: string[] | null;
  /** Contributeurs hors propriétaire et bots, plafonné à 100, null si non mesuré. */
  externalContributors: number | null;
  /** Mots du README, null si non lu, 0 si absent. */
  readmeWords: number | null;
  /** Dates des releases récentes (max 10). */
  releaseDates: string[] | null;
}

export interface RepoTree {
  repo: string;
  available: boolean;
  /** Arbre partiel (GitHub tronque au-delà de 100 000 entrées, ou repo énorme lu en surface). */
  truncated: boolean;
  entries: number;
  testFiles: number;
  hasTests: boolean;
  hasCi: boolean;
  /** Outils détectés : eslint, prettier, biome, xo, ruff, mypy, tsconfig-strict, golangci, rustfmt, clippy, pre-commit. */
  tooling: string[];
  nodeModules: boolean;
  /** Marqueurs de poste trouvés dans l'arbre : dockerfile, terraform, k8s, android, ios, flutter, embedded, notebook. */
  markers: string[];
  /** Fichiers source candidats à la lecture IA (les plus gros, hors générés), max 60. */
  sourceFiles: { path: string; size: number }[];
}

export interface CommitFact {
  repo: string;
  oid: string;
  /** Première ligne du message, tronquée à 100 caractères. */
  message: string;
  /** Date d'auteur, ISO UTC. */
  date: string;
}

export interface GithubFacts {
  schema: 1;
  login: string;
  /** Instant de la collecte : sert de « maintenant » au barème (déterminisme). */
  collectedAt: string;
  profile: GithubProfile;
  /** Repos publics hors forks possédés par l'utilisateur (total GitHub). */
  repoCount: number;
  /** true si la liste `repos` ne contient pas tous les repos (profils à plus de 1 000 repos). */
  reposTruncated: boolean;
  /** Repos hors forks, archivés compris, triés par activité décroissante. */
  repos: GithubRepo[];
  /** Les 5 repos les plus actifs (noms), dans l'ordre. */
  activeRepos: string[];
  calendar: {
    available: boolean;
    /** Semaines avec au moins une contribution, sur les 52 dernières. */
    weeksActive: number;
    weeks: number;
    totalContributions: number;
    /**
     * Contributions jour par jour sur le calendrier (environ 371 jours), du plus
     * ancien au plus récent ; `start` est le premier jour (AAAA-MM-JJ). Sert aux
     * trouvailles (§18.26) : série, jour de la semaine. Absent des faits d'avant.
     */
    days?: { start: string; counts: number[] };
  };
  /** Contributions par fenêtre glissante d'un an (0 = les 12 derniers mois), null si indisponible. */
  activityByYear: { yearsAgo: number; contributions: number }[] | null;
  /** Échantillon des commits de l'utilisateur sur les 3 repos les plus actifs (≤ 100 par repo). */
  commits: CommitFact[];
  /** Décalage UTC dominant des commits (minutes), lu dans les en-têtes de patch, null si inconnu. */
  utcOffsetMinutes: number | null;
  /** PR fusionnées chez les autres (`type:pr author:X is:merged -user:X`). */
  externalMergedPRs: number;
  /** Plus ancien commit de l'utilisateur dans un repo qui en compte au moins 10. */
  firstRealCommit: {
    repo: string;
    date: string;
    /** Le commit lui-même (preuve des trouvailles, §18.26) ; absent des faits d'avant. */
    oid?: string;
    /** Décalage UTC de ce commit (minutes), lu dans son patch ; null si illisible. */
    offsetMinutes?: number | null;
  } | null;
  /** Arborescences des repos actifs. */
  trees: RepoTree[];
  /**
   * « Dénonce un complice » (§18.6) : contributeurs des repos actifs, sans le
   * joueur ni les bots, au plus six. Ne sert pas au barème. Absent des faits
   * collectés avant le §18.6.
   */
  accomplices?: Accomplice[];
}
