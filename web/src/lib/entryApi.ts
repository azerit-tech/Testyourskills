// Entrer sans rien coller (SPEC §18.80) : les suggestions des deux champs, et
// les deux connexions (« Se connecter avec LinkedIn », « Se connecter avec GitHub »).
// Aucune de ces fonctions ne lève : au moindre doute, une liste vide, et le
// champ reste celui où un lien ou un pseudo se tape.
import type { GithubAsk, GithubSuggestion, LinkedinSuggestion } from "../../../shared/entry";
import { api, isMock } from "./api";
import { fileOf } from "../../../shared/caseFile";
import { loadAccount, mockSignIn, resetAccount } from "./account";
import { MINE_EVENT, myCard, rememberMine, type MyCard } from "./session";

// --- Mode démo -----------------------------------------------------------------

const MOCK_PEOPLE: LinkedinSuggestion[] = [
  { url: "https://www.linkedin.com/in/lea-martin-dev", name: "Léa Martin", headline: "Développeuse full-stack · Paysolde", photo: "/mock-linkedin.svg" },
  { url: "https://www.linkedin.com/in/lea-martin-84", name: "Léa Martin", headline: "Cheffe de projet digital · Lyon" },
  { url: "https://www.linkedin.com/in/leamartin-data", name: "Léa Martin", headline: "Data engineer · Nantes" },
  { url: "https://www.linkedin.com/in/lea-martinez", name: "Léa Martinez", headline: "Étudiante · EPITA" },
];
const MOCK_ACCOUNTS: GithubSuggestion[] = [
  { login: "leamd", name: "Léa Martin", avatarUrl: "/mock-linkedin.svg" },
  { login: "lea-martin", name: null, avatarUrl: "" },
  { login: "leamartin-dev", name: "Léa M.", avatarUrl: "" },
];
const mockDelay = () => new Promise((r) => setTimeout(r, 250));
/** Le GitHub que la démo trouve à son nom (§18.111), comme la proposition sous une fiche (§18.100). */
const MOCK_ASK: GithubAsk = { candidate: { login: "camroux", name: "Camille Roux", avatarUrl: "https://github.com/camroux.png?size=96" } };

// --- Suggestions ----------------------------------------------------------------

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Profils LinkedIn à ce nom. `off` : pas de recherche (plafond, fournisseur absent), le champ prend un lien. */
export async function searchLinkedin(q: string, signal?: AbortSignal): Promise<{ results: LinkedinSuggestion[]; off: boolean }> {
  if (isMock()) {
    await mockDelay();
    const first = q.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    return { results: q.trim().includes(" ") ? MOCK_PEOPLE.map((p) => (first && !p.name.toLowerCase().startsWith(first) ? { ...p, name: q.trim() } : p)) : [], off: false };
  }
  const body = await getJson<{ results?: LinkedinSuggestion[]; off?: boolean }>(`/api/search/linkedin?q=${encodeURIComponent(q)}`, signal);
  return { results: Array.isArray(body?.results) ? body.results : [], off: body?.off === true };
}

/** Comptes GitHub dont le pseudo ou le nom porte ces mots. */
export async function searchGithub(q: string, signal?: AbortSignal): Promise<GithubSuggestion[]> {
  if (isMock()) {
    await mockDelay();
    const typed = q.trim().replace(/^@/, "");
    return /\s/.test(typed) || MOCK_ACCOUNTS.some((a) => a.login.startsWith(typed.toLowerCase())) ? MOCK_ACCOUNTS : [{ login: typed.replace(/[^A-Za-z0-9-]/g, "") || "leamd", name: null, avatarUrl: "" }, ...MOCK_ACCOUNTS.slice(0, 2)];
  }
  const body = await getJson<{ results?: GithubSuggestion[] }>(`/api/search/github?q=${encodeURIComponent(q)}`, signal);
  return Array.isArray(body?.results) ? body.results : [];
}

// --- Connexions -----------------------------------------------------------------

function here(): string {
  const u = new URL(window.location.href);
  for (const k of ["li", "gh"]) u.searchParams.delete(k);
  return u.pathname + u.search;
}

