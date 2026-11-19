// Retrouver un profil LinkedIn sans lire LinkedIn (SPEC §18.89) : un index de
// recherche web rend les adresses `/in/` et leurs titres (« Nom - Entreprise |
// LinkedIn ») en une seconde. Reprise de l'application Azerit
// (`linkedin_discover.py` : `build_queries`, `score_hit`, `_name_in_url`,
// `MIN_SEARCH_SCORE`, `linkedin_urls_in_text`, et son échelle de confiance).
//
// Trois index, dans l'ordre : Brave (1 s, 0,005 $ la requête), Serper (Google,
// 2 s, 0,001 $), et en dernier recours l'acteur Apify `google-search-scraper`
// (30 s, jamais pendant la frappe). Une panne passe au suivant ; les titres et
// extraits ne servent qu'au rapprochement, en mémoire.

import { normalizeLinkedinUrl } from "../../../shared/entry";
import { samePublicFullName, type PersonName } from "../names";
import { APIFY_API } from "./apify";
import type { LinkedinCandidate, PeopleSearchProvider } from "./search";

export interface SearchHit {
  url: string;
  title: string;
  description: string;
  /** Rang dans la page de résultats, à partir de 1. */
  rank: number;
}

export interface WebSearchProvider {
  readonly name: "brave" | "serper" | "apify-google";
  /** Trop lent pour des suggestions pendant la frappe : gardé pour le retour d'une connexion. */
  readonly slow?: boolean;
  search(query: string, opts?: { count?: number; signal?: AbortSignal }): Promise<SearchHit[]>;
}

export class WebSearchError extends Error {
  constructor(readonly status: number, msg: string) {
    super(msg);
    this.name = "WebSearchError";
  }
}

export const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
export const SERPER_ENDPOINT = "https://google.serper.dev/search";
export const GOOGLE_ACTOR = "apify~google-search-scraper";
export const BRAVE_TIMEOUT_MS = 4000;
export const SERPER_TIMEOUT_MS = 6000;
/** L'acteur Apify démarre en 30 s environ : dernier recours, au retour d'une connexion seulement. */
export const APIFY_GOOGLE_TIMEOUT_MS = 90_000;
/** En dessous, un résultat n'est pas proposé (application Azerit). */
export const MIN_SEARCH_SCORE = 0.3;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
/** Titre ou extrait d'un index : sans balises (`<strong>`), entités décodées, une seule ligne. */
export function plain(v: unknown): string {
  return str(v)
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? m;
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function hitsOf(list: unknown, urlKey: string, descKey: string): SearchHit[] {
  return (Array.isArray(list) ? list : []).flatMap((raw, i) => {
    const o = obj(raw);
    const url = str(o?.[urlKey]);
    if (!o || !url) return [];
    const rank = typeof o.position === "number" && o.position > 0 ? o.position : i + 1;
    return [{ url, title: plain(o.title).slice(0, 300), description: plain(o[descKey]).slice(0, 600), rank }];
  });
}

const timed = (ms: number, signal?: AbortSignal) => (signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms));

/** Web Search API de Brave : GET, clé en `X-Subscription-Token`, résultats dans `web.results`. */
export class BraveSearch implements WebSearchProvider {
  readonly name = "brave" as const;
  constructor(private readonly o: { apiKey: string; fetchImpl?: typeof fetch; timeoutMs?: number }) {}

  async search(query: string, opts: { count?: number; signal?: AbortSignal } = {}): Promise<SearchHit[]> {
    const params = new URLSearchParams({ q: query, count: String(Math.max(1, Math.min(opts.count ?? 10, 20))), country: "FR", search_lang: "fr", safesearch: "moderate" });
    const res = await (this.o.fetchImpl ?? fetch)(`${BRAVE_ENDPOINT}?${params}`, {
      // Api-Version fige le contrat de réponse, comme dans l'application Azerit.
      headers: { accept: "application/json", "x-subscription-token": this.o.apiKey, "api-version": "2023-01-01" },
      signal: timed(this.o.timeoutMs ?? BRAVE_TIMEOUT_MS, opts.signal),
    });
    if (!res.ok) throw new WebSearchError(res.status, `brave ${res.status}`);
    const body = obj(await res.json().catch(() => null));
    return hitsOf(obj(body?.web)?.results, "url", "description");
  }
}

/** Serper (Google) : POST, clé en `X-API-KEY`, résultats dans `organic` (`link`, `snippet`, `position`). */
export class SerperSearch implements WebSearchProvider {
  readonly name = "serper" as const;
  constructor(private readonly o: { apiKey: string; fetchImpl?: typeof fetch; timeoutMs?: number }) {}

