// GET /api/search/linkedin?q= (SPEC §18.80) : les profils LinkedIn proposés sous
// le champ « Ton nom ». Jamais d'erreur : sans fournisseur, plafond du jour
// atteint ou limite de l'IP, la réponse dit `off` et le champ redevient celui où
// l'on colle un lien, sans message.

import type { Hono } from "hono";
import { SUGGEST_MIN_CHARS, type LinkedinSuggestion } from "../../../shared/entry";
import { SEARCHES_PER_IP, type LinkedinCandidate, type LinkedinPeople } from "../linkedinProfile/search";
import { clientIp, type RateLimiter } from "../ratelimit";

/** Lignes proposées sous le champ. */
export const SUGGESTIONS = 5;

/** Les photos ne sont montrées que servies par LinkedIn, en HTTPS. */
export function licdnPhoto(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(^|\.)licdn\.com$/i.test(u.hostname) ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Ce que le front reçoit d'un candidat : rien que ce que la ligne affiche. */
export function toSuggestion(c: LinkedinCandidate): LinkedinSuggestion {
  const photo = licdnPhoto(c.photoUrl);
  return { url: c.url, name: c.name, headline: c.headline, ...(photo ? { photo } : {}) };
}

export interface LinkedinSearchRoutesOptions {
  /** Absent : pas de fournisseur de recherche, la route répond `off`. */
  people?: LinkedinPeople;
  limiter: RateLimiter;
}

export function mountLinkedinSearch(app: Hono, o: LinkedinSearchRoutesOptions) {
  app.get("/api/search/linkedin", async (c) => {
    c.header("Cache-Control", "private, max-age=300");
    const q = (c.req.query("q") ?? "").trim();
    if (!o.people) return c.json({ results: [], off: true });
    if (q.length < SUGGEST_MIN_CHARS || q.length > 80) return c.json({ results: [] });
    const ip = clientIp(c);
    const found = await o.people.byName(q, { spend: () => o.limiter.take("li-search", ip, SEARCHES_PER_IP) });
    if (found.status === "off") {
      c.header("Cache-Control", "no-store");
      return c.json({ results: [], off: true });
    }
    if (found.status === "short") return c.json({ results: [] });
    return c.json({ results: found.results.slice(0, SUGGESTIONS).map(toSuggestion) });
  });
}
