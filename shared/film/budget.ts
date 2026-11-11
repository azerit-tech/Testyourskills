// Les plafonds de poids du film (docs/cinematique-poursuite.md §4.1, §5.6), la
// seule source : le montage (scripts/film-lib.ts) les tient, le lecteur
// (web/src/film/loader.ts) s'en sert pour estimer ce qui reste à charger tant
// qu'un fichier n'a pas donné sa taille. 1 Mo = 10^6 octets, lecture stricte.
import type { EndingId } from "./cut";

export type FilmFileId = "poursuite" | EndingId;
/** « 720 » : la variante haute, 720 × 1280 ; « 540 » : l'éco, 540 × 960. */
export type FilmVariant = "720" | "540";

const MB = 1_000_000;

/** Le plafond de chaque fichier, par variante. */
export const FILE_CEILINGS: Record<FilmVariant, Record<FilmFileId, number>> = {
  "720": { poursuite: 2.8 * MB, fin: 0.6 * MB, fin6: 1.0 * MB },
  // le total éco réparti au prorata des plafonds de la haute
  "540": { poursuite: Math.floor((2.8 * 1.8 * MB) / 4.4), fin: Math.floor((0.6 * 1.8 * MB) / 4.4), fin6: Math.floor((1.0 * 1.8 * MB) / 4.4) },
};

/** Le plafond de tous les fichiers d'une variante. */
export const VARIANT_CEILINGS: Record<FilmVariant, number> = { "720": 4 * MB, "540": 1.8 * MB };
