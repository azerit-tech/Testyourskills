// Entrer sans rien coller (SPEC §18.80) : les suggestions des deux champs, et
// les deux connexions (« Se connecter avec LinkedIn », « Se connecter avec GitHub »).
// Aucune de ces fonctions ne lève : au moindre doute, une liste vide, et le
// champ reste celui où un lien ou un pseudo se tape.
import type { GithubSuggestion, LinkedinSuggestion } from "../../../shared/entry";
import { isMock } from "./api";

/** Ce que la connexion LinkedIn a retrouvé : le profil sûr, sinon les homonymes à proposer. */
export interface LinkedinReturn {
  name: string;
  auto?: LinkedinSuggestion;
  candidates: LinkedinSuggestion[];
}

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

let linkedinReturn: Promise<LinkedinReturn | null> | null = null;
/** Au retour de LinkedIn : le profil retrouvé, ou les homonymes. Demandé une fois par page. */
export function entryLinkedin(): Promise<LinkedinReturn | null> {
  linkedinReturn ??= isMock()
    ? mockDelay().then(() => ({ name: "Léa Martin", candidates: MOCK_PEOPLE.slice(0, 3) }))
    : getJson<{ signedIn?: boolean; name?: string; auto?: LinkedinSuggestion; candidates?: LinkedinSuggestion[] }>("/api/entry/linkedin").then((b) =>
        b?.signedIn && typeof b.name === "string" ? { name: b.name, ...(b.auto?.url ? { auto: b.auto } : {}), candidates: Array.isArray(b.candidates) ? b.candidates.slice(0, 3) : [] } : null,
      );
  return linkedinReturn;
}

let githubReturn: Promise<string | null> | null = null;
/** Au retour de GitHub : le pseudo, rendu une seule fois par le serveur. Demandé une fois par page. */
export function entryGithub(): Promise<string | null> {
  githubReturn ??= isMock()
    ? mockDelay().then(() => "leamd")
    : getJson<{ signedIn?: boolean; login?: string }>("/api/entry/github").then((b) => (b?.signedIn && typeof b.login === "string" ? b.login : null));
  return githubReturn;
}

export interface EntryReturn {
  via: "linkedin" | "github";
  /** false : annulé, ou la connexion n'a pas abouti. */
  ok: boolean;
}

let taken: { owner: object; value: EntryReturn } | null = null;
/**
 * `?li=` ou `?gh=` dans l'adresse, retiré aussitôt lu : un rechargement ne relance
 * rien. Le premier formulaire qui le demande le garde (`owner`), les autres n'ont rien.
 */
export function takeReturn(owner: object): EntryReturn | null {
  if (taken) return taken.owner === owner ? taken.value : null;
  let u: URL;
  try {
    u = new URL(window.location.href);
  } catch {
    return null;
  }
  const li = u.searchParams.get("li");
  const gh = u.searchParams.get("gh");
  if (li === null && gh === null) return null;
  u.searchParams.delete("li");
  u.searchParams.delete("gh");
  window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
  taken = { owner, value: li !== null ? { via: "linkedin", ok: li === "1" } : { via: "github", ok: gh === "1" } };
  return taken.value;
}
