// Client Crustdata, API 2025-11-01 (la v1 est fermée), fournisseur facultatif
// (LINKEDIN_PROVIDER=crustdata ; la recherche seule avec LINKEDIN_AUTOFIND=crustdata).
// Deux appels, écrits d'après https://docs.crustdata.com (SPEC §18.24) :
//
// - POST /person/enrich : un profil LinkedIn tiré de la base de Crustdata (pas
//   en temps réel). Base 1 crédit (profil, postes, formation, compétences) ;
//   les profils de plateformes dev (GitHub) ajoutent 1 crédit. Jamais
//   d'email ni de téléphone : ces champs ne sont pas demandés.
// - POST /person/search : la personne dont le compte GitHub correspond, filtrée
//   sur les champs « dev platform » du compte (0,03 + 0,8 crédit par résultat).
//   L'API ne filtre pas sur l'adresse du compte GitHub : on filtre sur sa date
//   de création (le jour) et son nom, puis on vérifie l'adresse renvoyée.
//
// La clé ne sort jamais d'ici : ni log, ni message d'erreur.

import { profileFromPersonData, type LinkedinProfile, type LinkedinProvider, type ProviderResult } from "./profile";
import { normalizeLinkedinUrl, sameGithub } from "./url";

export const CRUSTDATA_API = "https://api.crustdata.com";
export const CRUSTDATA_VERSION = "2025-11-01";

/** Coût d'un résultat de recherche filtrée sur le compte GitHub : 0,03 de base + 0,8. */
export const SEARCH_CREDITS_PER_RESULT = 0.83;
/** Résultats demandés : deux suffisent pour savoir si la correspondance est unique. */
export const SEARCH_LIMIT = 2;
export const SEARCH_MAX_CREDITS = SEARCH_LIMIT * SEARCH_CREDITS_PER_RESULT;
/** Profil de base (postes, formation, compétences, résumé compris). */
export const ENRICH_CREDITS = 1;
/** Profil de base + profils de plateformes dev (le GitHub de la personne). */
export const ENRICH_DEV_CREDITS = 2;

/** Champs demandés à l'enrichissement : ce qui sert au jugement, rien d'autre. */
export const ENRICH_FIELDS = ["basic_profile", "experience", "education", "skills"] as const;
/** En plus pour une entrée LinkedIn : la seule adresse du compte GitHub, pas son email. */
export const DEV_FIELDS = ["dev_platform_profiles.profile_url", "social_handles.dev_platform_identifier.profile_url"] as const;

export class CrustdataError extends Error {
  constructor(readonly status: number, msg: string) {
    super(msg);
    this.name = "CrustdataError";
  }
}

export interface CrustdataOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface EnrichResult {
  /** null : introuvable dans la base (ou retiré à la demande de la personne). */
  profile: LinkedinProfile | null;
  /** Login GitHub trouvé par Crustdata (demandé avec `withGithub`), sinon null. */
  githubLogin: string | null;
  credits: number;
}

export interface SearchResult {
  url: string | null;
  credits: number;
}

/** Ce qu'il faut du compte GitHub pour le chercher. */
export interface GithubIdentity {
  login: string;
  name?: string | null;
  createdAt?: string | null;
}

function creditsOf(res: Response, fallback: number): number {
  const n = Number(res.headers.get("x-credits-used"));
  return res.headers.has("x-credits-used") && Number.isFinite(n) && n >= 0 ? n : fallback;
}

function loginFromGithubUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const m = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38})\/?$/i.exec(url.trim());
  return m ? m[1]! : null;
}

/** Le login GitHub d'un `person_data` : profils de plateformes dev, puis la poignée sociale. */
export function githubLoginOf(data: unknown): string | null {
  const d = data as { dev_platform_profiles?: unknown; social_handles?: { dev_platform_identifier?: { profile_url?: unknown } } } | null;
  const devs = Array.isArray(d?.dev_platform_profiles) ? (d!.dev_platform_profiles as { profile_url?: unknown }[]) : [];
  for (const p of devs) {
    const login = loginFromGithubUrl(p?.profile_url);
    if (login) return login;
  }
  return loginFromGithubUrl(d?.social_handles?.dev_platform_identifier?.profile_url);
}

export class CrustdataClient {
  private readonly fetchImpl: typeof fetch;
  private readonly base: string;
  readonly timeoutMs: number;

