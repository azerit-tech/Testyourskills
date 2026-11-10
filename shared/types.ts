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

/** Ce qui déclare, face au GitHub qui prouve : un CV en PDF, ou le profil LinkedIn (§18.24). */
export type DeclaredSource = "cv" | "linkedin";

/** Source déclarative d'une carte ou d'une comparaison : « cv » si rien n'est dit. */
export function declaredOf(x: { declaredSource?: DeclaredSource } | null | undefined): DeclaredSource {
  return x?.declaredSource === "linkedin" ? "linkedin" : "cv";
}

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

/** D'où vient une trouvaille : GitHub, puis LinkedIn (§18.24) et les autres témoins (§18.25). */
export type FindingSource = "github" | "linkedin";

/**
 * Une trouvaille de l'enquête en direct (§18.26) : une phrase courte, datée ou
 * chiffrée, et sa preuve publique. Elle ne touche jamais la note. Toutes les
 * sources poussent dans la même liste, triée par `score`.
 */
export interface Finding {
  /** Type stable (ex. "first_commit", "night_share") : une trouvaille par type et par source. */
  kind: string;
  source: FindingSource;
  /** Tournure de procès-verbal, sans « tu » : elle passe telle quelle dans le texte de partage. */
  text: Fact;
  /** Le chiffre clé, présent tel quel dans `text` (mis en rose poudré). */
  key?: Fact;
  /** La preuve : URL publique du commit, du repo ou du profil. */
  proof: string;
  /** Surprise de 0 à 100, fixée par type et par valeur : plus c'est précis, rare ou drôle, plus c'est haut. */
  score: number;
}

/** Les huit critères du barème de recrutement (docs/bareme-recrutement.md §3, SPEC §18.37). */
export type CriterionCode = "EDU" | "XP" | "EMP" | "STK" | "CODE" | "ACT" | "OWN" | "OSS";
export const CRITERION_CODES: CriterionCode[] = ["EDU", "XP", "EMP", "STK", "CODE", "ACT", "OWN", "OSS"];

/** D'où vient une note ou une pièce : ce qui déclare (LinkedIn ou CV), ce qui prouve (GitHub), ou les deux recoupés. */
export type GridSource = "linkedin" | "github" | "both";

/**
 * Un critère : une seule note sur 10, lue dans sa table de niveaux (le niveau
 * le plus haut dont toute la ligne est remplie). Rien n'y est ajouté ni retiré.
 */
export interface GridCriterion {
  code: CriterionCode;
  /** Entier de 0 à 10 ; null si non prouvé ou non renseigné. */
  score: number | null;
  /** scored : noté sur sa source de preuve ; declared : sur la source qui déclare (table arrêtée à 6) ; unproven : la source ne montre rien de jugeable ; missing : sans objet. */
  state: "scored" | "declared" | "unproven" | "missing";
  /** false : hors moyenne (état, ou école / open source sous la moyenne des autres). */
  counted: boolean;
  source: GridSource;
  /** Comparaison : la note côté LinkedIn. */
  declared?: number | null;
  /** Comparaison : la note côté GitHub. */
  proven?: number | null;
  /** Le niveau atteint, en clair. */
  reached: Fact;
  /** Ce qui manque pour le niveau suivant, avec les chiffres de la personne. */
  next?: Fact;
  /** Chefs d'accusation liés, sans effet sur la note. */
  flags: Fact[];
  /** La pièce : un fait précis et sa provenance, avec le lien public quand il existe. */
  evidence?: { text: Fact; source: GridSource; proof?: string };
}

