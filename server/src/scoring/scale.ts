// Échelles linéaires par morceaux, arrondi, bornes (SPEC §4.4).

import { SCORING, type Scale } from "./config";

/** Interpolation linéaire entre points triés par x. En dehors : valeur du point extrême. */
export function interpolate(scale: Scale, x: number): number {
  if (scale.length === 0) throw new Error("échelle vide");
  if (!Number.isFinite(x) || x <= scale[0][0]) return scale[0][1];
  for (let i = 1; i < scale.length; i++) {
    const [x1, y1] = scale[i];
    if (x <= x1) {
      const [x0, y0] = scale[i - 1];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return scale[scale.length - 1][1];
}

export function clampScore(v: number): number {
  const { min, max } = SCORING.bounds;
  return Math.min(max, Math.max(min, Math.round(v)));
}

/** Note finale d'un axe : échelle + bonus, arrondie et bornée. */
export function scoreOn(scale: Scale, x: number, bonus = 0): number {
  return clampScore(interpolate(scale, x) + bonus);
}
