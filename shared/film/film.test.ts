// Le film (§18.36) : les durées viennent du découpage, le film s'arrête au
// niveau, le HUD est une fonction pure de l'instant et ne montre jamais une
// étoile de trop.
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../fixtures";
import type { CardData, Stars } from "../types";
import { CHASE_FRAMES, CHASE_SHOTS, ENDINGS, FPS, SHOT_FRAMES, SHOT_START, chaseShotAt, endingFrames, filmPlan, hudAt } from "./index";
import { radioLines } from "./radio";

const OVERALL: Record<Stars, number> = { 1: 12, 2: 33, 3: 50, 4: 66, 5: 80, 6: 93 };
const cardAt = (n: Stars, extra: Partial<CardData> = {}): CardData => ({ ...FIXTURES.silver, id: `f${n}`, overall: OVERALL[n], ...extra });
const LEVELS: Stars[] = [1, 2, 3, 4, 5, 6];
/** Milieu d'une image : l'instant que `seek` vise. */
const at = (frame: number) => (frame + 0.5) / FPS;

describe("le découpage (docs/cinematique-poursuite.md §2.1)", () => {
  it("OUV 24, P1 à P5 28, P6 40 : la poursuite fait 204 images ; FIN 60 (36 de vidéo), FIN6 80 (56 de vidéo)", () => {
    expect(SHOT_FRAMES).toEqual({ OUV: 24, P1: 28, P2: 28, P3: 28, P4: 28, P5: 28, P6: 40 });
    expect(CHASE_FRAMES).toBe(204);
    expect(endingFrames("fin")).toBe(60);
    expect(endingFrames("fin6")).toBe(80);
    expect(ENDINGS.fin.video).toBe(36);
    expect(ENDINGS.fin6.video).toBe(56);
    expect(SHOT_START.P1).toBe(24);
    expect(SHOT_START.P6).toBe(164);
  });

  it("chaque image de la poursuite appartient à un seul plan, dans l'ordre", () => {
    let i = 0;
    for (let f = 0; f < CHASE_FRAMES; f++) {
      const s = chaseShotAt(f);
      const j = CHASE_SHOTS.indexOf(s);
      expect(j === i || j === i + 1).toBe(true);
      i = j;
      expect(f).toBeGreaterThanOrEqual(SHOT_START[s]);
      expect(f).toBeLessThan(SHOT_START[s] + SHOT_FRAMES[s]);
    }
  });
});