/** `redo` : « Refaire ma fiche », le parcours d'aujourd'hui même avec une fiche au compte (§18.91). */
export interface LoginOpts {
  redo?: boolean;
}

/** Démo : la connexion crée le compte ; avec une fiche, droit dessus, comme le serveur. */
function mockLogin(source: "linkedin" | "github", flag: "li" | "gh", o: LoginOpts) {
  const card = mockSignIn(source);
  if (card && !o.redo) return window.location.assign(`/c/${card}`);
  const u = new URL(here(), window.location.origin);
  u.searchParams.set(flag, "1");
  window.location.assign(u.pathname + u.search);
}

/** Part chez LinkedIn ; le serveur revient sur cette page avec ?li=1, ou sur la fiche du compte. */
export function startLinkedinLogin(o: LoginOpts = {}): void {
  if (isMock()) return mockLogin("linkedin", "li", o);
  window.location.assign(`/auth/linkedin/enter?return=${encodeURIComponent(here())}${o.redo ? "&redo=1" : ""}`);
}

/** Part chez GitHub ; le serveur revient sur cette page avec ?gh=1, ou sur la fiche du compte. */
export function startGithubLogin(o: LoginOpts = {}): void {
  if (isMock()) return mockLogin("github", "gh", o);
  window.location.assign(`/auth/github/enter?return=${encodeURIComponent(here())}${o.redo ? "&redo=1" : ""}`);
}

// --- Le retour d'une connexion (§18.90) --------------------------------------------
// `?li=` ou `?gh=` dans l'adresse au chargement de la page. Ce qui se passe ensuite
// vit ici, hors des composants : un formulaire remonté, ou monté après coup (le
// bloc « À ton tour » d'une fiche arrive avec la fiche), retrouve l'état où il en
// est. Jamais de retour muet : une attente, puis la fiche, « C'est toi ? », ou une
// phrase et le champ ouvert.

export type ReturnPhase =
  /** La recherche tourne : l'attente est à l'écran. `since` : le départ de la barre. */
  | { s: "finding"; via: "linkedin" | "github"; since: number }
  /** Le profil est sûr : la fiche part. */
  | { s: "auto"; name: string; url: string }
  /** Le profil est le sien, son GitHub est à demander avant de juger (§18.111). */
  | { s: "ask"; name: string; url: string; candidate: GithubSuggestion | null }
  /** Rien de sûr : « C'est toi ? ». `ask` : son GitHub sera demandé après son choix. */
  | { s: "pick"; name: string; candidates: LinkedinSuggestion[]; ask?: GithubAsk }
  /** GitHub a rendu le pseudo : la fiche part. `found` : son LinkedIn trouvé, dit avant de juger (§18.113). */
  | { s: "github"; login: string; found?: LinkedinSuggestion }
  /** « none » : personne à ce nom, ou la recherche est en panne. « error » : la connexion n'a pas abouti. */
  | { s: "lost"; via: "linkedin" | "github"; why: "none" | "error" };

/** Une demande au serveur attend la recherche 20 s, puis répond « pending » : on redemande jusque-là. */
export const FIND_GIVE_UP_MS = 110_000;
/** La durée attendue de la recherche (une seconde d'index, quatre de lecture, les photos). */
const FIND_EXPECTED_MS = 8000;
/** La barre de l'attente : elle avance sur la durée attendue, puis ralentit, sans toucher le bout. */
export function findPct(elapsed: number): number {
  const linear = Math.min(1, Math.max(0, elapsed) / FIND_EXPECTED_MS) * 80;
  const tail = 17 * (1 - Math.exp(-Math.max(0, elapsed - FIND_EXPECTED_MS) / 25_000));
  return Math.round(linear + tail);
}

let phase: ReturnPhase | null = null;
let started = false;
let leader: object | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const setPhase = (next: ReturnPhase | null) => {
  phase = next;
  emit();
};

interface EntryAnswer {
  signedIn?: boolean;
  name?: string;
  auto?: LinkedinSuggestion;
  candidates?: LinkedinSuggestion[];
  pending?: boolean;
  ask?: GithubAsk;
}

