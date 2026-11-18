// Le HUD du film (§18.36, docs/cinematique-poursuite.md §2.2 et §5.2) : son
// état exact à l'instant t, fonction pure du plan. Le lecteur lui passe le
// temps de la vidéo : le HUD ne peut pas se décaler de l'image. Sans DOM :
// testé sans navigateur, et rendu tel quel côté serveur pour le clip (§18.8).
//
// Tout est posé sur l'image, rien n'est gravé dans le film : la rangée des six
// étoiles en haut, sur le ciel ; la jauge de l'étoile suivante, qui se remplit
// pendant que la poursuite continue ; l'étoile qui tombe en grand puis rejoint
// sa place ; une ligne sous la berline ; au gel, l'étoile refusée et sa ligne.
import type { Lang, Stars } from "../types";
import {
  BANDS_CLOSE,
  FPS,
  GAUGE_AFTER,
  GAUGE_EASE,
  GAUGE_OPEN,
  GRAIN_STEP,
  LINE_HIT,
  LINE_IN,
  LINE_LEAD,
  LINE_OUT,
  LINE_TAIL,
  STAMP_FROM,
  STAMP_HOLD,
  STAMP_SLAP,
  STAR_LAND,
  STAR_POP,
  TITLE_FROM,
  TITLE_POP,
  VERDICT_AT,
  VERDICT_IN,
  shotAt,
  type ShotId,
} from "./cut";
import type { FilmPlan } from "./plan";

/** « ending » : à six étoiles, FIN6, de l'entrée de la pointe au gel (la musique s'est arrêtée, la berline freine). */
export type FilmPhase = "chase" | "ending" | "freeze" | "flash" | "over";

/** Une étoile de la rangée. */
export interface StarHud {
  /** Gagnée : elle est tombée (son coup a sonné). Jamais plus que le niveau. */
  on: boolean;
  /** Dans la rangée : 1,5 quand elle s'y pose, puis 1. */
  scale: number;
  /**
   * Gagnée, encore en l'air (`hud.stamp`) : sa place garde la jauge pleine, en
   * demi-teinte. Mouvement réduit : l'écran l'allume tout de suite à sa place.
   */
  flying?: true;
  /**
   * La jauge, de 0 à 1 : l'étoile en jeu (la suivante), qui se remplit jusqu'à
   * l'instant où elle tombe, ou l'étoile refusée, qui s'arrête en chemin. Jamais
   * pleine avant le coup : une capture ne montre pas une étoile de trop.
   */
  fill?: number;
  /** L'étoile refusée, au gel : l'opacité de son contour (0,95 au battement, 0,3 entre deux), jusqu'à ce qu'elle soit vide. */
  pending?: number;
}

/** L'étoile qui tombe en grand, sur le ciel, puis vole vers sa place dans la rangée. */
export interface StampHud {
  star: Stars;
  /** L'échelle du claquement : de 2,1 à 1 en trois images. */
  scale: number;
  /** 0 : tenue au centre ; 1 : arrivée à sa place, à la taille de la rangée. */
  fly: number;
  opacity: number;
}

/** La ligne posée sous la berline : une étiquette, une ligne. */
export interface LineHud {
  /** L'étoile qu'elle accompagne. */
  star: Stars;
  label: string;
  text: string;
  /** Le coup de l'étoile : l'étiquette s'inverse (encre sur crème) quelques images. */
  hit: boolean;
  /** 0 : absente ; 1 : posée. Elle monte en entrant, s'efface en sortant. */
  enter: number;
}

export interface Hud {
  /** L'image du film (entière). */
  frame: number;
  phase: FilmPhase;
  /** Le tronçon à l'écran. */
  shot: ShotId;
  /** La vidéo visible (un seul fichier, une seule balise), ou aucune : la fiche est posée. */
  video: "chase" | null;
  /** L'image du fichier à l'écran. */
  videoFrame: number;
  /** Les six étoiles de la rangée. */
  stars: StarHud[];
  /** Étoiles gagnées par la poursuite (jamais plus que le niveau). */
  lit: number;
  /** L'étoile qui tombe, de son coup à son arrivée dans la rangée ; null le reste du temps. */
  stamp: StampHud | null;
  /** La ligne sous la berline ; null à l'ouverture, entre deux lignes, et dès le gel. */
  line: LineHud | null;
  /** L'habillage (les ombres d'encre en haut et en bas, la bande d'encre du téléphone couché) : 0 absent, 1 posé. */
  bands: number;
  /**
   * L'arrêt sur image : deux tons, plaque et titre (échelle du claquement, 1,2 à 1),
   * puis la ligne de l'étoile refusée (`plan.verdict`), à cette opacité ; 0 à six étoiles.
   */
  freeze: { titleScale: number; verdict: number } | null;
  /** Opacité du flash crème. */
  flash: number;
  /** La position de la tuile de grain (px, 0 à 127). */
  grain: [number, number];
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Un tirage stable par position de grain : la même image, le même grain. */
function grainAt(step: number): [number, number] {
  let h = Math.imul(step + 1, 0x9e3779b1) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  return [h & 127, (h >>> 8) & 127];
}

const easeOut = (x: number) => 1 - (1 - x) * (1 - x);
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x));

