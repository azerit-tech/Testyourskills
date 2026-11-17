// L'enregistreur de la trace du film (trace.ts), chargé seulement avec
// `?filmtrace=1`. Il observe de l'extérieur, sans rien piloter : les événements
// de la balise (filmVideo, « A » : la poursuite et FIN6), ses propres rappels
// d'image (à côté de ceux du lecteur), un instantané toutes les 250 ms tant que
// le film est monté (balises, `player.stats()`, onglet, contexte audio), les
// étapes que Film.tsx lui passe et les événements de la fenêtre. Un calque à
// l'écran montre les huit dernières lignes marquantes (pour une capture
// d'écran) ; les lignes partent par lots chaque seconde et à la sortie de la
// page vers POST /api/film-trace. Un 404 (serveur sans FILM_TRACE) arrête
// l'envoi sans bruit.
import { peekAudio } from "../lib/audio";
import type { FilmProbe, TraceRecorder } from "./trace";
import { TraceBuffer, type TraceLine } from "./traceBuffer";
import { filmUnlocks, filmVideo } from "./unlock";

const ENDPOINT = "/api/film-trace";
const SNAP_MS = 250;
const SEND_MS = 1000;
const VIDEO_EVENTS = [
  "loadstart",
  "loadedmetadata",
  "loadeddata",
  "canplay",
  "canplaythrough",
  "play",
  "playing",
  "pause",
  "waiting",
  "stalled",
  "suspend",
  "seeking",
  "seeked",
  "ended",
  "error",
  "emptied",
  "abort",
  "ratechange",
  "timeupdate",
  "webkitbeginfullscreen",
  "webkitendfullscreen",
  "webkitpresentationmodechanged",
] as const;

type FrameMeta = { mediaTime: number; presentedFrames?: number };
type FrameVideo = HTMLVideoElement & { requestVideoFrameCallback?(cb: (now: number, meta: FrameMeta) => void): number };

const r3 = (n: number) => (Number.isFinite(n) ? Math.round(n * 1000) / 1000 : String(n));

function randomId(): string {
  try {
    const a = new Uint8Array(8);
    crypto.getRandomValues(a);
    return Array.from(a, (x) => x.toString(16).padStart(2, "0")).join("");
  } catch {
    return Math.random().toString(16).slice(2, 18).padEnd(8, "0");
  }
}

const msg = (e: unknown): string => {
  if (e instanceof Error) return `${e.name}: ${e.message}`.slice(0, 300);
  return String(e).slice(0, 300);
};

/** L'état court d'une balise, à chaque événement. */
const brief = (v: HTMLVideoElement) => ({ ct: r3(v.currentTime), p: v.paused, rs: v.readyState, ns: v.networkState });

/** L'état complet d'une balise, à chaque instantané. */
function videoState(v: HTMLVideoElement) {
  const b = v.buffered;
  let bufEnd: number | string | null = null;
  try {
    bufEnd = b.length ? r3(b.end(b.length - 1)) : null;
  } catch {
    bufEnd = null;
  }
  const rect = v.getBoundingClientRect();
  const q = v.getVideoPlaybackQuality?.();
  return {
    ...brief(v),
    end: v.ended,
    dur: r3(v.duration),
    buf: bufEnd,
    vw: v.videoWidth,
    vis: v.style.visibility || "",
    rect: [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)],
    q: q ? [q.totalVideoFrames, q.droppedVideoFrames] : null,
    src: !!v.getAttribute("src"),
    dom: v.isConnected,
    m: v.muted,
    rate: v.playbackRate,
  };
}

