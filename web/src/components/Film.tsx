// Le film de la poursuite (§18.36), joué : même contrat que Walkout3D
// envers CardPage. « ready » : les deux balises sont chargées et posées sur
// leur première image (l'attente peut se lever, onReady) ; si la lecture
// demande un geste, onGesture (l'attente montre la pilule). « playing » : la
// vidéo joue, le HUD suit son horloge. Au sommet du flash, la fiche se pose
// (onHandoff) ; à la fin du flash, la scène s'efface (onDone). Onglet caché :
// tout s'arrête. Replis (§5.5) : film absent, illisible, ou qui ne peut pas
// être prêt dans les 4 s d'onglet visible après la fiche (estimé sur le débit
// mesuré), la fiche sort sans révélation, comme sans WebGL ; erreur en cours,
// flash immédiat.
// Sans Three.js ni WebGL. La bande-son (T3) se branche sur `FilmSound`.
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { flushSync } from "react-dom";
import type { CardData, Lang } from "../../../shared/types";
import { filmPlan, hudAt, type FilmPlan } from "../../../shared/film";
import { useT } from "../i18n";
import { api, isMock } from "../lib/api";
import { readMuted, unlockAudio, writeMuted } from "../lib/audio";
import { createFilmSound } from "../lib/filmSound";
import { buzz } from "../lib/haptics";
import { inAppBrowser } from "../lib/sharing";
import { canPlayFilm, createFilmPlayer, type FilmPlayer, type FilmStats } from "../film/player";
import { FilmHud } from "../film/FilmHud";
import { ensureStill, paintStill } from "../film/freeze";
import type { FileId } from "../film/files";
import { filmLoadMs, filmNet, filmRemaining } from "../film/loader";
import { readyVerdict, VisibleClock } from "../film/net";
import { filmReport, interruptedOutcome, type FilmOutcome } from "../film/report";
import type { Phase } from "./Reveal";
import "../card/fonts.css";
import "../film/film.css";

export { preloadFilm } from "../film/player";

/** Fiche prête, film pas encore prêt : l'avancement du chargement est relu à ce rythme (§5.5, net.ts readyVerdict). */
const READY_CHECK_MS = 100;

/**
 * La bande-son du film (T3, web/src/lib/filmSound.ts), branchée sur l'horloge
 * du film : `tick` reçoit l'instant à chaque rafraîchissement et à chaque seek.
 */
export interface FilmSound {
  tick(t: number): void;
  pause(): void;
  setMuted(muted: boolean): void;
  dispose(): void;
}

interface Props {
  card: CardData;
  lang: Lang;
  phase: Phase;
  onReady?: () => void;
  /** La lecture demande un geste : l'attente montre la pilule « Ouvrir mon dossier ». */
  onGesture?: () => void;
  /** Sous l'arrêt sur image : la fiche peut se monter, invisible (plan.stageAt). */
  onStage?: () => void;
  onHandoff: () => void;
  onDone: () => void;
  /** Un toucher sur la scène (CardPage : passer). */
  onTap?: () => void;
}

declare global {
  interface Window {
    __film?: { plan: FilmPlan; seek(t: number): void; hold(on: boolean): void; stats(): FilmStats };
  }
}

/** Une lecture du film, pour son événement : la pilule montrée, la lecture commencée, l'événement parti. */
interface Reading {
  gesture: boolean;
  started: boolean;
  sent: boolean;
  send(outcome: FilmOutcome): void;
}

export function Film(props: Props) {
  return <FilmView {...props} onFail={props.onDone} />;
}