/** L'état du HUD à l'instant t (secondes du film). */
export function hudAt(plan: FilmPlan, t: number, lang: Lang): Hud {
  const f = Math.max(0, t * FPS);
  const frame = Math.floor(f + 1e-6);
  const { cut, chaseEnd, freeze, flash, verdict } = plan;
  // Le gel (cut - 1) suit la vidéo, sur place ; à six étoiles, FIN6 (de chaseEnd au gel) est la phase « ending ».
  const phase: FilmPhase = frame >= flash.to ? "over" : frame >= flash.from ? "flash" : frame >= freeze ? "freeze" : frame < chaseEnd ? "chase" : "ending";
  const landed = frame >= flash.peak;
  const frozen = phase === "freeze" || (phase === "flash" && !landed);

  // Les étoiles, chacune à son instant du trajet : son coup sonne, elle tombe en grand sur le ciel, puis se pose
  // dans la rangée. L'image ne bouge pas.
  let lit = 0;
  for (const s of plan.stars) if (frame >= s.frame) lit = s.star;
  const stars: StarHud[] = [];
  let stamp: StampHud | null = null;
  for (let k = 1; k <= 6; k++) {
    const s = plan.stars[k - 1];
    // la jauge de l'étoile k part quatre images après le coup de la précédente (la première, à l'image 6)
    const from = k === 1 ? GAUGE_OPEN : plan.stars[k - 2] ? plan.stars[k - 2].frame + GAUGE_AFTER : Infinity;
    if (s && frame >= s.frame) {
      const age = f - s.frame;
      if (age < STAR_LAND) {
        stars.push({ on: true, scale: 1, flying: true, fill: 1 });
        stamp = {
          star: s.star,
          scale: age < STAMP_SLAP ? STAMP_FROM - ((STAMP_FROM - 1) * age) / STAMP_SLAP : 1,
          fly: age <= STAMP_HOLD ? 0 : easeInOut((age - STAMP_HOLD) / (STAR_LAND - STAMP_HOLD)),
          opacity: clamp01(0.7 + 0.3 * age),
        };
      } else {
        const since = frame - s.frame - STAR_LAND;
        stars.push({ on: true, scale: since < STAR_POP ? 1.5 - (0.5 * since) / STAR_POP : 1 });
      }
    } else if (s && f >= from) {
      // l'étoile en jeu : lente d'abord, pleine seulement à l'image de son coup
      stars.push({ on: false, scale: 1, fill: Math.min(0.999, clamp01((f - from) / (s.frame - from)) ** GAUGE_EASE) });
    } else if (verdict?.star === k && f >= from && f < verdict.drain[1]) {
      // l'étoile refusée : elle monte jusqu'à la part vraie de la note, se fige avec l'image, bat deux fois, se vide
      const rise = verdict.fill * easeOut(clamp01((f - from) / (freeze - from)));
      if (frame < freeze) stars.push({ on: false, scale: 1, fill: rise });
      else {
        const [a, b] = verdict.drain;
        const blink = verdict.blinks.some(([x, y]) => frame >= x && frame < y);
        stars.push({ on: false, scale: 1, fill: verdict.fill * (1 - clamp01((f - a) / (b - a))), pending: blink ? 0.95 : 0.3 });
      }
    } else stars.push({ on: false, scale: 1 });
  }

  // La ligne sous la berline, une par étoile gagnée : elle arrive avant son étoile (on la lit quand la route est
  // calme), l'étoile tombe comme son verdict (l'étiquette s'inverse), elle reste encore un peu, s'efface au gel.
  // Jamais deux à la fois : une ligne attend que la précédente soit sortie.
  let line: LineHud | null = null;
  if (frame < freeze) {
    const all = plan.lines[lang];
    let prevEnd = 0;
    for (const s of plan.stars) {
      const start = Math.max(s.frame - LINE_LEAD, prevEnd);
      const end = Math.min(s.frame + LINE_TAIL, freeze);
      prevEnd = end + 2;
      const l = all[s.star - 1];
      if (!l || f < start || f >= end) continue;
      line = {
        star: s.star,
        label: l.label,
        text: l.text,
        hit: frame >= s.frame && frame < s.frame + LINE_HIT,
        enter: Math.min(clamp01((f - start) / LINE_IN), clamp01((end - f) / LINE_OUT)),
      };
    }
  }

  // L'habillage se pose à l'ouverture, se lève après le sommet du flash.
  const bands = landed ? 1 - clamp01((f - flash.peak) / (flash.to - flash.peak)) : clamp01(f / BANDS_CLOSE);
  const flashOpacity = frame < flash.from ? 0 : f < flash.peak ? clamp01((f - flash.from) / (flash.peak - flash.from)) : 1 - clamp01((f - flash.peak) / (flash.to - flash.peak));

  return {
    frame,
    phase,
    shot: shotAt(Math.min(frame, cut - 1)),
    video: landed ? null : "chase",
    // gelée sur place, la vidéo reste sur la dernière image de son dernier tronçon
    videoFrame: Math.min(frame, cut - 1),
    stars,
    lit,
    stamp,
    line,
    bands,
    freeze: frozen
      ? {
          titleScale: frame - freeze < TITLE_POP ? TITLE_FROM - ((TITLE_FROM - 1) * (frame - freeze)) / TITLE_POP : 1,
          verdict: verdict ? clamp01((f - freeze - VERDICT_AT) / VERDICT_IN) : 0,
        }
      : null,
    flash: flashOpacity,
    grain: grainAt(Math.floor(frame / GRAIN_STEP)),
  };
}
