// Contrat partagé entre le moteur (server), le rendu de carte (shared/card) et
// le front (web). Toute carte affichée ou rendue en PNG est un `CardData`.
// SPEC.md §3 (anatomie), §4 (jugement), §5 (statuts).
import type { ColorwayKey } from "./card/colorways";

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

/** Une pièce d'un dossier (SPEC §18.36) : ce qui déclare le parcours, et GitHub. */
export type Piece = DeclaredSource | "github";

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
  /** La phrase de la fiche (§18.107) : celle de la personne à la lecture, celle du catalogue rangée. */
  tagline: Fact;
  /** La phrase que l'IA a écrite pour cette personne, contrôlée (shared/punchline.ts). Absente : la fiche tire la sienne au recueil. */
  line?: Fact;
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

/**
 * Le niveau d'expérience auquel le dossier est lu (barème 0.5.0, SPEC §18.84) : la note
 * dit « quel niveau pour cette expérience », plus « combien d'années ». Moins d'un an
 * compté, de 1 à 3 ans, de 3 à 6, de 6 à 10, 10 et plus (data/grid.json, `seniority`).
 */
export type SeniorityCode = "student" | "junior" | "mid" | "senior" | "expert";
export const SENIORITY_CODES: SeniorityCode[] = ["student", "junior", "mid", "senior", "expert"];

export interface GridSeniority {
  code: SeniorityCode;
  /** Mois comptés sur les postes datés (stage et alternance pour moitié) ; années actives × 12 quand GitHub estime. */
  months: number;
  /** linkedin : compté sur les postes datés (LinkedIn ou CV) ; github : estimé sur les années actives. */
  source: "linkedin" | "github";
  /** Des années affirmées, sans aucun poste daté. */
  claimed?: boolean;
}

/** D'où vient une note ou une pièce : ce qui déclare (LinkedIn ou CV), ce qui prouve (GitHub), ou les deux recoupés. */
export type GridSource = "linkedin" | "github" | "both";

/**
 * La pièce d'un critère : un fait précis, d'où il vient, et le lien public qui
 * le prouve. `source` est la vérité de l'étiquette : « both » (« recoupé ») dit
 * que la pièce met les deux sources face à face, quelle que soit la source où la
 * note a été prise (`GridCriterion.source`).
 */
export interface GridEvidence {
  text: Fact;
  source: GridSource;
  proof?: string;
  /**
   * La même pièce pour une page vue par quelqu'un d'autre : écrite par le moteur
   * sans aucun nom d'école ni d'employeur, ni texte libre de la personne
   * (intitulés, descriptions, extraits), seulement des comptes, des dates et des
   * rangs. Présente sur toute pièce lue sur LinkedIn ou le CV (source
   * « linkedin » ou « both ») ; absente d'une pièce GitHub, qui se montre telle
   * quelle. Les fiches d'avant ne l'ont pas : le front retombe alors sur le rang
   * d'école ou le niveau atteint.
   */
  publicText?: Fact;
}

/**
 * Un critère : une seule note sur 10, lue dans sa table de niveaux (le niveau
 * le plus haut dont toute la ligne est remplie), la même table que la source
 * soit LinkedIn, le CV ou GitHub. Depuis 0.6.0 (SPEC §18.106), une seule chose
 * s'y ajoute : la preuve (`bonus`), quand GitHub montre le critère ou le recoupe.
 */
