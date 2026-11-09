// LinkedIn contre GitHub (SPEC §18.24) : retrouver et lire le vrai profil
// LinkedIn d'une personne, ce qu'elle déclare, pour le juger contre ce que son
// GitHub prouve. À ne pas confondre avec ../linkedin.ts (OAuth de la photo).
//
// Deux entrées :
// - par GitHub (`forGithub`) : le LinkedIn que le joueur donne, sinon celui que
//   son profil GitHub affiche (comptes sociaux, site, bio), gratuits ; la
//   recherche payante par Crustdata seulement avec LINKEDIN_AUTOFIND=crustdata ;
// - par LinkedIn (`forUrl`) : le profil, et le GitHub que ses liens donnent.
//
// Le profil est lu par un fournisseur : Apify (défaut) ou Crustdata.
// Garde-fous : cache de 30 jours par adresse (introuvable : 7 jours), un plafond
// de profils lus par jour, une limite par IP sur les lectures. Au moindre échec,
// rien : la fiche GitHub sort seule, sans message.

import type Database from "better-sqlite3";
import { ApifyProvider } from "./apify";
import { CrustdataClient, CrustdataProvider } from "./crustdata";
import type { LinkedinProfile, LinkedinProvider } from "./profile";
import { LinkedinCache } from "./store";
import { githubDeclaredOf, linkedinFromGithub, normalizeLinkedinUrl } from "./url";

export type { LinkedinProfile, LinkedinProvider } from "./profile";
export { normalizeLinkedinUrl } from "./url";
export { profileToText, asLinkedinCard, asLinkedinComparison } from "./text";

export const DEFAULT_DAILY_PROFILES = 300;
/** Lectures par IP et par jour (une fiche en fait au plus deux). */
export const PAID_CALLS_PER_IP = 6;

export interface LookupOptions {
  /** Prend une unité de la limite par IP juste avant une lecture payante ; false : refusé. */
  spend?: () => boolean;
  /** Une lecture lente commence (au plus `ms`) : le pipeline repousse le délai de la fiche. */
  onSlow?: (ms: number) => void;
  signal?: AbortSignal;
}

export type UrlLookup =
  | { status: "found"; profile: LinkedinProfile; githubLogin: string | null }
  | { status: "not_found" }
  /** Plafond du jour atteint, limite de l'IP atteinte, fournisseur en panne ou trop lent. */
  | { status: "unavailable" };

/**
 * Le profil lu pour un GitHub. `proven` : le lien entre ce LinkedIn et ce GitHub
 * est prouvé, parce que GitHub affiche lui-même cette adresse ou que la recherche
 * l'a trouvée. Une adresse seulement donnée par le joueur ne prouve rien : la
 * comparaison sort, mais ne passe jamais pour la fiche de ce pseudo (cards.ts, top.ts).
 */
export interface GithubLookup {
  profile: LinkedinProfile;
  proven: boolean;
}

/** Ce que le pipeline demande ; les tests en donnent un faux. */
export interface LinkedinFinder {
  forGithub(facts: unknown, opts?: LookupOptions & { url?: string }): Promise<GithubLookup | null>;
  forUrl(url: string, opts?: LookupOptions): Promise<UrlLookup>;
}

export interface LinkedinProfilesOptions {
  cache: LinkedinCache;
  provider: LinkedinProvider;
  /** Profils lus par jour, tous fournisseurs confondus (recherches comprises). */
  dailyProfiles?: number;
  /** Recherche payante du LinkedIn d'un GitHub qui n'en affiche pas (LINKEDIN_AUTOFIND=crustdata). */
  search?: Pick<CrustdataClient, "searchByGithub">;
  now?: () => number;
}

export class LinkedinProfiles implements LinkedinFinder {
  private readonly daily: number;
  private readonly now: () => number;

  constructor(private readonly opts: LinkedinProfilesOptions) {
    this.daily = opts.dailyProfiles ?? DEFAULT_DAILY_PROFILES;
    this.now = opts.now ?? Date.now;
  }

  get providerName(): LinkedinProvider["name"] {
    return this.opts.provider.name;
  }

  /** Reste-t-il une lecture aujourd'hui, et l'IP en a-t-elle encore une ? Si oui, elle est comptée. */
  private take(opts: LookupOptions): boolean {
    if (this.opts.cache.readsToday(this.now()) >= this.daily) return false;
    if (!(opts.spend?.() ?? true)) return false;
    this.opts.cache.addRead(this.now());
    return true;
  }

