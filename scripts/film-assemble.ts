// Le montage du film (docs/cinematique-poursuite.md §5.1, §6 T2) : chaque plan est
// coupé à son nombre exact d'images, étalonné, mis au 9:16, puis les plans sont
// recollés et encodés en poursuite / fin / fin6, en 720p et 540p, avec l'affiche.
// Une prise absente est remplacée par son carton (aplat, nom du plan, numéro d'image,
// zones du §7.3), sans erreur. Le script vérifie ensuite chaque fichier par ffprobe
// et tient les plafonds de poids du §4.1 en baissant la qualité s'il le faut.
//
// Usage : npx tsx scripts/film-assemble.ts [--plans=dossier] [--slates] [--out=dossier]
//   --plans  : les prises (défaut ~/Desktop/Azerit/design/film/plans, hors du dépôt)
//   --slates : ignore les prises, tout en cartons
//   --out    : les fichiers du site (défaut web/src/film/media, importés par Vite)
// Intermédiaires et planche des neuf plans dans var/film/ (ignoré par git).
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import {
  CEILINGS,
  FILMS,
  POSTER_CEILING,
  SHOTS,
  SHOT_FRAMES,
  SIZES,
  TOTAL_CEILINGS,
  checkProbe,
  concatList,
  encodeArgs,
  filmFrames,
  nextCrf,
  parseMontage,
  posterArgs,
  sheetSvg,
  shotStarts,
  slateSegmentArgs,
  slateSvg,
  takeSegmentArgs,
  windowFits,
  type FilmId,
  type ShotId,
  type SizeId,
} from "./film-lib";
import { FFMPEG, ROOT, frameDataUri, probeOutput, probeTake, readJson, run, runWithFrames, svgToPng, svgToRgba } from "./film-io";

const t0 = Date.now();
const args = process.argv.slice(2);
const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const PLANS = resolve(opt("plans") ?? resolve(homedir(), "Desktop/Azerit/design/film/plans"));
const OUT = resolve(opt("out") ?? resolve(ROOT, "web/src/film/media"));
const WORK = resolve(ROOT, "var/film");
const SEG = resolve(WORK, "seg");
const ONLY_SLATES = args.includes("--slates");
mkdirSync(OUT, { recursive: true });
mkdirSync(SEG, { recursive: true });

const montage = parseMontage(readJson(resolve(ROOT, "tools/film/montage.json")));
const lutPath = montage.grade.lut ? resolve(ROOT, "tools/film", montage.grade.lut) : undefined;
if (lutPath && !existsSync(lutPath)) throw new Error(`LUT introuvable : ${lutPath}`);

const warnings: string[] = [];
const warn = (m: string) => {
  warnings.push(m);
  console.warn(`  ! ${m}`);
};

/** Où commence un plan dans son fichier, et la longueur du fichier. */
function placeOf(shot: ShotId): { start: number; total: number } {
  for (const film of Object.keys(FILMS) as FilmId[]) {
    const starts = shotStarts(film);
    if (shot in starts) return { start: starts[shot], total: filmFrames(film) };
  }
  throw new Error(shot);
}

function* slateFrames(shot: ShotId): Generator<Buffer> {
  const { start, total } = placeOf(shot);
  for (let i = 0; i < SHOT_FRAMES[shot]; i++) yield svgToRgba(slateSvg({ shot, local: i, fileFrame: start + i, fileFrames: total }));
}

// 1. Un intermédiaire sans perte par plan.
console.log(`Prises lues dans ${PLANS}${existsSync(PLANS) ? "" : " (dossier absent : tout en cartons)"}`);
const available = existsSync(PLANS) ? readdirSync(PLANS) : [];
const source: Record<string, string> = {};
for (const shot of SHOTS) {
  const edit = montage.shots[shot];
  const n = SHOT_FRAMES[shot];
  const seg = resolve(SEG, `${shot}.mkv`);
  const takePath = edit.take && !ONLY_SLATES ? resolve(PLANS, edit.take) : null;
  if (takePath && existsSync(takePath)) {
    const p = probeTake(takePath);
    const fit = windowFits(edit, n, p.fps, p.frames);
    if (!fit.ok) warn(`${shot} : ${edit.take} n'a que ${fit.available} images après l'image ${edit.in}, il en faut ${fit.needed} ; la dernière est tenue`);
    if (Math.abs(p.width / p.height - 9 / 16) > 0.01 && !edit.crop) warn(`${shot} : ${edit.take} est en ${p.width} × ${p.height}, recadré au centre en 9:16`);
    run(FFMPEG, takeSegmentArgs(takePath, seg, edit, n, montage.grade, lutPath));
    source[shot] = `${edit.take} dès l'image ${edit.in}, vitesse ${edit.speed} (${p.width} × ${p.height}, ${p.fps.toFixed(3)} i/s, ${p.frames} images)`;
  } else {
    if (takePath) warn(`${shot} : ${edit.take} absente, carton à la place`);
    await runWithFrames(slateSegmentArgs(seg, n), slateFrames(shot));
    const takes = available.filter((f) => f.startsWith(`${shot}-`));
    source[shot] = `carton${takes.length ? ` (prises disponibles : ${takes.join(", ")})` : ""}`;
  }
  console.log(`  ${shot.padEnd(4)} ${String(n).padStart(2)} images  ${source[shot]}`);
}

// 2. Les six films, sous leurs plafonds.
const START_CRF: Record<SizeId, number> = { 720: 23, 540: 24 };
const crf: Record<string, number> = {};
const sizes: Record<string, number> = {};
const outName = (film: FilmId, size: SizeId) => `${film}-${size}.mp4`;

