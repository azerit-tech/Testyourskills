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

export type CardBody = Omit<CardData, "id" | "createdAt">;

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
    opts: { token: string; onProgress?: (e: { key: string; n?: number }) => void; signal?: AbortSignal },
  ): Promise<unknown>;
  pickFilesForReading(facts: unknown, opts: { token: string; signal?: AbortSignal }): Promise<RepoFiles[]>;
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
  | "empty_pdf"
  | "cv_unreadable"
  | "not_found"
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
  githubToken: string;
  /** Timeout global d'une carte (SPEC §12). */
  timeoutMs?: number;
  /** Durée de conservation en mémoire d'un job en erreur. */
  errorTtlMs?: number;
}

interface Job {
  id: string;
  state: "pending" | "error";
  progress: ProgressEvent[];
  startedAt: number;
  finishedAt?: number;
  error?: JobError;
  done: Promise<void>;
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

  constructor(private opts: PipelineOptions) {
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.errorTtlMs = opts.errorTtlMs ?? 3600_000;
  }

  /** État en mémoire d'un job en cours ou en erreur. null : voir la base. */
  jobState(id: string): JobState | null {
    const job = this.jobs.get(id);
    if (!job) return null;
    if (job.state === "pending") return { state: "pending", progress: [...job.progress] };
    return { state: "error", code: job.error!.code, message: job.error!.msg };
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

  /** Lance une carte. Le jeton de suppression n'est rendu qu'ici, au créateur. */
  start(input: JobInput): { id: string; deleteToken: string } {
    this.sweep();
    const id = newId();
    const deleteToken = newToken();
    const job: Job = { id, state: "pending", progress: [], startedAt: Date.now(), done: Promise.resolve() };
    this.jobs.set(id, job);
    const key = input.login && !input.pdf ? input.login.toLowerCase() : null;
    if (key) this.inflight.set(key, id);
    job.done = this.execute(job, deleteToken, input).finally(() => {
      if (key && this.inflight.get(key) === id) this.inflight.delete(key);
    });
    return { id, deleteToken };
  }

  private sweep() {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (job.state === "error" && job.finishedAt && now - job.finishedAt > this.errorTtlMs) this.jobs.delete(id);
    }
  }

  private async execute(job: Job, deleteToken: string, input: JobInput): Promise<void> {
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
        if (job.state !== "pending" || ac.signal.aborted) return;
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
      { id, parentId: null, createdAt: now, source: "both", login, kind: "comparison", data: comparison, deleteToken },
      cvRow(comparison.cv, id),
      githubRow(comparison.github, id),
    ];
  }

  private async githubBranch(login: string, ctx: Ctx, allowCache: boolean): Promise<GithubResult> {
    const { deps, store, githubToken } = this.opts;
    if (allowCache) {
      // Comparaison sur un pseudo jugé il y a moins de 24 h : on ne refait pas les appels.
      const row = store.findRecentGithub(login);
      if (row?.facts && row.kind === "card") return { facts: row.facts, ai: null, cached: row.data as CardData };
    }
    const facts = await deps.collectGithub(login, {
      token: githubToken,
      signal: ctx.signal,
      onProgress: (e) => ctx.emit(e.key, e.n),
    });
    ctx.emit("recruiter");
    let ai: CodeReadingResult | null = null;
    if (deps.aiAvailable()) {
      try {
        const files = await deps.pickFilesForReading(facts, { token: githubToken, signal: ctx.signal });
        if (files.length) ai = await deps.readCode(files, { signal: ctx.signal });
      } catch (err) {
        // IA coupée : pas de fiche sans lecture (§2.3), la fiche échoue en `closed`.
        if (ctx.signal.aborted || isAiClosed(err)) throw err;
        console.warn(`[github ${login}] lecture IA indisponible, carte sans lecture :`, (err as Error).message);
        ai = null;
      }
    }
    return { facts, ai };
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
