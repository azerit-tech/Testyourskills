// Le film (§18.36, §18.56) : les durées viennent du parcours (parcours.json),
// le film s'arrête au niveau et gèle sur place, le HUD est une fonction pure de
// l'instant et ne montre jamais une étoile de trop.
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../fixtures";
import type { CardData, Stars } from "../types";
import { CHASE_FRAMES, CHASE_SHOTS, FILM_FRAMES, FILM_SHOTS, FINALE, FPS, IN_PLACE, SHOT_FRAMES, SHOT_START, STAR_FRAMES, STAR_READ, STOP_FRAME, TITLE_POP, filmPlan, holdOf, hudAt, shotAt } from "./index";
import PARCOURS from "./parcours.json";
import { radioLines } from "./radio";

const OVERALL: Record<Stars, number> = { 1: 12, 2: 33, 3: 50, 4: 66, 5: 80, 6: 93 };
const cardAt = (n: Stars, extra: Partial<CardData> = {}): CardData => ({ ...FIXTURES.silver, id: `f${n}`, overall: OVERALL[n], ...extra });
const LEVELS: Stars[] = [1, 2, 3, 4, 5, 6];
/** Milieu d'une image : l'instant que `seek` vise. */
const at = (frame: number) => (frame + 0.5) / FPS;

describe("le découpage, lu dans le parcours (§18.56)", () => {
  it("les tronçons et les étoiles sont ceux de parcours.json, sans recopie", () => {
    expect(Object.entries(SHOT_FRAMES)).toEqual(PARCOURS.troncons);
    expect(STAR_FRAMES).toEqual(PARCOURS.etoiles);
    expect(STOP_FRAME).toBe(PARCOURS.arret);
    expect(PARCOURS.fps).toBe(FPS);
  });

  it("le trajet roulé du 17 novembre : OUV 75, P1 33, P2 107, P3 103, P4 108, P5 60, P6 133, FIN6 101 : 720 images, 30 s ; sur place 14 + 10, à six étoiles 12 + 12", () => {
    expect(SHOT_FRAMES).toEqual({ OUV: 75, P1: 33, P2: 107, P3: 103, P4: 108, P5: 60, P6: 133, FIN6: 101 });
    expect(SHOT_START).toEqual({ OUV: 0, P1: 75, P2: 108, P3: 215, P4: 318, P5: 426, P6: 486, FIN6: 619 });
    expect(CHASE_FRAMES).toBe(619);
    expect(FILM_FRAMES).toBe(720);
    expect(FILM_FRAMES / FPS).toBe(30);
    expect(STAR_FRAMES).toEqual([77, 153, 255, 375, 453, 567]);
    // la berline s'arrête sur la pointe, dans FIN6, avant la dernière image
    expect(STOP_FRAME).toBeGreaterThan(SHOT_START.FIN6);
    expect(STOP_FRAME).toBeLessThan(FILM_FRAMES - 1);
    expect(IN_PLACE).toEqual({ freeze: 14, flash: 10, rise: 4 });
    expect(FINALE).toEqual({ freeze: 12, flash: 12, rise: 4 });
    expect(holdOf(5)).toBe(IN_PLACE);
    expect(holdOf(6)).toBe(FINALE);
  });

  it("chaque image du fichier appartient à un seul tronçon, dans l'ordre ; l'étoile k tombe dans Pk", () => {
    let i = 0;
    for (let f = 0; f < FILM_FRAMES; f++) {
      const s = shotAt(f);
      const j = FILM_SHOTS.indexOf(s);
      expect(j === i || j === i + 1).toBe(true);
      i = j;
      expect(f).toBeGreaterThanOrEqual(SHOT_START[s]);
      expect(f).toBeLessThan(SHOT_START[s] + SHOT_FRAMES[s]);
    }
    for (const [k, f] of STAR_FRAMES.entries()) expect(shotAt(f)).toBe(CHASE_SHOTS[k + 1]);
  });
});

