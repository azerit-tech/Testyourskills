// La couverture de l'accueil (SPEC §18.31) : la grille des cases, la lumière de
// chaque décor, et ce que chaque case montre. Sans DOM : testé tel quel.
import type { CardData, TopEntry } from "../../../shared/types";

/** Les quatre lumières des décors et celle de chaque lieu du crime : une seule liste, partagée avec le serveur. */
import { SCENE_LIGHT, type Light } from "../../../shared/scenes";
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

/** Les cases de décor qui prennent un suspect peint, dans l'ordre : assez hautes pour un
 * portrait 2:3 (s2 : 90 × 105 px à 390 sur téléphone ; s4 : 200 × 255 px sur ordinateur),
 * hors de la grande case du premier rang. Les visages restent au top de la semaine. */
export const SUSPECT_SLOTS = ["s2", "s4"];

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
  /** La graine de la visite (pickSeed) : elle tire la distribution des suspects. 0 par défaut. */
  seed?: number;
}

/** La lumière d'une case : celle de son décor, ou celle du décor peint derrière un suspect. */
export function lightOf(p: Panel | undefined): Light | undefined {
  if (p?.kind === "scene") return SCENE_LIGHT[p.scene];
  if (p?.kind === "suspect") return SCENE_LIGHT[p.id];
  return undefined;
}

/** Les cases où un portrait peut se poser : la grande case, puis SUSPECT_SLOTS ; f3 en
 * plus quand le top la laisse vide. */
export const CAST_SLOTS = ["f1", ...SUSPECT_SLOTS];
const ANY_SLOT = [...CAST_SLOTS, "f3"];

/**
 * Où chaque portrait tient sans perdre son visage ni son objet, vu à l'écran à 390, 360
 * et 1440 px. f1 est haute (le portrait entier, les côtés rognés), s4 et f3 presque au
 * format ; s2 est large sur ordinateur (310 × 255 px) : on n'y voit que le haut du
 * portrait, jusqu'à 60 % de sa hauteur. Un suspect absent de la table tient partout.
 */
export const SUSPECT_FIT: Record<string, readonly string[]> = {
  arsonist: ANY_SLOT,
  forger: ANY_SLOT,
  kingpin: ANY_SLOT,
  mastermind: ANY_SLOT,
  night_owl: ANY_SLOT,
  // la valise est au bas de l'image : coupée dans s2
  fresh_blood: ["f1", "s4", "f3"],
};
export const fits = (id: string, slot: string) => (SUSPECT_FIT[id] ?? ANY_SLOT).includes(slot);

/** Deux cases voisines déjà posées ont-elles la même lumière ? */
function clash(out: Map<string, Panel>): boolean {
  for (const [a, ns] of NEIGHBOURS) {
    const la = lightOf(out.get(a));
    if (la) for (const b of ns) if (lightOf(out.get(b)) === la) return true;
  }
  return false;
}

/** Les décors déjà pris : ceux posés, et celui derrière chaque suspect affiché. */
function usedScenes(out: Map<string, Panel>): Set<string> {
  const used = new Set<string>();
  for (const p of out.values()) if (p.kind === "suspect") used.add(p.id);
  else if (p.kind === "scene") used.add(p.scene);
  return used;
}

/**
 * Pose un décor dans chaque case encore vide, dans l'ordre du document : sans doublon,
 * jamais le décor d'un suspect affiché, chacun d'une autre lumière que tous ses voisins,
 * suspects compris. Cherche en profondeur dans l'ordre de SCENE_POOL (le premier choix
 * reste le préféré) ; rend false, sans rien poser, s'il n'y a pas de solution.
 */
function placeScenes(out: Map<string, Panel>): boolean {
  const open = SLOTS.map((s) => s.id).filter((id) => !out.has(id));
  const used = usedScenes(out);
  const go = (i: number): boolean => {
    if (i === open.length) return true;
    const id = open[i];
    const near = new Set<Light>();
    for (const n of NEIGHBOURS.get(id) ?? []) {
      const l = lightOf(out.get(n));
      if (l) near.add(l);
    }
    for (const scene of SCENE_POOL) {
      if (used.has(scene) || near.has(SCENE_LIGHT[scene])) continue;
      used.add(scene);
      out.set(id, { kind: "scene", scene });
      if (go(i + 1)) return true;
      used.delete(scene);
      out.delete(id);
    }
    return false;
  };
  return go(0);
}

