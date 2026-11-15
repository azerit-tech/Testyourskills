// Le visage d'une ligne de tableau (top, bande, prime) : l'avatar public d'un
// pseudo GitHub, en petit. Sans image, l'initiale, jamais l'icône d'image cassée.
// Le dessin est dans styles.css (.board-avatar).
import { useState } from "react";

/** L'adresse de l'avatar public d'un pseudo, à la taille d'une ligne (32 px, doublée pour les écrans denses). */
export function avatarUrl(login: string): string {
  return `https://github.com/${encodeURIComponent(login)}.png?size=64`;
}

export function Avatar({ login }: { login: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="board-avatar">
      {broken ? login.slice(0, 1).toUpperCase() : <img src={avatarUrl(login)} alt="" width={32} height={32} loading="lazy" onError={() => setBroken(true)} />}
    </span>
  );
}
