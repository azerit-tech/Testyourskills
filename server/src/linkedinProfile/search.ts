// Recherche d'un profil LinkedIn par nom (SPEC §18.80, §18.90) : ce qui remplace le
// lien collé. Deux usages : les suggestions pendant la frappe (« Ton nom », « Son
// nom »), et le retour de « Se connecter avec LinkedIn » (les candidats au nom rendu
// par LinkedIn).
//
// Fournisseur par défaut : un index de recherche web (webSearch.ts), Brave puis
// Serper, une seconde et 0,005 $ la requête au plus ; l'acteur Apify de Google en
// dernier recours, au retour d'une connexion seulement. L'acteur Apify de
// recherche par nom du §18.80 ne répondait pas en production : retiré.
// Crustdata derrière LINKEDIN_SEARCH_PROVIDER=crustdata (POST /person/search,
// 0,03 crédit par résultat, cinq au plus), et sa recherche inverse par email
// professionnel derrière LINKEDIN_EMAIL_LOOKUP=crustdata (1 crédit par personne).
//
// Garde-fous : cache d'un jour par nom, un plafond de recherches payées par jour
// (LINKEDIN_DAILY_SEARCHES), une limite par IP. Plafond atteint, panne ou pas de
// clé : « off », et le champ redevient celui où l'on colle un lien.

import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { linkedinSlug } from "../../../shared/entry";
import { nameWords, parsePersonName, samePublicFullName, type PersonName } from "../names";
import { CrustdataClient, CrustdataPeople } from "./crustdata";
import { LinkedinCache } from "./store";
import { ApifyGoogleSearch, BraveSearch, SerperSearch, WebPeopleSearch, type PeopleQuery, type WebSearchProvider } from "./webSearch";

export interface LinkedinCandidate {
  /** Adresse normalisée : https://www.linkedin.com/in/<slug>. */
  url: string;
  name: string;
  headline: string;
  /** Adresse de la photo chez LinkedIn, si le fournisseur la donne. */
  photoUrl?: string;
  /** Concordance avec la personne cherchée, de 0 à 1 (webSearch.ts, `scoreHit`) ; absente d'une saisie en cours. */
  score?: number;
  /** Le lieu que l'index en donne (« Gif-sur-Yvette, Île-de-France, France »), s'il le donne. */
  location?: string;
  /** Le titre de l'index ne nomme que le lieu (« Nom - Lieu | Professional Profile ») : aucun poste. */
  placeOnly?: boolean;
  /** L'extrait de l'index (nom exact seulement) : l'école, l'employeur, le lieu qu'il nomme. */
  snippet?: string;
}

export const DEFAULT_DAILY_SEARCHES = 2000;
/** Recherches payées par IP et par jour (les réponses du cache ne comptent pas) : un nom tapé en coûte trois ou quatre. */
export const SEARCHES_PER_IP = 60;
/** Candidats gardés par recherche. */
export const MAX_CANDIDATES = 10;

export interface PeopleSearchProvider {
  readonly name: string;
  /** false : trop lent pour des suggestions pendant la frappe (défaut : true). */
  readonly typing?: boolean;
  searchByName(name: PersonName, opts: PeopleQuery): Promise<LinkedinCandidate[]>;
}

export interface EmailLookupProvider {
  findByEmail(email: string, signal?: AbortSignal): Promise<LinkedinCandidate | null>;
}

class CrustdataPeopleSearch implements PeopleSearchProvider {
  readonly name = "crustdata";
  constructor(private readonly people: CrustdataPeople) {}
  searchByName(name: PersonName, opts: { signal?: AbortSignal }): Promise<LinkedinCandidate[]> {
    return this.people.searchByName(name.full, opts.signal);
  }
}

// --- Le service : cache, budget, tri -----------------------------------------------

export interface SearchOptions {
  /** Prend une unité de la limite par IP juste avant une recherche payée ; false : refusé. */
  spend?: () => boolean;
  /** Prénom et nom exacts (retour de la connexion LinkedIn) ; sinon une saisie en cours. */
  strict?: boolean;
  /** Avec un nom exact : l'employeur, qui départage les homonymes. */
  company?: string | null;
  /** Avec un nom exact : une requête, le nom seul, dont l'appelant juge les extraits (§18.125). */
  nameOnly?: boolean;
  /** Une saisie en cours : le mot-clé tapé après le nom (« criteo », §18.112). */
  context?: string;
  signal?: AbortSignal;
}

