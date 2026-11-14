// Traitement d'une demande de carte, en tâche de fond (SPEC §4, §6.2, §12).
// Les modules du moteur arrivent par injection (`Deps`) : deps.ts câble les
// vrais, les tests injectent des faux.
//
// GitHub : collect → (lecture IA si dispo : pickFilesForReading → readCode) → scoreGithub
// CV     : extractPdfText → cvTextCounts → readCv → scoreCv
// Les deux : branches en parallèle, puis scoreCv avec les faits GitHub, puis compareCards.

import { randomBytes, randomInt } from "node:crypto";
import type { CardData, ComparisonData, ErrorCode, Fact, Finding, JobState, Lang, ProgressEvent } from "../../shared/types";
import type { BandStanding } from "../../shared/bands";
import { forReveal, githubFindings, strongest } from "./findings";
import type { CodeReadingResult, CvReading, CvTextCounts, RepoFiles } from "../../shared/readings";
import type { NewCardRow, Store } from "./db";
import { TokenPool } from "./github/tokens";
import type { GithubLookup, LinkedinFinder, LinkedinProfile } from "./linkedinProfile/index";
import { githubShowsLinkedin } from "./linkedinProfile/url";
import { asLinkedinCard, asLinkedinComparison, profileToText } from "./linkedinProfile/text";
import { linkedinFindings } from "./linkedinProfile/findings";
import { highBarEmployers, type HighBarList } from "./scoring/employers";
import type { PrimeView } from "../../shared/primes";
import type { PrimeLogo } from "./render/prime";

export type CardBody = Omit<CardData, "id" | "createdAt">;

/** Un jeton GitHub seul, ou le pool de jetons en rotation partagé par toutes les fiches. */
export type GithubAuth = string | TokenPool;

export interface RenderInput {
  /** `home` : l'aperçu de lien de l'accueil (/og/home.png), avec la fiche de la vitrine. `story` : 9:16, une fiche seule. */
  format: "card" | "og" | "portrait" | "story" | "home" | "band" | "prime";
  card?: CardData;
  comparison?: ComparisonData;
  /** `band` : l'aperçu de lien d'une bande (§18.38). */
  band?: BandStanding;
  /** `prime` : l'aperçu de lien d'une prime (§18.4), et son logo en data URI s'il en a un. */
  prime?: PrimeView;
  logo?: PrimeLogo | null;
  lang: Lang;
}

/**
 * Signatures des modules du moteur. Syntaxe de méthode exprès : les faits
 * GitHub sont opaques ici (`unknown`), et la bivariance des méthodes laisse
 * deps.ts passer les vraies fonctions typées avec `GithubFacts`.
 */
