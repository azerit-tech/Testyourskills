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
import { tokensFromEnv } from "../github/tokens";
import { readmeSignal, type GithubSignal } from "./githubSignals";
import { isProven, type RegistryPort } from "../registry/index";
import { githubDeclaredSignal, LINKEDIN_PROFILE_SIGNAL, README_SIGNAL, SEARCH_SIGNAL, type LinkSignal } from "../registry/signals";
import type { ProviderResult } from "./profile";
import { count, phase } from "../timing";

export type { LinkedinProfile, LinkedinProvider } from "./profile";
export { normalizeLinkedinUrl } from "./url";
export { profileToText, asLinkedinCard, asLinkedinComparison } from "./text";

export const DEFAULT_DAILY_PROFILES = 300;
/**
 * Lectures payées par IP et par jour (une fiche en fait au plus deux) : dix dénonciations (§18.114),
 * sa fiche, une reprise et la lecture d'avance y tiennent. Un profil déjà au cache ne compte pas.
 */
export const PAID_CALLS_PER_IP = 40;

export interface LookupOptions {
  /** Prend une unité de la limite par IP juste avant une lecture payante ; false : refusé. */
  spend?: () => boolean;
  /** Une lecture lente commence (au plus `ms`) : le pipeline repousse le délai de la fiche. */
  onSlow?: (ms: number) => void;
  signal?: AbortSignal;
}

export type UrlLookup =
  /** `githubProven` : le GitHub vient du registre de l'App, lien de force 2 ou plus (§18.95). */
  | { status: "found"; profile: LinkedinProfile; githubLogin: string | null; githubProven?: boolean }
  | { status: "not_found" }
  /** Plafond du jour atteint, fournisseur en panne ou trop lent ; `reason: "ip"` : la limite de l'IP atteinte. */
  | { status: "unavailable"; reason?: "ip" };

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

/** Ce qui reconnaît une personne sur son profil : son nom, son titre, sa photo (jamais gardée). */
export interface ProfilePeek {
  name: string;
  headline: string;
  photoUrl?: string;
}

/** Ce que le pipeline demande ; les tests en donnent un faux. */
export interface LinkedinFinder {
  forGithub(facts: unknown, opts?: LookupOptions & { url?: string }): Promise<GithubLookup | null>;
  forUrl(url: string, opts?: LookupOptions): Promise<UrlLookup>;
  /** Le profil lu pour sa photo, au retour d'une connexion LinkedIn (§18.90). null : introuvable, plafond, panne. */
  peek?(url: string, opts?: LookupOptions): Promise<ProfilePeek | null>;
  /** Lit le profil d'avance (§18.111) : une lecture qui le demande pendant ce temps l'attend au lieu d'en payer une autre. */
  warm?(url: string, opts?: LookupOptions): void;
}

export interface LinkedinProfilesOptions {
  cache: LinkedinCache;
  provider: LinkedinProvider;
  /** Profils lus par jour, tous fournisseurs confondus (recherches comprises). */
  dailyProfiles?: number;
  /** Recherche payante du LinkedIn d'un GitHub qui n'en affiche pas (LINKEDIN_AUTOFIND=crustdata). */
  search?: Pick<CrustdataClient, "searchByGithub">;
  /** Signal gratuit quand le profil GitHub n'affiche aucun LinkedIn : le README de profil (§18.90). */
  signal?: GithubSignal;
  /** Le registre GitHub ↔ LinkedIn de l'App Azerit (§18.95) : lu avant tout appel payant, enrichi de ce qui est lu. */
  registry?: RegistryPort;
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

  /** Les profils lus d'avance (§18.111), le temps de leur lecture. */
  private warming = new Map<string, Promise<unknown>>();

  /**
   * Lit le profil d'avance, pendant que la personne répond à la question d'avant le jugement
   * (§18.111). Une lecture qui le demande pendant ce temps l'attend, puis le trouve au cache :
   * jamais deux lectures payées du même profil.
   */
  warm(raw: string, opts: LookupOptions = {}): void {
    const url = normalizeLinkedinUrl(raw);
    if (!url || this.warming.has(url)) return;
    const p = this.forUrl(url, { spend: opts.spend, warming: true }).catch(() => null);
    this.warming.set(url, p);
    void p.finally(() => this.warming.delete(url));
  }

  /** La lecture d'avance de ce profil, si elle tourne encore. */
  private async warmed(url: string): Promise<void> {
    const w = this.warming.get(url);
    if (w) await w;
  }

