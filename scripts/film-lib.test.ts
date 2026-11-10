import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CEILINGS,
  NEUTRAL_GRADE,
  SHOTS,
  TOTAL_CEILINGS,
  checkProbe,
  concatList,
  cropFilters,
  encodeArgs,
  filmFrames,
  gradeFilters,
  keyframeErrors,
  nextCrf,
  parseMontage,
  parseRate,
  shotStarts,
  slateSegmentArgs,
  slateSvg,
  sourceFramesNeeded,
  takeFilter,
  takeSegmentArgs,
  windowFits,
  type ProbeStream,
} from "./film-lib";

const shots = Object.fromEntries(SHOTS.map((s) => [s, { take: null, in: 0, speed: 1, crop: null }]));

describe("la liste de montage", () => {
  it("lit tools/film/montage.json", () => {
    const m = parseMontage(JSON.parse(readFileSync(resolve(import.meta.dirname, "../tools/film/montage.json"), "utf8")));
    expect(Object.keys(m.shots)).toEqual([...SHOTS]);
    expect(m.shots.OUV.take).toBe("OUV-1.mp4");
  });

  it("ignore les commentaires et complète les valeurs par défaut", () => {
    const m = parseMontage({ "//": "note", shots: { ...shots, P3: { "//": "x", take: "P3-2.mp4" } } });
    expect(m.shots.P3).toEqual({ take: "P3-2.mp4", in: 0, speed: 1, crop: null });
    expect(m.grade).toEqual(NEUTRAL_GRADE);
  });

  it("liste toutes les erreurs d'un coup", () => {
    const bad = { ...shots, P1: { take: "../x.mp4", in: -1, speed: 9, crop: { x: 0.5, y: 0, w: 0.6, h: 1 } }, P9: {} };
    delete (bad as Record<string, unknown>).FIN6;
    let msg = "";
    try {
      parseMontage({ grade: { saturation: 5, shadows: [0, 2] }, shots: bad });
    } catch (e) {
      msg = (e as Error).message;
    }
    for (const part of ["P1.take", "P1.in", "P1.speed", "P1.crop", "P9", "FIN6 : manquant", "grade.saturation", "grade.shadows"]) expect(msg).toContain(part);
  });
});

describe("l'arithmétique des images", () => {
  it("donne 204, 36 et 56 images", () => {
    expect(filmFrames("poursuite")).toBe(204);
    expect(filmFrames("fin")).toBe(36);
    expect(filmFrames("fin6")).toBe(56);
    // Les durées du tableau du §2.1, fin dessinée comprise (24 et 24 images d'arrêt et de flash).
    expect(shotStarts("poursuite")).toEqual({ OUV: 0, P1: 24, P2: 52, P3: 80, P4: 108, P5: 136, P6: 164 });
    expect(shotStarts("poursuite").P2 + 36 + 24).toBe(112);
    expect(204 + 56 + 24).toBe(284);
  });

  it("compte les images de prise à consommer", () => {
    expect(sourceFramesNeeded(28, 1, 24)).toBe(28);
    expect(sourceFramesNeeded(36, 1, 25)).toBe(38);
    expect(sourceFramesNeeded(36, 0.5, 24)).toBe(18);
    expect(sourceFramesNeeded(28, 1, 30)).toBe(35);
    expect(windowFits({ take: "a.mp4", in: 100, speed: 1, crop: null }, 28, 24, 120)).toEqual({ needed: 28, available: 20, ok: false });
  });

  it("lit les cadences", () => {
    expect(parseRate("24/1")).toBe(24);
    expect(parseRate("24000/1001")).toBeCloseTo(23.976, 3);
    expect(parseRate(undefined)).toBe(0);
  });
});