export interface Deps {
  collectGithub(
    login: string,
    opts: { token: GithubAuth; onProgress?: (e: { key: string; n?: number }) => void; signal?: AbortSignal },
  ): Promise<unknown>;
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
  compareCards(cv: CardData, github: CardData, label?: "LinkedIn" | "CV"): Omit<ComparisonData, "id" | "createdAt">;
  renderImage(input: RenderInput): Promise<Uint8Array>;
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
  | "linkedin_not_found"
  | "linkedin_bad_url"
  | "linkedin_unreadable";

export const MESSAGES: Record<MessageKey, Fact> = {
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
    fr: "PDF trop long : 5 Mo et 10 pages maximum. Un recruteur n'en lirait pas plus.",
    en: "PDF too long: 5 MB and 10 pages max. A recruiter wouldn't read more.",
  },
  timeout: {
    fr: "Le jugement a pris trop de temps. Plutôt que d'inventer une fiche, on s'arrête là : réessaie dans un instant.",
    en: "Judging took too long. Rather than make up a sheet, we stopped: try again in a moment.",
  },
  rate_limited: {
    fr: "20 fiches par jour, c'est le maximum. Reviens demain : même les recruteurs font des pauses.",
    en: "20 sheets a day is the limit. Come back tomorrow: even recruiters take breaks.",
  },
  github_rate_limited: {
    fr: "GitHub nous demande de ralentir. Réessaie dans quelques minutes.",
    en: "GitHub is asking us to slow down. Try again in a few minutes.",
  },
  closed: {
    fr: "Le commissariat est fermé pour ce soir. Reviens demain.",
    en: "The station is closed for tonight. Come back tomorrow.",
  },
  busy: {
    fr: "Le commissariat déborde : trop de dossiers d'un coup, GitHub nous fait souffler. Reviens dans quelques minutes.",
    en: "The station is overflowing: too many suspects at once, GitHub is making us take a breather. Come back in a few minutes.",
  },
  gone: {
    fr: "Ce dossier a quitté la ville : fiche retirée par son propriétaire.",
    en: "This dev has left town: their sheet was withdrawn by its owner.",
  },
  withdrawn: {
    fr: "Fiche retirée par son propriétaire.",
    en: "Sheet withdrawn by its owner.",
  },
  queue_timeout: {
    fr: "Trop de monde au commissariat : ton dossier a attendu plus de 3 minutes sans passer. Réessaie dans un instant.",
    en: "The station is packed: your file waited more than 3 minutes without being seen. Try again in a moment.",
  },
  cv_unreadable: {
    fr: "On n'a pas réussi à lire ce CV pour l'instant. Réessaie dans un instant.",
    en: "We couldn't read this CV right now. Try again in a moment.",
  },
  not_found: {
    fr: "Fiche introuvable : elle a expiré ou a été supprimée.",
    en: "Sheet not found: it expired or was deleted.",
  },
  linkedin: {
    fr: "Entrée LinkedIn indisponible, tape ton pseudo GitHub.",
    en: "LinkedIn entry unavailable, type your GitHub username.",
  },
  linkedin_off: {
    fr: "Entrée LinkedIn indisponible, tape ton pseudo GitHub.",
    en: "LinkedIn entry unavailable, type your GitHub username.",
  },
  linkedin_busy: {
    fr: "Entrée LinkedIn indisponible pour aujourd'hui, tape ton pseudo GitHub.",
    en: "LinkedIn entry unavailable for today, type your GitHub username.",
  },
  linkedin_not_found: {
    fr: "Profil LinkedIn introuvable (privé ou trop récent). Tape ton pseudo GitHub.",
    en: "LinkedIn profile not found (private or too new). Type your GitHub username.",
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
    fr: "Donne un pseudo GitHub valide, un CV en PDF, ou les deux.",
    en: "Give a valid GitHub username, a PDF CV, or both.",
  },
  internal: {
    fr: "Quelque chose a cassé de notre côté. Réessaie dans un instant.",
    en: "Something broke on our side. Try again in a moment.",
  },
};

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
    fr: `Le commissariat déborde : trop de dossiers d'un coup, GitHub nous fait souffler. Reviens dans ${n} minute${n > 1 ? "s" : ""}.`,
    en: `The station is overflowing: too many suspects at once, GitHub is making us take a breather. Come back in ${n} minute${n > 1 ? "s" : ""}.`,
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
}

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
  /** Carte de moins de 24 h réutilisée telle quelle (comparaison). */
  cached?: CardData;
}

interface CvResult {
  counts: CvTextCounts;
  reading: CvReading | null;
}

export class Pipeline {
  private jobs = new Map<string, Job>();
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

  /** Attend la fin d'un job (tests, arrêt propre). */
  async wait(id: string): Promise<void> {
    await this.jobs.get(id)?.done;
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
    job.startedAt = Date.now();
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

    try {
      // La course protège aussi des modules qui ignoreraient le signal.
      const workP = this.work(job.id, deleteToken, input, ctx);
      workP.catch(() => {}); // rejet tardif après le timeout : déjà traité
      const rows = await Promise.race([workP, timeoutP]);
      if (timedOut) throw new JobError("timeout", MESSAGES.timeout);
      this.opts.store.insertCards(rows);
      const root = rows[0]!;
      this.opts.store.recordEvent("card_generated", root.id, { source: root.source, kind: root.kind });
      this.jobs.delete(job.id); // la base fait foi désormais
    } catch (err) {
      const e = timedOut ? new JobError("timeout", MESSAGES.timeout) : classifyError(err);
      if (e.code === "internal" && !(err instanceof JobError)) console.error(`[job ${job.id}] échec :`, err);
      job.state = "error";
      job.error = e;
      job.finishedAt = Date.now();
    } finally {
      clearTimeout(timer);
      if (!ac.signal.aborted) ac.abort(); // coupe une branche encore en vol
    }
  }