  async search(query: string, opts: { count?: number; signal?: AbortSignal } = {}): Promise<SearchHit[]> {
    const res = await (this.o.fetchImpl ?? fetch)(SERPER_ENDPOINT, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "x-api-key": this.o.apiKey },
      body: JSON.stringify({ q: query, num: Math.max(1, Math.min(opts.count ?? 10, 20)), gl: "fr", hl: "fr" }),
      signal: timed(this.o.timeoutMs ?? SERPER_TIMEOUT_MS, opts.signal),
    });
    if (!res.ok) throw new WebSearchError(res.status, `serper ${res.status}`);
    const body = obj(await res.json().catch(() => null));
    return hitsOf(body?.organic, "link", "snippet");
  }
}

/** Google par l'acteur Apify `google-search-scraper` : une page, résultats dans `organicResults`. */
export class ApifyGoogleSearch implements WebSearchProvider {
  readonly name = "apify-google" as const;
  readonly slow = true;
  constructor(private readonly o: { token: string; fetchImpl?: typeof fetch; baseUrl?: string; timeoutMs?: number }) {}

  async search(query: string, opts: { count?: number; signal?: AbortSignal } = {}): Promise<SearchHit[]> {
    const ms = this.o.timeoutMs ?? APIFY_GOOGLE_TIMEOUT_MS;
    const base = (this.o.baseUrl ?? APIFY_API).replace(/\/+$/, "");
    const res = await (this.o.fetchImpl ?? fetch)(`${base}/acts/${encodeURIComponent(GOOGLE_ACTOR)}/run-sync-get-dataset-items?timeout=${Math.max(1, Math.floor(ms / 1000))}&format=json&clean=true`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.o.token}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ queries: query, maxPagesPerQuery: 1, resultsPerPage: Math.max(1, Math.min(opts.count ?? 10, 20)), countryCode: "fr", languageCode: "fr" }),
      signal: timed(ms + 2000, opts.signal),
    });
    if (!res.ok) throw new WebSearchError(res.status, `apify ${res.status}`);
    const items = await res.json().catch(() => null);
    const page = (Array.isArray(items) ? items : []).map(obj).find((x) => x && !x["#error"] && Array.isArray(x.organicResults));
    return hitsOf(page?.organicResults, "url", "description");
  }
}

// --- Le rapprochement (application Azerit) ------------------------------------------

/** Sans accents, en minuscules, lettres et chiffres séparés d'une espace (`_text`). */
function flat(value: unknown): string {
  return str(value)
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const words = (value: unknown): Set<string> => new Set(flat(value).split(" ").filter((w) => w.length >= 2));
const subset = (a: Set<string>, b: Set<string>): boolean => a.size > 0 && [...a].every((w) => b.has(w));

/** Chaîne sûre pour une expression exacte dans une requête. */
const quoted = (value: unknown): string => str(value).replace(/["\n]/g, " ").replace(/\s+/g, " ").trim();

/** Nom d'employeur → terme cherchable : le `@` de GitHub (`@datadoghq`) est du balisage. */
export const companyTerm = (value: unknown): string => quoted(value).replace(/^@+/, "").trim();

/** Qui l'on cherche : le nom, et ce qui départage les homonymes. */
export interface Wanted {
  name: string;
  company?: string | null;
  location?: string | null;
  /** Pseudo GitHub : un indice s'il se retrouve dans l'adresse du profil. */
  login?: string | null;
}

/**
 * Les requêtes, de la plus précise à la plus large, deux au plus. Le nom reste
 * entre guillemets : c'est lui qui désigne la personne. L'employeur part sans
 * guillemets : il classe (le profil qui le porte remonte), il ne filtre pas, car
 * sa graphie ne coïncide presque jamais avec celle de LinkedIn. Le lieu garde
 * les siens.
 */
export function buildQueries(who: Wanted): string[] {
  const name = quoted(who.name || who.login);
  if (!name) return [];
  const company = companyTerm(who.company);
  const location = quoted(who.location);
  const out: string[] = [];
  if (company) out.push(`site:linkedin.com/in "${name}" ${company}`);
  if (location) out.push(`site:linkedin.com/in "${name}" "${location}"`);
  out.push(`site:linkedin.com/in "${name}"`);
  return [...new Set(out)].slice(0, 2);
}

/** La requête d'une saisie en cours : sans guillemets, l'index complète le dernier mot. */
export const typedQuery = (name: string): string => `site:linkedin.com/in ${quoted(name)}`;

const slugOf = (url: string): string => {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/\/+$/, "").split("/").pop() ?? "");
  } catch {
    return "";
  }
};

