// Gemme Azerit (cf. LandingPage/src/components/Logo.tsx), en SVG pur.
// Style mat (SPEC §18.18) : deux facettes en aplats, chartreuse et teal, sans
// dégradé, pour laisser à la fiche son unique dégradé.

export const GEM_LEFT = "#c9d67c";
export const GEM_RIGHT = "#6fb2a8";

/** Gemme posée en (x, y), hauteur `h` (proportions 104 × 120). */
export function AzeritGem({ x, y, h }: { x: number; y: number; h: number }) {
  const s = h / 120;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M52 8 L14 50 L37 102 Z" fill={GEM_LEFT} stroke={GEM_LEFT} strokeWidth={9} strokeLinejoin="round" />
      <path d="M63 10 L92 42 L85 80 L47 112 Z" fill={GEM_RIGHT} stroke={GEM_RIGHT} strokeWidth={9} strokeLinejoin="round" />
    </g>
  );
}