  async forGithub(facts: unknown, opts: LookupOptions & { url?: string } = {}): Promise<GithubLookup | null> {
    const { cache, provider, search } = this.opts;
    const gh = githubDeclaredOf(facts);
    if (!gh) return null;
    const explicit = opts.url ? normalizeLinkedinUrl(opts.url) : null;
    const declared = linkedinFromGithub(gh);
    // L'adresse donnée par le joueur passe devant, mais ne lie jamais un profil à
    // un GitHub : seuls ce que GitHub affiche (cette même adresse) et la recherche le font.
    let url = explicit ?? declared;
    let proves = !!declared && (!explicit || explicit === declared);
    if (!url && search) {
      const prev = cache.getLookup(gh.login, this.now());
      if (prev !== undefined) url = prev;
      else if (this.take(opts)) {
        try {
          const r = await search.searchByGithub({ login: gh.login, name: gh.name, createdAt: gh.createdAt }, opts.signal);
          cache.putLookup(gh.login, r.url, this.now());
          url = r.url;
        } catch (err) {
          warn("recherche", err);
          return null;
        }
      }
      proves = !!url;
    }
    if (!url) return null;

    const hit = cache.getProfile(url, this.now());
    if (hit) {
      if (!hit.found) return null;
      if (proves && hit.githubLogin == null) cache.linkGithub(url, gh.login);
      return { profile: hit.profile, proven: proves };
    }
    if (!this.take(opts)) return null;
    try {
      opts.onSlow?.(provider.timeoutMs);
      const r = await provider.fetchProfile(url, { signal: opts.signal });
      const link = proves ? gh.login : r.githubChecked ? r.githubLogin : undefined;
      cache.putProfile(url, r.profile, r.profile ? link : undefined, this.now());
      return r.profile ? { profile: r.profile, proven: proves } : null;
    } catch (err) {
      warn("profil", err);
      return null;
    }
  }

  async forUrl(raw: string, opts: LookupOptions = {}): Promise<UrlLookup> {
    const { cache, provider } = this.opts;
    const url = normalizeLinkedinUrl(raw);
    if (!url) return { status: "not_found" };
    const hit = cache.getProfile(url, this.now());
    if (hit && !hit.found) return { status: "not_found" };
    if (hit?.found && hit.githubLogin !== undefined) return { status: "found", profile: hit.profile, githubLogin: hit.githubLogin };
    if (!this.take(opts)) return { status: "unavailable" };
    try {
      opts.onSlow?.(provider.timeoutMs);
      const r = await provider.fetchProfile(url, { withGithub: true, signal: opts.signal });
      cache.putProfile(url, r.profile, r.profile ? r.githubLogin : undefined, this.now());
      return r.profile ? { status: "found", profile: r.profile, githubLogin: r.githubLogin } : { status: "not_found" };
    } catch (err) {
      warn("profil", err);
      return { status: "unavailable" };
    }
  }
}

/** Jamais la clé, l'adresse ni le corps : le statut ou le type d'erreur seulement. */
function warn(what: string, err: unknown) {
  const e = err as { status?: unknown; name?: unknown };
  console.warn(`[linkedin] ${what} indisponible :`, typeof e?.status === "number" ? `HTTP ${e.status}` : String(e?.name ?? "erreur"));
}

// --- Configuration ------------------------------------------------------------

export type LinkedinEnv = {
  dailyProfiles: number;
  /** Clé Crustdata de la recherche payante (LINKEDIN_AUTOFIND=crustdata), sinon absente. */
  searchKey?: string;
} & (
  | { provider: "apify"; token: string; actor?: string; inputTemplate?: string }
  | { provider: "crustdata"; apiKey: string }
);

/**
 * LINKEDIN_PROVIDER=apify (défaut, APIFY_TOKEN, APIFY_LINKEDIN_ACTOR,
 * APIFY_LINKEDIN_INPUT) ou crustdata (CRUSTDATA_API_KEY). Sans le jeton du
 * fournisseur choisi : null, la fonctionnalité est absente.
 */
export function linkedinEnv(env: NodeJS.ProcessEnv): LinkedinEnv | null {
  const n = Number(env.LINKEDIN_DAILY_PROFILES);
  const dailyProfiles = env.LINKEDIN_DAILY_PROFILES?.trim() && Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_DAILY_PROFILES;
  const crustKey = env.CRUSTDATA_API_KEY?.trim() || undefined;
  const searchKey = env.LINKEDIN_AUTOFIND?.trim().toLowerCase() === "crustdata" ? crustKey : undefined;
  const provider = env.LINKEDIN_PROVIDER?.trim().toLowerCase() || "apify";
  if (provider === "crustdata") return crustKey ? { provider, apiKey: crustKey, dailyProfiles, searchKey } : null;
  if (provider !== "apify") {
    console.warn(`[linkedin] LINKEDIN_PROVIDER inconnu (${provider}) : apify ou crustdata.`);
    return null;
  }
  const token = env.APIFY_TOKEN?.trim();
  if (!token) return null;
  return {
    provider,
    token,
    actor: env.APIFY_LINKEDIN_ACTOR?.trim() || undefined,
    inputTemplate: env.APIFY_LINKEDIN_INPUT?.trim() || undefined,
    dailyProfiles,
    searchKey,
  };
}

/** Le service branché sur la base du serveur, ou null si le fournisseur n'a pas de jeton. */
export function linkedinProfilesFromEnv(env: NodeJS.ProcessEnv, db: Database.Database, fetchImpl?: typeof fetch): LinkedinProfiles | null {
  const cfg = linkedinEnv(env);
  if (!cfg) return null;
  const provider =
    cfg.provider === "apify"
      ? new ApifyProvider({ token: cfg.token, actor: cfg.actor, inputTemplate: cfg.inputTemplate, fetchImpl })
      : new CrustdataProvider(new CrustdataClient({ apiKey: cfg.apiKey, fetchImpl }));
  return new LinkedinProfiles({
    cache: new LinkedinCache(db),
    provider,
    dailyProfiles: cfg.dailyProfiles,
    search: cfg.searchKey ? new CrustdataClient({ apiKey: cfg.searchKey, fetchImpl }) : undefined,
  });
}
