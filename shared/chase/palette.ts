// Les couleurs de la poursuite, une palette par lumière des décors
// (docs/brief-illustrations.md §4) : le ciel en dégradé (le seul de l'écran
// avec celui, doux, de la route), la ville en silhouettes de la teinte du ciel
// en plus foncé (plus c'est loin, plus ça vire au lavande), les ombres prune
// ou marine, jamais noires. Les véhicules sont des silhouettes de l'ombre de la
// scène, leur dessus un ton plus clair ; seules leurs lumières ont une couleur.
import type { Light } from "../sceneLight";

export interface ChasePalette {
  /** Le ciel, de haut en bas : [position 0..1, couleur]. */
  sky: [number, string][];
  /** Soleil bas (heure dorée) ou lune (heure bleue), en aplat. */
  disc?: string;
  far: string;
  mid: string;
  /** La bande de haies et de palmiers à l'horizon, où la route se perd. */
  hedge: string;
  /** Fenêtres allumées. */
  windows: string;
  road: string;
  /** La route à l'horizon, plus claire (brume) : le dégradé doux de la route. */
  roadFar: string;
  verge: string;
  /** Trottoirs, entre la bordure et les palmiers : un ton plus clair que la route. */
  walk: string;
  curb: string;
  /** Palmiers et lampadaires du bord de l'avenue. */
  palm: string;
  lamp: string;
  body: string;
  top: string;
  glass: string;
  shadow: string;
  heli: string;
  heliTop: string;
}

export const CREAM = "#fff9cb";
export const INK = "#0c0d1b";
export const BLUSH = "#ffb2c6";
export const CORAL = "#ff6a3d";
export const PERIWINKLE = "#8d8cf0";

export const PALETTES: Record<Light, ChasePalette> = {
  // A. Heure rose : lavande → rose brumeux → pêche pâle, silhouettes prune.
  pink: {
    sky: [[0, "#c4b8f2"], [0.55, "#e2a4cb"], [0.88, "#f8c6c4"], [1, "#ffd9c2"]],
    far: "#c497bf",
    mid: "#a1739f",
    hedge: "#7a4f6e",
    windows: "#ffe7cf",
    road: "#5e3d66",
    roadFar: "#a17a9f",
    verge: "#7d5880",
    walk: "#a37c9f",
    curb: "#c79bb6",
    palm: "#6a4268",
    lamp: "#ffe7cf",
    body: "#3e2648",
    top: "#6a4a76",
    glass: "#8d6fa0",
    shadow: "#331d3d",
    heli: "#5d3c62",
    heliTop: "#7d5a83",
  },
  // B. Heure dorée : rose → pêche → pêche-jaune, soleil bas en disque plein, prune chaud.
  gold: {
    sky: [[0, "#e8869c"], [0.5, "#f4a38f"], [0.86, "#fcbf8a"], [1, "#ffc77e"]],
    disc: "#ffe49a",
    far: "#d58e98",
    mid: "#ad6680",
    hedge: "#7c4466",
    windows: "#fff0c4",
    road: "#5c3259",
    roadFar: "#9c637d",
    verge: "#82486a",
    walk: "#b0727f",
    curb: "#d99a96",
    palm: "#6c3a5e",
    lamp: "#fff0c4",
    body: "#43203f",
    top: "#6e3d64",
    glass: "#94607e",
    shadow: "#371a38",
    heli: "#63345a",
    heliTop: "#844f74",
  },
  // C. Heure bleue : indigo → marine, fine bande corail à l'horizon, lumières ambre.
  night: {
    sky: [[0, "#383a92"], [0.5, "#4b4fb8"], [0.8, "#6a55ae"], [0.93, "#c0607e"], [1, "#ff7a4e"]],
    disc: "#ffe9b8",
    far: "#6d63b4",
    mid: "#4d4591",
    hedge: "#2e2b63",
    windows: "#ffc36b",
    road: "#292758",
    roadFar: "#4a4384",
    verge: "#2c295e",
    walk: "#423d80",
    curb: "#5f58a0",
    palm: "#26244f",
    lamp: "#ffc36b",
    body: "#1c1c38",
    top: "#4a4888",
    glass: "#6a66b0",
    shadow: "#16162e",
    heli: "#2c2a5e",
    heliTop: "#45428a",
  },
  // D. Aube : lilas clair → pêche → citron pâle, ombres lilas froid.
  dawn: {
    sky: [[0, "#ddd4fc"], [0.55, "#f6d3c4"], [0.85, "#ffd8a8"], [1, "#f1f6a4"]],
    far: "#c9bfe6",
    mid: "#a99ed6",
    hedge: "#887cbd",
    windows: "#fffbe0",
    road: "#5f538f",
    roadFar: "#a093cc",
    verge: "#7a6eab",
    walk: "#9d91c8",
    curb: "#c4b9e6",
    palm: "#73679f",
    lamp: "#fffbe0",
    body: "#43396f",
    top: "#6d62a0",
    glass: "#9488c4",
    shadow: "#382f60",
    heli: "#6b5f9c",
    heliTop: "#8b7fbb",
  },
};
