// Le crépuscule derrière la fiche d'exemple (SPEC §18.81) : le décor de l'aperçu de
// lien de l'accueil (/og/home.png), en aplats. Le ciel, le soleil derrière la fiche,
// deux rangées d'immeubles et le sol, où se pose la légende. Les teintes et la ligne
// des toits viennent de shared/sunset.tsx, comme l'image. Tout se place d'après la
// largeur de la fiche (--stage-card, styles.css « la scène ») ; purement décoratif.
import type { CSSProperties } from "react";
import { SUNSET, skyline } from "../../../shared/sunset";

/** La bande des toits : plus large que la scène la plus large (un téléphone couché, 899 px), centrée, jamais étirée. */
const CITY_W = 1600;
/** La hauteur des plus hauts immeubles, celle de l'aperçu de lien. */
export const CITY_H = 56;

const FAR = skyline(CITY_W, CITY_H, SUNSET.far, 7, CITY_H, false);
const NEAR = skyline(CITY_W, CITY_H, SUNSET.near, 31, CITY_H * 0.8, true);

const TINTS = { "--sunset-sky": SUNSET.sky, "--sunset-sun": SUNSET.sun, "--sunset-ground": SUNSET.ground, "--sunset-city": `${CITY_H}px` } as CSSProperties;

export function Sunset() {
  return (
    <div className="sunset" style={TINTS} aria-hidden>
      <span className="sunset-sun" />
      <svg className="sunset-city" width={CITY_W} height={CITY_H} viewBox={`0 0 ${CITY_W} ${CITY_H}`} focusable="false">
        <g>{FAR}</g>
        <g>{NEAR}</g>
      </svg>
      <span className="sunset-ground" />
    </div>
  );
}