/** La grille d'une fiche, ou d'une comparaison (la note du dossier). */
export interface Grid {
  criteria: GridCriterion[];
  /** Moyenne pondérée des critères comptés, × 10, entier de 1 à 99. */
  overall: number;
  /** capped_unproven : aucun code prouvé (plafond 85) ; empty_file : moins d'un quart des coefficients noté (note 20). */
  rule?: "capped_unproven" | "empty_file";
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
  /** Carte déclarative (source `cv`) jugée sur un profil LinkedIn plutôt qu'un PDF (§18.24). Absent : un CV. */
  declaredSource?: DeclaredSource;
  /** Fiche LinkedIn seule : l'adresse publique du profil, pour la relancer avec un GitHub (§18.24). */
  linkedinUrl?: string;
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
  /** Les trois trouvailles les plus fortes de l'enquête (§18.26), la plus forte d'abord. Absentes des fiches d'avant. */
  findings?: Finding[];
  /** « Plus recherché que `percent` % » des profils sourcés par Azerit, dans le groupe dit (§18.3). Absent sans table de référence. */
  rank?: { percent: number; group: { kind: "language" | "position" | "all"; key?: string } };
  /** Le barème de recrutement (0.4.0) : huit critères sur 10, dont `overall` est la moyenne. Absent des fiches d'avant. */
  grid?: Grid;
}

/** Comparaison CV contre GitHub (§6.5). */
export interface ComparisonData {
  id: string;
  createdAt: string;
  /** Ce que `cv` est vraiment : un CV en PDF, ou le profil LinkedIn (§18.24). Absent : un CV. */
  declaredSource?: DeclaredSource;
  cv: CardData;
  github: CardData;
  /** github - cv par stat (positif = le code vaut plus que le CV). */
  deltas: Record<StatCode, number>;
  /** Titre généré par règle. */
  headline: Fact;
  /** La note du dossier : chaque critère pris sur sa source de preuve. Absente des comparaisons d'avant 0.4.0. */
  grid?: Grid;
}

/** Rang d'une fiche GitHub dans le top de sa semaine (§18.22). Absent : hors classement. */
export interface WeekRank {
  /** 1 = en tête. Une ligne par login, sa meilleure note de la semaine. */
  rank: number;
  /** Nombre de logins classés cette semaine-là. */
  total: number;
  /** Points qui manquent pour passer devant le 5e ; 0 dans le top 5. */
  gapToTop5: number;
  inTop5: boolean;
  /** Numéro de la semaine ISO (lundi 00:00 UTC au dimanche 23:59 UTC). */
  week: number;
  /** La semaine est finie : le classement ne bouge plus. */
  closed: boolean;
}

/** Une ligne du top de la semaine (GET /api/top). Rien de privé : ce qui est déjà sur la fiche publique. */
export interface TopEntry {
  rank: number;
  cardId: string;
  login: string;
  avatarUrl?: string;
  overall: number;
  stars: Stars;
  /** Nom du profil criminel (§18.2), si la fiche en a un. */
  profile?: Fact;
}

export interface WeekTop {
  /** Lundi 00:00 UTC, en ms. */
  weekStart: number;
  /** Lundi suivant 00:00 UTC, en ms : la fin de la semaine. */
  endsAt: number;
  /** Numéro de la semaine ISO. */
  week: number;
  /** Nombre de logins classés cette semaine. */
  total: number;
  entries: TopEntry[];
}

/** Réponse de GET /api/card/:id pendant et après le traitement. */
export type JobState =
  /** `queue` : rang dans la file d'attente (1 = la prochaine à passer). Absent dès que la fiche est en traitement. */
  /** `findings` : les trouvailles déjà sorties (§18.26), dans l'ordre où les montrer, la plus forte en dernier. */
  | { state: "pending"; progress: ProgressEvent[]; queue?: number; findings?: Finding[] }
  /** `mine` : la session GitHub est propriétaire revendiquée du login de la fiche (§18.1). */
  | { state: "done"; kind: "card"; card: CardData; week?: WeekRank; mine?: boolean }
  | { state: "done"; kind: "comparison"; comparison: ComparisonData; week?: WeekRank; mine?: boolean }
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
  /** Fiche ou login masqué par son propriétaire revendiqué (§18.1) : « Ce dossier a quitté la ville ». */
  | "gone"
  /** Entrée LinkedIn impossible : pas de clé, budget du jour épuisé, profil introuvable (§18.24). */
  | "linkedin"
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
