// Le film (§18.36, §18.56) : les durées viennent du parcours (parcours.json),
// le film s'arrête au niveau et gèle sur place, le HUD est une fonction pure de
// l'instant et ne montre jamais une étoile de trop. Par-dessus l'image : la
// jauge de l'étoile suivante, l'étoile qui tombe, la ligne sous la berline,
// l'étoile refusée et sa ligne au gel.
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../fixtures";
import type { CardData, Stars } from "../types";
import { STAR_THRESHOLDS, starsFor } from "../types";
import {
  CHASE_FRAMES,
  CHASE_SHOTS,
  FILM_FRAMES,
  FILM_SHOTS,
  FINALE,
  FPS,
  GAUGE_AFTER,
  GAUGE_OPEN,
  IN_PLACE,
  LINE_HIT,
  LINE_LABEL_MAX,
  LINE_LEAD,
  LINE_TAIL,
  SHOT_FRAMES,
  SHOT_START,
  STAMP_FROM,
  STAMP_HOLD,
  STAMP_SLAP,
  STAR_FRAMES,
  STAR_LAND,
  STOP_FRAME,
  TITLE_POP,
  VERDICT_AT,
  VERDICT_IN,
  VERDICT_MAX,
  filmPlan,
  holdOf,
  hudAt,
  shotAt,
  verdictText,
} from "./index";
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

  it("le trajet roulé du 17 novembre : OUV 75, P1 33, P2 107, P3 103, P4 108, P5 60, P6 133, FIN6 101 : 720 images, 30 s ; sur place 36 + 10, à six étoiles 12 + 12", () => {
    expect(SHOT_FRAMES).toEqual({ OUV: 75, P1: 33, P2: 107, P3: 103, P4: 108, P5: 60, P6: 133, FIN6: 101 });
    expect(SHOT_START).toEqual({ OUV: 0, P1: 75, P2: 108, P3: 215, P4: 318, P5: 426, P6: 486, FIN6: 619 });
    expect(CHASE_FRAMES).toBe(619);
    expect(FILM_FRAMES).toBe(720);
    expect(FILM_FRAMES / FPS).toBe(30);
    expect(STAR_FRAMES).toEqual([77, 153, 255, 375, 453, 567]);
    // la berline s'arrête sur la pointe, dans FIN6, avant la dernière image
    expect(STOP_FRAME).toBeGreaterThan(SHOT_START.FIN6);
    expect(STOP_FRAME).toBeLessThan(FILM_FRAMES - 1);
    expect(IN_PLACE).toEqual({ freeze: 36, flash: 10, rise: 4 });
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
  it("les durées (§18.56) : 153, 260, 363, 471, 531 et 743 images ; 6,4 s, 15,1 s et 31,0 s à une, trois et six étoiles", () => {
    const frames = LEVELS.map((n) => filmPlan(cardAt(n)).frames);
    expect(frames).toEqual([153, 260, 363, 471, 531, 743]);
    // la vidéo jusqu'à la fin du tronçon de la dernière étoile (FIN6 comprise à six), dont la dernière image gèle sur place
    for (const n of LEVELS) {
      const last = n === 6 ? "FIN6" : CHASE_SHOTS[n];
      const end = SHOT_START[last] + SHOT_FRAMES[last];
      const hold = n === 6 ? FINALE : IN_PLACE;
      expect(frames[n - 1]).toBe(end - 1 + hold.freeze + hold.flash);
    }
    expect(filmPlan(cardAt(1)).duration).toBeCloseTo(6.375, 3);
    expect(filmPlan(cardAt(3)).duration).toBeCloseTo(15.125, 3);
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

  it("le gel, puis le flash : 36 + 10 de une à cinq étoiles (1,5 s d'image fixe), 12 + 12 à six ; la fiche se pose au sommet, 4 images après le début du flash", () => {
    for (const n of LEVELS) {
      const p = filmPlan(cardAt(n));
      const e = holdOf(n);
      // le gel prend la dernière image jouée, sur place
      expect(p.freeze).toBe(p.cut - 1);
      expect(p.flash).toEqual({ from: p.freeze + e.freeze, peak: p.freeze + e.freeze + e.rise, to: p.freeze + e.freeze + e.flash });
      expect(p.handoffAt).toBeCloseTo(p.flash.peak / FPS, 9);
    }
    // la fiche se monte sous le gel, titre claqué, l'étoile refusée vidée (plus rien ne bouge), au moins six images avant le flash
    for (const n of LEVELS) {
      const p = filmPlan(cardAt(n));
      expect(p.stageAt * FPS).toBeGreaterThanOrEqual(p.freeze + TITLE_POP);
      expect(p.stageAt * FPS).toBeLessThanOrEqual(p.flash.from - 6);
      if (p.verdict) expect(p.stageAt * FPS).toBeGreaterThan(p.verdict.drain[1]);
    }
    const p1 = filmPlan(cardAt(1));
    expect(p1.freeze).toBe(107);
    expect(p1.flash).toEqual({ from: 107 + 36, peak: 143 + 4, to: 153 });
    // les images gelées : la dernière de P1 à P5, puis celle de FIN6
    expect(LEVELS.map((n) => filmPlan(cardAt(n)).freeze)).toEqual([107, 214, 317, 425, 485, 719]);
    const p6 = filmPlan(cardAt(6));
    expect(p6.freeze).toBe(719);
    expect(p6.flash).toEqual({ from: 731, peak: 735, to: 743 });
  });

  it("l'interception (le son seul), puis l'étoile refusée : la suivante bat deux fois au gel, après son coup, et se vide avant le flash ; à six étoiles, rien", () => {
    for (const n of LEVELS) {
      const p = filmPlan(cardAt(n));
      if (n === 6) {
        expect(p.verdict).toBeNull();
        expect(p.intercept).toBeNull();
      } else {
        expect(p.intercept).toBe(p.cut - 12);
        // l'interception tombe dans le dernier plan joué, après son étoile
        expect(p.intercept).toBeGreaterThan(p.stars[n - 1].frame);
        const v = p.verdict!;
        expect(v.star).toBe(n + 1);
        expect(v.blinks).toHaveLength(2);
        let prev = p.cut;
        for (const [a, b] of v.blinks) {
          // après le coup du gel (une image après l'image gelée), l'un après l'autre
          expect(a).toBeGreaterThan(prev);
          expect(b).toBeGreaterThan(a);
          prev = b;
        }
        expect(v.drain[0]).toBeGreaterThan(prev);
        expect(v.drain[1]).toBeGreaterThan(v.drain[0]);
        expect(v.drain[1]).toBeLessThan(p.flash.from);
      }
    }
  });

  it("l'étoile refusée : les points qui manquent sont comptés depuis la note, la jauge s'arrête à la part du chemin entre les deux seuils", () => {
    // 38 : deux étoiles, à 7 points de la troisième, 53 % du chemin de 30 à 45
    const v = filmPlan(cardAt(2, { overall: 38 })).verdict!;
    expect(v).toMatchObject({ star: 3, missing: 7 });
    expect(v.fill).toBeCloseTo(8 / 15, 9);
    expect(verdictText(v.line.fr)).toBe("3ᵉ étoile\u00a0: à 7 points");
    expect(v.line.fr).toEqual({ ord: "3", sup: "e", rest: " étoile\u00a0: à 7 points" });
    expect(verdictText(v.line.en)).toBe("3rd star: 7 points short");
    // à un point : au singulier ; la jauge bornée, jamais presque pleine ni vide
    const near = filmPlan(cardAt(4, { overall: 74 })).verdict!;
    expect(near).toMatchObject({ star: 5, missing: 1, fill: 0.92 });
    expect(verdictText(near.line.fr)).toBe("5ᵉ étoile\u00a0: à 1 point");
    expect(verdictText(near.line.en)).toBe("5th star: 1 point short");
    const low = filmPlan(cardAt(1, { overall: 1 })).verdict!;
    expect(low).toMatchObject({ star: 2, missing: 29, fill: 0.1 });
    expect(verdictText(low.line.en)).toBe("2nd star: 29 points short");
    // à toutes les notes : la note plus les points qui manquent font le seuil suivant ; la ligne tient dans son budget
    for (let overall = 0; overall < 90; overall++) {
      const level = starsFor(overall);
      const w = filmPlan(cardAt(1, { overall })).verdict!;
      expect(w.star).toBe(level + 1);
      expect(overall + w.missing).toBe(STAR_THRESHOLDS[level - 1]);
      expect(w.fill).toBeGreaterThanOrEqual(0.1);
      expect(w.fill).toBeLessThanOrEqual(0.92);
      for (const lang of ["fr", "en"] as const) expect(verdictText(w.line[lang]).length).toBeLessThanOrEqual(VERDICT_MAX);
    }
    for (let overall = 90; overall <= 100; overall++) expect(filmPlan(cardAt(1, { overall })).verdict).toBeNull();
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
        // les étoiles gagnées, et elles seules, de gauche à droite
        expect(h.stars.map((s) => s.on)).toEqual([1, 2, 3, 4, 5, 6].map((k) => k <= h.lit));
        // une étoile au-delà du niveau ne s'allume jamais et n'est jamais pleine : au plus une jauge, celle de l'étoile refusée
        expect(h.stars.slice(n).some((s) => s.on || s.flying)).toBe(false);
        for (const s of h.stars.slice(n)) if (s.fill !== undefined) expect(s.fill).toBeLessThanOrEqual(0.92);
        expect(h.stars.slice(n + 1).every((s) => s.fill === undefined && s.pending === undefined)).toBe(true);
        // son contour ne bat qu'au gel
        if (h.stars.some((s) => s.pending !== undefined)) expect(h.phase).toBe("freeze");
      }
      expect(hudAt(p, p.duration, "fr").lit).toBe(n);
    }
  });

  it("aux instants des étoiles : le coup, l'étoile tombe en grand sur le ciel puis se pose dans la rangée ; le bon plan ; l'image ne bouge pas", () => {
    const p = filmPlan(cardAt(6));
    for (const s of p.stars) {
      const before = hudAt(p, at(s.frame - 1), "fr");
      const on = hudAt(p, s.at, "fr");
      expect(before.lit).toBe(s.star - 1);
      expect(before.stamp).toBeNull();
      expect(on.lit).toBe(s.star);
      expect(on.shot).toBe(CHASE_SHOTS[s.star]);
      // au coup : gagnée, en l'air ; sa place dans la rangée garde la jauge pleine
      expect(on.stars[s.star - 1]).toEqual({ on: true, scale: 1, flying: true, fill: 1 });
      expect(on.stamp?.star).toBe(s.star);
      expect(on.stamp?.scale).toBeCloseTo(STAMP_FROM, 6);
      expect(on.stamp?.fly).toBe(0);
      // elle claque en trois images, tient, puis vole vers sa place sans revenir en arrière
      expect(hudAt(p, at(s.frame + STAMP_SLAP), "fr").stamp).toMatchObject({ scale: 1, fly: 0, opacity: 1 });
      expect(hudAt(p, at(s.frame + STAMP_HOLD - 1), "fr").stamp).toMatchObject({ scale: 1, fly: 0 });
      let fly = 0;
      let side = 0;
      for (let f = s.frame; f < s.frame + STAR_LAND; f++) {
        const h = hudAt(p, at(f), "fr");
        expect(h.stamp?.star).toBe(s.star);
        expect(h.stamp!.fly).toBeGreaterThanOrEqual(fly);
        expect(h.stamp!.fly).toBeLessThanOrEqual(1);
        expect(h.stamp!.side).toBeGreaterThanOrEqual(side);
        expect(h.stamp!.side).toBeLessThanOrEqual(1);
        // §18.97 : elle monte d'abord au centre, et ne glisse vers sa place qu'une fois presque montée
        if (h.stamp!.side > 0) expect(h.stamp!.fly).toBeGreaterThan(0.6);
        if (f < s.frame + STAMP_HOLD) expect(h.stamp!.side).toBe(0);
        fly = h.stamp!.fly;
        side = h.stamp!.side;
        expect(h.stars[s.star - 1].flying).toBe(true);
      }
      expect(fly).toBe(1);
      expect(side).toBeCloseTo(1, 6);
      // posée : la rangée la montre pleine, elle claque de 1,5 à 1
      const down = hudAt(p, at(s.frame + STAR_LAND), "fr");
      expect(down.stamp).toBeNull();
      expect(down.stars[s.star - 1]).toEqual({ on: true, scale: 1.5 });
      expect(hudAt(p, at(s.frame + STAR_LAND + 5), "fr").stars[s.star - 1]).toEqual({ on: true, scale: 1 });
      // plus de secousse (§18.53) : le HUD ne déplace jamais la vidéo
      expect(on).not.toHaveProperty("shake");
    }
    // l'étoile s'est posée avant le gel, à tous les niveaux : une image gelée ne montre pas d'étoile en l'air
    for (const n of LEVELS) {
      const q = filmPlan(cardAt(n));
      expect(q.stars[n - 1].frame + STAR_LAND).toBeLessThan(q.freeze);
      for (let f = q.freeze; f < q.frames; f++) expect(hudAt(q, at(f), "fr").stamp).toBeNull();
    }
  });

  it("la jauge : l'étoile suivante se remplit jusqu'à son coup, sans reculer, jamais pleine avant ; une seule à la fois", () => {
    for (const n of LEVELS) {
      const p = filmPlan(cardAt(n));
      for (const s of p.stars) {
        const from = s.star === 1 ? GAUGE_OPEN : p.stars[s.star - 2].frame + GAUGE_AFTER;
        let prev = 0;
        for (let f = 0; f < s.frame; f++) {
          const star = hudAt(p, at(f), "fr").stars[s.star - 1];
          if (f < from) expect(star).toEqual({ on: false, scale: 1 });
          else {
            expect(star.on).toBe(false);
            expect(star.fill).toBeGreaterThanOrEqual(prev);
            expect(star.fill).toBeLessThan(1);
            prev = star.fill!;
          }
        }
        // presque pleine à l'image d'avant : le coup la finit
        expect(prev).toBeGreaterThan(0.9);
      }
      for (let f = 0; f < p.frames; f++) expect(hudAt(p, at(f), "fr").stars.filter((x) => !x.on && x.fill !== undefined).length).toBeLessThanOrEqual(1);
    }
  });

  it("la ligne sous la berline cite la fiche : « Véhicule en fuite », « Backend » ; elle arrive avant son étoile, l'étiquette s'inverse au coup, plus rien au gel", () => {
    const p = filmPlan(cardAt(3));
    const s1 = STAR_FRAMES[0];
    expect(hudAt(p, at(0), "fr").line).toBeNull();
    expect(hudAt(p, at(s1 - LINE_LEAD - 1), "fr").line).toBeNull();
    // elle entre en cinq images, 1,75 s avant l'étoile
    expect(hudAt(p, at(s1 - LINE_LEAD), "fr").line).toMatchObject({ star: 1, label: "Véhicule en fuite", text: "Backend", hit: false });
    expect(hudAt(p, at(s1 - LINE_LEAD), "fr").line!.enter).toBeCloseTo(0.1, 6);
    expect(hudAt(p, at(s1 - LINE_LEAD + 5), "fr").line!.enter).toBe(1);
    expect(hudAt(p, at(s1 - 1), "fr").line).toMatchObject({ star: 1, hit: false, enter: 1 });
    // au coup de l'étoile, l'étiquette s'inverse neuf images
    expect(hudAt(p, at(s1), "fr").line).toMatchObject({ label: "Véhicule en fuite", text: "Backend", hit: true, enter: 1 });
    expect(hudAt(p, at(s1 + LINE_HIT - 1), "fr").line?.hit).toBe(true);
    expect(hudAt(p, at(s1 + LINE_HIT), "fr").line?.hit).toBe(false);
    // elle reste 1,25 s après, et sort en trois images
    expect(hudAt(p, at(s1 + LINE_TAIL - 1), "fr").line!.enter).toBeCloseTo(0.5 / 3, 6);
    expect(hudAt(p, at(s1 + LINE_TAIL), "fr").line).toBeNull();
    expect(hudAt(p, at(STAR_FRAMES[1] + 8), "fr").line).toMatchObject({ star: 2, label: "Arme signalée", text: "Python" });
    expect(hudAt(p, at(STAR_FRAMES[1] + 8), "en").line).toMatchObject({ star: 2, label: "Weapon reported", text: "Python" });
    expect(hudAt(p, at(STAR_FRAMES[2]), "fr").line).toMatchObject({ star: 3, label: "Chef d'accusation", text: p.lines.fr[2].text });
    // ni interception ni fin de course : dès le gel, la ligne laisse la place à la plaque, au niveau et à l'étoile refusée
    for (let f = STAR_FRAMES[2] + LINE_TAIL; f <= p.frames; f++) expect(hudAt(p, at(f), "fr").line).toBeNull();
    // six étoiles : la dernière ligne sort 1,25 s après la sixième étoile ; l'encerclement se regarde sans un mot
    const p6 = filmPlan(cardAt(6));
    expect(hudAt(p6, at(STAR_FRAMES[5]), "fr").line).toMatchObject({ star: 6, label: "Toutes les unités", text: "Priorité absolue", hit: true });
    for (let f = STAR_FRAMES[5] + LINE_TAIL; f <= p6.frames; f++) expect(hudAt(p6, at(f), "fr").line).toBeNull();
  });

  it("chaque ligne se lit trois secondes, d'un seul tenant, jamais deux à la fois ; entre deux, l'image seule", () => {
    expect((LINE_LEAD + LINE_TAIL) / FPS).toBe(3);
    for (const n of LEVELS) {
      for (const lang of ["fr", "en"] as const) {
        const p = filmPlan(cardAt(n));
        const shown = new Map<number, number[]>();
        for (let f = 0; f <= p.frames; f++) {
          const l = hudAt(p, at(f), lang).line;
          if (!l) continue;
          expect(l).toMatchObject(p.lines[lang][l.star - 1]);
          shown.set(l.star, [...(shown.get(l.star) ?? []), f]);
        }
        // une ligne par étoile gagnée, pas une de plus
        expect([...shown.keys()]).toEqual(p.stars.map((s) => s.star));
        let prevEnd = -1;
        for (const s of p.stars) {
          const frames = shown.get(s.star)!;
          expect(frames[0]).toBe(s.frame - LINE_LEAD);
          // d'un seul tenant : elle ne revient pas après avoir disparu
          expect(frames[frames.length - 1] - frames[0]).toBe(frames.length - 1);
          expect(frames.length).toBe(LINE_LEAD + LINE_TAIL);
          // avant le gel, et après la précédente : quatre images d'image seule au moins
          expect(frames[frames.length - 1]).toBeLessThan(p.freeze);
          expect(frames[0] - prevEnd).toBeGreaterThan(4);
          prevEnd = frames[frames.length - 1];
        }
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
    expect(hudAt(p, at(p.freeze + 4), "fr").freeze).toEqual({ titleScale: 1, verdict: 0 });
    // la ligne de l'étoile refusée vient sous le niveau, le titre claqué, en trois images ; elle se lit une seconde au moins
    expect(hudAt(p, at(p.freeze + VERDICT_AT - 1), "fr").freeze?.verdict).toBe(0);
    expect(hudAt(p, at(p.freeze + VERDICT_AT + 1), "fr").freeze?.verdict).toBeCloseTo(0.5, 6);
    expect(hudAt(p, at(p.freeze + VERDICT_AT + VERDICT_IN), "fr").freeze?.verdict).toBe(1);
    expect(hudAt(p, at(p.flash.from + 1), "fr").freeze?.verdict).toBe(1);
    expect((p.flash.from - (p.freeze + VERDICT_AT + VERDICT_IN)) / FPS).toBeGreaterThanOrEqual(1);
    expect(hudAt(p, at(p.flash.from + 1), "fr").videoFrame).toBe(p.cut - 1);
    const p6 = filmPlan(cardAt(6));
    expect(hudAt(p6, at(p6.freeze), "fr")).toMatchObject({ phase: "freeze", video: "chase", videoFrame: FILM_FRAMES - 1, shot: "FIN6", freeze: { titleScale: 1.2 } });
    expect(hudAt(p6, at(p6.flash.from + 1), "fr").videoFrame).toBe(FILM_FRAMES - 1);
    // à six étoiles, aucune étoile n'est refusée : pas de ligne
    for (let f = p6.freeze; f < p6.flash.peak; f++) expect(hudAt(p6, at(f), "fr").freeze?.verdict).toBe(0);
  });

  it("l'étoile refusée, de une à cinq étoiles : sa jauge monte jusqu'à sa part, se fige avec l'image, bat deux fois après le coup du gel, se vide ; jamais pleine", () => {
    for (const n of [1, 2, 3, 4, 5] as const) {
      const p = filmPlan(cardAt(n));
      const v = p.verdict!;
      const stars = Array.from({ length: p.frames }, (_, f) => hudAt(p, at(f), "fr").stars[n]);
      expect(stars.some((s) => s.on)).toBe(false);
      // rien avant la dernière étoile gagnée ; puis elle monte sans reculer pendant le dernier tronçon joué
      const from = p.stars[n - 1].frame + GAUGE_AFTER;
      for (let f = 0; f < from; f++) expect(stars[f]).toEqual({ on: false, scale: 1 });
      for (let f = from + 1; f < p.freeze; f++) {
        expect(stars[f].fill!).toBeGreaterThanOrEqual(stars[f - 1].fill!);
        expect(stars[f].fill!).toBeLessThanOrEqual(v.fill);
        expect(stars[f].pending).toBeUndefined();
      }
      // figée avec l'image, à la part vraie de la note
      for (let f = p.freeze; f < v.drain[0]; f++) expect(stars[f].fill).toBeCloseTo(v.fill, 9);
      // deux battements du contour, après le coup du gel
      const seq = stars.map((s) => s.pending === 0.95);
      let blinks = 0;
      for (let i = 0; i < seq.length; i++) if (seq[i] && !seq[i - 1]) blinks++;
      expect(blinks).toBe(2);
      expect(seq[p.freeze]).toBe(false);
      expect(seq[p.cut]).toBe(false);
      for (const s of stars) if (s.pending !== undefined) expect([0.3, 0.95]).toContain(s.pending);
      // elle se vide, puis reste éteinte jusqu'au bout : la fiche se monte sur une image où plus rien ne bouge
      for (let f = v.drain[0] + 1; f < v.drain[1]; f++) expect(stars[f].fill!).toBeLessThan(stars[f - 1].fill!);
      for (let f = v.drain[1]; f < p.frames; f++) expect(stars[f]).toEqual({ on: false, scale: 1 });
      expect(hudAt(p, p.duration, "fr").stars[n]).toEqual({ on: false, scale: 1 });
    }
    const p6 = filmPlan(cardAt(6));
    for (let f = p6.freeze; f < p6.frames; f++) expect(hudAt(p6, at(f), "fr").stars.every((s) => s.on && !s.flying)).toBe(true);
  });

  it("le flash monte en quatre images jusqu'au sommet (la fiche se pose), puis s'efface ; l'habillage se lève", () => {
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

  it("l'habillage (étoiles, ombres d'encre) se pose en huit images à l'ouverture", () => {
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
  it("la radio : une ligne par étoile, une étiquette et un texte, qui citent les faits, dans les deux langues", () => {
    const fr = radioLines(FIXTURES.silver, "fr");
    expect(fr).toHaveLength(6);
    expect(fr[0]).toEqual({ label: "Véhicule en fuite", text: "Backend" });
    expect(fr[1]).toEqual({ label: "Arme signalée", text: "Python" });
    expect(fr[3]).toEqual({ label: "Affiliation", text: "Pharelune Santé" });
    expect(fr[4]).toEqual({ label: "Profil identifié", text: FIXTURES.silver.profile!.label.fr });
    expect(fr[5]).toEqual({ label: "Toutes les unités", text: "Priorité absolue" });
    expect(radioLines({ ...FIXTURES.silver, club: null }, "en")[3]).toEqual({ label: "Affiliation", text: "Lone wolf" });
    expect(radioLines({ ...FIXTURES.silver, profile: undefined }, "fr")[4]).toEqual({ label: "Profil", text: "Inconnu au fichier" });
    expect(radioLines({ ...FIXTURES.silver, profile: undefined }, "en")[4]).toEqual({ label: "Profile", text: "Not on file" });
    expect(radioLines({ ...FIXTURES.silver, mainLanguage: undefined }, "fr")[1]).toEqual({ label: "Arme signalée", text: "Polyglotte" });
    expect(radioLines({ ...FIXTURES.silver, statuses: [] }, "en")[2]).toEqual({ label: "Charge", text: "Still reading" });
  });

  it("le budget : une étiquette de 22 signes au plus, sans deux-points ni point médian ; jamais de ligne vide, sur toutes les fiches de démo", () => {
    expect(LINE_LABEL_MAX).toBe(22);
    for (const card of Object.values(FIXTURES)) {
      for (const lang of ["fr", "en"] as const) {
        for (const l of radioLines(card, lang)) {
          expect(l.label.length).toBeGreaterThan(0);
          expect(l.label.length).toBeLessThanOrEqual(LINE_LABEL_MAX);
          expect(l.label).not.toMatch(/[:·]/);
          expect(l.text.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("le chef d'accusation : son étiquette, puis son libellé tel quel", () => {
    const card = { ...FIXTURES.silver, statuses: [{ id: "gh_lazy_commits", tone: "negative" as const, label: { fr: "Commits : fix, fix2, final fix", en: "Commits: fix, fix2, final fix" }, rule: { fr: "", en: "" } }] };
    for (const lang of ["fr", "en"] as const) {
      const r = radioLines(card, lang);
      expect(r[2]).toEqual({ label: lang === "fr" ? "Chef d'accusation" : "Charge", text: card.statuses[0].label[lang] });
      for (const l of r) expect(`${l.label} ${l.text}`).not.toMatch(/motif/i);
    }
    const p = filmPlan({ ...cardAt(3), statuses: card.statuses });
    const h = hudAt(p, at(STAR_FRAMES[2] + 4), "fr");
    expect(h.line).toMatchObject({ label: "Chef d'accusation", text: "Commits : fix, fix2, final fix" });
  });
});

describe("le score qui monte (§18.78)", () => {
  const threshold = (k: Stars) => (k === 1 ? 0 : STAR_THRESHOLDS[k - 2]);
  for (const n of LEVELS) {
    it(`${n} étoile${n > 1 ? "s" : ""} : de 0 à la note, croissant, pile à la note au gel`, () => {
      const p = filmPlan(cardAt(n));
      expect(hudAt(p, at(0), "fr").score).toEqual({ value: 0, step: 0 });
      let prev = 0;
      for (let f = 0; f < p.freeze; f++) {
        const s = hudAt(p, at(f), "fr").score;
        expect(s.value).toBeGreaterThanOrEqual(prev);
        expect(s.value).toBeLessThanOrEqual(p.overall);
        prev = s.value;
      }
      // au gel, et jusqu'au flash : la note exacte, en montée comme en paliers
      for (const f of [p.freeze, p.flash.from, p.flash.peak - 1]) expect(hudAt(p, at(f), "fr").score).toEqual({ value: OVERALL[n], step: OVERALL[n] });
      // deux images avant le gel : pas encore la note (le dernier palier se termine au gel)
      expect(hudAt(p, at(p.freeze - 2), "fr").score.value).toBeLessThan(OVERALL[n]);
    });
  }
  it("chaque étoile gagnée monte au seuil de cette étoile, puis il tient jusqu'à la suivante", () => {
    const p = filmPlan(cardAt(6));
    for (const s of p.stars.slice(1)) {
      const before = hudAt(p, at(s.frame - 1), "fr").score;
      const after = hudAt(p, at(s.frame + 14), "fr").score;
      expect(before.value).toBe(threshold((s.star - 1) as Stars));
      expect(after).toEqual({ value: threshold(s.star), step: threshold(s.star) });
      // la montée : ni d'un coup, ni finie avant son palier ; en paliers, le saut tout de suite
      const mid = hudAt(p, at(s.frame + 3), "fr").score;
      expect(mid.value).toBeGreaterThan(before.value);
      expect(mid.value).toBeLessThan(after.value);
      expect(mid.step).toBe(threshold(s.star));
    }
  });
  it("l'étoile refusée : le score s'arrête sur la note, sous son seuil", () => {
    const p = filmPlan(cardAt(3, { overall: 53 }));
    expect(p.verdict?.missing).toBe(7);
    expect(hudAt(p, at(p.freeze), "fr").score.value).toBe(53);
    const all = Array.from({ length: p.flash.peak }, (_, f) => hudAt(p, at(f), "fr").score.value);
    expect(Math.max(...all)).toBe(53);
  });
});
