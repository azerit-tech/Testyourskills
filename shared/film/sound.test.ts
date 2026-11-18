// La partition du film (§18.39, §18.56) : juste à chaque niveau. Les étoiles
// et la fin de la poursuite tombent sur des temps, une couche de musique par
// étoile, l'arrêt net à la fin de la poursuite (un seul coup au gel sur place),
// rien après la fin du film, les dérapages et les hélicoptères seulement quand on
// les voit, la conduite lue dans le parcours.
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../fixtures";
import type { CardData, Stars } from "../types";
import { FPS, SHOT_START, STAR_FRAMES, filmPlan } from "./index";
import PARCOURS from "./parcours.json";
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

  it.each(LEVELS)("%i étoile(s) : chaque étoile et la fin de la poursuite tombent sur un temps", (n) => {
    const { plan, score } = scoreAt(n);
    const beats = score.beats.map((b) => b.frame);
    expect(beats[0]).toBe(STAR_FRAMES[0]);
    for (const s of plan.stars) expect(beats).toContain(s.frame);
    const last = score.beats[score.beats.length - 1];
    expect(last.frame + last.len).toBeCloseTo(plan.chaseEnd, 9);
    expect(score.cut).toBe(plan.chaseEnd);
    // des temps presque réguliers : étirés ou serrés pour tomber sur les repères, de 10 à 13,5 images (107 à 144 à la noire)
    for (const b of score.beats) {
      expect(b.len).toBeGreaterThanOrEqual(10);
      expect(b.len).toBeLessThanOrEqual(13.5);
    }
    // les temps se suivent sans trou
    for (let i = 1; i < score.beats.length; i++) expect(score.beats[i].frame).toBeCloseTo(score.beats[i - 1].frame + score.beats[i - 1].len, 9);
    // la musique ne joue que de l'étoile 1 à la fin de la poursuite
    expect(beats.every((f) => f >= STAR_FRAMES[0] && f < plan.chaseEnd)).toBe(true);
  });
});

