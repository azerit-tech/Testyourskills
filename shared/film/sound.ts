// La bande-son du film (§18.39) : sa partition, fonction pure du plan d'une
// fiche (plan.ts). Tout est compté en images du film (cut.ts) : la synthèse
// (web/src/lib/filmSynth.ts) la joue sur l'horloge de la vidéo, en direct ou
// hors ligne. Sans DOM ni Web Audio.
//
// La musique : autour de 120 à la noire, un temps ≈ 12 images. Elle part sur la
// première étoile ; les étoiles sont des instants du trajet (§18.56), pas des
// coupes : chaque intervalle entre deux repères (une étoile, la suivante, la fin
// de la poursuite) est un nombre entier de temps, étirés ou serrés pour y tomber
// juste (de 11 à 13 images selon l'intervalle, 110 à 131 à la noire), si bien que
// chaque étoile et la fin de la poursuite tombent sur un temps. Une couche de
// plus par étoile, comme les renforts à l'image : nue à une étoile, pleine à six.
// La fin de la poursuite l'arrête net sur un temps (le gel sur place de une à
// cinq étoiles, l'entrée de la pointe à six), puis une nappe tient l'arrestation.
//
// Les bruitages : le moteur, les pneus et les deux dérapages suivent la conduite
// de la berline, lue dans parcours.json (vitesse, glisse, accélération, exportées
// par tools/film3d/parcours.py : la même conduite que les images) ; sirènes,
// rotor, avions, pluie suivent le casting de chaque tronçon, en clés posées dans
// le tronçon (SHOT_START + une part de sa durée). Les courbes sont des clés
// (image, valeur) interpolées.
import PARCOURS from "./parcours.json";
import { CHASE_SHOTS, FILM_FRAMES, FPS, SHOT_FRAMES, SHOT_START, STAR_FRAMES, type ChaseShot, type ShotId } from "./cut";
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
  | "slam"
  | "snap";

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
  /** Image du temps (fractionnaire : les temps sont étirés pour tomber sur les repères). */
  frame: number;
  /** Longueur du temps, en images. */
  len: number;
  /** Le tronçon de l'étoile qui ouvre l'intervalle (son harmonie). */
  shot: ChaseShot;
  /** Rang du temps dans son intervalle, et nombre de temps de l'intervalle. */
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
  /** La fin de la poursuite jouée (le temps qui suit le gel sur place, ou l'entrée de la pointe) : la musique s'y arrête. */
  cut: number;
  /** L'arrêt sur image : l'impact ; les bruits de la scène s'y taisent. */
  freeze: number;
  /** La fin du film, en images et en secondes : rien ne part au-delà. */
  frames: number;
  duration: number;
  beats: Beat[];
  /** Les événements, dans l'ordre du temps. */
  events: SoundEvent[];
  /** Première image de chaque couche de musique (la couche k part sur l'étoile k), et sa fin (celle de la poursuite). */
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

// ---- l'harmonie : ré mineur, la fondamentale de la basse par temps, selon l'étoile qui ouvre l'intervalle
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

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

// ---- la conduite (parcours.json : tools/film3d/parcours.py --export, la même conduite que les images)
const DRIVE = PARCOURS as unknown as { vitesse: [number, number][]; glisse: [number, number][]; acceleration: [number, number][] };
/** Vitesse (m/s). */
const SPEED: Keys = DRIVE.vitesse;
/** Glisse (°, en valeur absolue) : le dérapage du rond-point (29°), celui du port (36°). */
const SLIP: Keys = DRIVE.glisse;
/** Accélération le long de la route (m/s²) : positive à fond, négative au freinage. */
const ALONG: Keys = DRIVE.acceleration;
/** Les rapports de la berline, en tr/min par m/s : de la première (5 m/s à 3 000) à la cinquième (37 m/s à 6 100). */
const GEARS = [600, 380, 270, 205, 165] as const;
const REDLINE = 6200;
/** Pied levé, le moteur tombe sur le rapport le plus long qui tient ce régime. */
const LUG = 1700;
const IDLE = 850;

