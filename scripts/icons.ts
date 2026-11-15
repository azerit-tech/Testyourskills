// Les icônes du site, dessinées depuis la gemme d'Azerit (web/src/components/Brand.tsx)
// sur l'encre, par le moteur d'images du serveur (resvg) : l'onglet (favicon.svg et
// favicon.ico), l'écran d'accueil du téléphone (apple-touch-icon.png) et le
// manifeste (icon-192.png, icon-512.png, et icon-maskable-512.png que le système découpe).
// Rien n'est téléchargé.
//
//   npx tsx scripts/icons.ts
//
// Les fichiers vont dans web/public/ ; on les versionne, ce script les refait.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const OUT = join(import.meta.dirname, "..", "web", "public");
const INK = "#0c0d1b";
/** Les deux facettes de la gemme, dans son repère 104 × 120. */
const GEM = `<path d="M52 8 L14 50 L37 102 Z" fill="#c9d67c" stroke="#c9d67c" stroke-width="9" stroke-linejoin="round"/><path d="M63 10 L92 42 L85 80 L47 112 Z" fill="#6fb2a8" stroke="#6fb2a8" stroke-width="9" stroke-linejoin="round"/>`;

/**
 * La gemme centrée sur un carré d'encre de `size` px. `fill` : la part de la
 * hauteur qu'elle occupe (0,56 laisse la zone sûre des icônes masquables) ;
 * `radius` : l'arrondi du fond (0 pour un fond plein, que le système arrondit).
 */
export function iconSvg(size: number, fill: number, radius = 0): string {
  const h = size * fill;
  const k = h / 120;
  const w = 104 * k;
  const x = (size - w) / 2;
  const y = (size - h) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${INK}"/><g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${k.toFixed(4)})">${GEM}</g></svg>`;
}

function png(svg: string): Buffer {
  return new Resvg(svg).render().asPng();
}

/** Un .ico qui contient des PNG (accepté par tous les navigateurs depuis longtemps). */
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries: Buffer[] = [];
  let offset = 6 + 16 * images.length;
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const tab = (size: number) => iconSvg(size, 0.78, size * 0.22);
writeFileSync(join(OUT, "favicon.svg"), tab(64) + "\n");
writeFileSync(join(OUT, "favicon.ico"), ico([16, 32, 48].map((size) => ({ size, data: png(tab(size)) }))));
writeFileSync(join(OUT, "apple-touch-icon.png"), png(iconSvg(180, 0.6)));
// « any » : la gemme en grand ; « maskable » : dans la zone sûre, le système arrondit ou découpe le fond.
writeFileSync(join(OUT, "icon-192.png"), png(iconSvg(192, 0.72)));
writeFileSync(join(OUT, "icon-512.png"), png(iconSvg(512, 0.72)));
writeFileSync(join(OUT, "icon-maskable-512.png"), png(iconSvg(512, 0.56)));
console.log("Icônes écrites dans", OUT);