export function startRecorder(t0: number): TraceRecorder {
  const buf = new TraceBuffer();
  const session = randomId();
  const rel = (at: number) => Math.round((at - t0) * 10) / 10;
  let off = false;
  let sending = false;
  let sent = 0;
  let overlay: HTMLDivElement | null = null;
  let status = "";

  const add = (line: TraceLine) => {
    buf.push(line);
    if (overlay && line.k !== "snap") paint();
  };

  // ---- en tête : le navigateur ---------------------------------------------
  const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } };
  let canPlay = "";
  try {
    canPlay = document.createElement("video").canPlayType('video/mp4; codecs="avc1.4D401F"');
  } catch (e) {
    canPlay = `erreur ${msg(e)}`;
  }
  add({
    t: rel(performance.now()),
    k: "head",
    ua: navigator.userAgent,
    win: [window.innerWidth, window.innerHeight],
    screen: [window.screen?.width, window.screen?.height],
    dpr: window.devicePixelRatio,
    saveData: nav.connection?.saveData ?? null,
    effectiveType: nav.connection?.effectiveType ?? null,
    rvfc: typeof (HTMLVideoElement.prototype as FrameVideo).requestVideoFrameCallback === "function",
    canPlay,
    vis: document.visibilityState,
  });

  // ---- la balise -----------------------------------------------------------
  const a = filmVideo() as FrameVideo;
  const tags = new Map<FrameVideo, "A">([[a, "A"]]);
  const frames = { A: { n: 0, mt: null as number | null, pf: null as number | null } };
  for (const [v, tag] of tags) {
    for (const e of VIDEO_EVENTS) {
      v.addEventListener(e, () => {
        const now = performance.now();
        if (e === "timeupdate" && !buf.keepTimeupdate(tag, now)) return;
        const line: TraceLine = { t: rel(now), k: "ev", v: tag, e, ...brief(v) };
        if (e === "error") line.err = v.error ? { code: v.error.code, message: v.error.message } : null;
        add(line);
      });
    }
    // nos propres rappels d'image : ils cohabitent avec ceux du lecteur
    if (typeof v.requestVideoFrameCallback === "function") {
      const loop = () =>
        v.requestVideoFrameCallback!((_now, md) => {
          const f = frames[tag];
          f.n++;
          f.mt = r3(md.mediaTime) as number;
          f.pf = md.presentedFrames ?? null;
          loop();
        });
      loop();
    }
  }

  // ---- la fenêtre ----------------------------------------------------------
  const win = (e: string, data: Record<string, unknown> = {}) => add({ t: rel(performance.now()), k: "win", e, ...data });
  document.addEventListener("visibilitychange", () => {
    win("visibilitychange", { vis: document.visibilityState });
    if (document.visibilityState === "hidden") flushAll();
  });
  window.addEventListener("pagehide", (e) => {
    win("pagehide", { persisted: e.persisted });
    flushAll();
  });
  window.addEventListener("pageshow", (e) => win("pageshow", { persisted: e.persisted }));
  window.addEventListener("error", (e) => win("error", { message: String(e.message).slice(0, 300) }));
  window.addEventListener("unhandledrejection", (e) => win("unhandledrejection", { message: msg(e.reason) }));
  window.addEventListener("resize", () => win("resize", { win: [window.innerWidth, window.innerHeight] }));

  // ---- l'envoi -------------------------------------------------------------
  const beacon = (body: string): boolean => {
    try {
      return typeof navigator.sendBeacon === "function" && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
    } catch {
      return false;
    }
  };
  const stop = (why: string) => {
    off = true;
    window.clearInterval(sender);
    status = why;
    if (overlay) paint();
  };
  /**
   * Un lot. `last` : la page s'en va, `keepalive` (repli sendBeacon) et rien ne
   * se reprend. Pendant la vie de la page, un `fetch` simple : le navigateur
   * borne à 64 Ko l'ensemble des requêtes keepalive en vol, et une réponse non
   * consommée y reste comptée (mesuré dans Chrome : l'envoi s'arrêtait au bout
   * d'une vingtaine de lots).
   */
  const post = (lines: TraceLine[], last: boolean): Promise<void> => {
    const body = JSON.stringify({ session, lines });
    const fallback = () => {
      if (beacon(body)) sent += lines.length;
      else if (!last) buf.requeue(lines);
    };
    const ctrl = typeof AbortController === "function" && !last ? new AbortController() : null;
    const timer = ctrl ? window.setTimeout(() => ctrl.abort(), 10_000) : 0;
    let p: Promise<Response>;
    try {
      p = fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: last, cache: "no-store", signal: ctrl?.signal });
    } catch {
      fallback();
      return Promise.resolve();
    }
    return p
      .then(
        (r) => {
          void r.text().catch(() => undefined);
          if (r.status === 404) return stop("envoi coupé : serveur sans FILM_TRACE");
          if (r.status === 507) return stop("envoi coupé : fichier plein");
          // corps refusé : on ne le renvoie pas en boucle
          if (r.ok || r.status === 400 || r.status === 413) sent += lines.length;
          else if (!last) buf.requeue(lines);
        },
        () => fallback(),
      )
      .finally(() => window.clearTimeout(timer));
  };
  /** Chaque seconde : un lot à la fois. */
  const flush = () => {
    if (off || sending || !buf.size) return;
    const [first, ...rest] = buf.takeBatches();
    if (!first) return;
    buf.requeue(rest.flat());
    sending = true;
    void post(first, false).finally(() => {
      sending = false;
      if (overlay) paint();
    });
  };
  /** La page part : tout ce qui reste. */
  function flushAll() {
    if (off) return;
    for (const lot of buf.takeBatches()) void post(lot, true);
  }
  const sender = window.setInterval(flush, SEND_MS);

  // ---- le calque -----------------------------------------------------------
  let last: Record<string, unknown> | null = null;
  const fmt = (l: TraceLine): string => {
    const s = (l.t / 1000).toFixed(2).padStart(6);
    if (l.k === "ev") return `${s} ${l.v} ${l.e} ct=${l.ct} ${l.p ? "pause" : "joue"} rs=${l.rs} ns=${l.ns}${l.err ? ` err=${JSON.stringify(l.err)}` : ""}`;
    if (l.k === "step") {
      const { t: _t, k: _k, s: name, ...rest } = l;
      const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : "";
      return `${s} · ${name}${extra}`;
    }
    if (l.k === "head") return `${s} trace ${session}`;
    const { t: _t, k: _k, ...rest } = l;
    return `${s} ${l.k} ${JSON.stringify(rest)}`;
  };
  function paint() {
    if (!overlay) return;
    const vs = (x: unknown) => {
      const v = x as { ct: unknown; p: boolean; rs: number } | undefined;
      return v ? `${v.ct} ${v.p ? "pause" : "joue"} rs${v.rs}` : "-";
    };
    const st = last?.st as { t?: number; retries?: number; aborted?: boolean } | undefined;
    const fc = last?.fc as { A: number } | undefined;
    const head = last
      ? `A ${vs(last.A)} img${fc?.A ?? "-"} | t=${st?.t?.toFixed?.(2) ?? "-"} relances=${st?.retries ?? "-"}${st?.aborted ? " AVORTÉ" : ""}`
      : "";
    const lines = buf.shown().map(fmt);
    overlay.textContent = [`trace ${session} · ${sent} envoyées${status ? ` · ${status}` : ""}`, head, ...lines].filter(Boolean).join("\n");
  }
  const showOverlay = () => {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.setAttribute("aria-hidden", "true");
    Object.assign(overlay.style, {
      position: "fixed",
      left: "0",
      right: "0",
      bottom: "0",
      zIndex: "2147483647",
      pointerEvents: "none",
      background: "rgba(0, 0, 0, 0.6)",
      color: "#fff",
      font: "9px/1.3 ui-monospace, Menlo, monospace",
      whiteSpace: "pre-wrap",
      wordBreak: "break-all",
      padding: "4px 6px calc(4px + env(safe-area-inset-bottom))",
      maxHeight: "40vh",
      overflow: "hidden",
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(overlay);
    paint();
  };

  // ---- les instantanés, tant que le film est monté -------------------------
  let probe: FilmProbe | null = null;
  let snapTimer = 0;
  const snap = () => {
    if (!probe) return;
    let st: unknown;
    try {
      st = probe.stats();
    } catch (e) {
      st = { erreur: msg(e) };
    }
    const line: TraceLine = {
      t: rel(performance.now()),
      k: "snap",
      A: videoState(a),
      fc: { A: frames.A.n },
      mt: { A: frames.A.mt },
      pf: { A: frames.A.pf },
      st,
      vis: document.visibilityState,
      au: peekAudio(),
      un: filmUnlocks(),
    };
    frames.A.n = 0;
    last = line;
    add(line);
    paint();
  };

  return {
    step(s, data, at) {
      add({ ...(data ?? {}), t: rel(at), k: "step", s });
    },
    mount(p) {
      probe = p;
      add({ t: rel(performance.now()), k: "step", s: "film:monté", plan: p.plan });
      showOverlay();
      window.clearInterval(snapTimer);
      snap();
      snapTimer = window.setInterval(snap, SNAP_MS);
    },
    unmount(p) {
      if (probe !== p) return;
      snap();
      probe = null;
      window.clearInterval(snapTimer);
      add({ t: rel(performance.now()), k: "step", s: "film:démonté" });
      // le calque reste : la capture d'écran se fait aussi sur la fiche
    },
  };
}
