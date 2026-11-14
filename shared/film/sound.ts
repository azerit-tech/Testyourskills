// La bande-son du film (§18.39) : sa partition, fonction pure du plan d'une
// fiche (plan.ts). Tout est compté en images du film (cut.ts) : la synthèse
// (web/src/lib/filmSynth.ts) la joue sur l'horloge de la vidéo, en direct ou
// hors ligne. Sans DOM ni Web Audio.
//
// La musique : 120 à la noire, un temps = 12 images. Elle part sur la première
// étoile (P1) ; chaque plan de la poursuite contient un nombre entier de temps
// (P2, 110 images, en compte neuf : 117,8 à la noire, l'écart ne s'entend pas),
// si bien que chaque coupe, chaque étoile et la coupe vers la fin tombent sur
// un temps. Une couche de plus par étoile, comme les renforts à l'image : nue
// à une étoile, pleine à six. La coupe vers la fin l'arrête net sur un temps,
// puis une nappe tient l'arrestation.
//
// Les bruitages : le moteur, les pneus et les deux dérapages suivent la conduite
// de la berline (vitesses et glisses relevées sur tools/film3d/parcours.py, la
// conduite unique du film) ; sirènes, rotor, avions, pluie suivent le casting
// de chaque plan. Les courbes sont des clés (image, valeur) interpolées.
import { CHASE_SHOTS, FPS, SHOT_FRAMES, SHOT_START, type ChaseShot } from "./cut";
import type { FilmPlan } from "./plan";

/** Images par temps : 120 à la noire à 24 images par seconde. */
export const BEAT_FRAMES = 12;
export const BPM = (60 * FPS) / BEAT_FRAMES;

/** Les voix de la musique (couches 1 à 6) et des repères (couche 0). */
export type Voice =
  | "kick"
  | "boom"
  | "hat"
  | "snare"
  | "crash"
  | "bass"
  | "arp"
  | "pad"
  | "pump"
  | "lead"
  | "tom"
  | "nappe"
  | "chime"
  | "deny"
  | "radio"
  | "beep"
  | "rise"
  | "whoosh"
  | "slam";

export interface SoundEvent {
  voice: Voice;
  /** L'image du film où il part (fractionnaire : les doubles croches tombent entre deux images). */
  frame: number;
  /** Le même instant, en secondes. */
  at: number;
  /** Tenue en secondes (note, nappe, montée) ; 0 pour une frappe. */
  dur: number;
  /** Extinction après la tenue, en secondes. */
  release: number;
  /** Force, de 0 à 1. */
  vel: number;
  /** Notes MIDI (une note, ou l'accord d'une nappe). */
  notes: number[];
  /** La couche de musique qui le joue (1 à 6) ; 0 pour les repères (étoile, radio, arrêt, flash). */
  layer: number;
}

export interface Beat {
  /** Image du temps (fractionnaire en P2). */
  frame: number;
  /** Longueur du temps, en images. */
  len: number;
  shot: ChaseShot;
  /** Rang du temps dans son plan, et nombre de temps du plan. */
  index: number;
  count: number;
  /** Fondamentale MIDI de l'accord, et sa tierce (3 mineure, 4 majeure). */
  root: number;
  third: 3 | 4;
}

/** Les courbes continues, une valeur par image. */
export type Curve =
  | "rpm"
  | "load"
  | "engine"
  | "speed"
  | "slip"
  | "siren1"
  | "siren2"
  | "siren3"
  | "siren1Hz"
  | "siren2Hz"
  | "siren3Hz"
  | "sirenTone"
  | "rotor"
  | "rotor2"
  | "rotorRate"
  | "jet"
  | "jetTone"
  | "rain"
  | "rainTone"
  | "sfxTone";

export const CURVES: readonly Curve[] = [
  "rpm",
  "load",
  "engine",
  "speed",
  "slip",
  "siren1",
  "siren2",
  "siren3",
  "siren1Hz",
  "siren2Hz",
  "siren3Hz",
  "sirenTone",
  "rotor",
  "rotor2",
  "rotorRate",
  "jet",
  "jetTone",
  "rain",
  "rainTone",
  "sfxTone",
];