function FilmView({ card, lang, phase, onReady, onGesture, onStage, onHandoff, onDone, onTap, onFail }: Props & { onFail: () => void }) {
  const { t: tr } = useT();
  const plan = useMemo(() => filmPlan(card), [card]);
  const frameRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const stillRef = useRef<HTMLCanvasElement>(null);
  const player = useRef<FilmPlayer | null>(null);
  const sound = useRef<FilmSound | null>(null);
  const [time, setTime] = useState(0);
  const [muted, setMuted] = useState(readMuted);
  const cb = useRef({ onReady, onGesture, onStage, onHandoff, onDone, onFail });
  cb.current = { onReady, onGesture, onStage, onHandoff, onDone, onFail };
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const cues = useRef({ star: 0, staged: false, handed: false, done: false });
  /** L'événement `film` (§5.6), une fois par lecture : la pilule a-t-elle été montrée, la lecture a-t-elle commencé. */
  const reading = useRef<Reading>({ gesture: false, started: false, sent: false, send: () => undefined });

  // Les repères : une vibration par étoile, une longue au flash ; le relais au sommet, la fin après.
  const cue = useRef<(t: number) => void>(() => undefined);
  cue.current = (t: number) => {
    const c = cues.current;
    const live = phaseRef.current === "playing" || phaseRef.current === "handoff";
    for (const s of plan.stars) {
      if (s.star > c.star && t >= s.at - 1e-6) {
        c.star = s.star;
        if (live) buzz(12);
      }
    }
    sound.current?.tick(t);
    if (!live) return;
    if (!c.staged && t >= plan.stageAt - 1e-6) {
      c.staged = true;
      cb.current.onStage?.();
    }
    if (!c.handed && t >= plan.handoffAt - 1e-6) {
      c.handed = true;
      buzz(40);
      cb.current.onHandoff();
    }
    if (!c.done && t >= plan.duration - 1e-6) {
      c.done = true;
      reading.current.send(player.current?.stats().aborted ? "error" : "played");
      cb.current.onDone();
    }
  };

  // Le lecteur : chargement, première image, puis prêt (ou geste demandé) ; sinon le repli.
  useEffect(() => {
    const host = frameRef.current;
    const cover = coverRef.current;
    if (!host || !cover) return;
    cues.current = { star: 0, staged: false, handed: false, done: false };
    const p = createFilmPlayer({
      plan,
      host,
      cover,
      onTime: (t) => {
        // rendu tout de suite, dans le rafraîchissement de l'image : le HUD ne retarde pas d'un cran
        flushSync(() => setTime(t));
        cue.current(t);
      },
      onStill: (v) => paintStill(v, stillRef.current, plan.tone),
    });
    player.current = p;
    let settled = false;
    const needed: FileId[] = ["poursuite", plan.ending];
    // L'événement `film` : ce qu'il est advenu de cette lecture, une seule fois, sans rien de personnel.
    const r: Reading = { gesture: false, started: false, sent: false, send: () => undefined };
    r.send = (outcome) => {
      if (r.sent) return;
      r.sent = true;
      const s = p.stats();
      const net = filmNet();
      api.track("film", null, {
        ...filmReport({
          outcome,
          variant: s.quality,
          bytes: net.bytes,
          loadMs: filmLoadMs(needed),
          startMs: s.startMs,
          dropped: r.started ? s.dropped : null,
          switchMs: s.switchMs,
          bps: net.bps,
          inApp: inAppBrowser(navigator.userAgent),
          gesture: r.gesture,
        }),
      });
    };
    reading.current = r;
    // la page fermée ou quittée en cours de route : React ne démonte rien, on le dit ici
    const onHide = () => r.send(interruptedOutcome({ closed: false, started: r.started, gesture: r.gesture }));
    window.addEventListener("pagehide", onHide);
    // Le délai d'abandon (§5.5) : en temps d'onglet visible seulement, et sur
    // l'avancement réel du chargement. Le reste arrive à temps : on attend ;
    // sinon la fiche se pose tout de suite, sans attendre le délai pour rien.
    const clock = new VisibleClock(performance.now(), !document.hidden);
    const stop = () => {
      settled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
    const fail = (outcome: FilmOutcome) => {
      if (settled) return;
      stop();
      r.send(outcome);
      cb.current.onFail();
    };
    const check = () => {
      if (settled) return;
      const visibleMs = clock.at(performance.now(), !document.hidden);
      // onglet caché : rien ne se décide dans le dos de la personne
      if (document.hidden) return;
      if (readyVerdict({ visibleMs, remainingBytes: filmRemaining(needed), bps: filmNet().bps }) === "give-up") fail("timeout");
    };
    const onVis = () => check();
    const timer = window.setInterval(check, READY_CHECK_MS);
    document.addEventListener("visibilitychange", onVis);
    check();
    p.prepare().then(
      (ready) => {
        if (settled) return;
        stop();
        if (ready === "gesture" && cb.current.onGesture) {
          r.gesture = true;
          cb.current.onGesture();
        } else cb.current.onReady?.();
      },
      () => fail(canPlayFilm() ? "error" : "nocodec"),
    );
    if (import.meta.env.DEV || isMock()) window.__film = { plan, seek: p.seek, hold: p.hold, stats: p.stats };
    return () => {
      stop();
      window.removeEventListener("pagehide", onHide);
      // démontée avant la fin : passée (la révélation close), pilule jamais touchée, ou page quittée
      r.send(interruptedOutcome({ closed: phaseRef.current === "done", started: r.started, gesture: r.gesture }));
      p.dispose();
      player.current = null;
      if (window.__film?.plan === plan) delete window.__film;
    };
  }, [plan]);

  // La lecture : seulement en « playing » et « handoff », onglet visible.
  useEffect(() => {
    const p = player.current;
    if (!p || (phase !== "playing" && phase !== "handoff")) return;
    reading.current.started = true;
    p.play();
    const onVis = () => {
      if (document.hidden) {
        p.pause();
        sound.current?.pause();
      } else p.play();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [phase]);

  // La bande-son (§18.39, lib/filmSound.ts) : créée avec le plan, libérée au démontage.
  useEffect(() => {
    const s = createFilmSound(plan);
    sound.current = s;
    return () => {
      s.dispose();
      if (sound.current === s) sound.current = null;
    };
  }, [plan]);

  const toggleSound = () => {
    const m = !muted;
    setMuted(m);
    writeMuted(m);
    if (!m) unlockAudio();
    sound.current?.setMuted(m);
  };

  const hud = hudAt(plan, time, lang);
  const landed = hud.video === null;
  const frozen = hud.freeze !== null;
  useEffect(() => {
    if (frozen) ensureStill(stillRef.current, plan.tone);
  }, [frozen, plan]);
  const vars = {
    "--film-light": plan.tone.light,
    "--film-shadow": plan.tone.shadow,
    "--sx": `${hud.shake[0]}px`,
    "--sy": `${hud.shake[1]}px`,
  } as CSSProperties;

  return (
    <>
      <div className={`film-stage${landed ? " is-landed" : ""}`} style={vars} aria-hidden="true" onClick={landed ? undefined : onTap}>
        <div ref={frameRef} className={`film-frame${hud.freeze ? " is-frozen" : ""}`} data-frame={hud.frame} data-shot={hud.shot}>
          {/* les deux balises vidéo sont posées ici par le lecteur */}
          <div ref={coverRef} className="film-cover" />
          {/* l'arrêt sur image en deux tons, tiré pendant l'attente (freeze.ts) */}
          <canvas ref={stillRef} className="film-video film-still" />
          <FilmHud plan={plan} hud={hud} lang={lang} />
        </div>
        {hud.flash > 0 && <div className="film-flash" style={{ opacity: hud.flash }} />}
      </div>
      {phase === "playing" && (
        <button type="button" className="sound-btn film-sound" aria-pressed={!muted} aria-label={muted ? tr.reveal.unmute : tr.reveal.mute} title={muted ? tr.reveal.unmute : tr.reveal.mute} onClick={toggleSound}>
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