/** La question lue telle quelle : un compte complet, ou aucun. */
function askOf(a: GithubAsk | undefined): GithubAsk | undefined {
  if (!a || typeof a !== "object") return undefined;
  const c = a.candidate;
  return { candidate: c && typeof c.login === "string" ? { login: c.login, name: typeof c.name === "string" ? c.name : null, avatarUrl: typeof c.avatarUrl === "string" ? c.avatarUrl : "" } : null };
}

/** Ce que le serveur a retrouvé, mis en phase. null : il cherche encore. */
export function phaseOfAnswer(b: EntryAnswer | null): ReturnPhase | null {
  if (!b?.signedIn || typeof b.name !== "string") return { s: "lost", via: "linkedin", why: "error" };
  if (b.pending) return null;
  const ask = askOf(b.ask);
  if (b.auto?.url) return ask ? { s: "ask", name: b.auto.name || b.name, url: b.auto.url, candidate: ask.candidate } : { s: "auto", name: b.auto.name || b.name, url: b.auto.url };
  const candidates = Array.isArray(b.candidates) ? b.candidates.filter((c) => c && typeof c.url === "string").slice(0, 3) : [];
  return candidates.length ? { s: "pick", name: b.name, candidates, ...(ask ? { ask } : {}) } : { s: "lost", via: "linkedin", why: "none" };
}

async function findLinkedin(since: number, mock: string | null): Promise<ReturnPhase> {
  if (isMock()) {
    await new Promise((r) => setTimeout(r, mock === "slow" ? 60_000 : 1400));
    if (mock === "none") return { s: "lost", via: "linkedin", why: "none" };
    // `auto` : son GitHub trouvé ; `nogh` : rien trouvé, le champ ; `known` : son GitHub déjà connu, la fiche part.
    const me = MOCK_PEOPLE[0]!;
    if (mock === "auto") return { s: "ask", name: me.name, url: me.url, candidate: MOCK_ASK.candidate };
    if (mock === "nogh") return { s: "ask", name: me.name, url: me.url, candidate: null };
    if (mock === "known") return { s: "auto", name: me.name, url: me.url };
    return { s: "pick", name: "Léa Martin", candidates: MOCK_PEOPLE.slice(0, 3), ask: MOCK_ASK };
  }
  let misses = 0;
  while (Date.now() - since < FIND_GIVE_UP_MS) {
    const body = await getJson<EntryAnswer>("/api/entry/linkedin");
    // Réseau capricieux : deux nouvelles demandes, pas plus.
    if (!body && ++misses <= 2) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    const next = phaseOfAnswer(body);
    if (next) return next;
  }
  return { s: "lost", via: "linkedin", why: "none" };
}

/** Le LinkedIn trouvé tel quel : une adresse et un nom, ou rien. */
function foundOf(f: unknown): LinkedinSuggestion | undefined {
  const x = f as Partial<LinkedinSuggestion> | null | undefined;
  if (!x || typeof x.url !== "string" || typeof x.name !== "string" || !x.name) return undefined;
  return { url: x.url, name: x.name, headline: typeof x.headline === "string" ? x.headline : "", ...(typeof x.photo === "string" ? { photo: x.photo } : {}) };
}

async function findGithub(mock: string | null): Promise<ReturnPhase> {
  if (isMock()) {
    await mockDelay();
    // `auto` : son LinkedIn trouvé (§18.113).
    return { s: "github", login: "leamd", ...(mock === "auto" ? { found: MOCK_PEOPLE[0]! } : {}) };
  }
  const b = await getJson<{ signedIn?: boolean; login?: string; found?: unknown }>("/api/entry/github");
  if (!b?.signedIn || typeof b.login !== "string") return { s: "lost", via: "github", why: "error" };
  const found = foundOf(b.found);
  return { s: "github", login: b.login, ...(found ? { found } : {}) };
}

/**
 * Lit `?li=` ou `?gh=` une fois par page, le retire de l'adresse (un rechargement ne
 * relance rien) et lance la recherche. Annulé (`cancel`) : rien, les deux boutons attendent.
 */