describe("filmPlan (§2.1)", () => {
  it("les durées du tableau : 112, 140, 168, 196, 224 et 284 images ; 4,7 s, 7,0 s et 11,8 s à une, trois et six étoiles", () => {
    const frames = LEVELS.map((n) => filmPlan(cardAt(n)).frames);
    expect(frames).toEqual([112, 140, 168, 196, 224, 284]);
    expect(filmPlan(cardAt(1)).duration).toBeCloseTo(4.7, 1);
    expect(filmPlan(cardAt(3)).duration).toBeCloseTo(7.0, 1);
    expect(filmPlan(cardAt(6)).duration).toBeCloseTo(11.8, 1);
    for (const n of LEVELS) {
      const p = filmPlan(cardAt(n));
      expect(Math.abs(p.duration - p.frames / FPS)).toBeLessThan(1e-9);
    }
  });

  it("une étoile par plan, sur sa coupe : 24, 52, 80, 108, 136, 164", () => {
    const p = filmPlan(cardAt(6));
    expect(p.stars.map((s) => s.frame)).toEqual([24, 52, 80, 108, 136, 164]);
    expect(p.stars.map((s) => s.star)).toEqual(LEVELS);
    for (const s of p.stars) expect(s.at).toBeCloseTo(s.frame / 24, 9);
    for (const n of LEVELS) expect(filmPlan(cardAt(n)).stars).toHaveLength(n);
  });

  it("la coupe tombe à la fin du dernier plan du niveau, jamais dans le plan suivant", () => {
    for (const n of LEVELS) {
      const p = filmPlan(cardAt(n));
      const last = CHASE_SHOTS[n];
      expect(p.cut).toBe(SHOT_START[last] + SHOT_FRAMES[last]);
      expect(chaseShotAt(p.cut - 1)).toBe(last);
      expect(p.ending).toBe(n === 6 ? "fin6" : "fin");
      expect(p.endVideo).toBe(ENDINGS[p.ending].video);
    }
    expect(filmPlan(cardAt(1)).cut).toBe(52);
    expect(filmPlan(cardAt(3)).cut).toBe(108);
    expect(filmPlan(cardAt(6)).cut).toBe(204);
  });

  it("le gel, puis le flash : FIN 36 + 14 + 10, FIN6 56 + 12 + 12 ; la fiche se pose au sommet, 4 images après le début du flash", () => {
    const p1 = filmPlan(cardAt(1));
    expect(p1.freeze).toBe(52 + 36);
    expect(p1.flash).toEqual({ from: 88 + 14, peak: 102 + 4, to: 112 });
    expect(p1.handoffAt).toBeCloseTo(106 / 24, 9);
    const p6 = filmPlan(cardAt(6));
    expect(p6.freeze).toBe(204 + 56);
    expect(p6.flash).toEqual({ from: 272, peak: 276, to: 284 });
  });

  it("l'étoile suivante clignote deux fois pendant le gel ; à six étoiles, rien ne clignote", () => {
    for (const n of LEVELS) {
      const p = filmPlan(cardAt(n));
      if (n === 6) expect(p.flicker).toBeNull();
      else {
        expect(p.flicker?.star).toBe(n + 1);
        expect(p.flicker!.frames).toHaveLength(2);
        for (const [a, b] of p.flicker!.frames) {
          expect(a).toBeGreaterThanOrEqual(p.freeze);
          expect(b).toBeLessThanOrEqual(p.flash.from);
          expect(b).toBeGreaterThan(a);
        }
      }
    }
  });

  it("les deux tons suivent la lumière du profil ; la plaque porte le pseudo ; le titre est le niveau", () => {
    expect(filmPlan(cardAt(3, { profile: { ...FIXTURES.silver.profile!, id: "kingpin" } })).tone).toEqual({ light: "#ffb2c6", shadow: "#4b2f54" });
    expect(filmPlan(cardAt(3, { profile: { ...FIXTURES.silver.profile!, id: "arsonist" } })).tone).toEqual({ light: "#fcbf96", shadow: "#4b2f54" });
    expect(filmPlan(cardAt(3, { profile: undefined })).tone).toEqual({ light: "#ccc2f5", shadow: "#243152" });
    expect(filmPlan(cardAt(3, { profile: { ...FIXTURES.silver.profile!, id: "fresh_blood" } })).tone).toEqual({ light: "#e5ddff", shadow: "#4b2f54" });
    expect(filmPlan(cardAt(3)).plate).toBe("@camroux");
    expect(filmPlan(cardAt(3, { login: undefined })).plate).toBe("Camille Roux");
    expect(filmPlan(cardAt(4)).title.fr).toBe("Haute surveillance");
    expect(filmPlan(cardAt(6)).title.en).toBe("Top priority");
  });
});

