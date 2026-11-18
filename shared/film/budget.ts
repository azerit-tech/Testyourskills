// Les plafonds de poids du film (docs/cinematique-poursuite.md §4.1, §5.6), la
// seule source : le montage (scripts/film-lib.ts) les tient, le lecteur
// (web/src/film/loader.ts) s'en sert pour estimer ce qui reste à charger tant
// qu'un fichier n'a pas donné sa taille. 1 Mo = 10^6 octets, lecture stricte.
// Depuis le trajet roulé d'un seul tenant (§18.56), un seul fichier : la
// poursuite et FIN6, 720 images. Toute personne le charge en entier, pendant
// l'attente, avant de connaître son niveau.
import { FILM_FRAMES } from "./cut";

export type FilmFileId = "poursuite";
/** « 720 » : la variante haute, 720 × 1280 ; « 540 » : l'éco, 540 × 960. */
export type FilmVariant = "720" | "540";

const MB = 1_000_000;

/**
 * Le poids par image du film en haute : 4,5 Mo pour les 340 images du premier
 * découpage. Le plafond suit le découpage de cut.ts à ce même poids par image :
 * 9,53 Mo pour les 720 images du trajet roulé.
 */
const BYTES_PER_FRAME = (4.5 * MB) / 340;

/** Haute : le fichier entier, au poids par image. */
const HIGH: Record<FilmFileId, number> = { poursuite: Math.round(BYTES_PER_FRAME * FILM_FRAMES) };

/** L'éco garde le rapport fixé au premier découpage : 2,2 Mo pour une personne quand la haute en pesait 5,9. */
const ECO_RATIO = 2.2 / 5.9;

/** Le plafond d'une personne, par variante : le fichier entier (9,53 Mo en haute, 3,55 Mo en éco). */
export const PERSON_CEILINGS: Record<FilmVariant, number> = {
  "720": HIGH.poursuite,
  "540": Math.floor(HIGH.poursuite * ECO_RATIO),
};

/** Le plafond de chaque fichier, par variante. */
export const FILE_CEILINGS: Record<FilmVariant, Record<FilmFileId, number>> = {
  "720": HIGH,
  "540": { poursuite: PERSON_CEILINGS["540"] },
};

/** Ce qu'une personne charge au plus : le fichier entier. */
export const personBytes = (sizes: Record<FilmFileId, number>): number => sizes.poursuite;
