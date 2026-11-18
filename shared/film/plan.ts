// Le plan du film d'une fiche (§18.36, docs/cinematique-poursuite.md §2) :
// niveau, étoiles et leurs instants, point de coupe, fin à jouer, arrêt sur
// image, flash, durée, lignes sous la berline, étoile refusée. Tout est compté en images (cut.ts) ;
// les secondes s'en déduisent. Un seul fichier, un seul trajet (§18.56) : à
// toutes les étoiles, la fin se joue sur place, l'arrêt sur image gèle la
// dernière image du dernier tronçon joué (Pk ; FIN6 à six étoiles, la berline
// arrêtée sur la pointe). Les étoiles sont des instants du trajet (cut.ts).
import type { CardData, Fact, Lang, Stars } from "../types";
import { LEVEL_LABELS, STAR_THRESHOLDS, starsFor } from "../types";
import { SCENE_LIGHT, sceneOf, type Light } from "../scenes";
import { plateSub } from "../card/mug";
import { radioLines, type FilmLine, type RadioCard } from "./radio";
import { CHASE_FRAMES, DENIED_DRAIN, DENIED_MAX, DENIED_MIN, FLICKER_ON, FPS, INTERCEPT_LEAD, SCORE_FINAL, SCORE_RISE, STAR_FRAMES, TITLE_POP, holdOf, playEnd } from "./cut";

/**
 * La fiche se monte quand plus rien ne bouge à l'écran, l'image fixe : deux
 * images après le claquement du titre à six étoiles ; de une à cinq, deux images
 * après que l'étoile refusée s'est vidée.
 */
const STAGE_AFTER = TITLE_POP + 2;
const STAGE_AFTER_DRAIN = 2;

/** Les deux tons de l'arrêt sur image, selon la lumière du profil (§3.1). */
export interface FreezeTone {
  /** Les lumières de l'image gelée. */
  light: string;
  /** Les ombres, jamais noires. */
  shadow: string;
}

export const FREEZE_TONES: Record<Light, FreezeTone> = {
  pink: { light: "#ffb2c6", shadow: "#4b2f54" },
  gold: { light: "#fcbf96", shadow: "#4b2f54" },
  night: { light: "#ccc2f5", shadow: "#243152" },
  dawn: { light: "#e5ddff", shadow: "#4b2f54" },
};

export interface FilmStar {
  star: Stars;
  /** L'image du film où elle s'allume : un instant du trajet (parcours.json), dans le tronçon Pk. */
  frame: number;
  /** Le même instant, en secondes. */
  at: number;
}

/** La ligne de l'étoile refusée, en trois morceaux : « 3 », « e » en exposant, « étoile : à 7 points ». */
export interface VerdictLine {
  ord: string;
  sup: string;
  rest: string;
}

/**
 * L'étoile refusée, de une à cinq étoiles : la suivante, que la note n'atteint
 * pas. Sa jauge monte pendant le dernier tronçon joué jusqu'à la part vraie de
 * la note entre les deux seuils, se fige avec l'image, clignote deux fois et se
 * vide ; la ligne dit de combien elle est manquée.
 */
export interface FilmVerdict {
  star: Stars;
  /** Les points qui manquent pour l'avoir : le seuil suivant moins la note, un au moins. */
  missing: number;
  /** La jauge au gel, de 0 à 1 : la part du chemin faite entre les deux seuils, bornée pour se lire. */
  fill: number;
  /** Le contour vif sur ces intervalles d'images (deux battements, après le coup du gel). */
  blinks: [number, number][];
  /** La jauge se vide entre ces deux images. */
  drain: [number, number];
  line: Record<Lang, VerdictLine>;
}

/** Le texte de la ligne, d'un seul tenant (tests, clip, lecteur d'écran). */
export const verdictText = (l: VerdictLine): string => `${l.ord}${l.sup === "e" ? "ᵉ" : l.sup}${l.rest}`;

const EN_ORDINALS: Record<number, string> = { 2: "2nd", 3: "3rd", 4: "4th", 5: "5th", 6: "6th" };

function verdictOf(level: Stars, overall: number, cut: number): FilmVerdict | null {
  if (level >= 6) return null;
  const lo = level === 1 ? 0 : STAR_THRESHOLDS[level - 2];
  const hi = STAR_THRESHOLDS[level - 1];
  const missing = Math.max(1, Math.ceil(hi - overall));
  const s = missing > 1 ? "s" : "";
  const star = (level + 1) as Stars;
  return {
    star,
    missing,
    fill: Math.min(DENIED_MAX, Math.max(DENIED_MIN, (overall - lo) / (hi - lo))),
    blinks: FLICKER_ON.map(([a, b]) => [cut + a, cut + b] as [number, number]),
    drain: [cut + DENIED_DRAIN[0], cut + DENIED_DRAIN[1]],
    line: {
      fr: { ord: `${star}`, sup: "e", rest: ` étoile\u00a0: à ${missing} point${s}` },
      en: { ord: EN_ORDINALS[star], sup: "", rest: ` star: ${missing} point${s} short` },
    },
  };
}

/** Une montée du score : de `a` à `b`, entre les images `from` et `to`. */
export interface ScoreStep {
  from: number;
  to: number;
  a: number;
  b: number;
}

/** Le seuil de l'étoile k (STAR_THRESHOLDS) : 0 pour la première, qu'on a toujours. */
export const starThreshold = (k: Stars): number => (k === 1 ? 0 : STAR_THRESHOLDS[k - 2]);

/**
 * Les paliers du score (SPEC §18.78) : au coup de chaque étoile gagnée, la montée jusqu'à son seuil ; puis, juste
 * avant le gel, la dernière jusqu'à la note exacte. Jamais au-delà de la note, toujours croissant.
 */
