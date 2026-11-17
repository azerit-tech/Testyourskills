// Les fichiers du film (web/src/film/media/) ont-ils les durées du découpage
// (shared/film/cut.ts, lu dans shared/film/parcours.json) ? Chaque mp4 est
// compté image par image par ffprobe et comparé à filmFrames() : 720 images pour
// `poursuite` (la poursuite et FIN6, un seul fichier depuis le trajet roulé
// d'un seul tenant, §18.56), à 24 i/s. Un autre mp4 resté là (`fin6-*`, `fin-*`)
// fait échouer le contrôle.
//
// Sans ffprobe, le contrôle se saute en le disant. GAP_EXPECTED vaut true sur
// la branche film/site-v5, tant que le rendu éclairé du trajet roulé n'est pas
// monté : les fichiers sont encore ceux de l'ancien découpage (414 images),
// l'écart ne s'affiche qu'en avertissement (tests « skipped » avec la raison) ;
// FILM_MEDIA_STRICT=1 le rend bloquant (FILM_MEDIA_STRICT=1 npx vitest run
// scripts/film-media.test.ts). Le rendu monté : GAP_EXPECTED à false.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FILM_FRAMES, FILM_SHOTS, FPS, SHOT_FRAMES, SHOT_START } from "../shared/film/cut";
import { STILL_AT, STILL_TRACED_FRAMES, type StillShot } from "../web/src/film/freeze";
import STILL from "../shared/film/still-cars.json";
import { FFMPEG, FFPROBE, ROOT, probeTake } from "./film-io";
import { FILMS, SIZES, filmFrames, type FilmId } from "./film-lib";

/** Un écart entre les fichiers et le découpage est-il attendu ? Oui, jusqu'au montage du rendu éclairé du trajet roulé. */
const GAP_EXPECTED = true;
const strict = !GAP_EXPECTED || process.env.FILM_MEDIA_STRICT === "1";

const MEDIA = resolve(ROOT, "web/src/film/media");
const hasFfprobe = !spawnSync(FFPROBE, ["-version"], { stdio: "ignore" }).error;
if (!hasFfprobe) console.warn(`[film] ffprobe introuvable (${FFPROBE}) : contrôle des durées de web/src/film/media/ sauté.`);

const expected = (Object.keys(FILMS) as FilmId[]).flatMap((film) => Object.keys(SIZES).map((size) => ({ film, file: `${film}-${size}.mp4` })));
const sec = (frames: number) => `${(frames / FPS).toFixed(2).replace(".", ",")} s`;
let gaps = 0;

describe.skipIf(!hasFfprobe)("film : les fichiers ont les durées du découpage", () => {
  it("les deux fichiers attendus, et aucun autre mp4", () => {
    const present = readdirSync(MEDIA).filter((f) => f.endsWith(".mp4")).sort();
    expect(present).toEqual(expected.map((e) => e.file).sort());
  });

  for (const { film, file } of expected) {
    it(`${file} : ${filmFrames(film)} images à ${FPS} i/s`, (ctx) => {
      const path = resolve(MEDIA, file);
      if (!existsSync(path)) throw new Error(`${file} manque`);
      const p = probeTake(path);
      const want = filmFrames(film);
      const problems: string[] = [];
      if (p.frames !== want) problems.push(`${p.frames} images (${sec(p.frames)}), le découpage en attend ${want} (${sec(want)})`);
      if (Math.abs(p.fps - FPS) > 0.01) problems.push(`${p.fps} i/s au lieu de ${FPS}`);
      if (!problems.length) return;
      const msg = `${file} : ${problems.join(" ; ")}`;
      if (strict) throw new Error(`${msg} (shared/film/cut.ts)`);
      gaps++;
      console.warn(`[film] écart connu, attendu jusqu'au montage des vrais plans : ${msg}`);
      ctx.skip(`écart connu : ${msg}`);
    });
  }

  it("écart connu résolu ? (rappel du drapeau)", () => {
    if (GAP_EXPECTED && gaps === 0) console.warn("[film] les fichiers suivent le découpage : passer GAP_EXPECTED à false dans scripts/film-media.test.ts.");
  });
});

/**
 * Les images gelées sur lesquelles la berline est détourée (STILL_CARS,
 * web/src/film/freeze.ts, §18.54) : l'empreinte (dHash, 8 × 16) de chacune
 * dans `poursuite-720.mp4`, relevée avec les contours dans
 * shared/film/still-cars.json (§18.57). Un nouveau rendu change l'image : les
 * contours sont alors à recalculer sur la scène qui l'a rendue, puis
 * l'empreinte à relever, deux commandes et rien à la main :
 *   python3 tools/film3d/render_film.py --still-cars   (fait par --assemble à chaque prise)
 *   python3 tools/film3d/render_film.py --empreintes web/src/film/media/poursuite-720.mp4
 */
