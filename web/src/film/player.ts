// Le lecteur du film (§18.36, docs/cinematique-poursuite.md §5.2 à §5.6) : une
// balise <video muted playsinline> (unlock.ts), le fichier `poursuite` entier
// (la poursuite et FIN6, un seul trajet d'un seul tenant, §18.56), chargé en
// entier avant de jouer (fetch puis Blob, loader.ts, dans la variante que le
// débit mesuré a choisie). L'horloge du film est celle de la vidéo : t = image
// présentée, puis l'horloge du navigateur pour le gel et le flash. Le HUD ne
// peut pas se décaler de l'image.
// À toutes les étoiles, la fin se joue sur place (§18.53, §18.56) : l'arrêt sur
// image gèle la dernière image du dernier tronçon joué (Pk ; à six étoiles, la
// dernière de FIN6, la fin du fichier). La balise s'arrête un peu avant la
// frontière (APPROACH), pas dessus : elle garde une image d'avance, même en
// pause, et un téléphone chargé saute des images ; attendre la dernière image du
// tronçon laissait passer le suivant (mesuré : une image). Arrêtée, elle est
// replacée sur la dernière image du tronçon, puis, à l'instant du gel, l'arrêt
// sur image (la toile tirée de cette même image pendant la préparation,
// freeze.ts) passe devant.
// Le chien de garde (watchdog.ts, §5.5) : une erreur de balise, une pause non
// demandée ou une horloge figée plus de 1,5 s pendant la lecture : une
// relance, puis le flash et la fiche. Jamais d'image figée ni d'écran noir.
import { FPS, type FilmPlan } from "../../../shared/film";
import type { Quality } from "./files";
import { canPlayFilm, debugFlag, filmNet, filmVariant, loadFilmFiles } from "./loader";
import { PlaybackWatchdog } from "./watchdog";
import { filmUnlocks, filmVideo } from "./unlock";

export type { Quality } from "./files";
export { canPlayFilm, preloadFilm } from "./loader";

export interface FilmStats {
  /** Images perdues par le décodeur (getVideoPlaybackQuality). */
  dropped: number;
  /** Images décodées. */
  decoded: number;
  /** Images sautées à l'affichage pendant la lecture (trous dans les images présentées). */
  skipped: number;
  /** Images au-delà de la dernière jouée présentées avant le gel (0 attendu). */
  leaked: number;
  /** La bascule d'une balise à l'autre : il n'y en a plus (un seul fichier, §18.56), toujours null. */
  switchMs: null;
  /** De l'ordre de lecture à la première image qui bouge (ms). */
  startMs: number | null;
  /** Octets chargés par le film sur cette page. */
  bytes: number;
  quality: Quality;
  /** requestVideoFrameCallback disponible (suivi image par image). */
  frameCallbacks: boolean;
  /** Relances du chien de garde (horloge figée, pause non demandée). */
  retries: number;
  /** Le film a sauté au flash sur une erreur de lecture (§5.5). */
  aborted: boolean;
  /** L'instant du film. */
  t: number;
}

export interface FilmPlayer {
  /** Charge, place la balise sur sa première image, et dit si la lecture demande un geste. */
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
  /** Le cadre du film : la balise y est posée. */
  host: HTMLElement;
  /** L'arrêt sur image (la toile de freeze.ts) : le lecteur le montre lui-même, sans attendre React, à l'instant du gel. */
  still?: HTMLCanvasElement | null;
  /** À chaque rafraîchissement pendant la lecture, et à chaque seek. */
  onTime(t: number): void;
  /**
   * Pendant la préparation, la balise posée sur l'image à geler (la dernière du
   * dernier tronçon joué) : l'arrêt sur image se tire là, hors de la lecture.
   * Rappelé au gel si la toile n'a pas pu se tirer avant.
   */
  onStill?(video: HTMLVideoElement): void;
}

type Mode = "chase" | "tail";
type FrameMeta = { mediaTime: number; expectedDisplayTime: number };
type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback(cb: (now: number, meta: FrameMeta) => void): number;
  cancelVideoFrameCallback(id: number): void;
};

/**
 * Le gel sur place : la balise s'arrête dès cette image-là avant la dernière du
 * tronçon, et tient la dernière. Deux images (83 ms) : une image d'avance de la
 * balise, plus une image sautée ; la dernière est tenue un instant de plus en couleur.
 */
const APPROACH = 2;

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

