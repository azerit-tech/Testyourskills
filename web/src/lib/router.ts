// Petit routeur sur l'API history : un chemin, des écouteurs, rien de plus.
import { useSyncExternalStore } from "react";
import { isReservedSegment, isUpcomingPath, RANKING_ANCHOR } from "../../../shared/routes";
import { parseLogin } from "./util";

const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", notify);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function usePath(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => "/",
  );
}

/** L'adresse d'arrivée : la requête en cours (?mock=1, ?lang=) recopiée, toujours avant l'ancre (« /?mock=1#semaine »). */
export function withQuery(to: string, search: string): string {
  if (to.includes("?") || !search) return to;
  const i = to.indexOf("#");
  return i < 0 ? to + search : to.slice(0, i) + search + to.slice(i);
}

export function navigate(to: string, opts: { replace?: boolean; state?: unknown; keepScroll?: boolean } = {}) {
  // On garde la query (?mock=1) pour ne pas perdre le mode démo en route.
  const url = withQuery(to, window.location.search);
  if (opts.replace) window.history.replaceState(opts.state ?? null, "", url);
  else window.history.pushState(opts.state ?? null, "", url);
  if (!opts.keepScroll) window.scrollTo({ top: 0 });
  notify();
}

/** Un clic que le navigateur garde pour lui (nouvel onglet), ou déjà traité. */
const ownClick = (e: React.MouseEvent<HTMLAnchorElement>) => e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;

/** Clic gauche simple sur un lien interne : on navigue sans recharger. */
export function onLinkClick(e: React.MouseEvent<HTMLAnchorElement>, to: string) {
  if (ownClick(e)) return;
  e.preventDefault();
  navigate(to);
}

/** Le classement des écoles et des boîtes, sur l'accueil (§18.101). */
export const RANKING_HREF = `/#${RANKING_ANCHOR}`;

/** L'ancre de l'adresse en cours, sans la requête qu'un partage a pu coller derrière (« #semaine?x »). */
export const currentAnchor = () => window.location.hash.slice(1).split("?")[0];

/**
 * « Classement » : sur l'accueil, on y descend ; ailleurs, l'accueil s'ouvre sur l'ancre et y
 * descend lui-même une fois posé (Home.tsx).
 */
export function goRanking(e?: React.MouseEvent<HTMLAnchorElement>) {
  if (e) {
    if (ownClick(e)) return;
    e.preventDefault();
  }
  if (window.location.pathname !== "/") return navigate(RANKING_HREF);
  window.history.pushState(null, "", withQuery(RANKING_HREF, window.location.search));
  const reduced = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(RANKING_ANCHOR)?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
}

export type Route =
  | { kind: "home" }
  | { kind: "card"; id: string }
  | { kind: "privacy" }
  | { kind: "credits" }
  /** Les anciennes adresses des bandes (/bandes, /bandes/…) : le classement de l'accueil (§18.101). */
  | { kind: "ranking" }
  /** Les primes (§18.4) et le règlement : la saison décide de les montrer (App.tsx). */
  | { kind: "primes" }
  | { kind: "prime"; id: string }
  | { kind: "rules" }
  | { kind: "direct"; login: string }
  /** Page à venir (§18.27) : retour à l'accueil, jamais de fiche. */
  | { kind: "upcoming" }
  | { kind: "notFound" };

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Ce que montre un chemin. Un mot réservé (shared/routes.ts) n'est jamais un pseudo. */
export function routeOf(path: string): Route {
  const card = /^\/c\/([A-Za-z0-9_-]+)\/?$/.exec(path);
  if (card) return { kind: "card", id: card[1] };
  if (path === "/" || path === "") return { kind: "home" };
  if (/^\/(confidentialite|privacy)\/?$/.test(path)) return { kind: "privacy" };
  if (/^\/credits\/?$/.test(path)) return { kind: "credits" };
  if (/^\/bandes(\/|$)/i.test(path)) return { kind: "ranking" };
  if (/^\/primes\/?$/i.test(path)) return { kind: "primes" };
  const prime = /^\/primes\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(path);
  if (prime) return { kind: "prime", id: prime[1] };
  if (/^\/primes\//i.test(path)) return { kind: "primes" };
  if (/^\/reglement\/?$/i.test(path)) return { kind: "rules" };
  if (isUpcomingPath(path)) return { kind: "upcoming" };
  // /{pseudo} : la carte sans champ (§6.1).
  const direct = /^\/([^/]+)\/?$/.exec(path);
  const login = direct ? parseLogin(safeDecode(direct[1])) : null;
  if (login && !isReservedSegment(login)) return { kind: "direct", login };
  return { kind: "notFound" };
}