export interface FilmScore {
  level: number;
  bpm: number;
  /** La coupe vers la fin : la musique s'y arrête, sur un temps. */
  cut: number;
  /** L'arrêt sur image : l'impact ; les bruits de la scène s'y taisent. */
  freeze: number;
  /** La fin du film, en images et en secondes : rien ne part au-delà. */
  frames: number;
  duration: number;
  beats: Beat[];
  /** Les événements, dans l'ordre du temps. */
  events: SoundEvent[];
  /** Première image de chaque couche de musique (la couche k part sur l'étoile k), et sa fin (la coupe). */
  layers: { layer: number; from: number; to: number }[];
  /** La valeur d'une courbe à une image du film. */
  curve(name: Curve, frame: number): number;
}

type Keys = readonly (readonly [number, number])[];

/** Interpolation linéaire entre clés (image, valeur), tenue aux deux bouts. */
export function keyAt(keys: Keys, f: number): number {
  if (f <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [f1, v1] = keys[i];
    if (f <= f1) {
      const [f0, v0] = keys[i - 1];
      return f1 === f0 ? v1 : v0 + ((v1 - v0) * (f - f0)) / (f1 - f0);
    }
  }
  return keys[keys.length - 1][1];
}

// ---- l'harmonie : ré mineur, la fondamentale de la basse par temps de chaque plan
const D = 38;
const Eb = 39;
const Bb = 34;
const C = 36;
const A = 33;
const HARMONY: Record<Exclude<ChaseShot, "OUV">, readonly number[]> = {
  P1: [D, D, D, D],
  P2: [D, D, D, D, Bb, Bb, Bb, C, C],
  P3: [D, D, Eb, Eb],
  P4: [D, D, Eb, Eb],
  P5: [Bb, Bb, C, C, A],
  P6: [D, D, Eb, Eb, A],
};
/** Le tintement de chaque étoile, qui monte : la, do, ré, fa, la, ré. */
export const CHIMES = [81, 84, 86, 89, 93, 98] as const;
/** La nappe de l'arrestation : ré mineur, la neuvième frotte contre la tierce. */
const NAPPE_FIN = [50, 57, 64, 65];
/** Le temps gelé de la fin à six étoiles : quintes ouvertes, plus haut. */
const NAPPE_FIN6 = [50, 57, 64, 69];

