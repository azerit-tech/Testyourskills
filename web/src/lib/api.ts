// Client de l'API. En mode démo (?mock=1 ou VITE_MOCK=1), tout passe par mock.ts.
import { fileOf } from "../../../shared/caseFile";
import { IMAGE_QUERY } from "../../../shared/images";
import type { CardData, JobState, Lang, Piece, WeekRank, WeekTop } from "../../../shared/types";
import { mockApi } from "./mock";
import { mockTop, mockWeekRank } from "./mockTop";
import { ApiError } from "./errors";
import { currentRef } from "./session";

export { ApiError };

export type AnalyticsEvent = "card_generated" | "card_shared" | "card_email" | "cta_azerit_clicked" | "shared_visit" | "denounce_landed" | "plea" | "film";

export interface CreateInput {
  login?: string;
  cv?: File;
  lang: Lang;
  /** Adresse de profil LinkedIn (§18.24) : seule, ou avec un pseudo pour la comparaison. */
  linkedin?: string;
  /** « Dénonce un complice » (§18.6) : l'id de la fiche du dénonciateur. */
  denouncedBy?: string;
}

export type Verdict = "guilty" | "cleared";

/** Décompte du jury d'une fiche (§18.27) ; `mine` : le vote déjà posé depuis cette adresse, sinon null. */
export interface Jury {
  guilty: number;
  cleared: number;
  mine: Verdict | null;
}

const NO_JURY: Jury = { guilty: 0, cleared: 0, mine: null };

function readJury(raw: unknown): Jury {
  const j = raw as Partial<Jury> | null | undefined;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return { guilty: n(j?.guilty), cleared: n(j?.cleared), mine: j?.mine === "guilty" || j?.mine === "cleared" ? j.mine : null };
}

/** GET /api/card/:id/case (§18.6, §18.7, §18.27). */
export interface CaseInfo {
  /** Fiche née d'une dénonciation. */
  denounced: boolean;
  /** Login du dénonciateur, seulement s'il a revendiqué sa fiche ; sinon null : dénonciation anonyme. */
  by: string | null;
  /** Compte X de la personne de la fiche, sans @. */
  x: string | null;
  /** Au plus trois complices à suggérer. */
  accomplices: { login: string; avatarUrl: string }[];
  /** « Coupable ou relaxe ? » : le décompte de la page partagée. */
  jury: Jury;
}

export interface CreateResult {
  id: string;
  deleteToken?: string;
  cached?: boolean;
}

const MOCK_KEY = "tys_mock";

/** Le mode démo est collant pendant la session, pour survivre aux navigations. */
export function isMock(): boolean {
  if (import.meta.env.VITE_MOCK === "1") return true;
  try {
    const q = new URLSearchParams(window.location.search).get("mock");
    if (q === "1") sessionStorage.setItem(MOCK_KEY, "1");
    if (q === "0") sessionStorage.removeItem(MOCK_KEY);
    return sessionStorage.getItem(MOCK_KEY) === "1";
  } catch {
    return false;
  }
}

async function readError(res: Response): Promise<ApiError> {
  const fallback =
    res.status === 429 ? "rate_limited" : res.status === 503 ? "busy" : res.status === 404 ? "not_found" : "internal";
  try {
    const body = await res.json();
    // Deux formes acceptées : { error: { code, message } } ou { state: "error", code, message }.
    const err = body?.error ?? body;
    const msg = err?.message && typeof err.message === "object" ? err.message : null;
    return new ApiError(res.status, err?.code ?? fallback, msg);
  } catch {
    return new ApiError(res.status, fallback, null);
  }
}

export interface AppConfig {
  linkedin: boolean;
  /** « C'est moi » : l'OAuth GitHub est configuré côté serveur (§18.1). */
  claim: boolean;
  /** Le champ unique accepte un lien LinkedIn : le serveur a un fournisseur de profils (§18.24). */
  linkedinEntry: boolean;
}

/** Propriétaire connecté par GitHub (§18.1). */
export interface Me {
  login: string;
  hidden: boolean;
}

let configPromise: Promise<AppConfig> | null = null;
const MOCK_CONFIG: AppConfig = { linkedin: true, claim: true, linkedinEntry: true };
const CONFIG_KEY = "tys_config";
/** La configuration une fois connue : en RAM, et dans sessionStorage pour la page suivante. */
let configMemo: AppConfig | null = null;

