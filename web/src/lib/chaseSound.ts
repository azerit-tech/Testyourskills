// Le son de la poursuite (§18.33), synthétisé (Web Audio, aucun fichier) : une
// sirène à deux tons qui monte avec le niveau, et un « clac » sec à chaque
// étoile. Dans le contexte audio de la page (lib/audio.ts), débloqué par un
// geste ; rien n'est créé tant que le son est coupé.
import { sharedAudio } from "./audio";

export interface ChaseSound {
  /** La sirène démarre (première étoile) ; `level` 1 à 6 règle son volume. */
  siren(level: number): void;
  /** Une étoile s'allume. */
  clack(): void;
  /** La voiture freine : la sirène retombe et se tait. */
  stop(): void;
  setMuted(muted: boolean): void;
  dispose(): void;
}

const VOLUME = 0.5;
/** Deux tons, comme une sirène européenne, 0,45 s chacun. */
const TONES = [660, 880];
const HALF = 0.45;

export function createChaseSound(muted: boolean): ChaseSound {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let osc: OscillatorNode | null = null;
  let sirenGain: GainNode | null = null;
  let timer = 0;
  let isMuted = muted;
  let disposed = false;

  const start = (): boolean => {
    if (disposed || isMuted) return false;
    if (ctx && master) return true;
    ctx = sharedAudio();
    if (!ctx) return false;
    master = ctx.createGain();
    master.gain.value = VOLUME;
    master.connect(ctx.destination);
    return true;
  };

  const schedule = () => {
    if (!ctx || !osc) return;
    // deux tons d'avance, toujours : la sirène tient même si l'onglet ralentit les minuteries
    const now = ctx.currentTime;
    osc.frequency.cancelScheduledValues(now);
    for (let i = 0; i < 4; i++) osc.frequency.setValueAtTime(TONES[(Math.floor(now / HALF) + i) % 2], now + i * HALF);
  };

  return {
    siren(level) {
      if (!start() || !ctx || !master) return;
      if (!osc) {
        osc = ctx.createOscillator();
        osc.type = "triangle";
        const band = ctx.createBiquadFilter();
        band.type = "lowpass";
        band.frequency.value = 1800;
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0;
        osc.connect(band).connect(sirenGain).connect(master);
        osc.start();
        schedule();
        timer = window.setInterval(schedule, HALF * 1000);
      }
      sirenGain?.gain.setTargetAtTime(0.05 + 0.025 * Math.min(6, level), ctx.currentTime, 0.15);
    },
    clack() {
      if (!start() || !ctx || !master) return;
      const t = ctx.currentTime;
      // un claquement : une onde carrée très brève qui tombe d'une octave
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.setValueAtTime(1400, t);
      o.frequency.exponentialRampToValueAtTime(500, t + 0.06);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.1);
    },
    stop() {
      if (!ctx || !osc || !sirenGain) return;
      const t = ctx.currentTime;
      window.clearInterval(timer);
      osc.frequency.cancelScheduledValues(t);
      osc.frequency.setValueAtTime(osc.frequency.value, t);
      osc.frequency.exponentialRampToValueAtTime(260, t + 0.7);
      sirenGain.gain.setTargetAtTime(0, t, 0.2);
      const o = osc;
      window.setTimeout(() => o.stop(), 1500);
      osc = null;
    },
    setMuted(m) {
      isMuted = m;
      if (master && ctx) master.gain.setTargetAtTime(m ? 0 : VOLUME, ctx.currentTime, 0.05);
    },
    dispose() {
      disposed = true;
      window.clearInterval(timer);
      try {
        osc?.stop();
      } catch {
        /* déjà arrêtée */
      }
      master?.disconnect();
      osc = null;
      master = null;
    },
  };
}