// ---- la conduite (tools/film3d/parcours.py, relevé image par image le 14 novembre)
/** Régime (tr/min) : cruise, le coup de gaz de P1, les rapports, le freinage du rond-point, la glisse au tiers des gaz du port. */
const RPM: Keys = [
  [0, 1750], [39, 1750], [41, 2300], [46, 4400], [70, 5400], [72, 4300], [88, 4900], [96, 4700], [100, 3800],
  [110, 3100], [112, 3900], [114, 3500], [123, 3300], [128, 4300], [147, 3900], [160, 3600], [170, 4300],
  [197, 5300], [214, 5800], [216, 4600], [245, 5600], [262, 6100], [264, 4900], [280, 5900], [284, 5600],
  [294, 4600], [300, 4000], [303, 4600], [306, 4200], [310, 5400], [321, 5900], [336, 5600], [345, 5200],
  [353, 5000], [372, 6000], [374, 4800], [413, 5900],
];
/** Charge (0 pied levé, 1 à fond). */
const LOAD: Keys = [
  [0, 0.3], [39, 0.3], [41, 0.6], [46, 1], [94, 1], [100, 0], [111, 0], [112, 0.4], [114, 0], [123, 0], [128, 0.35],
  [147, 0.2], [160, 0.5], [170, 1], [282, 1], [285, 0], [302, 0], [303, 0.5], [306, 0.3], [310, 0.4], [336, 0.4],
  [345, 0.8], [353, 1], [413, 1],
];
/** Présence du moteur selon le plan : derrière la berline, de face sur le pont (elle arrive), en grand angle sur la jetée. */
const ENGINE: Keys = [
  [0, 0.55], [39, 0.6], [40, 0.7], [197, 0.75], [198, 0.8], [245, 0.8], [246, 0.35], [280, 0.9], [293, 1],
  [294, 0.8], [353, 0.8], [354, 0.5], [413, 0.55],
];
/** Vitesse (m/s). */
const SPEED: Keys = [
  [0, 13.9], [40, 13.9], [64, 15.1], [88, 16.4], [112, 14.5], [136, 12.6], [160, 11.1], [176, 11.6], [198, 13.3],
  [245, 17.1], [280, 20.6], [294, 18.6], [320, 12.7], [353, 10.2], [376, 11.3], [413, 15.4],
];
/** Glisse (°, en valeur absolue) : le dérapage du rond-point (DERAP2, crête 29° tenue de 134 à 147), celui du port (DERAP5, 36° à 321), son retour dans P6. */
const SLIP: Keys = [
  [0, 0], [122, 0], [124, 6.3], [127, 15.1], [130, 23.6], [134, 29], [147, 27.1], [150, 25.6], [153, 22.8],
  [156, 16.6], [159, 10.1], [162, 5], [170, 2], [176, 0], [306, 0], [308, 4], [310, 10.4], [313, 20.4], [316, 30],
  [321, 36], [330, 32.5], [340, 27.9], [345, 21.7], [349, 14.5], [353, 6.5], [356, 1], [362, 4], [368, 2.6], [374, 0],
];

// ---- les poursuivants : une patrouille dès P1, une seconde dans l'anneau, la meute au pont
const SIREN1: Keys = [[0, 0], [40, 0], [44, 0.75], [150, 0.75], [160, 0.45], [197, 0.4], [198, 0.55], [413, 0.75]];
const SIREN2: Keys = [[0, 0], [122, 0], [130, 0.6], [197, 0.65], [413, 0.75]];
const SIREN3: Keys = [[0, 0], [245, 0], [246, 0.7], [413, 0.75]];
const SIREN_TONE: Keys = [[0, 1300], [44, 1500], [88, 2200], [246, 2600], [413, 2400]];
/**
 * Les sirènes, à deux tons inventés : tierces mineures dans la tonalité, chaque
 * voiture à son pas. La première bat la mesure (un ton par temps, depuis l'étoile 1).
 */
const SIRENS = [
  { lo: 587.33, hi: 698.46, half: BEAT_FRAMES, from: 40 },
  { lo: 440, hi: 523.25, half: 10, from: 122 },
  { lo: 659.26, hi: 783.99, half: 14, from: 245 },
] as const;
/** Les hélicoptères : le premier au pont, au-dessus de la berline au port, trois sur la jetée. */
const ROTOR: Keys = [[0, 0], [245, 0], [250, 0.15], [293, 0.3], [294, 0.35], [305, 0.6], [318, 0.85], [340, 0.8], [353, 0.75], [354, 0.85], [413, 0.95]];
const ROTOR2: Keys = [[0, 0], [353, 0], [354, 0.55], [413, 0.65]];
const ROTOR_RATE: Keys = [[0, 10.4], [246, 10.4], [318, 12.2], [345, 11], [354, 11.6], [413, 11.6]];
/** Les avions, haut dans le ciel de la jetée. */
const JET: Keys = [[0, 0], [360, 0], [372, 0.15], [392, 0.8], [400, 1], [408, 0.7], [413, 0.5]];
const JET_TONE: Keys = [[0, 500], [360, 500], [392, 1400], [400, 1800], [413, 700]];

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** La fréquence d'une sirène à une image : deux tons, un glissé d'une image entre eux, la mise en route de la première. */
function sirenHz(i: 0 | 1 | 2, f: number): number {
  const s = SIRENS[i];
  const k = Math.floor(Math.max(0, f - s.from) / s.half);
  const hz = k % 2 === 0 ? s.lo : s.hi;
  // la rampe s'allume : la première monte en quatre images
  const spin = i === 0 ? clamp((f - s.from) / 4, 0, 1) : 1;
  return hz * (0.55 + 0.45 * spin);
}

