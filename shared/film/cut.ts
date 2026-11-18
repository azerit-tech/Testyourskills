// Le découpage du film de la poursuite (§18.36, §18.55, §18.56) : 24 images par
// seconde, toutes les durées en images, l'ordre des tronçons. Un seul trajet
// roulé, d'un seul tenant : l'avenue, le rond-point, la rue, le pont, le port,
// la jetée, puis FIN6 sur la pointe, dans un seul fichier (`poursuite`, 720
// images). Les tronçons ne sont plus des coupes : la berline et la caméra ont le
// même état des deux côtés.
//
// La seule source des durées est le parcours du film (tools/film3d/parcours.py),
// exporté dans ./parcours.json (`python3 tools/film3d/parcours.py --export`) :
// le rendu (render_film.py) et le site lisent le même fichier, un rendu ne peut
// plus partir avec des durées que le site ignore. Le lecteur, le HUD, la
// bande-son, les tests et le montage (scripts/film-assemble.ts) lisent ce
// fichier-ci. Pur, sans DOM.
import PARCOURS from "./parcours.json";

export const FPS = 24;

/** Les tronçons de la poursuite, dans l'ordre du fichier : l'ouverture, puis un tronçon par étoile. */
export const CHASE_SHOTS = ["OUV", "P1", "P2", "P3", "P4", "P5", "P6"] as const;
export type ChaseShot = (typeof CHASE_SHOTS)[number];
/** Tout le fichier `poursuite` : la poursuite, puis FIN6 (la fin à six étoiles, sur la pointe), sans coupe. */
export const FILM_SHOTS = [...CHASE_SHOTS, "FIN6"] as const;
export type ShotId = (typeof FILM_SHOTS)[number];

/** Les nombres du parcours, vérifiés à la lecture : un export qui ne colle plus au site casse tout de suite. */
function readParcours() {
  const p = PARCOURS as unknown as { fps: number; troncons: [string, number][]; etoiles: number[]; arret: number };
  const names = p.troncons.map(([n]) => n);
  if (p.fps !== FPS) throw new Error(`parcours.json : ${p.fps} i/s, le site en joue ${FPS}`);
  if (names.join() !== FILM_SHOTS.join()) throw new Error(`parcours.json : tronçons ${names.join(", ")}, le site attend ${FILM_SHOTS.join(", ")}`);
  if (p.etoiles.length !== 6) throw new Error(`parcours.json : ${p.etoiles.length} étoiles au lieu de six`);
  const frames = Object.fromEntries(p.troncons) as Record<ShotId, number>;
  return { frames, stars: p.etoiles, stop: p.arret };
}
const PC = readParcours();

/** Durée de chaque tronçon du fichier, en images (parcours.json). */
export const SHOT_FRAMES: Readonly<Record<ShotId, number>> = PC.frames;

/** Première image de chaque tronçon dans le fichier `poursuite`. */
export const SHOT_START: Readonly<Record<ShotId, number>> = (() => {
  const out = {} as Record<ShotId, number>;
  let f = 0;
  for (const s of FILM_SHOTS) {
    out[s] = f;
    f += SHOT_FRAMES[s];
  }
  return out;
})();

/** La poursuite, jusqu'à l'entrée de la pointe (la première image de FIN6) : 619 images. */
export const CHASE_FRAMES = SHOT_START.FIN6;
/** Le fichier `poursuite` entier, FIN6 comprise : 720 images, 30 s. */
export const FILM_FRAMES = CHASE_FRAMES + SHOT_FRAMES.FIN6;

/**
 * Les six étoiles, des instants du trajet (images du fichier, parcours.ETOILES) :
 * l'avenue lancée, le rond-point au plus fort du dérapage, le barrage, la crête
 * du pont, le port au plus fort du dérapage, la jetée. L'étoile k tombe dans le
 * tronçon Pk.
 */
export const STAR_FRAMES: readonly number[] = PC.stars;
for (const [i, f] of STAR_FRAMES.entries()) {
  const shot = CHASE_SHOTS[i + 1];
  if (f < SHOT_START[shot] || f >= SHOT_START[shot] + SHOT_FRAMES[shot]) throw new Error(`parcours.json : l'étoile ${i + 1} (image ${f}) hors de ${shot}`);
}

/** L'image (fractionnaire) où la berline s'arrête sur la pointe, dans FIN6. */
export const STOP_FRAME = PC.stop;

/**
 * La fin de la vidéo jouée à `level` étoiles (exclue) : la fin du tronçon de la
 * dernière étoile, Pk ; à six étoiles, la fin du fichier (FIN6 comprise). La
 * dernière image jouée (`playEnd - 1`) est celle qui gèle, sur place.
 */
export const playEnd = (level: number): number => (level >= 6 ? FILM_FRAMES : SHOT_START[CHASE_SHOTS[level + 1]]);

/** Le gel puis le flash : `freeze` images d'arrêt sur image, puis le flash crème qui monte en `rise` images et dure `flash`. */
export interface Hold {
  freeze: number;
  flash: number;
  rise: number;
}
/**
 * De une à cinq étoiles, la fin sur place (§18.53) : l'arrêt sur image gèle la
 * dernière image du dernier tronçon joué, 36 images (1,5 s), puis 10 de flash.
 * C'est le seul moment immobile du film : la ligne de l'étoile refusée s'y lit
 * (« 3ᵉ étoile : à 7 points »).
 */
