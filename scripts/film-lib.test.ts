import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CEILINGS,
  CeilingError,
  MAX_CRF,
  MAX_GOP,
  NEUTRAL_GRADE,
  SHOTS,
  SHOT_FRAMES,
  TOTAL_CEILINGS,
  checkProbe,
  concatList,
  cropFilters,
  encodeArgs,
  filmFrames,
  fitCeilings,
  forceKeyframesExpr,
  gradeFilters,
  keyframeErrors,
  keyframePlan,
  personBytes,
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
import { CHASE_FRAMES, ENDINGS, SHOT_START } from "../shared/film/cut";

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
  it("lit les durées de shared/film/cut.ts : la poursuite, les vidéos des deux fins, les premières images", () => {
    expect(filmFrames("poursuite")).toBe(CHASE_FRAMES);
    expect(filmFrames("fin")).toBe(ENDINGS.fin.video);
    expect(filmFrames("fin6")).toBe(ENDINGS.fin6.video);
    expect(shotStarts("poursuite")).toEqual(SHOT_START);
    expect(shotStarts("fin")).toEqual({ FIN: 0 });
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

  it("encode en H.264 Main, 24 i/s, images clés sur les coupes, couleurs bt709, +faststart, sans son", () => {
    const keys = keyframePlan("poursuite");
    const a = encodeArgs({ list: "l.txt", out: "o.mp4", size: 540, crf: 25, frames: CHASE_FRAMES, keys }).join(" ");
    for (const part of ["-profile:v main", "-r 24", `-frames:v ${CHASE_FRAMES}`, "-g 48", "-sc_threshold 0", "-forced-idr 1", "-movflags +faststart", "-an", "-crf 25", "scale=540:960"])
      expect(a).toContain(part);
    expect(a).toContain(`-force_key_frames ${forceKeyframesExpr(keys)}`);
    expect(a).toContain("-force_key_frames expr:eq(n,0)+eq(n,40)+eq(n,88)+eq(n,136)+eq(n,172)+eq(n,220)+eq(n,268)+eq(n,316)+eq(n,328)+eq(n,376)");
    for (const tag of ["-colorspace bt709", "-color_primaries bt709", "-color_trc bt709", "-color_range tv"]) expect(a).toContain(tag);
    expect(a).not.toContain("-g 12");
    expect(encodeArgs({ list: "l.txt", out: "o.mp4", size: 720, crf: 23, frames: 36, keys: [0] }).join(" ")).not.toContain("scale=");
    // les intermédiaires passent aussi en bt709, cartons compris (RVB vers la matrice du HD, pas celle du SD)
    const tagged = "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709";
    expect(slateSegmentArgs("s.mkv", 24).join(" ")).toContain(tagged);
    expect(takeFilter({ take: "a.mp4", in: 0, speed: 1, crop: null }, 28, NEUTRAL_GRADE).endsWith(tagged)).toBe(true);
    expect(a).toContain("format=yuv420p,setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709");
    expect(slateSegmentArgs("s.mkv", 24).join(" ")).toContain("-f rawvideo -pix_fmt rgba -s 720x1280 -r 24 -i -");
    expect(concatList(["/a/b.mkv", "/a/it's.mkv"])).toBe("file '/a/b.mkv'\nfile '/a/it'\\''s.mkv'\n");
  });

  it("baisse la qualité par pas de 2, jusqu'au CRF 28 et pas au-delà", () => {
    expect(MAX_CRF).toBe(28);
    expect(nextCrf(20)).toBe(22);
    expect(nextCrf(27)).toBe(28);
    expect(nextCrf(28)).toBeNull();
  });

  it("tient les plafonds du §4.1 : 4,5 / 0,9 / 1,4 Mo en 720p, 2,2 Mo pour une personne en 540p", () => {
    expect(CEILINGS[720]).toEqual({ poursuite: 4_500_000, fin: 900_000, fin6: 1_400_000 });
    expect(TOTAL_CEILINGS[720]).toBe(5_900_000);
    expect(TOTAL_CEILINGS[540]).toBe(2_200_000);
    // une personne charge la poursuite et une seule fin
    expect(personBytes(CEILINGS[720])).toBe(TOTAL_CEILINGS[720]);
    expect(personBytes(CEILINGS[540])).toBeLessThanOrEqual(TOTAL_CEILINGS[540]);
    expect(personBytes(CEILINGS[540])).toBeGreaterThan(TOTAL_CEILINGS[540] - 10);
    for (const f of ["poursuite", "fin", "fin6"] as const) expect(CEILINGS[540][f]).toBeLessThan(CEILINGS[720][f]);
  });
});

