// Le chargement du film (docs/cinematique-poursuite.md §5.3, §5.4) : chaque
// fichier chargé en entier (fetch puis Blob), une fois pour la page, un à la
// fois. La réponse se lit en flux : le débit se mesure sur les premiers Ko du
// premier fichier en variante haute, et sous ECO_BELOW_BPS la variante éco
// prend le relais (le fichier en cours est abandonné et repris en éco).
// Économiseur de données : éco d'emblée. Sans lecture en flux : le repli sur
// la connexion annoncée, sans mesure. La variante, une fois tranchée, ne
// change plus pour la page.
import { FILE_CEILINGS } from "../../../shared/film/budget";
import { isMock } from "../lib/api";
import { filmFileUrl, type FileId, type Quality } from "./files";
import { endingToLoad, initialVariant, probeVerdict, RateMeter } from "./net";

interface NetInfo {
  saveData?: boolean;
  effectiveType?: string;
}

/** Réglages de mise au point (développement et `?mock=1`) : `?film=gesture|missing|nocodec`. */
export function debugFlag(): string | null {
  if (!(import.meta.env.DEV || isMock())) return null;
  try {
    return new URLSearchParams(window.location.search).get("film");
  } catch {
    return null;
  }
}

export function filmUrl(id: FileId, q: Quality): string {
  // `?film=missing` : un fichier absent (404), pour vérifier le repli (la fiche sans révélation).
  return debugFlag() === "missing" ? `/film/absent-${id}-${q}.mp4` : filmFileUrl(id, q);
}

/** H.264 profil Main : sinon le film ne se lit pas et la fiche sort sans révélation. */
export function canPlayFilm(): boolean {
  if (debugFlag() === "nocodec") return false;
  try {
    return document.createElement("video").canPlayType('video/mp4; codecs="avc1.4D401F"') !== "";
  } catch {
    return false;
  }
}

const canStream = (): boolean => typeof ReadableStream !== "undefined" && typeof Response !== "undefined" && "body" in Response.prototype;

let variant: Quality | null = null;
/** La variante est tranchée : par l'économiseur, le repli sans flux, ou la mesure. */
let decided = false;

function startVariant(): Quality {
  if (variant === null) {
    const c = (navigator as Navigator & { connection?: NetInfo }).connection;
    const stream = canStream();
    variant = initialVariant({ saveData: !!c?.saveData, effectiveType: c?.effectiveType, canStream: stream });
    decided = variant === "540" || !stream;
  }
  return variant;
}

/** La variante de la page (haute tant que la mesure ne l'a pas fait abandonner). */
export function filmVariant(): Quality {
  return startVariant();
}

interface Job {
  id: FileId;
  q: Quality;
  loaded: number;
  /** Content-Length, s'il est donné. */
  total: number | null;
  done: boolean;
  /** Demandé, puis entièrement reçu (horloge de la page, ms). */
  startedAt: number | null;
  doneAt: number | null;
  ctrl: AbortController;
  promise: Promise<string>;
}

/** La variante haute abandonnée en cours de fichier : il est repris en éco. */
class VariantSwitch extends Error {}

const jobs = new Map<string, Job>();
const meter = new RateMeter();
let queue: Promise<unknown> = Promise.resolve();
let firstStart: number | null = null;

const keyOf = (id: FileId, q: Quality) => `${id}-${q}`;

async function download(j: Job): Promise<string> {
  if (j.ctrl.signal.aborted) throw new DOMException("film: abandonné", "AbortError");
  // la variante a été tranchée pendant l'attente dans la file : un fichier de l'autre ne sert plus
  if (decided && j.q !== variant) throw new VariantSwitch();
  firstStart ??= performance.now();
  j.startedAt = performance.now();
  const url = filmUrl(j.id, j.q);
  const r = await fetch(url, { priority: "low", signal: j.ctrl.signal } as RequestInit);
  // une page HTML servie à la place (repli d'une application) n'est pas un film
  const type = r.headers.get("content-type") ?? "";
  if (!r.ok || /text\/html/i.test(type)) throw new Error(`film ${r.status} ${url}`);
  const len = Number(r.headers.get("content-length"));
  j.total = Number.isFinite(len) && len > 0 && !r.headers.get("content-encoding") ? len : null;
  const t0 = performance.now();
  const reader = r.body?.getReader?.();
  // sans lecture en flux, rien n'arrive par morceaux : le fichier compte une fois fini
  if (reader) meter.begin(t0);
  try {
    let blob: Blob;
    if (!reader) {
      // sans lecture en flux : en un bloc, sans mesure de la variante
      blob = await r.blob();
      j.loaded = blob.size;
      meter.record(blob.size, performance.now() - t0);
    } else {
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        // abandonné (la fin qui ne jouera pas) : la file passe au suivant sans attendre la fin du flux
        if (j.ctrl.signal.aborted) {
          void reader.cancel().catch(() => undefined);
          throw new DOMException("film: abandonné", "AbortError");
        }
        const now = performance.now();
        if (value) {
          chunks.push(value);
          j.loaded += value.byteLength;
          meter.add(value.byteLength, now);
        }
        if (!decided && j.q === "720") {
          const v = probeVerdict(j.loaded, now - t0, done);
          if (v !== "pending") {
            decided = true;
            if (v === "eco") {
              variant = "540";
              void reader.cancel().catch(() => undefined);
              j.ctrl.abort();
              throw new VariantSwitch();
            }
          }
        }
        if (done) break;
      }
      blob = new Blob(chunks as BlobPart[], { type: "video/mp4" });
    }
    j.done = true;
    j.doneAt = performance.now();
    return URL.createObjectURL(blob.type.startsWith("video/") ? blob : new Blob([blob], { type: "video/mp4" }));
  } finally {
    meter.end(performance.now());
  }
}