function encode(film: FilmId, size: SizeId) {
  const list = resolve(WORK, `${film}.txt`);
  writeFileSync(list, concatList(FILMS[film].map((s) => resolve(SEG, `${s}.mkv`))));
  const out = resolve(OUT, outName(film, size));
  run(FFMPEG, encodeArgs({ list, out, size, crf: crf[out], frames: filmFrames(film) }));
  sizes[out] = statSync(out).size;
  return out;
}

for (const size of [720, 540] as SizeId[]) {
  for (const film of Object.keys(FILMS) as FilmId[]) {
    const out = resolve(OUT, outName(film, size));
    crf[out] = START_CRF[size];
    encode(film, size);
    while (sizes[out] > CEILINGS[size][film]) {
      const next = nextCrf(crf[out]);
      if (next === null) {
        warn(`${basename(out)} : ${kb(sizes[out])} au CRF ${crf[out]}, toujours au-dessus du plafond de ${kb(CEILINGS[size][film])}`);
        break;
      }
      warn(`${basename(out)} : ${kb(sizes[out])} au CRF ${crf[out]} dépasse ${kb(CEILINGS[size][film])}, qualité baissée au CRF ${next}`);
      crf[out] = next;
      encode(film, size);
    }
  }
  // Le total d'un joueur : on baisse le plus lourd tant qu'il dépasse.
  const files = (Object.keys(FILMS) as FilmId[]).map((f) => resolve(OUT, outName(f, size)));
  for (let total = sum(files); total > TOTAL_CEILINGS[size]; total = sum(files)) {
    const heavy = files.reduce((a, b) => (sizes[a] >= sizes[b] ? a : b));
    const next = nextCrf(crf[heavy]);
    if (next === null) {
      warn(`${size}p : ${kb(total)} en tout, au-dessus de ${kb(TOTAL_CEILINGS[size])}, qualité au plus bas`);
      break;
    }
    warn(`${size}p : ${kb(total)} en tout dépasse ${kb(TOTAL_CEILINGS[size])}, ${basename(heavy)} passe au CRF ${next}`);
    crf[heavy] = next;
    encode(basename(heavy).split("-")[0] as FilmId, size);
  }
}

// 3. L'affiche : la première image du montage.
const poster = resolve(OUT, "affiche.jpg");
let q = 3;
run(FFMPEG, posterArgs(resolve(SEG, "OUV.mkv"), poster, q));
while (statSync(poster).size > POSTER_CEILING && q < 31) {
  warn(`affiche.jpg : ${kb(statSync(poster).size)} à q ${q} dépasse ${kb(POSTER_CEILING)}, qualité baissée`);
  q += 2;
  run(FFMPEG, posterArgs(resolve(SEG, "OUV.mkv"), poster, q));
}
sizes[poster] = statSync(poster).size;

// 4. La vérification.
let failed = false;
console.log("\nVérification ffprobe");
for (const size of [720, 540] as SizeId[]) {
  for (const film of Object.keys(FILMS) as FilmId[]) {
    const out = resolve(OUT, outName(film, size));
    const p = probeOutput(out);
    const errs = checkProbe(p.streams, p.keyframes, { frames: filmFrames(film), width: SIZES[size][0], height: SIZES[size][1] });
    if (sizes[out] > CEILINGS[size][film]) errs.push(`au-dessus du plafond de ${kb(CEILINGS[size][film])}`);
    failed ||= errs.length > 0;
    const v = p.streams.find((s) => s.codec_type === "video");
    console.log(
      `  ${basename(out).padEnd(18)} ${v?.nb_read_frames} images  ${v?.width} × ${v?.height}  ${v?.r_frame_rate}  ${kb(sizes[out]).padStart(8)} / ${kb(CEILINGS[size][film])}  CRF ${crf[out]}  ${errs.length ? "ÉCHEC : " + errs.join(" ; ") : "ok"}`,
    );
  }
  const files = (Object.keys(FILMS) as FilmId[]).map((f) => resolve(OUT, outName(f, size)));
  console.log(`  ${`total ${size}p`.padEnd(18)} ${kb(sum(files))} / ${kb(TOTAL_CEILINGS[size])}`);
}
const posterProbe = probeOutput(poster).streams[0];
const posterOk = posterProbe?.width === 720 && posterProbe?.height === 1280 && sizes[poster] <= POSTER_CEILING;
failed ||= !posterOk;
console.log(`  ${"affiche.jpg".padEnd(18)} ${posterProbe?.width} × ${posterProbe?.height}  ${kb(sizes[poster])} / ${kb(POSTER_CEILING)}  q ${q}  ${posterOk ? "ok" : "ÉCHEC"}`);

// 5. La planche des neuf plans, côte à côte (même nuit ?), à l'image du milieu.
const cells = SHOTS.map((s) => ({ href: frameDataUri(resolve(SEG, `${s}.mkv`), Math.floor(SHOT_FRAMES[s] / 2), 200), label: s }));
writeFileSync(resolve(WORK, "planche-plans.png"), svgToPng(sheetSvg(cells, { cols: 9, cellW: 200, title: ["Les neuf plans, image du milieu"] })));
console.log(`\nPlanche des plans : ${resolve(WORK, "planche-plans.png")}`);

console.log(`Montage en ${((Date.now() - t0) / 1000).toFixed(1)} s${warnings.length ? `, ${warnings.length} avertissement(s)` : ""}.`);
if (failed) process.exit(1);

function sum(files: string[]) {
  return files.reduce((n, f) => n + sizes[f], 0);
}
function kb(n: number) {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)} Mo` : `${(n / 1000).toFixed(1)} Ko`;
}
