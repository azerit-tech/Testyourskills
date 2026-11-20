// Les coloris de la fiche (SPEC §18.102) : douze teintes mates, tirées au hasard à la
// naissance de la fiche et rangées avec elle (`colorway`), pour qu'un fil, un classement
// ou une galerie ne montrent pas douze fois la même fiche marine. Le niveau ne se lit plus
// à la couleur : les étoiles, l'horizon qui grandit, le ciel peint de ★★★★★ et ★★★★★★ et
// le contour éclairé de ★★★★★★ le disent, dans chaque coloris.
//
// Chaque coloris donne : le fond qui descend dans son ton (★ à ★★★★ et spéciales), la
// teinte des silhouettes ton sur ton, le palmier du coin, l'encre douce et les barres, et
// les deux ciels peints (l'heure dorée de ★★★★★, la nuit de ★★★★★★) avec leur sol.
// Valeurs tirées en OKLCH à clarté égale (fond 0,40 → 0,235, ciels 0,50 / 0,22), puis
// ajustées à l'œil sur planche (`npx tsx scripts/render-fixtures.ts --coloris`) ; le crème
// garde au moins 7:1 sur chaque fond, et deux coloris ne se confondent pas (colorways.test.ts).
// La marine garde les ciels d'avant les coloris (l'heure rose, l'heure bleue).
import type { CardData, Fact } from "../types";

export interface Colorway {
  key: ColorwayKey;
  label: Fact;
  /** Fond des niveaux sans ciel peint : haut, bas (le seul dégradé de la fiche). */
  bg: [string, string];
  /** Silhouettes ton sur ton de l'horizon bas : un cran plus clair que le fond à la ligne d'horizon. */
  horizon: string;
  /** Palmier du coin bas droit, sur le fond. */
  palm: string;
  /** Encre douce (étiquettes, phrase du profil, pied), une crème teintée du coloris. */
  inkSoft: string;
  /** Barres des traits. */
  bar: string;
  /** Ciel de ★★★★★ : quatre teintes du haut vers l'horizon, le sol, le palmier du coin. */
  sky5: { stops: [string, string, string, string]; ground: string; palm: string };
  /** Ciel de ★★★★★★ (la nuit, fenêtres allumées), même forme. */
  sky6: { stops: [string, string, string, string]; ground: string; palm: string };
}

export const COLORWAY_KEYS = ["corail", "mandarine", "moutarde", "olive", "menthe", "sarcelle", "cyan", "cobalt", "lavande", "prune", "magenta", "marine"] as const;

export type ColorwayKey = (typeof COLORWAY_KEYS)[number];

/** Le coloris d'une fiche sans id (aperçus de niveau, tests) : la marine d'origine. */
export const DEFAULT_COLORWAY: ColorwayKey = "marine";