describe("hudAt (§2.2, §5.2)", () => {
  it("est une fonction pure : même plan, même instant, même HUD", () => {
    for (const n of LEVELS) {
      const p = filmPlan(cardAt(n));
      for (let f = 0; f <= p.frames + 2; f++) expect(hudAt(p, at(f), "fr")).toEqual(hudAt(filmPlan(cardAt(n)), at(f), "fr"));
    }
  });

  it("n'allume jamais plus d'étoiles que le niveau, et le nombre ne recule jamais", () => {
    for (const n of LEVELS) {
      const p = filmPlan(cardAt(n));
      let prev = 0;
      for (let f = 0; f <= p.frames + 10; f++) {
        const h = hudAt(p, at(f), "fr");
        expect(h.lit).toBeLessThanOrEqual(n);
        expect(h.lit).toBeGreaterThanOrEqual(prev);
        prev = h.lit;
        // une étoile au-delà du niveau ne s'allume qu'en clignotant, pendant le gel
        const extra = h.stars.slice(n).filter((s) => s.on).length;
        if (extra) {
          expect(h.phase).toBe("freeze");
          expect(extra).toBe(1);
        }
      }
      expect(hudAt(p, p.duration, "fr").lit).toBe(n);
    }
  });

  it("aux instants des étoiles : la bonne étoile, le bon plan, la bonne ligne de radio", () => {
    const p = filmPlan(cardAt(6));
    const r = p.radio.fr;
    for (const s of p.stars) {
      const before = hudAt(p, at(s.frame - 1), "fr");
      const on = hudAt(p, s.at, "fr");
      expect(before.lit).toBe(s.star - 1);
      expect(on.lit).toBe(s.star);
      expect(on.shot).toBe(CHASE_SHOTS[s.star]);
      expect(on.stars[s.star - 1]).toEqual({ on: true, scale: 1.5 });
      expect(on.radio?.text).toBe(r.beats[s.star - 1]);
      expect(on.shake).not.toEqual([0, 0]);
      expect(hudAt(p, at(s.frame + 5), "fr").stars[s.star - 1]).toEqual({ on: true, scale: 1 });
    }
    expect(hudAt(p, at(0), "fr").radio).toBeNull();
    expect(hudAt(p, at(23), "fr").radio).toBeNull();
    expect(hudAt(p, at(24), "en").radio?.text).toBe(p.radio.en.beats[0]);
  });

  it("la radio cite la fiche : « Véhicule en fuite · Backend », puis la fin de course au gel", () => {
    const p = filmPlan(cardAt(4));
    expect(hudAt(p, at(30), "fr").radio?.text).toBe("Véhicule en fuite · Backend");
    expect(hudAt(p, at(60), "fr").radio?.text).toBe("Arme signalée : Python");
    expect(hudAt(p, at(p.cut + 3), "fr").radio?.text).toBe(p.radio.fr.beats[3]);
    expect(hudAt(p, at(p.freeze), "fr").radio?.text).toBe("Fin de course · Haute surveillance");
    expect(hudAt(p, at(p.freeze), "en").radio?.text).toBe("End of the line · High surveillance");
    const squares = new Set(Array.from({ length: 24 }, (_, i) => hudAt(p, at(30 + i), "fr").radio?.square));
    expect(squares).toEqual(new Set(["coral", "lilac"]));
  });

  it("la bascule : la poursuite jusqu'à la coupe, deux images d'encre (la dernière de la poursuite, la première de la fin), puis la fin ; aucune image du plan suivant", () => {
    for (const n of LEVELS) {
      const p = filmPlan(cardAt(n));
      expect(hudAt(p, at(p.cut - 2), "fr")).toMatchObject({ phase: "chase", video: "chase", videoFrame: p.cut - 2, ink: false, shot: CHASE_SHOTS[n] });
      expect(hudAt(p, at(p.cut - 1), "fr")).toMatchObject({ phase: "chase", video: "chase", videoFrame: p.cut - 1, ink: true, shot: CHASE_SHOTS[n] });
      expect(hudAt(p, at(p.cut), "fr")).toMatchObject({ phase: "ending", video: "ending", videoFrame: 0, ink: true });
      expect(hudAt(p, at(p.cut + 1), "fr")).toMatchObject({ ink: false, videoFrame: 1 });
      expect(Array.from({ length: p.frames }, (_, f) => hudAt(p, at(f), "fr").ink).filter(Boolean)).toHaveLength(2);
      for (let f = 0; f < p.frames; f++) {
        const h = hudAt(p, at(f), "fr");
        if (h.video === "chase") expect(h.videoFrame).toBeLessThan(p.cut);
        if (h.video === "ending") expect(h.videoFrame).toBeLessThan(p.endVideo);
      }
    }
  });

  it("l'arrêt sur image : la dernière image de la fin, gelée ; le titre claque de 1,2 à 1", () => {
    const p = filmPlan(cardAt(3));
    expect(hudAt(p, at(p.freeze - 1), "fr").freeze).toBeNull();
    const h = hudAt(p, at(p.freeze), "fr");
    expect(h).toMatchObject({ phase: "freeze", video: "ending", videoFrame: p.endVideo - 1, freeze: { titleScale: 1.2 } });
    expect(hudAt(p, at(p.freeze + 4), "fr").freeze).toEqual({ titleScale: 1 });
    expect(hudAt(p, at(p.flash.from + 1), "fr").videoFrame).toBe(p.endVideo - 1);
  });

  it("le clignotement : l'étoile suivante s'allume deux fois et finit éteinte", () => {
    const p = filmPlan(cardAt(3));
    const seq = Array.from({ length: p.flash.from - p.freeze }, (_, i) => hudAt(p, at(p.freeze + i), "fr").stars[3].on);
    let blinks = 0;
    for (let i = 0; i < seq.length; i++) if (seq[i] && !seq[i - 1]) blinks++;
    expect(blinks).toBe(2);
    expect(seq[seq.length - 1]).toBe(false);
    expect(hudAt(p, p.duration, "fr").stars[3].on).toBe(false);
    const p6 = filmPlan(cardAt(6));
    for (let f = p6.freeze; f < p6.frames; f++) expect(hudAt(p6, at(f), "fr").stars.every((s) => s.on)).toBe(true);
  });

  it("le flash monte en quatre images jusqu'au sommet (la fiche se pose), puis s'efface ; les bandes s'ouvrent", () => {
    const p = filmPlan(cardAt(1));
    expect(hudAt(p, at(p.flash.from - 1), "fr").flash).toBe(0);
    expect(hudAt(p, p.flash.from / FPS, "fr").flash).toBeCloseTo(0, 6);
    expect(hudAt(p, (p.flash.from + 2) / FPS, "fr").flash).toBeCloseTo(0.5, 6);
    const peak = hudAt(p, p.handoffAt, "fr");
    expect(peak.flash).toBeCloseTo(1, 6);
    expect(peak.video).toBeNull();
    expect(peak.bands).toBeCloseTo(1, 6);
    expect(hudAt(p, (p.flash.peak + 3) / FPS, "fr").bands).toBeCloseTo(0.5, 6);
    const end = hudAt(p, p.duration, "fr");
    expect(end).toMatchObject({ phase: "over", flash: 0, bands: 0, video: null });
    // avant le sommet, la vidéo est toujours à l'écran
    expect(hudAt(p, at(p.flash.peak - 1), "fr").video).toBe("ending");
  });

  it("les bandes se ferment en huit images à l'ouverture", () => {
    const p = filmPlan(cardAt(2));
    expect(hudAt(p, 0, "fr").bands).toBe(0);
    expect(hudAt(p, 4 / FPS, "fr").bands).toBeCloseTo(0.5, 6);
    expect(hudAt(p, 8 / FPS, "fr").bands).toBe(1);
    expect(hudAt(p, at(p.freeze), "fr").bands).toBe(1);
  });

  it("le grain bouge douze fois par seconde, et reste dans sa tuile", () => {
    const p = filmPlan(cardAt(6));
    const g = (f: number) => hudAt(p, at(f), "fr").grain;
    expect(g(10)).toEqual(g(11));
    expect(g(10)).not.toEqual(g(12));
    for (let f = 0; f < 200; f++) for (const v of g(f)) expect(v >= 0 && v < 128).toBe(true);
  });
});

describe("radioLines", () => {
  it("la radio : une ligne par étoile, qui cite les faits, dans les deux langues", () => {
    const fr = radioLines(FIXTURES.silver, "fr");
    expect(fr.beats).toHaveLength(6);
    expect(fr.beats[0]).toContain("Backend");
    expect(fr.beats[1]).toContain("Python");
    expect(fr.beats[3]).toContain("Doctolib");
    expect(fr.beats[4]).toContain(FIXTURES.silver.profile!.label.fr);
    expect(radioLines({ ...FIXTURES.silver, club: null }, "en").beats[3]).toContain("Lone wolf");
    for (const l of [...fr.beats, fr.end]) expect(l.length).toBeGreaterThan(0);
  });
});
