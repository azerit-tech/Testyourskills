// Client de l'API. En mode démo (?mock=1 ou VITE_MOCK=1), tout passe par mock.ts.
import { fileOf } from "../../../shared/caseFile";
import { IMAGE_QUERY } from "../../../shared/images";
import { parseSeason, seasonDates, type SeasonDates } from "../../../shared/season";
import seasonJson from "../../../data/season.json";
import type { CardData, JobState, Lang, Piece, Proposal, WeekRank, WeekTop } from "../../../shared/types";
import type { ProfileLinks } from "../../../shared/profileLinks";
/** La maquette (mock.ts), chargée seulement en mode démo : le site réel ne la télécharge jamais. */
export const demoApi = () => import("./mock").then((m) => m.mockApi);
import { mockTop, mockWeekRank } from "./mockTop";
import { ApiError } from "./errors";
import { currentRef } from "./session";

export { ApiError };

export type AnalyticsEvent = "card_generated" | "card_shared" | "card_email" | "cta_azerit_clicked" | "shared_visit" | "denounce_landed" | "plea" | "film" | "band_view" | "band_share" | "prime_view";

export interface CreateInput {
  login?: string;
  cv?: File;
  lang: Lang;
  /** Adresse de profil LinkedIn (§18.24) : seule, ou avec un pseudo pour la comparaison. */
  linkedin?: string;
  /** « Dénonce un complice » (§18.6) : l'id de la fiche du dénonciateur. */
  denouncedBy?: string;
  /** La fiche que celle-ci complète (« Ajoute ton GitHub », « Ajoute ton LinkedIn ») : ses bandes suivent (§18.82). */
  from?: string;
  /** « Je n'en ai pas » à la question d'avant le jugement (§18.111) : sa fiche LinkedIn seule, sans GitHub proposé. */
  noGithub?: boolean;
  /** « Ce n'est pas moi » au LinkedIn trouvé avant le jugement (§18.113) : sa fiche GitHub seule, sans LinkedIn proposé. */
  noLinkedin?: boolean;
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

/** Le choix de la démo dans cette page, quand le stockage de session est bloqué (navigation privée stricte). */
let memMock: boolean | null = null;

/**
 * Le mode démo est collant pendant la session, pour survivre aux navigations.
 * `?mock=1` dans l'adresse vaut démo avant toute écriture : un stockage bloqué ne
 * fait jamais basculer la démo dans le mode réel (et ses appels payants) ; la RAM
 * garde alors le choix pour la page.
 */
export function isMock(): boolean {
  if (import.meta.env.VITE_MOCK === "1") return true;
  let q: string | null = null;
  try {
    q = new URLSearchParams(window.location.search).get("mock");
  } catch {
    /* hors navigateur */
  }
  if (q === "1" || q === "0") {
    memMock = q === "1";
    try {
      if (q === "1") sessionStorage.setItem(MOCK_KEY, "1");
      else sessionStorage.removeItem(MOCK_KEY);
    } catch {
      /* stockage bloqué : la RAM suffit */
    }
    return memMock;
  }
  try {
    if (sessionStorage.getItem(MOCK_KEY) === "1") return true;
  } catch {
    /* stockage bloqué */
  }
  return memMock === true;
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
  /** Le champ « Ton nom » propose des profils LinkedIn (§18.80). */
  linkedinSearch: boolean;
  /** Les boutons « Se connecter avec LinkedIn » et « Se connecter avec GitHub » (§18.80). */
  linkedinLogin: boolean;
  githubLogin: boolean;
  /** Une prime au moins est ouverte (data/season.json, §18.4). */
  primesOpen: boolean;
  /** La saison porte au moins une prime, ouverte, à venir ou close : /primes existe. */
  primesListed: boolean;
  /** Le règlement relu est servi sur /reglement. */
  rulesPublished: boolean;
  /** Les dates de la saison (data/season.json) ; null si le serveur n'en a pas. */
  season: SeasonDates | null;
  /** Les entretiens en jeu dans les primes ouvertes : ce que le bandeau de saison annonce. */
  interviews: number;
}

/** La configuration lue dans une réponse de /api/config (ou sa copie de session) : tout champ douteux vaut « non ». */
export function parseConfig(raw: unknown): AppConfig {
  const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = parseSeason(c.season && typeof c.season === "object" ? { ...c.season, primes: [] } : null);
  return {
    linkedin: c.linkedin === true,
    claim: c.claim === true,
    linkedinEntry: c.linkedinEntry === true,
    linkedinSearch: c.linkedinSearch === true,
    linkedinLogin: c.linkedinLogin === true,
    githubLogin: c.githubLogin === true,
    primesOpen: c.primesOpen === true,
    primesListed: c.primesListed === true,
    rulesPublished: c.rulesPublished === true,
    season: s ? seasonDates(s) : null,
    interviews: typeof c.interviews === "number" && Number.isInteger(c.interviews) && c.interviews > 0 ? c.interviews : 0,
  };
}

/** Propriétaire connecté par GitHub (§18.1). */
export interface Me {
  login: string;
  hidden: boolean;
}

/**
 * Les dates de data/season.json, prises au build : ce que le bandeau affiche avant
 * la réponse de /api/config (le même fichier, servi par le serveur), sans saut.
 */
const parsedSeason = parseSeason(seasonJson);
export const SEASON_FILE: SeasonDates | null = parsedSeason ? seasonDates(parsedSeason) : null;

let configPromise: Promise<AppConfig> | null = null;
/** Mode démo : la saison du fichier, aucune prime ouverte (il n'en existe pas encore). */
const MOCK_CONFIG: AppConfig = { linkedin: true, claim: true, linkedinEntry: true, linkedinSearch: true, linkedinLogin: true, githubLogin: true, primesOpen: false, primesListed: false, rulesPublished: false, season: SEASON_FILE, interviews: 0 };
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
            const cfg = parseConfig(r.ok ? await r.json() : null);
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
          .catch(() => parseConfig(null));
    void configPromise.then((c) => (configMemo = c));
  }
  return configPromise;
}

