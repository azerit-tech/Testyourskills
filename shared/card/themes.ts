// Thèmes de rendu de la fiche (SPEC §17.3) : un par nombre d'étoiles, plus les
// trois spéciales. Source unique des couleurs : le SVG les lit directement, le
// web en dérive ses variables CSS (reflet néon, lueur).
import type { CardData, CardStyle, Fact, Stars, StatusTone } from "../types";
import { starsFor } from "../types";

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

export type ThemeKey = `s${Stars}` | "wonderkid" | "flashback" | "totw";

export interface CardTheme {
  key: ThemeKey;
  /** Libellé du niveau ou de la spéciale (le badge pour les spéciales). */
  label: Fact;
  /** Toujours vrai : le corps est de nuit. Gardé pour les compositions serveur. */
  dark: true;
  /** Néon principal (étoiles, niveau, barres) et second néon (halo de droite). */
  accent: string;
  accent2: string;
  /** Dégradé de la note, en diagonale. Au moins quatre arrêts (frame[3] est lu par le serveur). */
  num: Stop[];
  /** Même chose, pour les compositions qui lisent `frame`. */
  frame: Stop[];
  /** Opacité du halo néon. */
  haze: number;
  /** Palmier en ombre chinoise dans le coin. */
  palms: number;
  /** Reflet statique (★★★★★) dans le PNG. */
  holoBand: boolean;
  /** Encre. */
  ink: string;
  inkSoft: string;
  inkMuted: string;
  rule: string;
  innerLine: string;
  innerGlow: string;
  tones: Record<StatusTone, string>;
  buzz: string;
  /** Badge de carte spéciale. */
  badge?: { bg: string; ink: string };
  /** Réglages des calques CSS côté web. */
  fx: {
    holo: number;
    glare: number;
    grain: number;
    holoColors: [string, string, string, string, string];
    glow: string;
  };
}

const TONES: Record<StatusTone, string> = {
  negative: PALETTE.neg,
  positive: PALETTE.pos,
  special: PALETTE.special,
  gap: PALETTE.gap,
};

const SUNSET: Stop[] = [[0, PALETTE.yellow], [0.32, PALETTE.orange], [0.66, PALETTE.pink], [1, PALETTE.violet]];

function base(key: ThemeKey, label: Fact, o: Partial<CardTheme> & Pick<CardTheme, "accent" | "accent2" | "num" | "haze" | "fx">): CardTheme {
  return {
    key,
    label,
    dark: true,
    frame: o.num.length >= 4 ? o.num : [...o.num, o.num[o.num.length - 1], o.num[o.num.length - 1], o.num[o.num.length - 1]],
    palms: 0,
    holoBand: false,
    ink: PALETTE.ink,
    inkSoft: PALETTE.inkSoft,
    inkMuted: PALETTE.inkMuted,
    rule: "rgba(255,255,255,0.1)",
    innerLine: PALETTE.star,
    innerGlow: o.accent,
    tones: TONES,
    buzz: PALETTE.orange,
    ...o,
  };
}

const AMBER = "#f0a848";