/** Fonctions disponibles côté serveur (ex. connexion LinkedIn), lue une fois. */
function getConfig(): Promise<AppConfig> {
  if (!configPromise) {
    configPromise = isMock()
      ? Promise.resolve(MOCK_CONFIG)
      : fetch("/api/config", { headers: { Accept: "application/json" } })
          .then(async (r) => {
            const c = (r.ok ? await r.json() : {}) as { linkedin?: boolean; claim?: boolean; linkedinEntry?: boolean } | null;
            const cfg = { linkedin: c?.linkedin === true, claim: c?.claim === true, linkedinEntry: c?.linkedinEntry === true };
            // Seule une vraie réponse est gardée pour la session : une panne passagère ne fige rien.
            if (r.ok) {
              try {
                sessionStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
              } catch {
                /* stockage bloqué : la RAM suffit */
              }
            }
            return cfg;
          })
          .catch(() => ({ linkedin: false, claim: false, linkedinEntry: false }));
    void configPromise.then((c) => (configMemo = c));
  }
  return configPromise;
}

/** La configuration si elle est déjà connue (cette page ou plus tôt dans la session), sinon null. Synchrone. */
function knownConfig(): AppConfig | null {
  if (configMemo) return configMemo;
  if (isMock()) return MOCK_CONFIG;
  try {
    const raw = sessionStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<AppConfig> | null;
    return { linkedin: c?.linkedin === true, claim: c?.claim === true, linkedinEntry: c?.linkedinEntry === true };
  } catch {
    return null;
  }
}

