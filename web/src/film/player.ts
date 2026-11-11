// Le lecteur du film (§18.36, docs/cinematique-poursuite.md §5.2 à §5.6) : deux
// balises <video muted playsinline> (unlock.ts), A pour la poursuite (toujours
// le fichier entier, six étoiles), B pour la fin (`fin` ou `fin6`), chargées en
// entier avant de jouer (fetch puis Blob). L'horloge du film est celle de la
// vidéo : t = image présentée de A, puis coupe + image présentée de B, puis
// l'horloge du navigateur pour le gel et le flash. Le HUD ne peut pas se
// décaler de l'image. La coupe au niveau : quand A présente la dernière image
// du dernier plan joué, l'encre la couvre, A s'arrête, B part et passe devant ;
// l'encre reste jusqu'à la première image de B (deux images au plus).
import { FPS, type EndingId, type FilmPlan } from "../../../shared/film";
import { isMock } from "../lib/api";
import { filmUnlocks, filmVideos } from "./unlock";

export type Quality = "720" | "540";
type FileId = "poursuite" | EndingId;

interface NetInfo {
  saveData?: boolean;
  effectiveType?: string;
}

/** Réglages de mise au point (développement et `?mock=1`) : `?film=gesture|missing|nocodec`. */
function debugFlag(): string | null {
  if (!(import.meta.env.DEV || isMock())) return null;
  try {
    return new URLSearchParams(window.location.search).get("film");
  } catch {
    return null;
  }
}

/** 540p si l'économiseur de données est mis, ou si la connexion annoncée est lente. */
export function filmQuality(): Quality {
  const c = (navigator as Navigator & { connection?: NetInfo }).connection;
  if (c?.saveData) return "540";
  if (c?.effectiveType && /^(slow-2g|2g|3g)$/.test(c.effectiveType)) return "540";
  return "720";
}

export function filmUrl(id: FileId, q: Quality): string {
  // `?film=missing` : un fichier absent (404), pour vérifier le repli (la fiche sans révélation).
  return debugFlag() === "missing" ? `/film/absent-${id}-${q}.mp4` : `/film/${id}-${q}.mp4`;
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

const blobs = new Map<string, Promise<string>>();
let bytes = 0;

/** Un fichier chargé en entier, une fois pour la page : son adresse blob. */
function fetchBlob(url: string): Promise<string> {
  let p = blobs.get(url);
  if (!p) {
    p = fetch(url, { priority: "low" } as RequestInit).then(async (r) => {
      // une page HTML servie à la place (repli d'une application) n'est pas un film
      const type = r.headers.get("content-type") ?? "";
      if (!r.ok || /text\/html/i.test(type)) throw new Error(`film ${r.status} ${url}`);
      const blob = await r.blob();
      bytes += blob.size;
      return URL.createObjectURL(blob.type.startsWith("video/") ? blob : new Blob([blob], { type: "video/mp4" }));
    });
    blobs.set(url, p);
    // un échec se retente à la fiche suivante
    p.catch(() => blobs.delete(url));
  }
  return p;
}

/**
 * Dès l'attente (§5.4) : la poursuite puis la fin, en basse priorité. Avec le
 * niveau (la fiche est prête) : la fin à six étoiles si elle en a six.
 */
export function preloadFilm(level?: number): void {
  if (!canPlayFilm()) return;
  const q = filmQuality();
  void fetchBlob(filmUrl("poursuite", q))
    .then(() => fetchBlob(filmUrl(level === 6 ? "fin6" : "fin", q)))
    .catch(() => undefined);
}

export interface FilmStats {
  /** Images perdues par le décodeur (getVideoPlaybackQuality), les deux balises. */
  dropped: number;
  /** Images décodées. */
  decoded: number;
  /** Images sautées à l'affichage pendant la lecture (trous dans les images présentées). */
  skipped: number;
  /** Images de A au-delà de la coupe présentées avant l'encre (0 attendu). */
  leaked: number;
  /** Bascule poursuite → fin : de l'encre (à la dernière image de A) à la première image de B (ms). */
  switchMs: number | null;
  /** De l'ordre de lecture à la première image qui bouge (ms). */
  startMs: number | null;
  /** Octets chargés par le film sur cette page. */
  bytes: number;
  quality: Quality;
  /** requestVideoFrameCallback disponible (suivi image par image). */
  frameCallbacks: boolean;
  /** L'instant du film. */
  t: number;
}

export interface FilmPlayer {
  /** Charge, place les deux balises sur leur première image, et dit si la lecture demande un geste. */
  prepare(): Promise<"ready" | "gesture">;
  /** Lance ou reprend la lecture (sans effet si tenu, onglet caché ou film fini). */
  play(): void;
  /** Arrête la lecture (onglet caché). */
  pause(): void;
  seek(t: number): void;
  hold(on: boolean): void;
  time(): number;
  stats(): FilmStats;
  dispose(): void;
}

interface Options {
  plan: FilmPlan;
  /** Le cadre du film : les deux balises y sont posées. */
  host: HTMLElement;
  /** Le cache d'encre de la bascule, piloté sans attendre React. */
  cover: HTMLElement;
  /** À chaque rafraîchissement pendant la lecture, et à chaque seek. */
  onTime(t: number): void;
}

type Mode = "chase" | "ending" | "tail";
type FrameMeta = { mediaTime: number; expectedDisplayTime: number };
type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback(cb: (now: number, meta: FrameMeta) => void): number;
  cancelVideoFrameCallback(id: number): void;
};

