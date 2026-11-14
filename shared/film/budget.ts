// Les plafonds de poids du film (docs/cinematique-poursuite.md §4.1, §5.6), la
// seule source : le montage (scripts/film-lib.ts) les tient, le lecteur
// (web/src/film/loader.ts) s'en sert pour estimer ce qui reste à charger tant
// qu'un fichier n'a pas donné sa taille. 1 Mo = 10^6 octets, lecture stricte.
// Une personne charge la poursuite et une seule fin : son total est la
// poursuite plus la plus lourde des deux fins.
import { CHASE_FRAMES, type EndingId } from "./cut";

export type FilmFileId = "poursuite" | EndingId;
/** « 720 » : la variante haute, 720 × 1280 ; « 540 » : l'éco, 540 × 960. */
export type FilmVariant = "720" | "540";

const MB = 1_000_000;

/**
 * Le poids par image de la poursuite en haute : 4,5 Mo pour les 340 images du
 * premier découpage. Le plafond suit le découpage de cut.ts à ce même poids par
 * image : 5,48 Mo pour les 414 images d'aujourd'hui.
 */
const CHASE_BYTES_PER_FRAME = (4.5 * MB) / 340;

/** Haute : la poursuite (5,48 Mo pour 414 images), la fin 0,9 Mo, la fin à six étoiles 1,4 Mo au plus. */
const HIGH: Record<FilmFileId, number> = { poursuite: Math.round(CHASE_BYTES_PER_FRAME * CHASE_FRAMES), fin: 0.9 * MB, fin6: 1.4 * MB };

/** L'éco garde le rapport fixé au premier découpage : 2,2 Mo pour une personne quand la haute en pesait 5,9. */
const ECO_RATIO = 2.2 / 5.9;

/** Le plafond d'une personne, par variante : 6,88 Mo en haute (poursuite et fin à six étoiles), 2,57 Mo en éco. */
export const PERSON_CEILINGS: Record<FilmVariant, number> = {
  "720": HIGH.poursuite + HIGH.fin6,
  "540": Math.floor((HIGH.poursuite + HIGH.fin6) * ECO_RATIO),
};

/** L'éco répartit son total au prorata de la haute : poursuite et fin à six étoiles tiennent pile son total. */
const eco = (n: number) => Math.floor((n * PERSON_CEILINGS["540"]) / PERSON_CEILINGS["720"]);

/** Le plafond de chaque fichier, par variante. */
export const FILE_CEILINGS: Record<FilmVariant, Record<FilmFileId, number>> = {
  "720": HIGH,
  "540": { poursuite: eco(HIGH.poursuite), fin: eco(HIGH.fin), fin6: eco(HIGH.fin6) },
};

/** Ce qu'une personne charge : la poursuite et la plus lourde des deux fins. */
export const personBytes = (sizes: Record<FilmFileId, number>): number => sizes.poursuite + Math.max(sizes.fin, sizes.fin6);