describe("filmPlan (§2.1)", () => {
  it("les durées (§18.56) : 131, 238, 341, 449, 509 et 743 images ; 5,5 s, 14,2 s et 31,0 s à une, trois et six étoiles", () => {
    const frames = LEVELS.map((n) => filmPlan(cardAt(n)).frames);
    expect(frames).toEqual([131, 238, 341, 449, 509, 743]);
    // la vidéo jusqu'à la fin du tronçon de la dernière étoile (FIN6 comprise à six), dont la dernière image gèle sur place
    for (const n of LEVELS) {
      const last = n === 6 ? "FIN6" : CHASE_SHOTS[n];
      const end = SHOT_START[last] + SHOT_FRAMES[last];
      const hold = n === 6 ? FINALE : IN_PLACE;
      expect(frames[n - 1]).toBe(end - 1 + hold.freeze + hold.flash);
    }
    expect(filmPlan(cardAt(1)).duration).toBeCloseTo(5.46, 2);
    expect(filmPlan(cardAt(3)).duration).toBeCloseTo(14.21, 2);
    expect(filmPlan(cardAt(6)).duration).toBeCloseTo(30.96, 2);
    for (const n of LEVELS) {
      const p = filmPlan(cardAt(n));
      expect(Math.abs(p.duration - p.frames / FPS)).toBeLessThan(1e-9);
    }
  });

  it("une étoile par tronçon, à son instant du trajet (parcours.ETOILES), pas sur un bord", () => {
    const p = filmPlan(cardAt(6));
    expect(p.stars.map((s) => s.frame)).toEqual([...STAR_FRAMES]);
    expect(p.stars.map((s) => s.star)).toEqual(LEVELS);
    for (const s of p.stars) expect(s.at).toBeCloseTo(s.frame / FPS, 9);
    for (const n of LEVELS) expect(filmPlan(cardAt(n)).stars).toHaveLength(n);
  });

  it("la vidéo s'arrête à la fin du tronçon de la dernière étoile, jamais dans le suivant ; à six étoiles, au bout du fichier", () => {
    for (const n of LEVELS) {
      const p = filmPlan(cardAt(n));
      const last = n === 6 ? "FIN6" : CHASE_SHOTS[n];
      expect(p.cut).toBe(SHOT_START[last] + SHOT_FRAMES[last]);
      expect(shotAt(p.cut - 1)).toBe(last);
      // la musique s'arrête avec la vidéo de une à cinq étoiles ; à six, à l'entrée de la pointe
      expect(p.chaseEnd).toBe(n === 6 ? SHOT_START.FIN6 : p.cut);
      expect(p).not.toHaveProperty("ending");
    }
    expect(filmPlan(cardAt(1)).cut).toBe(SHOT_START.P2);
    expect(filmPlan(cardAt(3)).cut).toBe(SHOT_START.P4);
    expect(filmPlan(cardAt(6)).cut).toBe(FILM_FRAMES);
  });

  it("le gel, puis le flash : 14 + 10 de une à cinq étoiles, 12 + 12 à six ; la fiche se pose au sommet, 4 images après le début du flash", () => {
    for (const n of LEVELS) {
      const p = filmPlan(cardAt(n));
      const e = holdOf(n);
      // le gel prend la dernière image jouée, sur place
      expect(p.freeze).toBe(p.cut - 1);
      expect(p.flash).toEqual({ from: p.freeze + e.freeze, peak: p.freeze + e.freeze + e.rise, to: p.freeze + e.freeze + e.flash });
      expect(p.handoffAt).toBeCloseTo(p.flash.peak / FPS, 9);
    }
    // la fiche se monte sous le gel, titre claqué, au moins six images avant le flash
    for (const n of LEVELS) {
      const p = filmPlan(cardAt(n));
      expect(p.stageAt * FPS).toBeGreaterThanOrEqual(p.freeze + TITLE_POP);
      expect(p.stageAt * FPS).toBeLessThanOrEqual(p.flash.from - 6);
    }
    const p1 = filmPlan(cardAt(1));
    expect(p1.freeze).toBe(107);
    expect(p1.flash).toEqual({ from: 107 + 14, peak: 121 + 4, to: 131 });
    // les images gelées : la dernière de P1 à P5, puis celle de FIN6
    expect(LEVELS.map((n) => filmPlan(cardAt(n)).freeze)).toEqual([107, 214, 317, 425, 485, 719]);
    const p6 = filmPlan(cardAt(6));
    expect(p6.freeze).toBe(719);
    expect(p6.flash).toEqual({ from: 731, peak: 735, to: 743 });
  });

  it("l'interception : l'étoile suivante clignote deux fois juste avant le gel, dans le dernier plan joué ; à six étoiles, rien", () => {
    for (const n of LEVELS) {
      const p = filmPlan(cardAt(n));
      if (n === 6) {
        expect(p.flicker).toBeNull();
        expect(p.intercept).toBeNull();
      } else {
        expect(p.intercept).toBe(p.cut - 12);
        // l'interception tombe dans le dernier plan joué, après son étoile
        expect(p.intercept).toBeGreaterThan(p.stars[n - 1].frame);
        expect(p.flicker?.star).toBe(n + 1);
        expect(p.flicker!.frames).toHaveLength(2);
        expect(p.flicker!.frames[0][0]).toBe(p.intercept);
        for (const [a, b] of p.flicker!.frames) {
          expect(b).toBeGreaterThan(a);
          // éteinte avant le gel (cut - 1)
          expect(b).toBeLessThan(p.freeze);
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
    // La seconde ligne de la plaque est celle de la fiche : le numéro et le jour du dossier.
    expect(filmPlan(cardAt(3, { createdAt: "2026-10-14T12:00:00Z" })).plateSub).toEqual({ fr: "N° 355806 · 14.10.26", en: "No. 355806 · 14.10.26" });
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
        // une étoile au-delà du niveau ne s'allume jamais ; elle n'est qu'en suspens (contour), juste avant la coupe
        expect(h.stars.slice(n).some((s) => s.on)).toBe(false);
        const extra = h.stars.slice(n).filter((s) => s.pending !== undefined).length;
        if (extra) {
          expect(h.phase).toBe("chase");
          expect(f).toBeGreaterThanOrEqual(p.cut - 12);
          expect(extra).toBe(1);
        }
      }
      expect(hudAt(p, p.duration, "fr").lit).toBe(n);
    }
  });

  it("aux instants des étoiles : la bonne étoile (son claquement), le bon plan, la bonne ligne de radio ; l'image ne bouge pas", () => {
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
      // plus de secousse (§18.53) : le HUD ne déplace jamais la vidéo
      expect(on).not.toHaveProperty("shake");
      expect(hudAt(p, at(s.frame + 5), "fr").stars[s.star - 1]).toEqual({ on: true, scale: 1 });
    }
    expect(hudAt(p, at(0), "fr").radio).toBeNull();
    expect(hudAt(p, at(STAR_FRAMES[0] - 1), "fr").radio).toBeNull();
    expect(hudAt(p, at(STAR_FRAMES[0]), "en").radio?.text).toBe(p.radio.en.beats[0]);
  });

  it("la radio cite la fiche : « Véhicule en fuite : Backend », annonce l'interception, puis la fin de course au gel", () => {
    // trois étoiles : la ligne de l'étoile 3 se lit seule plus de deux secondes, l'interception la remplace
    const p = filmPlan(cardAt(3));
    expect(p.keepLine).toBe(false);
    expect(hudAt(p, at(STAR_FRAMES[0] + 6), "fr").radio?.text).toBe("Véhicule en fuite\u00a0: Backend");
    expect(hudAt(p, at(STAR_FRAMES[1] + 8), "fr").radio?.text).toBe("Arme signalée\u00a0: Python");
    expect(hudAt(p, at(STAR_FRAMES[0] + 6), "fr").radio?.kicker).toBeNull();
    expect(hudAt(p, at(p.cut - 13), "fr").radio).toMatchObject({ text: p.radio.fr.beats[2], kicker: "Chef d'accusation", below: null });
    expect(hudAt(p, at(p.cut - 12), "fr").radio?.below).toBeNull();
    expect(hudAt(p, at(p.freeze), "fr").radio?.below).toBeNull();
    expect(hudAt(p, at(p.cut - 12), "fr").radio?.text).toBe("Interception\u00a0: barrage en place");
    expect(hudAt(p, at(p.cut - 2), "fr").radio?.text).toBe("Interception\u00a0: barrage en place");
    expect(hudAt(p, at(p.cut - 2), "fr").radio?.kicker).toBeNull();
    expect(hudAt(p, at(p.freeze - 1), "en").radio?.text).toBe("Intercept: roadblock in place");
    // six étoiles : pas d'interception, la dernière ligne tient jusqu'au gel, FIN6 comprise
    const p6 = filmPlan(cardAt(6));
    expect(hudAt(p6, at(p6.chaseEnd + 3), "fr").radio?.text).toBe(p6.radio.fr.beats[5]);
    expect(hudAt(p6, at(p6.freeze - 1), "fr").radio?.text).toBe(p6.radio.fr.beats[5]);
    // au gel, la fin de course sans le niveau : il est écrit en grand juste au-dessus
    expect(hudAt(p, at(p.freeze), "fr").radio).toMatchObject({ text: "Fin de course\u00a0: dossier ouvert", kicker: null });
    expect(hudAt(p, at(p.freeze), "en").radio?.text).toBe("End of the line: file opened");
    expect(hudAt(p, at(p.freeze), "fr").radio?.text).not.toContain(p.title.fr);
    const squares = new Set(Array.from({ length: FPS }, (_, i) => hudAt(p, at(STAR_FRAMES[0] + i), "fr").radio?.square));
    expect(squares).toEqual(new Set(["coral", "lilac"]));
  });

  it("la ligne de chaque étoile se lit : 1,5 s seule au moins, ou gardée jusqu'à la fiche, l'interception puis la fin de course dessous ; 1,8 s en tout avant la fiche", () => {
    expect(STAR_READ).toBe(44);
    expect(STAR_READ / FPS).toBeGreaterThanOrEqual(1.8);
    // une étoile : 19 images de l'étoile 1 à l'interception ; quatre : 39 ; cinq : 21 ; deux et trois : 50 et 51
    expect(LEVELS.map((n) => filmPlan(cardAt(n)).keepLine)).toEqual([true, false, false, true, true, false]);
    for (const n of LEVELS) {
      for (const lang of ["fr", "en"] as const) {
        const p = filmPlan(cardAt(n));
        const r = p.radio[lang];
        for (const s of p.stars) {
          const line = r.beats[s.star - 1];
          // les images où la ligne de l'étoile est à l'écran (la ligne principale), avant la fiche (sommet du flash)
          const shown: number[] = [];
          let alone = 0;
          for (let f = s.frame; f < p.flash.peak; f++) {
            const radio = hudAt(p, at(f), lang).radio;
            if (radio?.text !== line) continue;
            shown.push(f);
            if (radio.below === null) alone++;
            else expect(radio.kicker).toBeNull();
          }
          // d'un seul tenant, dès son étoile : elle ne revient pas après avoir disparu
          expect(shown[0]).toBe(s.frame);
          expect(shown[shown.length - 1] - shown[0]).toBe(shown.length - 1);
          expect(shown.length).toBeGreaterThanOrEqual(1.8 * FPS);
          const kept = p.keepLine && s.star === n;
          if (kept) {
            // gardée jusqu'à la fiche : l'interception dessous dès son image, puis la fin de course au gel
            expect(shown[shown.length - 1]).toBe(p.flash.peak - 1);
            expect(alone).toBe(p.intercept! - s.frame);
            expect(hudAt(p, at(p.intercept!), lang).radio).toMatchObject({ text: line, below: r.intercept });
            expect(hudAt(p, at(p.freeze - 1), lang).radio).toMatchObject({ text: line, below: r.intercept });
            expect(hudAt(p, at(p.freeze), lang).radio).toMatchObject({ text: line, below: r.end, kicker: null });
          } else {
            expect(alone).toBe(shown.length);
            expect(alone).toBeGreaterThanOrEqual(1.5 * FPS);
          }
        }
        // sans ligne gardée, jamais de seconde ligne
        if (!p.keepLine) for (let f = 0; f < p.frames; f++) expect(hudAt(p, at(f), lang).radio?.below ?? null).toBeNull();
      }
    }
  });

  it("une à cinq étoiles, le gel sur place : la vidéo jusqu'à la dernière image du dernier tronçon joué, gelée ; ni FIN6, ni image du tronçon suivant", () => {
    for (const n of [1, 2, 3, 4, 5] as const) {
      const p = filmPlan(cardAt(n));
      expect(hudAt(p, at(p.cut - 2), "fr")).toMatchObject({ phase: "chase", video: "chase", videoFrame: p.cut - 2, shot: CHASE_SHOTS[n], freeze: null });
      expect(hudAt(p, at(p.cut - 1), "fr")).toMatchObject({ phase: "freeze", video: "chase", videoFrame: p.cut - 1, shot: CHASE_SHOTS[n], freeze: { titleScale: 1.2 } });
      for (let f = 0; f < p.frames; f++) {
        const h = hudAt(p, at(f), "fr");
        expect(h).not.toHaveProperty("ink");
        expect(h.phase).not.toBe("ending");
        expect(h.shot).not.toBe("FIN6");
        if (h.video !== null) expect(h).toMatchObject({ video: "chase" });
        expect(h.videoFrame).toBeLessThan(p.cut);
        if (f >= p.freeze) expect(h.videoFrame).toBe(p.cut - 1);
      }
    }
  });

  it("six étoiles, d'un seul tenant : P6 continue dans FIN6 sans coupe ni éclair, la même vidéo, l'image suit l'horloge jusqu'au gel", () => {
    const p = filmPlan(cardAt(6));
    expect(hudAt(p, at(p.chaseEnd - 1), "fr")).toMatchObject({ phase: "chase", video: "chase", videoFrame: p.chaseEnd - 1, shot: "P6" });
    expect(hudAt(p, at(p.chaseEnd), "fr")).toMatchObject({ phase: "ending", video: "chase", videoFrame: p.chaseEnd, shot: "FIN6", freeze: null });
    for (let f = 0; f < p.freeze; f++) expect(hudAt(p, at(f), "fr")).toMatchObject({ video: "chase", videoFrame: f });
    for (let f = 0; f < p.frames; f++) expect(hudAt(p, at(f), "fr").videoFrame).toBeLessThan(FILM_FRAMES);
  });

  it("l'arrêt sur image : la dernière image jouée, gelée (du dernier plan sur place, de FIN6 à six étoiles) ; le titre claque de 1,2 à 1", () => {
    const p = filmPlan(cardAt(3));
    expect(hudAt(p, at(p.freeze - 1), "fr").freeze).toBeNull();
    const h = hudAt(p, at(p.freeze), "fr");
    expect(h).toMatchObject({ phase: "freeze", video: "chase", videoFrame: p.cut - 1, shot: "P3", freeze: { titleScale: 1.2 } });
    expect(hudAt(p, at(p.freeze + 4), "fr").freeze).toEqual({ titleScale: 1 });
    expect(hudAt(p, at(p.flash.from + 1), "fr").videoFrame).toBe(p.cut - 1);
    const p6 = filmPlan(cardAt(6));
    expect(hudAt(p6, at(p6.freeze), "fr")).toMatchObject({ phase: "freeze", video: "chase", videoFrame: FILM_FRAMES - 1, shot: "FIN6", freeze: { titleScale: 1.2 } });
    expect(hudAt(p6, at(p6.flash.from + 1), "fr").videoFrame).toBe(FILM_FRAMES - 1);
  });

  it("le clignotement, à chaque niveau de une à cinq étoiles : l'étoile suivante bat deux fois en contour avant le gel, jamais pleine, et finit éteinte", () => {
    for (const n of [1, 2, 3, 4, 5] as const) {
      const p = filmPlan(cardAt(n));
      const stars = Array.from({ length: p.frames }, (_, f) => hudAt(p, at(f), "fr").stars[n]);
      expect(stars.some((s) => s.on)).toBe(false);
      for (const s of stars) {
        if (s.pending === undefined) continue;
        expect(s.pending).toBeGreaterThanOrEqual(0.25);
        expect(s.pending).toBeLessThanOrEqual(0.6);
      }
      const seq = stars.map((s) => s.pending === 0.6);
      let blinks = 0;
      for (let i = 0; i < seq.length; i++) if (seq[i] && !seq[i - 1]) blinks++;
      expect(blinks).toBe(2);
      // éteinte sur les deux images d'avant le gel, au gel, et jusqu'au bout
      expect(seq.slice(p.cut - 3).every((on) => !on)).toBe(true);
      expect(hudAt(p, p.duration, "fr").stars[n]).toEqual({ on: false, scale: 1 });
    }
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
    // avant le sommet, la vidéo (gelée sur place) est toujours à l'écran
    expect(hudAt(p, at(p.flash.peak - 1), "fr").video).toBe("chase");
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
    expect(fr.beats[3]).toContain("Pharelune Santé");
    expect(fr.beats[4]).toContain(FIXTURES.silver.profile!.label.fr);
    expect(radioLines({ ...FIXTURES.silver, club: null }, "en").beats[3]).toContain("Lone wolf");
    for (const l of [...fr.beats, fr.intercept, fr.end]) expect(l.length).toBeGreaterThan(0);
    expect(radioLines(FIXTURES.silver, "en").intercept).toBe("Intercept: roadblock in place");
  });

  it("le chef d'accusation : son étiquette au-dessus de la ligne, jamais deux deux-points ni de point médian", () => {
    const card = { ...FIXTURES.silver, statuses: [{ id: "gh_lazy_commits", tone: "negative" as const, label: { fr: "Commits : fix, fix2, final fix", en: "Commits: fix, fix2, final fix" }, rule: { fr: "", en: "" } }] };
    for (const lang of ["fr", "en"] as const) {
      const r = radioLines(card, lang);
      expect(r.kickers).toHaveLength(6);
      expect(r.kickers.filter(Boolean)).toEqual([lang === "fr" ? "Chef d'accusation" : "Charge"]);
      expect(r.beats[2]).toBe(card.statuses[0].label[lang]);
      for (const l of [...r.beats, r.intercept, r.end, ...r.kickers.filter((k): k is string => !!k)]) {
        expect(l.split(":").length).toBeLessThanOrEqual(2);
        expect(l).not.toContain("·");
        expect(l).not.toMatch(/motif/i);
      }
    }
    const p = filmPlan({ ...cardAt(3), statuses: card.statuses });
    const h = hudAt(p, at(STAR_FRAMES[2] + 4), "fr");
    expect(h.radio).toMatchObject({ kicker: "Chef d'accusation", text: "Commits : fix, fix2, final fix" });
  });
});
