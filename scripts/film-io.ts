// Le montage du film : ce qui touche aux processus et aux fichiers (ffmpeg,
// ffprobe, resvg). La partie pure est dans film-lib.ts.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { FONT_FILES } from "../shared/card/fonts";
import { parseRate, type ProbeStream } from "./film-lib";

export const ROOT = resolve(import.meta.dirname, "..");

/** ffmpeg et ffprobe : Homebrew d'abord, sinon le PATH. */
function bin(name: string): string {
  const brew = `/opt/homebrew/bin/${name}`;
  return existsSync(brew) ? brew : name;
}
export const FFMPEG = bin("ffmpeg");
export const FFPROBE = bin("ffprobe");

export function run(cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${cmd} a échoué (${r.status}) :\n${r.stderr}\n  ${args.join(" ")}`);
  return r.stdout;
}

/** Lance ffmpeg en lui passant des images brutes sur l'entrée standard. */
export function runWithFrames(args: string[], frames: Iterable<Buffer>): Promise<void> {
  return new Promise((ok, ko) => {
    const p = spawn(FFMPEG, args, { stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", ko);
    p.on("close", (code) => (code === 0 ? ok() : ko(new Error(`ffmpeg a échoué (${code}) :\n${err}`))));
    p.stdin.on("error", () => {}); // l'erreur réelle arrive par close
    const it = frames[Symbol.iterator]();
    const pump = () => {
      for (let n = it.next(); !n.done; n = it.next()) if (!p.stdin.write(n.value)) return void p.stdin.once("drain", pump);
      p.stdin.end();
    };
    pump();
  });
}

const fonts = FONT_FILES.map((f) => resolve(ROOT, "server/fonts", f));
function resvg(svg: string): Resvg {
  return new Resvg(svg, { font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: "Outfit" } });
}
export const svgToPng = (svg: string): Buffer => resvg(svg).render().asPng();
export const svgToRgba = (svg: string): Buffer => Buffer.from(resvg(svg).render().pixels);

/** Cadence et nombre d'images d'une prise. */
export function probeTake(file: string): { fps: number; frames: number; width: number; height: number; duration: number } {
  const j = JSON.parse(
    run(FFPROBE, ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=r_frame_rate,avg_frame_rate,nb_read_packets,width,height:format=duration", "-of", "json", file]),
  );
  const s = j.streams?.[0];
  if (!s) throw new Error(`${file} : aucune piste vidéo`);
  return {
    fps: parseRate(s.avg_frame_rate) || parseRate(s.r_frame_rate),
    frames: Number(s.nb_read_packets),
    width: s.width,
    height: s.height,
    duration: Number(j.format?.duration ?? 0),
  };
}

/** Toutes les pistes, images comptées, et l'indicateur d'image clé de chaque image. */
export function probeOutput(file: string): { streams: ProbeStream[]; keyframes: boolean[] } {
  const j = JSON.parse(
    run(FFPROBE, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,codec_name,profile,width,height,r_frame_rate,avg_frame_rate,nb_read_frames", "-of", "json", file]),
  );
  const keys = run(FFPROBE, ["-v", "error", "-select_streams", "v:0", "-show_entries", "frame=key_frame", "-of", "csv=p=0", file])
    .trim()
    .split("\n")
    .map((l) => l.trim().startsWith("1"));
  return { streams: j.streams ?? [], keyframes: keys };
}

/** Une image d'une vidéo, réduite à `width`, en PNG data URI. */
export function frameDataUri(file: string, frame: number, width: number): string {
  const png = spawnSync(
    FFMPEG,
    ["-v", "error", "-i", file, "-vf", `select=eq(n\\,${frame}),scale=${width}:-2`, "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "-"],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  if (png.status !== 0 || !png.stdout.length) throw new Error(`image ${frame} de ${file} illisible : ${png.stderr}`);
  return "data:image/png;base64," + png.stdout.toString("base64");
}

export const readJson = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));
