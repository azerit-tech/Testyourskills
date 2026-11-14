// Les fichiers du film (web/src/film/media/) ont-ils les durées du découpage
// (shared/film/cut.ts) ? Chaque mp4 est compté image par image par ffprobe et
// comparé à filmFrames() : 414 images pour la poursuite, 52 pour la fin, 80
// pour la fin à six étoiles, à 24 i/s.
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
import { FPS } from "../shared/film/cut";
import { FFPROBE, ROOT, probeTake } from "./film-io";
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
  it("les six fichiers attendus, et aucun autre mp4", () => {
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