/** Une position dans un tronçon : sa première image, plus une part `u` de sa durée (le casting suit ses tronçons). */
const K = (shot: ShotId, u = 0): number => SHOT_START[shot] + u * SHOT_FRAMES[shot];

/**
 * Le régime et la charge de chaque image du fichier, lus sur la vitesse et
 * l'accélération : à fond, le rapport le plus court sous la zone rouge ; pied
 * levé ou au freinage, le plus long qui tient LUG ; arrêtée, le ralenti. Lissés
 * sur cinq images : pas de rapport qui bat sur un seuil.
 */
const ENGINE_TRACK = (() => {
  const rpm: number[] = [];
  const load: number[] = [];
  for (let f = 0; f < FILM_FRAMES; f++) {
    const v = keyAt(SPEED, f);
    const a = keyAt(ALONG, f);
    let r = IDLE;
    if (v > 0.3) {
      const pull = a > 0.3;
      const g = pull ? GEARS.findIndex((k) => v * k <= REDLINE) : GEARS.length - 1 - [...GEARS].reverse().findIndex((k) => v * k >= LUG);
      r = Math.max(IDLE, v * GEARS[g >= 0 && g < GEARS.length ? g : GEARS.length - 1]);
    }
    rpm.push(r);
    load.push(v > 0.3 ? clamp(0.3 + 0.3 * a, 0, 1) : 0.1);
  }
  const smooth = (xs: number[]) => xs.map((_, i) => {
    let n = 0;
    let t = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(xs.length - 1, i + 2); j++, n++) t += xs[j];
    return t / n;
  });
  return { rpm: smooth(rpm), load: smooth(load) };
})();
const track = (xs: number[]) => (f: number) => xs[clamp(Math.floor(f), 0, xs.length - 1)];

/** Présence du moteur : la caméra est derrière la berline d'un bout à l'autre (le bras commun), un peu plus près au pont. */
const ENGINE: Keys = [[0, 0.6], [K("P1"), 0.7], [K("P4"), 0.8], [K("FIN6"), 0.75], [K("FIN6", 1), 0.6]];

// ---- les poursuivants : une patrouille dès l'étoile 1, une seconde dans l'anneau, la meute au pont
const SIREN1: Keys = [[0, 0], [STAR_FRAMES[0], 0], [STAR_FRAMES[0] + 4, 0.75], [K("P2", 0.56), 0.75], [K("P2", 0.65), 0.45], [K("P3") - 1, 0.4], [K("P3"), 0.55], [K("FIN6"), 0.75]];
const SIREN2: Keys = [[0, 0], [K("P2", 0.31), 0], [K("P2", 0.38), 0.6], [K("P3"), 0.65], [K("FIN6"), 0.75]];
const SIREN3: Keys = [[0, 0], [K("P4") - 1, 0], [K("P4"), 0.7], [K("FIN6"), 0.75]];
const SIREN_TONE: Keys = [[0, 1300], [STAR_FRAMES[0] + 4, 1500], [K("P2"), 2200], [K("P4"), 2600], [K("FIN6"), 2400]];
/**
 * Les sirènes, à deux tons inventés : tierces mineures dans la tonalité, chaque
 * voiture à son pas. La première bat à peu près la mesure (un ton toutes les douze images, depuis l'étoile 1).
 */