export const THEMES: Record<ThemeKey, CardTheme> = {
  s1: base("s1", { fr: "Petit délit", en: "Petty crime" }, {
    accent: AMBER, accent2: AMBER,
    num: [[0, "#f6c37a"], [1, "#c98430"]],
    haze: 0.28,
    fx: { holo: 0.3, glare: 0.35, grain: 0.3, holoColors: ["#f6c37a", "#c98430", "#ffd9a0", "#a86a22", "#f0a848"], glow: "rgba(240,168,72,0.3)" },
  }),
  s2: base("s2", { fr: "Suspect", en: "Suspect" }, {
    accent: PALETTE.pink, accent2: PALETTE.pink,
    num: [[0, "#ff8ccb"], [1, PALETTE.pink]],
    haze: 0.38,
    fx: { holo: 0.4, glare: 0.4, grain: 0.26, holoColors: ["#ff8ccb", PALETTE.pink, "#ffc2e2", "#c22a7c", "#ff5fb5"], glow: "rgba(255,63,164,0.32)" },
  }),
  s3: base("s3", { fr: "Recherché", en: "Wanted" }, {
    accent: PALETTE.pink, accent2: PALETTE.cyan,
    num: [[0, PALETTE.pink], [1, PALETTE.cyan]],
    haze: 0.5,
    palms: 0.85,
    fx: { holo: 0.55, glare: 0.45, grain: 0.22, holoColors: [PALETTE.pink, "#b06cff", PALETTE.cyan, "#7af0ff", "#ff7ec6"], glow: "rgba(255,63,164,0.36)" },
  }),
  s4: base("s4", { fr: "Dangereux", en: "Dangerous" }, {
    accent: PALETTE.orange, accent2: PALETTE.pink,
    num: [[0, PALETTE.yellow], [0.45, PALETTE.orange], [1, PALETTE.pink]],
    haze: 0.62,
    palms: 0.95,
    fx: { holo: 0.65, glare: 0.5, grain: 0.2, holoColors: [PALETTE.yellow, PALETTE.orange, PALETTE.pink, "#ff9a5a", "#ffd97a"], glow: "rgba(255,122,61,0.4)" },
  }),
  s5: base("s5", { fr: "Ennemi public", en: "Public enemy" }, {
    accent: PALETTE.pink, accent2: PALETTE.violet,
    num: SUNSET,
    haze: 0.78,
    palms: 0.95,
    holoBand: true,
    fx: { holo: 0.8, glare: 0.55, grain: 0.18, holoColors: [PALETTE.yellow, PALETTE.orange, PALETTE.pink, PALETTE.violet, PALETTE.cyan], glow: "rgba(255,63,164,0.5)" },
  }),
  wonderkid: base("wonderkid", { fr: "Nouveau en ville", en: "New in town" }, {
    accent: PALETTE.pink, accent2: PALETTE.cyan,
    num: [[0, PALETTE.pink], [1, PALETTE.cyan]],
    haze: 0.5,
    palms: 0.85,
    badge: { bg: PALETTE.money, ink: "#06180a" },
    fx: { holo: 0.55, glare: 0.45, grain: 0.22, holoColors: [PALETTE.money, PALETTE.cyan, PALETTE.pink, "#c7f26a", "#7af0ff"], glow: "rgba(140,224,107,0.4)" },
  }),
  flashback: base("flashback", { fr: "Affaire classée", en: "Cold case" }, {
    accent: PALETTE.cyan, accent2: PALETTE.pink,
    num: [[0, PALETTE.cyan], [1, PALETTE.pink]],
    haze: 0.5,
    palms: 0.85,
    badge: { bg: PALETTE.cyan, ink: "#00161c" },
    fx: { holo: 0.55, glare: 0.45, grain: 0.3, holoColors: [PALETTE.cyan, "#7af0ff", PALETTE.pink, "#b06cff", "#3fd8ff"], glow: "rgba(63,216,255,0.4)" },
  }),
  totw: base("totw", { fr: "Les 5 plus recherchés", en: "Top 5 most wanted" }, {
    accent: PALETTE.orange, accent2: PALETTE.pink,
    num: [[0, PALETTE.yellow], [0.45, PALETTE.orange], [1, PALETTE.pink]],
    haze: 0.62,
    palms: 0.95,
    holoBand: true,
    badge: { bg: PALETTE.yellow, ink: "#140b00" },
    fx: { holo: 0.7, glare: 0.5, grain: 0.2, holoColors: [PALETTE.yellow, PALETTE.orange, PALETTE.pink, "#ffe9a8", PALETTE.violet], glow: "rgba(255,210,63,0.42)" },
  }),
};

/** Thème d'une fiche : la spéciale si elle s'applique, sinon le niveau d'étoiles. */
export function themeOf(card: Pick<CardData, "overall" | "special">): CardTheme {
  return card.special ? THEMES[card.special] : THEMES[`s${starsFor(card.overall)}`];
}

/** Compatibilité : les compositions serveur passent encore le style (tier ou spéciale).
 *  Les tiers ne distinguent pas ★ de ★★ : bronze donne ★. Préférer themeOf(card). */
export function themeFor(style: CardStyle | Stars): CardTheme {
  if (typeof style === "number") return THEMES[`s${style}`];
  switch (style) {
    case "bronze": return THEMES.s1;
    case "silver": return THEMES.s3;
    case "gold": return THEMES.s4;
    case "icon": return THEMES.s5;
    default: return THEMES[style];
  }
}

/** Variables CSS dérivées du thème, pour les calques d'effets du web. */
export function themeCssVars(th: CardTheme): Record<string, string> {
  const [a, b, c, d, e] = th.fx.holoColors;
  return {
    "--tys-holo": String(th.fx.holo),
    "--tys-glare": String(th.fx.glare),
    "--tys-grain": String(th.fx.grain),
    "--tys-h1": a,
    "--tys-h2": b,
    "--tys-h3": c,
    "--tys-h4": d,
    "--tys-h5": e,
    "--tys-glow": th.fx.glow,
    "--tys-accent": th.accent,
    "--tys-frame": `linear-gradient(135deg, ${th.num.map(([o, col]) => `${col} ${Math.round(o * 100)}%`).join(", ")})`,
  };
}
