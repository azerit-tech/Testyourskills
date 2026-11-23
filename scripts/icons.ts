// Le logo d'Azerit sur le site, tiré d'un seul fichier : web/public/logo.png, la
// mascotte (écran de pierre à l'écran turquoise), copie exacte de celle de la landing
// page et de l'app (LandingPage/public/logo.png, App/ui/public/logo.png), 228 × 256.
//
// Ce script en dérive, par le moteur d'images du serveur (resvg) :
//   - l'onglet (favicon.ico), l'écran d'accueil du téléphone (apple-touch-icon.png) et
//     le manifeste (icon-192.png, icon-512.png, et icon-maskable-512.png que le système
//     découpe), la mascotte sur l'encre ;
//   - shared/card/azeritLogo.ts : la mascotte réduite, en data URI, pour les dessins en
//     SVG (la fiche, ses images de partage) et les textures 3D, sans requête de plus.
// Rien n'est téléchargé.
//
//   npx tsx scripts/icons.ts
//
// Les fichiers sont versionnés ; ce script les refait.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "web", "public");
const INK = "#0c0d1b";
/** Proportions de la mascotte (logo.png, rognée au bord du dessin). */
const LOGO_W = 228;
const LOGO_H = 256;
const LOGO = `data:image/png;base64,${readFileSync(join(OUT, "logo.png")).toString("base64")}`;

/**
 * La mascotte centrée sur un carré de `size` px. `fill` : la part de la hauteur
 * qu'elle occupe (0,56 laisse la zone sûre des icônes masquables) ; `radius` :
 * l'arrondi du fond (0 pour un fond plein, que le système arrondit) ; `bg` : le
 * fond, aucun pour une image transparente.
 */
export function iconSvg(size: number, fill: number, radius = 0, bg: string | null = INK): string {
  const h = size * fill;
  const w = (h * LOGO_W) / LOGO_H;
  const x = (size - w) / 2;
  const y = (size - h) / 2;
  const rect = bg ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${rect}<image x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" href="${LOGO}"/></svg>`;
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

// L'onglet : la mascotte presque pleine sur un fond transparent, comme la landing page.
const tab = (size: number) => iconSvg(size, 0.94, 0, null);
writeFileSync(join(OUT, "favicon.ico"), ico([16, 32, 48].map((size) => ({ size, data: png(tab(size)) }))));
writeFileSync(join(OUT, "favicon.png"), png(tab(64)));
writeFileSync(join(OUT, "apple-touch-icon.png"), png(iconSvg(180, 0.66)));
// « any » : la mascotte en grand ; « maskable » : dans la zone sûre, le système arrondit ou découpe le fond.
writeFileSync(join(OUT, "icon-192.png"), png(iconSvg(192, 0.76)));
writeFileSync(join(OUT, "icon-512.png"), png(iconSvg(512, 0.76)));
writeFileSync(join(OUT, "icon-maskable-512.png"), png(iconSvg(512, 0.56)));

// La mascotte des dessins : 96 px de haut, assez pour la fiche agrandie et les images de partage.
const SMALL_H = 96;
const SMALL_W = Math.round((SMALL_H * LOGO_W) / LOGO_H);
const small = new Resvg(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SMALL_W}" height="${SMALL_H}" viewBox="0 0 ${SMALL_W} ${SMALL_H}"><image width="${SMALL_W}" height="${SMALL_H}" href="${LOGO}"/></svg>`,
).render().asPng();
writeFileSync(
  join(ROOT, "shared", "card", "azeritLogo.ts"),
  `// Fichier écrit par scripts/icons.ts depuis web/public/logo.png : ne pas modifier à la main.\n\n` +
    `/** La mascotte d'Azerit, ${SMALL_W} × ${SMALL_H} px, en PNG. */\n` +
    `export const AZERIT_LOGO_URI = "data:image/png;base64,${small.toString("base64")}";\n` +
    `/** Largeur sur hauteur de la mascotte. */\n` +
    `export const AZERIT_LOGO_RATIO = ${LOGO_W} / ${LOGO_H};\n`,
);
console.log("Icônes écrites dans", OUT, "; mascotte des dessins :", small.length, "octets");
