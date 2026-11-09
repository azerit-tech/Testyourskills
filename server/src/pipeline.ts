// Traitement d'une demande de carte, en tâche de fond (SPEC §4, §6.2, §12).
// Les modules du moteur arrivent par injection (`Deps`) : deps.ts câble les
// vrais, les tests injectent des faux.
//
// GitHub : collect → (lecture IA si dispo : pickFilesForReading → readCode) → scoreGithub
// CV     : extractPdfText → cvTextCounts → readCv → scoreCv
// Les deux : branches en parallèle, puis scoreCv avec les faits GitHub, puis compareCards.

import { randomBytes, randomInt } from "node:crypto";
import type { CardData, ComparisonData, ErrorCode, Fact, JobState, Lang, ProgressEvent } from "../../shared/types";
import type { CodeReadingResult, CvReading, CvTextCounts, RepoFiles } from "../../shared/readings";
import type { NewCardRow, Store } from "./db";
import { TokenPool } from "./github/tokens";

export type CardBody = Omit<CardData, "id" | "createdAt">;

/** Un jeton GitHub seul, ou le pool de jetons en rotation partagé par toutes les fiches. */
export type GithubAuth = string | TokenPool;

export interface RenderInput {
  format: "card" | "og" | "portrait";
  card?: CardData;
  comparison?: ComparisonData;
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
  scoreCv(
    reading: CvReading,
    counts: CvTextCounts,
    opts: { lang: Lang; judgedInSeconds: number; github?: unknown },
  ): CardBody;
  compareCards(cv: CardData, github: CardData): Omit<ComparisonData, "id" | "createdAt">;
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
  | "bad_request";

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
    fr: "Le jugement a pris plus de 30 secondes. Plutôt que d'inventer une carte, on s'arrête là : réessaie dans un instant.",
    en: "Judging took more than 30 seconds. Rather than make up a card, we stopped: try again in a moment.",
  },
  rate_limited: {
    fr: "20 cartes par jour, c'est le maximum. Reviens demain : même les recruteurs font des pauses.",
    en: "20 cards a day is the limit. Come back tomorrow: even recruiters take breaks.",
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
    fr: "Le commissariat déborde : trop de suspects d'un coup, GitHub nous fait souffler. Reviens dans quelques minutes.",
    en: "The station is overflowing: too many suspects at once, GitHub is making us take a breather. Come back in a few minutes.",
  },
  gone: {
    fr: "Ce dev a quitté la ville : sa fiche a été retirée par son propriétaire.",
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
    fr: "Carte introuvable : elle a expiré ou a été supprimée.",
    en: "Card not found: it expired or was deleted.",
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
    fr: `Le commissariat déborde : trop de suspects d'un coup, GitHub nous fait souffler. Reviens dans ${n} minute${n > 1 ? "s" : ""}.`,
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
  /** Timeout global d'une carte (SPEC §12). */
  timeoutMs?: number;
  /** Durée de conservation en mémoire d'un job en erreur. */
  errorTtlMs?: number;
  /** Fiches traitées en même temps (MAX_CONCURRENT_CARDS) ; les suivantes attendent en file. */
  maxConcurrent?: number;
  /** Au-delà de ce temps en file, la fiche échoue en `timeout`. */
  queueTimeoutMs?: number;
  /** Jetons GitHub épuisés : on garde la fiche en file si la remise à zéro arrive avant ce délai, sinon `busy`. */
  busyAfterMs?: number;
}

export const MAX_CONCURRENT_CARDS = 4;
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
  /** Entrée en file, puis début du traitement : les `at` de la progression partent de là. */
  startedAt: number;
  finishedAt?: number;
  error?: JobError;
  done: Promise<void>;
  /** Résout `done` (fin du traitement, ou échec avant même de démarrer). */
  settle: () => void;
  queueTimer?: ReturnType<typeof setTimeout>;
}

interface JobInput {
  lang: Lang;
  login?: string;
  pdf?: Uint8Array;
}

interface Ctx {
  signal: AbortSignal;
  emit(key: string, n?: number): void;
  seconds(): number;
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
    this.timeoutMs = opts.timeoutMs ?? 30_000;
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
    if (job.state === "running") return { state: "pending", progress: [...job.progress] };
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
    const job: Job = { id, state: "queued", input, deleteToken, progress: [], startedAt: Date.now(), done: settled, settle };
    this.jobs.set(id, job);
    const key = input.login && !input.pdf ? input.login.toLowerCase() : null;
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
    const timer = setTimeout(() => {
      timedOut = true;
      ac.abort(new JobError("timeout", MESSAGES.timeout));
      rejectTimeout(new JobError("timeout", MESSAGES.timeout));
    }, this.timeoutMs);