/** Les temps de la musique, de l'étoile 1 à la coupe. */
function beatsOf(plan: FilmPlan): Beat[] {
  const out: Beat[] = [];
  for (let k = 1; k <= plan.level; k++) {
    const shot = CHASE_SHOTS[k] as Exclude<ChaseShot, "OUV">;
    const n = Math.max(1, Math.round(SHOT_FRAMES[shot] / BEAT_FRAMES));
    const len = SHOT_FRAMES[shot] / n;
    const roots = HARMONY[shot];
    for (let i = 0; i < n; i++) {
      const root = roots[Math.floor((i * roots.length) / n)];
      out.push({ frame: SHOT_START[shot] + i * len, len, shot, index: i, count: n, root, third: root === D ? 3 : 4 });
    }
  }
  return out;
}

export function filmScore(plan: FilmPlan): FilmScore {
  const { level, cut, freeze, flash } = plan;
  const end = plan.frames;
  const beats = beatsOf(plan);
  const starAt = (k: number) => plan.stars[k - 1]?.frame ?? Infinity;
  const layerAt = (f: number) => plan.stars.filter((s) => s.frame <= f + 1e-6).length;
  const events: SoundEvent[] = [];
  const push = (voice: Voice, frame: number, o: Partial<Omit<SoundEvent, "voice" | "frame" | "at">> = {}) => {
    if (frame < 0 || frame >= end) return;
    events.push({ voice, frame, at: frame / FPS, dur: 0, release: 0, vel: 1, notes: [], layer: 0, ...o });
  };

  // ---- l'ouverture : la pluie, le moteur, et une montée qui pose la première étoile
  push("rise", 16, { dur: (SHOT_START.P1 - 16) / FPS, vel: 0.7 });

  // ---- la musique, temps par temps, chaque couche à partir de son étoile
  for (let bi = 0; bi < beats.length; bi++) {
    const b = beats[bi];
    const L = layerAt(b.frame);
    const q = b.len / 4;
    const spb = b.len / FPS;
    const down = b.index === 0;
    const last = b.index === b.count - 1;
    const chord = [b.root + 12, b.root + 19, b.root + 24];
    // 1 · la pulsation : grosse caisse sèche à chaque temps, basse en croches ; elle s'ouvre étoile après étoile
    const drive = 0.6 + 0.08 * (L - 1);
    push("kick", b.frame, { vel: (down ? 1 : 0.8) * drive, layer: 1 });
    for (let e = 0; e < 2; e++) {
      const note = e === 1 && b.index % 2 === 1 ? b.root + 12 : b.root;
      push("bass", b.frame + 2 * q * e, { notes: [note], dur: spb * 0.31, vel: (e === 0 ? 1 : 0.75) * drive, layer: 1 });
    }
    // 2 · les charlestons en doubles croches
    if (L >= 2) [0.5, 0.22, 0.75, 0.28].forEach((v, j) => push("hat", b.frame + j * q, { vel: v, layer: 2 }));
    // 3 · la caisse claire, un temps sur deux, et sa note fantôme
    if (L >= 3) {
      // elle entre sur son étoile, puis un temps sur deux
      if (b.index % 2 === 1 || b.frame === starAt(3)) push("snare", b.frame, { vel: 0.9, layer: 3 });
      else if (b.index % 4 === 2) push("snare", b.frame + 3 * q, { vel: 0.3, dur: 0.06, layer: 3 });
    }
    // 4 · l'arpège en doubles croches : fondamentale, quinte, octave, tierce
    if (L >= 4) {
      const steps = [24, 31, 36, 24 + b.third];
      [0.9, 0.55, 0.7, 0.5].forEach((v, j) => push("arp", b.frame + j * q, { notes: [b.root + steps[j]], vel: v, layer: 4 }));
    }
    // 5 · les cuivres en quintes qui pompent sur la grosse caisse, et les toms avant chaque coupe
    if (L >= 5) {
      const start = down || b.frame === starAt(5) || beats[bi - 1]?.root !== b.root;
      if (start) {
        let until = bi + 1;
        while (until < beats.length && beats[until].root === b.root && beats[until].index !== 0) until++;
        const to = until < beats.length ? beats[until].frame : cut;
        push("pad", b.frame, { notes: chord, dur: (to - b.frame) / FPS - 0.02, release: 0.02, vel: 1, layer: 5 });
      }
      push("pump", b.frame, { dur: spb, vel: 1, layer: 5 });
      if (last) [45, 43, 41, 38].forEach((n, j) => push("tom", b.frame + j * q, { notes: [n], vel: 0.6 + 0.1 * j, layer: 5 }));
    }
    // 6 · plein : trémolo aigu, grosse caisse en croches, cymbale toutes les deux mesures
    if (L >= 6) {
      [0.8, 0.5, 0.7, 0.5].forEach((v, j) => push("lead", b.frame + j * q, { notes: [b.root + (j % 2 === 0 ? 36 : 31)], vel: v, layer: 6 }));
      push("kick", b.frame + 2 * q, { vel: 0.55, layer: 6 });
      if (b.index % 4 === 2) push("crash", b.frame, { vel: 0.45, layer: 6 });
    }
  }

  // ---- chaque étoile : le coup sourd, la cymbale (dès la deuxième), le tintement, la radio
  for (const s of plan.stars) {
    push("boom", s.frame, { vel: 0.55 + 0.07 * s.star, dur: 0.7, layer: 0 });
    if (s.star >= 2) push("crash", s.frame, { vel: 0.8, layer: 2 });
    push("chime", s.frame, { notes: [CHIMES[s.star - 1]], vel: 0.8, dur: 1.5 });
    push("radio", s.frame + 2, { dur: 0.34, vel: 0.7 });
    push("beep", s.frame + 5, { vel: 0.7 });
    push("radio", s.frame + 28, { dur: 0.12, vel: 0.45 });
  }

  // ---- la coupe vers la fin : la musique s'arrête net sur le temps, la nappe prend le relais
  push("kick", cut, { vel: 1, layer: 0 });
  push("boom", cut, { vel: 1, dur: 1.4, layer: 0 });
  push("crash", cut, { vel: 1, layer: 0 });
  push("nappe", cut, { notes: level === 6 ? NAPPE_FIN6 : NAPPE_FIN, dur: (flash.peak - cut) / FPS, release: (flash.to - flash.peak) / FPS, vel: 1 });

  // ---- l'arrêt sur image : l'impact, la radio de fin, l'étoile suivante qui clignote sans s'allumer
  push("boom", freeze, { vel: 1, dur: 1.2 });
  push("slam", freeze, { vel: 1 });
  push("radio", freeze + 3, { dur: 0.3, vel: 0.6 });
  push("beep", freeze + 6, { vel: 0.6 });
  if (plan.flicker) for (const [a] of plan.flicker.frames) push("deny", a, { notes: [CHIMES[plan.flicker.star - 1]], vel: 0.5 });

  // ---- l'éclair : un souffle qui monte pendant le gel et culmine quand la fiche se pose
  const pre = Math.max(freeze + 1, flash.from - 8);
  push("whoosh", pre, { dur: (flash.peak - pre) / FPS, release: (flash.to - flash.peak) / FPS, vel: 1 });

  events.sort((a, b) => a.frame - b.frame);

  // ---- les courbes : la poursuite jusqu'à la coupe, la fin ensuite, le silence de la scène au gel
  const V = plan.endVideo;
  const at = (keys: Keys) => (f: number) => keyAt(keys, f);
  const rpmCut = keyAt(RPM, cut - 1);
  const speedCut = keyAt(SPEED, cut - 1);
  /** Le ralenti de l'arrestation : tout descend un peu, de la coupe au gel. */
  const slow = (r: number) => keyAt([[0, 1], [14, 0.97], [V - 1, 0.8]], r);
  const chase: Record<Curve, (f: number) => number> = {
    rpm: at(RPM),
    load: at(LOAD),
    engine: at(ENGINE),
    speed: at(SPEED),
    slip: at(SLIP),
    siren1: at(SIREN1),
    siren2: at(SIREN2),
    siren3: at(SIREN3),
    siren1Hz: (f) => sirenHz(0, f),
    siren2Hz: (f) => sirenHz(1, f),
    siren3Hz: (f) => sirenHz(2, f),
    sirenTone: at(SIREN_TONE),
    rotor: at(ROTOR),
    rotor2: at(ROTOR2),
    rotorRate: at(ROTOR_RATE),
    jet: at(JET),
    jetTone: at(JET_TONE),
    rain: (f) => (f < SHOT_START.P1 ? 1 : 0.9),
    rainTone: () => 9000,
    sfxTone: () => 18000,
  };
  // L'arrestation (une à cinq étoiles) : la berline finit de freiner et cale au ralenti, les poursuivants restent
  // autour, hors champ, selon le niveau. À six étoiles le temps est gelé : la scène se tait dès la coupe.
  const frozen = level === 6;
  const ending: Record<Curve, (r: number) => number> = {
    rpm: (r) => keyAt([[0, rpmCut * 0.9], [8, 2600], [26, 950], [V - 1, 850]], r) * slow(r),
    load: () => 0.1,
    engine: (r) => keyAt([[0, 0.75], [V - 1, 0.5]], r),
    speed: (r) => keyAt([[0, speedCut], [24, 0]], r),
    slip: (r) => keyAt([[0, 12], [5, 20], [16, 12], [26, 2], [32, 0]], r),
    siren1: () => 0.5,
    siren2: () => (level >= 2 ? 0.35 : 0),
    siren3: () => (level >= 4 ? 0.3 : 0),
    siren1Hz: (r) => sirenHz(0, cut + r) * slow(r),
    siren2Hz: (r) => sirenHz(1, cut + r) * slow(r),
    siren3Hz: (r) => sirenHz(2, cut + r) * slow(r),
    sirenTone: () => 1400,
    rotor: () => (level >= 4 ? 0.3 : 0),
    rotor2: () => 0,
    rotorRate: (r) => 11 * slow(r),
    jet: () => 0,
    jetTone: () => 500,
    rain: (r) => keyAt([[0, 0.9], [V - 1, 0.65]], r),
    rainTone: (r) => keyAt([[0, 9000], [V - 1, 1500]], r),
    sfxTone: (r) => keyAt([[0, 18000], [12, 8000], [V - 1, 1300]], r),
  };
  /** Les courbes qui restent posées quand la scène se tait (filtres, fréquences) ; les autres tombent à zéro. */
  const KEEP = new Set<Curve>(["rpm", "load", "siren1Hz", "siren2Hz", "siren3Hz", "sirenTone", "rotorRate", "jetTone", "rainTone", "sfxTone"]);
  const curve = (name: Curve, frame: number): number => {
    const f = Math.floor(frame);
    if (f < cut) return chase[name](f);
    const silent = f >= freeze || frozen;
    if (silent && !KEEP.has(name)) return 0;
    return ending[name](Math.min(f, freeze - 1) - cut);
  };

  const layers = plan.stars.map((s) => ({ layer: s.star, from: s.frame, to: cut }));
  return { level, bpm: BPM, cut, freeze, frames: end, duration: end / FPS, beats, events, layers, curve };
}

/** Les événements d'une fenêtre [from, to) en secondes du film. */
export function eventsBetween(score: FilmScore, from: number, to: number): SoundEvent[] {
  return score.events.filter((e) => e.at >= from - 1e-9 && e.at < to - 1e-9);
}