function begin(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  let u: URL;
  try {
    u = new URL(window.location.href);
  } catch {
    return;
  }
  const li = u.searchParams.get("li");
  const gh = u.searchParams.get("gh");
  if (li === null && gh === null) return;
  u.searchParams.delete("li");
  u.searchParams.delete("gh");
  window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
  const via = li !== null ? "linkedin" : "github";
  const value = li ?? gh;
  if (value === "cancel") return;
  const mockOnly = isMock() && (value === "none" || value === "auto" || value === "slow" || value === "nogh" || value === "known");
  if (value !== "1" && !mockOnly) {
    phase = { s: "lost", via, why: "error" };
    return;
  }
  const since = Date.now();
  phase = { s: "finding", via, since };
  void (via === "linkedin" ? findLinkedin(since, value) : findGithub(value)).then(setPhase, () => setPhase({ s: "lost", via, why: "error" }));
}

/** Une connexion vient-elle de revenir sur cette page ? L'accueil ouvre alors son formulaire. */
export function returnPending(): boolean {
  begin();
  return phase !== null;
}

export function subscribeReturn(listener: () => void): () => void {
  begin();
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function getReturn(): ReturnPhase | null {
  begin();
  return phase;
}

/** « C'est toi ? » : son profil choisi, son GitHub demandé avant de juger (§18.111). */
export function askGithub(name: string, url: string, ask: GithubAsk): void {
  setPhase({ s: "ask", name, url, candidate: ask.candidate });
}

/** Le formulaire a agi (la fiche part, « C'est toi ? » est fermé, la phrase est à l'écran) : le retour est consommé. */
export function doneReturn(): void {
  if (phase) setPhase(null);
}

/**
 * Un seul formulaire de la page porte le retour : le premier qui le demande. Il le
 * rend en se démontant, et un autre le reprend là où il en est.
 */
export function leadReturn(owner: object): boolean {
  leader ??= owner;
  return leader === owner;
}

export function releaseReturn(owner: object): void {
  if (leader !== owner) return;
  leader = null;
  emit();
}

/** Pour les tests : comme une page qui vient de se charger. */
export function resetReturn(): void {
  mineAsked = null;
  resetAccount();
  phase = null;
  started = false;
  leader = null;
  listeners.clear();
}

// --- Qui est là (SPEC §18.90, §18.91) ---
// Un seul appel, /api/me : le compte (`tys_acct`) d'abord ; sans compte valide, le serveur
// répond avec le repli sans droit de `tys_who` (`known`). Sa fiche devient « Ma fiche » :
// celle du compte passe devant la mémoire du navigateur, celle du repli seulement s'il n'en
// retient aucune (ou la même, qui y gagne son pseudo).

let mineAsked: Promise<void> | null = null;

/** Une fois par page : demande au serveur qui est là, et sa fiche. */
export function syncMine(): Promise<void> {
  mineAsked ??= (async () => {
    const a = await loadAccount();
    if (!a?.cardId) return;
    let overall = a.overall;
    let login = a.cardLogin;
    if (overall === null) {
      // La démo ne connaît pas la note d'avance : la fiche la dit.
      try {
        const job = await api.getJob(a.cardId);
        if (job.state !== "done") return;
        const main = job.kind === "card" ? job.card : fileOf(job.comparison);
        overall = main.overall;
        login = main.login ?? null;
      } catch {
        return;
      }
    }
    const card: MyCard = { id: a.cardId, login, overall };
    const mine = myCard();
    if (!mine || (a.known ? mine.id === card.id && !mine.login && !!card.login : mine.id !== card.id || mine.overall !== card.overall)) rememberMine(card);
  })();
  return mineAsked;
}

/** Abonnement à « Ma fiche » (useSyncExternalStore n'en veut pas : chaque lecture rend un nouvel objet). */
export function onMine(listener: () => void): () => void {
  window.addEventListener(MINE_EVENT, listener);
  return () => window.removeEventListener(MINE_EVENT, listener);
}