const SIRENS = [
  { lo: 587.33, hi: 698.46, half: BEAT_FRAMES, from: STAR_FRAMES[0] },
  { lo: 440, hi: 523.25, half: 10, from: K("P2", 0.31) },
  { lo: 659.26, hi: 783.99, half: 14, from: K("P4") - 1 },
] as const;
/** Les hélicoptères : le premier au pont, au-dessus de la berline au port, trois sur la jetée. */
const ROTOR: Keys = [[0, 0], [K("P4") - 1, 0], [K("P4", 0.08), 0.15], [K("P5") - 1, 0.3], [K("P5"), 0.35], [K("P5", 0.18), 0.6], [K("P5", 0.4), 0.85], [K("P5", 0.77), 0.8], [K("P6") - 1, 0.75], [K("P6"), 0.85], [K("FIN6"), 0.95]];
const ROTOR2: Keys = [[0, 0], [K("P6") - 1, 0], [K("P6"), 0.55], [K("FIN6"), 0.65]];
const ROTOR_RATE: Keys = [[0, 10.4], [K("P4"), 10.4], [K("P5", 0.4), 12.2], [K("P5", 0.85), 11], [K("P6"), 11.6], [K("FIN6"), 11.6]];
/** Les avions, haut dans le ciel de la jetée. */
const JET: Keys = [[0, 0], [K("P6", 0.1), 0], [K("P6", 0.3), 0.15], [K("P6", 0.63), 0.8], [K("P6", 0.77), 1], [K("P6", 0.9), 0.7], [K("FIN6"), 0.5]];
const JET_TONE: Keys = [[0, 500], [K("P6", 0.1), 500], [K("P6", 0.63), 1400], [K("P6", 0.77), 1800], [K("FIN6"), 700]];


/** La fréquence d'une sirène à une image : deux tons, un glissé d'une image entre eux, la mise en route de la première. */
function sirenHz(i: 0 | 1 | 2, f: number): number {
  const s = SIRENS[i];
  const k = Math.floor(Math.max(0, f - s.from) / s.half);
  const hz = k % 2 === 0 ? s.lo : s.hi;
  // la rampe s'allume : la première monte en quatre images
  const spin = i === 0 ? clamp((f - s.from) / 4, 0, 1) : 1;
  return hz * (0.55 + 0.45 * spin);
}

/**
 * Les temps de la musique, de l'étoile 1 à la fin de la poursuite : chaque
 * intervalle (une étoile, la suivante ou la fin) en un nombre entier de temps
 * d'environ BEAT_FRAMES images, étirés pour tomber juste sur ses deux bouts.
 */
function beatsOf(plan: FilmPlan): Beat[] {
  const out: Beat[] = [];
  const marks = [...plan.stars.map((s) => s.frame), plan.chaseEnd];
  for (let k = 1; k <= plan.level; k++) {
    const shot = CHASE_SHOTS[k] as Exclude<ChaseShot, "OUV">;
    const from = marks[k - 1];
    const span = marks[k] - from;
    const n = Math.max(1, Math.round(span / BEAT_FRAMES));
    const len = span / n;
    const roots = HARMONY[shot];
    for (let i = 0; i < n; i++) {
      const root = roots[Math.floor((i * roots.length) / n)];
      out.push({ frame: from + i * len, len, shot, index: i, count: n, root, third: root === D ? 3 : 4 });
    }
  }
  return out;
}