export interface GridCriterion {
  code: CriterionCode;
  /** Entier de 0 à 10 ; null si non prouvé ou non renseigné. */
  score: number | null;
  /** scored : noté sur sa source de preuve ; declared : lu sur LinkedIn ou le CV, dans la même table, compté comme le reste (0.6.0 ; avant, table arrêtée à 6 et hors moyenne sous les autres) ; unproven : la source ne montre rien de jugeable ; missing : sans objet. */
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
  evidence?: GridEvidence;
  /**
   * La table où la note a été lue, du plus haut au plus bas, quand elle dépend du niveau
   * d'expérience (parcours, stack, ownership ; barème 0.5.0). Absente : la table commune du critère.
   */
  table?: { score: number; text: Fact }[];
  /** Page partagée (shared/publicView.ts) : la note est gardée pour la personne fichée (l'école hors moyenne). */
  private?: boolean;
  /**
   * La preuve (0.6.0) : les points ajoutés à la note de la table parce que GitHub montre
   * le critère, ou recoupe ce que LinkedIn ou le CV déclare (`score` les inclut, plafonné
   * à 10). Absent : rien de prouvé, ou une grille d'avant.
   */
  bonus?: number;
}

/** La grille d'une fiche, ou d'une comparaison (la note du dossier). */
export interface Grid {
  criteria: GridCriterion[];
  /** Moyenne pondérée des critères comptés, × 10, entier de 1 à 99 ; depuis 0.6.0, avec le petit aléa de la fiche (shared/jitter.ts, jamais dit sur le site). */
  overall: number;
  /** capped_unproven : aucun code prouvé (plafond 85 sous 0.5.0, 80 depuis 0.6.0) ; empty_file : moins d'un quart des coefficients noté (note 20). */
  rule?: "capped_unproven" | "empty_file";
  /** Le niveau d'expérience auquel la grille a été lue (0.5.0). Absent : inconnu, ou grille d'avant. */
  seniority?: GridSeniority;
  /** Les coefficients qui ont fait la moyenne (0.5.0). Absents : ceux du barème 0.4.0. */
  weights?: Record<CriterionCode, number>;
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
  /**
   * L'école lue sur LinkedIn ou le CV, ramenée à la liste des bandes (data/bands.json, §18.38) :
   * son id. Privée : retirée de la vue publique (shared/publicView.ts), jamais dessinée sur la fiche.
   */
  school?: string;

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
  /** `seniority` (0.5.0) : parmi les profils du même niveau d'expérience, quand la table de référence a ce groupe. */
  rank?: { percent: number; group: { kind: "language" | "position" | "all" | "seniority"; key?: string } };
  /**
   * Le barème de recrutement : huit critères sur 10, dont `overall` est la moyenne. Absent des
   * fiches d'avant 0.4.0, et (0.5.0) des pièces d'un dossier : une pièce n'a ni grille ni note
   * à elle, `overall` et `tier` y sont ceux du dossier (`ComparisonData.grid`).
   */
  grid?: Grid;
  /** Pièce GitHub d'un dossier, trop mince pour juger (0.5.0) : ses critères sont non prouvés au dossier. */
  unjudged?: boolean;
  /**
   * Vue publique (shared/publicView.ts) : un dossier vide fait par un tiers et pas encore
   * revendiqué. Sa note ne se dit pas dans l'aperçu de lien ni le texte de partage.
   */
  sealed?: boolean;
  /**
   * La fiche d'un dossier à deux pièces (shared/caseFile.ts) : ses pièces, la déclarative
   * d'abord (« Pièces au dossier : LinkedIn · GitHub »). Absent d'une fiche à une seule pièce.
   */
  pieces?: Piece[];
  /**
   * Le coloris de la fiche (§18.102), tiré au hasard à sa naissance et rangé avec elle : il ne
   * change plus, et l'image de partage a la couleur de l'écran. Absent (fiches d'avant) : tiré de l'id.
   */
  colorway?: ColorwayKey;
}

/**
 * Un dossier à deux pièces (§18.36) : la pièce déclarative (CV ou LinkedIn) et la pièce
 * GitHub, une seule note. Le nom interne reste « comparaison ». Il s'affiche comme une
 * fiche seule, la fiche du dossier (shared/caseFile.ts).
 */
