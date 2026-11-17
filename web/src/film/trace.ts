// La trace du film, pour la mise au point sur un vrai téléphone : `?filmtrace=1`
// (en production comme en `?mock=1`), lu au chargement de la page et gardé pour
// l'onglet (`?filmtrace=0` l'éteint). Ce module est dans le paquet de l'accueil
// et ne fait rien sans le paramètre : ni écouteur, ni requête. Avec lui,
// l'enregistreur (traceRecorder.ts) se charge à part : les événements de la
// balise, un instantané toutes les 250 ms tant que le film est monté, les
// étapes de Film.tsx, un calque à l'écran, et l'envoi par lots à
// POST /api/film-trace (le serveur avec FILM_TRACE=1). Rien de la fiche ni de
// la personne n'y entre.
import type { FilmStats } from "./player";

const KEY = "tys-filmtrace";

/** Ce que le film monté laisse lire à l'enregistreur. */
export interface FilmProbe {
  stats(): FilmStats;
  /** Le plan joué : durées seulement (images), jamais la fiche. */
  plan: { duration: number; cut: number; level: number };
}

export interface TraceRecorder {
  step(s: string, data: Record<string, unknown> | undefined, at: number): void;
  mount(probe: FilmProbe): void;
  unmount(probe: FilmProbe): void;
}

let on = false;
let t0 = 0;
let rec: TraceRecorder | null = null;
/** Les étapes arrivées avant l'enregistreur, avec leur instant. */
const early: Array<[string, Record<string, unknown> | undefined, number]> = [];
let mounted: FilmProbe | null = null;

/** Au chargement de la page (main.tsx), avant le premier rendu. */
export function initFilmTrace(): void {
  let q: string | null = null;
  try {
    q = new URLSearchParams(window.location.search).get("filmtrace");
  } catch {
    return;
  }
  try {
    if (q === "1") sessionStorage.setItem(KEY, "1");
    if (q === "0") sessionStorage.removeItem(KEY);
    on = q === "1" || sessionStorage.getItem(KEY) === "1";
  } catch {
    on = q === "1";
  }
  if (!on) return;
  t0 = performance.now();
  void import("./traceRecorder").then(
    (m) => {
      const r = m.startRecorder(t0);
      for (const [s, d, at] of early.splice(0)) r.step(s, d, at);
      if (mounted) r.mount(mounted);
      rec = r;
    },
    () => {
      on = false;
    },
  );
}

export function filmTraceOn(): boolean {
  return on;
}

/** Une étape (Film.tsx, l'attente, la page de la fiche). Sans trace : rien. */
export function filmTrace(s: string, data?: Record<string, unknown>): void {
  if (!on) return;
  const at = performance.now();
  if (rec) rec.step(s, data, at);
  else early.push([s, data, at]);
}

/** Le film est monté : les instantanés commencent. La fonction rendue les arrête. */
export function filmTraceMount(probe: FilmProbe): () => void {
  if (!on) return () => undefined;
  mounted = probe;
  rec?.mount(probe);
  return () => {
    if (mounted === probe) mounted = null;
    rec?.unmount(probe);
  };
}
