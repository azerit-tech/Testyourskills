// Petit routeur sur l'API history : un chemin, des écouteurs, rien de plus.
import { useSyncExternalStore } from "react";
import { isReservedSegment, isUpcomingPath } from "../../../shared/routes";
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

/** État attaché à l'entrée d'historique courante (ex. pré-remplissage). */
export function historyState<T>(): T | null {
  return (window.history.state as T) ?? null;
}

export function navigate(to: string, opts: { replace?: boolean; state?: unknown; keepScroll?: boolean } = {}) {
  // On garde la query (?mock=1) pour ne pas perdre le mode démo en route.
  const url = to.includes("?") ? to : to + window.location.search;
  if (opts.replace) window.history.replaceState(opts.state ?? null, "", url);
  else window.history.pushState(opts.state ?? null, "", url);
  if (!opts.keepScroll) window.scrollTo({ top: 0 });
  notify();
}

/** Clic gauche simple sur un lien interne : on navigue sans recharger. */
export function onLinkClick(e: React.MouseEvent<HTMLAnchorElement>, to: string) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navigate(to);
}

export type Route =
  | { kind: "home" }
  | { kind: "card"; id: string }
  | { kind: "privacy" }
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
  if (isUpcomingPath(path)) return { kind: "upcoming" };
  // /{pseudo} : la carte sans champ (§6.1).
  const direct = /^\/([^/]+)\/?$/.exec(path);
  const login = direct ? parseLogin(safeDecode(direct[1])) : null;
  if (login && !isReservedSegment(login)) return { kind: "direct", login };
  return { kind: "notFound" };
}
