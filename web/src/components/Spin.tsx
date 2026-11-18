// La caisse du suspect (SPEC §18.79) : la berline du film, qu'on fait tourner au doigt.
// Ni WebGL ni 3D : 144 images pré-rendues d'un tour complet, tirées une à une dans un seul canevas.
// Au repos, une image fixe (la vue trois-quarts avant), place réservée (aucun décalage).
// Le reste ne se télécharge qu'une fois l'encart en vue et le film fini ou absent ; jamais avec
// l'économie de données ou en 2G. Les images se décodent au fur et à mesure, dix au plus en mémoire.
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { Lang } from "../../../shared/types";
import { useT } from "../i18n";
import { useReducedMotion } from "../lib/util";
import posterAvif from "./spin/140.avif?no-inline";
import posterJpg from "./spin/poster.jpg?no-inline";
import { coast, DECODED_MAX, dragTo, FRAMES, KEY_STEP, loadOrder, Lru, nearest, POSTER, releaseSpeed, stillOnly, wrap } from "./spinCore";
import "./spin.css";

/** Où est l'encart : sous une fiche (sa caisse), ou sur l'accueil (la caisse du film). */
export type SpinPlace = "card" | "home";

type Words = { title: string; label: string; still: string };
export const SPIN_TEXT: Record<Lang, { hint: string; angle: (deg: number) => string } & Record<SpinPlace, Words>> = {
  fr: {
    hint: "Fais-la tourner",
    angle: (deg) => `${deg} degrés`,
    card: {
      title: "La caisse du suspect",
      label: "La caisse du suspect, une berline rouge des années 60. Flèches gauche et droite pour la faire tourner.",
      still: "La caisse du suspect : une berline rouge des années 60, vue de trois quarts avant.",
    },
    home: {
      title: "La caisse de la poursuite",
      label: "La caisse de la poursuite, une berline rouge des années 60. Flèches gauche et droite pour la faire tourner.",
      still: "La caisse de la poursuite : une berline rouge des années 60, vue de trois quarts avant.",
    },
  },
  en: {
    hint: "Spin it",
    angle: (deg) => `${deg} degrees`,
    card: {
      title: "The suspect's ride",
      label: "The suspect's ride, a red 1960s sedan. Left and right arrows to spin it.",
      still: "The suspect's ride: a red 1960s sedan, front three-quarter view.",
    },
    home: {
      title: "The getaway car",
      label: "The getaway car, a red 1960s sedan. Left and right arrows to spin it.",
      still: "The getaway car: a red 1960s sedan, front three-quarter view.",
    },
  },
};

type Pic = ImageBitmap | HTMLImageElement;

/** Décode une image : createImageBitmap d'abord, sinon une balise img et decode(). Rejette si le format n'est pas lu. */
async function decodeBlob(blob: Blob): Promise<Pic> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* Safari ancien : la balise img ci-dessous */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Le moteur du tour : téléchargement par ordre grossier puis fin, décodage à la demande, un seul canevas. */
class Spinner {
  private urls: string[] = [];
  private blobs: (Blob | null | undefined)[] = new Array(FRAMES);
  private dec = new Lru<Pic>(DECODED_MAX, (p) => "close" in p && p.close());
  private decoding = new Set<number>();
  private pendingDecode: number | null = null;
  private queue: number[] = [];
  private inflight = 0;
  private ready = false;
  private dead = false;
  private ac = typeof AbortController === "function" ? new AbortController() : null;
  private shown = -1;
  pos = POSTER;

  constructor(
    private canvas: HTMLCanvasElement,
    private onLive: () => void,
    private onFail: () => void,
    private onAngle: (deg: number) => void,
  ) {}

  /** L'image au repos d'abord : lue, elle se peint et le tour s'ouvre ; illisible (pas d'AVIF), l'image fixe reste. */
  async start(ready: boolean) {
    this.ready = ready;
    try {
      const { SPIN_FRAMES } = await import("./spinFrames");
      if (this.dead) return;
      if (SPIN_FRAMES.length !== FRAMES) throw new Error("tour incomplet");
      this.urls = SPIN_FRAMES;
      await this.fetchOne(POSTER);
      if (this.dead) return;
      if (!(await this.decode(POSTER))) throw new Error("image au repos illisible");
      if (this.dead) return;
      this.resize();
      this.paint(POSTER);
      this.onLive();
      this.onAngle(Math.round((POSTER * 360) / FRAMES));
      this.queue = loadOrder().filter((i) => i !== POSTER);
      this.pump();
    } catch {
      if (!this.dead) this.onFail();
    }
  }