  /**
   * Reste-t-il une lecture aujourd'hui, et l'IP en a-t-elle encore une ? Si oui, elle est comptée.
   * Le plafond du jour d'abord, sans rien prendre à l'IP ; sinon, ce qui manque : "day" ou "ip".
   */
  private take(opts: LookupOptions): "ok" | "day" | "ip" {
    if (this.opts.cache.readsToday(this.now()) >= this.daily) return "day";
    if (!(opts.spend?.() ?? true)) return "ip";
    this.opts.cache.addRead(this.now());
    return "ok";
  }

  async forGithub(facts: unknown, opts: LookupOptions & { url?: string } = {}): Promise<GithubLookup | null> {
    const { cache, provider, search, signal: free, registry } = this.opts;
    const gh = githubDeclaredOf(facts);
    if (!gh) return null;
    const explicit = opts.url ? normalizeLinkedinUrl(opts.url) : null;
    const declared = linkedinFromGithub(gh);
    // L'adresse donnée par le joueur passe devant, mais ne lie jamais un profil à
    // un GitHub : seuls ce que GitHub affiche (cette même adresse) et la recherche le font.
    let url = explicit ?? declared;
    let proves = !!declared && (!explicit || explicit === declared);
    /** Le lien que ce jeu établit lui-même, versé au registre de l'App (§18.95). */
    let signal: LinkSignal | null = declared && proves ? githubDeclaredSignal(gh, declared) : null;
    // Le registre de l'App d'abord (300 ms au plus) : un lien prouvé y dispense du
    // README et de la recherche ; un lien trouvé passe avant la recherche payante.
    const known = !url && registry ? await registry.linkedinOf(gh.login) : null;
    if (known && isProven(known.strength)) {
      url = known.url;
      proves = true;
    }
    if (!url && (free || search)) {
      const prev = cache.getLookup(gh.login, this.now());
      if (prev !== undefined) url = prev;
      else {
        // Le README de profil d'abord : gratuit, et la personne l'a écrit elle-même.
        let readme: string | null | undefined;
        if (free) {
          try {
            readme = await phase("linkedin_readme", () => free(gh, opts.signal));
          } catch (err) {
            warn("README de profil", err);
          }
        }
        if (readme) {
          cache.putLookup(gh.login, readme, this.now());
          url = readme;
          signal = README_SIGNAL;
        } else if (known) {
          // Trouvé par l'App, pas prouvé : rien à payer.
        } else if (search) {
          if (this.take(opts) === "ok") {
            try {
              const r = await phase("linkedin_recherche", () => search.searchByGithub({ login: gh.login, name: gh.name, createdAt: gh.createdAt }, opts.signal));
              cache.putLookup(gh.login, r.url, this.now());
              url = r.url;
              signal = SEARCH_SIGNAL;
            } catch (err) {
              warn("recherche", err);
              return null;
            }
          }
        } else if (readme === null) cache.putLookup(gh.login, null, this.now());
      }
      proves = !!url;
    }
    if (!url && known) {
      url = known.url;
      proves = false;
    }
    if (!url) return null;
    if (signal) registry?.recordLink({ login: gh.login, url, ...signal });

    await this.warmed(url);
    const hit = cache.getProfile(url, this.now());
    if (hit) {
      count("linkedin_cache");
      if (!hit.found) return null;
      if (proves && hit.githubLogin == null) cache.linkGithub(url, gh.login);
      return { profile: hit.profile, proven: proves };
    }
    // Un CV que l'App a déjà lu : le jugement le prend, sans payer ni attendre Apify.
    const stored = registry ? await registry.profileOf(url) : null;
    if (stored) return { profile: stored, proven: proves };
    if (this.take(opts) !== "ok") return null;
    try {
      opts.onSlow?.(provider.timeoutMs);
      const r = await phase("linkedin", () => provider.fetchProfile(url, { signal: opts.signal }));
      const link = proves ? gh.login : r.githubChecked ? r.githubLogin : undefined;
      cache.putProfile(url, r.profile, r.profile ? link : undefined, this.now());
      this.keep(url, r, proves ? gh.login : undefined);
      return r.profile ? { profile: r.profile, proven: proves } : null;
    } catch (err) {
      warn("profil", err);
      return null;
    }
  }