export const IN_PLACE: Hold = { freeze: 36, flash: 10, rise: 4 };
/** À six étoiles, la dernière image de FIN6 (la berline arrêtée, l'orbite finie) : 12 images de gel, 12 de flash. */
export const FINALE: Hold = { freeze: 12, flash: 12, rise: 4 };
export const holdOf = (level: number): Hold => (level >= 6 ? FINALE : IN_PLACE);

/** Les bandes d'encre se ferment en tant d'images, à l'ouverture. */
export const BANDS_CLOSE = 8;
/** Une étoile qui se pose dans la rangée passe de 1,5 à 1 en tant d'images. */
export const STAR_POP = 5;
/**
 * L'étoile tombe en grand sur le ciel, au-dessus de la berline : elle claque de
 * STAMP_FROM à 1 en STAMP_SLAP images, tient jusqu'à STAMP_HOLD images après le
 * coup, puis vole vers sa place dans la rangée, où elle se pose STAR_LAND
 * images après le coup. Ni éclair ni secousse (§18.53).
 */
export const STAR_LAND = 19;
export const STAMP_SLAP = 3;
export const STAMP_FROM = 2.1;
export const STAMP_HOLD = 11;
/**
 * La jauge : l'étoile suivante se remplit de bas en haut, en demi-teinte, jusqu'à
 * l'instant où elle tombe. La première commence à l'image GAUGE_OPEN, les autres
 * GAUGE_AFTER images après l'étoile d'avant. Lente au début, elle finit vite
 * (puissance GAUGE_EASE) : elle n'est pleine qu'à l'image de l'étoile.
 */
export const GAUGE_OPEN = 6;
export const GAUGE_AFTER = 4;
export const GAUGE_EASE = 1.5;

/**
 * Le score qui monte (SPEC §18.78) : de 0 à la note de la fiche, par paliers
 * calés sur les étoiles. Au coup de l'étoile k, le chiffre monte en SCORE_RISE
 * images (montée rapide, adoucie) jusqu'au seuil de cette étoile
 * (STAR_THRESHOLDS ; 0 pour la première), puis tient. Le dernier palier va du
 * seuil du niveau à la note exacte, en SCORE_FINAL images au plus, et s'arrête
 * pile à l'image du gel.
 */
export const SCORE_RISE = 12;
export const SCORE_FINAL = 18;
/**
 * L'étoile refusée (une à cinq étoiles) : sa jauge monte jusqu'à la part vraie
 * de la note entre deux seuils, bornée pour se lire (ni vide, ni presque pleine),
 * se fige avec l'image, puis se vide entre ces deux images comptées depuis la
 * fin du dernier tronçon joué.
 */
export const DENIED_MIN = 0.1;
export const DENIED_MAX = 0.92;
export const DENIED_DRAIN: readonly [number, number] = [14, 24];
/** La ligne de l'étoile refusée paraît tant d'images après le gel (le titre a claqué), en VERDICT_IN images. */
export const VERDICT_AT = 6;
export const VERDICT_IN = 3;
/**
 * La ligne sous la berline (une étiquette, une ligne) : elle arrive LINE_LEAD
 * images avant son étoile (1,75 s : on lit quand la route est calme), reste
 * LINE_TAIL images après (1,25 s) et s'efface au gel. Elle entre en LINE_IN
 * images, sort en LINE_OUT ; au coup de l'étoile, son étiquette s'inverse
 * pendant LINE_HIT images. Trois secondes par ligne, jamais deux à la fois.
 */
export const LINE_LEAD = 42;
export const LINE_TAIL = 30;
export const LINE_IN = 5;
export const LINE_OUT = 3;
export const LINE_HIT = 9;
/**
 * Le budget de texte du film : une étiquette de 22 signes au plus, une ligne
 * de 32 signes au plus (elle se lit en trois secondes), une ligne de gel de 26
 * signes au plus. Au-delà, l'écran réduit le corps ; il ne coupe qu'en dernier
 * recours.
 */
export const LINE_LABEL_MAX = 22;
export const LINE_TEXT_MAX = 32;
export const VERDICT_MAX = 26;
/** Le titre de l'arrêt sur image claque en tant d'images, de cette échelle à 1 (il reste dans l'écran). */
export const TITLE_POP = 4;
export const TITLE_FROM = 1.2;
/** Le grain bouge douze fois par seconde : une nouvelle position toutes les deux images. */
export const GRAIN_STEP = 2;
/**
 * L'interception, de une à cinq étoiles (§18.39) : tant d'images avant la fin
 * du dernier tronçon joué, la radio grésille (le son seul : plus de ligne à
 * l'écran, la jauge de l'étoile suivante dit la même chose).
 */
export const INTERCEPT_LEAD = 12;
/**
 * L'étoile refusée clignote deux fois au gel, puis se vide : son contour est
 * vif sur ces intervalles d'images, comptés depuis la fin du dernier tronçon
 * joué (l'arrêt sur image a claqué, son coup est passé).
 */
export const FLICKER_ON: readonly (readonly [number, number])[] = [
  [3, 6],
  [9, 12],
];

/** Le tronçon à l'image `frame` du fichier `poursuite` (FIN6 comprise). */
export function shotAt(frame: number): ShotId {
  for (let i = FILM_SHOTS.length - 1; i >= 0; i--) if (frame >= SHOT_START[FILM_SHOTS[i]]) return FILM_SHOTS[i];
  return "OUV";
}

/** Images → secondes. */
export const sec = (frames: number): number => frames / FPS;
