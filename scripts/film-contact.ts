// Planche-contact d'une prise (docs/cinematique-poursuite.md §6 T2, critère 6) :
// une image sur quatre, numérotée dans la prise, recadrée comme au montage, les zones
// du §7.3 en filet, pour choisir l'image d'entrée ; plus la grille vide du §7.10.
// Les images de la fenêtre que montage.json retient déjà sont marquées « > ».
// Usage : npx tsx scripts/film-contact.ts chemin/de/P3-2.mp4 [--every=4] [--width=160] [--out=dossier]
// Défaut : var/film/contact/P3-2.png et var/film/contact/P3-2-avis.md (ignorés par git).
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { FPS, SHOTS, SHOT_FRAMES, checklist, cropFilters, parseMontage, sheetSvg, sourceFramesNeeded, type ShotEdit, type ShotId } from "./film-lib";
import { FFMPEG, ROOT, probeTake, readJson, run, svgToPng } from "./film-io";

const args = process.argv.slice(2);
const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const input = args.find((a) => !a.startsWith("--"));
if (!input) {
  console.error("Usage : npx tsx scripts/film-contact.ts chemin/de/la-prise.mp4 [--every=4] [--width=160] [--out=dossier]");
  process.exit(2);
}
const take = resolve(input);
const every = Number(opt("every") ?? 4);
const width = Number(opt("width") ?? 160);
const OUT = resolve(opt("out") ?? resolve(ROOT, "var/film/contact"));
mkdirSync(OUT, { recursive: true });
const name = basename(take, extname(take));

// Le plan de la prise (« P3-2 » → P3), et son entrée dans la liste de montage si elle la cite.
const shot = SHOTS.find((s) => name.startsWith(`${s}-`)) as ShotId | undefined;
const montage = parseMontage(readJson(resolve(ROOT, "tools/film/montage.json")));
const edit: ShotEdit | undefined = shot && montage.shots[shot].take === basename(take) ? montage.shots[shot] : undefined;

const p = probeTake(take);
const window = edit && shot ? { from: edit.in, to: edit.in + sourceFramesNeeded(SHOT_FRAMES[shot], edit.speed, p.fps) } : null;

const tmp = mkdtempSync(resolve(tmpdir(), "film-contact-"));
try {
  const vf = [`select='not(mod(n\\,${every}))'`, ...cropFilters(edit?.crop ?? null), `scale=${width}:-2`].join(",");
  run(FFMPEG, ["-v", "error", "-i", take, "-vf", vf, "-fps_mode", "vfr", resolve(tmp, "%04d.png")]);
  const files = readdirSync(tmp).filter((f) => f.endsWith(".png")).sort();
  const cells = files.map((f, i) => {
    const n = i * every;
    const inWin = window && n >= window.from && n < window.to;
    const t = (n / p.fps).toFixed(2).replace(".", ",");
    return { href: "data:image/png;base64," + readFileSync(resolve(tmp, f)).toString("base64"), label: `${inWin ? "> " : ""}${n} · ${t} s` };
  });
  const info = `${p.width} × ${p.height}, ${p.fps.toFixed(3)} i/s, ${p.frames} images (${p.duration.toFixed(2)} s)`;
  const need = shot ? `${shot} garde ${SHOT_FRAMES[shot]} images à ${FPS} i/s, soit ${sourceFramesNeeded(SHOT_FRAMES[shot], edit?.speed ?? 1, p.fps)} images de la prise à la vitesse ${edit?.speed ?? 1}` : "plan inconnu (nom attendu : PLAN-prise.mp4)";
  const title = [`${basename(take)} · ${info} · une image sur ${every}`, `${need}${window ? ` · montage : images ${window.from} à ${window.to - 1} (>)` : ""}`];
  const png = resolve(OUT, `${name}.png`);
  writeFileSync(png, svgToPng(sheetSvg(cells, { cols: 10, cellW: width, title })));
  const md = resolve(OUT, `${name}-avis.md`);
  writeFileSync(md, checklist(basename(take), `${info}. ${need}.${window ? ` Fenêtre actuelle du montage : images ${window.from} à ${window.to - 1}.` : ""}\n\nPlanche : ${png}`));
  console.log(`Planche : ${png}\nGrille  : ${md}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
