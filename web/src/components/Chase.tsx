// La poursuite (§18.33), jouée : une boucle requestAnimationFrame qui avance le
// temps et redessine l'image pure de shared/chase (ChaseFrame). Même contrat
// que Walkout3D envers CardPage : « ready » montre la première image (l'attente
// peut se lever), « playing » lance l'horloge, la fin passe la main à la fiche
// (onHandoff, au sommet du flash blanc) puis s'efface (onDone). Onglet caché :
// tout s'arrête. Sans Three.js : ce module ne charge rien de la scène 3D.
import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { CardData, Lang } from "../../../shared/types";
import { ChaseFrame, chasePlan } from "../../../shared/chase";
import { sceneOf } from "../../../shared/sceneLight";
import { useT } from "../i18n";
import { isMock } from "../lib/api";
import { readMuted, unlockAudio, writeMuted } from "../lib/audio";
import { createChaseSound, type ChaseSound } from "../lib/chaseSound";
import type { Phase } from "./Reveal";

/** Après le flash, le temps que la poursuite s'efface sur la fiche (styles.css, .chase-stage.is-fading). */
const FADE = 0.55;

interface Props {
  card: CardData;
  lang: Lang;
  /** Comparaison : la poursuite joue celle de la carte principale. */
  double: boolean;
  phase: Phase;
  onReady?: () => void;
  onHandoff: () => void;
  onDone: () => void;
  /** Un toucher sur la scène (CardPage : ouvrir, ou passer). */
  onTap?: () => void;
}

/** Le décor de fin, à précharger dès que la fiche est connue. */
export function backdropUrl(card: Pick<CardData, "profile">): string {
  return `/profiles/${sceneOf(card.profile?.id)}.jpg`;
}

declare global {
  interface Window {
    __chase?: { seek(t: number): void; hold(on: boolean): void; plan: unknown };
  }
}

function useViewport(ref: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState<{ w: number; h: number; top: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;top:0;left:0;height:env(safe-area-inset-top,0px);width:0;visibility:hidden;pointer-events:none";
    document.body.appendChild(probe);
    const read = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)), top: probe.getBoundingClientRect().height });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => {
      ro.disconnect();
      probe.remove();
    };
  }, [ref]);
  return size;
}

export function Chase({ card, lang, phase, onReady, onHandoff, onDone, onTap }: Props) {
  const { t: tr } = useT();
  const plan = useMemo(() => chasePlan(card), [card]);
  const hostRef = useRef<HTMLDivElement>(null);
  const size = useViewport(hostRef);
  const [time, setTime] = useState(0);
  const [muted, setMuted] = useState(readMuted);
  const cb = useRef({ onReady, onHandoff, onDone });
  cb.current = { onReady, onHandoff, onDone };
  const sound = useRef<ChaseSound | null>(null);
  /** L'horloge : temps acquis, instant de reprise, arrêt (onglet caché, débogage). */
  const clock = useRef({ base: 0, since: 0, running: false, held: false, handed: false, done: false, lastBeat: 0, stopped: false });

  // Le décor de fin se charge tout de suite : il glisse dans quelques secondes.
  useEffect(() => {
    const img = new Image();
    img.src = `/profiles/${plan.scene}.jpg`;
  }, [plan.scene]);

  // Première image posée : l'attente peut se lever.
  const readied = useRef(false);
  useEffect(() => {
    if (!size || readied.current) return;
    readied.current = true;
    requestAnimationFrame(() => requestAnimationFrame(() => cb.current.onReady?.()));
  }, [size]);

  useEffect(() => {
    sound.current = createChaseSound(readMuted());
    return () => {
      sound.current?.dispose();
      sound.current = null;
    };
  }, []);

  // La boucle : elle ne tourne qu'en « playing » et « handoff », onglet visible.
  useEffect(() => {
    if (phase !== "playing" && phase !== "handoff") return;
    const c = clock.current;
    let raf = 0;
    const now = () => performance.now() / 1000;
    const current = () => (c.running ? c.base + now() - c.since : c.base);
    const cue = (t: number) => {
      // les repères du son : chaque étoile, puis le freinage
      for (const b of plan.beats) {
        if (b.star > c.lastBeat && t >= b.at) {
          c.lastBeat = b.star;
          sound.current?.clack();
          sound.current?.siren(b.star);
        }
      }
      if (!c.stopped && t >= plan.brakeAt) {
        c.stopped = true;
        sound.current?.stop();
      }
    };
    const tick = () => {
      const t = current();
      setTime(t);
      cue(t);
      if (!c.handed && t >= plan.duration) {
        c.handed = true;
        cb.current.onHandoff();
      }
      if (!c.done && t >= plan.duration + FADE) {
        c.done = true;
        cb.current.onDone();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    const play = () => {
      if (c.running || c.held || document.hidden) return;
      c.running = true;
      c.since = now();
      raf = requestAnimationFrame(tick);
    };
    const pause = () => {
      if (!c.running) return;
      c.base = current();
      c.running = false;
      cancelAnimationFrame(raf);
    };
    const onVis = () => (document.hidden ? pause() : play());
    document.addEventListener("visibilitychange", onVis);
    play();

    if (import.meta.env.DEV || isMock()) {
      window.__chase = {
        plan,
        seek(t: number) {
          c.base = Math.max(0, t);
          c.since = now();
          if (!c.running) setTime(c.base);
        },
        hold(on: boolean) {
          c.held = on;
          if (on) pause();
          else play();
        },
      };
    }
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      pause();
      if (window.__chase?.plan === plan) delete window.__chase;
    };
  }, [phase, plan]);

  const toggleSound = () => {
    const m = !muted;
    setMuted(m);
    writeMuted(m);
    if (!m) unlockAudio();
    sound.current?.setMuted(m);
  };

  return (
    <>
      <div
        ref={hostRef}
        className={`chase-stage${phase === "handoff" ? " is-fading" : ""}`}
        aria-hidden="true"
        onClick={phase === "handoff" ? undefined : onTap}
      >
        {size && <ChaseFrame t={time} plan={plan} width={size.w} height={size.h} insetTop={size.top} lang={lang} />}
      </div>
      {phase === "playing" && (
        <button type="button" className="sound-btn" aria-pressed={!muted} aria-label={muted ? tr.reveal.unmute : tr.reveal.mute} title={muted ? tr.reveal.unmute : tr.reveal.mute} onClick={toggleSound}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
            {muted ? (
              <path d="m16 9 5 6m0-6-5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
            ) : (
              <path d="M16 8.5a5 5 0 0 1 0 7m2.5-9.5a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
            )}
          </svg>
        </button>
      )}
    </>
  );
}