/** Celle que le serveur a écrite dans la page (server/src/html.ts, injectConfig), lue une fois. */
let pageConfig: AppConfig | null | undefined;
function configInPage(): AppConfig | null {
  if (pageConfig === undefined) {
    try {
      const raw = document.getElementById("tys-config")?.textContent;
      pageConfig = raw ? parseConfig(JSON.parse(raw)) : null;
    } catch {
      pageConfig = null;
    }
  }
  return pageConfig;
}

/** La configuration si elle est déjà connue (cette page, plus tôt dans la session, ou écrite dans le HTML), sinon null. Synchrone. */
function knownConfig(): AppConfig | null {
  if (configMemo) return configMemo;
  if (isMock()) return MOCK_CONFIG;
  const inPage = configInPage();
  if (inPage) return inPage;
  try {
    const raw = sessionStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    return parseConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Démarre la connexion LinkedIn pour poser la photo sur la carte. `token` null : la session du propriétaire fait foi. */
function startLinkedInPhoto(id: string, token: string | null) {
  if (isMock()) {
    void demoApi().then((mock) => {
      mock.setPhoto(id);
      // Simule le retour du serveur après l'autorisation.
      window.history.replaceState(window.history.state, "", `/c/${id}?photo=linkedin`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    return;
  }
  window.location.href = `/auth/linkedin/start?card=${encodeURIComponent(id)}${token ? `&token=${encodeURIComponent(token)}` : ""}`;
}

// --- « C'est moi » (§18.1) ---------------------------------------------------
// La session est un cookie httpOnly posé par le serveur : le front ne la lit
// pas, il demande /api/me. En mode démo, tout reste en mémoire.

let mockMe: Me | null = null;

/** Ce que /api/me rend : la revendication (login, hidden) et le compte léger (§18.91). */
interface MeBody {
  login?: unknown;
  hidden?: unknown;
  cardId?: unknown;
  sources?: unknown;
  avatarUrl?: unknown;
  initial?: unknown;
  cardLogin?: unknown;
  cardLinkedin?: unknown;
  overall?: unknown;
  known?: unknown;
}
let meFlight: Promise<MeBody | null> | null = null;
/** Une seule demande à la fois : la barre, l'entrée et l'après-fiche la partagent. */
function fetchMe(): Promise<MeBody | null> {
  meFlight ??= fetch("/api/me", { headers: { Accept: "application/json" } })
    .then(async (res) => (res.ok ? ((await res.json()) as MeBody | null) : null))
    .catch(() => null)
    .finally(() => setTimeout(() => (meFlight = null), 0));
  return meFlight;
}

/** Qui est connecté par GitHub, ou null. Jamais d'erreur : null au moindre doute. */
async function getMe(): Promise<Me | null> {
  if (isMock()) return mockMe;
  const me = await fetchMe();
  return me && typeof me.login === "string" ? { login: me.login, hidden: me.hidden === true } : null;
}

// --- Le compte léger (§18.91) ------------------------------------------------
// Se connecter par LinkedIn ou GitHub crée le compte ; le cookie est httpOnly, le
// front demande /api/me. En démo, le compte vit dans sessionStorage (une connexion
// de démo recharge la page) ; ?compte=li ou ?compte=gh en pose un avec sa fiche.

export type AccountSource = "linkedin" | "github";
export interface Account {
  /** « Ma fiche », ou null : jamais faite, expirée, supprimée. */
  cardId: string | null;
  /** Le pseudo et la note de cette fiche ; null quand le serveur ne les dit pas (démo). */
  cardLogin: string | null;
  /** Sa fiche porte un LinkedIn (§18.111) : « Se connecter avec LinkedIn » ne lui est plus proposé, comme GitHub avec `cardLogin`. */
  cardLinkedin?: boolean;
  overall: number | null;
  sources: AccountSource[];
  avatarUrl: string | null;
  initial: string | null;
  /** Pas de compte : le repli sans droit de `tys_who` (§18.90), seulement « Voir ma fiche ». */
  known: boolean;
}

const MOCK_ACCOUNT_KEY = "tys_mock_acct";
let mockAccountMem: Account | null = null;
let mockAccountUrlRead = false;
const MOCK_ACCOUNTS: Record<string, Account> = {
  li: { cardId: "m-licmp-compte01", cardLogin: null, overall: null, sources: ["linkedin"], avatarUrl: "/mock-linkedin.svg", initial: "L", known: false },
  /** Connecté par LinkedIn, son dossier porte déjà son GitHub (§18.111). */
  ligh: { cardId: "m-licmp-compte02", cardLogin: "camroux", cardLinkedin: true, overall: null, sources: ["linkedin"], avatarUrl: "/mock-linkedin.svg", initial: "L", known: false },
  gh: { cardId: "m-gold-compte01", cardLogin: null, overall: null, sources: ["github"], avatarUrl: null, initial: "L", known: false },
  /** Connecté par LinkedIn, sa fiche partie (§18.105). */
  li0: { cardId: null, cardLogin: null, overall: null, sources: ["linkedin"], avatarUrl: "/mock-linkedin.svg", initial: "L", known: false },
};

function parseAccount(raw: unknown): Account | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as MeBody;
  const sources = Array.isArray(b.sources) ? b.sources.filter((s): s is AccountSource => s === "linkedin" || s === "github") : [];
  const known = b.known === true;
  const cardId = typeof b.cardId === "string" ? b.cardId : null;
  if (!sources.length && !(known && cardId)) return null;
  return {
    cardId,
    cardLogin: typeof b.cardLogin === "string" ? b.cardLogin : null,
    ...(b.cardLinkedin === true ? { cardLinkedin: true } : {}),
    overall: typeof b.overall === "number" && Number.isFinite(b.overall) ? b.overall : null,
    sources,
    avatarUrl: typeof b.avatarUrl === "string" && b.avatarUrl ? b.avatarUrl : null,
    initial: typeof b.initial === "string" && b.initial ? b.initial : null,
    known,
  };
}

/** Le compte de démo. */
export function mockAccount(): Account | null {
  if (!mockAccountUrlRead) {
    mockAccountUrlRead = true;
    try {
      const q = new URLSearchParams(window.location.search).get("compte");
      if (q && q in MOCK_ACCOUNTS) setMockAccount(MOCK_ACCOUNTS[q]!);
      else if (q === "0") setMockAccount(null);
    } catch {
      /* hors navigateur */
    }
  }
  try {
    const raw = sessionStorage.getItem(MOCK_ACCOUNT_KEY);
    if (raw) return parseAccount(JSON.parse(raw));
  } catch {
    /* stockage bloqué : la RAM */
  }
  return mockAccountMem;
}

export function setMockAccount(a: Account | null) {
  mockAccountMem = a;
  try {
    if (a) sessionStorage.setItem(MOCK_ACCOUNT_KEY, JSON.stringify(a));
    else sessionStorage.removeItem(MOCK_ACCOUNT_KEY);
  } catch {
    /* stockage bloqué : la RAM */
  }
}

/** Le compte de ce navigateur, ou null (pas connecté, ou pas de compte sur ce serveur). Jamais d'erreur. */
async function getAccount(): Promise<Account | null> {
  if (isMock()) return mockAccount();
  return parseAccount(await fetchMe());
}

/**
 * Part chez GitHub prouver que la fiche est la sienne ; le serveur revient sur
 * la page en cours, ou sur `returnTo` (« Concourir » ramène à la prime). `login`
 * ne sert qu'au mode démo (une fiche retirée ne le donne pas).
 */
function startClaim(cardId: string, login = "leamd", returnTo?: string) {
  const back = returnTo ?? window.location.pathname + window.location.search;
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

/** « Non » à la proposition sous sa fiche (§18.100) : le serveur ne la rend plus. Silencieux en cas d'échec. */
async function declineProposal(id: string): Promise<void> {
  proposals.delete(id);
  if (isMock()) return (await demoApi()).declineProposal(id);
  const token = tokens.get(id);
  try {
    await fetch(`/api/card/${encodeURIComponent(id)}/propose`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { "X-Card-Token": token } : {}) },
      body: JSON.stringify({ answer: "no" }),
    });
  } catch {
    /* réseau : cet appareil s'en souvient (lib/propose.ts) */
  }
}

/** Se déconnecter : la revendication et le compte (§18.91), les deux cookies. */
async function logout(): Promise<void> {
  mine.clear();
  if (isMock()) {
    mockMe = null;
    setMockAccount(null);
    return;
  }
  const res = await fetch("/auth/logout", { method: "POST" });
  if (!res.ok) throw await readError(res);
}

/** Clé de l'identifiant du navigateur en stockage local (limite de fiches par navigateur, §18.48). */
const BROWSER_KEY = "tys_browser";
let browserFallback: string | null = null;

/**
 * Un identifiant tiré au hasard, gardé en stockage local : il ne dit rien de la
 * personne, il sert seulement à compter les fiches de ce navigateur dans la
 * journée ; le serveur n'en garde que le hash. Sans stockage, un tirage par visite.
 */
export function browserId(): string {
  const fresh = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  };
  try {
    const kept = localStorage.getItem(BROWSER_KEY);
    if (kept && /^[A-Za-z0-9_-]{16,64}$/.test(kept)) return kept;
    const id = fresh();
    localStorage.setItem(BROWSER_KEY, id);
    return id;
  } catch {
    return (browserFallback ??= fresh());
  }
}

async function createCard(input: CreateInput): Promise<CreateResult> {
  if (isMock()) return (await demoApi()).createCard(input);
  let res: Response;
  // Fiche d'origine si on est arrivé par un lien partagé (§18.0) ; le serveur l'ignore si elle n'existe pas.
  const ref = currentRef() ?? undefined;
  const browser = { "X-Browser-Id": browserId() };
  try {
    if (input.cv) {
      const fd = new FormData();
      fd.append("cv", input.cv);
      if (input.login) fd.append("login", input.login);
      fd.append("lang", input.lang);
      if (ref) fd.append("ref", ref);
      res = await fetch("/api/card", { method: "POST", headers: browser, body: fd });
    } else {
      // Le jeton de la fiche complétée prouve que c'est le même navigateur : une personne, une entrée dans ses bandes.
      const held = input.from ? tokens.get(input.from) : null;
      res = await fetch("/api/card", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...browser, ...(held ? { "X-Card-Token": held } : {}) },
        body: JSON.stringify({ login: input.login, linkedin: input.linkedin, lang: input.lang, ref, denouncedBy: input.denouncedBy, from: input.from, ...(input.noGithub ? { noGithub: true } : {}), ...(input.noLinkedin ? { noLinkedin: true } : {}) }),
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
/** L'autre source proposée sous une fiche (§18.100), telle que le serveur l'a rendue à sa personne. */
const proposals = new Map<string, Proposal>();

/** Ses profils publics (§18.108), tels que le serveur les a rendus avec cette fiche. */
const links = new Map<string, ProfileLinks>();

/** Les liens vers les profils LinkedIn et GitHub de cette fiche, sinon null. */
export function linksOf(id: string): ProfileLinks | null {
  return links.get(id) ?? null;
}

/** La proposition que le serveur a rendue avec cette fiche, sinon null. */
export function proposalOf(id: string): Proposal | null {
  return proposals.get(id) ?? null;
}

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
    const owned = isMock() ? (!!mockMe && mockMe.login === main.login?.toLowerCase()) || mockAccount()?.cardId === id : job.mine === true;
    if (owned) mine.add(id);
    else mine.delete(id);
    if (main.login) withGithub.add(id);
    else withGithub.delete(id);
    if (job.kind === "card" && job.propose) proposals.set(id, job.propose);
    else proposals.delete(id);
    if (job.links) links.set(id, job.links);
    else links.delete(id);
  }
  return job;
}

async function fetchJob(id: string): Promise<JobState> {
  if (isMock()) return (await demoApi()).getJob(id, mockMe?.login ?? null);
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
  if (isMock()) return (await demoApi()).getCase(id);
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
  if (isMock()) return (await demoApi()).vote(cardId, verdict);
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
  if (isMock()) return (await demoApi()).sendEmail(cardId, email);
  const res = await fetch("/api/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Le jeton de la fiche prouve qu'on l'a créée ; sans lui, la session du propriétaire (cookie) fait foi.
    body: JSON.stringify({ cardId, email, token: tokens.get(cardId) ?? undefined }),
  });
  if (!res.ok) throw await readError(res);
}

/**
 * Demande de retrait d'une fiche sans pseudo GitHub, par la personne fichée.
 * « sent » : relayée ; « fallback » : pas de relais côté serveur, écrire à
 * l'adresse de contact. Une autre erreur remonte en ApiError, avec son message.
 */
async function requestRemoval(cardId: string, email: string): Promise<"sent" | "fallback"> {
  if (isMock()) return new Promise((r) => setTimeout(() => r("sent"), 400));
  let res: Response;
  try {
    res = await fetch("/api/removal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId, email }) });
  } catch {
    return "fallback";
  }
  if (res.ok) return "sent";
  if (res.status === 502 || res.status === 503) return "fallback";
  throw await readError(res);
}

/** Supprimer sa fiche : par son jeton, ou par sa session (`token` null) ; par le compte, le compte part avec (§18.91). */
async function deleteCard(id: string, token: string | null): Promise<void> {
  if (isMock()) {
    await (await demoApi()).deleteCard(id, token ?? "");
    if (!token && mockAccount()?.cardId === id) {
      mine.clear();
      mockMe = null;
      setMockAccount(null);
    }
    return;
  }
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
  if (isMock()) return (await demoApi()).getShowcase();
  const res = await fetch("/api/showcase", { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const body = (await res.json()) as Partial<Showcase> & { card?: CardData | null };
  if (!body.card) return null;
  const pieces = Array.isArray(body.pieces) && body.pieces.length > 1 && body.pieces.every((p) => PIECES.includes(p)) ? body.pieces : undefined;
  return { card: body.card, href: body.href ?? `/c/${body.card.id}`, ...(pieces ? { pieces } : {}) };
}

/** La requête du top en cours : le tableau de l'accueil et son ancre « /#semaine » la partagent. */
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

export const api = { createCard, getJob, getCase, proposalOf, linksOf, declineProposal, vote, sendEmail, requestRemoval, deleteCard, track, getConfig, knownConfig, startLinkedInPhoto, getShowcase, getTop, getMe, getAccount, startClaim, setHidden, logout };

/** URLs des images rendues par le serveur (§7). `?v=` : le dessin en cours, servi avec un cache d'un an (shared/images.ts). */
export const images = {
  og: (id: string) => `/og/${id}.png?${IMAGE_QUERY}`,
  portrait: (id: string) => `/og/${id}-portrait.png?${IMAGE_QUERY}`,
  /** 1080 × 1920, Instagram et TikTok ; d'une comparaison, la fiche GitHub. */
  story: (id: string) => `/og/${id}-story.png?${IMAGE_QUERY}`,
  card: (id: string) => `/og/${id}-card.png?${IMAGE_QUERY}`,
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
