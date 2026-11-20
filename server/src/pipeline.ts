// Traitement d'une demande de carte, en tâche de fond (SPEC §4, §6.2, §12).
// Les modules du moteur arrivent par injection (`Deps`) : deps.ts câble les
// vrais, les tests injectent des faux.
//
// GitHub : collect → (lecture IA si dispo : pickFilesForReading → readCode) → scoreGithub
// CV     : extractPdfText → cvTextCounts → readCv → scoreCv
// Les deux : branches en parallèle, puis scoreDossier : un calcul sur les deux pièces, une note.
//
// Rien n'attend ce qui ne lui sert pas (SPEC §18.93) : la lecture du LinkedIn part
// dès que le profil GitHub est lu, la lecture du code dès que les arbres et les
// commits le sont, pendant que la collecte finit ; à l'entrée LinkedIn, le GitHub
// déjà connu par l'identité se collecte pendant la lecture du profil.

import { randomBytes, randomInt } from "node:crypto";
import { randomColorway, type ColorwayKey } from "../../shared/card/colorways";
import type { CardData, ComparisonData, ErrorCode, Fact, Finding, Grid, JobState, Lang, ProgressEvent, Proposal } from "../../shared/types";
import { tierFor } from "../../shared/types";
import { frTypo, typoFacts } from "../../shared/typo";
import { forReveal, githubFindings, strongest } from "./findings";
import type { CodeReadingResult, CvReading, CvTextCounts, RepoFiles } from "../../shared/readings";
import type { NewCardRow, Store } from "./db";
import { TokenPool } from "./github/tokens";
import type { GithubLookup, LinkedinFinder, LinkedinProfile } from "./linkedinProfile/index";
import { githubDeclaredOf, githubShowsLinkedin } from "./linkedinProfile/url";
import { githubFitsName, samePublicFullName } from "./names";
import { linkedinSlug, normalizeLinkedinUrl } from "../../shared/entry";
import { matchGithub, nameFromSlug, sameSearch, type GithubFound, type PersonHints } from "./match/github";
import { strongLinkedin, type GithubHints } from "./match/linkedin";
import { saveProposal } from "./match/store";
import { asLinkedinCard, asLinkedinComparison, profileToText } from "./linkedinProfile/text";
import { linkedinFindings } from "./linkedinProfile/findings";
import { highBarEmployers, type HighBarList } from "./scoring/employers";
import { GRID } from "./scoring/config";
import { jitterCard, type JitterBounds } from "../../shared/jitter";
import type { PrimeView } from "../../shared/primes";
import type { PrimeLogo } from "./render/prime";
import { phase, phaseSync, Trace, withTrace } from "./timing";

export type CardBody = Omit<CardData, "id" | "createdAt">;

/** Un jeton GitHub seul, ou le pool de jetons en rotation partagé par toutes les fiches. */
export type GithubAuth = string | TokenPool;

export interface RenderInput {
  /** `home` : l'aperçu de lien de l'accueil (/og/home.png), avec la fiche de la vitrine. `story` : 9:16, une fiche seule. */
  format: "card" | "og" | "portrait" | "story" | "home" | "prime" | "duel";
  card?: CardData;
  comparison?: ComparisonData;
  /** `prime` : l'aperçu de lien d'une prime (§18.4), et son logo en data URI s'il en a un. */
  prime?: PrimeView;
  logo?: PrimeLogo | null;
  /** `duel` : l'aperçu du lien d'une dénonciation (§18.94), les deux fiches en vues publiques. */
  duel?: { by: CardData; target: CardData };
  lang: Lang;
}

/**
 * Signatures des modules du moteur. Syntaxe de méthode exprès : les faits
 * GitHub sont opaques ici (`unknown`), et la bivariance des méthodes laisse
 * deps.ts passer les vraies fonctions typées avec `GithubFacts`.
 */
export interface Deps {
  /**
   * `onProfile` et `onReadable` : des faits partiels, donnés en avance pendant la
   * collecte (collect.ts). Le premier suffit à retrouver le LinkedIn affiché, le
   * second à choisir les fichiers à lire. Un moteur qui ne les appelle pas marche
   * aussi : tout part alors à la fin de la collecte.
   */
  collectGithub(
    login: string,
    opts: {
      token: GithubAuth;
      onProgress?: (e: { key: string; n?: number }) => void;
      signal?: AbortSignal;
      onProfile?: (facts: unknown) => void;
      onReadable?: (facts: unknown) => void;
    },
  ): Promise<unknown>;
  /** `facts` : les faits entiers, ou ceux d'`onReadable`. */
  pickFilesForReading(facts: unknown, opts: { token: GithubAuth; signal?: AbortSignal }): Promise<RepoFiles[]>;
  readCode(repos: RepoFiles[], opts?: { signal?: AbortSignal }): Promise<CodeReadingResult | null>;
  /** IA configurée. Plafond atteint ou crédit épuisé : readCode/readCv lèvent une erreur `closed`. */
  aiAvailable(): boolean;
  scoreGithub(facts: unknown, ai: CodeReadingResult | null, opts: { lang: Lang; judgedInSeconds: number }): CardBody;
  extractPdfText(buf: Uint8Array): Promise<{ text: string; pages: number }>;
  cvTextCounts(text: string, pages: number): CvTextCounts;
  readCv(text: string, opts?: { signal?: AbortSignal }): Promise<CvReading | null>;
  /**
   * `linkedin` : le profil LinkedIn rangé (`DeclaredLinkedin`), dont les postes datés
   * comptent l'expérience de la grille (§18.37) ; il ne sert qu'à noter, rien n'en est
   * gardé hors de la fiche. Typé `unknown` comme `github`, pour que deps.ts passe la
   * vraie fonction. `now` : l'heure de la fiche, fin des postes en cours.
   * `highBar` : la liste des employeurs à forte barre du serveur
   * (HIGH_BAR_EMPLOYERS_FILE), vide sans fichier.
   */
  scoreCv(
    reading: CvReading,
    counts: CvTextCounts,
    opts: { lang: Lang; judgedInSeconds: number; github?: unknown; linkedin?: unknown; now?: string; highBar?: HighBarList },
  ): CardBody;
  /**
   * Le dossier d'une personne dont on a les deux pièces (SPEC §18.84) : UNE grille et UNE
   * note, calculées une fois sur les données brutes. Les deux pièces rendues n'ont ni
   * grille ni note à elles (`overall` y est la note du dossier).
   */
  scoreDossier(
    declared: { reading: CvReading; counts: CvTextCounts; linkedin?: unknown; now?: string; highBar?: HighBarList },
    github: { facts: unknown; ai: CodeReadingResult | null },
    opts: { lang: Lang; judgedInSeconds: number },
  ): { cv: CardBody; github: CardBody; grid: Grid };
  renderImage(input: RenderInput): Promise<Uint8Array>;
}

/**
 * Les deux pièces d'un dossier telles qu'on les range (SPEC §18.84) : ni grille ni rang à
 * elles, et pour toute note celle du dossier. Posé ici, quel que soit le moteur branché :
 * rien de ce qui est écrit en base ne peut donner deux chiffres pour la même personne.
 */
export function asPieces(
  scored: { cv: CardBody; github: CardBody; grid: Grid },
  own: { cv: Pick<CardData, "id" | "createdAt">; github: Pick<CardData, "id" | "createdAt"> & Partial<Pick<CardData, "findings">> },
): Omit<ComparisonData, "id" | "createdAt"> {
  const { grid } = scored;
  const piece = (card: CardBody, extra: Pick<CardData, "id" | "createdAt"> & Partial<Pick<CardData, "findings">>): CardData => {
    const { grid: _grid, rank: _rank, ...rest } = card as CardBody & Pick<CardData, "grid" | "rank">;
    return { ...rest, ...extra, overall: grid.overall, tier: tierFor(grid.overall) };
  };
  return { cv: piece(scored.cv, own.cv), github: piece(scored.github, own.github), grid };
}

// --- La note finale : le petit aléa de la fiche (§18.106) ----------------------

/** Les bornes de l'aléa : celles de la note (data/grid.json, `final`). */
export const JITTER_BOUNDS: JitterBounds = { min: GRID.final.bounds.min, max: GRID.final.bounds.max, capUnproven: GRID.final.capUnproven };

/**
 * Les lignes d'une fiche avec sa note finale : la note exacte de la grille, plus l'aléa
 * tiré sur l'id de la fiche racine (shared/jitter.ts). Les pièces d'un dossier portent la
 * même note que lui. Juste avant l'écriture : tout ce qui lit la fiche lit cette note-là.
 */