const FRAME_MS = 1000 / FPS;
/** Le gel part un peu avant la fin prévue de la dernière image de la fin : elle reste à l'écran. */
const TAIL_LEAD_MS = 12;

const once = (v: HTMLVideoElement, ok: string, ms = 8000) =>
  new Promise<void>((resolve, reject) => {
    const done = () => {
      clean();
      resolve();
    };
    const fail = () => {
      clean();
      reject(new Error(`film: ${ok} manqué`));
    };
    const timer = window.setTimeout(fail, ms);
    const clean = () => {
      window.clearTimeout(timer);
      v.removeEventListener(ok, done);
      v.removeEventListener("error", fail);
    };
    v.addEventListener(ok, done);
    v.addEventListener("error", fail);
  });

const twoFrames = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

export function createFilmPlayer({ plan, host, cover, onTime }: Options): FilmPlayer {
  const [a, b] = filmVideos() as [FrameVideo, FrameVideo];
  const q = filmQuality();
  const rvfc = typeof a.requestVideoFrameCallback === "function";
  const simulateRefusal = debugFlag() === "gesture";
  const unlocksAtStart = filmUnlocks();
  const cutT = plan.cut / FPS;
  const tailFromT = (plan.cut + plan.endVideo) / FPS;

  let mode: Mode = "chase";
  let running = false;
  let held = false;
  let disposed = false;
  let over = false;
  /** L'instant affiché quand rien ne tourne. */
  let pinned = 0;
  /** Image présentée (arrondie à l'image) de chaque balise. */
  let aShown = 0;
  let bShown = 0;
  let aLastK = -1;
  let bLastK = -1;
  let skipped = 0;
  /** Images de A au-delà de la coupe présentées avant la bascule (doit rester 0). */
  let leaked = 0;
  /** Horloge de l'écran (ms) : quand geler. */
  let tailAt = 0;
  let tailBase = tailFromT;
  let tailSince = 0;
  let raf = 0;
  let aCb = 0;
  let bCb = 0;
  let switchFrom = 0;
  let switchMs: number | null = null;
  let playFrom = 0;
  let playK = 0;
  let startMs: number | null = null;

  for (const v of [a, b]) {
    v.className = "film-video";
    v.style.visibility = "hidden";
  }
  host.prepend(a, b);

  const show = (which: "chase" | "ending") => {
    a.style.visibility = which === "chase" ? "visible" : "hidden";
    b.style.visibility = which === "ending" ? "visible" : "hidden";
  };
  const place = (v: HTMLVideoElement, frame: number) => {
    // le milieu de l'image : jamais d'ambiguïté sur l'image affichée
    v.currentTime = (Math.max(0, frame) + 0.5) / FPS;
  };
  const coverOn = (on: boolean) => {
    cover.style.opacity = on ? "1" : "0";
  };

  const tryPlay = (v: HTMLVideoElement): Promise<void> => {
    if (simulateRefusal && filmUnlocks() === unlocksAtStart) {
      return Promise.reject(Object.assign(new Error("lecture refusée (simulée)"), { name: "NotAllowedError" }));
    }
    return v.play();
  };

  /** Erreur de lecture en cours de film (§5.5) : flash immédiat, la fiche se pose. */
  const flashNow = () => {
    if (disposed || over || mode === "tail") return;
    mode = "tail";
    a.pause();
    b.pause();
    coverOn(false);
    tailBase = Math.max(time(), plan.flash.from / FPS);
    tailSince = performance.now();
    if (!running) pinned = tailBase;
  };
  const playVideo = (v: HTMLVideoElement) => {
    tryPlay(v).catch((e: unknown) => {
      if (disposed || (e as { name?: string })?.name === "AbortError") return;
      flashNow();
    });
  };

  const watchA = () => {
    if (!rvfc || disposed) return;
    aCb = a.requestVideoFrameCallback((_now, md) => {
      if (disposed) return;
      const k = Math.round(md.mediaTime * FPS);
      if (running && mode === "chase") {
        if (aLastK >= 0 && k > aLastK + 1) skipped += k - aLastK - 1;
        if (startMs === null && playFrom && k > playK) startMs = Math.max(0, md.expectedDisplayTime - playFrom);
        // La coupe dès que la dernière image du plan est présentée : l'encre est
        // posée dans ce même rafraîchissement, avant que A n'ait pu présenter le
        // plan suivant (A en garde une image d'avance, même en pause).
        if (k >= plan.cut - 1) {
          if (k >= plan.cut) leaked++;
          aLastK = k;
          aShown = (plan.cut - 1) / FPS;
          toEnding(md.expectedDisplayTime);
          watchA();
          return;
        }
      }
      aLastK = k;
      aShown = k / FPS;
      watchA();
    });
  };
  const watchB = () => {
    if (!rvfc || disposed) return;
    bCb = b.requestVideoFrameCallback((_now, md) => {
      if (disposed) return;
      const k = Math.round(md.mediaTime * FPS);
      if (running && mode === "ending") {
        if (bLastK >= 0 && k > bLastK + 1) skipped += k - bLastK - 1;
        if (switchMs === null && switchFrom) {
          switchMs = Math.max(0, md.expectedDisplayTime - switchFrom);
          coverOn(false);
        }
        if (!tailAt && k >= plan.endVideo - 1) tailAt = md.expectedDisplayTime + FRAME_MS;
      }
      bLastK = k;
      bShown = k / FPS;
      watchB();
    });
  };

  function time(now = performance.now()): number {
    if (!running) return pinned;
    if (mode === "chase") return rvfc ? aShown : a.currentTime;
    if (mode === "ending") return cutT + (rvfc ? bShown : b.currentTime);
    return tailBase + (now - tailSince) / 1000;
  }

  /** La coupe (`from` : l'instant où l'encre paraît) : l'encre d'abord, A s'arrête, B part et passe devant. */
  const toEnding = (from: number) => {
    coverOn(true);
    a.pause();
    mode = "ending";
    bShown = 0;
    bLastK = -1;
    switchFrom = from;
    show("ending");
    playVideo(b);
    if (!rvfc) {
      const onPlaying = () =>
        requestAnimationFrame(() => {
          if (switchMs === null) switchMs = performance.now() - switchFrom;
          coverOn(false);
        });
      b.addEventListener("playing", onPlaying, { once: true });
    }
  };
  const toTail = (now: number) => {
    mode = "tail";
    b.pause();
    if (b.currentTime > (plan.endVideo - 0.5) / FPS) place(b, plan.endVideo - 1);
    tailBase = tailFromT;
    tailSince = rvfc && tailAt ? Math.min(now, tailAt) : now;
    coverOn(false);
  };

  const tick = (now: number) => {
    raf = 0;
    if (!running || disposed) return;
    if (mode === "chase") {
      // sans suivi image par image : au début de la dernière image du plan
      if (a.ended || (!rvfc && a.currentTime >= (plan.cut - 1) / FPS)) toEnding(now);
    } else if (mode === "ending") {
      const due = rvfc ? tailAt > 0 && now >= tailAt - TAIL_LEAD_MS : b.currentTime >= (plan.endVideo - 0.5) / FPS;
      if (due || b.ended) toTail(now);
    }
    const t = time(now);
    if (t >= plan.duration) {
      over = true;
      running = false;
      pinned = plan.duration;
      onTime(plan.duration);
      return;
    }
    onTime(t);
    raf = requestAnimationFrame(tick);
  };

  function pause() {
    if (!running) return;
    pinned = time();
    running = false;
    a.pause();
    b.pause();
    if (mode === "tail") tailBase = pinned;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    onTime(pinned);
  }

  function play() {
    if (running || held || disposed || over || document.hidden) return;
    running = true;
    const now = performance.now();
    if (mode === "chase") {
      if (!playFrom) {
        playFrom = now;
        playK = Math.round(a.currentTime * FPS);
      }
      playVideo(a);
    } else if (mode === "ending") playVideo(b);
    else tailSince = now;
    if (!raf) raf = requestAnimationFrame(tick);
  }

  return {
    async prepare() {
      if (!canPlayFilm()) throw new Error("film: H.264 illisible");
      const [srcA, srcB] = await Promise.all([fetchBlob(filmUrl("poursuite", q)), fetchBlob(filmUrl(plan.ending, q))]);
      if (disposed) throw new Error("film: abandonné");
      for (const [v, src] of [[a, srcA], [b, srcB]] as const) {
        if (v.getAttribute("src") !== src) {
          v.src = src;
          v.load();
        }
      }
      await Promise.all([a, b].map((v) => (v.readyState >= 2 ? Promise.resolve() : once(v, "loadeddata"))));
      // La lecture sans geste est-elle permise ? (iPhone en économie d'énergie : non.)
      let gesture = false;
      for (const v of [a, b]) {
        try {
          await tryPlay(v);
        } catch (e) {
          if ((e as { name?: string })?.name !== "NotAllowedError") throw e;
          gesture = true;
        }
        v.pause();
      }
      if (disposed) throw new Error("film: abandonné");
      place(a, 0);
      place(b, 0);
      await Promise.all([a, b].map((v) => (v.seeking ? once(v, "seeked") : Promise.resolve())));
      show("chase");
      watchA();
      watchB();
      await twoFrames();
      return gesture ? "gesture" : "ready";
    },
    play,
    pause,
    seek(t: number) {
      const T = Math.min(Math.max(0, t), plan.duration);
      const f = Math.floor(T * FPS + 1e-6);
      tailAt = 0;
      over = false;
      coverOn(false);
      if (f < plan.cut) {
        mode = "chase";
        b.pause();
        place(b, 0);
        place(a, f);
        aShown = f / FPS;
        aLastK = -1;
        show("chase");
      } else if (f < plan.cut + plan.endVideo) {
        mode = "ending";
        a.pause();
        place(b, f - plan.cut);
        bShown = (f - plan.cut) / FPS;
        bLastK = -1;
        show("ending");
      } else {
        mode = "tail";
        a.pause();
        b.pause();
        place(b, plan.endVideo - 1);
        tailBase = T;
        tailSince = performance.now();
        show("ending");
      }
      pinned = T;
      if (running) {
        if (mode === "chase") playVideo(a);
        else if (mode === "ending") playVideo(b);
        if (!raf) raf = requestAnimationFrame(tick);
      }
      onTime(running ? time() : T);
    },
    hold(on: boolean) {
      held = on;
      if (on) pause();
      else play();
    },
    time: () => time(),
    stats() {
      let dropped = 0;
      let decoded = 0;
      for (const v of [a, b]) {
        const s = v.getVideoPlaybackQuality?.();
        dropped += s?.droppedVideoFrames ?? 0;
        decoded += s?.totalVideoFrames ?? 0;
      }
      return { dropped, decoded, skipped, leaked, switchMs, startMs, bytes, quality: q, frameCallbacks: rvfc, t: time() };
    },
    dispose() {
      disposed = true;
      running = false;
      if (raf) cancelAnimationFrame(raf);
      if (rvfc) {
        a.cancelVideoFrameCallback(aCb);
        b.cancelVideoFrameCallback(bCb);
      }
      for (const v of [a, b]) {
        v.pause();
        v.remove();
        // libère le décodeur ; les blobs restent pour une autre fiche de la page
        v.removeAttribute("src");
        try {
          v.load();
        } catch {
          /* déjà libérée */
        }
      }
    },
  };
}
