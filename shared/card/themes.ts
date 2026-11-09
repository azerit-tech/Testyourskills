// Thèmes de rendu de la fiche (SPEC §18.18) : un par nombre d'étoiles, plus les
// trois spéciales. Style mat : fonds plats teintés, UN seul dégradé par fiche
// (le fond, la note ou le ciel), palmiers ton sur ton, aucune lueur sauf le
// contour éclairé de ★★★★★★. Valeurs reprises de la maquette web/gta.css.
import type { CardData, CardStyle, Fact, Stars, StatusTone } from "../types";
import { starsFor } from "../types";

/** Palette mate (docs/inspiration-gta6.md §2), source unique pour le SVG et le CSS. */
export const PALETTE = {
  /* Encre et fonds de carte */
  ink0: "#0c0d1b",
  ink1: "#1f1f38",
  slate: "#252644",
  slateLow: "#17182d",
  navy: "#243152",
  navyLow: "#131a30",
  indigo: "#2c3868",
  plum: "#4b2f54",
  plumLow: "#24172f",
  moss: "#162623",
  mossLow: "#0c1614",
  cold: "#2b3540",
  coldLow: "#161c23",
  /* --dusk : la note de ★★★★ et de la spéciale « Top 5 » */
  duskA: "#6f7cf0",
  duskB: "#b05ad8",
  duskC: "#f0589a",
  duskD: "#ffb366",
  /* Ciel de ★★★★★ (l'heure rose, un ton plus bas pour lire le crème) */
  roseA: "#5560cf",
  roseB: "#9150c8",
  roseC: "#e5558f",
  roseD: "#ffb366",
  duskGround: "#2a1c3c",
  /* Ciel de ★★★★★★ (l'heure bleue) */
  blueA: "#191b45",
  blueB: "#3d42a8",
  blueC: "#9a4aa8",
  blueD: "#ff6a3d",
  blueGround: "#12132e",
  /* Encres */
  cream: "#fff9cb",
  lilac: "#e5ddff",
  lilac2: "#ccc2f5",
  blush: "#ffb2c6",
  peach: "#ffd3a5",
  lime: "#effa9e",
  siren: "#c8283a",
  /* HUD */
  star: "#ffffff",
  /* Lumière : seulement le contour éclairé par l'arrière (★★★★★★) */
  rimCore: "#ffd8c8",
  rimGlow: "#ff8a5c",
  /* Néons de l'ancienne palette, encore lus par la scène 3D (web/src/three) ; plus par la fiche. */
  pink: "#ff3fa4",
  orange: "#ff7a3d",
  yellow: "#ffd23f",
  cyan: "#3fd8ff",
  violet: "#7b3fe4",
} as const;

/** Arrêt de dégradé : [offset 0..1, couleur]. */
export type Stop = [number, string];

export type ThemeKey = `s${Stars}` | "wonderkid" | "flashback" | "totw";

/** Où se trouve l'unique dégradé de la fiche. */
export type GradientSlot = "bg" | "num" | "sky";

export interface CardTheme {
  key: ThemeKey;
  /** Libellé du niveau ou de la spéciale (la pilule pour les spéciales). */
  label: Fact;
  /** Emplacement du seul dégradé : le fond qui descend dans son ton, la note, ou le ciel peint. */
  grad: GradientSlot;
  /** Fond : haut et bas (« bg »), ou aplat (bg[0]) quand le dégradé est ailleurs. */
  bg: [string, string];
  /** Ciel peint (★★★★★ et ★★★★★★) : quatre teintes du haut vers l'horizon, sol, soleil, fenêtres allumées. */
  sky?: { stops: [string, string, string, string]; ground: string; sun?: string; lights?: boolean };
  /** Dégradé de la note (« num ») ; vide sinon. */
  num: Stop[];
  /** Couleur des barres de stats. */
  bar: string;
  /** Palmier ton sur ton dans le coin bas droit ; null : aucun. */
  palm: string | null;
  /** Contour éclairé par l'arrière : réservé à ★★★★★★. */
  rim: boolean;
  /** Photo désaturée (Affaire classée : la caméra-piéton). */
  gray: boolean;
  /** Encres : titres et note, texte courant. */
  ink: string;
  inkSoft: string;
  /** Pastilles des chefs d'accusation. */
  tones: Record<StatusTone, string>;
  buzz: string;
  /** Pilule plate des spéciales. */
  badge?: { bg: string; ink: string };
  /** Teintes du niveau pour la scène 3D et la révélation (Reveal.tsx). */
  accent: string;
  accent2: string;
  /** Grain CSS côté web (0..1). */
  fx: { grain: number };
}

const TONES: Record<StatusTone, string> = {
  negative: PALETTE.siren,
  positive: PALETTE.cream,
  special: PALETTE.lilac2,
  gap: PALETTE.peach,
};

const DUSK: Stop[] = [[0, PALETTE.duskA], [0.35, PALETTE.duskB], [0.65, PALETTE.duskC], [1, PALETTE.duskD]];

