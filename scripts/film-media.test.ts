// Les fichiers du film (web/src/film/media/) ont-ils les durées du découpage
// (shared/film/cut.ts, lu dans shared/film/parcours.json) ? Chaque mp4 est
// compté image par image par ffprobe et comparé à filmFrames() : 720 images pour
// `poursuite` (la poursuite et FIN6, un seul fichier depuis le trajet roulé
// d'un seul tenant, §18.56), à 24 i/s. Un autre mp4 resté là (`fin6-*`, `fin-*`)
// fait échouer le contrôle.
//
// Sans ffprobe, le contrôle se saute en le disant. GAP_EXPECTED : true tant
// que les fichiers ne suivent pas le découpage (l'écart n'est qu'un
// avertissement, FILM_MEDIA_STRICT=1 le rend bloquant) ; false depuis le rendu
// final v11 monté (SPEC §18.78) : les contrôles sont bloquants.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FILM_FRAMES, FILM_SHOTS, FPS, SHOT_FRAMES, SHOT_START } from "../shared/film/cut";
import { STILL_TRACED_FRAMES, type StillShot } from "../web/src/film/freeze";
import { FFMPEG, FFPROBE, ROOT, probeTake } from "./film-io";
import { FILMS, SIZES, filmFrames, type FilmId } from "./film-lib";

/** Un écart entre les fichiers et le découpage est-il attendu ? Oui, jusqu'au montage du rendu éclairé du trajet roulé. */
const GAP_EXPECTED = false;
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
 * web/src/film/freeze.ts, §18.54) : l'empreinte (dHash, 8 × 16) de chacune,
 * relevée sur `poursuite-720.mp4`. Un nouveau rendu change l'image : le contour
 * ne tient plus la voiture. Il faut alors le retracer, puis relever l'empreinte ici.
 *
 * Relevées le 18 novembre (SPEC §18.78) sur le rendu final v11, monté en
 * 720 images. Celles de l'ancien découpage (17 novembre, fichiers de 414 et 80
 * images) : P1 02030105…, P2 80918a80…, P3 59c046c4…, P4 d5d5cd9d…, P5
 * 00000844…, FIN6 00000080….
 */
const STILL_PRINTS: Record<StillShot, string | null> = {
  P1: "00000180a1a58cb1f2f3f1fdbdb6e6d6",
  P2: "250574554197905163a0206020223018",
  P3: "0000141408020b539272f1f1f1e1e1c0",
  P4: "00000000a3a595a22335a0b093810101",
  P5: "00c202050302032138ece8f82c285891",
  FIN6: "0000802038383e3ef3f9f87079787e7f",
};

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
        const msg = `${STILL_FILE} a ${mounted} images, le découpage en attend ${FILM_FRAMES} : STILL_CARS.${shot} se retrace sur le rendu éclairé (image ${frame})`;
        if (process.env.FILM_MEDIA_STRICT === "1") throw new Error(msg);
        ctx.skip(msg);
      }
      const print = dHash(resolve(MEDIA, STILL_FILE), frame);
      const want = STILL_PRINTS[shot];
      if (want === null || STILL_TRACED_FRAMES !== FILM_FRAMES)
        throw new Error(`${shot} pas encore tracé sur le fichier de ${FILM_FRAMES} images : retracer STILL_CARS.${shot} (web/src/film/freeze.ts) sur l'image ${frame}, passer STILL_TRACED_FRAMES à ${FILM_FRAMES}, puis relever l'empreinte ${print} dans STILL_PRINTS`);
      const apart = bitsApart(print, want);
      if (apart > 12) throw new Error(`${shot} a changé (${apart} bits sur 128, empreinte ${print}) : retracer STILL_CARS.${shot} dans web/src/film/freeze.ts, puis relever l'empreinte`);
    });
  }
});
