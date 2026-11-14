// La partition du film (§18.39) : juste à chaque niveau. Les coupes et les
// étoiles tombent sur des temps, une couche de musique par étoile, l'arrêt net
// à la coupe vers la fin, rien après la fin du film, les dérapages et les
// hélicoptères seulement quand on les voit.
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../fixtures";
import type { CardData, Stars } from "../types";
import { FPS, SHOT_START, filmPlan } from "./index";
import { BEAT_FRAMES, BPM, CHIMES, filmScore, type FilmScore } from "./sound";

const OVERALL: Record<Stars, number> = { 1: 12, 2: 33, 3: 50, 4: 66, 5: 80, 6: 93 };
const cardAt = (n: Stars): CardData => ({ ...FIXTURES.silver, id: `s${n}`, overall: OVERALL[n] });
const LEVELS: Stars[] = [1, 2, 3, 4, 5, 6];
const scoreAt = (n: Stars) => {
  const plan = filmPlan(cardAt(n));
  return { plan, score: filmScore(plan) };
};
const maxCurve = (s: FilmScore, name: Parameters<FilmScore["curve"]>[0], from: number, to: number) => {
  let m = 0;
  for (let f = from; f < to; f++) m = Math.max(m, s.curve(name, f));
  return m;
};

describe("le tempo", () => {
  it("120 à la noire : un temps toutes les 12 images", () => {
    expect(BEAT_FRAMES).toBe(12);
    expect(BPM).toBe(120);
  });

  it.each(LEVELS)("%i étoile(s) : chaque étoile et la coupe vers la fin tombent sur un temps", (n) => {
    const { plan, score } = scoreAt(n);
    const beats = score.beats.map((b) => b.frame);
    expect(beats[0]).toBe(SHOT_START.P1);
    for (const s of plan.stars) expect(beats).toContain(s.frame);
    const last = score.beats[score.beats.length - 1];
    expect(last.frame + last.len).toBeCloseTo(plan.cut, 9);
    // des temps réguliers : 12 images, sauf P2 (110 images en neuf temps)
    for (const b of score.beats) expect(b.len).toBeCloseTo(b.shot === "P2" ? 110 / 9 : 12, 9);
    // la musique ne joue que de l'étoile 1 à la coupe
    expect(beats.every((f) => f >= SHOT_START.P1 && f < plan.cut)).toBe(true);
  });
});

describe("les couches", () => {
  it.each(LEVELS)("%i étoile(s) : une couche par étoile, chacune entre sur son étoile, aucune après la coupe", (n) => {
    const { plan, score } = scoreAt(n);
    const music = score.events.filter((e) => e.layer > 0);
    expect(Math.max(...music.map((e) => e.layer))).toBe(n);
    for (let k = 1; k <= n; k++) {
      const first = Math.min(...music.filter((e) => e.layer === k).map((e) => e.frame));
      expect(first).toBe(plan.stars[k - 1].frame);
    }
    expect(music.every((e) => e.frame < plan.cut)).toBe(true);
    // les notes tenues s'arrêtent avant la coupe : l'arrêt est net
    expect(music.every((e) => e.at + e.dur <= plan.cut / FPS + 1e-9)).toBe(true);
    expect(score.layers.map((l) => l.layer)).toEqual(plan.stars.map((s) => s.star));
  });

  it.each(LEVELS)("%i étoile(s) : l'arrêt sur le temps de la coupe, puis la nappe jusqu'au sommet du flash", (n) => {
    const { plan, score } = scoreAt(n);
    const atCut = score.events.filter((e) => e.frame === plan.cut).map((e) => e.voice).sort();
    expect(atCut).toEqual(["boom", "crash", "kick", "nappe"]);
    const nappe = score.events.find((e) => e.voice === "nappe")!;
    expect(nappe.at + nappe.dur).toBeCloseTo(plan.flash.peak / FPS, 9);
    expect(nappe.at + nappe.dur + nappe.release).toBeCloseTo(plan.flash.to / FPS, 9);
  });
});

