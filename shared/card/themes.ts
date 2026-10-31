// Thèmes de rendu par tier et carte spéciale. Source unique des métaux :
// le SVG les lit directement, le web en dérive ses variables CSS (holo, lueur).
import type { CardStyle, Fact, StatusTone } from "../types";

/** Palette de l'univers GTA 6 (SPEC §17.2), source unique pour le SVG et le CSS. */
export const PALETTE = {
  night: "#0a0a1f",
  night2: "#12122e",
  pink: "#ff3fa4",
  orange: "#ff7a3d",
  yellow: "#ffd23f",
  cyan: "#3fd8ff",
  violet: "#7b3fe4",
  star: "#fff4e0",
  money: "#8ce06b",
  ink: "#f3f1ff",
  inkSoft: "#b9b6d6",
  inkMuted: "#7d7a9c",
  neg: "#ff5c7a",
  pos: "#8ce06b",
  special: "#3fd8ff",
  gap: "#ffd23f",
} as const;

/** Arrêt de dégradé : [offset 0..1, couleur, opacité?] */
export type Stop = [number, string, number?];

export type Texture = "grain" | "brushed" | "glints" | "pearl" | "energy" | "halftone" | "pinstripe";

export interface CardTheme {
  key: CardStyle;
  label: Fact;
  /** Le corps est-il sombre (texte clair) ? */
  dark: boolean;

  /** Anneau métallique extérieur, en diagonale. */
  frame: Stop[];
  /** Corps de la carte, de haut en bas. */
  body: Stop[];
  /** Voile diagonal (reflets) posé sur le corps. */
  sheen: Stop[];
  texture: Texture;
  textureOpacity: number;
  /** Facettes cristallines (clin d'œil à la gemme Azerit). */
  facetLight: number;
  facetDark: number;
  /** Rayons derrière le portrait (0 = aucun). */
  rays: number;

  /** Encre principale (note, nom, valeurs) : couleur pleine ou dégradé vertical. */
  ink: string;
  inkGradient?: Stop[];
  inkSoft: string;
  inkMuted: string;
  /** Liseré clair qui détache le texte du métal (gravure). */
  emboss: string;
  embossOpacity: number;

  /** Filets décoratifs. */
  rule: string;
  /** Bord intérieur lumineux. */
  innerLine: string;
  innerGlow: string;

  halo: string;
  haloOpacity: number;

  /** Pastilles de statut. */
  pillBg: string;
  pillBgOpacity: number;
  pillBorder: string;
  pillText: string;
  tones: Record<StatusTone, string>;

  /** Couleur d'alerte de BUZZ. */
  buzz: string;

  /** Badge de carte spéciale. */
  badge?: { bg: Stop[]; ink: string; border: string };

  /** Réglages des calques CSS côté web. */
  fx: {
    holo: number; // intensité du reflet holographique
    glare: number; // reflet spéculaire
    grain: number; // grain métallique
    /** Teintes du reflet holographique (5 couleurs). */
    holoColors: [string, string, string, string, string];
    /** Lueur portée autour de la carte. */
    glow: string;
  };
}

const TONES_ON_DARK: Record<StatusTone, string> = {
  negative: "#ff8b7b",
  positive: "#52d0bd",
  special: "#8fc4ff",
  gap: "#ffc861",
};