const STILL_PRINTS = Object.fromEntries(Object.entries(STILL.berlines).map(([shot, b]) => [shot, b.empreinte])) as Record<StillShot, string | null>;
const REDO = "python3 tools/film3d/render_film.py --still-cars";
const REPRINT = "python3 tools/film3d/render_film.py --empreintes web/src/film/media/poursuite-720.mp4";

/** L'image gelée de chaque tronçon : sa dernière dans `poursuite` (pour FIN6, la dernière du fichier). */
const stillFrame = (shot: StillShot): number => SHOT_START[shot] + SHOT_FRAMES[shot] - 1;

/** L'image `frame` de `file`, réduite à 9 × 16 en gris, puis chaque pixel comparé à son voisin de droite. */
function dHash(file: string, frame: number): string {
  const r = spawnSync(FFMPEG, ["-v", "error", "-i", file, "-vf", `select=eq(n\\,${frame}),scale=9:16:flags=area,format=gray`, "-vframes", "1", "-f", "rawvideo", "-"], {
    maxBuffer: 1 << 20,
  });
  if (r.error || r.status !== 0 || r.stdout.length !== 144) throw new Error(`${file}, image ${frame} : lecture impossible`);
  let hex = "";
  for (let y = 0; y < 16; y++) {
    let byte = 0;
    for (let x = 0; x < 8; x++) byte = (byte << 1) | (r.stdout[y * 9 + x] > r.stdout[y * 9 + x + 1] ? 1 : 0);
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

const bitsApart = (a: string, b: string): number => {
  let n = 0;
  for (let i = 0; i < a.length; i += 2) {
    let v = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    for (; v; v &= v - 1) n++;
  }
  return n;
};

/**
 * Chaque test décode la vidéo depuis le début jusqu'à l'image gelée (jusqu'à
 * 720 images en 720p) : quelques secondes sur un Mac libre, 16 s mesurées pour
 * 354 images sur un Mac chargé avec deux workers. D'où un délai à part, bien
 * au-delà des 5 s par défaut.
 */
const DECODE_TIMEOUT = 120_000;

/** Le fichier haute monté : son nombre d'images (null sans ffprobe ou sans fichier). */
const STILL_FILE = "poursuite-720.mp4";
const mounted = hasFfprobe && existsSync(resolve(MEDIA, STILL_FILE)) ? probeTake(resolve(MEDIA, STILL_FILE)).frames : null;
/** Les fichiers de l'ancien découpage sont encore là : les images gelées du site n'y sont pas, le contrôle attend le rendu. */
const pending = mounted !== FILM_FRAMES;

describe.skipIf(!hasFfprobe)("film : la berline détourée tient encore les images gelées", { timeout: DECODE_TIMEOUT }, () => {
  for (const shot of FILM_SHOTS.filter((s): s is StillShot => s in STILL_PRINTS)) {
    const frame = stillFrame(shot);
    it(`${shot} : ${STILL_FILE}, image ${frame}, inchangée depuis le tracé`, (ctx) => {
      if (pending) {
        const msg = `${STILL_FILE} a ${mounted} images, le découpage en attend ${FILM_FRAMES} : l'empreinte de ${shot} (image ${frame}) se relève sur le rendu éclairé monté (${REPRINT})`;
        if (process.env.FILM_MEDIA_STRICT === "1") throw new Error(msg);
        ctx.skip(msg);
      }
      if (STILL_TRACED_FRAMES !== FILM_FRAMES || STILL_AT[shot] !== frame)
        throw new Error(`${shot} : contour calculé pour l'image ${STILL_AT[shot]} d'un fichier de ${STILL_TRACED_FRAMES} images, le découpage gèle l'image ${frame} sur ${FILM_FRAMES} : ${REDO}`);
      const print = dHash(resolve(MEDIA, STILL_FILE), frame);
      const want = STILL_PRINTS[shot];
      if (!want) throw new Error(`${shot} : pas d'empreinte dans shared/film/still-cars.json (celle du fichier : ${print}) : ${REPRINT}`);
      const apart = bitsApart(print, want);
      if (apart > 12)
        throw new Error(`${shot} a changé depuis l'export des contours (${apart} bits sur 128, empreinte ${print}) : ${REDO} sur la scène de ce rendu, puis ${REPRINT}`);
    });
  }
});