describe("les repères", () => {
  it.each(LEVELS)("%i étoile(s) : un tintement par étoile qui monte, une radio par ligne, l'impact au gel, le souffle au flash", (n) => {
    const { plan, score } = scoreAt(n);
    const of = (v: string) => score.events.filter((e) => e.voice === v);
    expect(of("chime").map((e) => e.frame)).toEqual(plan.stars.map((s) => s.frame));
    expect(of("chime").map((e) => e.notes[0])).toEqual(CHIMES.slice(0, n));
    // la radio : ouverture et fermeture du canal à chaque étoile, l'interception (une à cinq étoiles), la ligne de fin
    const intercept = plan.intercept === null ? 0 : 1;
    expect(intercept).toBe(n < 6 ? 1 : 0);
    expect(of("beep")).toHaveLength(n + 1 + intercept);
    expect(of("radio")).toHaveLength(2 * n + 1 + intercept);
    if (plan.intercept !== null) expect(of("radio").map((e) => e.frame)).toContain(plan.intercept);
    // l'éclair crème de la coupe (sa première image, cut - 1) a son claquement, à chaque niveau
    expect(of("snap").map((e) => e.frame)).toEqual([plan.cut - 1]);
    expect(of("slam").map((e) => e.frame)).toEqual([plan.freeze]);
    expect(of("boom").map((e) => e.frame)).toContain(plan.freeze);
    const whoosh = of("whoosh");
    expect(whoosh).toHaveLength(1);
    expect(whoosh[0].frame).toBeGreaterThan(plan.freeze);
    expect(whoosh[0].at + whoosh[0].dur).toBeCloseTo(plan.flash.peak / FPS, 9);
    // l'étoile suivante clignote deux fois sans s'allumer, avant la coupe et sur la grille ; à six étoiles il n'y en a plus
    const blinks = plan.flicker ? plan.flicker.frames.map(([a]) => a) : [];
    expect(of("deny")).toHaveLength(blinks.length);
    for (const [i, e] of of("deny").entries()) {
      expect(Math.abs(e.frame - blinks[i])).toBeLessThanOrEqual(0.5);
      expect(e.frame).toBeLessThan(plan.cut);
      expect(score.beats.some((b) => b.frame === e.frame || b.frame + b.len / 2 === e.frame)).toBe(true);
    }
  });

  it.each(LEVELS)("%i étoile(s) : rien ne part après la fin du film, tout est dans l'ordre", (n) => {
    const { plan, score } = scoreAt(n);
    expect(score.frames).toBe(plan.frames);
    expect(score.duration).toBeCloseTo(plan.duration, 9);
    for (const e of score.events) {
      expect(e.frame).toBeGreaterThanOrEqual(0);
      expect(e.frame).toBeLessThan(plan.frames);
      expect(Number.isFinite(e.at) && Number.isFinite(e.dur) && Number.isFinite(e.vel)).toBe(true);
    }
    const frames = score.events.map((e) => e.frame);
    expect(frames).toEqual([...frames].sort((a, b) => a - b));
  });
});

describe("la scène", () => {
  it.each(LEVELS)("%i étoile(s) : les dérapages ne s'entendent que dans les plans joués", (n) => {
    const { plan, score } = scoreAt(n);
    const slip = maxCurve(score, "slip", 0, plan.cut);
    expect(slip).toBe(n === 1 ? 0 : n < 5 ? 29 : 36);
    if (n >= 2) expect(score.curve("slip", 134)).toBe(29);
    if (n >= 5) expect(score.curve("slip", 321)).toBe(36);
  });

  it.each(LEVELS)("%i étoile(s) : le rotor à partir du pont seulement, les avions sur la jetée", (n) => {
    const { plan, score } = scoreAt(n);
    expect(maxCurve(score, "rotor", 0, SHOT_START.P4)).toBe(0);
    expect(maxCurve(score, "rotor", 0, plan.frames) > 0).toBe(n >= 4);
    expect(maxCurve(score, "jet", 0, plan.frames) > 0).toBe(n === 6);
    // une sirène dès l'étoile 1, la patrouille du rétroviseur
    expect(score.curve("siren1", SHOT_START.P1 + 6)).toBeGreaterThan(0);
    expect(score.curve("siren1", SHOT_START.P1 - 1)).toBe(0);
  });

  it.each(LEVELS)("%i étoile(s) : la scène se tait à l'arrêt sur image (dès la coupe à six étoiles, le temps gelé)", (n) => {
    const { plan, score } = scoreAt(n);
    const from = n === 6 ? plan.cut : plan.freeze;
    for (const c of ["engine", "speed", "slip", "siren1", "siren2", "siren3", "rotor", "rotor2", "jet", "rain"] as const) {
      expect(maxCurve(score, c, from, plan.frames)).toBe(0);
    }
    // avant la coupe, la pluie et le moteur sont là
    expect(score.curve("rain", plan.cut - 1)).toBeGreaterThan(0);
    expect(score.curve("engine", plan.cut - 1)).toBeGreaterThan(0);
  });

  it("la même fiche, la même partition", () => {
    const a = filmScore(filmPlan(cardAt(4)));
    const b = filmScore(filmPlan(cardAt(4)));
    expect(a.events).toEqual(b.events);
  });
});
