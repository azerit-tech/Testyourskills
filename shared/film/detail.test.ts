// Le détail de la note pendant le film (SPEC §18.95) : quels critères, dans quel
// ordre, à quelles images. Jamais pendant une étoile, tous avant le gel, à
// chaque niveau ; jamais un 0 à la place d'un « non prouvé » ; l'école sans
// chiffre ; une fiche sans grille garde le film d'avant.
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../fixtures";
import { GRID_WEIGHTS } from "../gridText";
import type { CardData, CriterionCode, Grid, GridCriterion, Stars } from "../types";
import {
  DETAIL_COUNT,
  DETAIL_GAP,
  DETAIL_HIT,
  DETAIL_OPEN,
  DETAIL_POST,
  DETAIL_PRE,
  DETAIL_TAIL,
  FPS,
  STAR_FRAMES,
  STAR_LAND,
  detailFrames,
  detailRows,
  filmPlan,
  freeSpans,
  hudAt,
} from "./index";

const LEVELS: Stars[] = [1, 2, 3, 4, 5, 6];
const FREEZE: Record<Stars, number> = { 1: 107, 2: 214, 3: 317, 4: 425, 5: 485, 6: 719 };
const OVERALL: Record<Stars, number> = { 1: 20, 2: 38, 3: 52, 4: 66, 5: 80, 6: 93 };
const at = (frame: number) => (frame + 0.5) / FPS;

const crit = (code: CriterionCode, score: number | null, more: Partial<GridCriterion> = {}): GridCriterion => ({
  code,
  score,
  state: score === null ? "unproven" : "scored",
  counted: score !== null && code !== "XP",
  source: "github",
  reached: { fr: "", en: "" },
  flags: [],
  ...more,
});

/** Une grille 0.5.0 complète : l'école comptée, l'expérience qui ne pèse pas, l'open source sous la moyenne. */
const FULL: Grid = {
  criteria: [
    crit("EDU", 8, { source: "linkedin" }),
    crit("XP", 6),
    crit("EMP", 7, { source: "linkedin" }),
    crit("STK", 6),
    crit("CODE", 8),
    crit("ACT", 4),
    crit("OWN", 6),
    crit("OSS", 2, { counted: false }),
  ],
  overall: 66,
  weights: { ...GRID_WEIGHTS },
};

const cardAt = (n: Stars, grid: Grid | null = FULL): CardData => ({ ...FIXTURES.silver, id: `d${n}`, overall: OVERALL[n], ...(grid ? { grid: { ...grid, overall: OVERALL[n] } } : { grid: undefined }) });

describe("le relevé : quels critères, dans quel ordre", () => {
  it("monte de la note la plus basse à la plus haute, la plus lourde ferme le relevé ; ni l'expérience (0.5.0) ni chiffre d'école", () => {
    const rows = detailRows(FULL);
    expect(rows.map((r) => r.code)).toEqual(["EDU", "OSS", "ACT", "STK", "OWN", "EMP", "CODE"]);
    expect(rows[0]).toEqual({ code: "EDU", kind: "counted", score: null, out: false });
    expect(rows.find((r) => r.code === "OSS")).toMatchObject({ kind: "note", score: 2, out: true });
    expect(rows.filter((r) => r.kind === "note").map((r) => r.score)).toEqual([2, 4, 6, 6, 7, 8]);
  });

  it("ce qui manque passe d'abord, tel quel : « pas au dossier », « non prouvé », jamais 0", () => {
    const grid: Grid = {
      ...FULL,
      criteria: [crit("EDU", null, { state: "missing" }), crit("XP", 4), crit("EMP", null, { state: "missing" }), crit("STK", 2), crit("CODE", null), crit("ACT", null), crit("OWN", null), crit("OSS", null)],
      overall: 20,
      rule: "empty_file",
    };
    const rows = detailRows(grid);
    expect(rows.map((r) => `${r.code}:${r.kind}`)).toEqual(["EMP:missing", "OSS:unproven", "ACT:unproven", "OWN:unproven", "CODE:unproven", "STK:note"]);
    for (const r of rows) if (r.kind !== "note") expect(r.score).toBeNull();
    // dossier vide : la seule note ne fait pas la moyenne (la note plancher, 20)
    expect(rows[rows.length - 1]).toMatchObject({ score: 2, out: true });
  });

  it("l'école hors moyenne, ou gardée pour la personne, ne passe pas ; une grille d'avant (0.4.0) garde l'expérience, qui pesait", () => {
    const hidden: Grid = { ...FULL, criteria: FULL.criteria.map((c) => (c.code === "EDU" ? { ...c, counted: false } : c)) };
    expect(detailRows(hidden).map((r) => r.code)).not.toContain("EDU");
    const kept: Grid = { ...FULL, criteria: FULL.criteria.map((c) => (c.code === "EDU" ? { ...c, score: null, counted: false, private: true } : c)) };
    expect(detailRows(kept).map((r) => r.code)).not.toContain("EDU");
    const legacy: Grid = { ...FULL, weights: undefined, criteria: FULL.criteria.map((c) => (c.code === "XP" ? { ...c, counted: true } : c)) };
    expect(detailRows(legacy).find((r) => r.code === "XP")).toMatchObject({ kind: "note", score: 6, out: false });
  });

  it("sans grille (une fiche d'avant, une fiche dénoncée pas reprise) : aucun, le film d'avant", () => {
    expect(detailRows(undefined)).toEqual([]);
    expect(detailRows({ criteria: [], overall: 40 })).toEqual([]);
    const p = filmPlan(cardAt(3, null));
    expect(p.detail).toEqual([]);
    expect(hudAt(p, at(200), "fr").detail).toEqual([]);
  });
});