export function finalNotes(rows: NewCardRow[]): NewCardRow[] {
  const root = rows.find((r) => !r.parentId);
  if (!root?.data.grid) return rows;
  const data = jitterCard(root.data, root.id, JITTER_BOUNDS);
  const note = { overall: data.grid!.overall, tier: tierFor(data.grid!.overall) };
  return rows.map((r) => (r === root ? { ...r, data } : r.parentId === root.id ? { ...r, data: { ...r.data, ...note } } : r));
}

/**
 * La phrase que l'IA a écrite pendant la lecture (§18.107), rangée avec le profil de
 * la fiche. Sans phrase (IA absente, sortie rejetée) ou sans profil : la fiche telle
 * quelle, qui tirera la sienne au recueil à la lecture.
 */
export function withLine<T extends Pick<CardData, "profile">>(card: T, line: Fact | undefined): T {
  return line && card.profile ? { ...card, profile: { ...card.profile, line } } : card;
}

// --- Identifiants -----------------------------------------------------------

const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const ID_RE = /^[A-Za-z0-9]{6,32}$/;

/** Id court non devinable : 10 caractères base62 tirés par crypto (~59 bits). */
export function newId(len = 10): string {
  let s = "";
  for (let i = 0; i < len; i++) s += B62[randomInt(62)];
  return s;
}

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

// --- Erreurs ----------------------------------------------------------------

export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_PAGES = 10;

type MessageKey =
  | ErrorCode
  | "github_rate_limited"
  | "queue_timeout"
  | "empty_pdf"
  | "cv_unreadable"
  | "not_found"
  | "withdrawn"
  | "bad_request"
  | "linkedin_off"
  | "linkedin_busy"
  | "linkedin_ip"
  | "linkedin_not_found"
  | "linkedin_bad_url"
  | "linkedin_unreadable";

/* Le français de chaque message passe par la typographie commune (shared/typo.ts). */
export const MESSAGES: Record<MessageKey, Fact> = typoFacts({
  unknown_user: {
    fr: "Ce pseudo n'existe pas sur GitHub. Une faute de frappe ?",
    en: "That username doesn't exist on GitHub. Typo?",
  },
  organization: {
    fr: "C'est une organisation, pas une personne. Essaie le pseudo d'un de ses membres.",
    en: "That's an organization, not a person. Try one of its members.",
  },
  not_a_pdf: {
    fr: "Ce fichier n'est pas un PDF. On ne lit que les PDF.",
    en: "That file isn't a PDF. We only read PDFs.",
  },
  empty_pdf: {
    fr: "Ce PDF ne contient pas de texte lisible (un scan ?). Exporte-le depuis ton traitement de texte.",
    en: "This PDF has no readable text (a scan?). Export it from your word processor.",
  },
  pdf_too_large: {
    fr: "PDF trop long : 5 Mo et 10 pages maximum. En recrutement, personne n'en lit plus.",
    en: "PDF too long: 5 MB and 10 pages max. No recruiter reads more.",
  },
  timeout: {
    fr: "Le jugement a pris trop de temps. Plutôt que d'inventer une fiche, on s'arrête là : réessaie dans un instant.",
    en: "Judging took too long. Rather than make up a sheet, we stopped: try again in a moment.",
  },
  rate_limited: {
    fr: "Assez de fiches pour aujourd'hui. Reviens demain : même les recruteurs font des pauses.",
    en: "That's enough sheets for today. Come back tomorrow: even recruiters take breaks.",
  },
  github_rate_limited: {
    fr: "GitHub nous demande de ralentir. Réessaie dans quelques minutes.",
    en: "GitHub is asking us to slow down. Try again in a few minutes.",
  },
  closed: {
    fr: "Le commissariat a fermé pour aujourd'hui. Reviens demain.",
    en: "The station is closed for the day. Come back tomorrow.",
  },
  busy: {
    fr: "Le commissariat déborde : trop de dossiers d'un coup, GitHub nous fait souffler. Reviens dans quelques minutes.",
    en: "The station is overflowing: too many files at once, GitHub is making us take a breather. Come back in a few minutes.",
  },
  gone: {
    fr: "Ce dossier a quitté la ville : fiche retirée à la demande de la personne.",
    en: "This dev has left town: rap sheet taken down at their request.",
  },
  withdrawn: {
    fr: "Fiche retirée à la demande de la personne.",
    en: "Taken down at the person's request.",
  },
  queue_timeout: {
    fr: "Trop de monde au commissariat : ton dossier a attendu plus de 3 minutes sans passer. Réessaie dans un instant.",
    en: "The station is packed: your file waited more than 3 minutes without being seen. Try again in a moment.",
  },
  cv_unreadable: {
    fr: "On n'a pas réussi à lire ce CV pour l'instant. Réessaie dans un instant.",
    en: "We couldn't read this résumé right now. Try again in a moment.",
  },
  not_found: {
    fr: "Fiche introuvable : elle a expiré ou a été supprimée.",
    en: "Sheet not found: it expired or was deleted.",
  },
  /* La sortie n'est jamais GitHub seul : qui n'a pas de GitHub garde son CV. */
  linkedin: {
    fr: "LinkedIn ne répond pas pour l'instant. Passe par ton GitHub ou ton CV, ou réessaie dans un moment.",
    en: "LinkedIn isn't answering right now. Use your GitHub or your résumé, or try again in a moment.",
  },
  linkedin_off: {
    fr: "LinkedIn ne répond pas pour l'instant. Passe par ton GitHub ou ton CV, ou réessaie dans un moment.",
    en: "LinkedIn isn't answering right now. Use your GitHub or your résumé, or try again in a moment.",
  },
  linkedin_busy: {
    fr: "LinkedIn est fermé pour aujourd'hui. Passe par ton GitHub ou ton CV, ou reviens demain.",
    en: "LinkedIn is closed for today. Use your GitHub or your résumé, or come back tomorrow.",
  },
  /* La limite de l'IP (PAID_CALLS_PER_IP), pas le plafond du jour. */
  linkedin_ip: {
    fr: "Tu as lu beaucoup de profils LinkedIn aujourd'hui. Passe par ton GitHub, ou reviens demain.",
    en: "You've read a lot of LinkedIn profiles today. Use your GitHub, or come back tomorrow.",
  },
  linkedin_not_found: {
    fr: "Profil LinkedIn introuvable (privé ou trop récent). Vérifie le lien, ou passe par ton GitHub ou ton CV.",
    en: "LinkedIn profile not found (private or too new). Check the link, or use your GitHub or your résumé.",
  },
  linkedin_bad_url: {
    fr: "Ce lien n'est pas un profil LinkedIn (linkedin.com/in/…).",
    en: "That link isn't a LinkedIn profile (linkedin.com/in/…).",
  },
  linkedin_unreadable: {
    fr: "On n'a pas réussi à lire ce profil LinkedIn pour l'instant. Réessaie dans un instant.",
    en: "We couldn't read this LinkedIn profile right now. Try again in a moment.",
  },
  bad_request: {
    fr: "Donne ton lien LinkedIn, ton pseudo GitHub ou ton CV en PDF.",
    en: "Give your LinkedIn link, your GitHub username or your résumé as a PDF.",
  },
  internal: {
    fr: "Quelque chose a cassé de notre côté. Réessaie dans un instant.",
    en: "Something broke on our side. Try again in a moment.",
  },
});

/** Erreur de job déjà traduite en code public et message. */
export class JobError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly msg: Fact,
  ) {
    super(code);
  }
}

/** IA coupée (AiClosedError : plafond du jour ou crédit épuisé), reconnue à son `code`. */
export function isAiClosed(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === "closed";
}

/** `busy` avec le temps à attendre avant que GitHub nous rende la main. */
export function busyError(waitMs: number): JobError {
  const n = Math.max(1, Math.ceil(waitMs / 60_000));
  return new JobError("busy", {
    fr: frTypo(`Le commissariat déborde : trop de dossiers d'un coup, GitHub nous fait souffler. Reviens dans ${n} minute${n > 1 ? "s" : ""}.`),
    en: `The station is overflowing: too many files at once, GitHub is making us take a breather. Come back in ${n} minute${n > 1 ? "s" : ""}.`,
  });
}

/** EngineError, CvError et AiClosedError sont reconnus à leur champ `code`, sans importer leurs modules. */
export function classifyError(err: unknown): JobError {
  if (err instanceof JobError) return err;
  const code = (err as { code?: unknown } | null)?.code;
  switch (code) {
    case "closed":
      return new JobError("closed", MESSAGES.closed);
    case "unknown_user":
    case "organization":
    case "not_a_pdf":
    case "pdf_too_large":
      return new JobError(code, MESSAGES[code]);
    case "empty_pdf":
      return new JobError("not_a_pdf", MESSAGES.empty_pdf);
    case "rate_limited":
      return new JobError("rate_limited", MESSAGES.github_rate_limited);
    case "timeout":
      return new JobError("timeout", MESSAGES.timeout);
    default:
      return new JobError("internal", MESSAGES.internal);
  }
}