/** Repli, pour une liste de suspects que la règle ne permet pas : un décor par case, la lumière évitée si possible. */
function placeScenesLoosely(out: Map<string, Panel>): void {
  const used = usedScenes(out);
  for (const s of SLOTS) {
    if (out.has(s.id)) continue;
    const near = new Set<Light>();
    for (const n of NEIGHBOURS.get(s.id) ?? []) {
      const l = lightOf(out.get(n));
      if (l) near.add(l);
    }
    const scene = SCENE_POOL.find((id) => !used.has(id) && !near.has(SCENE_LIGHT[id])) ?? SCENE_POOL.find((id) => !used.has(id)) ?? "default";
    used.add(scene);
    out.set(s.id, { kind: "scene", scene });
  }
}

/** Une distribution : le suspect de chaque case de CAST_SLOTS (absent : un décor). */
export type Cast = Partial<Record<string, string>>;

/** Une case sans lumière, pour essayer une distribution : un joueur du top ou la fiche de Jacques. */
const FACE_PROBE: Panel = { kind: "free" };

/** La couverture d'une distribution, top présent (f2 et f3 sans lumière), décors posés ; null si la règle ne tient pas. */
function staged(cast: Cast): Map<string, Panel> | null {
  const out = new Map<string, Panel>([
    ["f1", FACE_PROBE],
    ["f2", FACE_PROBE],
    ["f3", FACE_PROBE],
    ["fr", FACE_PROBE],
  ]);
  for (const slot of CAST_SLOTS) if (cast[slot]) out.set(slot, { kind: "suspect", id: cast[slot]! });
  if (clash(out) || !placeScenes(out)) return null;
  return out;
}

/** Toutes les distributions permises : les cases de CAST_SLOTS remplies autant que possible, chaque portrait dans une case où il tient. */
function allCasts(suspects: string[]): Cast[] {
  const out: Cast[] = [];
  const walk = (i: number, cast: Cast, taken: Set<string>) => {
    if (i === CAST_SLOTS.length) {
      if (staged(cast)) out.push({ ...cast });
      return;
    }
    const slot = CAST_SLOTS[i];
    let any = false;
    for (const id of suspects)
      if (!taken.has(id) && fits(id, slot)) {
        any = true;
        taken.add(id);
        walk(i + 1, { ...cast, [slot]: id }, taken);
        taken.delete(id);
      }
    // la grande case et s2 (les deux du téléphone) ne restent en décor que faute de suspect ;
    // s4 peut garder un décor, ce qui laisse l'équilibre se faire
    if (!any || slot === "s4") walk(i + 1, cast, taken);
  };
  walk(0, {}, new Set());
  // une case vide n'est permise que si aucune distribution ne la remplit
  const full = Math.max(0, ...out.map((c) => CAST_SLOTS.filter((s) => s !== "s4" && c[s]).length));
  return out.filter((c) => CAST_SLOTS.filter((s) => s !== "s4" && c[s]).length === full);
}

/** La longueur du cycle des distributions ; une graine choisit sa place dans le cycle. */
export const ROTATION_LENGTH = 60;
/** Ce que coûte une case s4 en décor dans l'équilibre : l'ordinateur garde trois portraits le plus souvent. */
const EMPTY_S4 = 1.5;

/**
 * Le cycle des distributions, construit une fois par liste de suspects : à chaque pas,
 * celle qui garde le mieux l'égalité, chaque portrait autant vu sur téléphone (f1, s2)
 * que sur ordinateur (f1, s2, s4), et dans chaque case où il tient. Égalité exacte
 * impossible : `fresh_blood` ne tient ni dans s2, ni dans s4 (son décor, seule aube, part
 * avec elle, et s1 et s3 n'ont plus deux lumières libres) ; seule la grande case lui va.
 */
function buildRotation(suspects: string[]): Cast[] {
  const casts = allCasts(suspects);
  if (casts.length <= 1) return casts.length ? [casts[0]] : [{}];
  const phone = new Map<string, number>();
  const desk = new Map<string, number>();
  const tile = new Map<string, number>();
  const inPhone = (c: Cast, id: string) => (c.f1 === id || c.s2 === id ? 1 : 0);
  const inDesk = (c: Cast, id: string) => (CAST_SLOTS.some((s) => c[s] === id) ? 1 : 0);
  const spread = (m: Map<string, number>, c: Cast, f: (c: Cast, id: string) => number) => {
    const v = suspects.map((id) => (m.get(id) ?? 0) + f(c, id));
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    return v.reduce((a, b) => a + (b - mean) ** 2, 0);
  };
  const out: Cast[] = [];
  for (let k = 0; k < ROTATION_LENGTH; k++) {
    let best = casts[0];
    let bestScore = Infinity;
    for (const c of casts) {
      let t = 0;
      for (const s of CAST_SLOTS) if (c[s]) t += (tile.get(`${c[s]}|${s}`) ?? 0) + 1;
      // l'écart à l'égalité, téléphone et ordinateur ; puis la variété des cases ; jamais deux fois de suite la même
      const repeat = out.length > 0 && sameCast(out[out.length - 1], c) ? 1 : 0;
      const score = spread(phone, c, inPhone) + spread(desk, c, inDesk) + 0.05 * t + (c.s4 ? 0 : EMPTY_S4) + repeat;
      if (score < bestScore - 1e-9) {
        best = c;
        bestScore = score;
      }
    }
    out.push(best);
    for (const id of suspects) {
      phone.set(id, (phone.get(id) ?? 0) + inPhone(best, id));
      desk.set(id, (desk.get(id) ?? 0) + inDesk(best, id));
    }
    for (const s of CAST_SLOTS) if (best[s]) tile.set(`${best[s]}|${s}`, (tile.get(`${best[s]}|${s}`) ?? 0) + 1);
  }
  return out;
}