describe("le relevé : à quelles images (chaque niveau)", () => {
  for (const level of LEVELS) {
    const stars = STAR_FRAMES.slice(0, level);
    const freeze = FREEZE[level];
    for (let n = 1; n <= 7; n++) {
      it(`${level} étoile${level > 1 ? "s" : ""}, ${n} critère${n > 1 ? "s" : ""} : jamais pendant une étoile, tous avant le gel, espacés`, () => {
        const frames = detailFrames(n, stars, freeze);
        expect(frames).toHaveLength(n);
        for (const [i, f] of frames.entries()) {
          expect(Number.isInteger(f)).toBe(true);
          expect(f).toBeGreaterThanOrEqual(DETAIL_OPEN);
          // tombé, compté et revenu au calme avant le gel
          expect(f).toBeLessThanOrEqual(freeze - DETAIL_TAIL);
          expect(f + Math.max(DETAIL_COUNT, DETAIL_HIT)).toBeLessThan(freeze);
          for (const s of stars) {
            // ni dans l'élan de l'étoile (sa note finit de compter avant le coup), ni avant qu'elle soit posée
            expect(f < s - DETAIL_PRE || f >= s + STAR_LAND + DETAIL_POST).toBe(true);
            if (f < s) expect(f + DETAIL_COUNT).toBeLessThan(s);
          }
          if (i) expect(f - frames[i - 1]).toBeGreaterThanOrEqual(DETAIL_GAP);
        }
      });
    }
    it(`${level} étoile${level > 1 ? "s" : ""} : avec assez de critères, aucun creux du film ne reste vide`, () => {
      const spans = freeSpans(stars, freeze);
      const frames = detailFrames(Math.max(spans.length, 1), stars, freeze);
      for (const [a, b] of spans) expect(frames.some((f) => f >= a && f < b)).toBe(true);
    });
  }

  it("à six étoiles, sept critères : un par creux, de l'ouverture à la fin sur la pointe", () => {
    expect(detailFrames(7, STAR_FRAMES, 719)).toEqual([39, 122, 211, 322, 421, 517, 650]);
  });
});

describe("le relevé dans le HUD", () => {
  it("chaque critère paraît à son image, sa note compte de 0 à sa valeur, puis tient jusqu'au gel", () => {
    for (const level of LEVELS) {
      const p = filmPlan(cardAt(level));
      expect(p.detail.length).toBe(detailRows(FULL).length);
      for (const b of p.detail) {
        const before = hudAt(p, at(b.frame - 1), "fr").detail.find((r) => r.code === b.code)!;
        expect(before.shown).toBe(false);
        const hit = hudAt(p, at(b.frame), "fr").detail.find((r) => r.code === b.code)!;
        expect(hit).toMatchObject({ shown: true, hit: true, value: 0, step: b.score ?? 0 });
        const done = hudAt(p, at(b.frame + DETAIL_COUNT), "fr").detail.find((r) => r.code === b.code)!;
        expect(done).toMatchObject({ value: b.score ?? 0, slap: 1, enter: 1 });
        for (let f = b.frame; f < b.frame + DETAIL_COUNT; f++) {
          const v = hudAt(p, at(f), "fr").detail.find((r) => r.code === b.code)!.value;
          expect(v).toBeLessThanOrEqual(b.score ?? 0);
        }
      }
      // au gel : tout est là, à sa valeur, l'étiquette au repos
      const frozen = hudAt(p, at(p.freeze), "fr").detail;
      expect(frozen.every((r) => r.shown && !r.hit && r.value === r.step)).toBe(true);
    }
  });

  it("les noms et les états sont ceux du dos de la fiche, dans les deux langues", () => {
    const p = filmPlan(cardAt(6));
    const fr = hudAt(p, at(p.freeze), "fr").detail;
    const en = hudAt(p, at(p.freeze), "en").detail;
    expect(fr.map((r) => r.label)).toEqual(["École", "Open source", "Activité", "Stack", "Ownership", "Parcours", "Code"]);
    expect(fr[0].state).toBe("comptée");
    expect(en[0]).toMatchObject({ label: "School", state: "counted" });
    expect(en.map((r) => r.label)).toContain("Career");
    // une note : ni mots ni marque
    expect(fr.filter((r) => r.kind === "note").every((r) => r.state === "" && !r.unknown)).toBe(true);
  });

  it("sans note (non prouvé, pas au dossier) : une seule marque courte, « ?/10 », à la place du chiffre, jamais 0 ni de mots", () => {
    const thin: Grid = {
      ...FULL,
      criteria: [crit("EDU", null, { state: "missing" }), crit("XP", 4), crit("EMP", null, { state: "missing" }), crit("STK", 2), crit("CODE", null), crit("ACT", null), crit("OWN", null), crit("OSS", null)],
      rule: "empty_file",
    };
    const p = filmPlan(cardAt(1, thin));
    const rows = hudAt(p, at(p.freeze), "fr").detail;
    const marks = rows.filter((r) => r.kind === "unproven" || r.kind === "missing");
    expect(marks.length).toBe(5);
    for (const r of marks) expect(r).toMatchObject({ unknown: true, state: "", value: 0, step: 0 });
    expect(rows.filter((r) => r.unknown).length).toBe(5);
  });

  it("le score de §18.78 ne bouge pas : le relevé ne change ni ses paliers ni la note au gel", () => {
    for (const level of LEVELS) {
      const withGrid = filmPlan(cardAt(level));
      const without = filmPlan(cardAt(level, null));
      expect(withGrid.score).toEqual(without.score);
      expect(hudAt(withGrid, at(withGrid.freeze), "fr").score.value).toBe(OVERALL[level]);
    }
  });
});