export function createFilmPlayer({ plan, host, still = null, onTime, onStill }: Options): FilmPlayer {
  const a = filmVideo() as FrameVideo;
  let q: Quality = filmVariant();
  const rvfc = typeof a.requestVideoFrameCallback === "function";
  const simulateRefusal = debugFlag() === "gesture";
  const unlocksAtStart = filmUnlocks();
  /** La dernière image jouée, celle qui gèle. */
  const last = plan.cut - 1;

  let mode: Mode = "chase";
  let running = false;
  let held = false;
  let disposed = false;
  let over = false;
  /** L'instant affiché quand rien ne tourne. */
  let pinned = 0;
  /** Image présentée (arrondie à l'image). */
  let aShown = 0;
  let aLastK = -1;
  let skipped = 0;
  /** Images au-delà de la dernière jouée présentées avant le gel (doit rester 0). */
  let leaked = 0;
  /** L'horloge du gel et du flash : depuis cet instant du film, à cette heure de l'écran (ms). */
  let tailBase = 0;
  let tailSince = 0;
  let raf = 0;
  let aCb = 0;
  let playFrom = 0;
  let playK = 0;
  let startMs: number | null = null;
  /** Le chien de garde, armé tant que la balise doit avancer. */
  const dog = new PlaybackWatchdog();
  /** La balise mise en pause par le lecteur lui-même (son événement « pause » est attendu). */
  let asked = false;
  /** La balise est chargée et posée : ses erreurs sont désormais des erreurs de lecture. */
  let prepared = false;
  /** Le flash est parti sur une erreur. */
  let aborted = false;

  a.className = "film-video";
  // cachée pendant la préparation (elle passe par l'image à geler), montrée posée sur la première
  a.style.visibility = "hidden";
  host.prepend(a);
  // la toile d'un film précédent ne sert pas à celui-ci
  if (still) {
    delete still.dataset.ready;
    still.style.visibility = "";
  }

  const place = (frame: number) => {
    // le milieu de l'image : jamais d'ambiguïté sur l'image affichée
    a.currentTime = (Math.max(0, frame) + 0.5) / FPS;
  };
  /** L'arrêt sur image posé par le lecteur ; sinon, la feuille de style le montre au gel du HUD. */
  const stillOn = (on: boolean) => {
    if (still) still.style.visibility = on ? "visible" : "";
  };
  const stillReady = () => !!still && still.dataset.ready !== undefined;
  /** Une pause demandée par le lecteur : le chien de garde ne la prend pas pour un incident. */
  const halt = () => {
    if (!a.paused) asked = true;
    a.pause();
  };

  const tryPlay = (): Promise<void> => {
    if (simulateRefusal && filmUnlocks() === unlocksAtStart) {
      return Promise.reject(Object.assign(new Error("lecture refusée (simulée)"), { name: "NotAllowedError" }));
    }
    return a.play();
  };

  /** Erreur de lecture en cours de film (§5.5) : flash immédiat, la fiche se pose. */
  const flashNow = () => {
    if (disposed || over || mode === "tail") return;
    dog.disarm();
    aborted = true;
    mode = "tail";
    halt();
    tailBase = Math.max(time(), plan.flash.from / FPS);
    tailSince = performance.now();
    if (!running) pinned = tailBase;
  };
  const playVideo = () => {
    tryPlay().catch((e: unknown) => {
      if (disposed || (e as { name?: string })?.name === "AbortError") return;
      flashNow();
    });
  };
  /** La relance : la balise est replacée sur son image et relancée. */
  const retry = () => {
    place(Math.floor(a.currentTime * FPS));
    playVideo();
  };
  const react = (action: "ok" | "retry" | "fail") => {
    if (action === "retry") retry();
    else if (action === "fail") flashNow();
  };

  const watchA = () => {
    if (!rvfc || disposed) return;
    aCb = a.requestVideoFrameCallback((_now, md) => {
      if (disposed) return;
      const k = Math.round(md.mediaTime * FPS);
      if (running && mode === "chase") {
        if (aLastK >= 0 && k > aLastK + 1) skipped += k - aLastK - 1;
        if (startMs === null && playFrom && k > playK) startMs = Math.max(0, md.expectedDisplayTime - playFrom);
        // Dès que l'approche du gel est présentée : l'arrêt, posé dans ce même
        // rafraîchissement, avant que la balise n'ait pu présenter le tronçon
        // suivant (elle en garde une image d'avance, même en pause).
        if (k >= last - APPROACH) {
          if (k > last) leaked++;
          aLastK = k;
          toFreeze(k, performance.now());
          watchA();
          return;
        }
      }
      aLastK = k;
      aShown = k / FPS;
      watchA();
    });
  };

  function time(now = performance.now()): number {
    if (!running) return pinned;
    if (mode === "chase") return rvfc ? aShown : a.currentTime;
    return tailBase + (now - tailSince) / 1000;
  }

  /**
   * L'approche du gel, `k` : l'image à l'écran. La balise s'arrête et se replace
   * sur la dernière image jouée ; l'horloge continue depuis `k`, et la toile
   * passera devant au gel (tick).
   */
  const toFreeze = (k: number, now: number) => {
    dog.disarm();
    halt();
    place(last);
    mode = "tail";
    tailBase = Math.min(k, last) / FPS;
    tailSince = now;
  };
  /**
   * Au gel, la toile passe devant la balise, sans attendre React. Pas tirée
   * pendant la préparation : elle se tire ici, sur la balise posée sur l'image à
   * geler ; sinon la balise reste sur cette image, en couleur.
   */
  const freezeInPlace = () => {
    if (!stillReady() && !a.seeking) onStill?.(a);
    if (stillReady()) stillOn(true);
  };

  const tick = (now: number) => {
    raf = 0;
    if (!running || disposed) return;
    if (mode === "chase") {
      // l'horloge de la balise, relue à chaque rafraîchissement : le filet si des images ont sauté sans rappel
      const k = Math.floor(a.currentTime * FPS);
      if (a.ended || k >= last - APPROACH) toFreeze(k, now);
    }
    // l'horloge de la balise doit avancer
    if (mode === "chase" && dog.watching) react(dog.check(now, a.currentTime));
    const t = time(now);
    if (mode === "tail" && !aborted && t >= plan.freeze / FPS - 1e-6 && still?.style.visibility !== "visible") freezeInPlace();
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
    dog.disarm();
    halt();
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
      playVideo();
      dog.arm(now, a.currentTime);
    } else tailSince = now;
    if (!raf) raf = requestAnimationFrame(tick);
  }

  // Les incidents signalés par la balise, une fois le film prêt (§5.5).
  const onError = () => {
    if (prepared && !disposed) flashNow();
  };
  const onPause = () => {
    if (asked) {
      asked = false;
      return;
    }
    // la fin du fichier, l'onglet caché (le lecteur s'arrête de lui-même), ou déjà repartie : rien à faire
    const atEnd = a.ended || (Number.isFinite(a.duration) && a.currentTime >= a.duration - 0.05);
    if (!prepared || disposed || !running || document.hidden || mode !== "chase" || !a.paused || atEnd) return;
    react(dog.incident(performance.now()));
  };
  const onStalled = () => {
    // une relance douce ; si l'horloge reste figée, le chien de garde tranche
    if (prepared && !disposed && running && mode === "chase") playVideo();
  };
  a.addEventListener("error", onError);
  a.addEventListener("pause", onPause);
  a.addEventListener("stalled", onStalled);

  return {
    async prepare() {
      if (!canPlayFilm()) throw new Error("film: H.264 illisible");
      const loaded = await loadFilmFiles(["poursuite"]);
      q = loaded.quality;
      if (disposed) throw new Error("film: abandonné");
      const src = loaded.urls[0];
      if (a.getAttribute("src") !== src) {
        a.src = src;
        a.load();
      }
      if (a.readyState < 2) await once(a, "loadeddata");
      // La lecture sans geste est-elle permise ? (iPhone en économie d'énergie : non.)
      let gesture = false;
      try {
        await tryPlay();
      } catch (e) {
        if ((e as { name?: string })?.name !== "NotAllowedError") throw e;
        gesture = true;
      }
      halt();
      if (disposed) throw new Error("film: abandonné");
      if (onStill) {
        // l'image à geler : la dernière du dernier tronçon joué
        try {
          place(last);
          if (a.seeking) await once(a, "seeked", 3000);
          if (!disposed) onStill(a);
        } catch {
          /* l'arrêt sur image se tirera au gel, sur l'image à l'écran */
        }
      }
      place(0);
      if (a.seeking) await once(a, "seeked");
      a.style.visibility = "visible";
      watchA();
      await twoFrames();
      prepared = true;
      return gesture ? "gesture" : "ready";
    },
    play,
    pause,
    seek(t: number) {
      const T = Math.min(Math.max(0, t), plan.duration);
      const f = Math.floor(T * FPS + 1e-6);
      over = false;
      stillOn(false);
      if (f < plan.freeze) {
        mode = "chase";
        place(f);
        aShown = f / FPS;
        aLastK = -1;
      } else {
        // le gel : la balise sur la dernière image jouée, la toile devant
        mode = "tail";
        halt();
        place(last);
        tailBase = T;
        tailSince = performance.now();
        stillOn(stillReady());
      }
      pinned = T;
      dog.disarm();
      if (running) {
        if (mode === "chase") {
          playVideo();
          dog.arm(performance.now(), a.currentTime);
        }
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
      const s = a.getVideoPlaybackQuality?.();
      return {
        dropped: s?.droppedVideoFrames ?? 0,
        decoded: s?.totalVideoFrames ?? 0,
        skipped,
        leaked,
        switchMs: null,
        startMs,
        bytes: filmNet().bytes,
        quality: q,
        frameCallbacks: rvfc,
        retries: dog.retries,
        aborted,
        t: time(),
      };
    },
    dispose() {
      disposed = true;
      running = false;
      dog.disarm();
      if (raf) cancelAnimationFrame(raf);
      if (rvfc) a.cancelVideoFrameCallback(aCb);
      a.removeEventListener("error", onError);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("stalled", onStalled);
      a.pause();
      a.remove();
      // libère le décodeur ; le blob reste pour une autre fiche de la page
      a.removeAttribute("src");
      try {
        a.load();
      } catch {
        /* déjà libérée */
      }
    },
  };
}
