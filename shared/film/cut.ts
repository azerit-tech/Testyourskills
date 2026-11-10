// Le découpage du film de la poursuite (§18.36, docs/cinematique-poursuite.md
// §2) : 24 images par seconde, toutes les durées en images, l'ordre des plans.
// La seule source des durées : le lecteur, le HUD, les tests et le montage
// (scripts/film-assemble.ts) lisent ce fichier. Pur, sans DOM.

export const FPS = 24;

/** Les plans de la poursuite, dans l'ordre du fichier `poursuite` : l'ouverture, puis un plan par étoile. */
export const CHASE_SHOTS = ["OUV", "P1", "P2", "P3", "P4", "P5", "P6"] as const;
export type ChaseShot = (typeof CHASE_SHOTS)[number];
/** Les deux fins : `fin` (une à cinq étoiles), `fin6` (six étoiles, l'orbite). */
export type EndingId = "fin" | "fin6";
export type ShotId = ChaseShot | "FIN" | "FIN6";

/** Durée de chaque plan de la poursuite, en images. */
export const SHOT_FRAMES: Record<ChaseShot, number> = { OUV: 24, P1: 28, P2: 28, P3: 28, P4: 28, P5: 28, P6: 40 };

/** Une fin : la vidéo (dérapage ou orbite), l'arrêt sur image sur sa dernière image, puis le flash. */
export interface EndingCut {
  shot: "FIN" | "FIN6";
  /** Images de vidéo du fichier de fin. */
  video: number;
  /** Arrêt sur image : la dernière image gelée, en deux tons. */
  freeze: number;
  /** Flash crème : il monte en `rise` images (la fiche se pose à son sommet), puis s'efface. */
  flash: number;
  /** Images de montée du flash (FIN : les quatre images de silence). */
  rise: number;
}

export const ENDINGS: Record<EndingId, EndingCut> = {
  fin: { shot: "FIN", video: 36, freeze: 14, flash: 10, rise: 4 },
  fin6: { shot: "FIN6", video: 56, freeze: 12, flash: 12, rise: 4 },
};

/** Total d'une fin, en images : 60 pour FIN, 80 pour FIN6. */
export const endingFrames = (e: EndingId): number => ENDINGS[e].video + ENDINGS[e].freeze + ENDINGS[e].flash;

/** Première image de chaque plan dans le fichier `poursuite`. */
export const SHOT_START: Record<ChaseShot, number> = (() => {
  const out = {} as Record<ChaseShot, number>;
  let f = 0;
  for (const s of CHASE_SHOTS) {
    out[s] = f;
    f += SHOT_FRAMES[s];
  }
  return out;
})();

/** Le fichier `poursuite` entier (toujours les six étoiles) : 204 images. */
export const CHASE_FRAMES = CHASE_SHOTS.reduce((n, s) => n + SHOT_FRAMES[s], 0);

/** Les bandes d'encre se ferment en tant d'images, à l'ouverture. */
export const BANDS_CLOSE = 8;
/** Une étoile qui s'allume passe de 1,5 à 1 en tant d'images. */
export const STAR_POP = 5;
/** Le titre de l'arrêt sur image claque en tant d'images, de cette échelle à 1 (il reste dans l'écran). */
export const TITLE_POP = 4;
export const TITLE_FROM = 1.2;
/** La secousse de l'image à chaque étoile : 3 px, sur quatre images. */
export const SHAKE: readonly (readonly [number, number])[] = [
  [3, -1],
  [-3, 1],
  [2, 1],
  [-1, 0],
];
/**
 * Les deux images d'encre qui couvrent la bascule de la poursuite à la fin :
 * la dernière image du dernier plan joué et la première de la fin. L'encre
 * part de la dernière image de la poursuite : la balise en a toujours une
 * d'avance, et le plan suivant ne doit jamais paraître.
 */
export const CUT_INK = 2;
/** Le grain bouge douze fois par seconde : une nouvelle position toutes les deux images. */
export const GRAIN_STEP = 2;
/** Le carré de la radio alterne corail et lilas toutes les six images (deux fois par seconde chacun). */
export const SQUARE_STEP = 6;
/**
 * L'étoile suivante clignote deux fois pendant l'arrêt sur image et reste
 * éteinte : allumée sur ces intervalles d'images, comptés depuis le gel.
 */
export const FLICKER_ON: readonly (readonly [number, number])[] = [
  [1, 4],
  [7, 10],
];

/** Le plan joué à l'image `frame` du fichier `poursuite`. */
export function chaseShotAt(frame: number): ChaseShot {
  for (let i = CHASE_SHOTS.length - 1; i >= 0; i--) if (frame >= SHOT_START[CHASE_SHOTS[i]]) return CHASE_SHOTS[i];
  return "OUV";
}

/** Images → secondes. */
export const sec = (frames: number): number => frames / FPS;