export const THEMES: Record<CardStyle, CardTheme> = {
  bronze: {
    key: "bronze",
    label: { fr: "BRONZE", en: "BRONZE" },
    dark: false,
    frame: [
      [0, "#4a2614"], [0.18, "#c98a5c"], [0.34, "#7c4526"], [0.52, "#e3ad80"], [0.7, "#8a4f2c"], [0.86, "#d39467"], [1, "#4e2a16"],
    ],
    body: [[0, "#d29a6c"], [0.42, "#b47648"], [0.78, "#94572f"], [1, "#7a4424"]],
    sheen: [[0, "#fff", 0], [0.38, "#fff", 0], [0.47, "#ffe7d2", 0.18], [0.53, "#fff", 0], [0.72, "#fff", 0], [0.8, "#ffe7d2", 0.1], [0.86, "#fff", 0]],
    texture: "grain",
    textureOpacity: 0.55,
    facetLight: 0.07,
    facetDark: 0.06,
    rays: 0,
    ink: "#2e1609",
    inkSoft: "#4a2614",
    inkMuted: "#6e3f22",
    emboss: "#ffd9b8",
    embossOpacity: 0.35,
    rule: "#5a2f17",
    innerLine: "#ffd2ad",
    innerGlow: "#ffb47e",
    halo: "#ffd0a3",
    haloOpacity: 0.42,
    pillBg: "#2a1409",
    pillBgOpacity: 0.86,
    pillBorder: "#ffcaa0",
    pillText: "#f6e3d3",
    tones: TONES_ON_DARK,
    buzz: "#8f1d12",
    fx: { holo: 0.34, glare: 0.5, grain: 0.32, holoColors: ["#ff9a5a", "#ffd29a", "#c87b4a", "#ffb48a", "#e88a5a"], glow: "rgba(201,122,72,0.35)" },
  },

  silver: {
    key: "silver",
    label: { fr: "ARGENT", en: "SILVER" },
    dark: false,
    frame: [
      [0, "#59636e"], [0.16, "#eef2f5"], [0.32, "#8b96a1"], [0.5, "#ffffff"], [0.66, "#7d8894"], [0.84, "#dfe5ea"], [1, "#4f5964"],
    ],
    body: [[0, "#eef1f4"], [0.38, "#cfd5db"], [0.74, "#b2bac2"], [1, "#98a2ac"]],
    sheen: [[0, "#fff", 0], [0.3, "#fff", 0], [0.42, "#fff", 0.5], [0.5, "#fff", 0], [0.66, "#fff", 0], [0.74, "#fff", 0.28], [0.8, "#fff", 0]],
    texture: "brushed",
    textureOpacity: 0.42,
    facetLight: 0.22,
    facetDark: 0.05,
    rays: 0,
    ink: "#18202a",
    inkSoft: "#34404c",
    inkMuted: "#66717d",
    emboss: "#ffffff",
    embossOpacity: 0.6,
    rule: "#3e4955",
    innerLine: "#ffffff",
    innerGlow: "#e8f2ff",
    halo: "#ffffff",
    haloOpacity: 0.7,
    pillBg: "#141b23",
    pillBgOpacity: 0.88,
    pillBorder: "#ffffff",
    pillText: "#e6ecf2",
    tones: TONES_ON_DARK,
    buzz: "#a3261b",
    fx: { holo: 0.55, glare: 0.65, grain: 0.22, holoColors: ["#9ec9ff", "#e3f0ff", "#b6c4d6", "#c9b6ff", "#a6e3e9"], glow: "rgba(190,205,220,0.30)" },
  },

  gold: {
    key: "gold",
    label: { fr: "OR", en: "GOLD" },
    dark: false,
    frame: [
      [0, "#6e4a10"], [0.14, "#f7df93"], [0.3, "#a87a22"], [0.46, "#fff3c8"], [0.62, "#b8892c"], [0.8, "#f2d27c"], [1, "#6a4510"],
    ],
    body: [[0, "#f8e4a0"], [0.32, "#eccb70"], [0.7, "#d6a948"], [1, "#b88a2e"]],
    sheen: [[0, "#fff", 0], [0.28, "#fff", 0], [0.4, "#fffbe6", 0.55], [0.47, "#fff", 0], [0.62, "#fff", 0], [0.7, "#fff6d6", 0.32], [0.76, "#fff", 0]],
    texture: "glints",
    textureOpacity: 0.5,
    facetLight: 0.2,
    facetDark: 0.06,
    rays: 0.1,
    ink: "#3a2604",
    inkSoft: "#5a3f0c",
    inkMuted: "#8a6624",
    emboss: "#fff6d2",
    embossOpacity: 0.55,
    rule: "#6b4a10",
    innerLine: "#fff6d6",
    innerGlow: "#ffe9a8",
    halo: "#fff4cf",
    haloOpacity: 0.75,
    pillBg: "#2b1d05",
    pillBgOpacity: 0.88,
    pillBorder: "#ffe6a0",
    pillText: "#fbefd2",
    tones: TONES_ON_DARK,
    buzz: "#9e2410",
    fx: { holo: 0.7, glare: 0.75, grain: 0.2, holoColors: ["#ffd76a", "#fff3c0", "#ff9e6a", "#ffe08a", "#ffb8d0"], glow: "rgba(240,196,92,0.38)" },
  },

  icon: {
    key: "icon",
    label: { fr: "ICON", en: "ICON" },
    dark: false,
    frame: [
      [0, "#a8905a"], [0.15, "#fffaf0"], [0.3, "#d4bd86"], [0.46, "#ffffff"], [0.6, "#c9b27c"], [0.78, "#fff4dc"], [1, "#9c844e"],
    ],
    body: [[0, "#fffdf8"], [0.35, "#f6f1ea"], [0.72, "#ebe6ee"], [1, "#dcdde6"]],
    sheen: [
      [0, "#ffd3e6", 0.0], [0.2, "#ffd3e6", 0.55], [0.38, "#cdf3e8", 0.5], [0.55, "#d9d1ff", 0.55], [0.72, "#ffe4c4", 0.5], [0.9, "#c9ecff", 0.5], [1, "#ffd3e6", 0.0],
    ],
    texture: "pearl",
    textureOpacity: 0.5,
    facetLight: 0.55,
    facetDark: 0.05,
    rays: 0.14,
    ink: "#221f2b",
    inkGradient: [[0, "#2b2735"], [1, "#4a3a1c"]],
    inkSoft: "#4a4558",
    inkMuted: "#8a8597",
    emboss: "#ffffff",
    embossOpacity: 0.9,
    rule: "#a8884a",
    innerLine: "#ffffff",
    innerGlow: "#fff2d8",
    halo: "#ffffff",
    haloOpacity: 0.95,
    pillBg: "#1d1b26",
    pillBgOpacity: 0.9,
    pillBorder: "#e8d6a8",
    pillText: "#f2eef8",
    tones: TONES_ON_DARK,
    buzz: "#b0281a",
    fx: { holo: 0.8, glare: 0.7, grain: 0.18, holoColors: ["#ff7eb6", "#7afcff", "#feff9c", "#a78bfa", "#7cffcb"], glow: "rgba(255,240,215,0.45)" },
  },

  wonderkid: {
    key: "wonderkid",
    label: { fr: "WONDERKID", en: "WONDERKID" },
    dark: true,
    frame: [
      [0, "#173a33"], [0.14, "#dde27d"], [0.3, "#2f7a6b"], [0.46, "#a6f0e2"], [0.62, "#2a6a5e"], [0.8, "#cfe56f"], [1, "#163630"],
    ],
    body: [[0, "#0b211c"], [0.45, "#081914"], [0.8, "#07130f"], [1, "#0a1a16"]],
    sheen: [[0, "#dde27d", 0], [0.3, "#dde27d", 0], [0.4, "#dde27d", 0.14], [0.46, "#52d0bd", 0], [0.64, "#52d0bd", 0], [0.72, "#52d0bd", 0.12], [0.78, "#52d0bd", 0]],
    texture: "energy",
    textureOpacity: 0.9,
    facetLight: 0.05,
    facetDark: 0.18,
    rays: 0.07,
    ink: "#f4fbe6",
    inkGradient: [[0, "#f6ffd0"], [0.55, "#dde27d"], [1, "#52d0bd"]],
    inkSoft: "#bfe9d9",
    inkMuted: "#6e9b8d",
    emboss: "#000000",
    embossOpacity: 0.5,
    rule: "#52d0bd",
    innerLine: "#cfe96f",
    innerGlow: "#52d0bd",
    halo: "#52d0bd",
    haloOpacity: 0.7,
    pillBg: "#ffffff",
    pillBgOpacity: 0.06,
    pillBorder: "#52d0bd",
    pillText: "#e6f5ee",
    tones: TONES_ON_DARK,
    buzz: "#ffb35c",
    badge: { bg: [[0, "#e3e886"], [1, "#52d0bd"]], ink: "#06140f", border: "#f2f7b0" },
    fx: { holo: 0.55, glare: 0.4, grain: 0.18, holoColors: ["#dde27d", "#52d0bd", "#93dbcf", "#6cb6ff", "#c7f26a"], glow: "rgba(82,208,189,0.45)" },
  },

  flashback: {
    key: "flashback",
    label: { fr: "FLASHBACK", en: "FLASHBACK" },
    dark: false,
    frame: [
      [0, "#5a2c44"], [0.16, "#eab8c6"], [0.32, "#8f4f6c"], [0.5, "#f6dcc6"], [0.66, "#a05f78"], [0.84, "#e6c0b0"], [1, "#4f2639"],
    ],
    body: [[0, "#f0d8bc"], [0.38, "#e2b7a6"], [0.72, "#c98d9f"], [1, "#a8667f"]],
    sheen: [[0, "#fff", 0], [0.3, "#fff", 0], [0.42, "#fff3e0", 0.3], [0.5, "#fff", 0], [0.7, "#fff", 0], [0.78, "#fff3e0", 0.16], [0.84, "#fff", 0]],
    texture: "halftone",
    textureOpacity: 0.16,
    facetLight: 0.12,
    facetDark: 0.05,
    rays: 0.07,
    ink: "#2c1120",
    inkSoft: "#4f2238",
    inkMuted: "#7d4a60",
    emboss: "#fff1e2",
    embossOpacity: 0.45,
    rule: "#6a2f4a",
    innerLine: "#fff0e0",
    innerGlow: "#f7c9d6",
    halo: "#fff1dc",
    haloOpacity: 0.6,
    pillBg: "#2c1120",
    pillBgOpacity: 0.86,
    pillBorder: "#f3c6d2",
    pillText: "#f8e8ea",
    tones: TONES_ON_DARK,
    buzz: "#9a1f3c",
    badge: { bg: [[0, "#b04a7c"], [1, "#7c2c55"]], ink: "#fbeee0", border: "#f3c6d2" },
    fx: { holo: 0.6, glare: 0.6, grain: 0.32, holoColors: ["#ff8fc0", "#ffd6a8", "#d99ad0", "#ffc2a0", "#f7a8c8"], glow: "rgba(214,130,160,0.35)" },
  },

  totw: {
    key: "totw",
    label: { fr: "TEAM OF THE WEEK", en: "TEAM OF THE WEEK" },
    dark: true,
    frame: [
      [0, "#5e4210"], [0.14, "#f7df93"], [0.3, "#9c7020"], [0.46, "#fff3c8"], [0.62, "#a77c26"], [0.8, "#e9c56c"], [1, "#563c0e"],
    ],
    body: [[0, "#1c1a17"], [0.4, "#121110"], [0.8, "#0b0b0b"], [1, "#151310"]],
    sheen: [[0, "#f7df93", 0], [0.3, "#f7df93", 0], [0.41, "#f7df93", 0.12], [0.47, "#f7df93", 0], [0.66, "#f7df93", 0], [0.73, "#f7df93", 0.07], [0.78, "#f7df93", 0]],
    texture: "pinstripe",
    textureOpacity: 0.12,
    facetLight: 0.05,
    facetDark: 0.25,
    rays: 0.06,
    ink: "#f2d68a",
    inkGradient: [[0, "#fff3c8"], [0.5, "#f0cf78"], [1, "#b8892c"]],
    inkSoft: "#d8bd7a",
    inkMuted: "#86744a",
    emboss: "#000000",
    embossOpacity: 0.6,
    rule: "#c9a24a",
    innerLine: "#f7df93",
    innerGlow: "#d9a93c",
    halo: "#f0c86a",
    haloOpacity: 0.35,
    pillBg: "#ffffff",
    pillBgOpacity: 0.05,
    pillBorder: "#d9b45c",
    pillText: "#f3ead2",
    tones: TONES_ON_DARK,
    buzz: "#ff9d5c",
    badge: { bg: [[0, "#0d0c0a"], [1, "#1f1b12"]], ink: "#f7df93", border: "#d9b45c" },
    fx: { holo: 0.42, glare: 0.45, grain: 0.2, holoColors: ["#f7df93", "#fff3c8", "#d9a93c", "#ffe9a8", "#b8892c"], glow: "rgba(217,169,60,0.4)" },
  },
};

export function themeFor(style: CardStyle): CardTheme {
  return THEMES[style];
}

/** Variables CSS dérivées du thème, pour les calques d'effets du web. */
export function themeCssVars(style: CardStyle): Record<string, string> {
  const t = THEMES[style];
  const [a, b, c, d, e] = t.fx.holoColors;
  return {
    "--tys-holo": String(t.fx.holo),
    "--tys-glare": String(t.fx.glare),
    "--tys-grain": String(t.fx.grain),
    "--tys-h1": a,
    "--tys-h2": b,
    "--tys-h3": c,
    "--tys-h4": d,
    "--tys-h5": e,
    "--tys-glow": t.fx.glow,
    "--tys-frame": `linear-gradient(135deg, ${t.frame.map(([o, col]) => `${col} ${Math.round(o * 100)}%`).join(", ")})`,
  };
}