  /** Un profil payé : son CV au registre de l'App, et le GitHub que ses liens donnent. */
  private keep(url: string, r: ProviderResult, login?: string) {
    const registry = this.opts.registry;
    if (!registry || !r.profile) return;
    if (r.raw !== undefined) registry.recordProfile(url, r.raw, login ? { login } : {});
    if (r.githubChecked && r.githubLogin) registry.recordLink({ login: r.githubLogin, url, ...LINKEDIN_PROFILE_SIGNAL });
  }

  /**
   * Toujours une lecture chez le fournisseur : le cache ne garde pas la photo. Le
   * profil lu y entre s'il n'y était pas, et la fiche qui part ensuite ne le repaie pas.
   */
  async peek(raw: string, opts: LookupOptions = {}): Promise<ProfilePeek | null> {
    const { cache, provider } = this.opts;
    const url = normalizeLinkedinUrl(raw);
    if (!url) return null;
    const hit = cache.getProfile(url, this.now());
    if (hit && !hit.found) return null;
    if (this.take(opts) !== "ok") return null;
    try {
      const r = await provider.fetchProfile(url, { withGithub: true, signal: opts.signal });
      // Un profil déjà gardé garde son lien avec un GitHub, que cette lecture ne sait pas prouver.
      if (!hit) cache.putProfile(url, r.profile, r.profile ? r.githubLogin : undefined, this.now());
      this.keep(url, r);
      const p = r.profile;
      return p ? { name: p.name, headline: p.headline, ...(p.photoUrl ? { photoUrl: p.photoUrl } : {}) } : null;
    } catch (err) {
      warn("profil", err);
      return null;
    }
  }

  async forUrl(raw: string, opts: LookupOptions & { warming?: boolean } = {}): Promise<UrlLookup> {
    const { cache, provider, registry } = this.opts;
    const url = normalizeLinkedinUrl(raw);
    if (!url) return { status: "not_found" };
    // La lecture d'avance (§18.111) : celle-ci n'est pas elle-même, elle l'attend.
    if (!opts.warming) await this.warmed(url);
    const hit = cache.getProfile(url, this.now());
    if ((hit && !hit.found) || (hit?.found && hit.githubLogin !== undefined)) count("linkedin_cache");
    if (hit && !hit.found) return { status: "not_found" };
    // Le registre de l'App, en parallèle : le GitHub lié à ce profil, et son CV s'il n'est pas déjà ici.
    const knownP = registry ? registry.githubOf(url) : Promise.resolve(null);
    const storedP = registry && !hit ? registry.profileOf(url) : Promise.resolve(null);
    /** Le GitHub des liens du profil d'abord ; sinon celui du registre, prouvé s'il est de force 2 ou plus. */
    const found = async (profile: LinkedinProfile, githubLogin: string | null): Promise<UrlLookup> => {
      if (githubLogin) return { status: "found", profile, githubLogin };
      const known = await knownP;
      return known ? { status: "found", profile, githubLogin: known.login, githubProven: isProven(known.strength) } : { status: "found", profile, githubLogin: null };
    };
    if (hit?.found && hit.githubLogin !== undefined) return found(hit.profile, hit.githubLogin);
    // Profil gardé sans ses liens : le registre peut donner le GitHub sans relire le profil.
    if (hit?.found && (await knownP)) return found(hit.profile, null);
    const stored = await storedP;
    if (stored) return found(stored, null);
    const took = this.take(opts);
    if (took !== "ok") return took === "ip" ? { status: "unavailable", reason: "ip" } : { status: "unavailable" };
    try {
      opts.onSlow?.(provider.timeoutMs);
      const r = await phase("linkedin", () => provider.fetchProfile(url, { withGithub: true, signal: opts.signal }));
      cache.putProfile(url, r.profile, r.profile ? r.githubLogin : undefined, this.now());
      this.keep(url, r);
      return r.profile ? found(r.profile, r.githubLogin) : { status: "not_found" };
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

/**
 * Le service branché sur la base du serveur, ou null si le fournisseur n'a pas de jeton.
 * `registry` : le registre de l'App Azerit (§18.95), s'il est branché.
 */
export function linkedinProfilesFromEnv(env: NodeJS.ProcessEnv, db: Database.Database, fetchImpl?: typeof fetch, registry?: RegistryPort): LinkedinProfiles | null {
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
    signal: readmeSignal({ token: () => tokensFromEnv(env)[0], fetchImpl }),
    registry,
  });
}
