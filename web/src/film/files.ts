// Les fichiers du film (docs/cinematique-poursuite.md §4.1), importés par Vite :
// au build, chacun reçoit une empreinte de son contenu dans son nom
// (/assets/poursuite-720-XXXXXXXX.mp4), servie avec un cache long immuable
// (server/src/app.ts, /assets/*). Un film remplacé change donc d'adresse : un
// téléphone ne peut plus jouer une poursuite neuve avec une fin ancienne.
// Le montage (scripts/film-assemble.ts) écrit dans ./media/.
//
// VITE_FILM_BASE (au build, vide par défaut) : un autre hôte pour le film, par
// exemple « https://media.example.net/film/ ». On y copie les mp4 de
// dist/web/assets/ sous leur nom à empreinte ; l'hôte doit répondre en CORS.
import type { EndingId } from "../../../shared/film";
import { filmAssetUrl, type Quality } from "./net";
import poursuite720 from "./media/poursuite-720.mp4";
import fin720 from "./media/fin-720.mp4";
import fin6720 from "./media/fin6-720.mp4";
import poursuite540 from "./media/poursuite-540.mp4";
import fin540 from "./media/fin-540.mp4";
import fin6540 from "./media/fin6-540.mp4";

export type { Quality } from "./net";
export type FileId = "poursuite" | EndingId;

const FILES: Record<Quality, Record<FileId, string>> = {
  "720": { poursuite: poursuite720, fin: fin720, fin6: fin6720 },
  "540": { poursuite: poursuite540, fin: fin540, fin6: fin6540 },
};

const BASE: string = (import.meta.env.VITE_FILM_BASE as string | undefined) ?? "";

/** L'adresse d'un fichier du film, à empreinte, sur l'hôte du site ou sur VITE_FILM_BASE. */
export function filmFileUrl(id: FileId, q: Quality): string {
  return filmAssetUrl(BASE, FILES[q][id]);
}