export const COLORWAYS: Record<ColorwayKey, Colorway> = {
  // @coloris-debut
  corail: {
    key: "corail",
    label: { fr: "Corail", en: "Coral" },
    bg: ["#7f2021", "#400004"],
    horizon: "#762221",
    palm: "#641617",
    inkSoft: "#fee9e7",
    bar: "#feb5ae",
    sky5: { stops: ["#ac3031", "#b93665", "#e26fbd", "#ffc98b"], ground: "#3f1917", palm: "#4a2321" },
    sky6: { stops: ["#370406", "#8c1c48", "#af4790", "#ff6a3d"], ground: "#250a09", palm: "#321312" },
  },
  mandarine: {
    key: "mandarine",
    label: { fr: "Mandarine", en: "Tangerine" },
    bg: ["#723302", "#341300"],
    horizon: "#6d2f00",
    palm: "#592601",
    inkSoft: "#feeadf",
    bar: "#feb992",
    sky5: { stops: ["#9c4700", "#9b5f02", "#c59707", "#ffc98b"], ground: "#3d1c08", palm: "#482612" },
    sky6: { stops: ["#2f1100", "#714401", "#926e02", "#ff6a3d"], ground: "#230d02", palm: "#301606" },
  },
  moutarde: {
    key: "moutarde",
    label: { fr: "Moutarde", en: "Mustard" },
    bg: ["#5f4202", "#2a1b00"],
    horizon: "#593e03",
    palm: "#493200",
    inkSoft: "#fbedd5",
    bar: "#edc47d",
    sky5: { stops: ["#815b04", "#ab5202", "#f66c69", "#ffc98b"], ground: "#352300", palm: "#402c05" },
    sky6: { stops: ["#261800", "#7d3a01", "#c04444", "#ff6a3d"], ground: "#1d1100", palm: "#2a1b00" },
  },
  olive: {
    key: "olive",
    label: { fr: "Olive", en: "Olive" },
    bg: ["#424e08", "#1b2200"],
    horizon: "#3e4a0f",
    palm: "#323c03",
    inkSoft: "#ebf2d9",
    bar: "#c2d58a",
    sky5: { stops: ["#5b6c02", "#7c7004", "#c89509", "#e6d675"], ground: "#232a03", palm: "#2c350e" },
    sky6: { stops: ["#181e00", "#5a5100", "#946d03", "#ff6a3d"], ground: "#111600", palm: "#1b2103" },
  },
  menthe: {
    key: "menthe",
    label: { fr: "Menthe", en: "Mint" },
    bg: ["#02572f", "#012612"],
    horizon: "#0a512d",
    palm: "#004323",
    inkSoft: "#ddf6e4",
    bar: "#95deae",
    sky5: { stops: ["#057743", "#068076", "#0eb1cd", "#ffc98b"], ground: "#062f19", palm: "#123923" },
    sky6: { stops: ["#00220f", "#065d55", "#058298", "#ff6a3d"], ground: "#01190a", palm: "#062513" },
  },
  sarcelle: {
    key: "sarcelle",
    label: { fr: "Sarcelle", en: "Teal" },
    bg: ["#035350", "#012422"],
    horizon: "#044f4b",
    palm: "#03403d",
    inkSoft: "#d5f7f4",
    bar: "#74e0d9",
    sky5: { stops: ["#02736e", "#077c91", "#02a9f7", "#ffc98b"], ground: "#012d2b", palm: "#033936" },
    sky6: { stops: ["#00201e", "#005a6a", "#017cb7", "#ff6a3d"], ground: "#001817", palm: "#012422" },
  },
  cyan: {
    key: "cyan",
    label: { fr: "Cyan", en: "Cyan" },
    bg: ["#044f69", "#002230"],
    horizon: "#024b64",
    palm: "#033c52",
    inkSoft: "#dcf3ff",
    bar: "#84d7fe",
    sky5: { stops: ["#066d90", "#106dce", "#8d90ff", "#ffc98b"], ground: "#002b3c", palm: "#033549" },
    sky6: { stops: ["#001e2b", "#024e9a", "#6565cf", "#ff6a3d"], ground: "#001721", palm: "#01222f" },
  },
  cobalt: {
    key: "cobalt",
    label: { fr: "Cobalt", en: "Cobalt" },
    bg: ["#144097", "#001750"],
    horizon: "#173e8a",
    palm: "#0d3077",
    inkSoft: "#e6efff",
    bar: "#afcbfe",
    sky5: { stops: ["#2c5dbd", "#0676ae", "#0eb0d1", "#ffc98b"], ground: "#162644", palm: "#1f304f" },
    sky6: { stops: ["#05173f", "#015580", "#03829b", "#ff6a3d"], ground: "#081328", palm: "#111d36" },
  },
  lavande: {
    key: "lavande",
    label: { fr: "Lavande", en: "Lavender" },
    bg: ["#4b3586", "#210f47"],
    horizon: "#47347c",
    palm: "#3a276a",
    inkSoft: "#eeecfe",
    bar: "#cbc1ff",
    sky5: { stops: ["#684bb5", "#9547ae", "#e36ebc", "#ffc98b"], ground: "#272041", palm: "#312a4c" },
    sky6: { stops: ["#1d103c", "#6f2d85", "#b0478e", "#ff6a3d"], ground: "#140f26", palm: "#1f1934" },
  },
  prune: {
    key: "prune",
    label: { fr: "Prune", en: "Plum" },
    bg: ["#62306a", "#2f0c34"],
    horizon: "#5c2f63",
    palm: "#4c2353",
    inkSoft: "#fae7fd",
    bar: "#eab5f2",
    sky5: { stops: ["#8b3c98", "#b03a81", "#f46a82", "#ffc98b"], ground: "#341c38", palm: "#3e2542" },
    sky6: { stops: ["#2b0930", "#85205f", "#bf425b", "#ff6a3d"], ground: "#1d0c20", palm: "#29152c" },
  },
  magenta: {
    key: "magenta",
    label: { fr: "Magenta", en: "Magenta" },
    bg: ["#7a1b52", "#3c0024"],
    horizon: "#711e4d",
    palm: "#60123f",
    inkSoft: "#ffe7f1",
    bar: "#fdb0d4",
    sky5: { stops: ["#a13170", "#bb3658", "#f66e5c", "#ffc98b"], ground: "#3b192a", palm: "#472335" },
    sky6: { stops: ["#330520", "#8e1b3d", "#c04637", "#ff6a3d"], ground: "#220a17", palm: "#2f1321" },
  },
  marine: {
    key: "marine",
    label: { fr: "Marine", en: "Navy" },
    bg: ["#2e3a64", "#141c38"],
    horizon: "#364168",
    palm: "#2a3458",
    inkSoft: "#e8eeff",
    bar: "#b6c9fe",
    sky5: { stops: ["#5560cf", "#9150c8", "#e5558f", "#ffb366"], ground: "#2a1c3c", palm: "#35244a" },
    sky6: { stops: ["#191b45", "#3d42a8", "#9a4aa8", "#ff6a3d"], ground: "#12132e", palm: "#1b1c3e" },
  },
  // @coloris-fin
};

export function isColorway(x: unknown): x is ColorwayKey {
  return typeof x === "string" && (COLORWAY_KEYS as readonly string[]).includes(x);
}

/** FNV-1a 32 bits : le même id donne toujours le même coloris, au navigateur comme au serveur. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Le coloris tiré de l'id : celui des fiches nées avant les coloris. */
export function colorwayFromId(id: string): ColorwayKey {
  return COLORWAY_KEYS[hash(id) % COLORWAY_KEYS.length]!;
}

/** Le coloris d'une fiche : celui rangé à sa naissance, sinon celui de son id, sinon la marine. */
export function colorwayOf(card: { id?: string; colorway?: string }): ColorwayKey {
  if (isColorway(card.colorway)) return card.colorway;
  return card.id ? colorwayFromId(card.id) : DEFAULT_COLORWAY;
}

/** Un coloris au hasard, pour une fiche qui naît. `rand` : un entier dans [0, n). */
export function randomColorway(rand: (n: number) => number = (n) => Math.floor(Math.random() * n)): ColorwayKey {
  return COLORWAY_KEYS[rand(COLORWAY_KEYS.length)]!;
}

export type WithColorway = Pick<CardData, "id" | "colorway">;