// --- Jobs -------------------------------------------------------------------

export interface PipelineOptions {
  store: Store;
  deps: Deps;
  /** Jeton GitHub unique, si `githubPool` n'est pas donné. */
  githubToken?: string;
  /** Jetons GitHub en rotation (GITHUB_TOKENS), partagés par toutes les fiches. */
  githubPool?: TokenPool;
  /** Délai de traitement d'une fiche (SPEC §12), hors file d'attente ; CARD_TIMEOUT_MS par défaut. */
  timeoutMs?: number;
  /** Durée de conservation en mémoire d'un job en erreur. */
  errorTtlMs?: number;
  /** Fiches traitées en même temps (MAX_CONCURRENT_CARDS) ; les suivantes attendent en file. */
  maxConcurrent?: number;
  /** Au-delà de ce temps en file, la fiche échoue en `timeout`. */
  queueTimeoutMs?: number;
  /** Jetons GitHub épuisés : on garde la fiche en file si la remise à zéro arrive avant ce délai, sinon `busy`. */
  busyAfterMs?: number;
  /** LinkedIn contre GitHub (§18.24). Absent : pas de jeton de fournisseur, la fonctionnalité n'existe pas. */
  linkedin?: LinkedinFinder;
  /**
   * Lien LinkedIn ↔ GitHub dont le serveur se porte garant (la vitrine, §18.35) :
   * `linkedinUrl` normalisée. Ce pseudo lit ce LinkedIn quand le joueur n'en donne
   * pas, et leur comparaison compte comme prouvée.
   */
  vouched?: { login: string; linkedinUrl: string };
  /**
   * La photo LinkedIn de la fiche (§18.99) : télécharge `url` (media.licdn.com) et la range
   * sous le nom de la fiche, rend son adresse chez nous ; une adresse LinkedIn signée expire.
   * Absent : aucune photo LinkedIn à la naissance d'une fiche.
   */
  keepPhoto?: (url: string, cardId: string) => Promise<string>;
  /**
   * Où va la ligne de chronométrage de chaque fiche (timing.ts) : une ligne par
   * fiche sortie ou en échec. Par défaut le journal du serveur (rien sous
   * vitest) ; `false` la coupe.
   */
  timingLog?: ((line: string, trace: Trace) => void) | false;
  /**
   * Les propositions sous une fiche (§18.100) : le GitHub d'une fiche LinkedIn seule, le LinkedIn
   * d'une fiche GitHub seule, cherchés pendant sa lecture (deux secondes au plus), jamais attachés.
   * Absent : aucune.
   */
  propose?: {
    github?: (person: PersonHints, signal: AbortSignal) => Promise<Proposal | null>;
    linkedin?: (gh: GithubHints, opts: { spend?: () => boolean; signal: AbortSignal }) => Promise<Proposal | null>;
    /** Les comptes GitHub à ce nom, pas encore notés (§18.121) : la dénonciation les cherche dès son départ. */
    githubAccounts?: (name: string, signal: AbortSignal) => Promise<GithubFound | null>;
  };
}

export const MAX_CONCURRENT_CARDS = 4;
/**
 * Délai de traitement d'une fiche, compté dès qu'elle sort de la file
 * (CARD_TIMEOUT_MS dans l'environnement). Une vraie fiche prend 24 s mesurées
 * (§18.32), bien plus quand GitHub traîne : 60 s laissent la marge.
 */
export const CARD_TIMEOUT_MS = 60_000;
/** Entrée GitHub : le LinkedIn n'est attendu que jusqu'à cette marge avant le délai de la fiche. */
export const LINKEDIN_MARGIN_MS = 2500;
/** Après une lecture de profil lente : au moins ce temps laissé à la lecture IA et au barème. */
export const LINKEDIN_AFTER_MS = 25_000;
export const QUEUE_TIMEOUT_MS = 3 * 60_000;
export const BUSY_AFTER_MS = 2 * 60_000;

/**
 * Marge d'appels GitHub qu'il faut sur un jeton pour lancer une fiche. Une fiche
 * en consomme quelques dizaines en REST (pages de repos, arbres, commits) et
 * quelques requêtes GraphQL (calendrier, années, premier commit).
 */
export const CARD_GITHUB_NEED = { core: 200, graphql: 40 };

interface Job {
  id: string;
  /** queued : en file ; running : en traitement ; error : échec gardé en mémoire. */
  state: "queued" | "running" | "error";
  input: JobInput;
  deleteToken: string;
  progress: ProgressEvent[];
  /** Trouvailles de l'enquête (§18.26), toutes sources, dans l'ordre d'arrivée. */
  findings: Finding[];
  /** Entrée en file, puis début du traitement : les `at` de la progression partent de là. */
  startedAt: number;
  /** Temps passé en file avant le traitement (ms). */
  queuedMs?: number;
  /** Fin du délai de traitement (ms epoch), dès que la fiche sort de la file ; repoussée par LinkedIn. */
  deadline?: number;
  finishedAt?: number;
  error?: JobError;
  done: Promise<void>;
  /** Résout `done` (fin du traitement, ou échec avant même de démarrer). */
  settle: () => void;
  queueTimer?: ReturnType<typeof setTimeout>;
}

export interface JobInput {
  lang: Lang;
  login?: string;
  pdf?: Uint8Array;
  /**
   * Adresse LinkedIn normalisée (§18.24). Seule : entrée LinkedIn. Avec un
   * pseudo : la comparaison avec ce LinkedIn-là (« Ajoute ton GitHub »).
   */
  linkedinUrl?: string;
  /** Prend une unité de la limite par IP avant une lecture payante de profil ; false : refusé. */
  linkedinSpend?: () => boolean;
  /**
   * Entrée « Se connecter avec LinkedIn » (§18.80) : le GitHub retrouvé d'après
   * l'identité rendue par LinkedIn. `email` : un commit signé de son adresse
   * vérifiée, une preuve, qui passe devant les liens du profil. `name` : le seul
   * compte à son nom, un indice, pris seulement si le profil ne donne aucun
   * GitHub, et jamais prouvé. `sureProfile` : le profil lu est sûrement le sien
   * (email ou photo), pas un choix parmi des homonymes.
   */
  identity?: { githubLogin: string; how: "email" | "name"; sureProfile: boolean };
  /**
   * Connectée à LinkedIn sur son profil sûr (email ou photo), elle a donné ou confirmé
   * ce pseudo-là avant le jugement (§18.111, §18.113) : son nom de connexion, et
   * `email` si ce GitHub est aussi celui de son email. Le dossier est prouvé si ce
   * GitHub est plausiblement le sien (`signedInProof`, §18.116).
   */
  signedInGithub?: { name: string; email?: boolean };
  /** Entrée « Se connecter avec LinkedIn » : la photo que LinkedIn vient de rendre de la personne (§18.99). */
  photo?: string;
  /** La fiche est celle que la personne fait pour elle (jamais une dénonciation) : l'autre source se cherche pour la lui proposer (§18.100). */
  propose?: boolean;
  /**
   * Une dénonciation (§18.121) : l'autre source se trouve d'office, attachée quand le lien est fort
   * (`linkedinProof: "match"`), proposée à la personne sinon. `name` : le nom de la suggestion
   * touchée, qui lance la recherche du GitHub dès le départ, pendant la lecture du profil.
   */
  match?: { name?: string };
  /** Prend une unité de la limite par IP des recherches de profils par nom (§18.90) ; false : refusé. */
  searchSpend?: () => boolean;
  /** Le coloris de la fiche que ce dossier complète (§18.102) : la personne garde sa couleur. Absent : tiré au hasard. */
  colorway?: ColorwayKey;
}

/** Une proposition pas encore prête quand la fiche l'est : attendue ce temps-là au plus, puis la fiche sort sans elle. */
export const PROPOSE_WAIT_MS = 1000;

/** Une photo LinkedIn qui traîne au téléchargement n'est plus attendue à la sortie de la fiche. */
const PHOTO_WAIT_MS = 2500;

