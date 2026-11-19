// « Même photo ? » (SPEC §18.80). Après « Se connecter avec LinkedIn », LinkedIn
// rend la photo de la personne mais jamais l'adresse de son profil : la photo
// sert à reconnaître le bon profil parmi les homonymes. Deux photos sont les
// mêmes si LinkedIn leur donne le même identifiant d'image, sinon si leurs
// empreintes perceptuelles concordent : la même image servie en 100 px et en
// 400 px donne presque les mêmes bits, deux visages différents non.
//
// L'empreinte : l'image ramenée à 9 × 9 cases de gris (décodée par resvg, déjà
// là pour les images de partage : aucune dépendance de plus), puis un bit par
// paire de cases voisines, en ligne et en colonne (dHash, 144 bits).

import { renderAsync } from "@resvg/resvg-js";

const CELLS = 9;
const CELL_PX = 8;
const SIDE = CELLS * CELL_PX;
export const HASH_BITS = 2 * CELLS * (CELLS - 1);
/** Bits différents tolérés entre deux tailles de la même photo (10 %) ; deux photos différentes en ont autour de la moitié. */
export const SAME_PHOTO_MAX_BITS = Math.floor(HASH_BITS * 0.1);

const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png" };

/** Empreinte d'une image JPEG ou PNG : 144 bits, ou null si elle ne se décode pas (WebP, fichier abîmé). */
export async function photoHash(bytes: Uint8Array, ext: string): Promise<Uint8Array | null> {
  const mime = MIME[ext];
  if (!mime || !bytes.length) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SIDE}" height="${SIDE}" viewBox="0 0 ${SIDE} ${SIDE}"><image xlink:href="data:${mime};base64,${Buffer.from(bytes).toString("base64")}" width="${SIDE}" height="${SIDE}" preserveAspectRatio="none"/></svg>`;
  let pixels: Uint8Array;
  try {
    const out = await renderAsync(svg, { fitTo: { mode: "original" }, background: "#808080", imageRendering: 0, font: { loadSystemFonts: false } });
    if (out.width !== SIDE || out.height !== SIDE) return null;
    pixels = out.pixels;
  } catch {
    return null;
  }
  // La moyenne de chaque case de 8 × 8 pixels : le grain et la compression s'y perdent.
  const grey = new Float64Array(CELLS * CELLS);
  for (let y = 0; y < SIDE; y++) {
    for (let x = 0; x < SIDE; x++) {
      const i = (y * SIDE + x) * 4;
      grey[Math.floor(y / CELL_PX) * CELLS + Math.floor(x / CELL_PX)]! += 0.299 * pixels[i]! + 0.587 * pixels[i + 1]! + 0.114 * pixels[i + 2]!;
    }
  }
  // Une image unie (rien de décodé : le fond gris) n'a pas d'empreinte.
  if (Math.max(...grey) - Math.min(...grey) < CELL_PX * CELL_PX * 4) return null;
  const bits = new Uint8Array(HASH_BITS);
  let n = 0;
  for (let y = 0; y < CELLS; y++) for (let x = 0; x < CELLS - 1; x++) bits[n++] = grey[y * CELLS + x]! > grey[y * CELLS + x + 1]! ? 1 : 0;
  for (let y = 0; y < CELLS - 1; y++) for (let x = 0; x < CELLS; x++) bits[n++] = grey[y * CELLS + x]! > grey[(y + 1) * CELLS + x]! ? 1 : 0;
  return bits;
}

/** Bits qui diffèrent entre deux empreintes. */
export function hashDistance(a: Uint8Array, b: Uint8Array): number {
  let d = Math.abs(a.length - b.length);
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) d++;
  return d;
}

export function samePhotoHash(a: Uint8Array | null, b: Uint8Array | null): boolean {
  return !!a && !!b && hashDistance(a, b) <= SAME_PHOTO_MAX_BITS;
}

/**
 * L'identifiant qu'une adresse de photo LinkedIn porte, le même à toutes les
 * tailles : `https://media.licdn.com/dms/image/v2/<id>/profile-displayphoto-shrink_100_100/…`.
 * null pour toute autre adresse.
 */
export function licdnImageId(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/(^|\.)licdn\.com$/i.test(u.hostname)) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const at = parts.indexOf("image");
    const id = at < 0 ? undefined : /^v\d+$/.test(parts[at + 1] ?? "") ? parts[at + 2] : parts[at + 1];
    return id && /^[A-Za-z0-9_-]{12,}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
