// Contrat partagé entre le moteur (server), le rendu de carte (shared/card) et
// le front (web). Toute carte affichée ou rendue en PNG est un `CardData`.
// SPEC.md §3 (anatomie), §4 (jugement), §5 (statuts).

export type Lang = "fr" | "en";

export type Tier = "bronze" | "silver" | "gold" | "icon";
/** Cartes spéciales qui remplacent le rendu du tier (§3.2). */
export type Special = "wonderkid" | "flashback" | "totw";
/** Ce qui pilote le rendu : le tier, sauf si une carte spéciale s'applique. */
export type CardStyle = Tier | Special;

export type StatCode = "TEC" | "SHIP" | "ARCH" | "DOC" | "XP" | "BUZZ";
export const STAT_CODES: StatCode[] = ["TEC", "SHIP", "ARCH", "DOC", "XP", "BUZZ"];

export type Position =
  | "FS" | "BE" | "FE" | "MOB" | "DATA" | "ML" | "OPS" | "SEC" | "EMB"
  | "PM" | "DESIGN" | "CTO";

export type Source = "github" | "cv";

/** Un fait lisible qui justifie une stat (« Pourquoi cette note ? », §6.4). */
export interface Fact {
  fr: string;
  en: string;
}

export interface Stat {
  code: StatCode;
  value: number; // 1..99, entier
  /** false si l'axe ne repose pas sur assez de données (§3.5). */
  sufficient: boolean;
  facts: Fact[];
}

export type StatusTone = "negative" | "positive" | "special" | "gap";

export interface StatusInstance {
  /** Identifiant stable du catalogue (data/statuses.json). */
  id: string;
  tone: StatusTone;
  /** Texte final, valeurs {n} déjà remplies. */
  label: Fact;
  /** La règle qui l'a déclenché, en clair. */
  rule: Fact;
  /** Posé par l'IA (liste fermée §5.3) plutôt que par une règle. */
  byAI?: boolean;
  /** Statut rare (§18.3) : part des fiches de référence qui l'ont, en %, sous 5. Absent sans table de référence. */
  rarity?: number;
}

/** Profil criminel (SPEC §18.2) : exactement un par fiche, choisi par règles
 *  dans la liste fermée de data/profiles.json. Nom et accroche fixes. */
export interface CardProfile {
  /** Identifiant stable (data/profiles.json). */
  id: string;
  label: Fact;
  /** Phrase d'accroche, 60 signes au plus. */
  tagline: Fact;
}

/** La peine (axe le plus faible) et la caution (le geste qui lèverait un chef d'accusation), §18.2. */
export interface CardSentence {
  label: Fact;
  /** Absente pour une relaxe, ou si aucun chef d'accusation n'a de caution. */
  bail?: Fact;
}

export interface CardData {
  id: string;
  source: Source;
  createdAt: string; // ISO
  /** Version du barème (data/scoring.json) qui a produit la carte. */
  scoringVersion: string;

  /** Nom affiché dans le bandeau (nom réel ou pseudo). */
  name: string;
  /** Pseudo GitHub, si source github ou comparaison. */
  login?: string;
  /** URL d'avatar (le front l'affiche ; le serveur l'embarque en data URI). */
  avatarUrl?: string;
  photoSource?: "github" | "linkedin";
  /** Initiales si pas d'avatar. */
  initials: string;

  overall: number; // 1..99
  tier: Tier;
  special?: Special;
  position: Position;
  /** Langage principal, clé de logo (ex. "typescript", "python", "rust"). */
  mainLanguage?: string;
  /** Employeur déclaré, sinon null → « Agent libre ». */
  club: string | null;

  /** Toujours dans l'ordre STAT_CODES. */
  stats: Stat[];
  statuses: StatusInstance[]; // 1..3
  /** Facultatifs : les fiches produites avant le barème 0.2.0 n'en ont pas. */
  profile?: CardProfile;
  sentence?: CardSentence;

  reliability: number; // 0..95
  judgedInSeconds: number;
  lang: Lang;

  /** Jeton de suppression : jamais renvoyé par GET public, seulement à la création. */
  deleteToken?: string;
  /** « Plus recherché que `percent` % » des profils sourcés par Azerit, dans le groupe dit (§18.3). Absent sans table de référence. */
  rank?: { percent: number; group: { kind: "language" | "position" | "all"; key?: string } };
}

/** Comparaison CV contre GitHub (§6.5). */
export interface ComparisonData {
  id: string;
  createdAt: string;
  cv: CardData;
  github: CardData;
  /** github - cv par stat (positif = le code vaut plus que le CV). */
  deltas: Record<StatCode, number>;
  /** Titre généré par règle. */
  headline: Fact;
}

/** Réponse de GET /api/card/:id pendant et après le traitement. */
export type JobState =
  /** `queue` : rang dans la file d'attente (1 = la prochaine à passer). Absent dès que la fiche est en traitement. */
  | { state: "pending"; progress: ProgressEvent[]; queue?: number }
  | { state: "done"; kind: "card"; card: CardData }
  | { state: "done"; kind: "comparison"; comparison: ComparisonData }
  | { state: "error"; code: ErrorCode; message: Fact };

export type ErrorCode =
  | "closed" // IA coupée : plafond du jour atteint ou crédit OpenRouter épuisé
  | "unknown_user"
  | "organization"
  | "not_a_pdf"
  | "pdf_too_large"
  | "timeout"
  | "rate_limited"
  /** Tous les jetons GitHub épuisés pour plus de 2 minutes : la fiche n'est pas gardée en file. */
  | "busy"
  /** Fiche ou login masqué par son propriétaire revendiqué (§18.1) : « Ce dev a quitté la ville ». */
  | "gone"
  | "internal";

/** Messages d'attente nourris par les faits déjà collectés (§6.2). */
export interface ProgressEvent {
  key: string; // ex. "lazy_commits", "buzzwords", "tests", "readme", "recruiter", "compare"
  n?: number;
  at: number; // ms depuis le début
}

export function tierFor(overall: number): Tier {
  if (overall >= 90) return "icon";
  if (overall >= 75) return "gold";
  if (overall >= 60) return "silver";
  return "bronze";
}

export function styleOf(card: Pick<CardData, "tier" | "special">): CardStyle {
  return card.special ?? card.tier;
}

/** Niveau de recherche de la fiche (SPEC §18.18) : six étoiles, comme le HUD
 *  du jeu, allumées selon la note. Les tiers (barème, serveur) restent ; les
 *  étoiles ne pilotent que le rendu et le vocabulaire. Bronze couvre ★ à ★★★. */
export type Stars = 1 | 2 | 3 | 4 | 5 | 6;

/** Seuils des étoiles 2 à 6 : une étoile s'allume à 30, 45, 60, 75 et 90. */
export const STAR_THRESHOLDS = [30, 45, 60, 75, 90] as const;

export function starsFor(overall: number): Stars {
  if (overall >= 90) return 6;
  if (overall >= 75) return 5;
  if (overall >= 60) return 4;
  if (overall >= 45) return 3;
  if (overall >= 30) return 2;
  return 1;
}

/** Libellés épicènes des niveaux (§18.18) : rien ne s'accorde avec la personne. */
export const LEVEL_LABELS: Record<Stars, Fact> = {
  1: { fr: "Petit délit", en: "Petty crime" },
  2: { fr: "Délit", en: "Misdemeanor" },
  3: { fr: "Avis de recherche", en: "Wanted" },
  4: { fr: "Haute surveillance", en: "High surveillance" },
  5: { fr: "Menace publique", en: "Public menace" },
  6: { fr: "Priorité absolue", en: "Top priority" },
};
