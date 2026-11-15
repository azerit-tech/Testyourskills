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
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { flushSync } from "react-dom";
import type { CardData, Lang } from "../../../shared/types";
import { FPS, filmPlan, hudAt, samePlan, type FilmPlan } from "../../../shared/film";
import { useT } from "../i18n";
import { api, isMock } from "../lib/api";
import { readMuted, unlockAudio, writeMuted } from "../lib/audio";
import { createFilmSound } from "../lib/filmSound";
import { buzz } from "../lib/haptics";
import { inAppBrowser } from "../lib/sharing";
import { canPlayFilm, createFilmPlayer, type FilmPlayer, type FilmStats } from "../film/player";
import { FilmHud, FilmRadio } from "../film/FilmHud";
import { filmVideos } from "../film/unlock";
import { ensureStill, paintStill } from "../film/freeze";
import type { FileId } from "../film/files";
import { filmLoadMs, filmNet, filmRemaining } from "../film/loader";
import { readyVerdict, VisibleClock } from "../film/net";
import { filmReport, interruptedOutcome, type FilmOutcome } from "../film/report";
import { filmTrace, filmTraceMount } from "../film/trace";
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
  /** La lecture demande un geste : l'attente montre la pilule « Lancer la poursuite ». */
  onGesture?: () => void;
  /** Sous l'arrêt sur image : la fiche peut se monter, invisible (plan.stageAt). */
  onStage?: () => void;
  onHandoff: () => void;
  onDone: () => void;
  /** Rejoué depuis la tête de la fiche (§18.48) : la révélation a eu son événement `film`, celui-ci n'en envoie pas. */
  replay?: boolean;
}

declare global {
  interface Window {
    __film?: { plan: FilmPlan; seek(t: number): void; hold(on: boolean): void; stats(): FilmStats };
  }
}

/**
 * Le flash tel qu'il se voit : plein en deux images (80 ms) au lieu de quatre, puis, la fiche
 * posée, effacé en trois images au lieu de six. Le crème à mi-opacité sur l'arrêt sur image ou
 * sur la fiche vire au kaki : il ne doit durer qu'un instant.
 */
export function flashLook(flash: number, landed: boolean): number {
  if (flash <= 0) return 0;
  return landed ? Math.max(0, Math.min(1, (flash - 0.5) * 2)) : Math.min(1, flash * 2);
}

/** Le fond du bureau : une image toutes les 125 ms au plus (8 par seconde), sur une toile minuscule. */
const BACK_MS = 125;
const BACK_W = 18;
const BACK_H = 32;
let backAt = 0;

/**
 * Au bureau, derrière la colonne du film (§18.48) : l'image du film, réduite à
 * 18 × 32 points, adoucie et assombrie dans la toile, puis agrandie par le
 * navigateur (le lissage de l'agrandissement fait le flou). Aucun filtre CSS
 * plein écran : la toile ne coûte presque rien à tirer. Rien sur téléphone, où
 * la colonne couvre l'écran. Au gel, l'arrêt sur image en deux tons.
 */
function paintBack(back: HTMLCanvasElement | null, still: HTMLCanvasElement | null, frozen: boolean) {
  if (!back) return;
  const now = performance.now();
  if (now - backAt < BACK_MS) return;
  // la colonne fait toute la largeur : pas de fond à tirer
  if (window.innerWidth <= Math.min(window.innerHeight, 900) * (9 / 16) + 2) return;
  backAt = now;
  const g = back.getContext("2d");
  if (!g) return;
  const [a, b] = filmVideos();
  const src = frozen && still?.dataset.ready !== undefined ? still : a.style.visibility === "visible" ? a : b;
  try {
    g.filter = "blur(1.5px)";
    g.drawImage(src, -2, -2, BACK_W + 4, BACK_H + 4);
    g.filter = "none";
    g.fillStyle = "rgb(12 13 27 / 0.62)";
    g.fillRect(0, 0, BACK_W, BACK_H);
  } catch {
    /* image pas encore décodée : la suivante */
  }
}

/** Une révélation, pour son événement : la pilule montrée, la lecture commencée, l'événement parti. */
interface Reading {
  gesture: boolean;
  started: boolean;
  sent: boolean;
}

export function Film(props: Props) {
  return <FilmView {...props} onFail={props.onDone} />;
}

/**
 * Le plan, stable tant que la fiche joue le même film. Le parent peut repasser
 * un objet neuf au même contenu (la fiche d'un dossier, recalculée) : le plan
 * reste le même objet, donc ni le lecteur, ni la bande-son, ni l'arrêt sur
 * image ne sont recréés. Recalculé seulement quand l'objet change.
 */