/** Démarre la connexion LinkedIn pour poser la photo sur la carte. `token` null : la session du propriétaire fait foi. */
function startLinkedInPhoto(id: string, token: string | null) {
  if (isMock()) {
    mockApi.setPhoto(id);
    // Simule le retour du serveur après l'autorisation.
    window.history.replaceState(window.history.state, "", `/c/${id}?photo=linkedin`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    return;
  }
  window.location.href = `/auth/linkedin/start?card=${encodeURIComponent(id)}${token ? `&token=${encodeURIComponent(token)}` : ""}`;
}

// --- « C'est moi » (§18.1) ---------------------------------------------------
// La session est un cookie httpOnly posé par le serveur : le front ne la lit
// pas, il demande /api/me. En mode démo, tout reste en mémoire.

let mockMe: Me | null = null;

/** Qui est connecté par GitHub, ou null. Jamais d'erreur : null au moindre doute. */
async function getMe(): Promise<Me | null> {
  if (isMock()) return mockMe;
  try {
    const res = await fetch("/api/me", { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const me = (await res.json()) as Me | null;
    return me && typeof me.login === "string" ? { login: me.login, hidden: me.hidden === true } : null;
  } catch {
    return null;
  }
}

/**
 * Part chez GitHub prouver que la fiche est la sienne ; le serveur revient sur
 * la page en cours. `login` ne sert qu'au mode démo (une fiche retirée ne le donne pas).
 */
function startClaim(cardId: string, login = "leamd") {
  const back = window.location.pathname + window.location.search;
  if (isMock()) {
    mockMe = { login: login.toLowerCase(), hidden: mockMe?.hidden ?? false };
    const u = new URL(back, window.location.origin);
    u.searchParams.set("claim", "ok");
    u.searchParams.set("as", login.toLowerCase());
    window.history.replaceState(window.history.state, "", u.pathname + u.search);
    window.dispatchEvent(new PopStateEvent("popstate"));
    return;
  }
  window.location.href = `/auth/github/start?card=${encodeURIComponent(cardId)}&return=${encodeURIComponent(back)}`;
}

/** Masque (ou rend visibles) toutes les fiches du login connecté (§18.1). */
async function setHidden(hidden: boolean): Promise<Me> {
  if (isMock()) {
    if (!mockMe) throw new ApiError(401, "internal", null);
    mockMe = { ...mockMe, hidden };
    return mockMe;
  }
  const res = await fetch(hidden ? "/api/owner/hide" : "/api/owner/unhide", { method: "POST" });
  if (!res.ok) throw await readError(res);
  const body = (await res.json()) as { login: string; hidden: boolean };
  return { login: body.login, hidden: body.hidden };
}

async function logout(): Promise<void> {
  mine.clear();
  if (isMock()) {
    mockMe = null;
    return;
  }
  const res = await fetch("/auth/logout", { method: "POST" });
  if (!res.ok) throw await readError(res);
}

async function createCard(input: CreateInput): Promise<CreateResult> {
  if (isMock()) return mockApi.createCard(input);
  let res: Response;
  // Fiche d'origine si on est arrivé par un lien partagé (§18.0) ; le serveur l'ignore si elle n'existe pas.
  const ref = currentRef() ?? undefined;
  try {
    if (input.cv) {
      const fd = new FormData();
      fd.append("cv", input.cv);
      if (input.login) fd.append("login", input.login);
      fd.append("lang", input.lang);
      if (ref) fd.append("ref", ref);
      res = await fetch("/api/card", { method: "POST", body: fd });
    } else {
      res = await fetch("/api/card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: input.login, linkedin: input.linkedin, lang: input.lang, ref, denouncedBy: input.denouncedBy }),
      });
    }
  } catch {
    throw new ApiError(0, "network", null);
  }
  if (!res.ok) throw await readError(res);
  return res.json();
}

/** Rang de la semaine des fiches lues (§18.22), gardé pour l'après-fiche. */
const weeks = new Map<string, WeekRank>();

/** Rang de la semaine de cette fiche, lu avec elle ; null : hors classement. */
export function weekOf(id: string): WeekRank | null {
  return weeks.get(id) ?? null;
}

/** Fiches lues dont la session GitHub est propriétaire revendiquée (§18.1), d'après le serveur. */
const mine = new Set<string>();
/** Fiches lues qui portent un pseudo GitHub. */
const withGithub = new Set<string>();

/** La fiche porte un pseudo GitHub : quand la revendication est active, sa photo est au propriétaire connecté. */
export function hasGithub(id: string): boolean {
  return withGithub.has(id);
}

/** La session est propriétaire du login de cette fiche : ce que le jeton de la fiche ouvre lui est ouvert aussi. */
export function isMine(id: string): boolean {
  return mine.has(id);
}

async function getJob(id: string): Promise<JobState> {
  const job = await fetchJob(id);
  if (job.state === "done") {
    // Un dossier à deux pièces : sa fiche, sa note (shared/caseFile.ts).
    const main = job.kind === "card" ? job.card : fileOf(job.comparison);
    const week = isMock() ? mockWeekRank(main) : job.week;
    if (week) weeks.set(id, week);
    else weeks.delete(id);
    const owned = isMock() ? !!mockMe && mockMe.login === main.login?.toLowerCase() : job.mine === true;
    if (owned) mine.add(id);
    else mine.delete(id);
    if (main.login) withGithub.add(id);
    else withGithub.delete(id);
  }
  return job;
}

async function fetchJob(id: string): Promise<JobState> {
  if (isMock()) return mockApi.getJob(id, mockMe?.login ?? null);
  let res: Response;
  try {
    // Le jeton de la fiche, s'il est sur cet appareil : le serveur rend alors la grille entière, sinon la version publique.
    const token = tokens.get(id);
    res = await fetch(`/api/card/${encodeURIComponent(id)}`, { headers: { Accept: "application/json", ...(token ? { "X-Card-Token": token } : {}) } });
  } catch {
    throw new ApiError(0, "network", null);
  }
  if (!res.ok) throw await readError(res);
  return res.json();
}

/** Dénonciation et complices d'une fiche ; une fiche sans rien en cas d'erreur, jamais d'exception. */
async function getCase(id: string): Promise<CaseInfo> {
  const none: CaseInfo = { denounced: false, by: null, x: null, accomplices: [], jury: NO_JURY };
  if (isMock()) return mockApi.getCase(id);
  try {
    const res = await fetch(`/api/card/${encodeURIComponent(id)}/case`, { headers: { Accept: "application/json" } });
    if (!res.ok) return none;
    const c = (await res.json()) as Partial<CaseInfo>;
    return {
      denounced: c.denounced === true,
      by: typeof c.by === "string" ? c.by : null,
      x: typeof c.x === "string" ? c.x : null,
      accomplices: Array.isArray(c.accomplices) ? c.accomplices.filter((a) => typeof a?.login === "string" && typeof a?.avatarUrl === "string") : [],
      jury: readJury(c.jury),
    };
  } catch {
    return none;
  }
}

/** POST /api/vote (§18.27) : pose le vote et rend le décompte ; déjà voté depuis cette adresse, le premier vote reste. */
async function vote(cardId: string, verdict: Verdict): Promise<Jury> {
  if (isMock()) return mockApi.vote(cardId, verdict);
  let res: Response;
  try {
    res = await fetch("/api/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ cardId, verdict }),
    });
  } catch {
    throw new ApiError(0, "network", null);
  }
  if (!res.ok) throw await readError(res);
  return readJury(((await res.json()) as { jury?: unknown }).jury);
}

async function sendEmail(cardId: string, email: string): Promise<void> {
  if (isMock()) return mockApi.sendEmail(cardId, email);
  const res = await fetch("/api/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Le jeton de la fiche prouve qu'on l'a créée ; sans lui, la session du propriétaire (cookie) fait foi.
    body: JSON.stringify({ cardId, email, token: tokens.get(cardId) ?? undefined }),
  });
  if (!res.ok) throw await readError(res);
}