export type SearchResult =
  | { status: "ok"; results: LinkedinCandidate[] }
  /** Il faut un prénom et un nom. */
  | { status: "short" }
  /** Plafond du jour, limite de l'IP, panne du fournisseur : le champ redevient un lien à coller. */
  | { status: "off" };

/** Ce que les routes demandent ; les tests en donnent un faux. */
export interface LinkedinPeople {
  byName(raw: string, opts?: SearchOptions): Promise<SearchResult>;
  /** Recherche inverse par email, si un fournisseur la propose. null : rien de sûr. */
  byEmail(email: string, opts?: SearchOptions): Promise<LinkedinCandidate | null>;
}

export interface LinkedinSearchOptions {
  cache: LinkedinCache;
  provider: PeopleSearchProvider;
  emailLookup?: EmailLookupProvider;
  dailySearches?: number;
  now?: () => number;
}

/** Les adresses qu'une recherche inverse ne trouve jamais, et qui ne disent aucun employeur : messageries personnelles. */
export const PERSONAL_MAIL_RE = /@(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|mac|proton|protonmail|pm|gmx|aol|orange|wanadoo|free|sfr|laposte|neuf|bbox|numericable)\.[a-z.]{2,6}$/i;

/** Les candidats du même nom complet d'abord, dans l'ordre du fournisseur ; une adresse une seule fois. */
export function rankCandidates(name: string, list: LinkedinCandidate[]): LinkedinCandidate[] {
  const seen = new Set<string>();
  const unique = list.filter((c) => !seen.has(c.url) && !!seen.add(c.url));
  return [...unique.filter((c) => samePublicFullName(name, c.name)), ...unique.filter((c) => !samePublicFullName(name, c.name))].slice(0, MAX_CANDIDATES);
}

/** Un mot-clé plus court ne part pas vers l'index : les profils du nom seul, classés par ce début de mot. */
export const MIN_CONTEXT_CHARS = 3;

/**
 * Ceux qui portent le mot-clé d'abord (§18.112), dans leur ordre : chaque mot du
 * mot-clé qui commence un mot de leur titre, de leur nom ou de leur adresse compte
 * (« criteo » dans « Florent Delorme - Criteo »). Personne n'est retiré.
 */