interface Ctx {
  signal: AbortSignal;
  emit(key: string, n?: number): void;
  /** Verse des trouvailles au dossier (§18.26) : toutes les sources poussent dans la même liste. */
  find(list: Finding[]): void;
  findings(): Finding[];
  seconds(): number;
  /** Fin du délai de la fiche (ms epoch). */
  deadline(): number;
  /** Fin du délai d'origine, avant toute rallonge (ms epoch). */
  readonly budgetEnd: number;
  /** Repousse la fin du délai (lecture LinkedIn lente, §18.24). Jamais en arrière. */
  extendTo(at: number): void;
  /** L'autre source à proposer sous la fiche (§18.100), rangée avec elle. */
  proposal?: Proposal | null;
}

/** Une collecte GitHub à l'essai (§18.121) : sa progression et ses trouvailles retenues tant qu'elle n'est pas gardée. */
interface Trial {
  login: string;
  p: Promise<GithubResult>;
  /** C'est ce compte : ce qu'elle a retenu passe à la fiche, la suite aussi. */
  keep(): void;
  /** Ce n'est pas ce compte : coupée, rien n'en sort. */
  drop(): void;
}

/** La valeur de `p` si elle vient dans `ms`, sinon null ; une erreur vaut null. */
function within<T>(p: Promise<T | null>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((res) => {
    timer = setTimeout(() => res(null), ms);
    timer.unref?.();
  });
  return Promise.race([p.catch(() => null), late]).finally(() => clearTimeout(timer));
}

/**
 * Le dossier d'une personne connectée à LinkedIn, avec le GitHub qu'elle a donné ou
 * confirmé (§18.116) : prouvé si c'est ce pseudo et ce profil-là, et que ce GitHub est
 * plausiblement le sien (son email y mène, ou son nom concorde). La raison, sinon null.
 */
export function signedInProof(input: JobInput, login: string | undefined, linkedinUrl: string, facts: unknown, profileName: string | undefined): "signin+email" | "signin+name" | null {
  const s = input.signedInGithub;
  if (!s || !login || !input.login || login.toLowerCase() !== input.login.toLowerCase() || linkedinUrl !== input.linkedinUrl) return null;
  if (s.email) return "signin+email";
  const gh = githubDeclaredOf(facts);
  return [s.name, profileName].some((n) => githubFitsName(n, gh?.login ?? login, gh?.name)) ? "signin+name" : null;
}

/** Ce que la fiche GitHub sait de la personne, pour lui chercher son LinkedIn. */
function githubHints(facts: unknown): GithubHints | null {
  const gh = githubDeclaredOf(facts);
  if (!gh) return null;
  const company = (facts as { profile?: { company?: unknown } } | null)?.profile?.company;
  return { login: gh.login, name: gh.name ?? null, company: typeof company === "string" ? company : null };
}

/** Ce que la grille lit du profil LinkedIn : postes datés, formation, compétences, adresse. */
type DeclaredLinkedin = Pick<LinkedinProfile, "roles" | "education" | "skills" | "url">;

/** Le profil réduit à ce que lit la grille : ni nom, ni titre, ni photo. */
function declaredLinkedin(p: LinkedinProfile): DeclaredLinkedin {
  return { roles: p.roles, education: p.education, skills: p.skills, url: p.url };
}

interface LinkedinResult {
  profile: LinkedinProfile;
  /** Le chercheur dit le lien avec ce GitHub prouvé (GitHub affiche ce LinkedIn, ou la recherche). */
  proven: boolean;
  cv: CvResult;
}

/**
 * Une lecture de profil commence (jusqu'à `ms`, 60 s chez Apify) : ce temps ne
 * compte pas dans le délai de la fiche, repoussé d'autant (§18.24), et jamais à
 * moins de LINKEDIN_AFTER_MS après la fin de la lecture. L'attente le dit au
 * front, qui lit le nouveau délai dans l'état du job (`timeLeft`).
 */
function linkedinSlow(ctx: Ctx) {
  return (ms: number) => {
    ctx.emit("linkedin_wait");
    ctx.extendTo(Math.max(ctx.budgetEnd + ms, Date.now() + ms + LINKEDIN_AFTER_MS));
  };
}

/** Le GitHub donné n'existe pas (ou plus), ou c'est une organisation. */
function isMissingGithub(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === "unknown_user" || code === "organization";
}

/**
 * La valeur de `p` si elle arrive avant `at()` (ms epoch, relu à l'échéance :
 * le délai peut avoir été repoussé entre-temps), sinon null ; une erreur vaut null.
 */
function settleBefore<T>(p: Promise<T>, at: () => number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    const arm = () => {
      const wait = at() - Date.now();
      if (wait <= 0) return resolve(null);
      timer = setTimeout(arm, wait);
      timer.unref?.();
    };
    arm();
  });
  return Promise.race([p.catch(() => null), late]).finally(() => clearTimeout(timer));
}

interface GithubResult {
  facts: unknown;
  ai: CodeReadingResult | null;
  /**
   * Il y avait du code à lire, mais aucune lecture IA n'est revenue (IA non
   * configurée, panne, sortie invalide) : la fiche sort, hors cache 24 h (§12).
   */
  degraded: boolean;
  /** Fiche GitHub seule de moins de 24 h : resservie telle quelle si le pseudo est seul ; au dossier, seules ses données brutes servent. */
  cached?: CardData;
}

interface CvResult {
  counts: CvTextCounts;
  reading: CvReading | null;
}

export class Pipeline {
  private jobs = new Map<string, Job>();
  /** Fiches sorties de `jobs` dont les suites (`wait`) n'ont pas encore couru. */
  private settling = new Map<string, Promise<void>>();
  private inflight = new Map<string, string>(); // pseudo en minuscules → id du job GitHub en cours
  private readonly timeoutMs: number;
  private readonly errorTtlMs: number;
  private readonly maxConcurrent: number;
  private readonly queueTimeoutMs: number;
  private readonly busyAfterMs: number;
  /** File d'attente, dans l'ordre d'arrivée. */
  private queue: Job[] = [];
  private running = 0;
  private recheck?: ReturnType<typeof setTimeout>;
  readonly github: TokenPool;

  constructor(private opts: PipelineOptions) {
    this.timeoutMs = opts.timeoutMs ?? CARD_TIMEOUT_MS;
    this.errorTtlMs = opts.errorTtlMs ?? 3600_000;
    this.maxConcurrent = Math.max(1, Math.floor(opts.maxConcurrent ?? MAX_CONCURRENT_CARDS));
    this.queueTimeoutMs = opts.queueTimeoutMs ?? QUEUE_TIMEOUT_MS;
    this.busyAfterMs = opts.busyAfterMs ?? BUSY_AFTER_MS;
    this.github = opts.githubPool ?? new TokenPool(opts.githubToken ? [opts.githubToken] : []);
  }

  /** État en mémoire d'un job en file, en cours ou en erreur. null : voir la base. */
  jobState(id: string): JobState | null {
    const job = this.jobs.get(id);
    if (!job) return null;
    if (job.state === "queued") return { state: "pending", progress: [], queue: this.queue.indexOf(job) + 1 };
    if (job.state === "running") {
      const findings = forReveal(job.findings);
      // Le temps qui reste avant que le serveur coupe : le front patiente jusque-là (rallonge LinkedIn comprise).
      const timeLeft = job.deadline === undefined ? null : Math.max(0, job.deadline - Date.now());
      return { state: "pending", progress: [...job.progress], ...(findings.length ? { findings } : {}), ...(timeLeft === null ? {} : { timeLeft }) };
    }
    return { state: "error", code: job.error!.code, message: job.error!.msg };
  }

  /** Fiches en traitement et en file (diagnostic, tests). */
  load(): { running: number; queued: number } {
    return { running: this.running, queued: this.queue.length };
  }

  /**
   * Jetons GitHub épuisés pour plus de `busyAfterMs` : l'erreur `busy` à rendre
   * tout de suite plutôt que de mettre une fiche GitHub en file. null : ça passe.
   */
  githubBusy(): JobError | null {
    const r = this.githubReadiness();
    return !r.ok && r.waitMs >= this.busyAfterMs ? busyError(r.waitMs) : null;
  }

  private githubReadiness() {
    // Sans jeton (dev), pas de file d'attente sur GitHub : 60 appels par heure, on fait avec.
    return this.github.anonymous ? ({ ok: true } as const) : this.github.readiness(CARD_GITHUB_NEED);
  }

  /** Job GitHub seul déjà en cours pour ce pseudo (déduplication). */
  inflightFor(login: string): string | undefined {
    return this.inflight.get(login.toLowerCase());
  }

  /**
   * Attend la fin d'un job (tests, arrêt propre, suites d'une fiche posée). Une
   * fiche tout juste sortie de `jobs` s'attend encore : qui arrive à cet instant
   * ne passe pas devant ceux qui attendaient déjà.
   */
  async wait(id: string): Promise<void> {
    await (this.jobs.get(id)?.done ?? this.settling.get(id));
  }

