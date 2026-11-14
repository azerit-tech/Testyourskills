// La synthèse de la bande-son du film (§18.39) : un graphe Web Audio fixe, bâti
// une fois, que la partition (shared/film/sound.ts) pilote par automation de
// paramètres. Aucun fichier, aucun nœud créé par note : les voix tournent en
// continu, leurs gains s'ouvrent et se ferment. Écrit pour un BaseAudioContext :
// le même code joue en direct (filmSound.ts) et se rend hors ligne
// (OfflineAudioContext, renderFilmSound) pour l'écoute.
//
// Le téléphone d'abord : un haut-parleur de téléphone ne rend rien sous
// 150 Hz environ ; les voix graves (basse, grosse caisse, coup sourd) ont donc
// des harmoniques (dents de scie, saturation douce), et la sortie coupe le grave
// inutile sous 45 Hz. En sortie, un limiteur, puis un écrêtage doux plafonné à
// -1 dBFS : jamais de saturation.
import { FPS } from "../../../shared/film";
import { CURVES, type Curve, type FilmScore, type SoundEvent } from "../../../shared/film/sound";

export interface FilmSynth {
  /**
   * Joue les événements et les courbes de la fenêtre [from, to) (secondes du
   * film) ; `ctxAt` donne l'heure du contexte d'un instant du film. Un
   * événement en retard de plus de 50 ms est sauté (une note tenue repart
   * raccourcie).
   */
  schedule(from: number, to: number, ctxAt: (t: number) => number): void;
  /** Efface tout ce qui est prévu après `when`, coupe les voix, pose les courbes à leur valeur à l'instant `t` du film. */
  resync(t: number, when: number): void;
  /** Baisse (vidéo calée, onglet caché) ou rétablit le film ; la pluie reste si `keepRain`. */
  duck(on: boolean, when: number, keepRain?: boolean): void;
  /** Fondu de sortie, puis arrêt de toutes les sources à `when` + 60 ms. */
  stop(when: number): void;
  /** Débranche tout (après stop). */
  disconnect(): void;
  /** Nœuds et sources du graphe (budget, tests). */
  readonly nodeCount: number;
  readonly sourceCount: number;
}

/** Niveau général, avant le limiteur. */
const MASTER = 0.9;
/** Plafond après l'écrêtage doux : -1 dBFS. */
const CEILING = 0.89;

const midiHz = (n: number) => 440 * 2 ** ((n - 69) / 12);
/** Les voix tenues : reprises pour ce qui leur reste après un recalage ; les frappes, elles, sont perdues. */
const SUSTAINED = new Set<SoundEvent["voice"]>(["pad", "nappe"]);

