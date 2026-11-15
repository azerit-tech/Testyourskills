// La photo d'une personne, côté navigateur : faut-il la montrer ? Une image qui
// ne charge pas, ou l'avatar que GitHub génère par défaut (damier de pixels,
// silhouette grise d'un compte sans photo), cède la place à la silhouette à
// initiales (shared/card/mug.tsx) : jamais l'image agrandie, jamais l'icône
// d'image cassée.
//
// Reconnaître l'avatar par défaut, sans rien lire des pixels : GitHub ramène une
// photo envoyée à la taille demandée (`?s=280` rend 280 × 280, ou moins si
// l'original est plus petit) ; ses avatars générés, eux, sortent toujours en
// 420 × 420, quelle que soit la taille demandée (relevé le 15 novembre 2026).
// Donc : taille demandée sous 420, image reçue en 420 × 420 → avatar par défaut.
// Sans taille demandée dans l'adresse, on ne conclut rien : le doute garde la photo.
// Le serveur fait déjà ce tri à la collecte (server/src/github/avatar.ts) ; ici,
// c'est pour ce que le navigateur charge seul : l'attente, la couverture, une
// fiche d'avant le tri.
import { useEffect, useState } from "react";

/** Le côté des avatars que GitHub génère. */
export const DEFAULT_AVATAR_SIDE = 420;

/** La taille demandée par une adresse d'avatar GitHub (`s` ou `size`) ; null ailleurs. */
export function askedSize(url: string): number | null {
  try {
    const u = new URL(url, "https://local.invalid");
    const raw = u.hostname === "avatars.githubusercontent.com" ? u.searchParams.get("s") : u.hostname === "github.com" && u.pathname.endsWith(".png") ? u.searchParams.get("size") : null;
    const n = raw ? Number(raw) : NaN;
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** true seulement si l'image reçue est sûrement un avatar généré par GitHub. */
export function isDefaultAvatar(url: string, width: number, height: number): boolean {
  const asked = askedSize(url);
  return asked !== null && asked < DEFAULT_AVATAR_SIDE && width === DEFAULT_AVATAR_SIDE && height === DEFAULT_AVATAR_SIDE;
}

/** « loading » : pas encore su ; « photo » : à montrer ; « none » : absente, en échec ou générée. */
export type AvatarState = "loading" | "photo" | "none";

/** Ce qu'une image chargée (ou non) dit de la photo. */
export function avatarVerdict(url: string, img: { naturalWidth: number; naturalHeight: number } | null): Exclude<AvatarState, "loading"> {
  if (!img || img.naturalWidth <= 0) return "none";
  return isDefaultAvatar(url, img.naturalWidth, img.naturalHeight) ? "none" : "photo";
}

/** Charge la photo à part et dit quoi en faire. Sans adresse : « none » d'emblée. */
export function useAvatar(url: string | null | undefined): AvatarState {
  const [seen, setSeen] = useState<{ url: string; state: Exclude<AvatarState, "loading"> } | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const img = new Image();
    img.onload = () => alive && setSeen({ url, state: avatarVerdict(url, img) });
    img.onerror = () => alive && setSeen({ url, state: "none" });
    img.src = url;
    return () => {
      alive = false;
    };
  }, [url]);
  if (!url) return "none";
  return seen?.url === url ? seen.state : "loading";
}
