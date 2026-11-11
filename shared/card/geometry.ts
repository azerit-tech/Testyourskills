// Silhouette de la fiche (SPEC §17.3) : un rectangle 360 × 520 aux coins
// arrondis de 16, comme la maquette validée. Le contour exact sert de
// masque (web) et d'extrusion (scène 3D) ; les contours intérieurs sont le
// même rectangle rentré de `inset`, rayon réduit d'autant.

export const CARD_W = 360;
export const CARD_H = 520;
export const CARD_R = 16;

const f = (n: number) => (Math.round(n * 100) / 100).toString();

/** Contour décalé vers l'intérieur de `inset` unités (0 = contour exact). */
export function cardPath(inset = 0): string {
  const x0 = inset, y0 = inset, x1 = CARD_W - inset, y1 = CARD_H - inset;
  const r = Math.max(0, CARD_R - inset);
  return (
    `M${f(x0 + r)} ${f(y0)}H${f(x1 - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x1)} ${f(y0 + r)}V${f(y1 - r)}` +
    `A${f(r)} ${f(r)} 0 0 1 ${f(x1 - r)} ${f(y1)}H${f(x0 + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x0)} ${f(y1 - r)}V${f(y0 + r)}` +
    `A${f(r)} ${f(r)} 0 0 1 ${f(x0 + r)} ${f(y0)}Z`
  );
}

/** Chemin exact du contour extérieur (coordonnées du viewBox). */
export const CARD_PATH = cardPath(0);

/** Masque CSS (data URI) de la silhouette, à étirer en 100 % 100 %. */
export const CARD_MASK_URL = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_W} ${CARD_H}" preserveAspectRatio="none"><path d="${CARD_PATH}" fill="#000"/></svg>`,
)}")`;