/** Un fichier, chargé une fois pour la page dans la variante donnée : son adresse blob. */
function fetchOne(id: FileId, q: Quality): Promise<string> {
  const key = keyOf(id, q);
  const had = jobs.get(key);
  if (had) return had.promise;
  const j: Job = { id, q, loaded: 0, total: null, done: false, startedAt: null, doneAt: null, ctrl: new AbortController(), promise: Promise.resolve("") };
  // un à la fois : la poursuite d'abord, elle a toute la bande
  const run = queue.then(() => download(j));
  queue = run.catch(() => undefined);
  j.promise = run;
  jobs.set(key, j);
  // un échec se retente à la fiche suivante
  run.catch(() => {
    if (jobs.get(key) === j) jobs.delete(key);
  });
  return run;
}

/**
 * Les fichiers demandés, tous dans la même variante : si la mesure fait
 * passer en éco en cours de route, ils sont repris en éco.
 */
export async function loadFilmFiles(ids: FileId[]): Promise<{ urls: string[]; quality: Quality }> {
  for (;;) {
    const q = startVariant();
    try {
      const urls: string[] = [];
      // dans l'ordre : chaque fichier entre dans la file après le précédent
      for (const id of ids) urls.push(await fetchOne(id, q));
      if (variant === q) return { urls, quality: q };
    } catch (e) {
      if (!(e instanceof VariantSwitch) && variant === q) throw e;
    }
  }
}

/** Arrête et oublie un fichier devenu inutile (la fin qui ne jouera pas). */
export function dropFilmFile(id: FileId): void {
  for (const q of ["720", "540"] as Quality[]) {
    const j = jobs.get(keyOf(id, q));
    if (!j || j.done) continue;
    j.ctrl.abort();
    jobs.delete(keyOf(id, q));
  }
}

/**
 * Les octets qui manquent aux fichiers donnés, dans la variante de la page :
 * Content-Length moins le reçu, ou le plafond du fichier (§4.1) tant qu'il
 * n'a pas donné sa taille ou pas commencé.
 */
export function filmRemaining(ids: FileId[]): number {
  const q = startVariant();
  let n = 0;
  for (const id of ids) {
    const j = jobs.get(keyOf(id, q));
    if (j?.done) continue;
    n += Math.max(0, (j?.total ?? FILE_CEILINGS[q][id]) - (j?.loaded ?? 0));
  }
  return n;
}

/**
 * La durée de chargement des fichiers donnés, dans la variante de la page :
 * la somme, fichier par fichier, de la demande au dernier octet (le temps
 * passé à attendre la fiche entre deux fichiers n'en est pas). Null tant
 * qu'un des fichiers n'est pas entièrement là.
 */
export function filmLoadMs(ids: FileId[]): number | null {
  const q = startVariant();
  let ms = 0;
  for (const id of ids) {
    const j = jobs.get(keyOf(id, q));
    if (!j?.done || j.startedAt === null || j.doneAt === null) return null;
    ms += j.doneAt - j.startedAt;
  }
  return ms;
}

/** Les octets reçus par le film sur cette page, et le débit mesuré (bits par seconde). */
export function filmNet(): { bytes: number; bps: number | null; firstStart: number | null } {
  return { bytes: meter.bytes, bps: meter.bps(performance.now()), firstStart };
}

/**
 * Dès le premier contact avec le formulaire, puis pendant l'attente (§5.4) :
 * la poursuite, puis la fin la plus probable, en basse priorité. Avec le
 * niveau (la fiche est prête) : seule la fin utile, l'autre est abandonnée.
 */
export function preloadFilm(level?: number): void {
  if (!canPlayFilm()) return;
  const { load, drop } = endingToLoad(level);
  if (drop) dropFilmFile(drop);
  void loadFilmFiles(["poursuite", load]).catch(() => undefined);
}
