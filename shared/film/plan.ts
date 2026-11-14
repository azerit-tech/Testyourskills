// Le plan du film d'une fiche (§18.36, docs/cinematique-poursuite.md §2) :
// niveau, étoiles et leurs instants, point de coupe, fin à jouer, arrêt sur
// image, flash, durée, lignes de radio. Tout est compté en images (cut.ts) ;
// les secondes s'en déduisent.
import type { CardData, Fact, Lang, Stars } from "../types";
import { LEVEL_LABELS, starsFor } from "../types";
import { SCENE_LIGHT, sceneOf, type Light } from "../scenes";
import { radioLines, type Radio, type RadioCard } from "./radio";
import { ENDINGS, FLICKER_ON, FPS, INTERCEPT_LEAD, SHOT_START, CHASE_FRAMES, CHASE_SHOTS, TITLE_POP, type EndingId } from "./cut";

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
  /** La fin jouée par la seconde balise. */
  ending: EndingId;
  stars: FilmStar[];
  /** La coupe : première image de la fin, et dernière image + 1 de la poursuite jouée. */
  cut: number;
  /** Images de vidéo du fichier de fin. */
  endVideo: number;
  /** Première image de l'arrêt sur image. */
  freeze: number;
  /** L'interception (une à cinq étoiles) : la radio l'annonce dès cette image, avant la coupe ; absente à six étoiles. */
  intercept: number | null;
  /** L'étoile suivante clignote deux fois juste avant la coupe, puis s'éteint ; absent à six étoiles. */
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
  /** Le niveau, qui claque sur l'arrêt sur image. */
  title: Fact;
  radio: Record<Lang, Radio>;
}

export type FilmCard = Pick<CardData, "id" | "login" | "name"> & RadioCard;

export function filmPlan(card: FilmCard): FilmPlan {
  const level = starsFor(card.overall);
  const scene = sceneOf(card.profile?.id);
  const light = SCENE_LIGHT[scene];
  const ending: EndingId = level === 6 ? "fin6" : "fin";
  const e = ENDINGS[ending];
  const stars: FilmStar[] = [];
  for (let k = 1; k <= level; k++) {
    const frame = SHOT_START[CHASE_SHOTS[k]];
    stars.push({ star: k as Stars, frame, at: frame / FPS });
  }
  // Coupe sur la fin après le dernier plan joué : le plan suivant ne s'ouvre jamais.
  const cut = level === 6 ? CHASE_FRAMES : SHOT_START[CHASE_SHOTS[level + 1]];
  const freeze = cut + e.video;
  const from = freeze + e.freeze;
  const flash = { from, peak: from + e.rise, to: from + e.flash };
  return {
    id: card.id,
    level,
    light,
    tone: FREEZE_TONES[light],
    scene,
    ending,
    stars,
    cut,
    endVideo: e.video,
    freeze,
    intercept: level < 6 ? cut - INTERCEPT_LEAD : null,
    flicker: level < 6 ? { star: (level + 1) as Stars, frames: FLICKER_ON.map(([a, b]) => [cut + a, cut + b] as [number, number]) } : null,
    flash,
    frames: flash.to,
    duration: flash.to / FPS,
    handoffAt: flash.peak / FPS,
    stageAt: (freeze + STAGE_AFTER) / FPS,
    plate: card.login ? `@${card.login}` : card.name,
    title: LEVEL_LABELS[level],
    radio: { fr: radioLines(card, "fr"), en: radioLines(card, "en") },
  };
}
