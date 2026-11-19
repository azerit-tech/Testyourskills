// Entrer sans rien coller (SPEC §18.80) : les suggestions des deux champs, et
// les deux connexions (« Se connecter avec LinkedIn », « Se connecter avec GitHub »).
// Aucune de ces fonctions ne lève : au moindre doute, une liste vide, et le
// champ reste celui où un lien ou un pseudo se tape.
import type { GithubSuggestion, LinkedinSuggestion } from "../../../shared/entry";
import { isMock } from "./api";
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

/** Part chez LinkedIn ; le serveur revient sur cette page avec ?li=1. */
export function startLinkedinLogin(): void {
  if (isMock()) {
    const u = new URL(here(), window.location.origin);
    u.searchParams.set("li", "1");
    window.location.assign(u.pathname + u.search);
    return;
  }
  window.location.assign(`/auth/linkedin/enter?return=${encodeURIComponent(here())}`);
}

/** Part chez GitHub ; le serveur revient sur cette page avec ?gh=1. */
export function startGithubLogin(): void {
  if (isMock()) {
    const u = new URL(here(), window.location.origin);
    u.searchParams.set("gh", "1");
    window.location.assign(u.pathname + u.search);
    return;
  }
  window.location.assign(`/auth/github/enter?return=${encodeURIComponent(here())}`);
}

// --- Le retour d'une connexion (§18.89) --------------------------------------------
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
  /** Rien de sûr : « C'est toi ? ». */
  | { s: "pick"; name: string; candidates: LinkedinSuggestion[] }
  /** GitHub a rendu le pseudo : la fiche part. */
  | { s: "github"; login: string }
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
}

/** Ce que le serveur a retrouvé, mis en phase. null : il cherche encore. */
export function phaseOfAnswer(b: EntryAnswer | null): ReturnPhase | null {
  if (!b?.signedIn || typeof b.name !== "string") return { s: "lost", via: "linkedin", why: "error" };
  if (b.pending) return null;
  if (b.auto?.url) return { s: "auto", name: b.auto.name || b.name, url: b.auto.url };
  const candidates = Array.isArray(b.candidates) ? b.candidates.filter((c) => c && typeof c.url === "string").slice(0, 3) : [];
  return candidates.length ? { s: "pick", name: b.name, candidates } : { s: "lost", via: "linkedin", why: "none" };
}

async function findLinkedin(since: number, mock: string | null): Promise<ReturnPhase> {
  if (isMock()) {
    await new Promise((r) => setTimeout(r, mock === "slow" ? 60_000 : 1400));
    if (mock === "none") return { s: "lost", via: "linkedin", why: "none" };
    if (mock === "auto") return { s: "auto", name: MOCK_PEOPLE[0]!.name, url: MOCK_PEOPLE[0]!.url };
    return { s: "pick", name: "Léa Martin", candidates: MOCK_PEOPLE.slice(0, 3) };
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

async function findGithub(): Promise<ReturnPhase> {
  if (isMock()) {
    await mockDelay();
    return { s: "github", login: "leamd" };
  }
  const b = await getJson<{ signedIn?: boolean; login?: string }>("/api/entry/github");
  return b?.signedIn && typeof b.login === "string" ? { s: "github", login: b.login } : { s: "lost", via: "github", why: "error" };
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
  const mockOnly = isMock() && (value === "none" || value === "auto" || value === "slow");
  if (value !== "1" && !mockOnly) {
    phase = { s: "lost", via, why: "error" };
    return;
  }
  const since = Date.now();
  phase = { s: "finding", via, since };
  void (via === "linkedin" ? findLinkedin(since, value) : findGithub()).then(setPhase, () => setPhase({ s: "lost", via, why: "error" }));
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
  phase = null;
  started = false;
  leader = null;
  listeners.clear();
}

// --- Qui s'est connecté ici (SPEC §18.89) ---
// Le serveur garde dans un cookie httpOnly le profil et la fiche de qui s'est connecté. Le
// témoin `tys_known=1`, lisible ici, dit qu'il y a quelque chose à demander : sans lui, rien
// ne part. La fiche rendue devient « Ma fiche » si le navigateur n'en retient aucune.

const knownHere = (): boolean => {
  try {
    return /(?:^|;\s*)tys_known=1(?:;|$)/.test(document.cookie);
  } catch {
    return false;
  }
};

function knownCardOf(body: unknown): MyCard | null {
  const c = (body as { card?: Partial<MyCard> | null } | null)?.card;
  if (!c || typeof c.id !== "string" || typeof c.overall !== "number" || !Number.isFinite(c.overall)) return null;
  return { id: c.id, login: typeof c.login === "string" ? c.login : null, overall: c.overall };
}

let mineAsked: Promise<void> | null = null;

/** Une fois par page : demande au serveur la fiche de qui s'est connecté dans ce navigateur. */
export function syncMine(): Promise<void> {
  mineAsked ??= (async () => {
    if (isMock() || !knownHere()) return;
    try {
      const res = await fetch("/api/entry/me", { headers: { Accept: "application/json" } });
      const card = res.ok ? knownCardOf(await res.json()) : null;
      if (!card) return;
      const mine = myCard();
      // Celle que le navigateur retient déjà passe devant ; la même fiche y gagne son pseudo.
      if (!mine || (mine.id === card.id && !mine.login && card.login)) rememberMine(card);
    } catch {
      /* réseau : la mémoire du navigateur suffit */
    }
  })();
  return mineAsked;
}

/** Abonnement à « Ma fiche » (useSyncExternalStore n'en veut pas : chaque lecture rend un nouvel objet). */
export function onMine(listener: () => void): () => void {
  window.addEventListener(MINE_EVENT, listener);
  return () => window.removeEventListener(MINE_EVENT, listener);
}
