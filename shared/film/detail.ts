// Le détail de la note pendant le film (SPEC §18.95) : les critères de la
// grille de recrutement tombent un par un pendant que la berline roule, chacun
// avec sa note sur 10, et s'empilent en un relevé court à gauche, sous le score.
// Au gel, on a vu de quoi la note est faite. Pur, sans DOM : le plan dit quels
// critères et à quelle image, le HUD (hud.ts) dit où en est chacun.
//
// Ce qui passe : les critères qui font la moyenne ou pourraient la faire, dans
// la tournure du dos de la fiche (shared/card/CardBack.tsx, backCriteria) :
// une note, ou « non prouvé », « pas au dossier », jamais 0 à la place. L'école
// ne montre jamais de chiffre (§18.52) : « comptée » quand elle compte, rien
// sinon. L'expérience ne pèse plus depuis 0.5.0 (§18.84) : elle n'y est pas
// (une grille d'avant, où elle pesait, la garde). Une note hors moyenne
// (l'open source sous la moyenne des autres) se lit en retrait.
//
// L'ordre monte : d'abord ce qui manque, puis les notes de la plus basse à la
// plus haute, la plus lourde en dernier à égalité. Le relevé finit sur le
// point fort, juste avant le gel : la tension monte avec la route.
import { excludedWhy, schoolState, usableGrid, weightsOf } from "../gridText";
import { RECRUITER_ORDER } from "../recruiterLine";
import type { CriterionCode, Grid } from "../types";
import { DETAIL_GAP, DETAIL_OPEN, DETAIL_POST, DETAIL_PRE, DETAIL_TAIL, STAR_LAND } from "./cut";

/**
 * Ce qu'un critère montre : sa note (`note`), ou un état sans chiffre : « non prouvé »,
 * « pas au dossier », l'école « comptée ».
 */
export type DetailKind = "note" | "unproven" | "missing" | "counted";

export interface DetailRow {
  code: CriterionCode;
  kind: DetailKind;
  /** La note sur 10, seulement pour `note`. */
  score: number | null;
  /** Noté, mais hors de la moyenne : la note se lit en retrait. */
  out: boolean;
}

/** Un critère du film : sa ligne et l'image où il tombe. */
export interface FilmDetailBeat extends DetailRow {
  frame: number;
}

const RANK: Record<DetailKind, number> = { missing: 0, unproven: 1, counted: 2, note: 3 };

/** Les critères du relevé, dans l'ordre où ils tombent. Sans grille utilisable : aucun (le film d'avant). */
export function detailRows(grid: Grid | undefined | null): DetailRow[] {
  if (!usableGrid(grid)) return [];
  const W = weightsOf(grid);
  const empty = grid.rule === "empty_file";
  const byCode = new Map(grid.criteria.map((c) => [c.code, c]));
  const rows: DetailRow[] = [];
  for (const code of RECRUITER_ORDER) {
    const c = byCode.get(code);
    if (!c) continue;
    if (code === "EDU") {
      // l'école : « comptée », jamais un chiffre ; hors moyenne, elle ne bâtit pas la note et ne passe pas
      if (schoolState(c) === "counted" && !empty) rows.push({ code, kind: "counted", score: null, out: false });
      continue;
    }
    if (!(W[code] > 0) || c.private) continue;
    const why = excludedWhy(c);
    if (why === "missing" || why === "unproven") rows.push({ code, kind: why, score: null, out: false });
    else if (c.score !== null) rows.push({ code, kind: "note", score: c.score, out: empty || !c.counted });
  }
  const order = (r: DetailRow) => RECRUITER_ORDER.indexOf(r.code);
  return rows.sort(
    (a, b) =>
      RANK[a.kind] - RANK[b.kind] ||
      (a.score ?? 0) - (b.score ?? 0) ||
      // à note égale : la note hors moyenne d'abord, puis la plus légère ; la plus lourde ferme le relevé
      Number(b.out) - Number(a.out) ||
      W[a.code] - W[b.code] ||
      order(a) - order(b),
  );
}

/** Les plages où rien ne tombe : de DETAIL_PRE images avant le coup d'une étoile à DETAIL_POST images après qu'elle s'est posée. */
export function stampZones(starFrames: readonly number[]): [number, number][] {
  return starFrames.map((f) => [f - DETAIL_PRE, f + STAR_LAND + DETAIL_POST]);
}

/**
 * Le temps libre du film joué, en plages [a, b) triées : de DETAIL_OPEN à DETAIL_TAIL images avant le gel, moins les
 * plages des étoiles. Les plages trop courtes pour un critère (moins de DETAIL_GAP images) ne comptent pas.
 */
export function freeSpans(starFrames: readonly number[], freeze: number): [number, number][] {
  let free: [number, number][] = [[DETAIL_OPEN, freeze - DETAIL_TAIL + 1]];
  for (const [za, zb] of stampZones(starFrames)) {
    free = free.flatMap(([a, b]): [number, number][] => {
      if (zb <= a || za >= b) return [[a, b]];
      const parts: [number, number][] = [
        [a, Math.min(b, za)],
        [Math.max(a, zb), b],
      ];
      return parts.filter(([x, y]) => y > x);
    });
  }
  return free.filter(([a, b]) => b - a >= DETAIL_GAP);
}

/**
 * Les images où tombent `n` critères, dans les creux du film joué (`freeSpans`) : un critère par creux d'abord, du
 * plus long au plus court, pour qu'aucun creux entre deux étoiles ne reste vide ; le reste va aux creux les plus
 * longs (à la plus forte moyenne : longueur ÷ (critères + 1)). Dans un creux, les critères se partagent la plage à
 * parts égales. Un film court les serre (huit images d'écart à une étoile, pour sept critères), jamais à moins de
 * DETAIL_GAP images.
 */
export function detailFrames(n: number, starFrames: readonly number[], freeze: number): number[] {
  if (n <= 0) return [];
  const spans = freeSpans(starFrames, freeze);
  const free = spans.length ? spans : ([[DETAIL_OPEN, Math.max(DETAIL_OPEN + 1, freeze - DETAIL_TAIL + 1)]] as [number, number][]);
  const len = (i: number) => free[i][1] - free[i][0];
  const count = free.map(() => 0);
  let left = n;
  for (const i of free.map((_, i) => i).sort((i, j) => len(j) - len(i) || i - j)) {
    if (!left) break;
    count[i]++;
    left--;
  }
  for (; left > 0; left--) {
    let best = 0;
    for (let i = 1; i < free.length; i++) if (len(i) / (count[i] + 1) > len(best) / (count[best] + 1)) best = i;
    count[best]++;
  }
  return free.flatMap(([a, b], i) => Array.from({ length: count[i] }, (_, j) => a + Math.floor(((b - a) * (j + 0.5)) / count[i])));
}

/** Le relevé d'une fiche, calé sur son film : chaque critère et son image. */
export function filmDetail(grid: Grid | undefined | null, starFrames: readonly number[], freeze: number): FilmDetailBeat[] {
  const rows = detailRows(grid);
  const frames = detailFrames(rows.length, starFrames, freeze);
  return rows.map((r, i) => ({ ...r, frame: frames[i] }));
}
