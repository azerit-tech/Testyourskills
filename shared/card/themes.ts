// Thèmes de rendu de la fiche (SPEC §18.18, §18.102) : la forme vient du niveau (un par
// nombre d'étoiles, plus les trois spéciales), les couleurs du coloris de la fiche
// (colorways.ts). Style mat : fonds plats teintés, UN seul dégradé par fiche (le fond
// ou le ciel), palmiers ton sur ton, aucune lueur sauf le contour éclairé de ★★★★★★.
import type { CardData, Fact, Stars, StatusTone } from "../types";
import { starsFor } from "../types";
import { COLORWAYS, colorwayOf, type Colorway, type ColorwayKey } from "./colorways";

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
  indigoLow: "#151b38",
  violet: "#3d3478",
  violetLow: "#1d1838",
  plum: "#4b2f54",
  plumLow: "#24172f",
  moss: "#162623",
  mossLow: "#0c1614",
  cold: "#2b3540",
  coldLow: "#161c23",
  /* --dusk : l'ancien dégradé de la note de ★★★★ (la note est crème partout depuis la revue, §18.48) ; teintes de la révélation */
  duskA: "#6f7cf0",
  duskB: "#b05ad8",
  duskC: "#f0589a",
  duskD: "#ffb366",
  /* Ciel de ★★★★★ d'avant les coloris (l'heure rose), repris par le coloris marine */
  roseA: "#5560cf",
  roseB: "#9150c8",
  roseC: "#e5558f",
  roseD: "#ffb366",
  duskGround: "#2a1c3c",
  /* Ciel de ★★★★★★ d'avant les coloris (l'heure bleue) */
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
} as const;

/** Arrêt de dégradé : [offset 0..1, couleur]. */
export type Stop = [number, string];

export type ThemeKey = `s${Stars}` | "wonderkid" | "flashback" | "totw";

/** Où se trouve l'unique dégradé de la fiche. */
export type GradientSlot = "bg" | "num" | "sky";

export interface CardTheme {
  key: ThemeKey;
  /** Le coloris de la fiche (§18.102). */
  colorway: ColorwayKey;
  /** Libellé du niveau ou de la spéciale (la pilule pour les spéciales). */
  label: Fact;
  /** Emplacement du seul dégradé : le fond qui descend dans son ton, la note, ou le ciel peint. */
  grad: GradientSlot;
  /** Fond : haut et bas (« bg »), ou aplat (bg[0]) quand le dégradé est ailleurs. */
  bg: [string, string];
  /** Ciel peint (★★★★★ et ★★★★★★) : quatre teintes du haut vers l'horizon, sol, soleil, fenêtres allumées. */
  sky?: { stops: [string, string, string, string]; ground: string; sun?: string; lights?: boolean };
  /** Horizon ton sur ton des niveaux sans ciel peint : silhouettes en aplat d'une
   *  teinte voisine du fond, sans sol, sans soleil ni fenêtres. Il grandit avec le
   *  niveau (hauteur des immeubles, nombre de palmiers) et reste sous le ciel de ★★★★★. */
  horizon?: { color: string; scale: number; palms: 0 | 1 | 2 | 3 };
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

/**
 * La forme d'un niveau, sans couleur : le ciel peint (heure dorée à ★★★★★, nuit à
 * ★★★★★★), l'horizon bas qui grandit, le palmier du coin, le contour, la pilule.
 * Les spéciales gardent leur pilule (et la photo grise d'Affaire classée) dans le
 * coloris de la fiche : c'est la pilule qui les dit.
 */
interface Shape {
  label: Fact;
  sky?: "dusk" | "night";
  horizon?: { scale: number; palms: 0 | 1 | 2 | 3 };
  palm: boolean;
  rim?: boolean;
  gray?: boolean;
  badge?: { bg: string; ink: string };
}

const SHAPES: Record<ThemeKey, Shape> = {
  s1: { label: { fr: "Petit délit", en: "Petty crime" }, palm: false, horizon: { scale: 0.55, palms: 0 } },
  s2: { label: { fr: "Délit", en: "Misdemeanor" }, palm: true, horizon: { scale: 0.7, palms: 1 } },
  s3: { label: { fr: "Mandat d'arrêt", en: "Warrant out" }, palm: true, horizon: { scale: 0.85, palms: 2 } },
  s4: { label: { fr: "Haute surveillance", en: "Under surveillance" }, palm: true, horizon: { scale: 1, palms: 3 } },
  s5: { label: { fr: "Menace publique", en: "Public menace" }, palm: true, sky: "dusk" },
  s6: { label: { fr: "Priorité absolue", en: "Top priority" }, palm: true, sky: "night", rim: true },
  wonderkid: { label: { fr: "Débarque en ville", en: "New in town" }, palm: true, horizon: { scale: 0.7, palms: 1 }, badge: { bg: PALETTE.lime, ink: PALETTE.ink0 } },
  flashback: { label: { fr: "Affaire classée", en: "Cold case" }, palm: true, horizon: { scale: 0.7, palms: 1 }, gray: true, badge: { bg: PALETTE.peach, ink: PALETTE.ink0 } },
  totw: { label: { fr: "Top 5 de la semaine", en: "This week's top 5" }, palm: true, horizon: { scale: 1, palms: 3 }, badge: { bg: PALETTE.cream, ink: PALETTE.ink0 } },
};

/** Le thème d'un niveau (ou d'une spéciale) dans un coloris. */
export function themeFor(key: ThemeKey, cw: Colorway = COLORWAYS.marine): CardTheme {
  const shape = SHAPES[key];
  const painted = shape.sky === "dusk" ? cw.sky5 : shape.sky === "night" ? cw.sky6 : null;
  const sky = painted
    ? { stops: painted.stops, ground: painted.ground, ...(shape.sky === "dusk" ? { sun: "#ffe0b8" } : { lights: true }) }
    : undefined;
  return {
    key,
    colorway: cw.key,
    label: shape.label,
    grad: sky ? "sky" : "bg",
    bg: sky ? [sky.ground, sky.ground] : cw.bg,
    ...(sky ? { sky } : {}),
    ...(shape.horizon && !sky ? { horizon: { color: cw.horizon, ...shape.horizon } } : {}),
    num: [],
    bar: cw.bar,
    palm: shape.palm ? (painted ? painted.palm : cw.palm) : null,
    rim: !!shape.rim,
    gray: !!shape.gray,
    ink: PALETTE.cream,
    inkSoft: cw.inkSoft,
    tones: TONES,
    buzz: PALETTE.siren,
    ...(shape.badge ? { badge: shape.badge } : {}),
    accent: shape.rim ? PALETTE.rimGlow : cw.bar,
    accent2: sky ? sky.stops[1] : cw.bg[0],
    fx: { grain: 0.12 },
  };
}

/** Les thèmes dans le coloris d'origine (marine) : aperçus et tests de forme. */
export const THEMES: Record<ThemeKey, CardTheme> = Object.fromEntries(
  (Object.keys(SHAPES) as ThemeKey[]).map((k) => [k, themeFor(k)]),
) as Record<ThemeKey, CardTheme>;

/** Thème d'une fiche : la spéciale si elle s'applique, sinon le niveau d'étoiles ; dans le coloris de la fiche. */
export function themeOf(card: Pick<CardData, "overall" | "special"> & Partial<Pick<CardData, "id" | "colorway">>): CardTheme {
  const key: ThemeKey = card.special ?? `s${starsFor(card.overall)}`;
  return themeFor(key, COLORWAYS[colorwayOf(card)]);
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