  private async work(id: string, deleteToken: string, input: JobInput, ctx: Ctx): Promise<NewCardRow[]> {
    const { deps } = this.opts;
    const { lang, pdf } = input;
    let login = input.login;

    // Entrée LinkedIn (§18.24) : le profil, et le GitHub que ses liens donnent.
    const entry = input.linkedinUrl && !login && !pdf ? await this.linkedinEntry(input.linkedinUrl, input, ctx) : null;
    if (entry?.githubLogin) login = entry.githubLogin;

    // Le LinkedIn lu : celui que le joueur donne, sinon, pour le pseudo dont le
    // serveur se porte garant, le sien (§18.35) ; sinon celui que GitHub affiche.
    const vouched = this.vouchedFor(login);
    const linkedinAsked = input.linkedinUrl ?? (!pdf ? vouched?.linkedinUrl : undefined);

    // Le LinkedIn se lit en parallèle de la lecture du code : dès l'entrée, ou
    // dès que les faits GitHub disent où il est (entrée GitHub).
    const lk: { p?: Promise<LinkedinResult | null> } = {};
    if (entry) lk.p = this.linkedinBranch(Promise.resolve({ profile: entry.profile, proven: false }), ctx, false);
    const finder = !pdf ? this.opts.linkedin : undefined;
    const slow = linkedinSlow(ctx);
    const onFacts =
      finder && !entry
        ? (facts: unknown) => {
            const found = finder.forGithub(facts, { url: linkedinAsked, spend: input.linkedinSpend, onSlow: slow, signal: ctx.signal });
            lk.p = this.linkedinBranch(found, ctx, true);
            lk.p.catch(() => {});
          }
        : undefined;

    const ghP = login ? this.githubBranch(login, ctx, !!pdf || !!input.linkedinUrl, onFacts) : Promise.resolve(null);
    const [gh, cv] = await Promise.all([
      // Le GitHub que le profil donne n'existe plus : la fiche LinkedIn sort seule.
      entry ? ghP.catch((err) => (!ctx.signal.aborted && isMissingGithub(err) ? null : Promise.reject(err))) : ghP,
      pdf ? this.cvBranch(pdf, ctx) : Promise.resolve(null),
    ]);
    // Entrée LinkedIn : sa lecture est la fiche, on l'attend. Entrée GitHub : la
    // comparaison est un bonus, on ne l'attend que jusqu'à la marge du délai.
    const li = entry ? await lk.p! : lk.p ? await settleBefore(lk.p, () => ctx.deadline() - LINKEDIN_MARGIN_MS) : null;
    const declared: (CvResult & { linkedinUrl?: string; linkedin?: DeclaredLinkedin }) | null =
      cv ?? (li ? { ...li.cv, linkedinUrl: li.profile.url, linkedin: declaredLinkedin(li.profile) } : null);

    const now = Date.now();
    const createdAt = new Date(now).toISOString();
    const judgedInSeconds = ctx.seconds();

    const githubCard = (cardId: string): CardData => {
      if (gh!.cached) return { ...gh!.cached, id: cardId, createdAt };
      // Les trois trouvailles les plus fortes, toutes sources : elles ne changent pas la note.
      const found = strongest(ctx.findings());
      return { ...deps.scoreGithub(gh!.facts, gh!.ai, { lang, judgedInSeconds }), ...(found.length ? { findings: found } : {}), id: cardId, createdAt };
    };
    const githubRow = (card: CardData, parentId: string | null, degraded = gh!.degraded): NewCardRow => ({
      id: card.id,
      parentId,
      createdAt: now,
      source: "github",
      login: login!,
      kind: "card",
      data: card,
      // Aussi sur la carte GitHub d'une comparaison : le top de la semaine y lit les abonnés (§18.22).
      facts: gh!.facts,
      deleteToken,
      degraded,
    });

    // Rien de déclaratif à lire (GitHub seul), ou illisible par l'IA : la carte
    // GitHub seule si on l'a, sinon une erreur honnête. Un LinkedIn trouvé mais
    // pas lu : la fiche sort, hors cache 24 h.
    if (!declared?.reading) {
      if (gh) return [githubRow(githubCard(id), null, gh.degraded || (!!li && !li.cv.reading))];
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
      const found = linkedinUrl ? strongest(ctx.findings()) : [];
      const card = asDeclared({
        ...deps.scoreCv(reading, declared.counts, { lang, judgedInSeconds, ...declaredOpts }),
        ...(found.length ? { findings: found } : {}),
        ...(linkedinUrl ? { linkedinUrl } : {}),
        id,
        createdAt,
      });
      return [cvRow(card, null)];
    }

    // Le lien entre ce LinkedIn et ce GitHub est-il prouvé ? Par le chercheur,
    // parce que le GitHub affiche lui-même ce LinkedIn (entrée LinkedIn : le
    // profil donne un GitHub, qui doit le lui rendre), ou parce que le serveur se
    // porte garant de ce lien-là (la vitrine, §18.35). Une comparaison non prouvée
    // se lit à son adresse et par le cache de son adresse LinkedIn, mais ne passe
    // jamais devant la fiche GitHub du pseudo et n'entre pas au top (§18.24).
    const vouchedLink = !!vouched && linkedinAsked === vouched.linkedinUrl;
    const linkedinProven = !!li && !!linkedinUrl && (li.proven || vouchedLink || githubShowsLinkedin(gh.facts, linkedinUrl));

    // Comparaison : trois lignes, la comparaison et ses deux cartes, chacune son id.
    ctx.emit("compare");
    const cvCard: CardData = {
      ...deps.scoreCv(reading, declared.counts, { lang, judgedInSeconds, github: gh.facts, ...declaredOpts }),
      id: newId(),
      createdAt,
    };
    const ghCard = githubCard(newId());
    // La pièce déclarative porte le nom que lui donne la grille (declaredInput : un profil LinkedIn rangé, sinon le CV).
    const raw = deps.compareCards(cvCard, ghCard, declared.linkedin ? "LinkedIn" : "CV");
    const cmp = linkedinUrl ? asLinkedinComparison(raw) : raw;
    const comparison: ComparisonData = {
      ...cmp,
      id,
      createdAt,
      cv: { ...cmp.cv, id: cvCard.id, createdAt },
      github: { ...cmp.github, id: ghCard.id, createdAt },
    };
    return [
      {
        id,
        parentId: null,
        createdAt: now,
        source: linkedinUrl ? "linkedin" : "both",
        login,
        kind: "comparison",
        data: comparison,
        ...(linkedinUrl ? { facts: { linkedinUrl, linkedinProven } } : {}),
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
    if (r.status === "unavailable") throw new JobError("linkedin", MESSAGES.linkedin_busy);
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
        reading = await deps.readCv(text, { signal: ctx.signal });
      } catch (err) {
        if (!soft && (ctx.signal.aborted || isAiClosed(err))) throw err;
        console.warn("[linkedin] lecture IA échouée :", (err as Error).message);
      }
    }
    text = "";
    return { profile, proven, cv: { counts, reading } };
  }