  async drain(): Promise<void> {
    await Promise.all([...this.jobs.values()].map((j) => j.done));
  }

  /**
   * Met une carte en file ; elle démarre tout de suite s'il reste une place.
   * Le jeton de suppression n'est rendu qu'ici, au créateur.
   */
  start(input: JobInput): { id: string; deleteToken: string } {
    this.sweep();
    const id = newId();
    const deleteToken = newToken();
    let settle!: () => void;
    const settled = new Promise<void>((r) => (settle = r));
    const job: Job = { id, state: "queued", input, deleteToken, progress: [], findings: [], startedAt: Date.now(), done: settled, settle };
    this.jobs.set(id, job);
    const key = input.login && !input.pdf && !input.linkedinUrl ? input.login.toLowerCase() : null;
    if (key) this.inflight.set(key, id);
    job.done = settled.finally(() => {
      if (key && this.inflight.get(key) === id) this.inflight.delete(key);
    });
    job.queueTimer = setTimeout(() => this.expire(job), this.queueTimeoutMs);
    job.queueTimer.unref?.();
    this.queue.push(job);
    this.pump();
    return { id, deleteToken };
  }

  /**
   * Fait passer les fiches en file tant qu'il reste des places, dans l'ordre
   * d'arrivée. Jetons GitHub épuisés : les fiches GitHub attendent la remise à
   * zéro si elle arrive avant `busyAfterMs` (les fiches CV seules passent
   * devant), sinon elles échouent en `busy` sans attendre.
   */
  private pump(): void {
    clearTimeout(this.recheck);
    this.recheck = undefined;
    const needsGithub = (j: Job) => !!j.input.login;
    const gh = this.githubReadiness();
    if (!gh.ok && gh.waitMs >= this.busyAfterMs) {
      for (const job of this.queue.filter(needsGithub)) this.fail(job, busyError(gh.waitMs));
      this.queue = this.queue.filter((j) => !needsGithub(j));
    }
    for (let i = 0; i < this.queue.length && this.running < this.maxConcurrent; ) {
      const job = this.queue[i]!;
      if (!gh.ok && needsGithub(job)) {
        i++;
        continue;
      }
      this.queue.splice(i, 1);
      this.run(job);
    }
    if (!gh.ok && this.queue.some(needsGithub)) {
      this.recheck = setTimeout(() => this.pump(), gh.waitMs + 250);
      this.recheck.unref?.();
    }
  }

  private run(job: Job): void {
    clearTimeout(job.queueTimer);
    job.state = "running";
    const now = Date.now();
    job.queuedMs = now - job.startedAt;
    job.startedAt = now;
    this.running++;
    void this.execute(job).finally(() => {
      this.running--;
      job.settle();
      this.pump();
    });
  }

  /** Trop longtemps en file : échec propre en `timeout` plutôt qu'une attente sans fin. */
  private expire(job: Job): void {
    if (job.state !== "queued") return;
    this.queue = this.queue.filter((j) => j !== job);
    this.fail(job, new JobError("timeout", MESSAGES.queue_timeout));
  }

  /** Échec d'une fiche qui n'a pas démarré. */
  private fail(job: Job, err: JobError): void {
    clearTimeout(job.queueTimer);
    job.state = "error";
    job.error = err;
    job.finishedAt = Date.now();
    job.settle();
  }