describe("les images clés", () => {
  it("sur chaque coupe entre plans, plus une toutes les 48 images au plus", () => {
    expect(MAX_GOP).toBe(48);
    // les coupes de cut.ts ; P2 (84 images), P5 (60), P6 (60), FIN (52) et FIN6 (80) en reçoivent une de plus, 48 images après la leur
    for (const k of Object.values(SHOT_START)) expect(keyframePlan("poursuite")).toContain(k);
    expect(keyframePlan("poursuite")).toEqual([0, 40, 88, 136, 172, 220, 268, 316, 328, 376]);
    expect(keyframePlan("fin")).toEqual([0, 48]);
    expect(keyframePlan("fin6")).toEqual([0, 48]);
    for (const film of ["poursuite", "fin", "fin6"] as const) {
      const k = [...keyframePlan(film), filmFrames(film)];
      for (let i = 1; i < k.length; i++) expect(k[i] - k[i - 1]).toBeLessThanOrEqual(MAX_GOP);
    }
    expect(forceKeyframesExpr([0, 48])).toBe("expr:eq(n,0)+eq(n,48)");
  });
});

describe("tenir les plafonds", () => {
  /** Un encodeur factice : le poids de chaque fichier baisse de 15 % par point de CRF. */
  const fake = (at20: Record<string, number>, seen: string[] = []) => (film: string, crf: number) => {
    seen.push(`${film}@${crf}`);
    return Math.round(at20[film] * 0.85 ** (crf - 20));
  };

  it("chaque fichier sous son plafond, au meilleur CRF qui y tient", () => {
    const seen: string[] = [];
    const r = fitCeilings(720, fake({ poursuite: 5_000_000, fin: 500_000, fin6: 800_000 }, seen));
    expect(r.crf).toEqual({ poursuite: 22, fin: 20, fin6: 20 });
    expect(seen).toEqual(["poursuite@20", "poursuite@22", "fin@20", "fin6@20"]);
  });

  it("le total compte la poursuite et une seule fin, pas les trois fichiers : rien ne baisse pour rien", () => {
    // 4,4 + 0,88 + 1,39 = 6,67 Mo à trois, mais 5,79 Mo pour une personne : sous les 5,9 Mo
    const r = fitCeilings(720, fake({ poursuite: 4_400_000, fin: 880_000, fin6: 1_390_000 }));
    expect(r.crf).toEqual({ poursuite: 20, fin: 20, fin6: 20 });
    expect(personBytes(r.bytes)).toBeLessThanOrEqual(TOTAL_CEILINGS[720]);
  });

  it("il faudrait dépasser le CRF 28 : le montage échoue au lieu d'avertir", () => {
    const log: string[] = [];
    expect(() => fitCeilings(720, fake({ poursuite: 20_000_000, fin: 500_000, fin6: 800_000 }), (m) => log.push(m))).toThrow(CeilingError);
    expect(() => fitCeilings(720, fake({ poursuite: 20_000_000, fin: 500_000, fin6: 800_000 }))).toThrow(/dépasser le CRF 28/);
    // il est passé par 22, 24, 26 et 28 avant d'échouer
    expect(log.map((m) => m.match(/CRF (\d+)$/)?.[1])).toEqual(["22", "24", "26", "28"]);
  });
});

describe("la vérification", () => {
  const ok: ProbeStream = {
    codec_type: "video", codec_name: "h264", profile: "Main", width: 720, height: 1280, r_frame_rate: "24/1", avg_frame_rate: "24/1", nb_read_frames: String(ENDINGS.fin6.video),
    color_space: "bt709", color_primaries: "bt709", color_transfer: "bt709",
  };
  const exp = { frames: ENDINGS.fin6.video, width: 720, height: 1280, keys: keyframePlan("fin6") };
  const keys = Array.from({ length: ENDINGS.fin6.video }, (_, i) => i === 0 || i === 48);

  it("accepte un fichier conforme", () => {
    expect(checkProbe([ok], keys, exp)).toEqual([]);
  });

  it("refuse le son, une image de trop, la mauvaise cadence, des couleurs sans étiquette bt709", () => {
    const one = ENDINGS.fin6.video + 1;
    const errs = checkProbe([{ ...ok, nb_read_frames: String(one), r_frame_rate: "25/1", color_space: undefined }, { codec_type: "audio" }], keys, exp);
    expect(errs.join(" | ")).toMatch(new RegExp(`piste son.*cadence.*${one} images.*couleurs \\?/bt709/bt709`));
  });

  it("repère une image clé mal placée ou manquante", () => {
    expect(keyframeErrors(keys, exp.keys)).toBeNull();
    const extra = [...keys];
    extra[12] = true;
    expect(keyframeErrors(extra, exp.keys)).toContain("12");
    const missing = [...keys];
    missing[48] = false;
    expect(keyframeErrors(missing, exp.keys)).toContain("48");
  });
});

describe("les cartons", () => {
  it("portent le nom du plan et le numéro d'image", () => {
    const svg = slateSvg({ shot: "P2", local: 3, fileFrame: 55, fileFrames: CHASE_FRAMES });
    expect(svg).toContain(">P2<");
    expect(svg).toContain(">055<");
    expect(svg).toContain(`PLAN 4 / ${SHOT_FRAMES.P2}`);
    expect(svg).toContain('fill="#4b4fb8"');
  });
});