/** L'adresse porte-t-elle le nom ? « jane-doe » pour Jane Doe, oui ; « john-smith », non. */
export function nameInUrl(name: unknown, url: string): boolean {
  return subset(words(name), words(slugOf(url)));
}

export type Confidence = "high" | "medium" | "low";

/** Score explicable d'un résultat pour une personne, et ce qui a concordé. Jamais une preuve. */
export function scoreHit(who: Wanted, hit: SearchHit): { score: number; matched: string[] } {
  let path = "";
  try {
    path = flat(decodeURIComponent(new URL(hit.url).pathname));
  } catch {
    /* adresse illisible : le titre seul */
  }
  const haystack = flat(`${hit.title} ${hit.description} ${path}`);
  const hay = new Set(haystack.split(" "));
  const matched: string[] = [];
  let score = 0;

  const name = flat(who.name || who.login);
  const nameW = words(name);
  if (name && ` ${haystack} `.includes(` ${name} `)) {
    score += 0.62;
    matched.push("name_exact");
  } else if (subset(nameW, hay)) {
    score += 0.5;
    matched.push("name_tokens");
  } else if (nameW.size && [...nameW].filter((w) => hay.has(w)).length >= Math.min(2, nameW.size)) {
    score += 0.28;
    matched.push("name_partial");
  }
  if (subset(words(companyTerm(who.company)), hay)) {
    score += 0.23;
    matched.push("company");
  }
  // Un lieu long (« Paris, Île-de-France ») concorde dès qu'un de ses mots apparaît.
  if ([...words(who.location)].some((w) => hay.has(w))) {
    score += 0.1;
    matched.push("location");
  }
  const login = flat(who.login).replace(/ /g, "");
  if (login && path.replace(/ /g, "").includes(login)) {
    score += 0.05;
    matched.push("github_login");
  }
  if (hit.rank) score += Math.max(0, 0.05 - (hit.rank - 1) * 0.01);
  if (!matched.some((m) => m.startsWith("name_"))) score = Math.min(score, 0.25);
  return { score: Math.round(Math.min(score, 1) * 1000) / 1000, matched };
}

export function confidenceFor(score: number): Confidence {
  return score >= 0.8 ? "high" : score >= 0.55 ? "medium" : "low";
}

const IN_TEXT_RE = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)?linkedin\.com\/in\/([A-Za-z0-9%_.-]+)/gi;

/** Les adresses `/in/` d'un texte quelconque (markdown d'un README, badge, texte brut), normalisées, une fois chacune. */
export function linkedinUrlsInText(text: unknown): string[] {
  const out: string[] = [];
  for (const m of str(text).matchAll(IN_TEXT_RE)) {
    const url = normalizeLinkedinUrl(`https://www.linkedin.com/in/${m[1]!.replace(/[.]+$/, "")}`);
    if (url && !out.includes(url)) out.push(url);
  }
  return out;
}

// --- Du résultat au candidat --------------------------------------------------------

const TITLE_TAIL_RE = /\s*[|\-–—]\s*LinkedIn\s*$/i;
const TITLE_SPLIT_RE = /\s+[-–—|]\s+/;
const FIELD_RE = (label: string) => new RegExp(`(?:^|· )${label}\\s*:\\s*([^·]{2,80}?)\\s*(?:·|$)`, "i");

/**
 * « Nom - Entreprise | LinkedIn » → un candidat : l'adresse normalisée, le nom, et
 * de quoi départager deux homonymes (ce qui suit le nom dans le titre, sinon
 * l'employeur et le lieu de l'extrait). Pas de photo : un index n'en donne pas.
 */
export function candidateFromHit(hit: SearchHit): LinkedinCandidate | null {
  const url = normalizeLinkedinUrl(hit.url);
  if (!url) return null;
  const title = plain(hit.title).replace(TITLE_TAIL_RE, "").replace(/\s*(\.\.\.|…)\s*$/, "");
  const cut = title.search(TITLE_SPLIT_RE);
  const name = (cut < 0 ? title : title.slice(0, cut)).trim();
  if (!name || name.length > 80 || !/\p{L}/u.test(name)) return null;
  let headline = cut < 0 ? "" : title.slice(cut).replace(TITLE_SPLIT_RE, "").trim();
  if (!/[\p{L}\p{N}]/u.test(headline)) headline = "";
  if (!headline) {
    const d = plain(hit.description);
    const parts = [FIELD_RE("Exp[ée]rience").exec(d)?.[1], FIELD_RE("(?:Location|Lieu)").exec(d)?.[1]].flatMap((x) => (x ? [x.trim()] : []));
    headline = parts.join(" · ");
  }
  return { url, name, headline: headline.slice(0, 220) };
}

