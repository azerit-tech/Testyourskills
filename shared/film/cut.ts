// Le découpage du film de la poursuite (§18.36, docs/cinematique-decoupage-v3.md
// §7) : 24 images par seconde, toutes les durées en images, l'ordre des plans.
// La seule source des durées : le lecteur, le HUD, les tests et le montage
// (scripts/film-assemble.ts) lisent ce fichier. Pur, sans DOM.

export const FPS = 24;

/** Les plans de la poursuite, dans l'ordre du fichier `poursuite` : l'ouverture, puis un plan par étoile. */
export const CHASE_SHOTS = ["OUV", "P1", "P2", "P3", "P4", "P5", "P6"] as const;
export type ChaseShot = (typeof CHASE_SHOTS)[number];
/**
 * La seule fin tournée : `fin6` (six étoiles, l'orbite sur la pointe). De une
 * à cinq étoiles, la fin se joue sur place, sans fichier (IN_PLACE) ; l'ancienne
 * fin à la pointe (FIN) a quitté le film le 17 novembre 2026 (§18.53).
 */
export type EndingId = "fin6";
export type ShotId = ChaseShot | "FIN6";

/** Durée de chaque plan de la poursuite, en images. */
export const SHOT_FRAMES: Record<ChaseShot, number> = { OUV: 40, P1: 48, P2: 110, P3: 48, P4: 48, P5: 60, P6: 60 };

/** Une fin : la vidéo (dérapage ou orbite), l'arrêt sur image sur sa dernière image, puis le flash. */
export interface EndingCut {
  shot: "FIN6";
  /** Images de vidéo du fichier de fin. */
  video: number;
  /** Arrêt sur image : la dernière image gelée, en deux tons. */
  freeze: number;
  /** Flash crème : il monte en `rise` images (la fiche se pose à son sommet), puis s'efface. */
  flash: number;
  /** Images de montée du flash. */
  rise: number;
}

export const ENDINGS: Record<EndingId, EndingCut> = {
  fin6: { shot: "FIN6", video: 80, freeze: 12, flash: 12, rise: 4 },
};

/** Total d'une fin, en images : 104 pour FIN6. */
export const endingFrames = (e: EndingId): number => ENDINGS[e].video + ENDINGS[e].freeze + ENDINGS[e].flash;

/**
 * La fin sur place, de une à cinq étoiles (17 novembre 2026) : pas de vidéo de
 * fin, l'arrêt sur image se fait sur la dernière image du dernier plan joué,
 * là où est la berline. Mêmes gel et flash que l'ancienne fin à la pointe
 * (FIN : 52 images de vidéo, 14 de gel, 10 de flash).
 */
export const IN_PLACE = { freeze: 14, flash: 10, rise: 4 } as const;

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

/** Le fichier `poursuite` entier (toujours les six étoiles) : 414 images. */
export const CHASE_FRAMES = CHASE_SHOTS.reduce((n, s) => n + SHOT_FRAMES[s], 0);

/** Les bandes d'encre se ferment en tant d'images, à l'ouverture. */
export const BANDS_CLOSE = 8;
/** Une étoile qui s'allume passe de 1,5 à 1 en tant d'images. */
export const STAR_POP = 5;
/** Le titre de l'arrêt sur image claque en tant d'images, de cette échelle à 1 (il reste dans l'écran). */
export const TITLE_POP = 4;
export const TITLE_FROM = 1.2;
/**
 * Les deux images qui couvrent la bascule de la poursuite à la fin, à six
 * étoiles seulement (de une à cinq, il n'y a plus de coupe : la fin se joue sur
 * place) : la dernière image de P6 et la première de FIN6. Elles partent de la
 * dernière image de la poursuite : la balise en a toujours une d'avance.
 * Couvertes d'abord d'encre, elles sont un éclair crème depuis le 14 novembre
 * (§18.39) : deux images sombres dans un film de nuit se lisaient comme une
 * image perdue (le champ `ink` du HUD garde son nom).
 */
export const CUT_INK = 2;
/** Le grain bouge douze fois par seconde : une nouvelle position toutes les deux images. */
export const GRAIN_STEP = 2;
/** Le carré de la radio alterne corail et lilas toutes les six images (deux fois par seconde chacun). */
export const SQUARE_STEP = 6;
/**
 * L'interception, de une à cinq étoiles (§18.39) : tant d'images avant la fin
 * du dernier plan joué, la radio annonce l'interception et l'étoile suivante
 * clignote ; elle s'éteint avant l'arrêt sur image, posé sur place.
 */
export const INTERCEPT_LEAD = 12;
/**
 * L'étoile suivante clignote deux fois et reste éteinte : allumée sur ces
 * intervalles d'images, comptés depuis la fin du dernier plan joué (négatifs :
 * avant elle).
 */
export const FLICKER_ON: readonly (readonly [number, number])[] = [
  [-12, -9],
  [-6, -3],
];

/** Le plan joué à l'image `frame` du fichier `poursuite`. */
export function chaseShotAt(frame: number): ChaseShot {
  for (let i = CHASE_SHOTS.length - 1; i >= 0; i--) if (frame >= SHOT_START[CHASE_SHOTS[i]]) return CHASE_SHOTS[i];
  return "OUV";
}

/** Images → secondes. */
export const sec = (frames: number): number => frames / FPS;