export function filmScore(plan: FilmPlan): FilmScore {
  const { level, cut, chaseEnd, freeze, flash } = plan;
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
  push("rise", 16, { dur: (plan.stars[0].frame - 16) / FPS, vel: 0.7 });

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
    // 5 · les cuivres en quintes qui pompent sur la grosse caisse, et les toms avant chaque repère
    if (L >= 5) {
      const start = down || b.frame === starAt(5) || beats[bi - 1]?.root !== b.root;
      if (start) {
        let until = bi + 1;
        while (until < beats.length && beats[until].root === b.root && beats[until].index !== 0) until++;
        const to = until < beats.length ? beats[until].frame : chaseEnd;
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
    push("chime", s.frame, { notes: [CHIMES[s.star - 1]], vel: 0.8, dur: 1.3 });
    push("radio", s.frame + 2, { dur: 0.34, vel: 0.7 });
    push("beep", s.frame + 5, { vel: 0.7 });
    push("radio", s.frame + 28, { dur: 0.12, vel: 0.45 });
  }

  // ---- l'interception (une à cinq étoiles) : la radio grésille sur sa ligne ; l'étoile suivante clignote deux
  // fois, un tintement étouffé qui ne s'allume pas, calé sur la double croche la plus proche
  if (plan.intercept !== null) {
    push("radio", plan.intercept, { dur: 0.4, vel: 0.85 });
    push("beep", plan.intercept + 3, { vel: 0.8 });
  }
  // la double croche la plus proche (les temps étirés n'ont plus 12 images : au plus un huitième de temps d'écart)
  const onGrid = (f: number) => {
    let best = f;
    let gap = Infinity;
    for (const b of beats) {
      for (let j = 0; j < 4; j++) {
        const g = b.frame + (j * b.len) / 4;
        if (Math.abs(g - f) < gap) [best, gap] = [g, Math.abs(g - f)];
      }
    }
    return gap <= 0.5 + beats[0].len / 8 ? best : f;
  };
  if (plan.flicker) for (const [a] of plan.flicker.frames) push("deny", onGrid(a), { notes: [CHIMES[plan.flicker.star - 1]], vel: 0.5 });

  // ---- la fin de la poursuite : la musique s'arrête net sur le temps qui suit son dernier tronçon, la nappe prend le
  // relais. Une à cinq étoiles : l'image gèle sur place (freeze = cut - 1), l'arrêt et l'impact sur ce temps, une
  // image après le gel (le son ne devance jamais l'image). Six étoiles : l'arrêt à l'entrée de la pointe, la berline
  // freine sous la nappe jusqu'à l'arrêt ; l'impact au gel de FIN6, une image après lui. Plus de coupe, plus de
  // claquement de coupe.
  push("kick", chaseEnd, { vel: 1, layer: 0 });
  push("boom", chaseEnd, { vel: 1, dur: 1.4, layer: 0 });
  push("crash", chaseEnd, { vel: 1, layer: 0 });
  push("nappe", chaseEnd, { notes: level === 6 ? NAPPE_FIN6 : NAPPE_FIN, dur: (flash.peak - chaseEnd) / FPS, release: (flash.to - flash.peak) / FPS, vel: 1 });

  // ---- l'arrêt sur image : l'impact (sur place, il tombe avec l'arrêt de la musique), la radio de fin
  if (cut !== chaseEnd) push("boom", cut, { vel: 1, dur: 1.2 });
  push("slam", cut, { vel: 1 });
  push("radio", freeze + 3, { dur: 0.3, vel: 0.6 });
  push("beep", freeze + 6, { vel: 0.6 });

  // ---- l'éclair : un souffle qui monte pendant le gel et culmine quand la fiche se pose
  const pre = Math.max(freeze + 1, flash.from - 8);
  push("whoosh", pre, { dur: (flash.peak - pre) / FPS, release: (flash.to - flash.peak) / FPS, vel: 1 });

  events.sort((a, b) => a.frame - b.frame);

  // ---- les courbes : la conduite et le casting jusqu'au gel (à six étoiles, FIN6 comprise : la berline freine et
  // s'arrête sur la pointe), le silence de la scène ensuite
  const at = (keys: Keys) => (f: number) => keyAt(keys, f);
  const chase: Record<Curve, (f: number) => number> = {
    rpm: track(ENGINE_TRACK.rpm),
    load: track(ENGINE_TRACK.load),
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
  // Au gel, la scène se tait : les courbes posées (filtres, fréquences) restent sur la dernière image jouée.
  const curve = (name: Curve, frame: number): number => {
    const f = Math.floor(frame);
    if (f < freeze) return chase[name](f);
    return isKept(name) ? chase[name](freeze - 1) : 0;
  };

  const layers = plan.stars.map((s) => ({ layer: s.star, from: s.frame, to: chaseEnd }));
  return { level, bpm: BPM, cut: chaseEnd, freeze, frames: end, duration: end / FPS, beats, events, layers, curve };
}

/** Les courbes qui restent posées quand la scène se tait (filtres, fréquences) ; les autres tombent à zéro. */
const KEPT = ["rpm", "load", "siren1Hz", "siren2Hz", "siren3Hz", "sirenTone", "rotorRate", "jetTone", "rainTone", "sfxTone"] as const;
type Kept = (typeof KEPT)[number];
const isKept = (c: Curve): c is Kept => (KEPT as readonly Curve[]).includes(c);

/** Les événements d'une fenêtre [from, to) en secondes du film. */
export function eventsBetween(score: FilmScore, from: number, to: number): SoundEvent[] {
  return score.events.filter((e) => e.at >= from - 1e-9 && e.at < to - 1e-9);
}