describe("les couches", () => {
  it.each(LEVELS)("%i étoile(s) : une couche par étoile, chacune entre sur son étoile, aucune après la fin de la poursuite", (n) => {
    const { plan, score } = scoreAt(n);
    const music = score.events.filter((e) => e.layer > 0);
    expect(Math.max(...music.map((e) => e.layer))).toBe(n);
    for (let k = 1; k <= n; k++) {
      const first = Math.min(...music.filter((e) => e.layer === k).map((e) => e.frame));
      expect(first).toBe(plan.stars[k - 1].frame);
    }
    expect(music.every((e) => e.frame < plan.chaseEnd)).toBe(true);
    // les notes tenues s'arrêtent avant la fin de la poursuite : l'arrêt est net
    expect(music.every((e) => e.at + e.dur <= plan.chaseEnd / FPS + 1e-9)).toBe(true);
    expect(score.layers.map((l) => l.layer)).toEqual(plan.stars.map((s) => s.star));
  });

  it.each(LEVELS)("%i étoile(s) : l'arrêt sur le temps qui suit le dernier tronçon joué, puis la nappe jusqu'au sommet du flash", (n) => {
    const { plan, score } = scoreAt(n);
    const voicesAt = (f: number) => score.events.filter((e) => e.frame === f).map((e) => e.voice).sort();
    // sur place, l'impact du gel tombe sur ce temps, une image après l'image gelée ; à six étoiles, la musique s'arrête à
    // l'entrée de la pointe et l'impact attend le gel de FIN6, une image après lui
    expect(plan.cut).toBe(plan.freeze + 1);
    if (n < 6) expect(voicesAt(plan.cut)).toEqual(["boom", "crash", "kick", "nappe", "slam"]);
    else {
      expect(voicesAt(plan.chaseEnd)).toEqual(["boom", "crash", "kick", "nappe"]);
      expect(voicesAt(plan.cut)).toEqual(["boom", "slam"]);
    }
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
    // le canal d'une étoile se referme avant l'interception, jamais pendant : à une et cinq étoiles, la
    // dernière étoile tombe moins de 28 images avant elle, sa fermeture saute
    const closes = plan.stars.filter((s) => s.frame + 28 < (plan.intercept ?? plan.freeze)).length;
    expect(closes).toBe(n === 1 || n === 5 ? n - 1 : n);
    expect(of("radio")).toHaveLength(n + closes + 1 + intercept);
    if (plan.intercept !== null) {
      expect(of("radio").map((e) => e.frame)).toContain(plan.intercept);
      // rien ne grésille sur la ligne d'interception, de son ouverture au gel
      expect(of("radio").filter((e) => e.frame > plan.intercept! && e.frame <= plan.freeze)).toHaveLength(0);
    }
    // plus de coupe, plus de claquement de coupe (§18.56) : un seul coup, une image après le gel
    expect(of("snap")).toHaveLength(0);
    const impact = plan.freeze + 1;
    expect(of("slam").map((e) => e.frame)).toEqual([impact]);
    expect(of("boom").map((e) => e.frame)).toContain(impact);
    expect(of("boom").filter((e) => e.frame >= plan.freeze)).toHaveLength(1);
    const whoosh = of("whoosh");
    expect(whoosh).toHaveLength(1);
    expect(whoosh[0].frame).toBeGreaterThan(plan.freeze);
    expect(whoosh[0].at + whoosh[0].dur).toBeCloseTo(plan.flash.peak / FPS, 9);
    // l'étoile suivante clignote deux fois sans s'allumer, avant le gel et sur la grille (la double croche la plus
    // proche du battement à l'image) ; à six étoiles il n'y en a plus
    const blinks = plan.flicker ? plan.flicker.frames.map(([a]) => a) : [];
    expect(of("deny")).toHaveLength(blinks.length);
    for (const [i, e] of of("deny").entries()) {
      expect(Math.abs(e.frame - blinks[i])).toBeLessThanOrEqual(0.5 + score.beats[0].len / 8);
      expect(e.frame).toBeLessThan(plan.cut);
      expect(score.beats.some((x) => [0, 1, 2, 3].some((j) => Math.abs(x.frame + (j * x.len) / 4 - e.frame) < 1e-9))).toBe(true);
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
  it.each(LEVELS)("%i étoile(s) : les dérapages ne s'entendent que dans les tronçons joués, à leur plus fort sur leur étoile", (n) => {
    const { plan, score } = scoreAt(n);
    const slip = maxCurve(score, "slip", 0, plan.cut);
    expect(slip).toBeCloseTo(n === 1 ? 0 : n < 5 ? 29 : 36, 0);
    // le rond-point (étoile 2) et le port (étoile 5), au plus fort du dérapage à une image près
    if (n >= 2) expect(score.curve("slip", STAR_FRAMES[1])).toBeGreaterThan(28);
    if (n >= 5) expect(score.curve("slip", STAR_FRAMES[4])).toBeGreaterThan(35);
  });

  it("la conduite est celle du parcours : vitesse et glisse de parcours.json, régime et charge qui en suivent", () => {
    const { score } = scoreAt(6);
    for (const [f, v] of PARCOURS.vitesse) expect(score.curve("speed", f)).toBeCloseTo(v, 9);
    for (const [f, v] of PARCOURS.glisse) expect(score.curve("slip", f)).toBeCloseTo(v, 9);
    // lancée à 85 km/h sur l'avenue, plus vite sur le pont, arrêtée sur la pointe (le ralenti)
    expect(score.curve("speed", 10) * 3.6).toBeCloseTo(85, 0);
    expect(score.curve("speed", STAR_FRAMES[3])).toBeGreaterThan(score.curve("speed", 10));
    // arrêtée sur la pointe (parcours.arret), au ralenti
    expect(score.curve("speed", 719)).toBe(0);
    expect(score.curve("speed", 715)).toBeLessThan(0.05);
    expect(score.curve("rpm", 719)).toBe(850);
    for (let f = 0; f < 720; f++) {
      expect(score.curve("rpm", f)).toBeGreaterThanOrEqual(850);
      expect(score.curve("rpm", f)).toBeLessThanOrEqual(6200);
      expect(score.curve("load", f)).toBeGreaterThanOrEqual(0);
      expect(score.curve("load", f)).toBeLessThanOrEqual(1);
    }
    // à fond, la charge est pleine ; au freinage du rond-point, le pied est levé
    const pull = PARCOURS.acceleration.find(([, a]) => a > 2)![0];
    const brake = PARCOURS.acceleration.find(([, a]) => a < -5)![0];
    expect(score.curve("load", pull + 3)).toBeGreaterThan(0.8);
    expect(score.curve("load", brake + 3)).toBeLessThan(0.1);
  });

  it.each(LEVELS)("%i étoile(s) : le rotor à partir du pont seulement, les avions sur la jetée", (n) => {
    const { plan, score } = scoreAt(n);
    expect(maxCurve(score, "rotor", 0, SHOT_START.P4)).toBe(0);
    expect(maxCurve(score, "rotor", 0, plan.frames) > 0).toBe(n >= 4);
    expect(maxCurve(score, "jet", 0, plan.frames) > 0).toBe(n === 6);
    // une sirène dès l'étoile 1, la patrouille du rétroviseur
    expect(score.curve("siren1", STAR_FRAMES[0] + 6)).toBeGreaterThan(0);
    expect(score.curve("siren1", STAR_FRAMES[0] - 1)).toBe(0);
  });

  it.each(LEVELS)("%i étoile(s) : la scène se tait à l'arrêt sur image (à six étoiles, au gel de FIN6)", (n) => {
    const { plan, score } = scoreAt(n);
    const from = plan.freeze;
    for (const c of ["engine", "speed", "slip", "siren1", "siren2", "siren3", "rotor", "rotor2", "jet", "rain"] as const) {
      expect(maxCurve(score, c, from, plan.frames)).toBe(0);
    }
    // jusqu'à l'image d'avant, la pluie et le moteur sont là
    expect(score.curve("rain", from - 1)).toBeGreaterThan(0);
    expect(score.curve("engine", from - 1)).toBeGreaterThan(0);
    // les réglages (filtres, fréquences) restent posés, jamais à zéro ni infinis
    for (const c of ["rpm", "siren1Hz", "sfxTone", "rainTone"] as const) {
      for (let f = from; f < plan.frames; f++) expect(Number.isFinite(score.curve(c, f)) && score.curve(c, f) > 0).toBe(true);
    }
  });

  it("la même fiche, la même partition", () => {
    const a = filmScore(filmPlan(cardAt(4)));
    const b = filmScore(filmPlan(cardAt(4)));
    expect(a.events).toEqual(b.events);
  });
});
