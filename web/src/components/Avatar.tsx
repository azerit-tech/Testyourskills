// Le visage d'une ligne de tableau (top de la semaine, bande, prime) : l'avatar public
// d'un pseudo GitHub, en petit. Sans photo, l'initiale : jamais l'icône d'image cassée,
// jamais le damier que GitHub génère pour un compte sans photo (card/avatar.ts).
// La photo ne paraît qu'une fois sûre ; d'ici là, l'initiale tient la place.
// Le dessin est dans styles.css (.board-avatar).
import { useAvatar } from "../card/avatar";

/** L'adresse de l'avatar public d'un pseudo, à la taille d'une ligne (32 px, doublée pour les écrans denses). */
export function avatarUrl(login: string): string {
  return `https://github.com/${encodeURIComponent(login)}.png?size=64`;
}

/** `src` : la photo déjà connue de la fiche (vide : pas de photo) ; sans `src`, l'avatar public du pseudo. */
export function Avatar({ login, src }: { login: string; src?: string }) {
  const url = src === undefined ? avatarUrl(login) : src || null;
  const state = useAvatar(url);
  return <span className="board-avatar">{state === "photo" && url ? <img src={url} alt="" width={32} height={32} /> : login.slice(0, 1).toUpperCase()}</span>;
}