export function scoreSteps(stars: FilmStar[], overall: number, freeze: number): ScoreStep[] {
  const out: ScoreStep[] = [];
  let at = 0;
  let end = 0;
  for (const s of stars) {
    const b = Math.min(overall, starThreshold(s.star));
    end = Math.min(s.frame + SCORE_RISE, freeze);
    if (b > at) out.push({ from: s.frame, to: end, a: at, b });
    at = Math.max(at, b);
  }
  if (overall > at) {
    const from = Math.max(end, freeze - SCORE_FINAL);
    out.push({ from: Math.min(from, freeze - 1), to: freeze, a: at, b: overall });
  }
  return out;
}

export interface FilmPlan {
  id: string;
  level: Stars;
  light: Light;
  tone: FreezeTone;
  /** Le décor du lieu du crime, où la fiche se pose (web/public/profiles/{scene}.jpg). */
  scene: string;
  stars: FilmStar[];
  /**
   * La dernière image + 1 de la vidéo jouée : la première du tronçon suivant,
   * qui ne paraît jamais ; à six étoiles, la fin du fichier (FIN6 comprise).
   */
  cut: number;
  /**
   * La fin de la poursuite : la musique s'y arrête. De une à cinq étoiles, `cut` ;
   * à six, l'entrée de la pointe (la première image de FIN6), où la berline freine
   * jusqu'à l'arrêt sous la nappe.
   */
  chaseEnd: number;
  /** Première image de l'arrêt sur image : `cut - 1`, la dernière image jouée, gelée sur place. */
  freeze: number;
  /** L'interception (une à cinq étoiles) : la radio grésille dès cette image, avant le gel (le son seul) ; absente à six étoiles. */
  intercept: number | null;
  /** L'étoile refusée et sa ligne, au gel ; absente à six étoiles. */
  verdict: FilmVerdict | null;
  /** La note de la fiche, où le score s'arrête au gel. */
  overall: number;
  /** Les montées du score (scoreSteps), dans l'ordre. */
  score: ScoreStep[];
  /** Le flash : début, sommet (la fiche se pose : passage de relais), fin du film. */
  flash: { from: number; peak: number; to: number };
  /** Le film entier, en images, puis en secondes. */
  frames: number;
  duration: number;
  /** Le passage de relais (sommet du flash), en secondes. */
  handoffAt: number;
  /**
   * La fiche se monte, invisible, sous l'arrêt sur image (secondes) : après le
   * claquement du titre et l'étoile refusée, avant le flash. Au sommet, il ne
   * reste qu'à la montrer.
   */
  stageAt: number;
  /** « @pseudo » (ou le nom, sans pseudo) sur la plaque de l'arrêt sur image. */
  plate: string;
  /** La seconde ligne de la plaque, celle de la fiche : « N° 482917 · 14.10.26 ». */
  plateSub: Fact;
  /** Le niveau, qui claque sur l'arrêt sur image. */
  title: Fact;
  /**
   * Les lignes posées sous la berline, une par étoile (les six, quel que soit le
   * niveau : seules celles des étoiles gagnées paraissent). Aujourd'hui la radio
   * (radio.ts) ; demain les pièces du parcours, dans le même format.
   */
  lines: Record<Lang, FilmLine[]>;
}

export type FilmCard = Pick<CardData, "id" | "login" | "name" | "createdAt"> & RadioCard;

/**
 * Deux plans qui jouent le même film : même contenu, quel que soit l'objet. Le
 * plan n'est fait que de données (nombres, textes, tableaux), la comparaison
 * de leur écriture suffit et suit d'elle-même tout ce que le plan lira demain.
 */
export function samePlan(a: FilmPlan, b: FilmPlan): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

export function filmPlan(card: FilmCard): FilmPlan {
  const level = starsFor(card.overall);
  const scene = sceneOf(card.profile?.id);
  const light = SCENE_LIGHT[scene];
  const stars: FilmStar[] = [];
  for (let k = 1; k <= level; k++) {
    const frame = STAR_FRAMES[k - 1];
    stars.push({ star: k as Stars, frame, at: frame / FPS });
  }
  // La vidéo s'arrête après le dernier tronçon joué : le suivant ne paraît jamais. Sa dernière image gèle sur place.
  const cut = playEnd(level);
  const hold = holdOf(level);
  const freeze = cut - 1;
  const from = freeze + hold.freeze;
  const flash = { from, peak: from + hold.rise, to: from + hold.flash };
  const intercept = level < 6 ? cut - INTERCEPT_LEAD : null;
  const verdict = verdictOf(level, card.overall, cut);
  return {
    id: card.id,
    level,
    light,
    tone: FREEZE_TONES[light],
    scene,
    stars,
    cut,
    chaseEnd: level === 6 ? CHASE_FRAMES : cut,
    freeze,
    intercept,
    verdict,
    overall: card.overall,
    score: scoreSteps(stars, card.overall, freeze),
    flash,
    frames: flash.to,
    duration: flash.to / FPS,
    handoffAt: flash.peak / FPS,
    stageAt: (verdict ? verdict.drain[1] + STAGE_AFTER_DRAIN : freeze + STAGE_AFTER) / FPS,
    plate: card.login ? `@${card.login}` : card.name,
    plateSub: { fr: plateSub(card.id, card.createdAt, "fr"), en: plateSub(card.id, card.createdAt, "en") },
    title: LEVEL_LABELS[level],
    lines: { fr: radioLines(card, "fr"), en: radioLines(card, "en") },
  };
}
