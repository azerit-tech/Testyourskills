// Le HUD du film (§18.36, docs/cinematique-poursuite.md §2.2 et §5.2) : son
// état exact à l'instant t, fonction pure du plan. Le lecteur lui passe le
// temps de la vidéo : le HUD ne peut pas se décaler de l'image. Sans DOM :
// testé sans navigateur, et rendu tel quel côté serveur pour le clip (§18.8).
import type { Lang } from "../types";
import { BANDS_CLOSE, FPS, GRAIN_STEP, SQUARE_STEP, STAR_POP, TITLE_FROM, TITLE_POP, shotAt, type ShotId } from "./cut";
import type { FilmPlan } from "./plan";

/** « ending » : à six étoiles, FIN6, de l'entrée de la pointe au gel (la musique s'est arrêtée, la berline freine). */
export type FilmPhase = "chase" | "ending" | "freeze" | "flash" | "over";

export interface StarHud {
  on: boolean;
  /** 1,5 au claquement, puis 1. */
  scale: number;
  /** L'étoile en suspens, juste avant le gel : jamais pleine, son contour seul, à cette
   * opacité (0,6 au battement, 0,25 entre deux). Absente le reste du film. */
  pending?: number;
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
  /** Les six étoiles. */
  stars: StarHud[];
  /** Étoiles allumées par la poursuite (jamais plus que le niveau). */
  lit: number;
  /**
   * La ligne de radio, son étiquette au-dessus (le chef d'accusation) et la couleur de son carré ; null pendant l'ouverture.
   * `below` : la ligne suivante, en petit dessous, quand celle de la dernière étoile reste à l'écran (`plan.keepLine`) :
   * l'interception, puis la fin de course. L'étiquette tombe alors : deux lignes seulement tiennent dans la bande.
   */
  radio: { text: string; kicker: string | null; below: string | null; square: "coral" | "lilac" } | null;
  /** Fermeture des bandes d'encre : 0 ouvertes, 1 fermées. */
  bands: number;
  /** L'arrêt sur image : deux tons, plaque et titre (échelle du claquement, 1,2 à 1). */
  freeze: { titleScale: number } | null;
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

/** L'état du HUD à l'instant t (secondes du film). */
export function hudAt(plan: FilmPlan, t: number, lang: Lang): Hud {
  const f = Math.max(0, t * FPS);
  const frame = Math.floor(f + 1e-6);
  const { cut, chaseEnd, freeze, flash } = plan;
  // Le gel (cut - 1) suit la vidéo, sur place ; à six étoiles, FIN6 (de chaseEnd au gel) est la phase « ending ».
  const phase: FilmPhase = frame >= flash.to ? "over" : frame >= flash.from ? "flash" : frame >= freeze ? "freeze" : frame < chaseEnd ? "chase" : "ending";
  const landed = frame >= flash.peak;

  // Les étoiles, chacune à son instant du trajet : elle claque (son « pop »), l'image ne bouge pas.
  let lit = 0;
  for (const s of plan.stars) if (frame >= s.frame) lit = s.star;
  const stars: StarHud[] = [];
  for (let k = 1; k <= 6; k++) {
    const s = plan.stars[k - 1];
    if (s && frame >= s.frame) {
      const age = frame - s.frame;
      stars.push({ on: true, scale: age < STAR_POP ? 1.5 - (0.5 * age) / STAR_POP : 1 });
    } else {
      // L'étoile suivante, en suspens : son contour bat deux fois, elle ne s'allume jamais
      // (une capture à cet instant ne doit pas montrer une étoile de trop).
      const fl = plan.flicker?.star === k ? plan.flicker.frames : null;
      const inSpan = !!fl?.length && frame >= fl[0][0] && frame < fl[fl.length - 1][1];
      const blink = !!fl && fl.some(([a, b]) => frame >= a && frame < b);
      stars.push(inSpan ? { on: false, scale: 1, pending: blink ? 0.6 : 0.25 } : { on: false, scale: 1 });
    }
  }

  // La radio : muette à l'ouverture, une ligne par étoile, l'interception juste
  // avant le gel (une à cinq étoiles), puis la fin de course au gel. Quand
  // l'interception suit de trop près la dernière étoile (plan.keepLine), la ligne
  // de l'étoile reste jusqu'à la fiche, les deux autres passent dessous, en petit.
  const r = plan.radio[lang];
  const live = phase === "chase" || phase === "ending";
  const intercepted = plan.intercept !== null && frame >= plan.intercept;
  const news = live ? (intercepted ? r.intercept : null) : r.end;
  const beat = lit > 0 && (news === null || plan.keepLine) ? lit - 1 : -1;
  const below = beat >= 0 ? news : null;
  const text = beat >= 0 ? r.beats[beat] : news;
  const kicker = beat >= 0 && below === null ? (r.kickers[beat] ?? null) : null;
  const radio = text ? { text, kicker, below, square: (Math.floor(frame / SQUARE_STEP) % 2 === 0 ? "coral" : "lilac") as "coral" | "lilac" } : null;

  // Les bandes se ferment à l'ouverture, s'ouvrent après le sommet du flash.
  const bands = landed ? 1 - clamp01((f - flash.peak) / (flash.to - flash.peak)) : clamp01(f / BANDS_CLOSE);
  const flashOpacity = frame < flash.from ? 0 : f < flash.peak ? clamp01((f - flash.from) / (flash.peak - flash.from)) : 1 - clamp01((f - flash.peak) / (flash.to - flash.peak));

  const frozen = phase === "freeze" || (phase === "flash" && !landed);

  return {
    frame,
    phase,
    shot: shotAt(Math.min(frame, cut - 1)),
    video: landed ? null : "chase",
    // gelée sur place, la vidéo reste sur la dernière image de son dernier tronçon
    videoFrame: Math.min(frame, cut - 1),
    stars,
    lit,
    radio,
    bands,
    freeze: frozen ? { titleScale: frame - freeze < TITLE_POP ? TITLE_FROM - ((TITLE_FROM - 1) * (frame - freeze)) / TITLE_POP : 1 } : null,
    flash: flashOpacity,
    grain: grainAt(Math.floor(frame / GRAIN_STEP)),
  };
}
