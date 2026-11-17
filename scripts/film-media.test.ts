// Les fichiers du film (web/src/film/media/) ont-ils les durées du découpage
// (shared/film/cut.ts) ? Chaque mp4 est compté image par image par ffprobe et
// comparé à filmFrames() : 414 images pour la poursuite, 80 pour la fin à six
// étoiles, à 24 i/s. La fin une à cinq étoiles n'existe plus (§18.53) : un
// fichier `fin-*.mp4` resté là fait échouer le contrôle.
//
// Sans ffprobe, le contrôle se saute en le disant. L'écart des cartons (204,
// 36 et 56 images, d'avant le découpage v3) est résolu le 14 novembre 2026 :
// le brouillon éclairé est monté, GAP_EXPECTED vaut false et tout écart est
// bloquant. Le remettre à true n'affiche plus l'écart qu'en avertissement
// (tests « skipped » avec la raison) ; FILM_MEDIA_STRICT=1 le rend alors
// bloquant (FILM_MEDIA_STRICT=1 npx vitest run scripts/film-media.test.ts).

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CHASE_SHOTS, ENDINGS, FPS, SHOT_START } from "../shared/film/cut";
import type { StillShot } from "../web/src/film/freeze";
import { FFMPEG, FFPROBE, ROOT, probeTake } from "./film-io";
import { FILMS, SIZES, filmFrames, type FilmId } from "./film-lib";

/** Un écart entre les fichiers et le découpage est-il attendu ? Non depuis le montage du brouillon éclairé. */
const GAP_EXPECTED = false;
const strict = !GAP_EXPECTED || process.env.FILM_MEDIA_STRICT === "1";

const MEDIA = resolve(ROOT, "web/src/film/media");
const hasFfprobe = !spawnSync(FFPROBE, ["-version"], { stdio: "ignore" }).error;
if (!hasFfprobe) console.warn(`[film] ffprobe introuvable (${FFPROBE}) : contrôle des durées de web/src/film/media/ sauté.`);

const expected = (Object.keys(FILMS) as FilmId[]).flatMap((film) => Object.keys(SIZES).map((size) => ({ film, file: `${film}-${size}.mp4` })));
const sec = (frames: number) => `${(frames / FPS).toFixed(2).replace(".", ",")} s`;
let gaps = 0;

describe.skipIf(!hasFfprobe)("film : les fichiers ont les durées du découpage", () => {
  it("les quatre fichiers attendus, et aucun autre mp4", () => {
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
 * relevée le 17 novembre 2026 sur `*-720.mp4`. Un nouveau rendu change l'image :
 * le contour ne tient plus la voiture. Il faut alors le retracer, puis relever
 * l'empreinte ici.
 */
const STILL_PRINTS: Record<StillShot, string> = {
  P1: "02030105310a1527b01754f392d258c9",
  P2: "80918a80a5cdc888301050484d050722",
  P3: "59c046c45142e0f2f0d49088989a5e1f",
  P4: "d5d5cd9d89aa5afb3535b03748a18029",
  P5: "00000844070747c71311317101414006",
  FIN6: "000000808011341595c1e0c881408000",
};

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

describe.skipIf(!hasFfprobe)("film : la berline détourée tient encore les images gelées", () => {
  for (const shot of Object.keys(STILL_PRINTS) as StillShot[]) {
    // P1 à P5 : la dernière image du plan dans la poursuite ; FIN6 : la dernière de la fin
    const [file, frame] = shot === "FIN6" ? ["fin6-720.mp4", ENDINGS.fin6.video - 1] : ["poursuite-720.mp4", SHOT_START[CHASE_SHOTS[CHASE_SHOTS.indexOf(shot) + 1]] - 1];
    it(`${shot} : ${file}, image ${frame}, inchangée depuis le tracé`, () => {
      const print = dHash(resolve(MEDIA, file), frame);
      const apart = bitsApart(print, STILL_PRINTS[shot]);
      if (apart > 12) throw new Error(`${shot} a changé (${apart} bits sur 128, empreinte ${print}) : retracer STILL_CARS.${shot} dans web/src/film/freeze.ts, puis relever l'empreinte`);
    });
  }
});
