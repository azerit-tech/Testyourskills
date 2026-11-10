// Le film de la poursuite (§18.36), joué : même contrat que Chase et Walkout3D
// envers CardPage. « ready » : les deux balises sont chargées et posées sur
// leur première image (l'attente peut se lever, onReady) ; si la lecture
// demande un geste, onGesture (l'attente montre la pilule). « playing » : la
// vidéo joue, le HUD suit son horloge. Au sommet du flash, la fiche se pose
// (onHandoff) ; à la fin du flash, la scène s'efface (onDone). Onglet caché :
// tout s'arrête. Replis (§5.5) : film absent, illisible ou pas prêt 4 s après
// la fiche, la poursuite 2D joue à sa place ; erreur en cours, flash immédiat.
// Sans Three.js ni WebGL. Muet : la bande-son (T3) se branche sur `FilmSound`.
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { flushSync } from "react-dom";
import type { CardData, Lang } from "../../../shared/types";
import { filmPlan, hudAt, type FilmPlan } from "../../../shared/film";
import { useT } from "../i18n";
import { isMock } from "../lib/api";
import { readMuted, unlockAudio, writeMuted } from "../lib/audio";
import { buzz } from "../lib/haptics";
import { createFilmPlayer, type FilmPlayer, type FilmStats } from "../film/player";
import { FilmHud } from "../film/FilmHud";
import type { Phase } from "./Reveal";
import "../card/fonts.css";
import "../film/film.css";

export { preloadFilm } from "../film/player";

/** La poursuite 2D, repli du film : son module seul, chargé seulement s'il le faut. */
const Chase = lazy(() => import("./Chase").then((m) => ({ default: m.Chase })));

/** Le film n'est pas prêt ce temps-là après la fiche : la poursuite 2D joue à sa place (§5.5). */
const READY_WAIT_MS = 4000;

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
  /** Comparaison : le film joue celui de la carte principale. */
  double: boolean;
  phase: Phase;
  onReady?: () => void;
  /** La lecture demande un geste : l'attente montre la pilule « Ouvrir mon dossier ». */
  onGesture?: () => void;
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

export function Film(props: Props) {
  const [fallback, setFallback] = useState(false);
  if (fallback) {
    const { onGesture: _g, ...rest } = props;
    return (
      <Suspense fallback={null}>
        <Chase {...rest} />
      </Suspense>
    );
  }
  return <FilmView {...props} onFail={() => setFallback(true)} />;
}

function FilmView({ card, lang, phase, onReady, onGesture, onHandoff, onDone, onTap, onFail }: Props & { onFail: () => void }) {
  const { t: tr } = useT();
  const plan = useMemo(() => filmPlan(card), [card]);
  const frameRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const player = useRef<FilmPlayer | null>(null);
  const sound = useRef<FilmSound | null>(null);
  const [time, setTime] = useState(0);
  const [muted, setMuted] = useState(readMuted);
  const cb = useRef({ onReady, onGesture, onHandoff, onDone, onFail });
  cb.current = { onReady, onGesture, onHandoff, onDone, onFail };
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const cues = useRef({ star: 0, handed: false, done: false });

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
    if (!c.handed && t >= plan.handoffAt - 1e-6) {
      c.handed = true;
      buzz(40);
      cb.current.onHandoff();
    }
    if (!c.done && t >= plan.duration - 1e-6) {
      c.done = true;
      cb.current.onDone();
    }
  };

  // Le lecteur : chargement, première image, puis prêt (ou geste demandé) ; sinon le repli.
  useEffect(() => {
    const host = frameRef.current;
    const cover = coverRef.current;
    if (!host || !cover) return;
    cues.current = { star: 0, handed: false, done: false };
    const p = createFilmPlayer({
      plan,
      host,
      cover,
      onTime: (t) => {
        // rendu tout de suite, dans le rafraîchissement de l'image : le HUD ne retarde pas d'un cran
        flushSync(() => setTime(t));
        cue.current(t);
      },
    });
    player.current = p;
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cb.current.onFail();
    };
    const timer = window.setTimeout(fail, READY_WAIT_MS);
    p.prepare().then((r) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (r === "gesture" && cb.current.onGesture) cb.current.onGesture();
      else cb.current.onReady?.();
    }, fail);
    if (import.meta.env.DEV || isMock()) window.__film = { plan, seek: p.seek, hold: p.hold, stats: p.stats };
    return () => {
      settled = true;
      window.clearTimeout(timer);
      p.dispose();
      player.current = null;
      if (window.__film?.plan === plan) delete window.__film;
    };
  }, [plan]);

  // La lecture : seulement en « playing » et « handoff », onglet visible.
  useEffect(() => {
    const p = player.current;
    if (!p || (phase !== "playing" && phase !== "handoff")) return;
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

  useEffect(
    () => () => {
      sound.current?.dispose();
      sound.current = null;
    },
    [],
  );

  const toggleSound = () => {
    const m = !muted;
    setMuted(m);
    writeMuted(m);
    if (!m) unlockAudio();
    sound.current?.setMuted(m);
  };

  const hud = hudAt(plan, time, lang);
  const landed = hud.video === null;
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
