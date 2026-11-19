// Recherche d'un profil LinkedIn par nom (SPEC §18.80) : ce qui remplace le lien
// collé. Deux usages : le champ « Ton nom » (suggestions pendant la frappe) et le
// retour de « Se connecter avec LinkedIn » (les candidats au nom rendu par LinkedIn).
//
// Fournisseur par défaut : l'acteur Apify `harvestapi~linkedin-profile-search-by-name`,
// sans cookies, mode « Short » : une page de dix profils au plus (adresse, nom,
// titre, photo), 0,004 $ la recherche au 19 novembre 2026 (4 $ les 1 000).
// Crustdata derrière LINKEDIN_SEARCH_PROVIDER=crustdata (POST /person/search,
// 0,03 crédit par résultat, cinq au plus), et sa recherche inverse par email
// professionnel derrière LINKEDIN_EMAIL_LOOKUP=crustdata (1 crédit par personne).
//
// Garde-fous : cache d'un jour par nom, un plafond de recherches payées par jour
// (LINKEDIN_DAILY_SEARCHES), une limite par IP. Plafond atteint, panne ou pas de
// jeton : « off », et le champ redevient celui où l'on colle un lien, sans rien dire.

import type Database from "better-sqlite3";
import { normalizeLinkedinUrl } from "../../../shared/entry";
import { parsePersonName, samePublicFullName, type PersonName } from "../names";
import { APIFY_API, ApifyError } from "./apify";
import { CrustdataClient, CrustdataPeople } from "./crustdata";
import { LinkedinCache } from "./store";

export interface LinkedinCandidate {
  /** Adresse normalisée : https://www.linkedin.com/in/<slug>. */
  url: string;
  name: string;
  headline: string;
  /** Adresse de la photo chez LinkedIn, si le fournisseur la donne. */
  photoUrl?: string;
}

export const DEFAULT_APIFY_SEARCH_ACTOR = "harvestapi~linkedin-profile-search-by-name";
/** Entrée de l'acteur : `{first}`, `{last}`, et `"{strict}"` remplacé par un booléen. */
export const DEFAULT_APIFY_SEARCH_INPUT = '{"profileScraperMode":"Short","firstName":"{first}","lastName":"{last}","strictSearch":"{strict}","maxPages":1,"maxItems":10}';
export const SEARCH_TIMEOUT_MS = 20_000;
export const DEFAULT_DAILY_SEARCHES = 2000;
/** Recherches payées par IP et par jour (les réponses du cache ne comptent pas). */
export const SEARCHES_PER_IP = 30;
/** Candidats gardés par recherche. */
export const MAX_CANDIDATES = 10;

export interface PeopleSearchProvider {
  readonly name: "apify" | "crustdata";
  searchByName(name: PersonName, opts: { strict: boolean; signal?: AbortSignal }): Promise<LinkedinCandidate[]>;
}

export interface EmailLookupProvider {
  findByEmail(email: string, signal?: AbortSignal): Promise<LinkedinCandidate | null>;
}

// --- Apify ----------------------------------------------------------------------

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const first = (o: Obj, ...keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  return undefined;
};

/** L'entrée de l'acteur : le modèle, ses trois repères remplacés. */
export function apifySearchInput(template: string, name: PersonName, strict: boolean): unknown {
  const fill = (v: unknown): unknown => {
    if (v === "{strict}") return strict;
    if (typeof v === "string") return v.split("{first}").join(name.first).split("{last}").join(name.last).split("{name}").join(name.full);
    if (Array.isArray(v)) return v.map(fill);
    const o = obj(v);
    return o ? Object.fromEntries(Object.entries(o).map(([k, x]) => [k, fill(x)])) : v;
  };
  return fill(JSON.parse(template));
}

/**
 * Un élément du jeu de données → un candidat, ou null. L'adresse vient du nom
 * public du profil (`publicIdentifier`) d'abord : l'autre forme (« ACoAA… »)
 * est sensible à la casse et ne se normalise pas.
 */
export function candidateFromApifyItem(raw: unknown): LinkedinCandidate | null {
  const item = obj(raw);
  if (!item || item.error) return null;
  const id = str(first(item, "publicIdentifier", "public_identifier", "vanityName"));
  const given = first(item, "linkedinUrl", "url", "profileUrl", "publicProfileUrl", "linkedin_url");
  const url = (id && !/^ACo/.test(id) ? normalizeLinkedinUrl(`linkedin.com/in/${id}`) : null) ?? (/\/in\/ACo[A-Za-z0-9_-]{10,}/.test(str(given)) ? null : normalizeLinkedinUrl(given));
  const name = str(first(item, "name", "fullName", "full_name")) || [str(item.firstName), str(item.lastName)].filter(Boolean).join(" ");
  if (!url || !name) return null;
  const photoRaw = first(item, "photo", "profilePicture", "picture", "pictureUrl", "profilePic", "avatar", "image");
  const photo = str(obj(photoRaw)?.url ?? photoRaw);
  return {
    url,
    name: name.slice(0, 120),
    headline: str(first(item, "headline", "position", "occupation", "summary")).slice(0, 220),
    ...(photo ? { photoUrl: photo.slice(0, 600) } : {}),
  };
}

export interface ApifySearchOptions {
  token: string;
  actor?: string;
  inputTemplate?: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

export class ApifyPeopleSearch implements PeopleSearchProvider {
  readonly name = "apify" as const;
  private readonly fetchImpl: typeof fetch;
  private readonly base: string;
  private readonly actor: string;
  private readonly template: string;
  private readonly timeoutMs: number;

