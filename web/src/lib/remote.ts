// Ce qu'une page attend du serveur (SPEC §18.48, « Erreurs ») : en attente, là,
// absent, ou en panne. « Absent » (404, 410) et « en panne » (réseau coupé, 5xx,
// quota, pas de réponse) ne se confondent jamais à l'écran : l'un dit
// « introuvable », l'autre « le commissariat ne répond pas » avec « Réessayer ».
import { useEffect, useState } from "react";
import { ApiError } from "./errors";

export type Remote<T> = { s: "wait" } | { s: "ok"; data: T } | { s: "none" } | { s: "down" };

/** Sans réponse au bout de ce délai, la page le dit ; une réponse tardive la remplace. */
export const REMOTE_PATIENCE_MS = 10_000;

/** Une erreur d'appel : « absent » pour un 404 ou un 410, « en panne » pour tout le reste. */
export function failureOf(err: unknown): "none" | "down" {
  return err instanceof ApiError && (err.status === 404 || err.status === 410) ? "none" : "down";
}

/**
 * Charge une ressource à l'ouverture, et de nouveau quand `deps` change.
 * `load` rend la donnée, null si elle n'existe pas, et lève une erreur en panne.
 */
export function useRemote<T>(load: () => Promise<T | null>, deps: readonly unknown[]): Remote<T> {
  const [state, setState] = useState<Remote<T>>({ s: "wait" });
  useEffect(() => {
    let alive = true;
    setState({ s: "wait" });
    const slow = window.setTimeout(() => alive && setState((v) => (v.s === "wait" ? { s: "down" } : v)), REMOTE_PATIENCE_MS);
    load()
      .then((data) => alive && setState(data === null ? { s: "none" } : { s: "ok", data }))
      .catch((err: unknown) => alive && setState({ s: failureOf(err) }))
      .finally(() => window.clearTimeout(slow));
    return () => {
      alive = false;
      window.clearTimeout(slow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
