// GET /api/search/linkedin?q= (SPEC §18.80) : les profils LinkedIn proposés sous
// le champ « Ton nom ». Jamais d'erreur : sans fournisseur, plafond du jour
// atteint ou limite de l'IP, la réponse dit `off` et le champ redevient celui où
// l'on colle un lien, sans message. « florent delorme criteo » : le nom, puis un
// mot-clé qui départage les homonymes (§18.112).

import type { Hono } from "hono";
import { SUGGEST_MIN_CHARS, type LinkedinSuggestion } from "../../../shared/entry";
import { mergeCandidates, rankByContext, SEARCHES_PER_IP, type LinkedinCandidate, type LinkedinPeople } from "../linkedinProfile/search";
import { splitTyped } from "../names";
import type { Namesake } from "../registry/index";
import { clientIp, type RateLimiter } from "../ratelimit";

/** Lignes proposées sous le champ. */
export const SUGGESTIONS = 5;
/** Recherches dans la base de l'App par IP et par jour (§18.96) : gratuites, mais on n'énumère pas ses profils. */
export const APP_SEARCHES_PER_IP = 600;

/** Un profil de l'App qui a un nom → une ligne proposée (ni photo, ni rien d'autre). */
export const namesakeCandidates = (list: Namesake[]): LinkedinCandidate[] => list.flatMap((n) => (n.name ? [{ url: n.url, name: n.name, headline: n.headline }] : []));

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
  /** Absent : pas de fournisseur de recherche web. */
  people?: LinkedinPeople;
  /**
   * Les profils de l'App Azerit à ce nom (§18.96), en tête ; 300 ms au plus. `partial` : le dernier
   * mot est en cours de frappe ; sans, le nom est complet (un mot-clé le suit, §18.112).
   */
  namesakes?: (name: string, o: { partial: boolean }) => Promise<Namesake[]>;
  limiter: RateLimiter;
}

export function mountLinkedinSearch(app: Hono, o: LinkedinSearchRoutesOptions) {
  app.get("/api/search/linkedin", async (c) => {
    c.header("Cache-Control", "private, max-age=300");
    const q = (c.req.query("q") ?? "").trim();
    if (!o.people && !o.namesakes) return c.json({ results: [], off: true });
    if (q.length < SUGGEST_MIN_CHARS || q.length > 80) return c.json({ results: [] });
    const ip = clientIp(c);
    const { name, context } = splitTyped(q);
    // L'App et le web en même temps : la base répond en quelques millisecondes, le web en une seconde.
    // L'App ne cherche que le nom : le mot-clé classe ensuite ses profils comme ceux du web.
    const baseP = o.namesakes && o.limiter.take("li-app", ip, APP_SEARCHES_PER_IP) ? o.namesakes(name, { partial: !context }).catch(() => []) : Promise.resolve([]);
    const found = o.people ? await o.people.byName(name, { context, spend: () => o.limiter.take("li-search", ip, SEARCHES_PER_IP) }) : ({ status: "off" } as const);
    const base = namesakeCandidates(await baseP);
    if (found.status === "off" && !base.length) {
      c.header("Cache-Control", "no-store");
      return c.json({ results: [], off: true });
    }
    const web = found.status === "ok" ? found.results : [];
    return c.json({ results: rankByContext(mergeCandidates(base, web), context).slice(0, SUGGESTIONS).map(toSuggestion) });
  });
}
