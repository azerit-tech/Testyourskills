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
  DETAIL_COUNT,
  DETAIL_HIT,
  DETAIL_IN,
  DETAIL_SLAP,
  DETAIL_SLAP_FROM,
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
  STAMP_RISE,
  STAMP_SIDE,
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
import type { DetailKind } from "./detail";
import type { CriterionCode } from "../types";
import { STRINGS } from "../card/i18n";

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
  /** 0 : tenue au centre ; 1 : montée à la hauteur de la rangée, à sa taille. */
  fly: number;
  /**
   * Le glissement vers sa place, de 0 (au centre) à 1 (sa place) : il part quand l'étoile est presque montée
   * (§18.95). Elle monte d'abord, au centre, puis glisse au-dessus du relevé des critères, jamais par-dessus.
   */
  side: number;
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

/**
 * Un critère du relevé (SPEC §18.95). Toutes les lignes du film sont là dès la première image, à leur place :
 * celles qui ne sont pas encore tombées sont absentes (`shown` faux), le relevé ne bouge pas quand il se remplit.
 */
export interface DetailRowHud {
  code: CriterionCode;
  kind: DetailKind;
  /** Le nom court du critère, celui du dos de la fiche : « Parcours », « Code ». */
  label: string;
  /** L'état sans chiffre (« non prouvé », « pas au dossier », « comptée ») ; vide pour une note. */
  state: string;
  /** La note qui compte de 0 à sa valeur (montée), puis la valeur ; `step` : la valeur tout de suite (mouvement réduit). */
  value: number;
  step: number;
  /** Hors moyenne : en retrait. */
  out: boolean;
  /** Tombé : à l'écran. */
  shown: boolean;
  /** Son coup : l'étiquette s'inverse quelques images. */
  hit: boolean;
  /** 0 : absent ; 1 : posé. */
  enter: number;
  /** L'échelle du claquement de la note : de DETAIL_SLAP_FROM à 1. */
  slap: number;
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
  /**
   * Le score qui monte (§18.78), sous la rangée : `value` en montée adoucie, `step` palier par palier (mouvement
   * réduit), entiers, de 0 à la note, atteinte à l'image du gel.
   */
  score: { value: number; step: number };
  /** Le relevé des critères (§18.95), dans l'ordre où ils tombent ; vide sans grille. */
  detail: DetailRowHud[];
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
        // le vol : la montée (et la réduction) sur les six premiers dixièmes, le glissement ensuite, fini à la dernière image en l'air
        const t = age <= STAMP_HOLD ? 0 : (age - STAMP_HOLD) / (STAR_LAND - STAMP_HOLD);
        stamp = {
          star: s.star,
          scale: age < STAMP_SLAP ? STAMP_FROM - ((STAMP_FROM - 1) * age) / STAMP_SLAP : 1,
          fly: easeInOut(clamp01(t / STAMP_RISE)),
          side: easeInOut(clamp01((t - STAMP_SIDE[0]) / (STAMP_SIDE[1] - STAMP_SIDE[0]))),
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

  // Le score : chaque montée part au coup de son étoile, adoucie ; il tient entre deux.
  let value = 0;
  let step = 0;
  for (const s of plan.score) {
    if (f < s.from) break;
    step = s.b;
    // arrondi par défaut : le palier (la note, au gel) n'est atteint qu'à la fin de sa montée
    const k = clamp01((frame - s.from) / Math.max(1, s.to - s.from));
    value = k >= 1 ? s.b : Math.floor(s.a + (s.b - s.a) * easeOut(k));
  }
  const score = { value: Math.round(value), step: Math.round(step) };

  // Le relevé : chaque critère tombe à son image, sa note claque et compte jusqu'à sa valeur ; il reste jusqu'au flash.
  const back = STRINGS[lang].back;
  const detail: DetailRowHud[] = plan.detail.map((b) => {
    const shown = frame >= b.frame;
    const age = frame - b.frame;
    const n = b.score ?? 0;
    const k = clamp01(age / DETAIL_COUNT);
    return {
      code: b.code,
      kind: b.kind,
      label: back.criteria[b.code],
      state: b.kind === "unproven" ? back.unproven : b.kind === "missing" ? back.missing : b.kind === "counted" ? back.counted : "",
      value: !shown ? 0 : k >= 1 ? n : Math.floor(n * easeOut(k)),
      step: n,
      out: b.out,
      shown,
      hit: shown && age < DETAIL_HIT,
      enter: shown ? clamp01((age + 1) / DETAIL_IN) : 0,
      slap: shown && age < DETAIL_SLAP ? DETAIL_SLAP_FROM - ((DETAIL_SLAP_FROM - 1) * age) / DETAIL_SLAP : 1,
    };
  });

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
    score,
    detail,
    flash: flashOpacity,
    grain: grainAt(Math.floor(frame / GRAIN_STEP)),
  };
}