/** `token` null : la session du propriétaire revendiqué (cookie) fait foi. */
async function deleteCard(id: string, token: string | null): Promise<void> {
  if (isMock()) return mockApi.deleteCard(id, token ?? "");
  const qs = token ? `?token=${encodeURIComponent(token)}` : "";
  const res = await fetch(`/api/card/${encodeURIComponent(id)}${qs}`, { method: "DELETE" });
  if (!res.ok) throw await readError(res);
}

/** Analytics : tir sans attente, jamais bloquant. */
function track(event: AnalyticsEvent, cardId: string | null, meta: Record<string, unknown> = {}) {
  if (isMock()) {
    console.debug("[mock] event", event, cardId, meta);
    return;
  }
  try {
    void fetch("/api/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // sans fiche (le film) : pas de clé cardId, que le serveur refuserait
      body: JSON.stringify(cardId ? { event, cardId, meta } : { event, meta }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* rien */
  }
}

/**
 * Le vrai jugement de la vitrine (§6.1, §18.35) : sa fiche (celle de son dossier
 * s'il a deux pièces, §18.36), le lien vers elle et ses pièces.
 */
export interface Showcase {
  card: CardData;
  href: string;
  /** Un dossier à deux pièces : `["linkedin", "github"]`. */
  pieces?: Piece[];
}

const PIECES: readonly Piece[] = ["linkedin", "cv", "github"];

/** La vitrine de l'accueil ; null tant que le serveur ne l'a pas calculée. */
async function getShowcase(): Promise<Showcase | null> {
  if (isMock()) return mockApi.getShowcase();
  const res = await fetch("/api/showcase", { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const body = (await res.json()) as Partial<Showcase> & { card?: CardData | null };
  if (!body.card) return null;
  const pieces = Array.isArray(body.pieces) && body.pieces.length > 1 && body.pieces.every((p) => PIECES.includes(p)) ? body.pieces : undefined;
  return { card: body.card, href: body.href ?? `/c/${body.card.id}`, ...(pieces ? { pieces } : {}) };
}

/** La requête du top en cours : la couverture et le tableau de l'accueil la partagent. */
let topFlight: Promise<WeekTop | null> | null = null;

/** Le haut du classement de la semaine (§18.22) ; null si le serveur ne répond pas. */
function getTop(): Promise<WeekTop | null> {
  if (isMock()) return Promise.resolve(mockTop());
  topFlight ??= fetchTop().finally(() => {
    topFlight = null;
  });
  return topFlight;
}

async function fetchTop(): Promise<WeekTop | null> {
  try {
    const res = await fetch("/api/top", { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as WeekTop;
  } catch {
    return null;
  }
}

export const api = { createCard, getJob, getCase, vote, sendEmail, deleteCard, track, getConfig, knownConfig, startLinkedInPhoto, getShowcase, getTop, getMe, startClaim, setHidden, logout };

/** URLs des images rendues par le serveur (§7). `?v=` : le dessin en cours, servi avec un cache d'un an (shared/images.ts). */
export const images = {
  og: (id: string) => `/og/${id}.png?${IMAGE_QUERY}`,
  portrait: (id: string) => `/og/${id}-portrait.png?${IMAGE_QUERY}`,
  /** 1080 × 1920, Instagram et TikTok ; d'une comparaison, la fiche GitHub. */
  story: (id: string) => `/og/${id}-story.png?${IMAGE_QUERY}`,
  card: (id: string) => `/og/${id}-card.png`,
};

// Jetons de suppression, gardés localement par id de carte.
const TOKENS_KEY = "tys_tokens";

function readTokens(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export const tokens = {
  get(id: string): string | null {
    return readTokens()[id] ?? null;
  },
  set(id: string, token: string) {
    try {
      localStorage.setItem(TOKENS_KEY, JSON.stringify({ ...readTokens(), [id]: token }));
    } catch {
      /* rien */
    }
  },
  remove(id: string) {
    try {
      const all = readTokens();
      delete all[id];
      localStorage.setItem(TOKENS_KEY, JSON.stringify(all));
    } catch {
      /* rien */
    }
  },
};
