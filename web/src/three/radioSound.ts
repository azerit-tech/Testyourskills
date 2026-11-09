// Le son de la plongée, synthétisé en direct (Web Audio, aucun fichier) : le
// vent qui suit la vitesse de la chute, le crépitement de la radio de police à
// chaque étoile, le souffle de la baie traversée, le roulement de batterie du
// carton de fin. Piloté par le temps de la séquence (walkout.ts), qui décide
// des repères ; ici on ne fait que jouer, dans le contexte audio de la page
// (lib/audio.ts), débloqué par un geste.
import { sharedAudio } from "../lib/audio";

export interface RadioSound {
  /** À chaque image : temps de la séquence (s) et vitesse de la chute (0 → 1). */
  update(t: number, speed: number): void;
  /** Une étoile s'allume : squelch et crépitement radio. */
  crackle(): void;
  /** La baie traversée. */
  whoosh(): void;
  /** Le carton de fin : roulement, coup final, accord. */
  sting(): void;
  /** Un feu d'artifice. */
  pop(): void;
  setMuted(muted: boolean): void;
  dispose(): void;
}

const VOLUME = 0.55;

export function createRadioSound(muted: boolean): RadioSound {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let wind: { gain: GainNode; band: BiquadFilterNode } | null = null;
  let isMuted = muted;
  let disposed = false;
  let noise: AudioBuffer | null = null;
  let loop: AudioBufferSourceNode | null = null;

  const noiseBuffer = (c: AudioContext, seconds: number) => {
    const b = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  };

  const start = () => {
    // Son coupé : aucun contexte n'est demandé tant que la personne ne le remet pas.
    if (ctx || disposed || isMuted) return;
    ctx = sharedAudio();
    if (!ctx) return;
    master = ctx.createGain();
    master.gain.value = isMuted ? 0 : VOLUME;
    master.connect(ctx.destination);
    noise = noiseBuffer(ctx, 2);
    // le vent : un souffle de bruit filtré, plus aigu et plus fort avec la vitesse
    const air = ctx.createBufferSource();
    air.buffer = noise;
    air.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 300;
    band.Q.value = 0.5;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    air.connect(band).connect(gain).connect(master);
    air.start();
    loop = air;
    wind = { gain, band };
  };

  const burst = (c: AudioContext, out: AudioNode, at: number, dur: number, type: BiquadFilterType, freq: number, q: number, level: number) => {
    const src = c.createBufferSource();
    src.buffer = noise!;
    src.loopStart = Math.random();
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    src.connect(f).connect(g).connect(out);
    src.start(at, Math.random());
    src.stop(at + dur + 0.05);
    return f;
  };

  const tone = (c: AudioContext, out: AudioNode, at: number, dur: number, type: OscillatorType, from: number, to: number, level: number) => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, at);
    if (to !== from) o.frequency.exponentialRampToValueAtTime(to, at + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + dur + 0.05);
  };

  const ready = () => {
    start();
    return ctx && master && noise ? { c: ctx, out: master, now: ctx.currentTime } : null;
  };

  return {
    update(t, speed) {
      if (disposed || t < 0) return;
      start();
      if (!ctx || !wind) return;
      const now = ctx.currentTime;
      wind.gain.gain.setTargetAtTime(0.22 * speed * speed + 0.03 * speed, now, 0.15);
      wind.band.frequency.setTargetAtTime(220 + 900 * speed, now, 0.2);
    },
    crackle() {
      const r = ready();
      if (!r) return;
      // le squelch qui s'ouvre, deux rafales de parasites, un bip de confirmation
      burst(r.c, r.out, r.now, 0.09, "bandpass", 1900, 3, 0.16);
      burst(r.c, r.out, r.now + 0.11, 0.16, "bandpass", 1500, 1.8, 0.11);
      burst(r.c, r.out, r.now + 0.3, 0.07, "bandpass", 2300, 4, 0.08);
      tone(r.c, r.out, r.now + 0.02, 0.06, "square", 1180, 1180, 0.035);
    },
    whoosh() {
      const r = ready();
      if (!r) return;
      const f = burst(r.c, r.out, r.now, 0.55, "lowpass", 400, 0.8, 0.35);
      f.frequency.setValueAtTime(2600, r.now);
      f.frequency.exponentialRampToValueAtTime(240, r.now + 0.5);
      tone(r.c, r.out, r.now, 0.3, "sine", 180, 60, 0.12);
    },
    sting() {
      const r = ready();
      if (!r) return;
      // roulement de caisse claire qui s'accélère, coup de grosse caisse, accord tenu
      let at = r.now;
      for (let i = 0; i < 14; i++) {
        burst(r.c, r.out, at, 0.07, "highpass", 1800, 0.7, 0.09 + i * 0.012);
        at += 0.11 - i * 0.005;
      }
      tone(r.c, r.out, at, 0.5, "sine", 70, 38, 0.5);
      burst(r.c, r.out, at, 0.25, "lowpass", 900, 0.7, 0.3);
      for (const [f, l] of [
        [110, 0.09],
        [164.8, 0.07],
        [196, 0.06],
        [261.6, 0.05],
      ] as const) {
        tone(r.c, r.out, at + 0.02, 1.6, "triangle", f, f, l);
        tone(r.c, r.out, at + 0.02, 1.2, "sawtooth", f * 2.005, f * 2.005, l * 0.25);
      }
    },
    pop() {
      const r = ready();
      if (!r) return;
      tone(r.c, r.out, r.now, 0.25, "sine", 160, 50, 0.16);
      burst(r.c, r.out, r.now + 0.02, 0.35, "lowpass", 1200, 0.6, 0.12);
    },
    setMuted(m) {
      isMuted = m;
      if (ctx && master) master.gain.setTargetAtTime(m ? 0 : VOLUME, ctx.currentTime, 0.05);
    },
    dispose() {
      disposed = true;
      // le contexte est celui de la page : on arrête le vent et on se débranche, sans le fermer
      try {
        loop?.stop();
      } catch {
        /* déjà arrêté */
      }
      loop = null;
      master?.disconnect();
      master = null;
      wind = null;
      ctx = null;
    },
  };
}
