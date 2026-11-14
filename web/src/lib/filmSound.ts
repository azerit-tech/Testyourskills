// La bande-son du film, en direct (§18.39) : la partition (shared/film/sound.ts)
// jouée par la synthèse (filmSynth.ts) sur l'horloge de la vidéo. Le lecteur
// passe l'instant du film à chaque rafraîchissement (`tick`) : le son se cale
// sur l'image présentée, jamais sur l'horloge murale. Il pose les sons par
// petites fenêtres (200 ms d'avance) ; si l'image cale (l'instant ne bouge plus
// depuis 150 ms), il se tait, la pluie exceptée, et reprend calé quand l'image
// repart ; un saut (seek, relance) le recale aussitôt.
//
// Le contexte audio est celui de la page (audio.ts), débloqué par le geste qui
// lance la fiche. S'il reste suspendu (navigateur intégré, iPhone en économie
// d'énergie), le film joue sans son : rien n'attend, rien ne lève d'erreur. Son
// coupé par la personne : aucun nœud n'est créé. Tout est arrêté et débranché à
// la fin du film, à la coupure du son et au démontage.
import type { FilmPlan } from "../../../shared/film";
import { filmScore, type FilmScore } from "../../../shared/film/sound";
import type { FilmSound } from "../components/Film";
import { readMuted, sharedAudio } from "./audio";
import { createFilmSynth, type FilmSynth } from "./filmSynth";

/** Avance de pose : ce qui est dans la fenêtre est engagé. */
const LOOKAHEAD = 0.2;
/** L'instant n'a pas bougé depuis tant de secondes de contexte : l'image cale. */
const STALL = 0.15;
/** Écart toléré entre l'horloge estimée et l'image présentée avant de se recaler. */
const RESYNC = 0.12;
/** Après la fin du film, le temps des dernières extinctions avant de tout libérer. */
const TAIL = 0.8;
/** Un contexte endormi n'est relancé qu'à ce rythme (ms). */
const WAKE_EVERY = 1000;

export interface FilmSoundOptions {
  /** Le contexte audio ; par défaut celui de la page. */
  context?: () => BaseAudioContext | null;
  muted?: boolean;
  /** Horloge en ms pour relancer un contexte endormi (tests). */
  now?: () => number;
  /** Minuteries (tests). */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

/** Ce que le lecteur sait de la bande-son (tests, débogage). */
export interface FilmSoundState {
  built: boolean;
  stalled: boolean;
  /** Instant du film jusqu'où les sons sont posés. */
  scheduledTo: number;
  resyncs: number;
}

export function createFilmSound(plan: FilmPlan, opts: FilmSoundOptions = {}): FilmSound & { state(): FilmSoundState } {
  const score: FilmScore = filmScore(plan);
  const getCtx = opts.context ?? sharedAudio;
  const clock = opts.now ?? (() => performance.now());
  const setTimer = opts.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));

  let muted = opts.muted ?? readMuted();
  let disposed = false;
  let ctx: BaseAudioContext | null = null;
  let synth: FilmSynth | null = null;
  /** L'instant du film à l'heure `ctx` du contexte. */
  let anchor: { film: number; ctx: number } | null = null;
  let scheduledTo = 0;
  let lastT = -1;
  let lastMove = 0;
  let stalled = false;
  let resyncs = 0;
  let lastWake = -Infinity;
  let endTimer: unknown = null;

  /** Latence de sortie : un son posé maintenant s'entend plus tard (casque sans fil : jusqu'à 300 ms). */
  const latency = (c: BaseAudioContext) => {
    const a = c as AudioContext;
    const l = (typeof a.outputLatency === "number" ? a.outputLatency : 0) || (typeof a.baseLatency === "number" ? a.baseLatency : 0);
    return Math.min(0.3, Math.max(0, l || 0));
  };

  /** Le contexte qui tourne, ou null (sans le recréer ni le relancer à chaque image). */
  const running = (): BaseAudioContext | null => {
    if (ctx && ctx.state === "running") return ctx;
    const now = clock();
    if (now - lastWake < WAKE_EVERY) return null;
    lastWake = now;
    try {
      ctx = getCtx();
    } catch {
      ctx = null;
    }
    return ctx && ctx.state === "running" ? ctx : null;
  };

  const teardown = () => {
    if (endTimer !== null) clearTimer(endTimer);
    endTimer = null;
    const s = synth;
    const c = ctx;
    synth = null;
    anchor = null;
    if (!s || !c) return;
    try {
      s.stop(c.currentTime);
    } catch {
      /* contexte fermé */
    }
    setTimer(() => s.disconnect(), 150);
  };

  const resync = (t: number, now: number) => {
    if (!synth || !ctx) return;
    synth.resync(t, now);
    anchor = { film: t, ctx: now };
    scheduledTo = t;
    resyncs++;
    if (stalled) synth.duck(false, now);
    stalled = false;
  };

  const ctxAt = (t: number) => (anchor && ctx ? anchor.ctx + (t - anchor.film) - latency(ctx) : 0);

  return {
    tick(t: number) {
      if (disposed || muted) return;
      if (t >= score.duration && !synth) return;
      const c = running();
      if (!c) {
        // contexte endormi en cours de route : on se recalera à son réveil
        anchor = null;
        return;
      }
      if (!synth) {
        try {
          synth = createFilmSynth(c, score);
        } catch {
          synth = null;
          return;
        }
      }
      const now = c.currentTime;
      if (t !== lastT) {
        const est = anchor ? anchor.film + (now - anchor.ctx) : NaN;
        if (!anchor || stalled || !(Math.abs(t - est) <= RESYNC)) resync(t, now);
        else if (anchor) anchor.film += (t - est) * 0.2; // une dérive lente se rattrape en douceur
        lastT = t;
        lastMove = now;
      } else if (!stalled && anchor && now - lastMove > STALL && t < score.duration) {
        // l'image ne bouge plus : on se tait (la pluie reste), sans rien poser de plus
        stalled = true;
        synth.resync(t, now);
        synth.duck(true, now, true);
      }
      if (stalled || !anchor) return;
      const to = Math.min(score.duration, t + LOOKAHEAD);
      if (to > scheduledTo) {
        synth.schedule(scheduledTo, to, ctxAt);
        scheduledTo = to;
      }
      // tout est posé : on libère après les dernières extinctions
      if (scheduledTo >= score.duration && endTimer === null) {
        const left = Math.max(0, ctxAt(score.duration) - now) + TAIL;
        endTimer = setTimer(teardown, left * 1000);
      }
    },
    pause() {
      if (!synth || !ctx || stalled) return;
      const now = ctx.currentTime;
      stalled = true;
      synth.resync(lastT < 0 ? 0 : lastT, now);
      synth.duck(true, now);
    },
    setMuted(m: boolean) {
      muted = m;
      if (m) teardown();
      else {
        // le geste qui rétablit le son vient de relancer le contexte : on le reprend tout de suite
        lastWake = -Infinity;
        lastT = -1;
      }
    },
    dispose() {
      disposed = true;
      teardown();
    },
    state: () => ({ built: !!synth, stalled, scheduledTo, resyncs }),
  };
}
