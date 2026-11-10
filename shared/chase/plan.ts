// Le minutage de la poursuite (§18.33), sans DOM : une fonction de la fiche.
// 1,2 s d'ouverture (la voiture seule, rue calme), 1,4 s par étoile jusqu'au
// niveau de la personne, 1,6 s de fin (l'étoile suivante clignote, la voiture
// freine devant son lieu du crime, flash blanc, la fiche se pose).
import type { CardData, Lang, Stars } from "../types";
import { starsFor } from "../types";
import { SCENE_LIGHT, sceneOf, type Light } from "../scenes";
import { radioLines, type Radio, type RadioCard } from "./radio";

export const OPENING = 1.2;
export const BEAT = 1.4;
export const ENDING = 1.6;
/** Le flash blanc, à la toute fin : la fiche se pose à son sommet. */
export const FLASH = 0.2;

/** Le renfort qu'amène chaque étoile, cumulés (§18.33). */
export type Unit = "carL" | "carR" | "carM" | "van" | "heli1" | "heli2" | "heli3";
export const UNITS_BY_STAR: Record<Stars, Unit[]> = {
  1: ["carL"],
  2: ["carR"],
  3: ["carM"],
  4: ["van"],
  5: ["heli1"],
  6: ["heli2", "heli3"],
};

/**
 * Où regarder dans chaque décor (part de la largeur de l'image) : en hauteur,
 * le téléphone n'en montre qu'un tiers, recadré sur ce qui dit le profil
 * (la fenêtre allumée, le fauteuil, la valise…), pas sur le centre géométrique.
 */
export const SCENE_FOCUS: Record<string, number> = {
  arsonist: 0.56,
  forger: 0.5,
  kingpin: 0.68,
  mastermind: 0.6,
  delivery_machine: 0.52,
  night_owl: 0.7,
  repeat_offender: 0.5,
  hoarder: 0.62,
  chameleon: 0.6,
  fresh_blood: 0.62,
  old_school: 0.45,
  ghost: 0.62,
  sleeper_agent: 0.5,
  default: 0.68,
};

export interface ChaseBeat {
  /** L'étoile qui s'allume, 1 à 6. */
  star: Stars;
  /** Son instant (s). */
  at: number;
}

export interface ChasePlan {
  id: string;
  /** Graine des tirages (silhouettes de la ville, fenêtres) : la même fiche, la même ville. */
  seed: number;
  level: Stars;
  light: Light;
  /** Le décor peint de la fin (web/public/profiles/{scene}.jpg). */
  scene: string;
  /** Le point du décor à garder dans le cadre (0 à 1 de sa largeur). */
  focus: number;
  /** Durée totale (s) : la fiche se pose à cet instant. */
  duration: number;
  beats: ChaseBeat[];
  /** L'étoile suivante clignote deux fois et reste éteinte ; absent à six étoiles. */
  flicker: { star: Stars; at: number } | null;
  /** La voiture freine : fin de la dernière étoile. */
  brakeAt: number;
  /** Début du flash blanc. */
  flashAt: number;
  radio: Record<Lang, Radio>;
}

/** FNV-1a sur 32 bits : la graine d'une fiche. */
export function seedOf(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Tirage pseudo-aléatoire déterministe (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type ChaseCard = Pick<CardData, "id"> & RadioCard;

export function chasePlan(card: ChaseCard): ChasePlan {
  const level = starsFor(card.overall);
  const scene = sceneOf(card.profile?.id);
  const beats: ChaseBeat[] = [];
  for (let k = 1; k <= level; k++) beats.push({ star: k as Stars, at: OPENING + BEAT * (k - 1) });
  const brakeAt = OPENING + BEAT * level;
  const duration = brakeAt + ENDING;
  return {
    id: card.id,
    seed: seedOf(card.id),
    level,
    light: SCENE_LIGHT[scene],
    scene,
    focus: SCENE_FOCUS[scene] ?? 0.5,
    duration,
    beats,
    flicker: level < 6 ? { star: (level + 1) as Stars, at: brakeAt + 0.05 } : null,
    brakeAt,
    flashAt: duration - FLASH,
    radio: { fr: radioLines(card, "fr"), en: radioLines(card, "en") },
  };
}

/** Ce qui est engagé à l'instant t : étoiles allumées, renforts arrivés (dans l'ordre), hélicoptères. */
export interface Escalation {
  stars: number;
  units: Unit[];
  helicopters: number;
}

export function escalation(plan: ChasePlan, t: number): Escalation {
  const units: Unit[] = [];
  let stars = 0;
  for (const b of plan.beats) {
    if (t < b.at) break;
    stars = b.star;
    units.push(...UNITS_BY_STAR[b.star]);
  }
  return { stars, units, helicopters: units.filter((u) => u.startsWith("heli")).length };
}