  constructor(private readonly opts: CrustdataOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.base = (opts.baseUrl ?? CRUSTDATA_API).replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  private async post(path: string, body: unknown, signal?: AbortSignal): Promise<{ res: Response; json: unknown }> {
    const t = AbortSignal.timeout(this.timeoutMs);
    const res = await this.fetchImpl(`${this.base}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.opts.apiKey}`,
        "content-type": "application/json",
        accept: "application/json",
        "x-api-version": CRUSTDATA_VERSION,
      },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, t]) : t,
    });
    const json = await res.json().catch(() => null);
    return { res, json };
  }

  /**
   * Profil LinkedIn par son adresse, depuis la base de Crustdata. `withGithub`
   * ajoute l'adresse de son compte GitHub (+1 crédit). Un champ refusé par le
   * compte (403 sur les compétences) : on redemande sans lui, une fois.
   */
  async enrich(url: string, opts: { withGithub?: boolean; signal?: AbortSignal } = {}): Promise<EnrichResult> {
    let fields: string[] = [...ENRICH_FIELDS, ...(opts.withGithub ? DEV_FIELDS : [])];
    for (let attempt = 0; attempt < 2; attempt++) {
      const { res, json } = await this.post("/person/enrich", { professional_network_profile_urls: [url], fields }, opts.signal);
      if (res.status === 403 && attempt === 0) {
        const denied = deniedFields(json);
        const kept = fields.filter((f) => !denied.some((d) => f === d || f.startsWith(`${d}.`)));
        if (denied.length && kept.length < fields.length && kept.some((f) => f === "basic_profile")) {
          fields = kept;
          continue;
        }
      }
      if (!res.ok) throw new CrustdataError(res.status, `enrich ${res.status}`);
      const entry = Array.isArray(json) ? (json[0] as { match_status?: string; matches?: { person_data?: unknown }[] } | undefined) : undefined;
      const data = entry?.match_status && entry.match_status !== "matched" ? undefined : entry?.matches?.[0]?.person_data;
      const profile = data ? profileFromPersonData(url, data) : null;
      const cost = profile ? (opts.withGithub ? ENRICH_DEV_CREDITS : ENRICH_CREDITS) : 0;
      return { profile, githubLogin: profile && opts.withGithub ? githubLoginOf(data) : null, credits: creditsOf(res, cost) };
    }
    throw new CrustdataError(403, "enrich 403");
  }

  /**
   * La personne dont le compte GitHub est `gh`. Filtre : compte créé ce jour-là
   * (et son nom s'il en a un) ; retenu seulement si l'adresse GitHub renvoyée
   * est la bonne, ou, faute d'adresse, si un seul profil sort avec le nom.
   */
  async searchByGithub(gh: GithubIdentity, signal?: AbortSignal): Promise<SearchResult> {
    const day = gh.createdAt?.slice(0, 10);
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { url: null, credits: 0 };
    const next = new Date(Date.parse(`${day}T00:00:00Z`) + 24 * 3600 * 1000).toISOString().slice(0, 10);
    const name = gh.name?.trim();
    const conditions: unknown[] = [
      { field: "dev_platform_profiles.metadata.created_at", type: "=>", value: day },
      { field: "dev_platform_profiles.metadata.created_at", type: "<", value: next },
    ];
    if (name) conditions.push({ field: "dev_platform_profiles.name", type: "=", value: name });
    const { res, json } = await this.post(
      "/person/search",
      {
        filters: { op: "and", conditions },
        fields: ["social_handles.professional_network_identifier.profile_url", "social_handles.dev_platform_identifier.profile_url"],
        limit: SEARCH_LIMIT,
      },
      signal,
    );
    if (!res.ok) throw new CrustdataError(res.status, `search ${res.status}`);
    const profiles = (Array.isArray((json as { profiles?: unknown })?.profiles) ? (json as { profiles: unknown[] }).profiles : []) as {
      social_handles?: { professional_network_identifier?: { profile_url?: unknown }; dev_platform_identifier?: { profile_url?: unknown } };
    }[];
    const credits = creditsOf(res, profiles.length * SEARCH_CREDITS_PER_RESULT);
    const urlOf = (p: (typeof profiles)[number]) => normalizeLinkedinUrl(p.social_handles?.professional_network_identifier?.profile_url);
    const exact = profiles.filter((p) => sameGithub(p.social_handles?.dev_platform_identifier?.profile_url, gh.login));
    if (exact.length === 1) return { url: urlOf(exact[0]!), credits };
    const unknown = profiles.filter((p) => !p.social_handles?.dev_platform_identifier?.profile_url);
    if (exact.length === 0 && name && profiles.length === 1 && unknown.length === 1) return { url: urlOf(unknown[0]!), credits };
    return { url: null, credits };
  }
}

/** Crustdata comme fournisseur de profils (LINKEDIN_PROVIDER=crustdata). */
export class CrustdataProvider implements LinkedinProvider {
  readonly name = "crustdata" as const;
  readonly timeoutMs: number;

  constructor(private readonly client: CrustdataClient) {
    this.timeoutMs = client.timeoutMs;
  }

  async fetchProfile(url: string, opts: { withGithub?: boolean; signal?: AbortSignal } = {}): Promise<ProviderResult> {
    const r = await this.client.enrich(url, opts);
    return { profile: r.profile, githubLogin: r.githubLogin, githubChecked: !!opts.withGithub };
  }
}

function deniedFields(json: unknown): string[] {
  const meta = (json as { error?: { metadata?: { denied_fields?: unknown }[] } } | null)?.error?.metadata;
  if (!Array.isArray(meta)) return [];
  return meta.flatMap((m) => (Array.isArray(m?.denied_fields) ? m.denied_fields.filter((f): f is string => typeof f === "string") : []));
}
