// Le plan du film d'une fiche (§18.36, docs/cinematique-poursuite.md §2) :
// niveau, étoiles et leurs instants, point de coupe, fin à jouer, arrêt sur
// image, flash, durée, lignes de radio. Tout est compté en images (cut.ts) ;
// les secondes s'en déduisent. De une à cinq étoiles, la fin se joue sur place
// (§18.53) : l'arrêt sur image gèle la dernière image du dernier plan joué ;
// seule une fiche à six étoiles coupe sur une fin tournée (FIN6, sur la jetée).
import type { CardData, Fact, Lang, Stars } from "../types";
import { LEVEL_LABELS, starsFor } from "../types";
import { SCENE_LIGHT, sceneOf, type Light } from "../scenes";
import { plateSub } from "../card/mug";
import { radioLines, type Radio, type RadioCard } from "./radio";
import { ENDINGS, FLICKER_ON, FPS, INTERCEPT_LEAD, IN_PLACE, SHOT_START, CHASE_FRAMES, CHASE_SHOTS, TITLE_POP, type EndingId } from "./cut";

/** La fiche se monte deux images après le claquement du titre : l'image est fixe, rien ne bouge à l'écran. */
const STAGE_AFTER = TITLE_POP + 2;

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
  /** L'image du film où elle s'allume : la coupe franche vers son plan. */
  frame: number;
  /** Le même instant, en secondes. */
  at: number;
}

export interface FilmPlan {
  id: string;
  level: Stars;
  light: Light;
  tone: FreezeTone;
  /** Le décor du lieu du crime, où la fiche se pose (web/public/profiles/{scene}.jpg). */
  scene: string;
  /**
   * La fin jouée par la seconde balise : `fin6` à six étoiles ; null de une à
   * cinq, où l'arrêt sur image se fait sur place, sans seconde balise.
   */
  ending: EndingId | null;
  stars: FilmStar[];
  /**
   * La dernière image + 1 de la poursuite jouée. À six étoiles, la coupe : la
   * première image de la fin. De une à cinq, la première image du plan
   * suivant, qui ne paraît jamais.
   */
  cut: number;
  /** Images de vidéo du fichier de fin (0 sans fin). */
  endVideo: number;
  /**
   * Première image de l'arrêt sur image. De une à cinq étoiles, `cut - 1` : la
   * dernière image du dernier plan joué, gelée sur place.
   */
  freeze: number;
  /** L'interception (une à cinq étoiles) : la radio l'annonce dès cette image, avant le gel ; absente à six étoiles. */
  intercept: number | null;
  /** L'étoile suivante clignote deux fois juste avant le gel, puis s'éteint ; absent à six étoiles. */
  flicker: { star: Stars; frames: [number, number][] } | null;
  /** Le flash : début, sommet (la fiche se pose : passage de relais), fin du film. */
  flash: { from: number; peak: number; to: number };
  /** Le film entier, en images, puis en secondes. */
  frames: number;
  duration: number;
  /** Le passage de relais (sommet du flash), en secondes. */
  handoffAt: number;
  /**
   * La fiche se monte, invisible, sous l'arrêt sur image (secondes) : après le
   * claquement du titre, avant le flash. Au sommet, il ne reste qu'à la montrer.
   */
  stageAt: number;
  /** « @pseudo » (ou le nom, sans pseudo) sur la plaque de l'arrêt sur image. */
  plate: string;
  /** La seconde ligne de la plaque, celle de la fiche : « N° 482917 · 14.10.26 ». */
  plateSub: Fact;
  /** Le niveau, qui claque sur l'arrêt sur image. */
  title: Fact;
  radio: Record<Lang, Radio>;
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
  const ending: EndingId | null = level === 6 ? "fin6" : null;
  const stars: FilmStar[] = [];
  for (let k = 1; k <= level; k++) {
    const frame = SHOT_START[CHASE_SHOTS[k]];
    stars.push({ star: k as Stars, frame, at: frame / FPS });
  }
  // La poursuite s'arrête après le dernier plan joué : le plan suivant ne s'ouvre jamais.
  const cut = level === 6 ? CHASE_FRAMES : SHOT_START[CHASE_SHOTS[level + 1]];
  // Six étoiles : la coupe sur FIN6, gelée sur sa dernière image. Une à cinq : le gel sur place.
  const endVideo = ending ? ENDINGS[ending].video : 0;
  const hold = ending ? ENDINGS[ending] : IN_PLACE;
  const freeze = ending ? cut + endVideo : cut - 1;
  const from = freeze + hold.freeze;
  const flash = { from, peak: from + hold.rise, to: from + hold.flash };
  return {
    id: card.id,
    level,
    light,
    tone: FREEZE_TONES[light],
    scene,
    ending,
    stars,
    cut,
    endVideo,
    freeze,
    intercept: level < 6 ? cut - INTERCEPT_LEAD : null,
    flicker: level < 6 ? { star: (level + 1) as Stars, frames: FLICKER_ON.map(([a, b]) => [cut + a, cut + b] as [number, number]) } : null,
    flash,
    frames: flash.to,
    duration: flash.to / FPS,
    handoffAt: flash.peak / FPS,
    stageAt: (freeze + STAGE_AFTER) / FPS,
    plate: card.login ? `@${card.login}` : card.name,
    plateSub: { fr: plateSub(card.id, card.createdAt, "fr"), en: plateSub(card.id, card.createdAt, "en") },
    title: LEVEL_LABELS[level],
    radio: { fr: radioLines(card, "fr"), en: radioLines(card, "en") },
  };
}