  private async githubBranch(login: string, ctx: Ctx, allowCache: boolean, onFacts?: (facts: unknown) => void): Promise<GithubResult> {
    const { deps, store } = this.opts;
    if (allowCache) {
      // Comparaison sur un pseudo jugé il y a moins de 24 h : on ne refait pas les appels.
      const row = store.findRecentGithub(login);
      if (row?.facts && row.kind === "card") {
        onFacts?.(row.facts);
        return { facts: row.facts, ai: null, degraded: false, cached: row.data as CardData };
      }
    }
    const facts = await deps.collectGithub(login, {
      token: this.github,
      signal: ctx.signal,
      onProgress: (e) => ctx.emit(e.key, e.n),
    });
    onFacts?.(facts);
    ctx.emit("recruiter");
    // L'enquête en direct (§18.26) : les trouvailles sortent avant la lecture IA, pour l'attente.
    ctx.find(githubFindings(facts));
    let ai: CodeReadingResult | null = null;
    // Sans IA, rien n'a été lu : fiche dégradée. Rien à lire (aucun fichier) : la
    // fiche est la même à chaque fois, elle se met en cache normalement. Des
    // fichiers à lire mais aucun téléchargé : pickFilesForReading lève, la fiche
    // sort dégradée (ni resservie du cache, ni classée), comme sans lecture IA.
    let degraded = !deps.aiAvailable();
    if (deps.aiAvailable()) {
      try {
        const files = await deps.pickFilesForReading(facts, { token: this.github, signal: ctx.signal });
        if (files.length) {
          ai = await deps.readCode(files, { signal: ctx.signal });
          degraded = ai === null;
        }
      } catch (err) {
        // IA coupée : pas de fiche sans lecture (§2.3), la fiche échoue en `closed`.
        if (ctx.signal.aborted || isAiClosed(err)) throw err;
        console.warn(`[github ${login}] lecture IA indisponible, carte sans lecture :`, (err as Error).message);
        ai = null;
        degraded = true;
      }
    }
    return { facts, ai, degraded };
  }

  private async cvBranch(pdf: Uint8Array, ctx: Ctx): Promise<CvResult> {
    const { deps } = this.opts;
    // Le PDF ne vit qu'en mémoire (§2.6) ; le texte n'existe que dans cette fonction.
    let { text, pages } = await deps.extractPdfText(pdf);
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
        reading = await deps.readCv(text, { signal: ctx.signal });
      } catch (err) {
        if (ctx.signal.aborted || isAiClosed(err)) throw err;
        console.warn("[cv] lecture IA échouée :", (err as Error).message);
      }
    }
    text = ""; // on lâche la seule référence au texte
    return { counts, reading };
  }
}