/** Une saisie en cours : chaque mot tapé commence un mot du nom ou de l'adresse (« jac moug » → Jacques Mougeot). */
export function typedMatches(typed: string, c: LinkedinCandidate): boolean {
  const have = [...flat(c.name).split(" "), ...flat(slugOf(c.url)).split(" ")].filter(Boolean);
  const want = flat(typed).split(" ").filter(Boolean);
  return want.length > 0 && want.every((w) => have.some((h) => h.startsWith(w)));
}

export interface WebPeopleSearchOptions {
  /** Les index, dans l'ordre où ils sont essayés. */
  providers: WebSearchProvider[];
  /** Résultats demandés par requête. */
  count?: number;
}

export interface PeopleQuery {
  /** Prénom et nom exacts (retour d'une connexion) ; sinon une saisie en cours. */
  strict: boolean;
  /** Ce qui départage les homonymes : l'employeur (le domaine de l'email vérifié, le champ de GitHub). */
  company?: string | null;
  location?: string | null;
  signal?: AbortSignal;
}

/**
 * La recherche de profils par un index web. Saisie en cours : une requête sans
 * guillemets, les index rapides seulement. Nom exact : les requêtes de
 * `buildQueries`, chaque résultat noté par `scoreHit`, le meilleur d'abord ;
 * l'index lent n'est essayé que si les rapides sont tous en panne.
 */
export class WebPeopleSearch implements PeopleSearchProvider {
  constructor(private readonly o: WebPeopleSearchOptions) {
    if (!o.providers.length) throw new Error("aucun index de recherche");
  }

  get name(): string {
    return this.o.providers.map((p) => p.name).join(", ");
  }

  /** Des suggestions pendant la frappe : seulement avec un index rapide. */
  get typing(): boolean {
    return this.o.providers.some((p) => !p.slow);
  }

  /** Une requête : le premier index qui répond. Un index vide passe la main au suivant ; tous en panne : l'erreur du dernier. */
  private async hits(query: string, slowToo: boolean, signal?: AbortSignal): Promise<SearchHit[]> {
    const fast = this.o.providers.filter((p) => !p.slow);
    const slow = slowToo ? this.o.providers.filter((p) => p.slow) : [];
    let last: unknown = null;
    let answered = false;
    for (const p of fast) {
      try {
        const got = (await p.search(query, { count: this.o.count ?? 10, signal })).filter((h) => normalizeLinkedinUrl(h.url));
        answered = true;
        if (got.length) return got;
      } catch (err) {
        last = err;
      }
    }
    if (answered) return [];
    for (const p of slow) {
      try {
        return (await p.search(query, { count: this.o.count ?? 10, signal })).filter((h) => normalizeLinkedinUrl(h.url));
      } catch (err) {
        last = err;
      }
    }
    throw last ?? new WebSearchError(0, "aucun index");
  }

  async searchByName(name: PersonName, q: PeopleQuery): Promise<LinkedinCandidate[]> {
    if (!q.strict) {
      const hits = await this.hits(typedQuery(name.full), false, q.signal);
      return unique(hits.flatMap((h) => candidateFromHit(h) ?? []).filter((c) => typedMatches(name.full, c)));
    }
    const who: Wanted = { name: name.full, company: q.company, location: q.location };
    const best = new Map<string, LinkedinCandidate & { score: number }>();
    for (const query of buildQueries(who)) {
      for (const hit of await this.hits(query, true, q.signal)) {
        const c = candidateFromHit(hit);
        const { score } = scoreHit(who, hit);
        if (!c || score < MIN_SEARCH_SCORE) continue;
        // Le nom doit être celui du profil (son titre ou son adresse), pas un nom cité dans l'extrait d'un autre.
        if (!samePublicFullName(name.full, c.name) && !nameInUrl(name.full, c.url)) continue;
        const prev = best.get(c.url);
        if (!prev || score > prev.score) best.set(c.url, { ...c, score });
      }
      // Le nom et l'employeur concordent déjà : la requête plus large n'apprendrait rien.
      if ([...best.values()].some((c) => confidenceFor(c.score) === "high")) break;
    }
    return [...best.values()].sort((a, b) => b.score - a.score);
  }
}

function unique(list: LinkedinCandidate[]): LinkedinCandidate[] {
  const seen = new Set<string>();
  return list.filter((c) => !seen.has(c.url) && !!seen.add(c.url));
}