function useFilmPlan(card: CardData): FilmPlan {
  const kept = useRef<{ card: CardData; plan: FilmPlan } | null>(null);
  if (kept.current?.card !== card) {
    const next = filmPlan(card);
    kept.current = { card, plan: kept.current && samePlan(kept.current.plan, next) ? kept.current.plan : next };
  }
  return kept.current.plan;
}

function FilmView({ card, lang, phase, onReady, onGesture, onStage, onHandoff, onDone, replay = false, onFail }: Props & { onFail: () => void }) {
  const { t: tr } = useT();
  const plan = useFilmPlan(card);
  const planRef = useRef(plan);
  planRef.current = plan;
  const frameRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const stillRef = useRef<HTMLCanvasElement>(null);
  const backRef = useRef<HTMLCanvasElement>(null);
  /** Le dernier lecteur créé (ses mesures servent à l'événement, même libéré). */
  const player = useRef<FilmPlayer | null>(null);
  /** Le lecteur prêt (posé sur sa première image) : la lecture ne part que sur lui. */
  const [prepared, setPrepared] = useState<FilmPlayer | null>(null);
  const sound = useRef<FilmSound | null>(null);
  const [time, setTime] = useState(0);
  const [muted, setMuted] = useState(readMuted);
  const cb = useRef({ onReady, onGesture, onStage, onHandoff, onDone, onFail });
  cb.current = { onReady, onGesture, onStage, onHandoff, onDone, onFail };
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const cues = useRef({ star: 0, staged: false, handed: false, done: false });
  /**
   * L'événement `film` (§5.6), une fois par révélation, pas par lecteur : un
   * lecteur recréé (le plan a changé) continue la même révélation.
   */
  const reading = useRef<Reading>({ gesture: false, started: false, sent: false });
  const send = useRef<(outcome: FilmOutcome) => void>(() => undefined);
  send.current = (outcome) => {
    const r = reading.current;
    const p = player.current;
    if (r.sent || !p) return;
    r.sent = true;
    filmTrace("issue", { outcome, gesture: r.gesture, started: r.started, replay });
    if (replay) return;
    const s = p.stats();
    const net = filmNet();
    api.track("film", null, {
      ...filmReport({
        outcome,
        variant: s.quality,
        bytes: net.bytes,
        loadMs: filmLoadMs(["poursuite", planRef.current.ending]),
        startMs: s.startMs,
        dropped: r.started ? s.dropped : null,
        switchMs: s.switchMs,
        bps: net.bps,
        inApp: inAppBrowser(navigator.userAgent),
        gesture: r.gesture,
      }),
    });
  };

  // L'issue de la révélation quand le film s'en va avant sa fin : au démontage
  // (passée, pilule jamais touchée), ou la page fermée ou quittée en route
  // (React ne démonte rien, on le dit ici). Déclaré avant le lecteur : au
  // démontage, l'issue part avant qu'il soit libéré. Une révélation neuve à
  // chaque montage (StrictMode rejoue les effets en dev) : avant le lecteur,
  // qui la reprend.
  useEffect(() => {
    reading.current = { gesture: false, started: false, sent: false };
    const interrupted = (closed: boolean) => {
      const r = reading.current;
      send.current(interruptedOutcome({ closed, started: r.started, gesture: r.gesture }));
    };
    const onHide = () => interrupted(false);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      interrupted(phaseRef.current === "done");
    };
  }, []);

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
      filmTrace("fiche:montée", { ft: t });
      cb.current.onStage?.();
    }
    if (!c.handed && t >= plan.handoffAt - 1e-6) {
      c.handed = true;
      filmTrace("relais", { ft: t });
      buzz(40);
      cb.current.onHandoff();
    }
    if (!c.done && t >= plan.duration - 1e-6) {
      c.done = true;
      filmTrace("film:fin", { ft: t });
      send.current(player.current?.stats().aborted ? "error" : "played");
      cb.current.onDone();
    }
  };

  // Le lecteur : chargement, première image, puis prêt (ou geste demandé) ; sinon le repli.
  // Un par plan : le plan ne change que si la fiche joue un autre film (useFilmPlan).
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
        paintBack(backRef.current, stillRef.current, t >= plan.freeze / FPS);
      },
      onStill: (v) => paintStill(v, stillRef.current, plan.tone),
    });
    player.current = p;
    const untrace = filmTraceMount({ stats: p.stats, plan: { duration: plan.duration, cut: plan.cut, endVideo: plan.endVideo, level: plan.level } });
    let settled = false;
    const needed: FileId[] = ["poursuite", plan.ending];
    const r = reading.current;
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
      filmTrace("repli", { outcome });
      stop();
      send.current(outcome);
      cb.current.onFail();
    };
    const check = () => {
      if (settled) return;
      const visibleMs = clock.at(performance.now(), !document.hidden);
      // onglet caché : rien ne se décide dans le dos de la personne
      if (document.hidden) return;
      const facts = { visibleMs, remainingBytes: filmRemaining(needed), bps: filmNet().bps };
      if (readyVerdict(facts) === "give-up") {
        filmTrace("délai", { visible: Math.round(visibleMs), reste: facts.remainingBytes, bps: facts.bps === null ? null : Math.round(facts.bps) });
        fail("timeout");
      }
    };
    const onVis = () => check();
    const timer = window.setInterval(check, READY_CHECK_MS);
    document.addEventListener("visibilitychange", onVis);
    check();
    filmTrace("prepare:début");
    p.prepare().then(
      (ready) => {
        filmTrace(`prepare:${ready}`, { settled });
        if (settled) return;
        stop();
        // Prêt : la lecture part dessus dès la phase « playing », ou tout de suite
        // si elle y est déjà (lecteur recréé en route : jamais de lecteur prêt qui attend).
        setPrepared(p);
        if (ready === "gesture" && cb.current.onGesture) {
          r.gesture = true;
          filmTrace("pilule:montrée");
          cb.current.onGesture();
        } else cb.current.onReady?.();
      },
      (e: unknown) => {
        filmTrace("prepare:erreur", { message: e instanceof Error ? `${e.name}: ${e.message}` : String(e), settled });
        fail(canPlayFilm() ? "error" : "nocodec");
      },
    );
    if (import.meta.env.DEV || isMock()) window.__film = { plan, seek: p.seek, hold: p.hold, stats: p.stats };
    return () => {
      filmTrace("démontage", { phase: phaseRef.current });
      stop();
      // Libéré : l'issue de la révélation ne part pas d'ici (un lecteur recréé la continue),
      // mais au démontage du film, plus haut.
      setPrepared((cur) => (cur === p ? null : cur));
      untrace();
      p.dispose();
      if (window.__film?.plan === plan) delete window.__film;
    };
  }, [plan]);

  // La lecture : seulement en « playing » et « handoff », onglet visible, sur le lecteur prêt.
  useEffect(() => {
    filmTrace("phase", { phase, prepared: !!prepared });
    const p = prepared;
    if (!p || (phase !== "playing" && phase !== "handoff")) return;
    reading.current.started = true;
    filmTrace("play()", { phase, hidden: document.hidden });
    p.play();
    const onVis = () => {
      if (document.hidden) {
        filmTrace("pause() : onglet caché");
        p.pause();
        sound.current?.pause();
      } else {
        filmTrace("play() : onglet visible");
        p.play();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [phase, prepared]);

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

  // Un toucher sur l'image ne fait rien (§18.48) : seul « Passer » saute le film. Il reste noté dans la trace.
  const onTapTraced = () => filmTrace("toucher", { phase });

  const hud = hudAt(plan, time, lang);
  const landed = hud.video === null;
  const frozen = hud.freeze !== null;
  /** L'arrêt sur image et l'éclair : plus rien à passer ni à régler, les boutons s'effacent. */
  const quiet = hud.phase === "freeze" || hud.phase === "flash" || hud.phase === "over";
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
      <div className={`film-stage${landed ? " is-landed" : ""}${quiet ? " is-quiet" : ""}`} style={vars} aria-hidden="true" onClick={landed ? undefined : onTapTraced}>
        {/* au bureau, autour de la colonne : l'image du film floutée et assombrie, et les bandes d'encre sur toute la largeur */}
        <canvas ref={backRef} className="film-back" width={18} height={32} />
        <div className="film-wide film-wide-top" style={{ transform: `translateY(${(hud.bands - 1) * 100}%)` }} />
        <div className="film-wide film-wide-bottom" style={{ transform: `translateY(${(1 - hud.bands) * 100}%)` }} />
        <div ref={frameRef} className={`film-frame${hud.freeze ? " is-frozen" : ""}`} data-frame={hud.frame} data-shot={hud.shot}>
          {/* les deux balises vidéo sont posées ici par le lecteur */}
          <div ref={coverRef} className="film-cover" />
          {/* l'arrêt sur image en deux tons, tiré pendant l'attente (freeze.ts) */}
          <canvas ref={stillRef} className="film-video film-still" />
          <FilmHud plan={plan} hud={hud} lang={lang} />
          {/* rejoué depuis la fiche, le film se charge au toucher : trois points tant qu'il n'est pas prêt */}
          {!prepared && phase === "playing" && (
            <div className="film-loading">
              <i />
              <i />
              <i />
            </div>
          )}
        </div>
        {/* téléphone couché : la radio sur toute la largeur de la bande d'encre, hors de la colonne (film.css) */}
        <div className="film-radio-wide" style={{ transform: `translateY(${(1 - hud.bands) * 100}%)` }}>
          <FilmRadio radio={hud.radio} />
        </div>
        {flashLook(hud.flash, landed) > 0 && <div className="film-flash" style={{ opacity: flashLook(hud.flash, landed) }} />}
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