  constructor(private readonly opts: ApifySearchOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.base = (opts.baseUrl ?? APIFY_API).replace(/\/+$/, "");
    this.actor = opts.actor?.trim() || DEFAULT_APIFY_SEARCH_ACTOR;
    this.template = opts.inputTemplate?.trim() || DEFAULT_APIFY_SEARCH_INPUT;
    this.timeoutMs = opts.timeoutMs ?? SEARCH_TIMEOUT_MS;
    apifySearchInput(this.template, { first: "x", last: "y", full: "x y", key: "x y" }, false); // un modèle illisible casse au démarrage
  }

  async searchByName(name: PersonName, opts: { strict: boolean; signal?: AbortSignal }): Promise<LinkedinCandidate[]> {
    const runSeconds = Math.max(1, Math.floor(this.timeoutMs / 1000));
    const t = AbortSignal.timeout(this.timeoutMs + 2000);
    const res = await this.fetchImpl(`${this.base}/acts/${encodeURIComponent(this.actor)}/run-sync-get-dataset-items?timeout=${runSeconds}&format=json&clean=true`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.opts.token}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(apifySearchInput(this.template, name, opts.strict)),
      signal: opts.signal ? AbortSignal.any([opts.signal, t]) : t,
    });
    if (!res.ok) throw new ApifyError(res.status, `apify ${res.status}`);
    const items = await res.json().catch(() => null);
    return (Array.isArray(items) ? items : []).flatMap((x) => candidateFromApifyItem(x) ?? []);
  }
}

class CrustdataPeopleSearch implements PeopleSearchProvider {
  readonly name = "crustdata" as const;
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

/** Les adresses qu'une recherche inverse ne trouve jamais : messageries personnelles. */
const PERSONAL_MAIL_RE = /@(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|mac|proton|protonmail|pm|gmx|aol|orange|wanadoo|free|sfr|laposte|neuf|bbox|numericable)\.[a-z.]{2,6}$/i;

/** Les candidats du même nom complet d'abord, dans l'ordre du fournisseur ; une adresse une seule fois. */
export function rankCandidates(name: string, list: LinkedinCandidate[]): LinkedinCandidate[] {
  const seen = new Set<string>();
  const unique = list.filter((c) => !seen.has(c.url) && !!seen.add(c.url));
  return [...unique.filter((c) => samePublicFullName(name, c.name)), ...unique.filter((c) => !samePublicFullName(name, c.name))].slice(0, MAX_CANDIDATES);
}

export class LinkedinSearch implements LinkedinPeople {
  private readonly daily: number;
  private readonly now: () => number;
  private readonly flights = new Map<string, Promise<SearchResult>>();

  constructor(private readonly opts: LinkedinSearchOptions) {
    this.daily = opts.dailySearches ?? DEFAULT_DAILY_SEARCHES;
    this.now = opts.now ?? Date.now;
  }

  get providerName(): PeopleSearchProvider["name"] {
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
    const key = `${opts.strict ? "s" : "n"}:${name.key}`;
    const hit = this.opts.cache.getSearch<LinkedinCandidate>(key, this.now());
    if (hit) return { status: "ok", results: hit };
    // Deux frappes du même nom en vol : une seule recherche payée.
    const flying = this.flights.get(key);
    if (flying) return flying;
    if (!this.take(opts)) return { status: "off" };
    const flight = (async (): Promise<SearchResult> => {
      try {
        const results = rankCandidates(name.full, await this.opts.provider.searchByName(name, { strict: !!opts.strict, signal: opts.signal }));
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

/** Jamais la clé, le nom cherché ni le corps : le statut ou le type d'erreur seulement. */
function warn(what: string, err: unknown) {
  const e = err as { status?: unknown; name?: unknown };
  console.warn(`[linkedin] ${what} indisponible :`, typeof e?.status === "number" ? `HTTP ${e.status}` : String(e?.name ?? "erreur"));
}

// --- Configuration ------------------------------------------------------------------

/**
 * La recherche par nom, branchée sur la base du serveur. Fournisseur :
 * LINKEDIN_SEARCH_PROVIDER (apify ou crustdata), sinon celui des profils
 * (LINKEDIN_PROVIDER, apify par défaut). Sans son jeton : null, et le champ
 * « Ton nom » reste un champ où l'on colle un lien.
 */
export function linkedinSearchFromEnv(env: NodeJS.ProcessEnv, db: Database.Database, fetchImpl?: typeof fetch): LinkedinSearch | null {
  const which = (env.LINKEDIN_SEARCH_PROVIDER?.trim() || env.LINKEDIN_PROVIDER?.trim() || "apify").toLowerCase();
  const crustKey = env.CRUSTDATA_API_KEY?.trim();
  const people = crustKey ? new CrustdataPeople(new CrustdataClient({ apiKey: crustKey, fetchImpl })) : null;
  let provider: PeopleSearchProvider | null = null;
  if (which === "crustdata") provider = people ? new CrustdataPeopleSearch(people) : null;
  else if (which === "apify") {
    const token = env.APIFY_TOKEN?.trim();
    if (token) provider = new ApifyPeopleSearch({ token, actor: env.APIFY_LINKEDIN_SEARCH_ACTOR, inputTemplate: env.APIFY_LINKEDIN_SEARCH_INPUT, fetchImpl });
  } else console.warn(`[linkedin] LINKEDIN_SEARCH_PROVIDER inconnu (${which}) : apify ou crustdata.`);
  if (!provider) return null;
  const n = Number(env.LINKEDIN_DAILY_SEARCHES);
  const dailySearches = env.LINKEDIN_DAILY_SEARCHES?.trim() && Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_DAILY_SEARCHES;
  const emailLookup = env.LINKEDIN_EMAIL_LOOKUP?.trim().toLowerCase() === "crustdata" && people ? people : undefined;
  return new LinkedinSearch({ cache: new LinkedinCache(db), provider, emailLookup, dailySearches });
}
