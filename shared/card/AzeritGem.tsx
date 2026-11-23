// Logo Azerit sur la fiche : la mascotte (écran de pierre à l'écran turquoise), la même
// que la landing page et l'app. L'image vient de web/public/logo.png, réduite et mise en
// data URI par scripts/icons.ts, pour que le SVG reste autonome (navigateur et resvg).

import { AZERIT_LOGO_RATIO, AZERIT_LOGO_URI } from "./azeritLogo";

/** Mascotte posée en (x, y), hauteur `h` (proportions 228 × 256). */
export function AzeritGem({ x, y, h }: { x: number; y: number; h: number }) {
  return <image x={x} y={y} width={+(h * AZERIT_LOGO_RATIO).toFixed(2)} height={h} href={AZERIT_LOGO_URI} />;
}