  /** Le film reprend (« Revoir ma poursuite ») : plus rien ne part ; il finit, la file repart. */
  setReady(ready: boolean) {
    this.ready = ready;
    this.pump();
  }

  private pump() {
    while (this.ready && !this.dead && this.urls.length && this.inflight < 3 && this.queue.length) {
      const i = this.queue.shift()!;
      void this.fetchOne(i).then(() => this.pump());
    }
  }

  private async fetchOne(i: number): Promise<void> {
    if (this.blobs[i] !== undefined) return;
    this.inflight++;
    try {
      const init: RequestInit & { priority?: string } = { signal: this.ac?.signal, priority: "low" };
      const r = await fetch(this.urls[i], init);
      if (!r.ok) throw new Error(String(r.status));
      this.blobs[i] = await r.blob();
    } catch {
      // Une image manque : on la saute, la plus proche la remplace.
      this.blobs[i] = null;
    } finally {
      this.inflight--;
    }
  }

  private async decode(i: number): Promise<boolean> {
    if (this.dec.has(i)) return true;
    const blob = this.blobs[i];
    if (!blob) return false;
    try {
      const pic = await decodeBlob(blob);
      if (this.dead) {
        if ("close" in pic) pic.close();
        return false;
      }
      this.dec.set(i, pic);
      return true;
    } catch {
      this.blobs[i] = null;
      return false;
    }
  }

  /** Deux décodages en même temps au plus ; le dernier demandé passe ensuite, les autres sont oubliés. */
  private want(i: number) {
    if (this.dec.has(i) || this.decoding.has(i)) return;
    if (this.decoding.size >= 2) {
      this.pendingDecode = i;
      return;
    }
    this.decoding.add(i);
    void this.decode(i).then(() => {
      this.decoding.delete(i);
      if (this.dead) return;
      this.show(this.pos);
      const p = this.pendingDecode;
      this.pendingDecode = null;
      if (p !== null) this.want(p);
    });
  }

  /** Montre la position demandée : l'image décodée la plus proche tout de suite, la bonne dès qu'elle est prête. */
  show(pos: number) {
    if (this.dead) return;
    this.pos = pos;
    const goal = wrap(pos);
    const target = this.blobs[goal] ? goal : nearest(goal, (j) => !!this.blobs[j]);
    if (target !== null && !this.dec.has(target)) this.want(target);
    const have = nearest(goal, (j) => this.dec.has(j));
    if (have !== null && have !== this.shown) this.paint(have);
    this.onAngle(Math.round((goal * 360) / FRAMES) % 360);
  }

  private paint(i: number) {
    const pic = this.dec.get(i);
    const ctx = this.canvas.getContext("2d");
    if (!pic || !ctx) return;
    ctx.drawImage(pic, 0, 0, this.canvas.width, this.canvas.height);
    this.shown = i;
  }

  /** Le canevas à la taille de l'encart, deux pixels par point au plus. */
  resize() {
    const w = Math.max(2, Math.round(this.canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2)));
    const h = Math.round(w / 2);
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    const s = this.shown;
    this.shown = -1;
    if (s >= 0) this.paint(s);
  }

  dispose() {
    this.dead = true;
    this.ac?.abort();
    this.dec.clear();
    this.queue = [];
  }
}

type Mode = "rest" | "live" | "still";

/**
 * L'encart, sous la fiche ou sur l'accueil. `ready` : le film de la page est fini ou absent ; tant
 * qu'il est faux, rien ne se télécharge, pas même l'image au repos. Le titre est une légende
 * au-dessus de l'image : dans l'image, il mordait sur l'antenne de la voiture.
 */