const sameCast = (a: Cast, b: Cast) => CAST_SLOTS.every((s) => a[s] === b[s]);

const ROTATIONS = new Map<string, Cast[]>();
/** Le cycle des distributions d'une liste de suspects (mis en cache). */
export function rotation(suspects: string[]): Cast[] {
  const key = suspects.join(",");
  if (!ROTATIONS.has(key)) ROTATIONS.set(key, buildRotation(suspects));
  return ROTATIONS.get(key)!;
}

/** La distribution d'une graine : sa place dans le cycle. */
export function castFor(suspects: string[], seed: number): Cast {
  const r = rotation(suspects);
  return r[((Math.trunc(seed) % r.length) + r.length) % r.length];
}

/**
 * Remplit les cases. La graine tire la distribution des suspects (castFor) : un dans la
 * grande case de gauche, puis SUSPECT_SLOTS. Les autres visages : le top de la semaine
 * par rang, puis la fiche de Jacques, puis, s'il en reste, un suspect de plus dans f3 ;
 * la dernière case de visage est toujours la place libre. Les décors remplissent le
 * reste (placeScenes). Les cases des suspects et les décors ne changent pas quand le
 * top arrive. Même graine, même couverture.
 */
export function coverPanels({ suspects, top, founder, seed = 0 }: CoverInput): Map<string, Panel> {
  const faces = SLOTS.filter((s) => s.kind === "face");
  const free = faces[faces.length - 1];
  const people: Panel[] = [];
  const pending = top === undefined;
  if (!pending) {
    for (const entry of [...(top ?? [])].sort((a, b) => a.rank - b.rank)) people.push({ kind: "player", entry });
    people.push({ kind: "founder", ...founder });
  }

  const cast = castFor(suspects, seed);
  const out = staged(cast) ?? new Map<string, Panel>();
  for (const id of ["f1", "f2", "f3", "fr"]) if (out.get(id) === FACE_PROBE) out.delete(id);
  out.set(free.id, { kind: "free" });
  const [lead, ...others] = faces.filter((s) => s !== free);
  if (!cast[lead.id]) {
    const first = people.shift();
    if (first) out.set(lead.id, first);
    else if (pending) out.set(lead.id, { kind: "wait" });
  }
  const shown = new Set(Object.values(cast));
  for (const s of others) {
    const next = people.shift();
    if (next) out.set(s.id, next);
    else if (pending) out.set(s.id, { kind: "wait" });
    else {
      // un visage resté vide : un suspect de plus s'il tient là sans rien déranger, sinon un décor
      const extra = suspects.filter((id) => !shown.has(id) && fits(id, s.id) && !usedScenes(out).has(id));
      const k = Math.floor(Math.abs(Math.trunc(seed)) / ROTATION_LENGTH);
      for (let i = 0; i < extra.length; i++) {
        const id = extra[(k + i) % extra.length];
        out.set(s.id, { kind: "suspect", id });
        if (!clash(out)) {
          shown.add(id);
          break;
        }
        out.delete(s.id);
      }
    }
  }
  // les décors des cases restées vides ; si la règle ne tient plus, tous les décors à nouveau
  if (!placeScenes(out)) {
    for (const [id, p] of out) if (p.kind === "scene") out.delete(id);
    if (!placeScenes(out)) placeScenesLoosely(out);
  }
  return out;
}

/** Une graine pour la visite : `?cover=<n>` en développement et en démo, sinon tirée au chargement de la page. */
export function pickSeed(search: string, allowQuery: boolean, random: () => number = Math.random): number {
  if (allowQuery) {
    const q = new URLSearchParams(search).get("cover");
    if (q !== null && /^\d{1,9}$/.test(q)) return Number(q);
  }
  return Math.floor(random() * ROTATION_LENGTH * 1000);
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