describe("les arguments de ffmpeg", () => {
  it("coupe la prise à son nombre exact d'images", () => {
    const f = takeFilter({ take: "a.mp4", in: 12, speed: 0.5, crop: null }, 36, NEUTRAL_GRADE);
    expect(f.startsWith("trim=start_frame=12,setpts=(PTS-STARTPTS)/0.5,fps=24,")).toBe(true);
    expect(f).toContain("scale=720:1280");
    expect(f).toContain("tpad=stop_mode=clone:stop=-1,trim=end_frame=36");
    expect(f).not.toContain("eq=");
    const a = takeSegmentArgs("in.mp4", "out.mkv", { take: "a.mp4", in: 0, speed: 1, crop: null }, 28, NEUTRAL_GRADE);
    expect(a.slice(a.indexOf("-frames:v"), a.indexOf("-frames:v") + 2)).toEqual(["-frames:v", "28"]);
    expect(a).toContain("-an");
  });

  it("recadre puis met au 9:16", () => {
    expect(cropFilters(null)).toEqual(["crop='min(iw,ih*9/16)':'min(ih,iw*16/9)'"]);
    expect(cropFilters({ x: 0.1, y: 0, w: 0.5, h: 1 })[0]).toBe("crop=iw*0.5:ih*1:iw*0.1:ih*0");
  });

  it("étalonne", () => {
    const g = gradeFilters({ ...NEUTRAL_GRADE, saturation: 1.05, shadows: [0.04, -0.03, 0.06], lut: "nuit.cube" }, "/x/nuit.cube");
    expect(g).toEqual(["eq=contrast=1:brightness=0:saturation=1.05:gamma=1", "colorbalance=rs=0.04:gs=-0.03:bs=0.06:rm=0:gm=0:bm=0:rh=0:gh=0:bh=0", "lut3d=file='/x/nuit.cube'"]);
    expect(gradeFilters(NEUTRAL_GRADE)).toEqual([]);
  });

  it("encode en H.264 Main, 24 i/s, une image clé toutes les 12, +faststart, sans son", () => {
    const a = encodeArgs({ list: "l.txt", out: "o.mp4", size: 540, crf: 25, frames: 204 }).join(" ");
    for (const part of ["-profile:v main", "-r 24", "-frames:v 204", "-g 12", "-keyint_min 12", "-sc_threshold 0", "-movflags +faststart", "-an", "-crf 25", "scale=540:960"])
      expect(a).toContain(part);
    expect(encodeArgs({ list: "l.txt", out: "o.mp4", size: 720, crf: 23, frames: 36 }).join(" ")).not.toContain("scale=");
    expect(slateSegmentArgs("s.mkv", 24).join(" ")).toContain("-f rawvideo -pix_fmt rgba -s 720x1280 -r 24 -i -");
    expect(concatList(["/a/b.mkv", "/a/it's.mkv"])).toBe("file '/a/b.mkv'\nfile '/a/it'\\''s.mkv'\n");
  });

  it("baisse la qualité par pas de 2, jusqu'à 36", () => {
    expect(nextCrf(23)).toBe(25);
    expect(nextCrf(35)).toBeNull();
  });

  it("tient les plafonds du §4.1", () => {
    expect(CEILINGS[720]).toEqual({ poursuite: 2_800_000, fin: 600_000, fin6: 1_000_000 });
    const s540 = Object.values(CEILINGS[540]).reduce((a, b) => a + b, 0);
    expect(s540).toBeLessThanOrEqual(TOTAL_CEILINGS[540]);
  });
});

describe("la vérification", () => {
  const ok: ProbeStream = { codec_type: "video", codec_name: "h264", profile: "Main", width: 720, height: 1280, r_frame_rate: "24/1", avg_frame_rate: "24/1", nb_read_frames: "36" };
  const keys = Array.from({ length: 36 }, (_, i) => i % 12 === 0);

  it("accepte un fichier conforme", () => {
    expect(checkProbe([ok], keys, { frames: 36, width: 720, height: 1280 })).toEqual([]);
  });

  it("refuse le son, une image de trop, la mauvaise cadence", () => {
    const errs = checkProbe([{ ...ok, nb_read_frames: "37", r_frame_rate: "25/1" }, { codec_type: "audio" }], keys, { frames: 36, width: 720, height: 1280 });
    expect(errs.join(" | ")).toMatch(/piste son.*cadence.*37 images/);
  });

  it("repère une image clé mal placée", () => {
    expect(keyframeErrors(keys, 12)).toBeNull();
    const k = [...keys];
    k[5] = true;
    expect(keyframeErrors(k, 12)).toContain("5");
  });
});

describe("les cartons", () => {
  it("portent le nom du plan et le numéro d'image", () => {
    const svg = slateSvg({ shot: "P2", local: 3, fileFrame: 55, fileFrames: 204 });
    expect(svg).toContain(">P2<");
    expect(svg).toContain(">055<");
    expect(svg).toContain("PLAN 4 / 28");
    expect(svg).toContain('fill="#4b4fb8"');
  });
});
