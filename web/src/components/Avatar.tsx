// Le visage d'une ligne de tableau (top de la semaine, bande, prime), en petit : la
// photo de la fiche, ou l'avatar public d'un pseudo GitHub. Sans photo, les initiales
// de la fiche (l'initiale du pseudo si on n'a que lui) : jamais l'icône d'image cassée,
// jamais le damier que GitHub génère pour un compte sans photo (card/avatar.ts).
// La photo ne paraît qu'une fois sûre ; d'ici là, les initiales tiennent la place.
// Le dessin est dans styles.css (.board-avatar).
import { useAvatar } from "../card/avatar";

/** L'adresse de l'avatar public d'un pseudo, à la taille d'une ligne (32 px, doublée pour les écrans denses). */
export function avatarUrl(login: string): string {
  return `https://github.com/${encodeURIComponent(login)}.png?size=64`;
}

/**
 * `src` : la photo déjà connue de la fiche (vide : pas de photo) ; sans `src`, l'avatar public du pseudo.
 * `initials` : celles de la fiche, pour une personne sans photo (§18.88).
 */
export function Avatar({ login, src, initials }: { login?: string; src?: string; initials?: string }) {
  const url = src === undefined ? (login ? avatarUrl(login) : null) : src || null;
  const state = useAvatar(url);
  const letters = (initials || (login ?? "").slice(0, 1)).toUpperCase();
  return <span className="board-avatar">{state === "photo" && url ? <img src={url} alt="" width={32} height={32} /> : letters}</span>;
}
