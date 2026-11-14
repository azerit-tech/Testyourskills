// Les primes côté navigateur (§18.4, §18.5) : l'API, et un souvenir local, la
// ligue choisie sous la fiche (« Tu cherches un stage, une alternance… »).
// En mode démo (?mock=1), aucune prime : il n'en existe pas, on n'en invente pas.
import type { League, PrimeMe, PrimePageData, PrimeView, Race } from "../../../shared/primes";
import { isLeague } from "../../../shared/primes";
import { isMock } from "./api";
import { ApiError } from "./errors";

const JSON_HEADERS = { Accept: "application/json" };

async function errorOf(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { code?: string; message?: { fr: string; en: string } };
    return new ApiError(res.status, body.code ?? "internal", body.message && typeof body.message === "object" ? body.message : null);
  } catch {
    return new ApiError(res.status, res.status === 429 ? "rate_limited" : "internal", null);
  }
}

async function getJson<T>(url: string, fresh = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: JSON_HEADERS, ...(fresh ? { cache: "no-cache" as const } : {}) });
  } catch {
    throw new ApiError(0, "network", null);
  }
  if (!res.ok) throw await errorOf(res);
  return (await res.json()) as T;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...JSON_HEADERS }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "network", null);
  }
  if (!res.ok) throw await errorOf(res);
  return (await res.json()) as T;
}

export interface JoinBody {
  email: string;
  consent: boolean;
  adult: boolean;
  placeOk: boolean | null;
  proofs: string[];
}

const enc = encodeURIComponent;

export const primesApi = {
  /** Toutes les primes de la saison, ouvertes d'abord ; vide si le serveur ne répond pas. */
  async list(): Promise<PrimeView[]> {
    if (isMock()) return [];
    return getJson<{ primes: PrimeView[] }>("/api/primes")
      .then((r) => r.primes)
      .catch(() => []);
  },
  /**
   * La page d'une prime ; null si elle n'existe pas. Une panne réseau remonte en ApiError.
   * `fresh` : juste après une inscription ou un retrait, on revalide le cache de 30 s.
   */
  async page(id: string, fresh = false): Promise<PrimePageData | null> {
    if (isMock()) return null;
    try {
      return await getJson<PrimePageData>(`/api/primes/${enc(id)}`, fresh);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },
  /** La personne connectée face à cette prime ; null au moindre doute. */
  async me(id: string): Promise<PrimeMe | null> {
    if (isMock()) return null;
    return getJson<PrimeMe>(`/api/primes/${enc(id)}/me`).catch(() => null);
  },
  join(id: string, body: JoinBody): Promise<PrimeMe> {
    return post<PrimeMe>(`/api/primes/${enc(id)}/join`, body);
  },
  withdraw(id: string): Promise<PrimeMe> {
    return post<PrimeMe>(`/api/primes/${enc(id)}/withdraw`, {});
  },
  /** « Tu es en course » sous une fiche ; null si le serveur ne répond pas. */
  async race(cardId: string, league: League): Promise<Race | null> {
    if (isMock() || league === "fun") return null;
    return getJson<Race>(`/api/card/${enc(cardId)}/race?league=${league}`).catch(() => null);
  },
};

/* ---------- la ligue, gardée sur cet appareil ---------- */

const LEAGUE_KEY = "tys_league";

export function savedLeague(): League | null {
  try {
    const v = localStorage.getItem(LEAGUE_KEY);
    return isLeague(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveLeague(l: League | null) {
  try {
    if (l) localStorage.setItem(LEAGUE_KEY, l);
    else localStorage.removeItem(LEAGUE_KEY);
  } catch {
    /* stockage bloqué : la question reviendra */
  }
}