export function rankByContext<T extends LinkedinCandidate>(list: T[], context: string | undefined): T[] {
  const want = nameWords(context).filter((w) => w.length >= 2);
  if (!want.length) return list;
  const hits = (c: T) => {
    const have = nameWords(`${c.headline} ${c.name} ${linkedinSlug(c.url) ?? ""}`);
    return want.filter((w) => have.some((h) => h.startsWith(w))).length;
  };
  return list
    .map((c, i) => ({ c, i, n: hits(c) }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.c);
}

/**
 * Les profils de l'App Azerit d'abord, ceux du web ensuite (§18.96), un profil une
 * seule fois (même adresse, casse comprise). Un profil des deux garde sa ligne de
 * l'App, complétée de la photo et de la concordance que le web donne.
 */
export function mergeCandidates(first: LinkedinCandidate[], then: LinkedinCandidate[]): LinkedinCandidate[] {
  const key = (c: LinkedinCandidate) => (linkedinSlug(c.url) ?? c.url).toLowerCase();
  const web = new Map<string, LinkedinCandidate>();
  for (const c of then) if (!web.has(key(c))) web.set(key(c), c);
  const out: LinkedinCandidate[] = [];
  const seen = new Set<string>();
  for (const c of first) {
    const k = key(c);
    if (seen.has(k)) continue;
    seen.add(k);
    const w = web.get(k);
    const photoUrl = c.photoUrl ?? w?.photoUrl;
    const score = c.score ?? w?.score;
    const extra = { ...(w?.location && !c.location ? { location: w.location } : {}), ...(w?.snippet && !c.snippet ? { snippet: w.snippet } : {}) };
    out.push({ ...c, headline: c.headline || w?.headline || "", ...(photoUrl ? { photoUrl } : {}), ...(score !== undefined ? { score } : {}), ...extra });
  }
  for (const c of then) {
    const k = key(c);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

export class LinkedinSearch implements LinkedinPeople {
  private readonly daily: number;
  private readonly now: () => number;
  private readonly flights = new Map<string, Promise<SearchResult>>();

  constructor(private readonly opts: LinkedinSearchOptions) {
    this.daily = opts.dailySearches ?? DEFAULT_DAILY_SEARCHES;
    this.now = opts.now ?? Date.now;
  }

  get providerName(): string {
    return this.opts.provider.name;
  }

  /** Reste-t-il une recherche aujourd'hui, et l'IP en a-t-elle encore une ? Si oui, elle est comptée. */
  private take(opts: SearchOptions): boolean {
    if (this.opts.cache.searchesToday(this.now()) >= this.daily) return false;
    if (!(opts.spend?.() ?? true)) return false;
    this.opts.cache.addSearch(this.now());
    return true;
  }

  async byName(raw: string, opts: SearchOptions = {}): Promise<SearchResult> {
    const name = parsePersonName(raw);
    if (!name) return { status: "short" };
    // Une saisie en cours ne part jamais vers un index lent.
    if (!opts.strict && this.opts.provider.typing === false) return { status: "off" };
    const context = opts.strict ? "" : nameWords(opts.context).join(" ");
    return context ? this.byNameAndContext(raw, name, context, opts) : this.search(name, opts);
  }

  /**
   * Le nom et un mot-clé (§18.112) : `site:linkedin.com/in "Nom" mot-clé`, suivi des
   * profils du nom seul déjà en cache, sans rien payer de plus ; rien au mot-clé :
   * le nom seul. Un mot-clé de moins de trois lettres ne part pas : le nom seul.
   * Toujours classé par le mot-clé.
   */
  private async byNameAndContext(raw: string, name: PersonName, context: string, opts: SearchOptions): Promise<SearchResult> {
    const nameOnly = { ...opts, context: undefined };
    const found = context.length < MIN_CONTEXT_CHARS ? null : await this.search(name, opts, context);
    if (found?.status !== "ok" || !found.results.length) return ranked(await this.byName(raw, nameOnly), context);
    const cached = this.opts.cache.getSearch<LinkedinCandidate>(this.keyOf(name, opts), this.now()) ?? [];
    return ranked({ status: "ok", results: rankCandidates(name.full, [...found.results, ...cached]) }, context);
  }

  private keyOf(name: PersonName, opts: SearchOptions, context = ""): string {
    if (opts.strict && opts.nameOnly) return `g:${name.key}`;
    const company = opts.strict ? (opts.company ?? "").trim().toLowerCase() : "";
    // L'employeur vient d'un email vérifié : dans la clé, son empreinte seulement.
    return `${opts.strict ? "s" : "n"}:${name.key}${company ? `:${createHash("sha256").update(company).digest("hex").slice(0, 16)}` : ""}${context ? `|${context}` : ""}`;
  }

  private async search(name: PersonName, opts: SearchOptions, context = ""): Promise<SearchResult> {
    const nameOnly = !!opts.strict && !!opts.nameOnly;
    const company = opts.strict && !nameOnly ? (opts.company ?? "").trim().toLowerCase() : "";
    const key = this.keyOf(name, opts, context);
    const hit = this.opts.cache.getSearch<LinkedinCandidate>(key, this.now());
    if (hit) return { status: "ok", results: hit };
    // Deux frappes du même nom en vol : une seule recherche payée.
    const flying = this.flights.get(key);
    if (flying) return flying;
    if (!this.take(opts)) return { status: "off" };
    const flight = (async (): Promise<SearchResult> => {
      try {
        const results = rankCandidates(name.full, await this.opts.provider.searchByName(name, { strict: !!opts.strict, ...(nameOnly ? { nameOnly } : {}), company: company || null, context: context || null, signal: opts.signal }));
        this.opts.cache.putSearch(key, results, this.now());
        return { status: "ok", results };
      } catch (err) {
        warn("recherche par nom", err);
        return { status: "off" };
      }
    })().finally(() => this.flights.delete(key));
    this.flights.set(key, flight);
    return flight;
  }

  async byEmail(email: string, opts: SearchOptions = {}): Promise<LinkedinCandidate | null> {
    const lookup = this.opts.emailLookup;
    if (!lookup || PERSONAL_MAIL_RE.test(email) || !this.take(opts)) return null;
    try {
      return await lookup.findByEmail(email, opts.signal);
    } catch (err) {
      warn("recherche par email", err);
      return null;
    }
  }
}

const ranked = (r: SearchResult, context: string): SearchResult => (r.status === "ok" ? { status: "ok", results: rankByContext(r.results, context) } : r);

/** Jamais la clé, le nom cherché ni le corps : le statut ou le type d'erreur seulement. */
function warn(what: string, err: unknown) {
  const e = err as { status?: unknown; name?: unknown };
  console.warn(`[linkedin] ${what} indisponible :`, typeof e?.status === "number" ? `HTTP ${e.status}` : String(e?.name ?? "erreur"));
}

// --- Configuration ------------------------------------------------------------------

/** Les index de recherche web dont le serveur a la clé, dans l'ordre où ils sont essayés. */
export function webProvidersFromEnv(env: NodeJS.ProcessEnv, fetchImpl?: typeof fetch): WebSearchProvider[] {
  const brave = env.BRAVE_SEARCH_API_KEY?.trim();
  const serper = env.SERPER_API_KEY?.trim();
  const apify = env.APIFY_TOKEN?.trim();
  return [
    ...(brave ? [new BraveSearch({ apiKey: brave, fetchImpl })] : []),
    ...(serper ? [new SerperSearch({ apiKey: serper, fetchImpl })] : []),
    ...(apify ? [new ApifyGoogleSearch({ token: apify, fetchImpl })] : []),
  ];
}

/**
 * La recherche par nom, branchée sur la base du serveur. Par défaut un index web :
 * BRAVE_SEARCH_API_KEY, puis SERPER_API_KEY, puis APIFY_TOKEN (Google par Apify,
 * au retour d'une connexion seulement). LINKEDIN_SEARCH_PROVIDER=crustdata, ou
 * des profils lus par Crustdata, pour chercher chez Crustdata. Sans aucune clé :
 * null, et le champ « Ton nom » reste un champ où l'on colle un lien.
 */
export function linkedinSearchFromEnv(env: NodeJS.ProcessEnv, db: Database.Database, fetchImpl?: typeof fetch): LinkedinSearch | null {
  const asked = env.LINKEDIN_SEARCH_PROVIDER?.trim().toLowerCase();
  const which = asked || (env.LINKEDIN_PROVIDER?.trim().toLowerCase() === "crustdata" ? "crustdata" : "web");
  const crustKey = env.CRUSTDATA_API_KEY?.trim();
  const people = crustKey ? new CrustdataPeople(new CrustdataClient({ apiKey: crustKey, fetchImpl })) : null;
  let provider: PeopleSearchProvider | null = null;
  if (which === "crustdata") provider = people ? new CrustdataPeopleSearch(people) : null;
  // « apify » : l'ancien nom du fournisseur par défaut (§18.80).
  else if (which === "web" || which === "apify") {
    const providers = webProvidersFromEnv(env, fetchImpl);
    if (providers.length) provider = new WebPeopleSearch({ providers });
  } else console.warn(`[linkedin] LINKEDIN_SEARCH_PROVIDER inconnu (${which}) : web ou crustdata.`);
  if (!provider) return null;
  const n = Number(env.LINKEDIN_DAILY_SEARCHES);
  const dailySearches = env.LINKEDIN_DAILY_SEARCHES?.trim() && Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_DAILY_SEARCHES;
  const emailLookup = env.LINKEDIN_EMAIL_LOOKUP?.trim().toLowerCase() === "crustdata" && people ? people : undefined;
  return new LinkedinSearch({ cache: new LinkedinCache(db), provider, emailLookup, dailySearches });
}
