// La couverture de l'accueil (SPEC §18.31) : la grille des cases, la lumière de
// chaque décor, et ce que chaque case montre. Sans DOM : testé tel quel.
import type { CardData, TopEntry } from "../../../shared/types";

import { SCENE_LIGHT, type Light } from "../../../shared/sceneLight";

// La lumière des décors vit dans shared/ : la poursuite (shared/chase) la lit aussi.
export { SCENE_LIGHT, type Light };

/** L'ordre de préférence des décors : les lumières alternent déjà, le picker n'a qu'à sauter. */
export const SCENE_POOL = [
  "kingpin",
  "arsonist",
  "night_owl",
  "fresh_blood",
  "mastermind",
  "forger",
  "chameleon",
  "delivery_machine",
  "ghost",
  "hoarder",
  "repeat_offender",
  "sleeper_agent",
  "old_school",
  "default",
];

export type SlotKind = "face" | "scene";

export interface Slot {
  /** Nom de la zone dans les grilles (grid-area). */
  id: string;
  kind: SlotKind;
}

export interface Layout {
  /** Les pistes des colonnes, en fr. */
  cols: number[];
  /** Les zones, une ligne de la grille par chaîne ; « . » n'est pas permis : jamais de trou. */
  rows: string[];
}

/** Les cases, dans l'ordre du document. La place libre est la dernière case de visage. */
export const SLOTS: Slot[] = [
  { id: "f1", kind: "face" },
  { id: "s1", kind: "scene" },
  { id: "f2", kind: "face" },
  { id: "s2", kind: "scene" },
  { id: "s3", kind: "scene" },
  { id: "f3", kind: "face" },
  { id: "s4", kind: "scene" },
  { id: "fr", kind: "face" },
];

/** Téléphone (jusqu'à 899 px) : cinq cases en appareil de briques. Un visage haut à
 * gauche, la place libre en haut à droite, trois décors dont les joints ne s'alignent pas. */
export const PHONE: Layout = {
  cols: [1.3, 0.95, 0.45, 0.85],
  rows: ["f1 s1 s1 fr", "f1 s2 s3 s3"],
};

/** Ordinateur (900 px et plus) : huit cases, quatre visages, aucun bloc central,
 * aucun joint vertical d'un bord à l'autre hors des visages hauts. */
export const DESKTOP: Layout = {
  cols: [2.3, 2.6, 0.4, 1.3, 0.4, 1.5, 1.5],
  rows: ["f1 s1 s1 f2 f2 s2 s2", "f1 s3 f3 f3 s4 s4 fr"],
};

const cells = (l: Layout) => l.rows.map((r) => r.split(" "));

/** Les cases présentes dans une grille. */
export const slotsIn = (l: Layout): Set<string> => new Set(cells(l).flat());

/** Les paires de cases qui se touchent par un bord dans une grille. */
export function neighbours(l: Layout): Map<string, Set<string>> {
  const g = cells(l);
  const out = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (a === b) return;
    if (!out.has(a)) out.set(a, new Set());
    if (!out.has(b)) out.set(b, new Set());
    out.get(a)!.add(b);
    out.get(b)!.add(a);
  };
  for (let r = 0; r < g.length; r++)
    for (let c = 0; c < g[r].length; c++) {
      if (c + 1 < g[r].length) link(g[r][c], g[r][c + 1]);
      if (r + 1 < g.length) link(g[r][c], g[r + 1][c]);
    }
  return out;
}

/** Les voisins d'une case, téléphone et ordinateur réunis : un décor ne partage sa lumière avec aucun. */
const NEIGHBOURS: Map<string, Set<string>> = (() => {
  const all = new Map<string, Set<string>>();
  for (const l of [PHONE, DESKTOP])
    for (const [k, v] of neighbours(l)) {
      if (!all.has(k)) all.set(k, new Set());
      for (const n of v) all.get(k)!.add(n);
    }
  return all;
})();

/** Ce que montre une case. `wait` : le top n'a pas encore répondu, la case reste prune. */
export type Panel =
  | { kind: "scene"; scene: string }
  | { kind: "suspect"; id: string }
  | { kind: "player"; entry: TopEntry }
  | { kind: "founder"; card: CardData; href: string }
  | { kind: "free" }
  | { kind: "wait" };

