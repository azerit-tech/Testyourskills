// GET /api/search/github?q= (SPEC §18.80) : les comptes GitHub proposés sous le
// champ « Ton nom ou pseudo » (photo, pseudo, nom). Le serveur fait la recherche
// avec ses jetons, garde la réponse dix minutes et limite chaque IP. Jamais
// d'erreur : GitHub muet ou limite atteinte, la liste est vide et le pseudo
// tapé en entier marche toujours.

import type { Hono } from "hono";
import type { GithubSuggestion } from "../../../shared/entry";
import { searchGithubUsers, userQuery } from "../github/searchUsers";
import type { GithubAuth } from "../github/http";
import { clientIp, type RateLimiter } from "../ratelimit";

/** Recherches par IP et par jour (celles servies par le cache ne comptent pas). */
export const GITHUB_SEARCHES_PER_IP = 200;
export const GITHUB_SEARCH_TTL_MS = 10 * 60_000;
const CACHE_MAX = 2000;
/** Lignes proposées sous le champ. */
const SUGGESTIONS = 5;

export interface GithubSearchRoutesOptions {
  auth: GithubAuth;
  limiter: RateLimiter;
  /** La recherche elle-même ; les tests en donnent une fausse. */
  search?: (auth: GithubAuth, query: string) => Promise<GithubSuggestion[]>;
  now?: () => number;
}

export function mountGithubSearch(app: Hono, o: GithubSearchRoutesOptions) {
  const search = o.search ?? searchGithubUsers;
  const now = o.now ?? Date.now;
  const cache = new Map<string, { at: number; results: GithubSuggestion[] }>();
  const flights = new Map<string, Promise<GithubSuggestion[] | null>>();

  app.get("/api/search/github", async (c) => {
    c.header("Cache-Control", "private, max-age=300");
    const q = userQuery(c.req.query("q"));
    if (!q) return c.json({ results: [] });
    const key = q.toLowerCase();
    const hit = cache.get(key);
    if (hit && now() - hit.at < GITHUB_SEARCH_TTL_MS) return c.json({ results: hit.results });
    let flight = flights.get(key);
    if (!flight) {
      if (!o.limiter.take("gh-search", clientIp(c), GITHUB_SEARCHES_PER_IP)) {
        c.header("Cache-Control", "no-store");
        return c.json({ results: [] });
      }
      flight = search(o.auth, q)
        .then((found) => {
          const results = found.slice(0, SUGGESTIONS);
          // Le plus ancien sort d'abord : une Map garde l'ordre d'entrée.
          if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
          cache.delete(key);
          cache.set(key, { at: now(), results });
          return results;
        })
        .catch((err) => {
          console.warn("[github] recherche de comptes indisponible :", String((err as { code?: unknown; name?: unknown })?.code ?? (err as Error)?.name ?? "erreur"));
          return null;
        })
        .finally(() => flights.delete(key));
      flights.set(key, flight);
    }
    const results = await flight;
    if (!results) c.header("Cache-Control", "no-store");
    return c.json({ results: results ?? [] });
  });
}