export function Spin({ ready, place = "card" }: { ready: boolean; place?: SpinPlace }) {
  const { lang } = useT();
  const text = SPIN_TEXT[lang];
  const words = text[place];
  const reduced = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Spinner | null>(null);
  const [mode, setMode] = useState<Mode>("rest");
  const [hint, setHint] = useState(true);
  const [seen, setSeen] = useState(ready);
  const [visible, setVisible] = useState(false);
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  useEffect(() => {
    if (ready) setSeen(true);
    engine.current?.setReady(ready);
  }, [ready]);

  // Économie de données ou 2G : l'image fixe, rien d'autre.
  useEffect(() => {
    if (stillOnly(navigator as { connection?: { saveData?: boolean; effectiveType?: string } })) setMode("still");
  }, []);

  // En vue (ou presque) : une fois suffit.
  useEffect(() => {
    const el = box.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver !== "function") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: "200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  // Le tour démarre en vue, le film fini, sans économie de données.
  const go = visible && seen && mode === "rest";
  useEffect(() => {
    const cv = canvas.current;
    if (!go || !cv || engine.current) return;
    const e = new Spinner(
      cv,
      () => setMode("live"),
      () => setMode("still"),
      (deg) => {
        box.current?.setAttribute("aria-valuenow", String(deg));
        box.current?.setAttribute("aria-valuetext", text.angle(deg));
      },
    );
    engine.current = e;
    void e.start(readyRef.current);
  }, [go, text]);

  useEffect(
    () => () => {
      engine.current?.dispose();
      engine.current = null;
    },
    [],
  );

  // Le canevas suit la largeur de l'encart.
  useEffect(() => {
    if (mode !== "live" || typeof ResizeObserver !== "function" || !canvas.current) return;
    const ro = new ResizeObserver(() => engine.current?.resize());
    ro.observe(canvas.current);
    return () => ro.disconnect();
  }, [mode]);

  // Le geste : glisser horizontalement fait tourner ; le défilement vertical reste au navigateur (pan-y).
  const drag = useRef<{ id: number; x: number; y: number; start: number; on: boolean; samples: { t: number; pos: number }[] } | null>(null);
  const raf = useRef(0);
  const stopCoast = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
  };
  useEffect(() => stopCoast, []);

  const live = mode === "live";
  const onPointerDown = (ev: PointerEvent<HTMLDivElement>) => {
    if (!live || (ev.pointerType === "mouse" && ev.button !== 0)) return;
    stopCoast();
    const e = engine.current;
    if (!e) return;
    drag.current = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, start: e.pos, on: false, samples: [] };
  };
  const onPointerMove = (ev: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const e = engine.current;
    if (!d || !e || d.id !== ev.pointerId) return;
    const dx = ev.clientX - d.x;
    const dy = ev.clientY - d.y;
    if (!d.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        drag.current = null;
        return;
      }
      if (Math.abs(dx) < 6) return;
      d.on = true;
      setHint(false);
      try {
        ev.currentTarget.setPointerCapture(ev.pointerId);
      } catch {
        /* pointeur déjà relâché */
      }
    }
    const pos = dragTo(d.start, dx, ev.currentTarget.clientWidth);
    d.samples.push({ t: ev.timeStamp, pos });
    if (d.samples.length > 12) d.samples.shift();
    e.show(pos);
  };
  const onPointerUp = (ev: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    const e = engine.current;
    if (!d || !e || !d.on || d.id !== ev.pointerId) return;
    // En mouvement réduit : la voiture s'arrête où le doigt la laisse.
    let v = reducedRef.current ? 0 : releaseSpeed(d.samples, ev.timeStamp);
    if (v === 0) return;
    let last = performance.now();
    const step = (t: number) => {
      const dt = Math.min(64, Math.max(0, t - last));
      last = t;
      v = coast(v, dt);
      e.show(e.pos + v * dt);
      raf.current = v !== 0 ? requestAnimationFrame(step) : 0;
    };
    raf.current = requestAnimationFrame(step);
  };
  const onPointerCancel = () => {
    drag.current = null;
  };
  const onKeyDown = (ev: KeyboardEvent<HTMLDivElement>) => {
    const e = engine.current;
    if (!live || !e) return;
    const dir = ev.key === "ArrowRight" ? -1 : ev.key === "ArrowLeft" ? 1 : 0;
    if (!dir) return;
    ev.preventDefault();
    stopCoast();
    setHint(false);
    e.show(Math.round(e.pos) + dir * KEY_STEP);
  };

  const still = mode === "still";
  return (
    <figure className={`spin-wrap is-${place}`}>
      <figcaption className="spin-title announce" aria-hidden="true">
        {words.title}
      </figcaption>
      <div
        ref={box}
        className={`spin${live ? " is-live" : ""}`}
        role={live ? "slider" : "img"}
        aria-label={live ? words.label : words.still}
        aria-valuemin={live ? 0 : undefined}
        aria-valuemax={live ? 359 : undefined}
        aria-orientation={live ? "horizontal" : undefined}
        tabIndex={live ? 0 : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
      >
        {seen && !live && (
          <picture>
            <source srcSet={posterAvif} type="image/avif" />
            <img className="spin-still" src={posterJpg} width={960} height={480} alt="" decoding="async" draggable={false} />
          </picture>
        )}
        {!still && <canvas ref={canvas} className="spin-canvas" aria-hidden="true" />}
        {live && (
          <span className={`spin-hint${hint ? "" : " is-gone"}`} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 15.5-6.2M21 12a9 9 0 0 1-15.5 6.2" />
              <path d="M18.5 2v3.8h-3.8M5.5 22v-3.8h3.8" />
            </svg>
            {text.hint}
          </span>
        )}
      </div>
    </figure>
  );
}
