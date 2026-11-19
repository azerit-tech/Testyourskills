// Le front de mer au crépuscule, en aplats : le décor de l'aperçu de lien de
// l'accueil (/og/home.png, server/src/render/compositions.tsx) et celui du
// premier écran de l'accueil, derrière la fiche d'exemple (§18.81,
// web/src/components/Sunset.tsx). Une seule source pour les teintes et pour la
// ligne des toits : l'image partagée et la page montrent la même ville.
import type { ReactNode } from "react";

/** Aplats de l'illustration (maquette validée du 9 novembre 2026, dans l'historique git). */
export const SUNSET = {
  sky: "#2d2a66",
  sun: "#e98a98",
  far: "#463b84",
  palm: "#241f55",
  near: "#1d1946",
  ground: "#121130",
  window: "#ffc46b",
};

/** Une rangée d'immeubles en aplat jusqu'à l'horizon `y`, pseudo-aléatoire mais stable. */
export function skyline(w: number, y: number, fill: string, seed: number, maxH: number, lights: boolean): ReactNode[] {
  const out: ReactNode[] = [];
  let x = 0;
  let r = seed;
  const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  while (x < w) {
    const bw = 26 + rnd() * 50;
    const bh = 30 + rnd() * (maxH - 30);
    out.push(<rect key={`b${x}`} x={+x.toFixed(1)} y={+(y - bh).toFixed(1)} width={+(bw + 1).toFixed(1)} height={+(bh + 2).toFixed(1)} fill={fill} />);
    if (lights) {
      for (let k = 0; k < bh / 18 - 1; k++)
        for (let j = 0; j < bw / 14 - 1; j++)
          if (rnd() > 0.55) out.push(<rect key={`w${x}-${k}-${j}`} x={+(x + 6 + j * 13).toFixed(1)} y={+(y - bh + 10 + k * 17).toFixed(1)} width={4} height={5} fill={SUNSET.window} fillOpacity={0.75} />);
    }
    x += bw;
  }
  return out;
}