export interface ComparisonData {
  id: string;
  createdAt: string;
  /** Ce que `cv` est vraiment : un CV en PDF, ou le profil LinkedIn (§18.24). Absent : un CV. */
  declaredSource?: DeclaredSource;
  cv: CardData;
  github: CardData;
  /** Écarts stat par stat : rangés par les dossiers d'avant le 13 novembre 2026, plus produits ni lus (§18.36). */
  deltas?: Record<StatCode, number>;
  /** Titre de l'écart : rangé par les dossiers d'avant le 13 novembre 2026, plus produit ni lu (§18.36). */
  headline?: Fact;
  /**
   * La grille et la note du dossier, la seule de la personne (0.5.0 : calculée une fois sur les
   * deux pièces, qui n'en portent aucune à elles). Absente des comparaisons d'avant 0.4.0.
   */
  grid?: Grid;
  /**
   * La fiche du dossier, attachée par la vue publique (shared/publicView.ts) avant que la
   * grille ne parte : un dossier fait par un tiers garde sa note. Absente : `caseCard` la calcule.
   */
  file?: CardData;
  /** Le coloris du dossier (§18.102), celui de sa fiche ; ses pièces n'en ont pas à elles. */
  colorway?: ColorwayKey;
  /** Dossier LinkedIn dont le lien avec le GitHub n'est pas prouvé (§18.24) : « Lien entre les deux pièces : à confirmer ». */
  linkUnproven?: boolean;
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

/**
 * La personne d'une ligne de classement (top de la semaine, fiches d'une bande, §18.88) :
 * ce que sa fiche montre déjà. Construite par shared/boardPerson.ts.
 */
export interface BoardPerson {
  /** L'adresse de la fiche : /c/{cardId}. */
  cardId: string;
  /** Le nom de la fiche. Absent quand elle n'a que son pseudo. */
  name?: string;
  /** Pseudo GitHub, si la fiche en a un. */
  login?: string;
  /** La photo de la fiche. Absente : les initiales. */
  avatarUrl?: string;
  initials: string;
}

/** Une ligne du top de la semaine (GET /api/top) : la personne de la fiche (son nom, son visage, sa fiche, §18.88) et sa note. Rien de privé : ce qui est déjà sur la fiche publique. */
export interface TopEntry extends BoardPerson {
  rank: number;
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
  /** Nombre de personnes classées cette semaine. */
  total: number;
  entries: TopEntry[];
}

/**
 * L'autre source de la personne, trouvée pendant la lecture de sa fiche (SPEC §18.100) : proposée
 * sous sa fiche, à elle seule, et attachée seulement si elle dit oui. `sure` : son GitHub affiche ce
 * LinkedIn ; sinon, son nom, son pseudo et son employeur concordent. Jamais un email.
 */
export type Proposal =
  | { kind: "github"; login: string; name: string | null; avatarUrl: string; sure: boolean }
  | { kind: "linkedin"; url: string; name: string; headline: string; photoUrl?: string; sure: boolean };

/** Réponse de GET /api/card/:id pendant et après le traitement. */
export type JobState =
  /** `queue` : rang dans la file d'attente (1 = la prochaine à passer). Absent dès que la fiche est en traitement. */
  /** `findings` : les trouvailles déjà sorties (§18.26), dans l'ordre où les montrer, la plus forte en dernier. */
  /** `timeLeft` : ms avant que le serveur coupe la fiche en traitement (rallonge LinkedIn comprise). Absent en file. */
  | { state: "pending"; progress: ProgressEvent[]; queue?: number; findings?: Finding[]; timeLeft?: number }
  /** `mine` : la session GitHub est propriétaire revendiquée du login de la fiche (§18.1). `propose` : à la personne fichée seulement (§18.100). */
  | { state: "done"; kind: "card"; card: CardData; week?: WeekRank; mine?: boolean; propose?: Proposal }
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
  3: { fr: "Mandat d'arrêt", en: "Warrant out" },
  4: { fr: "Haute surveillance", en: "Under surveillance" },
  5: { fr: "Menace publique", en: "Public menace" },
  6: { fr: "Priorité absolue", en: "Top priority" },
};