type ThemeInput = Pick<CardTheme, "grad" | "bg" | "bar" | "palm"> & Partial<CardTheme>;

function theme(key: ThemeKey, label: Fact, o: ThemeInput): CardTheme {
  return {
    key,
    label,
    num: o.grad === "num" ? DUSK : [],
    rim: false,
    gray: false,
    ink: PALETTE.cream,
    inkSoft: PALETTE.lilac,
    tones: TONES,
    buzz: PALETTE.siren,
    accent: o.bar,
    accent2: o.bg[0],
    fx: { grain: 0.12 },
    ...o,
  };
}

export const THEMES: Record<ThemeKey, CardTheme> = {
  s1: theme("s1", { fr: "Petit délit", en: "Petty crime" }, {
    grad: "bg", bg: [PALETTE.slate, PALETTE.slateLow], bar: PALETTE.lilac2, palm: null,
  }),
  s2: theme("s2", { fr: "Délit", en: "Misdemeanor" }, {
    grad: "bg", bg: [PALETTE.navy, PALETTE.navyLow], bar: PALETTE.blush, palm: "#2c3a60",
  }),
  s3: theme("s3", { fr: "Avis de recherche", en: "Wanted" }, {
    grad: "bg", bg: [PALETTE.plum, PALETTE.plumLow], bar: PALETTE.blush, palm: "#3a2442",
  }),
  s4: theme("s4", { fr: "Haute surveillance", en: "High surveillance" }, {
    grad: "num", bg: [PALETTE.plum, PALETTE.plum], bar: PALETTE.peach, palm: "#5a3a64", accent2: PALETTE.duskC,
  }),
  s5: theme("s5", { fr: "Menace publique", en: "Public menace" }, {
    grad: "sky", bg: [PALETTE.duskGround, PALETTE.duskGround], bar: PALETTE.peach, palm: "#35244a",
    sky: { stops: [PALETTE.roseA, PALETTE.roseB, PALETTE.roseC, PALETTE.roseD], ground: PALETTE.duskGround, sun: "#ffe0b8" },
    accent2: PALETTE.roseC,
  }),
  s6: theme("s6", { fr: "Priorité absolue", en: "Top priority" }, {
    grad: "sky", bg: [PALETTE.blueGround, PALETTE.blueGround], bar: PALETTE.peach, palm: "#1b1c3e",
    sky: { stops: [PALETTE.blueA, PALETTE.blueB, PALETTE.blueC, PALETTE.blueD], ground: PALETTE.blueGround, lights: true },
    rim: true, accent: PALETTE.rimGlow, accent2: PALETTE.blueB,
  }),
  wonderkid: theme("wonderkid", { fr: "Débarque en ville", en: "New in town" }, {
    grad: "bg", bg: [PALETTE.moss, PALETTE.mossLow], bar: PALETTE.lime, palm: "#1f3430",
    badge: { bg: PALETTE.lime, ink: PALETTE.ink0 },
  }),
  flashback: theme("flashback", { fr: "Affaire classée", en: "Cold case" }, {
    grad: "bg", bg: [PALETTE.cold, PALETTE.coldLow], bar: PALETTE.peach, palm: "#323e4a", gray: true,
    badge: { bg: PALETTE.peach, ink: PALETTE.ink0 },
  }),
  totw: theme("totw", { fr: "Top 5 de la semaine", en: "This week's top 5" }, {
    grad: "num", bg: [PALETTE.indigo, PALETTE.indigo], bar: PALETTE.peach, palm: "#34407a",
    badge: { bg: PALETTE.cream, ink: PALETTE.ink0 }, accent2: PALETTE.duskC,
  }),
};

/** Thème d'une fiche : la spéciale si elle s'applique, sinon le niveau d'étoiles. */
export function themeOf(card: Pick<CardData, "overall" | "special">): CardTheme {
  return card.special ? THEMES[card.special] : THEMES[`s${starsFor(card.overall)}`];
}

/** Compatibilité : les compositions serveur passent encore le style (tier ou spéciale).
 *  Les tiers ne distinguent pas ★ à ★★★ : bronze donne ★. Préférer themeOf(card). */
export function themeFor(style: CardStyle | Stars): CardTheme {
  if (typeof style === "number") return THEMES[`s${style}`];
  switch (style) {
    case "bronze": return THEMES.s1;
    case "silver": return THEMES.s4;
    case "gold": return THEMES.s5;
    case "icon": return THEMES.s6;
    default: return THEMES[style];
  }
}

/** Variables CSS dérivées du thème, pour les calques du web (grain, contour de ★★★★★★). */
export function themeCssVars(th: CardTheme): Record<string, string> {
  return {
    "--tys-grain": String(th.fx.grain),
    "--tys-accent": th.accent,
    "--tys-rim-core": PALETTE.rimCore,
    "--tys-rim-glow": PALETTE.rimGlow,
  };
}
