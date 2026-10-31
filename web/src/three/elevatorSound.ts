// Le son de l'ascenseur, synthétisé en direct (Web Audio, aucun fichier) :
// le frein qui se relâche au départ, le moteur qui ronfle et le souffle de la
// gaine qui suivent la vitesse de la cabine, le « ding » de l'arrivée, le
// moteur des portes. Piloté par le temps de la séquence (walkout.ts).

export interface ElevatorCues {
  depart: number;
  arrive: number;
  doors: number;
}

export interface ElevatorSound {
  /** À chaque image : temps de la séquence (s) et vitesse de la cabine (0 → 1). */
  update(t: number, speed: number): void;
  setMuted(muted: boolean): void;
  dispose(): void;
}

const VOLUME = 0.55;

export function createElevatorSound(cues: ElevatorCues, muted: boolean): ElevatorSound {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let hum: { gain: GainNode; osc: OscillatorNode; wind: GainNode } | null = null;
  let isMuted = muted;
  let last = -1;
  let disposed = false;

  const noiseBuffer = (c: AudioContext, seconds: number) => {
    const b = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  };

  const start = () => {
    if (ctx || disposed) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      ctx = new Ctor();
    } catch {
      return;
    }
    void ctx.resume().catch(() => undefined);
    master = ctx.createGain();
    master.gain.value = isMuted ? 0 : VOLUME;
    master.connect(ctx.destination);
    // le moteur : une dent de scie grave, filtrée, et son octave
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 46;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 170;
    const sub = ctx.createOscillator();
    sub.frequency.value = 92;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.35;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(low);
    sub.connect(subGain).connect(low);
    low.connect(gain).connect(master);
    // la gaine : un souffle de bruit filtré
    const air = ctx.createBufferSource();
    air.buffer = noiseBuffer(ctx, 2);
    air.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 420;
    band.Q.value = 0.6;
    const wind = ctx.createGain();
    wind.gain.value = 0;
    air.connect(band).connect(wind).connect(master);
    osc.start();
    sub.start();
    air.start();
    hum = { gain, osc, wind };
  };

  /** Le frein qui se relâche : un choc sourd. */
  const thunk = (c: AudioContext, out: AudioNode, at: number, level: number) => {
    const o = c.createOscillator();
    o.frequency.setValueAtTime(78, at);
    o.frequency.exponentialRampToValueAtTime(38, at + 0.35);
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.45);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + 0.5);
  };

  /** Le « ding » : une cloche (partiels inharmoniques), longue extinction. */
  const ding = (c: AudioContext, out: AudioNode, at: number) => {
    const base = 1318.5;
    [
      [1, 0.22, 2.2],
      [2.0, 0.06, 1.2],
      [2.76, 0.05, 0.9],
      [5.4, 0.015, 0.5],
    ].forEach(([ratio, level, decay]) => {
      const o = c.createOscillator();
      o.frequency.value = base * ratio!;
      const g = c.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(level!, at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0005, at + decay!);
      o.connect(g).connect(out);
      o.start(at);
      o.stop(at + decay! + 0.1);
    });
  };

  /** Le moteur des portes : un bruit filtré qui monte, puis la butée. */
  const doorRun = (c: AudioContext, out: AudioNode, at: number) => {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c, 1.2);
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(260, at);
    f.frequency.linearRampToValueAtTime(900, at + 0.5);
    f.frequency.linearRampToValueAtTime(320, at + 1.0);
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.09, at + 0.15);
    g.gain.linearRampToValueAtTime(0.06, at + 0.8);
    g.gain.linearRampToValueAtTime(0, at + 1.05);
    src.connect(f).connect(g).connect(out);
    src.start(at);
    src.stop(at + 1.2);
    thunk(c, out, at + 1.0, 0.12);
  };

  const crossed = (t: number, at: number) => last < at && t >= at;

  return {
    update(t, speed) {
      if (disposed || t < 0) {
        last = t;
        return;
      }
      start();
      if (!ctx || !master || !hum) return;
      const now = ctx.currentTime;
      // retour en arrière (mise au point) : on rejoue les repères
      if (t < last - 0.5) last = -1;
      if (Math.abs(t - last) < 0.5) {
        if (crossed(t, cues.depart)) thunk(ctx, master, now, 0.32);
        if (crossed(t, cues.arrive)) {
          thunk(ctx, master, now, 0.18);
          ding(ctx, master, now + 0.08);
        }
        if (crossed(t, cues.doors)) doorRun(ctx, master, now);
      }
      // le moteur tourne de l'approche du départ à l'arrivée, plus fort et plus aigu avec la vitesse
      const running = t >= cues.depart - 0.2 && t < cues.arrive + 0.2;
      hum.gain.gain.setTargetAtTime(running ? 0.05 + 0.11 * speed : 0, now, 0.12);
      hum.osc.frequency.setTargetAtTime(44 + 10 * speed, now, 0.2);
      hum.wind.gain.setTargetAtTime(running ? 0.13 * speed : 0, now, 0.2);
      last = t;
    },
    setMuted(m) {
      isMuted = m;
      if (ctx && master) master.gain.setTargetAtTime(m ? 0 : VOLUME, ctx.currentTime, 0.05);
    },
    dispose() {
      disposed = true;
      void ctx?.close().catch(() => undefined);
      ctx = null;
    },
  };
}