/** Un tirage reproductible : le même bruit à chaque rendu. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function softCurve(drive: number, n = 1024): Float32Array<ArrayBuffer> {
  const c = new Float32Array(n);
  const k = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(drive * x) / k;
  }
  return c;
}

export function createFilmSynth(ctx: BaseAudioContext, score: FilmScore, dest: AudioNode = ctx.destination): FilmSynth {
  const nodes: AudioNode[] = [];
  const sources: AudioScheduledSourceNode[] = [];
  /** Les gains d'enveloppe : coupés à zéro à chaque recalage. */
  const vcas: AudioParam[] = [];
  /** Tous les paramètres automatisés : effacés à chaque recalage. */
  const params: AudioParam[] = [];
  const level = score.level;
  const rnd = prng(0x7e57);

  const reg = <T extends AudioNode>(n: T): T => {
    nodes.push(n);
    return n;
  };
  const gain = (v = 0, vca = false) => {
    const g = reg(ctx.createGain());
    g.gain.value = v;
    params.push(g.gain);
    if (vca) vcas.push(g.gain);
    return g;
  };
  const filter = (type: BiquadFilterType, f: number, q = 0.7) => {
    const b = reg(ctx.createBiquadFilter());
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    params.push(b.frequency);
    return b;
  };
  const osc = (type: OscillatorType, f: number) => {
    const o = reg(ctx.createOscillator());
    o.type = type;
    o.frequency.value = f;
    params.push(o.frequency);
    sources.push(o);
    return o;
  };
  const shaper = (drive: number) => {
    const s = reg(ctx.createWaveShaper());
    s.curve = softCurve(drive);
    return s;
  };
  const chain = (...ns: AudioNode[]) => {
    for (let i = 0; i < ns.length - 1; i++) ns[i].connect(ns[i + 1]);
    return ns[ns.length - 1];
  };
  const noiseBuffer = (channels: number) => {
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(channels, sr * 2, sr);
    for (let c = 0; c < channels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
    }
    return buf;
  };
  const noiseSource = (channels: number) => {
    const s = reg(ctx.createBufferSource());
    s.buffer = noiseBuffer(channels);
    s.loop = true;
    sources.push(s);
    return s;
  };

  // ---- la sortie : film (baissé quand la vidéo cale) et pluie → grave coupé → limiteur → écrêtage doux → plafond
  const out = gain(CEILING);
  const clip = shaper(1.4);
  const limiter = reg(ctx.createDynamicsCompressor());
  limiter.threshold.value = -3;
  limiter.knee.value = 1;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  const hp = filter("highpass", 45, 0.6);
  const master = gain(MASTER);
  chain(master, hp, limiter, clip, out, dest);
  const film = gain(1);
  film.connect(master);
  const rainBus = gain(1);
  rainBus.connect(master);
  const music = gain(0.5);
  music.connect(film);
  /** Les repères (étoile, radio, souffle) : ni ralentis ni filtrés. */
  const ui = gain(0.6);
  ui.connect(film);
  const sfx = gain(0.38);
  const sfxTone = filter("lowpass", 18000, 0.5);
  chain(sfx, sfxTone, film);

  const mono = noiseSource(1);
  const stereo = noiseSource(2);

  // ---- la musique
  const kickOsc = osc("sine", 50);
  const kick = gain(0, true);
  chain(kickOsc, shaper(3), kick, music);

  const boomOsc = osc("sine", 40);
  const boom = gain(0, true);
  chain(boomOsc, shaper(4), boom, music);

  const hat = gain(0, true);
  chain(mono, filter("highpass", 7000, 0.8), hat, music);
  const crash = gain(0, true);
  chain(mono, filter("highpass", 4200, 0.5), crash, music);

  const snare = level >= 3 ? gain(0, true) : null;
  const snareBodyOsc = level >= 3 ? osc("triangle", 190) : null;
  const snareBody = level >= 3 ? gain(0, true) : null;
  if (snare && snareBody && snareBodyOsc) {
    chain(mono, filter("bandpass", 1900, 0.7), snare, music);
    chain(snareBodyOsc, snareBody, music);
  }

  // la basse : deux dents de scie (la seconde à l'octave), filtre à enveloppe, saturation douce
  const bassA = osc("sawtooth", 73);
  const bassB = osc("sawtooth", 146);
  const bassOct = gain(0.35);
  const bassLp = filter("lowpass", 400, 4);
  const bass = gain(0, true);
  bassA.connect(bassLp);
  chain(bassB, bassOct, bassLp);
  chain(bassLp, shaper(1.6), bass, music);

  const arpOsc = level >= 4 ? osc("square", 294) : null;
  const arp = level >= 4 ? gain(0, true) : null;
  if (arpOsc && arp) chain(arpOsc, filter("lowpass", 2400, 1), arp, music);

  const padOscs = level >= 5 ? [osc("sawtooth", 147), osc("sawtooth", 220), osc("sawtooth", 294)] : [];
  const padPump = level >= 5 ? gain(1) : null;
  const pad = level >= 5 ? gain(0, true) : null;
  if (pad && padPump) {
    const lp = filter("lowpass", 1100, 1);
    for (const o of padOscs) o.connect(lp);
    padOscs[1].detune.value = 6;
    chain(lp, padPump, pad, music);
  }
  const tomOsc = level >= 5 ? osc("triangle", 110) : null;
  const tom = level >= 5 ? gain(0, true) : null;
  if (tomOsc && tom) chain(tomOsc, tom, music);

  const leadOsc = level >= 6 ? osc("sawtooth", 587) : null;
  const lead = level >= 6 ? gain(0, true) : null;
  if (leadOsc && lead) chain(leadOsc, filter("lowpass", 3200, 0.8), lead, music);

  // la nappe : quatre voix, triangles et dents de scie, filtre doux
  const nappeOscs = [osc("triangle", 147), osc("sawtooth", 220), osc("triangle", 330), osc("sawtooth", 349)];
  const nappe = gain(0, true);
  {
    const lp = filter("lowpass", 1400, 0.5);
    nappeOscs.forEach((o, i) => {
      o.detune.value = [0, -5, 4, 7][i];
      o.connect(lp);
    });
    chain(lp, nappe, music);
  }

  // ---- les repères : tintement en modulation de fréquence (cloche), radio, souffle
  const chimeOsc = osc("sine", 1760);
  const chimeMod = osc("sine", 6177);
  const chimeIndex = gain(0);
  const chime = gain(0, true);
  chain(chimeMod, chimeIndex);
  chimeIndex.connect(chimeOsc.frequency);
  chain(chimeOsc, chime, ui);

  const radio = gain(0, true);
  chain(mono, filter("bandpass", 2300, 1.2), radio, ui);
  const beepOsc = osc("square", 1180);
  const beep = gain(0, true);
  chain(beepOsc, filter("lowpass", 3000, 0.7), beep, ui);

  const sweepLp = filter("bandpass", 400, 1.4);
  const sweep = gain(0, true);
  chain(mono, sweepLp, sweep, ui);

  const slam = gain(0, true);
  chain(mono, filter("lowpass", 1800, 0.6), slam, sfx);

  // ---- la scène, en continu
  // le moteur : allumage d'un V8 (régime / 60 × 4), demi-ordre carré pour le galop, saturé, filtre selon la charge
  const engA = osc("sawtooth", 117);
  const engB = osc("square", 58);
  const engBGain = gain(0.45);
  const engDrive = shaper(2.5);
  const engLp = filter("lowpass", 900, 2);
  const engine = gain(0);
  engA.connect(engDrive);
  chain(engB, engBGain, engDrive);
  chain(engDrive, engLp, engine, sfx);

  // les pneus sur le mouillé : un souffle dont la couleur monte avec la vitesse
  const tiresBp = filter("bandpass", 1200, 0.6);
  const tires = gain(0);
  chain(mono, tiresBp, tires, sfx);

  // le crissement : deux sons qui tremblent (bruit filtré très bas sur leur fréquence) et un frottement
  const skidA = osc("triangle", 1100);
  const skidB = osc("triangle", 1400);
  const jitter = gain(1500);
  chain(mono, filter("lowpass", 25, 0.7), jitter);
  jitter.connect(skidA.frequency);
  jitter.connect(skidB.frequency);
  const skidTone = gain(0.3);
  skidA.connect(skidTone);
  skidB.connect(skidTone);
  const skidNoise = gain(0.8);
  chain(mono, filter("bandpass", 2600, 2), skidNoise);
  const skid = gain(0);
  skidTone.connect(skid);
  skidNoise.connect(skid);
  skid.connect(sfx);

  // les sirènes : carrés adoucis, un filtre commun qui dit la distance
  const sirenLp = filter("lowpass", 1500, 0.7);
  sirenLp.connect(sfx);
  const sirenCount = level >= 4 ? 3 : level >= 2 ? 2 : 1;
  const sirens = Array.from({ length: sirenCount }, () => {
    const o = osc("square", 587);
    const g = gain(0);
    chain(o, g, sirenLp);
    return { o, g };
  });

  // le rotor : un bruit grave haché par une dent de scie inversée (attaque franche, décroissance), un sifflement de turbine
  const rotorVoice = (center: number) => {
    const am = gain(0.5);
    const lfo = osc("sawtooth", 11);
    const depth = gain(-0.5);
    chain(lfo, depth);
    depth.connect(am.gain);
    chain(mono, filter("bandpass", center, 1), am);
    return { am, lfo };
  };
  const rotors = level >= 4 ? [rotorVoice(320), ...(level >= 6 ? [rotorVoice(520)] : [])] : [];
  const rotor = level >= 4 ? gain(0) : null;
  const rotor2 = level >= 6 ? gain(0) : null;
  if (rotor) {
    rotors[0].am.connect(rotor);
    const whine = osc("sine", 1900);
    chain(whine, gain(0.03), rotor);
    rotor.connect(sfx);
  }
  if (rotor2) chain(rotors[1].am, rotor2, sfx);

  // les avions : un grondement filtré qui passe
  const jetBp = level >= 6 ? filter("bandpass", 500, 0.8) : null;
  const jet = level >= 6 ? gain(0) : null;
  if (jetBp && jet) chain(mono, jetBp, jet, sfx);

  // la pluie : un grésil aigu en stéréo et un fond plus grave
  const rainLp = filter("lowpass", 9000, 0.5);
  const rain = gain(0);
  chain(stereo, filter("highpass", 1800, 0.5), rainLp);
  chain(stereo, filter("lowpass", 500, 0.5), gain(0.4), rainLp);
  chain(rainLp, rain, rainBus);

  // ---- les courbes, image par image
  const bind: Partial<Record<Curve, (v: number, frame: number) => [AudioParam, number][]>> = {
    rpm: (v) => [
      [engA.frequency, (v / 60) * 4],
      [engB.frequency, (v / 60) * 2],
    ],
    speed: (v) => [
      [tires.gain, Math.min(1, Math.max(0, (v - 3) / 17)) * 0.3],
      [tiresBp.frequency, 500 + v * 50],
    ],
    slip: (v) => [
      [skid.gain, Math.pow(Math.min(1, v / 36), 1.2) * 0.4],
      [skidA.frequency, 900 + v * 9],
      [skidB.frequency, (900 + v * 9) * 1.27],
    ],
    sirenTone: (v) => [[sirenLp.frequency, v]],
    rain: (v) => [[rain.gain, v * 0.06]],
    rainTone: (v) => [[rainLp.frequency, v]],
    sfxTone: (v) => [[sfxTone.frequency, v]],
  };
  const derived = (frame: number): [AudioParam, number][] => {
    const c = (n: Curve) => score.curve(n, frame);
    const load = c("load");
    const rpm = c("rpm");
    const out: [AudioParam, number][] = [
      [engLp.frequency, 200 + 1600 * load + rpm * 0.12],
      [engine.gain, c("engine") * (0.5 + 0.5 * load) * 0.16],
    ];
    sirens.forEach((s, i) => {
      const k = (i + 1) as 1 | 2 | 3;
      out.push([s.o.frequency, c(`siren${k}Hz`)], [s.g.gain, c(`siren${k}`) * 0.09]);
    });
    if (rotor) {
      out.push([rotor.gain, c("rotor") * 1.2], [rotors[0].lfo.frequency, c("rotorRate")]);
      if (rotor2) out.push([rotor2.gain, c("rotor2") * 1.0], [rotors[1].lfo.frequency, c("rotorRate") * 1.17]);
    }
    if (jet && jetBp) out.push([jet.gain, c("jet") * 0.3], [jetBp.frequency, c("jetTone")]);
    return out;
  };
  const curveValues = (frame: number): [AudioParam, number][] => {
    const out = derived(frame);
    for (const name of CURVES) {
      const b = bind[name];
      if (b) out.push(...b(score.curve(name, frame), frame));
    }
    return out;
  };

  // ---- les événements
  /** Frappe : zéro, montée, décroissance exponentielle. */
  const hit = (p: AudioParam, w: number, peak: number, attack: number, decay: number) => {
    p.setValueAtTime(0, w);
    p.linearRampToValueAtTime(peak, w + attack);
    p.exponentialRampToValueAtTime(0.0005, w + attack + decay);
    p.setValueAtTime(0, w + attack + decay + 0.001);
  };
  /** Note tenue : zéro, montée, tenue qui fléchit, extinction. */
  const held = (p: AudioParam, w: number, peak: number, attack: number, dur: number, release: number, sustain = 0.75) => {
    p.setValueAtTime(0, w);
    p.linearRampToValueAtTime(peak, w + attack);
    p.linearRampToValueAtTime(peak * sustain, w + Math.max(attack, dur));
    p.linearRampToValueAtTime(0, w + Math.max(attack, dur) + release);
  };
  const crackle = (w: number, dur: number, vel: number, seed: number) => {
    const r = prng(seed);
    let t = 0;
    while (t < dur) {
      radio.gain.setValueAtTime(r() < 0.3 ? 0 : (0.4 + 0.6 * r()) * 0.16 * vel, w + t);
      t += 0.012 + r() * 0.014;
    }
    radio.gain.setValueAtTime(0, w + dur);
  };

  const play = (e: SoundEvent, w: number, dur: number) => {
    const v = e.vel;
    switch (e.voice) {
      case "kick":
        kickOsc.frequency.setValueAtTime(165, w);
        kickOsc.frequency.exponentialRampToValueAtTime(48, w + 0.11);
        hit(kick.gain, w, 0.5 * v, 0.003, 0.2);
        break;
      case "boom":
        boomOsc.frequency.setValueAtTime(120, w);
        boomOsc.frequency.exponentialRampToValueAtTime(38, w + Math.min(0.5, dur));
        hit(boom.gain, w, 0.45 * v, 0.004, Math.max(0.3, dur));
        break;
      case "hat":
        hit(hat.gain, w, 0.35 * v, 0.001, 0.04);
        break;
      case "crash":
        hit(crash.gain, w, 0.16 * v, 0.002, 1.2);
        break;
      case "snare":
        if (snare && snareBody && snareBodyOsc) {
          const d = dur > 0 ? dur : 0.17;
          hit(snare.gain, w, 0.9 * v, 0.001, d);
          snareBodyOsc.frequency.setValueAtTime(200, w);
          snareBodyOsc.frequency.exponentialRampToValueAtTime(170, w + 0.06);
          hit(snareBody.gain, w, 0.5 * v, 0.001, Math.min(d, 0.08));
        }
        break;
      case "bass": {
        const f = midiHz(e.notes[0]);
        bassA.frequency.setValueAtTime(f, w);
        bassB.frequency.setValueAtTime(f * 2, w);
        bassLp.frequency.setValueAtTime(500 + 1300 * v, w);
        bassLp.frequency.exponentialRampToValueAtTime(320, w + 0.12);
        held(bass.gain, w, 0.14 * v, 0.004, dur, 0.02);
        break;
      }
      case "arp":
        if (arpOsc && arp) {
          arpOsc.frequency.setValueAtTime(midiHz(e.notes[0]), w);
          hit(arp.gain, w, 0.22 * v, 0.002, 0.1);
        }
        break;
      case "pad":
        if (pad) {
          e.notes.forEach((n, i) => padOscs[i]?.frequency.setTargetAtTime(midiHz(n), w, 0.008));
          held(pad.gain, w, 0.08 * v, 0.03, dur, e.release, 0.9);
        }
        break;
      case "pump":
        if (padPump) {
          padPump.gain.linearRampToValueAtTime(0.35, w + 0.012);
          padPump.gain.linearRampToValueAtTime(1, w + Math.min(0.35, dur * 0.8));
        }
        break;
      case "tom":
        if (tomOsc && tom) {
          const f = midiHz(e.notes[0]);
          tomOsc.frequency.setValueAtTime(f * 1.5, w);
          tomOsc.frequency.exponentialRampToValueAtTime(f, w + 0.06);
          hit(tom.gain, w, 0.5 * v, 0.002, 0.11);
        }
        break;
      case "lead":
        if (leadOsc && lead) {
          leadOsc.frequency.setValueAtTime(midiHz(e.notes[0]), w);
          held(lead.gain, w, 0.04 * v, 0.004, 0.05, 0.035, 0.6);
        }
        break;
      case "nappe":
        e.notes.forEach((n, i) => nappeOscs[i]?.frequency.setValueAtTime(midiHz(n), w));
        held(nappe.gain, w, 0.09 * v, Math.min(0.35, dur), dur, e.release, 0.85);
        break;
      case "chime":
      case "deny": {
        const deny = e.voice === "deny";
        const f = midiHz(e.notes[0]) * (deny ? 0.5 * 0.97 : 1);
        chimeOsc.frequency.setValueAtTime(f, w);
        chimeMod.frequency.setValueAtTime(f * 3.51, w);
        chimeIndex.gain.setValueAtTime(f * (deny ? 0.6 : 1.4), w);
        chimeIndex.gain.exponentialRampToValueAtTime(f * 0.05, w + (deny ? 0.12 : 0.6));
        hit(chime.gain, w, (deny ? 0.12 : 0.22) * v, 0.002, deny ? 0.18 : Math.max(0.4, dur));
        break;
      }
      case "radio":
        crackle(w, dur, v, Math.round(e.frame * 31));
        break;
      case "beep":
        beepOsc.frequency.setValueAtTime(1180, w);
        beepOsc.frequency.setValueAtTime(1560, w + 0.07);
        beep.gain.setValueAtTime(0, w);
        beep.gain.linearRampToValueAtTime(0.06 * v, w + 0.004);
        beep.gain.setValueAtTime(0.06 * v, w + 0.055);
        beep.gain.linearRampToValueAtTime(0, w + 0.06);
        beep.gain.linearRampToValueAtTime(0.06 * v, w + 0.074);
        beep.gain.setValueAtTime(0.06 * v, w + 0.14);
        beep.gain.linearRampToValueAtTime(0, w + 0.146);
        break;
      case "rise":
        sweepLp.frequency.setValueAtTime(250, w);
        sweepLp.frequency.exponentialRampToValueAtTime(3800, w + dur);
        sweep.gain.setValueAtTime(0.0005, w);
        sweep.gain.exponentialRampToValueAtTime(0.22 * v, w + dur);
        sweep.gain.linearRampToValueAtTime(0, w + dur + 0.03);
        break;
      case "whoosh":
        sweepLp.frequency.setValueAtTime(350, w);
        sweepLp.frequency.exponentialRampToValueAtTime(5000, w + dur);
        sweepLp.frequency.exponentialRampToValueAtTime(1400, w + dur + e.release);
        sweep.gain.setValueAtTime(0.0005, w);
        sweep.gain.exponentialRampToValueAtTime(0.32 * v, w + dur);
        sweep.gain.linearRampToValueAtTime(0, w + dur + e.release);
        break;
      case "slam":
        hit(slam.gain, w, 0.5 * v, 0.002, 0.5);
        break;
      case "snap":
        // l'éclair de la coupe : un claquement clair et bref, sur la voix des charlestons
        hit(hat.gain, w, 0.6 * v, 0.001, 0.08);
        break;
    }
  };

  /** La dernière image dont les courbes sont posées. */
  let lastFrame = -1;
  /** L'instant du film jusqu'où les événements sont posés. */
  let eventsTo = -Infinity;
  /** Après un recalage, rien ne se pose avant que les voix soient refermées (heure du contexte). */
  let floor = 0;
  /** Le premier événement qui part à l'instant `t` du film ou après (les événements sont triés). */
  const firstAt = (t: number) => {
    let lo = 0;
    let hi = score.events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (score.events[mid].at < t - 1e-9) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  for (const s of sources) s.start();

  return {
    get nodeCount() {
      return nodes.length;
    },
    get sourceCount() {
      return sources.length;
    },
    schedule(from, to, ctxAt) {
      const now = ctx.currentTime;
      const end = Math.min(to, score.duration);
      // les courbes : une rampe vers la valeur de chaque image
      const f0 = Math.max(lastFrame + 1, Math.ceil(from * FPS - 1e-6));
      const f1 = Math.min(score.frames - 1, Math.ceil(end * FPS - 1e-6) - 1);
      for (let f = f0; f <= f1; f++) {
        const w = Math.max(now, floor, ctxAt(f / FPS));
        for (const [p, v] of curveValues(f)) p.linearRampToValueAtTime(v, w);
        lastFrame = f;
      }
      // les événements de la fenêtre
      const a = Math.max(from, eventsTo);
      for (let i = firstAt(a); i < score.events.length; i++) {
        const e = score.events[i];
        if (e.at >= end - 1e-9) break;
        const w = ctxAt(e.at);
        const late = Math.max(now, floor) - w;
        if (late > 0.05) {
          // une note tenue repart pour ce qui lui reste ; une frappe en retard est perdue
          const left = e.dur - late;
          if (SUSTAINED.has(e.voice) && left > 0.1) play(e, Math.max(now, floor), left);
          continue;
        }
        play(e, Math.max(now, floor, w), e.dur);
      }
      eventsTo = Math.max(eventsTo, end);
    },
    resync(t, when) {
      for (const p of params) {
        const hold = (p as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam }).cancelAndHoldAtTime;
        if (hold) hold.call(p, when);
        else {
          const v = p.value;
          p.cancelScheduledValues(when);
          p.setValueAtTime(v, when);
        }
      }
      for (const p of vcas) p.linearRampToValueAtTime(0, when + 0.03);
      if (padPump) padPump.gain.linearRampToValueAtTime(1, when + 0.03);
      const frame = Math.min(score.frames - 1, Math.max(0, Math.floor(t * FPS + 1e-6)));
      floor = when + 0.04;
      for (const [p, v] of curveValues(frame)) p.linearRampToValueAtTime(v, floor);
      lastFrame = frame;
      // les notes tenues en cours (nappe, cuivres) repartent pour ce qui leur reste
      for (const e of score.events) {
        if (e.at >= t || !SUSTAINED.has(e.voice)) continue;
        const left = e.at + e.dur - t;
        if (left > 0.1) play(e, floor, left);
      }
      eventsTo = t;
    },
    duck(on, when, keepRain = false) {
      const fade = (p: AudioParam, v: number) => {
        p.cancelScheduledValues(when);
        p.setValueAtTime(p.value, when);
        p.linearRampToValueAtTime(v, when + 0.08);
      };
      fade(film.gain, on ? 0 : 1);
      fade(rainBus.gain, on && !keepRain ? 0 : 1);
    },
    stop(when) {
      out.gain.cancelScheduledValues(when);
      out.gain.setValueAtTime(out.gain.value, when);
      out.gain.linearRampToValueAtTime(0, when + 0.05);
      for (const s of sources) {
        try {
          s.stop(when + 0.06);
        } catch {
          /* déjà arrêtée */
        }
      }
    },
    disconnect() {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* déjà débranché */
        }
      }
    },
  };
}

/**
 * La bande-son d'un film entier, rendue hors ligne (écoute, montage) : le même
 * graphe, toute la partition posée d'un coup, l'instant t du film à t secondes.
 */
export async function renderFilmSound(score: FilmScore, sampleRate = 48000, Offline: typeof OfflineAudioContext = OfflineAudioContext): Promise<AudioBuffer> {
  const tail = 0.6;
  const ctx = new Offline(2, Math.ceil((score.duration + tail) * sampleRate), sampleRate);
  const synth = createFilmSynth(ctx, score);
  synth.resync(0, 0);
  synth.schedule(0, score.duration, (t) => t);
  return ctx.startRendering();
}