export interface CoverInput {
  /** Les portraits peints disponibles, dans l'ordre (lib/suspects.ts). */
  suspects: string[];
  /** Le top de la semaine ; `undefined` tant qu'il n'a pas répondu, `null` s'il n'y en a pas. */
  top: TopEntry[] | null | undefined;
  /** La fiche de Jacques et son lien. */
  founder: { card: CardData; href: string };
}

/**
 * Remplit les cases : les visages dans l'ordre suspects, top de la semaine par rang,
 * fiche de Jacques ; la dernière case de visage est toujours la place libre ; une case
 * de visage sans source devient un décor. Les décors sont choisis dans SCENE_POOL, sans
 * doublon, chacun d'une autre lumière que ses voisins déjà posés.
 */
export function coverPanels({ suspects, top, founder }: CoverInput): Map<string, Panel> {
  const faces = SLOTS.filter((s) => s.kind === "face");
  const free = faces[faces.length - 1];
  const queue: Panel[] = suspects.map((id) => ({ kind: "suspect", id }));
  const pending = top === undefined;
  if (!pending) {
    for (const entry of [...(top ?? [])].sort((a, b) => a.rank - b.rank)) queue.push({ kind: "player", entry });
    queue.push({ kind: "founder", ...founder });
  }

  const out = new Map<string, Panel>();
  for (const s of faces) {
    if (s === free) out.set(s.id, { kind: "free" });
    else {
      const next = queue.shift();
      if (next) out.set(s.id, next);
      else if (pending) out.set(s.id, { kind: "wait" });
    }
  }

  // Les décors, dans l'ordre du document : cases de décor et visages restés sans source.
  // Le décor d'un suspect affiché est déjà derrière lui : il ne revient pas dans une case voisine.
  const used = new Set<string>();
  for (const p of out.values()) if (p.kind === "suspect") used.add(p.id);
  for (const s of SLOTS) {
    if (out.has(s.id)) continue;
    const near = new Set<Light>();
    for (const n of NEIGHBOURS.get(s.id) ?? []) {
      const p = out.get(n);
      if (p?.kind === "scene") near.add(SCENE_LIGHT[p.scene]);
    }
    const scene = SCENE_POOL.find((id) => !used.has(id) && !near.has(SCENE_LIGHT[id])) ?? SCENE_POOL.find((id) => !used.has(id)) ?? "default";
    used.add(scene);
    out.set(s.id, { kind: "scene", scene });
  }
  return out;
}

/** Les cases visibles au premier rang d'une grille : leurs images ne sont pas paresseuses. */
export const firstRow = (l: Layout): Set<string> => new Set(cells(l)[0]);

/** La part de la largeur intérieure qu'occupe une case dans une grille (0 si absente). */
export function widthShare(l: Layout, id: string): number {
  const total = l.cols.reduce((a, b) => a + b, 0);
  const cols = new Set<number>();
  cells(l).forEach((r) => r.forEach((c, i) => c === id && cols.add(i)));
  let w = 0;
  for (const i of cols) w += l.cols[i];
  return w / total;
}

/** La valeur CSS de grid-template-areas d'une grille. */
export const areasCss = (l: Layout) => l.rows.map((r) => `"${r}"`).join(" ");
/** La valeur CSS de grid-template-columns d'une grille. */
export const colsCss = (l: Layout) => l.cols.map((c) => `minmax(0, ${c}fr)`).join(" ");

/** Un avatar GitHub en 280 px plutôt qu'en vignette ; les autres adresses ne changent pas. */
export function bigAvatar(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, "https://local.invalid");
    if (u.hostname === "avatars.githubusercontent.com") {
      u.searchParams.set("s", "280");
      return u.toString();
    }
    if (u.hostname === "github.com" && u.pathname.endsWith(".png")) {
      u.searchParams.set("size", "280");
      return u.toString();
    }
  } catch {
    /* adresse illisible : telle quelle */
  }
  return url;
}