  private sweep() {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (job.state === "error" && job.finishedAt && now - job.finishedAt > this.errorTtlMs) this.jobs.delete(id);
    }
  }

  private async execute(job: Job): Promise<void> {
    const { deleteToken, input } = job;
    const ac = new AbortController();
    let timedOut = false;
    let rejectTimeout: (e: unknown) => void = () => {};
    const timeoutP = new Promise<never>((_, reject) => (rejectTimeout = reject));
    const fire = () => {
      timedOut = true;
      ac.abort(new JobError("timeout", MESSAGES.timeout));
      rejectTimeout(new JobError("timeout", MESSAGES.timeout));
    };
    const budgetEnd = job.startedAt + this.timeoutMs;
    job.deadline = budgetEnd;
    let timer = setTimeout(fire, this.timeoutMs);

    const ctx: Ctx = {
      signal: ac.signal,
      emit: (key, n) => {
        if (job.state !== "running" || ac.signal.aborted) return;
        const ev: ProgressEvent = { key, at: Date.now() - job.startedAt };
        if (typeof n === "number" && Number.isFinite(n)) ev.n = n;
        job.progress.push(ev);
      },
      seconds: () => Math.max(1, Math.round((Date.now() - job.startedAt) / 1000)),
      find: (list) => {
        if (job.state !== "running" || ac.signal.aborted || !list.length) return;
        job.findings = [...job.findings, ...list];
      },
      findings: () => job.findings,
      deadline: () => job.deadline ?? budgetEnd,
      budgetEnd,
      extendTo: (at) => {
        if (timedOut || at <= (job.deadline ?? budgetEnd)) return;
        job.deadline = at;
        clearTimeout(timer);
        timer = setTimeout(fire, Math.max(0, at - Date.now()));
      },
    };

    // Le chronométrage de la fiche : tout ce que `work` lance verse ses temps à cette trace.
    const trace = new Trace();
    let outcome = "ok";
    try {
      // La course protège aussi des modules qui ignoreraient le signal.
      const workP = withTrace(trace, () => this.work(job.id, deleteToken, input, ctx));
      workP.catch(() => {}); // rejet tardif après le timeout : déjà traité
      const rows = finalNotes(await Promise.race([workP, timeoutP]));
      if (timedOut) throw new JobError("timeout", MESSAGES.timeout);
      // Le coloris (§18.102) : tiré au hasard à la naissance, rangé sur la fiche racine (la fiche
      // seule ou le dossier), ou repris de la fiche que ce dossier complète. Il ne change plus.
      rows[0]!.data = { ...rows[0]!.data, colorway: input.colorway ?? randomColorway((n) => randomInt(n)) };
      this.opts.store.insertCards(rows);
      const root = rows[0]!;
      if (ctx.proposal) saveProposal(this.opts.store.db, root.id, ctx.proposal);
      outcome = root.kind === "comparison" ? `dossier ${root.source}` : root.source;
      this.opts.store.recordEvent("card_generated", root.id, { source: root.source, kind: root.kind });
      this.jobs.delete(job.id); // la base fait foi désormais
      this.settling.set(job.id, job.done);
      void job.done.then(() => this.settling.delete(job.id));
    } catch (err) {
      const e = timedOut ? new JobError("timeout", MESSAGES.timeout) : classifyError(err);
      if (e.code === "internal" && !(err instanceof JobError)) console.error(`[job ${job.id}] échec :`, err);
      outcome = `échec ${e.code}`;
      job.state = "error";
      job.error = e;
      job.finishedAt = Date.now();
    } finally {
      this.logTiming(job, trace, outcome);
      clearTimeout(timer);
      if (!ac.signal.aborted) ac.abort(); // coupe une branche encore en vol
    }
  }

  /** Une ligne par fiche : sa durée, ce qu'elle a donné, puis chaque phase (timing.ts). Jamais de pseudo ni d'adresse. */
  private logTiming(job: Job, trace: Trace, outcome: string): void {
    const log = this.opts.timingLog ?? (process.env.NODE_ENV === "test" ? false : (line: string) => console.log(line));
    if (!log) return;
    const s = (ms: number) => (ms / 1000).toFixed(1);
    try {
      log(trace.line(`[fiche ${job.id}] ${s(trace.elapsed())} s · ${outcome} · file ${s(job.queuedMs ?? 0)}`), trace);
    } catch {
      /* un journal défaillant ne casse pas la fiche */
    }
  }

  private async work(id: string, deleteToken: string, input: JobInput, ctx: Ctx): Promise<NewCardRow[]> {
    const { deps } = this.opts;
    const { lang, pdf } = input;
    let login = input.login;

    // Entrée LinkedIn avec un GitHub prouvé par l'email (§18.80) : ce pseudo sera
    // celui de la fiche quoi que dise le profil, sa collecte part donc pendant la
    // lecture du profil (4 s chez Apify) au lieu de l'attendre.
    const isEntry = !!input.linkedinUrl && !login && !pdf;

    // La photo LinkedIn (§18.99) : celle de la connexion d'abord, sinon celle du profil lu.
    // Son téléchargement court pendant la lecture du code et du profil.
    const photo: { p?: Promise<string | null> } = {};
    const keep = (url: string | undefined) => {
      const kp = this.opts.keepPhoto;
      if (photo.p || !url || !kp) return;
      photo.p = kp(url, id).catch((err) => {
        console.warn(`[photo ${id}] photo LinkedIn non gardée :`, (err as Error).message);
        return null;
      });
    };
    // La photo de la connexion : sa fiche LinkedIn, ou son dossier quand il a donné son GitHub avant le jugement (§18.111).
    if (!pdf) keep(input.photo);
    const sure = isEntry && input.identity?.how === "email" && !this.opts.store.isHidden(input.identity.githubLogin) ? input.identity.githubLogin : undefined;
    const earlyGh = sure ? this.githubBranch(sure, ctx, true) : undefined;
    earlyGh?.catch(() => {}); // lu plus bas ; si le profil échoue, la fiche s'arrête et coupe cette branche

    // Dénonciation par LinkedIn (§18.121) : son GitHub se cherche dès le départ, par le nom de la
    // suggestion touchée (sinon celui de l'adresse), pendant la lecture du profil. Le compte que
    // ce nom désigne déjà part en collecte à l'essai : le profil lu le garde ou l'écarte.
    const accountsOf = isEntry && input.match ? this.opts.propose?.githubAccounts : undefined;
    const hint = accountsOf ? (input.match!.name ?? nameFromSlug(linkedinSlug(input.linkedinUrl))) : null;
    const early: { found?: Promise<GithubFound | null>; trial?: Trial; decided?: boolean } = {};
    if (accountsOf && hint) {
      early.found = phase("correspondance", () => accountsOf(hint, ctx.signal)).catch(() => null);
      void early.found.then((found) => {
        if (early.decided || ctx.signal.aborted) return;
        const guess = matchGithub({ name: hint, url: input.linkedinUrl!, companies: [] }, found);
        const pick = guess.strong ?? guess.weak;
        if (pick && !this.opts.store.isHidden(pick.login)) early.trial = this.trialBranch(pick.login, ctx);
      });
    }

    // Entrée LinkedIn (§18.24) : le profil, et le GitHub que ses liens donnent.
    const entry = isEntry ? await this.linkedinEntry(input.linkedinUrl!, input, ctx) : null;
    if (entry?.githubLogin) login = entry.githubLogin;
    keep(entry?.profile.photoUrl);
    // Le GitHub de l'identité (§18.80) : l'email d'abord, puis les liens du profil,
    // puis le nom. Masqué par son propriétaire : la fiche LinkedIn sort seule.
    const identity = entry && input.identity && !this.opts.store.isHidden(input.identity.githubLogin) ? input.identity : undefined;
    if (identity && (identity.how === "email" || !login)) login = identity.githubLogin;
    // Fiche LinkedIn sans GitHub (§18.100) : son GitHub se cherche pendant la lecture du profil, pour le lui proposer.
    const offer: { p?: Promise<Proposal | null> } = {};
    const propose = input.propose && !pdf ? this.opts.propose : undefined;
    if (entry && !login && propose?.github) {
      const person = { name: entry.profile.name, url: input.linkedinUrl!, companies: entry.profile.roles.map((r) => r.company) };
      offer.p = phase("proposition", () => propose.github!(person, ctx.signal));
      offer.p.catch(() => {});
    }
    /** Prouvé par l'identité : son email mène à ce GitHub, et ce profil est sûrement le sien. */
    const identityProven = !!identity && identity.how === "email" && identity.sureProfile && login === identity.githubLogin;

    // Le LinkedIn lu : celui que le joueur donne, sinon, pour le pseudo dont le
    // serveur se porte garant, le sien (§18.35) ; sinon celui que GitHub affiche.
    const vouched = this.vouchedFor(login);
    const linkedinAsked = input.linkedinUrl ?? (!pdf ? vouched?.linkedinUrl : undefined);

    // Le LinkedIn se lit en parallèle de la lecture du code : dès l'entrée, ou
    // dès que les faits GitHub disent où il est (entrée GitHub).
    const lk: { p?: Promise<LinkedinResult | null> } = {};
    // Le GitHub que le registre de l'App lie à ce profil (force 2 ou plus) prouve la comparaison (§18.95).
    if (entry) lk.p = this.linkedinBranch(Promise.resolve({ profile: entry.profile, proven: !!entry.githubProven && login === entry.githubLogin }), ctx, false);

    // Dénonciation par LinkedIn sans GitHub sur le profil (§18.121) : le compte qui va avec son nom
    // et un de ses employeurs ou une de ses écoles est attaché d'office ; un compte moins sûr lui
    // est proposé sous sa fiche, quand elle la revendique. La lecture IA du profil tourne déjà.
    let matchedLogin: string | null = null;
    if (entry && accountsOf) {
      if (!login) {
        const name = entry.profile.name;
        const person: PersonHints = { name, url: input.linkedinUrl!, companies: entry.profile.roles.map((r) => r.company), schools: entry.profile.education.map((e) => e.school) };
        let found = early.found ? await early.found : null;
        if (!hint || !sameSearch(hint, name)) found = await phase("correspondance", () => accountsOf(name, ctx.signal)).catch(() => null);
        const m = matchGithub(person, found);
        const ok = (p: Proposal | null) => (p?.kind === "github" && !this.opts.store.isHidden(p.login) ? p : null);
        const strong = ok(m.strong);
        if (strong?.kind === "github") login = matchedLogin = strong.login;
        else if (ok(m.weak)) offer.p = Promise.resolve(m.weak);
      }
      early.decided = true;
    }
    // La collecte à l'essai : gardée si c'est ce compte-là, coupée sinon.
    const trial = early.trial && login && early.trial.login.toLowerCase() === login.toLowerCase() ? early.trial : null;
    if (early.trial && !trial) early.trial.drop();
    trial?.keep();

    const finder = !pdf ? this.opts.linkedin : undefined;
    const slow = linkedinSlow(ctx);
    // Dénonciation par GitHub (§18.121) : rien n'a donné son LinkedIn, il se cherche par le nom ; le
    // profil dont le titre nomme l'entreprise de son GitHub est lu et attaché, un autre proposé.
    const matchLinkedin = !entry && input.match && login && !linkedinAsked ? this.opts.propose?.linkedin : undefined;
    let matchedUrl: string | null = null;
    const onFacts =
      finder && !entry
        ? (facts: unknown) => {
            let found = finder.forGithub(facts, { url: linkedinAsked, spend: input.linkedinSpend, onSlow: slow, signal: ctx.signal });
            const hints = githubHints(facts);
            if (matchLinkedin && hints) {
              const first = found;
              found = first.then(async (r) => {
                if (r) return r;
                const p = await phase("correspondance", () => matchLinkedin(hints, { spend: input.searchSpend, signal: ctx.signal })).catch(() => null);
                if (p?.kind !== "linkedin") return null;
                if (!strongLinkedin(hints, p)) {
                  offer.p = Promise.resolve(p);
                  return null;
                }
                const read = await finder.forGithub(facts, { url: p.url, spend: input.linkedinSpend, onSlow: slow, signal: ctx.signal });
                if (!read || !samePublicFullName(read.profile.name, hints.name)) return null;
                matchedUrl = normalizeLinkedinUrl(read.profile.url) ?? normalizeLinkedinUrl(p.url);
                return read;
              });
            }
            lk.p = this.linkedinBranch(found, ctx, true);
            // Fiche GitHub dont rien n'a donné le LinkedIn (§18.100) : il se cherche par le nom, pour le lui proposer.
            if (!linkedinAsked && hints && propose?.linkedin) {
              offer.p = found.then(
                (r) => (r ? null : phase("proposition", () => propose.linkedin!(hints, { spend: input.searchSpend, signal: ctx.signal }))),
                () => null,
              );
              offer.p.catch(() => {});
            }
            lk.p.then((r) => keep(r?.profile.photoUrl), () => {});
          }
        : undefined;

    const ghP = !login ? Promise.resolve(null) : earlyGh && login === sure ? earlyGh : trial ? trial.p : this.githubBranch(login, ctx, !!pdf || !!input.linkedinUrl, onFacts);
    const [gh, cv] = await Promise.all([
      // Le GitHub que le profil donne n'existe plus : la fiche LinkedIn sort seule. Celui que la
      // correspondance a trouvé (§18.121) ne fait jamais échouer la fiche : elle sort LinkedIn seule.
      entry ? ghP.catch((err) => (!ctx.signal.aborted && (matchedLogin || isMissingGithub(err)) ? null : Promise.reject(err))) : ghP,
      pdf ? this.cvBranch(pdf, ctx) : Promise.resolve(null),
    ]);
    // Entrée LinkedIn : sa lecture est la fiche, on l'attend. Entrée GitHub : la
    // comparaison est un bonus, on ne l'attend que jusqu'à la marge du délai.
    const li = entry ? await lk.p! : lk.p ? await settleBefore(lk.p, () => ctx.deadline() - LINKEDIN_MARGIN_MS) : null;
    const declared: (CvResult & { linkedinUrl?: string; linkedin?: DeclaredLinkedin }) | null =
      cv ?? (li ? { ...li.cv, linkedinUrl: li.profile.url, linkedin: declaredLinkedin(li.profile) } : null);
    // La photo LinkedIn de la fiche, seulement si son LinkedIn est lu (§18.99) : l'avatar GitHub ne vient qu'à défaut.
    let liPhoto: string | null = null;
    if (li && photo.p) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      liPhoto = await Promise.race([photo.p, new Promise<null>((res) => (timer = setTimeout(() => res(null), PHOTO_WAIT_MS)))]);
      clearTimeout(timer);
    }
    const withLiPhoto = (c: CardData): CardData => (liPhoto ? { ...c, avatarUrl: liPhoto, photoSource: "linkedin" } : c);

    const now = Date.now();
    const createdAt = new Date(now).toISOString();
    const judgedInSeconds = ctx.seconds();

    // Les trois trouvailles les plus fortes, toutes sources : elles ne changent pas la note.
    // Pièce sortie du cache de 24 h : celles de sa fiche.
    const foundForGithub = (): Finding[] => (gh!.cached ? (gh!.cached.findings ?? []) : strongest(ctx.findings()));
    const githubCard = (cardId: string): CardData => {
      // Sortie du cache : les faits et la lecture du code se renotent (sans appel), jamais la
      // note rangée, qui porte déjà l'aléa de son ancienne fiche (§18.106).
      const found = foundForGithub();
      const body = phaseSync("barème", () => deps.scoreGithub(gh!.facts, gh!.ai, { lang, judgedInSeconds }));
      return { ...withLine(body, gh!.ai?.card_line), ...(found.length ? { findings: found } : {}), id: cardId, createdAt };
    };
    const githubRow = (card: CardData, parentId: string | null, degraded = gh!.degraded): NewCardRow => ({
      id: card.id,
      parentId,
      createdAt: now,
      source: "github",
      login: login!,
      kind: "card",
      data: card,
      // Les données brutes de la pièce, sans note : les faits (le top de la semaine y lit les
      // abonnés, §18.22) et la lecture du code, pour recalculer le dossier quand une pièce arrive.
      facts: gh!.facts,
      ai: gh!.ai,
      deleteToken,
      degraded,
    });

    // Rien de déclaratif à lire (GitHub seul), ou illisible par l'IA : la carte
    // GitHub seule si on l'a, sinon une erreur honnête. Un LinkedIn trouvé mais
    // pas lu : la fiche sort, hors cache 24 h.
    if (!declared?.reading) {
      // Rien de LinkedIn sur la fiche : le LinkedIn trouvé par le nom lui est proposé (§18.100).
      if (gh && !li && offer.p) ctx.proposal = await within(offer.p, PROPOSE_WAIT_MS);
      if (gh) return [githubRow(withLiPhoto(githubCard(id)), null, gh.degraded || (!!li && !li.cv.reading))];
      throw new JobError("internal", entry ? MESSAGES.linkedin_unreadable : MESSAGES.cv_unreadable);
    }

    const reading = declared.reading;
    const linkedinUrl = declared.linkedinUrl;
    // Fiche LinkedIn : l'expérience se compte sur les postes datés du profil, à l'heure de la fiche.
    // Le parcours lit la liste des employeurs à forte barre du serveur (vide sans fichier), CV comme LinkedIn.
    const declaredOpts = { now: createdAt, highBar: highBarEmployers(), ...(declared.linkedin ? { linkedin: declared.linkedin } : {}) };
    const asDeclared = (c: CardData): CardData => (linkedinUrl ? asLinkedinCard(c) : c);
    const cvRow = (card: CardData, parentId: string | null): NewCardRow => ({
      id: card.id,
      parentId,
      createdAt: now,
      source: linkedinUrl ? "linkedin" : "cv",
      login: null,
      kind: "card",
      data: card,
      // Fiche LinkedIn seule : l'adresse sert au cache de 24 h et à l'oubli du profil (§11).
      ...(linkedinUrl && !parentId ? { facts: { linkedinUrl } } : {}),
      deleteToken,
    });

    // Déclaratif seul (CV, ou LinkedIn sans GitHub), ou CV en PDF qui n'est pas celui
    // d'un dev : pas de carte GitHub (§4.7). Un LinkedIn, lui, se compare toujours au
    // GitHub, quel que soit le métier qu'il déclare (§18.35).
    if (!gh || (!reading.is_dev_profile && !linkedinUrl)) {
      // La fiche LinkedIn sort sans GitHub : celui trouvé pendant sa lecture lui est proposé (§18.100), jamais un compte masqué.
      if (!gh && linkedinUrl && offer.p) {
        const p = await within(offer.p, PROPOSE_WAIT_MS);
        ctx.proposal = p && !(p.kind === "github" && this.opts.store.isHidden(p.login)) ? p : null;
      }
      const found = linkedinUrl ? strongest(ctx.findings()) : [];
      const card = withLiPhoto(asDeclared({
        ...withLine(phaseSync("barème", () => deps.scoreCv(reading, declared.counts, { lang, judgedInSeconds, ...declaredOpts })), reading.card_line),
        ...(found.length ? { findings: found } : {}),
        ...(linkedinUrl ? { linkedinUrl } : {}),
        id,
        createdAt,
      }));
      return [cvRow(card, null)];
    }

    // Le lien entre ce LinkedIn et ce GitHub est-il prouvé ? Par le chercheur,
    // parce que le GitHub affiche lui-même ce LinkedIn (entrée LinkedIn : le
    // profil donne un GitHub, qui doit le lui rendre), ou parce que le serveur se
    // porte garant de ce lien-là (la vitrine, §18.35). Une comparaison non prouvée
    // se lit à son adresse et par le cache de son adresse LinkedIn, mais ne passe
    // jamais devant la fiche GitHub du pseudo et n'entre pas au top (§18.24).
    const vouchedLink = !!vouched && linkedinAsked === vouched.linkedinUrl;
    // La correspondance d'une dénonciation (§18.121) : son nom et un employeur ou une école en commun.
    const matchProof = !!linkedinUrl && ((!!matchedLogin && login === matchedLogin) || (!!matchedUrl && normalizeLinkedinUrl(linkedinUrl) === matchedUrl)) ? ("match" as const) : null;
    const shownProven = !!li && !!linkedinUrl && (li.proven || vouchedLink || identityProven || githubShowsLinkedin(gh.facts, linkedinUrl));
    // Connectée à LinkedIn, elle a donné ou confirmé ce GitHub, plausiblement le sien (§18.116).
    const signedProof = !shownProven && !!li && !!linkedinUrl ? (signedInProof(input, login, linkedinUrl, gh.facts, li.profile.name) ?? matchProof) : null;
    const linkedinProven = shownProven || !!signedProof;

    // Le dossier : un seul calcul sur les deux pièces, une grille, une note (SPEC §18.84).
    // Trois lignes : le dossier, qui porte la note, et ses deux pièces, qui n'en ont pas à elles.
    ctx.emit("compare");
    const scored = phaseSync("barème", () =>
      deps.scoreDossier({ reading, counts: declared.counts, ...declaredOpts }, { facts: gh.facts, ai: gh.ai }, { lang, judgedInSeconds }),
    );
    const found = foundForGithub();
    const pieces = asPieces(scored, { cv: { id: newId(), createdAt }, github: { id: newId(), createdAt, ...(found.length ? { findings: found } : {}) } });
    const cmp = linkedinUrl ? asLinkedinComparison(pieces) : pieces;
    // La phrase du dossier : celle du parcours d'abord (elle voit le métier), sinon celle du code ; sur les deux pièces.
    const line = reading.card_line ?? gh.ai?.card_line;
    const comparison: ComparisonData = { ...cmp, cv: withLiPhoto(withLine(cmp.cv, line)), github: withLiPhoto(withLine(cmp.github, line)), id, createdAt };
    return [
      {
        id,
        parentId: null,
        createdAt: now,
        source: linkedinUrl ? "linkedin" : "both",
        login,
        kind: "comparison",
        data: comparison,
        ...(linkedinUrl ? { facts: { linkedinUrl, linkedinProven, ...(signedProof ? { linkedinProof: signedProof } : {}) } } : {}),
        deleteToken,
        degraded: gh.degraded,
      },
      cvRow(comparison.cv, id),
      githubRow(comparison.github, id),
    ];
  }

  /** Le lien garanti par le serveur, si ce pseudo est le sien (sans égard à la casse). */
  private vouchedFor(login: string | undefined): PipelineOptions["vouched"] {
    const v = this.opts.vouched;
    return v && login && login.toLowerCase() === v.login.toLowerCase() ? v : undefined;
  }

  /** Entrée LinkedIn : le profil, ou une erreur claire (pas de clé, budget, introuvable, propriétaire parti). */
  private async linkedinEntry(url: string, input: JobInput, ctx: Ctx) {
    const finder = this.opts.linkedin;
    if (!finder) throw new JobError("linkedin", MESSAGES.linkedin_off);
    const r = await finder.forUrl(url, { spend: input.linkedinSpend, onSlow: linkedinSlow(ctx), signal: ctx.signal });
    if (r.status === "not_found") throw new JobError("linkedin", MESSAGES.linkedin_not_found);
    if (r.status === "unavailable") throw new JobError("linkedin", r.reason === "ip" ? MESSAGES.linkedin_ip : MESSAGES.linkedin_busy);
    // Le LinkedIn de la vitrine ne donne pas de GitHub : le serveur sait lequel (§18.35).
    const vouched = this.opts.vouched;
    const githubLogin = r.githubLogin ?? (vouched && url === vouched.linkedinUrl ? vouched.login : null);
    // Le GitHub lié est masqué par son propriétaire : pas de fiche à son nom (§18.1).
    if (githubLogin && this.opts.store.isHidden(githubLogin)) throw new JobError("gone", MESSAGES.gone);
    ctx.emit("linkedin");
    return { ...r, githubLogin };
  }

  /**
   * Le profil LinkedIn, lu comme un CV : texte déclaratif, comptages, lecture IA.
   * Le texte ne vit que le temps de la lecture. Entrée GitHub (`soft`) : toute
   * panne rend null, la fiche GitHub sort seule.
   */
  private async linkedinBranch(foundP: Promise<GithubLookup | null>, ctx: Ctx, soft: boolean): Promise<LinkedinResult | null> {
    const { deps } = this.opts;
    let found: GithubLookup | null;
    try {
      found = await foundP;
    } catch {
      found = null;
    }
    if (!found) return null;
    const { profile, proven } = found;
    if (soft) ctx.emit("linkedin");
    ctx.find(linkedinFindings(profile));
    let text = profileToText(profile);
    const counts = deps.cvTextCounts(text, 1);
    let reading: CvReading | null = null;
    if (deps.aiAvailable()) {
      try {
        reading = await phase("parcours", () => deps.readCv(text, { signal: ctx.signal }));
      } catch (err) {
        if (!soft && (ctx.signal.aborted || isAiClosed(err))) throw err;
        console.warn("[linkedin] lecture IA échouée :", (err as Error).message);
      }
    }
    text = "";
    return { profile, proven, cv: { counts, reading } };
  }

  /**
   * La collecte d'un GitHub pas encore confirmé (§18.121) : elle part pendant la lecture du profil,
   * sur son propre signal. Gardée, elle rend à la fiche ce qu'elle a retenu ; coupée, rien.
   */
  private trialBranch(login: string, ctx: Ctx): Trial {
    const ac = new AbortController();
    let live = false;
    const held: (() => void)[] = [];
    const child: Ctx = {
      ...ctx,
      signal: AbortSignal.any([ctx.signal, ac.signal]),
      emit: (key, n) => (live ? ctx.emit(key, n) : void held.push(() => ctx.emit(key, n))),
      find: (list) => (live ? ctx.find(list) : void held.push(() => ctx.find(list))),
    };
    const p = this.githubBranch(login, child, true);
    p.catch(() => {}); // lue si elle est gardée ; coupée, son échec ne dit rien
    return {
      login,
      p,
      keep: () => {
        if (live) return;
        live = true;
        for (const f of held.splice(0)) f();
      },
      drop: () => {
        held.length = 0;
        ac.abort();
      },
    };
  }

  private async githubBranch(login: string, ctx: Ctx, allowCache: boolean, onFacts?: (facts: unknown) => void): Promise<GithubResult> {
    const { deps, store } = this.opts;
    if (allowCache) {
      // Comparaison sur un pseudo jugé il y a moins de 24 h : on ne refait pas les appels.
      // Il faut ses données brutes, faits et lecture du code : le dossier se calcule dessus.
      // Une fiche rangée avant qu'on garde la lecture se recollecte.
      const row = store.findRecentGithub(login);
      if (row?.facts && row.aiStored && row.kind === "card") {
        onFacts?.(row.facts);
        return { facts: row.facts, ai: row.ai as CodeReadingResult | null, degraded: false, cached: row.data as CardData };
      }
    }
    // Les deux suites de la collecte partent dès que leurs entrées existent, une
    // fois chacune : la recherche du LinkedIn sur le profil seul, la lecture du
    // code sur les arbres et les commits. Si la collecte ne les donne pas en
    // avance, elles partent à sa fin, sur les faits entiers.
    let told = false;
    const tellFacts = (f: unknown) => {
      if (told) return;
      told = true;
      onFacts?.(f);
    };
    let reading: Promise<{ ai: CodeReadingResult | null; degraded: boolean }> | undefined;
    const read = (f: unknown) => {
      if (!reading) {
        reading = this.readCodeOf(login, f, ctx);
        reading.catch(() => {}); // attendue plus bas ; si la collecte échoue d'abord, c'est son erreur qui sort
      }
      return reading;
    };
    const facts = await phase("faits", () =>
      deps.collectGithub(login, {
        token: this.github,
        signal: ctx.signal,
        onProgress: (e) => ctx.emit(e.key, e.n),
        onProfile: tellFacts,
        onReadable: (f) => void read(f),
      }),
    );
    tellFacts(facts);
    ctx.emit("recruiter");
    // L'enquête en direct (§18.26) : les trouvailles sortent avant la fin de la lecture IA, pour l'attente.
    ctx.find(githubFindings(facts));
    return { facts, ...(await read(facts)) };
  }

  /**
   * La lecture du code : le choix des fichiers, puis l'appel IA. `facts` : les
   * faits entiers, ou la part que la collecte donne en avance (arbres et commits).
   */
  private async readCodeOf(login: string, facts: unknown, ctx: Ctx): Promise<{ ai: CodeReadingResult | null; degraded: boolean }> {
    const { deps } = this.opts;
    // Sans IA, rien n'a été lu : fiche dégradée. Rien à lire (aucun fichier) : la
    // fiche est la même à chaque fois, elle se met en cache normalement. Des
    // fichiers à lire mais aucun téléchargé : pickFilesForReading lève, la fiche
    // sort dégradée (ni resservie du cache, ni classée), comme sans lecture IA.
    if (!deps.aiAvailable()) return { ai: null, degraded: true };
    try {
      const files = await phase("fichiers", () => deps.pickFilesForReading(facts, { token: this.github, signal: ctx.signal }));
      if (!files.length) return { ai: null, degraded: false };
      const ai = await phase("code", () => deps.readCode(files, { signal: ctx.signal }));
      return { ai, degraded: ai === null };
    } catch (err) {
      // IA coupée : pas de fiche sans lecture (§2.3), la fiche échoue en `closed`.
      if (ctx.signal.aborted || isAiClosed(err)) throw err;
      console.warn(`[github ${login}] lecture IA indisponible, carte sans lecture :`, (err as Error).message);
      return { ai: null, degraded: true };
    }
  }

  private async cvBranch(pdf: Uint8Array, ctx: Ctx): Promise<CvResult> {
    const { deps } = this.opts;
    // Le PDF ne vit qu'en mémoire (§2.6) ; le texte n'existe que dans cette fonction.
    let { text, pages } = await phase("pdf", () => deps.extractPdfText(pdf));
    try {
      pdf.fill(0);
    } catch {
      /* tampon détaché par l'extracteur */
    }
    if (pages > MAX_PDF_PAGES) throw new JobError("pdf_too_large", MESSAGES.pdf_too_large);
    if (!text.trim()) throw new JobError("not_a_pdf", MESSAGES.empty_pdf);

    const counts = deps.cvTextCounts(text, pages);
    ctx.emit("buzzwords", Object.values(counts.buzzwords).reduce((a, b) => a + b, 0));

    let reading: CvReading | null = null;
    if (deps.aiAvailable()) {
      try {
        reading = await phase("parcours", () => deps.readCv(text, { signal: ctx.signal }));
      } catch (err) {
        if (ctx.signal.aborted || isAiClosed(err)) throw err;
        console.warn("[cv] lecture IA échouée :", (err as Error).message);
      }
    }
    text = ""; // on lâche la seule référence au texte
    return { counts, reading };
  }
}
