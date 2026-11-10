// Le HUD du film (§18.36, docs/cinematique-poursuite.md §2.2 et §5.2) : son
// état exact à l'instant t, fonction pure du plan. Le lecteur lui passe le
// temps de la vidéo : le HUD ne peut pas se décaler de l'image. Sans DOM :
// testé sans navigateur, et rendu tel quel côté serveur pour le clip (§18.8).
import type { Lang } from "../types";
import { BANDS_CLOSE, CUT_INK, FPS, GRAIN_STEP, SHAKE, SQUARE_STEP, STAR_POP, TITLE_FROM, TITLE_POP, chaseShotAt, ENDINGS, type ShotId } from "./cut";
import type { FilmPlan } from "./plan";

export type FilmPhase = "chase" | "ending" | "freeze" | "flash" | "over";

export interface StarHud {
  on: boolean;
  /** 1,5 au claquement, puis 1. */
  scale: number;
}

export interface Hud {
  /** L'image du film (entière). */
  frame: number;
  phase: FilmPhase;
  /** Le plan à l'écran. */
  shot: ShotId;
  /** La balise vidéo visible : la poursuite, la fin, ou aucune (la fiche est posée). */
  video: "chase" | "ending" | null;
  /** L'image dans le fichier de cette balise. */
  videoFrame: number;
  /** Les six étoiles. */
  stars: StarHud[];
  /** Étoiles allumées par la poursuite (jamais plus que le niveau). */
  lit: number;
  /** La ligne de radio, et la couleur de son carré ; null pendant l'ouverture. */
  radio: { text: string; square: "coral" | "lilac" } | null;
  /** Fermeture des bandes d'encre : 0 ouvertes, 1 fermées. */
  bands: number;
  /** Les deux images d'encre de la bascule. */
  ink: boolean;
  /** L'arrêt sur image : deux tons, plaque et titre (échelle du claquement, 1,2 à 1). */
  freeze: { titleScale: number } | null;
  /** Opacité du flash crème. */
  flash: number;
  /** La secousse de l'image (px). */
  shake: [number, number];
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

/** L'état du HUD à l'instant t (secondes du film). */
export function hudAt(plan: FilmPlan, t: number, lang: Lang): Hud {
  const f = Math.max(0, t * FPS);
  const frame = Math.floor(f + 1e-6);
  const { cut, freeze, flash } = plan;
  const phase: FilmPhase = frame < cut ? "chase" : frame < freeze ? "ending" : frame < flash.from ? "freeze" : frame < flash.to ? "flash" : "over";
  const landed = frame >= flash.peak;

  // Les étoiles de la poursuite, chacune sur sa coupe.
  let lit = 0;
  let last = -Infinity;
  for (const s of plan.stars) {
    if (frame >= s.frame) {
      lit = s.star;
      last = s.frame;
    }
  }
  const stars: StarHud[] = [];
  for (let k = 1; k <= 6; k++) {
    const s = plan.stars[k - 1];
    if (s && frame >= s.frame) {
      const age = frame - s.frame;
      stars.push({ on: true, scale: age < STAR_POP ? 1.5 - (0.5 * age) / STAR_POP : 1 });
    } else {
      const blink = plan.flicker?.star === k && plan.flicker.frames.some(([a, b]) => frame >= a && frame < b);
      stars.push({ on: blink, scale: 1 });
    }
  }

  // La radio : muette à l'ouverture, une ligne par étoile, puis la fin de course au gel.
  const r = plan.radio[lang];
  const text = phase === "chase" || phase === "ending" ? (lit > 0 ? r.beats[lit - 1] : null) : r.end;
  const radio = text ? { text, square: (Math.floor(frame / SQUARE_STEP) % 2 === 0 ? "coral" : "lilac") as "coral" | "lilac" } : null;

  // Les bandes se ferment à l'ouverture, s'ouvrent après le sommet du flash.
  const bands = landed ? 1 - clamp01((f - flash.peak) / (flash.to - flash.peak)) : clamp01(f / BANDS_CLOSE);
  const flashOpacity = frame < flash.from ? 0 : f < flash.peak ? clamp01((f - flash.from) / (flash.peak - flash.from)) : 1 - clamp01((f - flash.peak) / (flash.to - flash.peak));

  const age = frame - last;
  const shake: [number, number] = phase === "chase" && age >= 0 && age < SHAKE.length ? [SHAKE[age][0], SHAKE[age][1]] : [0, 0];
  const frozen = phase === "freeze" || (phase === "flash" && !landed);

  return {
    frame,
    phase,
    shot: phase === "chase" ? chaseShotAt(frame) : ENDINGS[plan.ending].shot,
    video: landed ? null : phase === "chase" ? "chase" : "ending",
    videoFrame: phase === "chase" ? frame : Math.min(frame - cut, plan.endVideo - 1),
    stars,
    lit,
    radio,
    bands,
    ink: frame >= cut - 1 && frame < cut - 1 + CUT_INK,
    freeze: frozen ? { titleScale: frame - freeze < TITLE_POP ? TITLE_FROM - ((TITLE_FROM - 1) * (frame - freeze)) / TITLE_POP : 1 } : null,
    flash: flashOpacity,
    shake,
    grain: grainAt(Math.floor(frame / GRAIN_STEP)),
  };
}