    const ctx: Ctx = {
      signal: ac.signal,
      emit: (key, n) => {
        if (job.state !== "running" || ac.signal.aborted) return;
        const ev: ProgressEvent = { key, at: Date.now() - job.startedAt };
        if (typeof n === "number" && Number.isFinite(n)) ev.n = n;
        job.progress.push(ev);
      },
      seconds: () => Math.max(1, Math.round((Date.now() - job.startedAt) / 1000)),
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
    const { lang, login, pdf } = input;
    const both = !!login && !!pdf;

    const [gh, cv] = await Promise.all([
      login ? this.githubBranch(login, ctx, both) : Promise.resolve(null),
      pdf ? this.cvBranch(pdf, ctx) : Promise.resolve(null),
    ]);

    const now = Date.now();
    const createdAt = new Date(now).toISOString();
    const judgedInSeconds = ctx.seconds();

    const githubCard = (cardId: string): CardData => {
      if (gh!.cached) return { ...gh!.cached, id: cardId, createdAt };
      return { ...deps.scoreGithub(gh!.facts, gh!.ai, { lang, judgedInSeconds }), id: cardId, createdAt };
    };
    const githubRow = (card: CardData, parentId: string | null): NewCardRow => ({
      id: card.id,
      parentId,
      createdAt: now,
      source: "github",
      login: login!,
      kind: "card",
      data: card,
      facts: parentId ? null : gh!.facts,
      deleteToken,
      degraded: gh!.degraded,
    });

    // GitHub seul.
    if (gh && !cv) return [githubRow(githubCard(id), null)];

    // CV illisible par l'IA : la carte GitHub seule si on l'a, sinon une erreur honnête.
    if (!cv!.reading) {
      if (gh) return [githubRow(githubCard(id), null)];
      throw new JobError("internal", MESSAGES.cv_unreadable);
    }

    const reading = cv!.reading;
    const cvRow = (card: CardData, parentId: string | null): NewCardRow => ({
      id: card.id,
      parentId,
      createdAt: now,
      source: "cv",
      login: null,
      kind: "card",
      data: card,
      deleteToken,
    });

    // CV seul, ou profil non dev : carte CV seule, pas de carte GitHub (§4.7).
    if (!gh || !reading.is_dev_profile) {
      const card: CardData = { ...deps.scoreCv(reading, cv!.counts, { lang, judgedInSeconds }), id, createdAt };
      return [cvRow(card, null)];
    }

    // Comparaison : trois lignes, la comparaison et ses deux cartes, chacune son id.
    ctx.emit("compare");
    const cvCard: CardData = {
      ...deps.scoreCv(reading, cv!.counts, { lang, judgedInSeconds, github: gh.facts }),
      id: newId(),
      createdAt,
    };
    const ghCard = githubCard(newId());
    const cmp = deps.compareCards(cvCard, ghCard);
    const comparison: ComparisonData = {
      ...cmp,
      id,
      createdAt,
      cv: { ...cmp.cv, id: cvCard.id, createdAt },
      github: { ...cmp.github, id: ghCard.id, createdAt },
    };
    return [
      { id, parentId: null, createdAt: now, source: "both", login, kind: "comparison", data: comparison, deleteToken, degraded: gh.degraded },
      cvRow(comparison.cv, id),
      githubRow(comparison.github, id),
    ];
  }

  private async githubBranch(login: string, ctx: Ctx, allowCache: boolean): Promise<GithubResult> {
    const { deps, store } = this.opts;
    if (allowCache) {
      // Comparaison sur un pseudo jugé il y a moins de 24 h : on ne refait pas les appels.
      const row = store.findRecentGithub(login);
      if (row?.facts && row.kind === "card") return { facts: row.facts, ai: null, degraded: false, cached: row.data as CardData };
    }
    const facts = await deps.collectGithub(login, {
      token: this.github,
      signal: ctx.signal,
      onProgress: (e) => ctx.emit(e.key, e.n),
    });
    ctx.emit("recruiter");
    let ai: CodeReadingResult | null = null;
    // Sans IA, rien n'a été lu : fiche dégradée. Rien à lire (aucun fichier) : la
    // fiche est la même à chaque fois, elle se met en cache normalement.
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
