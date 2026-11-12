// Le montage du film (docs/cinematique-poursuite.md §5, §6 T2) : la partie pure.
// Liste de montage, arithmétique des images, arguments de ffmpeg, cartons en SVG,
// lecture des sondes ffprobe. Rien ici ne lance de processus : scripts/film-assemble.ts
// et scripts/film-contact.ts s'en chargent, et film-lib.test.ts teste ce fichier.
import { FILE_CEILINGS, PERSON_CEILINGS, personBytes } from "../shared/film/budget";
import { ENDINGS, SHOT_FRAMES as CHASE_SHOT_FRAMES } from "../shared/film/cut";

export const FPS = 24;

/** L'ordre des plans. */
export const SHOTS = ["OUV", "P1", "P2", "P3", "P4", "P5", "P6", "FIN", "FIN6"] as const;
export type ShotId = (typeof SHOTS)[number];

/**
 * Les images de VIDÉO de chaque plan (§2.1, §6 T2 critère 1).
 * FIN dure 76 images au film, mais seules les 52 du dérapage sont dans le fichier :
 * l'arrêt sur image (14) et le flash (10) sont dessinés par le site. De même FIN6 :
 * 80 images d'orbite en vidéo, puis 12 d'arrêt et 12 de flash dessinées en direct.
 * Lues dans shared/film/cut.ts, la seule source des durées.
 */
export const SHOT_FRAMES: Record<ShotId, number> = {
  ...CHASE_SHOT_FRAMES,
  FIN: ENDINGS.fin.video,
  FIN6: ENDINGS.fin6.video,
};

/** Les trois films et leurs plans, dans l'ordre. */
export const FILMS = {
  poursuite: ["OUV", "P1", "P2", "P3", "P4", "P5", "P6"],
  fin: ["FIN"],
  fin6: ["FIN6"],
} as const satisfies Record<string, readonly ShotId[]>;
export type FilmId = keyof typeof FILMS;

export const SIZES = { 720: [720, 1280], 540: [540, 960] } as const;
export type SizeId = keyof typeof SIZES;

/**
 * Plafonds de poids (§4.1), en octets (1 Mo = 10^6 octets, lecture stricte),
 * lus dans shared/film/budget.ts : le lecteur s'en sert aussi. Par fichier, et
 * pour une personne (la poursuite et la plus lourde des deux fins, car on ne
 * charge que la fin utile) : 5,9 Mo en 720p, 2,2 Mo en 540p.
 */
export const CEILINGS: Record<SizeId, Record<FilmId, number>> = { 720: FILE_CEILINGS["720"], 540: FILE_CEILINGS["540"] };
export const TOTAL_CEILINGS: Record<SizeId, number> = { 720: PERSON_CEILINGS["720"], 540: PERSON_CEILINGS["540"] };
export { personBytes };
export const POSTER_CEILING = 60_000;

/** Les zones du §7.3, en fraction du cadre 9:16. */
export const ZONES = { top: 0.12, bottom: 0.15, side: 0.09 } as const;

/** Un aplat par plan, pris dans la palette du site, clair et sombre en alternance. */
export const SLATE_COLORS: Record<ShotId, string> = {
  OUV: "#243152", // marine
  P1: "#ffc36b", // ambre
  P2: "#4b4fb8", // indigo
  P3: "#ffb2c6", // rose poudré
  P4: "#4b2f54", // prune
  P5: "#ff6a3d", // corail
  P6: "#fff9cb", // crème
  FIN: "#ccc2f5", // lavande
  FIN6: "#8d8cf0", // lilas
};
export const INK = "#0c0d1b";
export const CREAM = "#fff9cb";

// ---------------------------------------------------------------------------
// La liste de montage

/** Recadrage en fraction de la source (0 à 1), avant le recadrage 9:16 automatique. */
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShotEdit {
  /** Fichier de la prise dans le dossier des plans, ou null pour le carton. */
  take: string | null;
  /** Image d'entrée, comptée dans la prise à sa propre cadence (0 = première image). */
  in: number;
  /** 1 = vitesse de la prise, 0,5 = deux fois plus lent, 2 = deux fois plus vite. */
  speed: number;
  /** null = image entière, recadrée au centre en 9:16. */
  crop: Crop | null;
}

/** L'étalonnage commun, appliqué aux prises (jamais aux cartons). */
export interface Grade {
  /** Filtre eq de ffmpeg. */
  contrast: number;
  brightness: number;
  saturation: number;
  gamma: number;
  /** Filtre colorbalance : ombres, tons moyens, lumières, de -1 à 1 par canal. */
  shadows: [number, number, number];
  midtones: [number, number, number];
  highlights: [number, number, number];
  /** Une LUT .cube relative à tools/film/, ou null. */
  lut: string | null;
}

export interface Montage {
  grade: Grade;
  shots: Record<ShotId, ShotEdit>;
}

export const NEUTRAL_GRADE: Grade = {
  contrast: 1,
  brightness: 0,
  saturation: 1,
  gamma: 1,
  shadows: [0, 0, 0],
  midtones: [0, 0, 0],
  highlights: [0, 0, 0],
  lut: null,
};

/** Retire les clés de commentaire (« // … ») à tous les niveaux. */
export function stripComments(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripComments);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (!k.startsWith("//")) out[k] = stripComments(x);
    return out;
  }
  return v;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isTriple = (v: unknown): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every((x) => isNum(x) && x >= -1 && x <= 1);

/** Lit et valide montage.json ; lève une erreur qui liste tous les problèmes. */
export function parseMontage(raw: unknown): Montage {
  const errs: string[] = [];
  const root = stripComments(raw) as Record<string, unknown> | null;
  if (!root || typeof root !== "object" || Array.isArray(root)) throw new Error("montage.json : un objet est attendu");

  const g = (root.grade ?? {}) as Record<string, unknown>;
  const grade: Grade = { ...NEUTRAL_GRADE };
  for (const k of ["contrast", "brightness", "saturation", "gamma"] as const) {
    if (g[k] === undefined) continue;
    if (!isNum(g[k])) errs.push(`grade.${k} : nombre attendu`);
    else grade[k] = g[k] as number;
  }
  if (grade.contrast < 0.5 || grade.contrast > 2) errs.push("grade.contrast : entre 0,5 et 2");
  if (grade.brightness < -0.3 || grade.brightness > 0.3) errs.push("grade.brightness : entre -0,3 et 0,3");
  if (grade.saturation < 0 || grade.saturation > 2) errs.push("grade.saturation : entre 0 et 2");
  if (grade.gamma < 0.5 || grade.gamma > 2) errs.push("grade.gamma : entre 0,5 et 2");
  for (const k of ["shadows", "midtones", "highlights"] as const) {
    if (g[k] === undefined) continue;
    if (!isTriple(g[k])) errs.push(`grade.${k} : trois nombres [r, v, b] entre -1 et 1`);
    else grade[k] = g[k] as [number, number, number];
  }
  if (g.lut !== undefined && g.lut !== null) {
    if (typeof g.lut !== "string" || !g.lut.endsWith(".cube")) errs.push("grade.lut : un fichier .cube ou null");
    else grade.lut = g.lut;
  }

  const s = root.shots as Record<string, unknown> | undefined;
  const shots = {} as Record<ShotId, ShotEdit>;
  if (!s || typeof s !== "object") errs.push("shots : un objet par plan attendu");
  else {
    for (const k of Object.keys(s)) if (!(SHOTS as readonly string[]).includes(k)) errs.push(`shots.${k} : plan inconnu (${SHOTS.join(", ")})`);
    for (const id of SHOTS) {
      const e = s[id] as Record<string, unknown> | undefined;
      if (!e || typeof e !== "object") {
        errs.push(`shots.${id} : manquant`);
        continue;
      }
      const take = e.take ?? null;
      if (take !== null && (typeof take !== "string" || !/^[\w.-]+\.(mp4|mov|webm|mkv)$/i.test(take)))
        errs.push(`shots.${id}.take : un nom de fichier vidéo du dossier des plans, ou null`);
      const inF = e.in ?? 0;
      if (!Number.isInteger(inF) || (inF as number) < 0) errs.push(`shots.${id}.in : entier positif ou nul`);
      const speed = e.speed ?? 1;
      if (!isNum(speed) || speed < 0.25 || speed > 4) errs.push(`shots.${id}.speed : entre 0,25 et 4`);
      let crop: Crop | null = null;
      if (e.crop !== undefined && e.crop !== null) {
        const c = e.crop as Record<string, unknown>;
        if (![c.x, c.y, c.w, c.h].every(isNum)) errs.push(`shots.${id}.crop : { x, y, w, h } en fractions, ou null`);
        else {
          crop = { x: c.x as number, y: c.y as number, w: c.w as number, h: c.h as number };
          if (crop.x < 0 || crop.y < 0 || crop.w <= 0 || crop.h <= 0 || crop.x + crop.w > 1.0001 || crop.y + crop.h > 1.0001)
            errs.push(`shots.${id}.crop : le cadre sort de l'image`);
        }
      }
      shots[id] = { take: take as string | null, in: inF as number, speed: speed as number, crop };
    }
  }
  if (errs.length) throw new Error("montage.json invalide :\n  " + errs.join("\n  "));
  return { grade, shots };
}

// ---------------------------------------------------------------------------
// L'arithmétique des images

export function filmFrames(film: FilmId): number {
  return FILMS[film].reduce((n, s) => n + SHOT_FRAMES[s], 0);
}

/** Première image de chaque plan dans son fichier. */
export function shotStarts(film: FilmId): Record<string, number> {
  const out: Record<string, number> = {};
  let at = 0;
  for (const s of FILMS[film]) {
    out[s] = at;
    at += SHOT_FRAMES[s];
  }
  return out;
}

/** « 24000/1001 » → 23,976. */
export function parseRate(r: string | undefined): number {
  if (!r) return 0;
  const [a, b] = r.split("/").map(Number);
  const v = b ? a / b : a;
  return Number.isFinite(v) ? v : 0;
}

/** Images de la prise consommées pour remplir `frames` images à 24 i/s. */
export function sourceFramesNeeded(frames: number, speed: number, srcFps: number): number {
  return Math.ceil((frames * speed * srcFps) / FPS - 1e-9);
}

/** La fenêtre choisie tient-elle dans la prise ? */
export function windowFits(edit: ShotEdit, frames: number, srcFps: number, srcFrames: number) {
  const needed = sourceFramesNeeded(frames, edit.speed, srcFps);
  const available = Math.max(0, srcFrames - edit.in);
  return { needed, available, ok: available >= needed };
}

// ---------------------------------------------------------------------------
// Les arguments de ffmpeg

const f4 = (n: number) => String(Number(n.toFixed(4)));

/** Recadrage choisi, puis recadrage central au 9:16 (l'image remplit l'écran, rien n'est déformé). */
export function cropFilters(crop: Crop | null): string[] {
  const out: string[] = [];
  if (crop) out.push(`crop=iw*${f4(crop.w)}:ih*${f4(crop.h)}:iw*${f4(crop.x)}:ih*${f4(crop.y)}`);
  out.push("crop='min(iw,ih*9/16)':'min(ih,iw*16/9)'");
  return out;
}

export function gradeFilters(g: Grade, lutPath?: string): string[] {
  const out: string[] = [];
  if (g.contrast !== 1 || g.brightness !== 0 || g.saturation !== 1 || g.gamma !== 1)
    out.push(`eq=contrast=${f4(g.contrast)}:brightness=${f4(g.brightness)}:saturation=${f4(g.saturation)}:gamma=${f4(g.gamma)}`);
  const cb = [...g.shadows, ...g.midtones, ...g.highlights];
  if (cb.some((v) => v !== 0)) {
    const n = ["rs", "gs", "bs", "rm", "gm", "bm", "rh", "gh", "bh"];
    out.push("colorbalance=" + cb.map((v, i) => `${n[i]}=${f4(v)}`).join(":"));
  }
  if (g.lut && lutPath) out.push(`lut3d=file='${lutPath.replace(/'/g, "\\'")}'`);
  return out;
}

/**
 * La chaîne d'une prise : fenêtre, vitesse, 24 i/s, cadre, taille, étalonnage, et
 * exactement `frames` images (la dernière est tenue si la prise est trop courte).
 */
export function takeFilter(edit: ShotEdit, frames: number, grade: Grade, lutPath?: string): string {
  const [w, h] = SIZES[720];
  return [
    `trim=start_frame=${edit.in}`,
    `setpts=(PTS-STARTPTS)/${f4(edit.speed)}`,
    `fps=${FPS}`,
    ...cropFilters(edit.crop),
    `scale=${w}:${h}:flags=lanczos`,
    "setsar=1",
    ...gradeFilters(grade, lutPath),
    "tpad=stop_mode=clone:stop=-1",
    `trim=end_frame=${frames}`,
    `setpts=N/${FPS}/TB`,
    TO_BT709,
    "format=yuv420p",
    BT709_PARAMS,
  ].join(",");
}

/** La dernière conversion d'un plan : la matrice bt709, en plage vidéo, celle qu'annoncent les fichiers. */
const TO_BT709 = "scale=out_color_matrix=bt709:out_range=tv";
/** L'étiquette posée sur les images elles-mêmes : ffmpeg 8 prend celle des images, pas seulement les options de sortie. */
const BT709_PARAMS = "setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709";
/** Les couleurs étiquetées bt709 (§4.1) : sans étiquette, un navigateur peut lire la matrice du SD et ternir les couleurs. */
const BT709_TAGS = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];

/** Intermédiaire sans perte : un plan, 720 × 1280, exactement `frames` images. */
const LOSSLESS = ["-c:v", "libx264", "-preset", "ultrafast", "-qp", "0", "-pix_fmt", "yuv420p", ...BT709_TAGS, "-an"];

export function takeSegmentArgs(input: string, out: string, edit: ShotEdit, frames: number, grade: Grade, lutPath?: string): string[] {
  return ["-y", "-v", "error", "-i", input, "-vf", takeFilter(edit, frames, grade, lutPath), "-frames:v", String(frames), ...LOSSLESS, out];
}

/** Un carton : des images RGBA brutes arrivent sur l'entrée standard. */
export function slateSegmentArgs(out: string, frames: number): string[] {
  const [w, h] = SIZES[720];
  return [
    "-y", "-v", "error",
    "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${w}x${h}`, "-r", String(FPS), "-i", "-",
    "-vf", `${TO_BT709},format=yuv420p,${BT709_PARAMS}`, "-frames:v", String(frames), ...LOSSLESS, out,
  ];
}

/** Au plus tant d'images entre deux images clés (deux secondes). */
export const MAX_GOP = 48;

/**
 * Les images clés d'un fichier (§4.1) : la première image de chaque plan (les
 * coupes, lues dans shared/film/cut.ts), plus une dès que MAX_GOP images ont
 * passé sans image clé. Le débit va aux images, pas à des images clés inutiles.
 */
export function keyframePlan(film: FilmId): number[] {
  const cuts = new Set(Object.values(shotStarts(film)));
  const keys: number[] = [];
  let last = -Infinity;
  for (let i = 0; i < filmFrames(film); i++) {
    if (cuts.has(i) || i - last >= MAX_GOP) {
      keys.push(i);
      last = i;
    }
  }
  return keys;
}

/** L'expression de ffmpeg qui force ces images clés, comptées par numéro d'image. */
export function forceKeyframesExpr(keys: number[]): string {
  return "expr:" + keys.map((k) => `eq(n,${k})`).join("+");
}

/**
 * L'encodage final (§4.1) : H.264 Main, 24 i/s, images clés sur les coupes
 * (keyframePlan) et toutes les 48 images au plus, couleurs bt709, +faststart, sans son.
 */
export function encodeArgs(opts: { list: string; out: string; size: SizeId; crf: number; frames: number; keys: number[] }): string[] {
  const [w, h] = SIZES[opts.size];
  const vf =
    opts.size === 720
      ? `setsar=1,format=yuv420p,${BT709_PARAMS}`
      : `scale=${w}:${h}:flags=lanczos:in_color_matrix=bt709:out_color_matrix=bt709:in_range=tv:out_range=tv,setsar=1,format=yuv420p,${BT709_PARAMS}`;
  return [
    "-y", "-v", "error",
    "-f", "concat", "-safe", "0", "-i", opts.list,
    "-vf", vf,
    "-r", String(FPS), "-frames:v", String(opts.frames),
    "-c:v", "libx264", "-profile:v", "main", "-level:v", "3.1", "-preset", "slow", "-crf", String(opts.crf),
    "-g", String(MAX_GOP), "-sc_threshold", "0", "-force_key_frames", forceKeyframesExpr(opts.keys), "-forced-idr", "1",
    ...BT709_TAGS,
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", "-map_metadata", "-1",
    opts.out,
  ];
}

/** Le fichier de liste du démultiplexeur concat. */
export function concatList(paths: string[]): string {
  return paths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n") + "\n";
}

/** L'affiche : la première image, en JPEG ; q de 2 (meilleur) à 31. */
export function posterArgs(input: string, out: string, q: number): string[] {
  return ["-y", "-v", "error", "-i", input, "-frames:v", "1", "-q:v", String(q), out];
}

/** Le CRF de départ : la meilleure qualité tentée, que le montage baisse pour tenir les plafonds. */
export const START_CRF: Record<SizeId, number> = { 720: 20, 540: 22 };
/** Au-delà, l'image se dégrade trop : le montage échoue plutôt que de livrer pire (§4.1). */
export const MAX_CRF = 28;

/** La qualité suivante quand un plafond est dépassé : CRF +2, jusqu'à MAX_CRF ; null au-delà. */
export function nextCrf(crf: number): number | null {
  return crf >= MAX_CRF ? null : Math.min(crf + 2, MAX_CRF);
}

/** Il faudrait dépasser MAX_CRF pour tenir un plafond : le montage échoue. */
export class CeilingError extends Error {}

export interface Fit {
  crf: Record<FilmId, number>;
  bytes: Record<FilmId, number>;
}

/**
 * Les trois fichiers d'une taille sous leurs plafonds : chacun part de
 * START_CRF et monte de 2 tant qu'il dépasse le sien ; puis, tant que la
 * personne charge trop (poursuite et plus lourde des fins), le plus lourd des
 * deux monte encore. Il faudrait passer CRF 28 : CeilingError, le montage échoue.
 * `encodeAt` encode un fichier à un CRF et rend son poids en octets.
 */
export function fitCeilings(size: SizeId, encodeAt: (film: FilmId, crf: number) => number, log: (m: string) => void = () => undefined): Fit {
  const films = Object.keys(FILMS) as FilmId[];
  const crf = {} as Record<FilmId, number>;
  const bytes = {} as Record<FilmId, number>;
  const raise = (film: FilmId, why: string) => {
    const next = nextCrf(crf[film]);
    if (next === null)
      throw new CeilingError(`${film}-${size}.mp4 : ${why} même au CRF ${crf[film]} ; il faudrait dépasser le CRF ${MAX_CRF}. Allégez le plan (moins de grain, moins de détail) ou relevez le plafond dans shared/film/budget.ts.`);
    log(`${film}-${size}.mp4 : ${why} au CRF ${crf[film]}, qualité baissée au CRF ${next}`);
    crf[film] = next;
    bytes[film] = encodeAt(film, next);
  };
  for (const film of films) {
    crf[film] = START_CRF[size];
    bytes[film] = encodeAt(film, crf[film]);
    while (bytes[film] > CEILINGS[size][film]) raise(film, `${bytes[film]} octets, au-dessus du plafond de ${CEILINGS[size][film]}`);
  }
  while (personBytes(bytes) > TOTAL_CEILINGS[size]) {
    const ending: FilmId = bytes.fin6 >= bytes.fin ? "fin6" : "fin";
    const heavy: FilmId = bytes.poursuite >= bytes[ending] ? "poursuite" : ending;
    raise(heavy, `${personBytes(bytes)} octets pour une personne, au-dessus de ${TOTAL_CEILINGS[size]}`);
  }
  return { crf, bytes };
}

// ---------------------------------------------------------------------------
// La vérification par ffprobe

export interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  profile?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  nb_read_frames?: string;
  color_space?: string;
  color_primaries?: string;
  color_transfer?: string;
}

export interface Expected {
  frames: number;
  width: number;
  height: number;
  /** Les images clés attendues (keyframePlan). */
  keys: number[];
}

/** Les écarts entre une sonde et l'attendu ; vide si tout va bien. */
export function checkProbe(streams: ProbeStream[], keyframes: boolean[], exp: Expected): string[] {
  const errs: string[] = [];
  const v = streams.filter((s) => s.codec_type === "video");
  if (v.length !== 1) errs.push(`${v.length} pistes vidéo au lieu d'une`);
  if (streams.some((s) => s.codec_type === "audio")) errs.push("une piste son est présente");
  const s = v[0];
  if (!s) return errs;
  if (s.codec_name !== "h264") errs.push(`codec ${s.codec_name}`);
  if (s.profile !== "Main") errs.push(`profil ${s.profile}`);
  if (s.width !== exp.width || s.height !== exp.height) errs.push(`${s.width} × ${s.height} au lieu de ${exp.width} × ${exp.height}`);
  if (Math.abs(parseRate(s.r_frame_rate) - FPS) > 1e-6 || Math.abs(parseRate(s.avg_frame_rate) - FPS) > 1e-3)
    errs.push(`cadence ${s.r_frame_rate} (moyenne ${s.avg_frame_rate})`);
  if (Number(s.nb_read_frames) !== exp.frames) errs.push(`${s.nb_read_frames} images au lieu de ${exp.frames}`);
  const tags = [s.color_space, s.color_primaries, s.color_transfer];
  if (tags.some((t) => t !== "bt709")) errs.push(`couleurs ${tags.map((t) => t ?? "?").join("/")} au lieu de bt709`);
  const bad = keyframeErrors(keyframes, exp.keys);
  if (bad) errs.push(bad);
  return errs;
}

/** Les images clés exactement aux images attendues (keyframePlan), aucune autre. */
export function keyframeErrors(keys: boolean[], expected: number[]): string | null {
  const want = new Set(expected);
  const wrong = keys.map((k, i) => (k !== want.has(i) ? i : -1)).filter((i) => i >= 0);
  return wrong.length ? `images clés mal placées (images ${wrong.slice(0, 6).join(", ")}${wrong.length > 6 ? "…" : ""})` : null;
}

// ---------------------------------------------------------------------------
// Les cartons

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const pad3 = (n: number) => String(n).padStart(3, "0");

/**
 * Une image de carton, 720 × 1280 : l'aplat du plan, son nom et le numéro
 * d'image en grand dans la zone centrale, les zones du §7.3 tracées.
 */
export function slateSvg(o: { shot: ShotId; local: number; fileFrame: number; fileFrames: number }): string {
  const [W, H] = SIZES[720];
  const bg = SLATE_COLORS[o.shot];
  const fg = luminance(bg) > 0.35 ? INK : CREAM;
  const top = Math.round(H * ZONES.top);
  const bot = Math.round(H * ZONES.bottom);
  const side = Math.round(W * ZONES.side);
  const n = SHOT_FRAMES[o.shot];
  const cx = W / 2;
  const secs = (o.fileFrame / FPS).toFixed(2).replace(".", ",");
  // Une barre d'avancement dans le plan : on voit tout de suite une image sautée.
  const barW = W - 2 * side - 80;
  const prog = ((o.local + 1) / n) * barW;
  const mono = "font-family=\"JetBrains Mono\" font-weight=\"500\"";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${bg}"/>
<g fill="${fg}" fill-opacity="0.14">
<rect x="0" y="0" width="${W}" height="${top}"/>
<rect x="0" y="${H - bot}" width="${W}" height="${bot}"/>
<rect x="0" y="${top}" width="${side}" height="${H - top - bot}"/>
<rect x="${W - side}" y="${top}" width="${side}" height="${H - top - bot}"/>
</g>
<g fill="none" stroke="${fg}" stroke-width="3" stroke-dasharray="14 10">
<line x1="0" y1="${top}" x2="${W}" y2="${top}"/>
<line x1="0" y1="${H - bot}" x2="${W}" y2="${H - bot}"/>
<line x1="${side}" y1="${top}" x2="${side}" y2="${H - bot}"/>
<line x1="${W - side}" y1="${top}" x2="${W - side}" y2="${H - bot}"/>
</g>
<g fill="${fg}" ${mono} font-size="22" text-anchor="middle">
<text x="${cx}" y="${top / 2 + 8}">BANDE DU HAUT · 12 % · ÉTOILES</text>
<text x="${cx}" y="${H - bot / 2 + 8}">BANDE DU BAS · 15 % · RADIO, PASSER</text>
<text transform="translate(${side / 2 + 8} ${H / 2}) rotate(-90)">ROGNÉ 9 %</text>
<text transform="translate(${W - side / 2 + 8} ${H / 2}) rotate(90)">ROGNÉ 9 %</text>
</g>
<g fill="${fg}" text-anchor="middle">
<text x="${cx}" y="430" font-family="Barlow Condensed ExtraBold" font-weight="800" font-size="230">${o.shot}</text>
<text x="${cx}" y="700" font-family="Barlow Condensed ExtraBold" font-weight="800" font-size="250">${pad3(o.fileFrame)}</text>
<text x="${cx}" y="770" ${mono} font-size="30">IMAGE ${pad3(o.fileFrame)} / ${pad3(o.fileFrames)} · ${secs} S</text>
<text x="${cx}" y="820" ${mono} font-size="30">PLAN ${o.local + 1} / ${n}</text>
<text x="${cx}" y="1010" ${mono} font-size="22" fill-opacity="0.7">CARTON · PRISE ABSENTE</text>
</g>
<rect x="${side + 40}" y="880" width="${barW}" height="18" fill="none" stroke="${fg}" stroke-width="3"/>
<rect x="${side + 40}" y="880" width="${prog.toFixed(1)}" height="18" fill="${fg}"/>
</svg>`;
}

// ---------------------------------------------------------------------------
// Les planches

export interface SheetCell {
  /** Image PNG en data URI. */
  href: string;
  label: string;
}

/** Une planche : des vignettes 9:16 numérotées, les zones du §7.3 en filet. */
export function sheetSvg(cells: SheetCell[], o: { cols: number; cellW: number; title: string[] }): string {
  const cw = o.cellW;
  const ch = Math.round((cw * 16) / 9);
  const pad = 12;
  const lab = 26;
  const head = 20 + 24 * o.title.length;
  const rows = Math.max(1, Math.ceil(cells.length / o.cols));
  const W = o.cols * cw + (o.cols + 1) * pad;
  const H = head + rows * (ch + lab + pad) + pad;
  const top = Math.round(ch * ZONES.top);
  const bot = Math.round(ch * ZONES.bottom);
  const side = Math.round(cw * ZONES.side);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const items = cells
    .map((c, i) => {
      const x = pad + (i % o.cols) * (cw + pad);
      const y = head + Math.floor(i / o.cols) * (ch + lab + pad);
      return `<g transform="translate(${x} ${y})">
<image href="${c.href}" width="${cw}" height="${ch}"/>
<g fill="none" stroke="${CREAM}" stroke-opacity="0.55" stroke-width="1" stroke-dasharray="4 3">
<line x1="0" y1="${top}" x2="${cw}" y2="${top}"/><line x1="0" y1="${ch - bot}" x2="${cw}" y2="${ch - bot}"/>
<line x1="${side}" y1="0" x2="${side}" y2="${ch}"/><line x1="${cw - side}" y1="0" x2="${cw - side}" y2="${ch}"/>
</g>
<text x="2" y="${ch + 19}" fill="${CREAM}" font-family="JetBrains Mono" font-weight="500" font-size="15">${esc(c.label)}</text>
</g>`;
    })
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${INK}"/>
${o.title.map((t, i) => `<text x="${pad}" y="${32 + 24 * i}" fill="${CREAM}" font-family="JetBrains Mono" font-weight="500" font-size="18">${esc(t)}</text>`).join("\n")}
${items}
</svg>`;
}

/** La grille du §7.10, à remplir pour chaque prise reçue. */
export function checklist(take: string, info: string): string {
  const lines = [
    "ça ne fait pas film : image de jeu, de dessin animé, voitures-jouets",
    "un visage est lisible, ou on voit la peau, les cheveux ou les yeux de la personne au volant (rétroviseur compris)",
    "un visage ou une silhouette rappelle une personne réelle ou un personnage existant",
    "il y a du sang, une personne blessée, un corps au sol, quelqu'un est touché ou renversé",
    "un missile part, quelque chose explose ou brûle, il y a un feu d'artifice",
    "une personne qui passe apparaît",
    "il y a du texte, des lettres ou des chiffres, même illisibles (carrosserie, toit, uniforme, enseigne, plaque, cadran)",
    "la voiture en fuite change de forme ou de couleur d'un plan à l'autre",
    "un véhicule ou un avion rappelle un modèle réel, ou porte un écusson, une cocarde, un numéro",
    "les gyrophares sont rouge et bleu",
    "une roue se déforme, une voiture en traverse une autre, glisse sans tourner ou roule à l'envers",
    "deux véhicules se percutent",
    "OUV n'est pas calme, ou un plan est moins agité que celui d'avant",
    "dans FIN, plus d'une patrouille ou plus d'une silhouette est visible (la fin doit rester vraie à une étoile)",
    "le ciel n'est plus à l'heure bleue, ou le sol est sec",
    "l'action sort de la zone centrale, ou quelque chose d'essentiel est dans les bandes",
    "un filigrane, une bande noire ou un sous-titre est incrusté",
  ];
  return [
    `# Avis sur la prise ${take}`,
    "",
    info,
    "",
    "Fenêtre retenue (images de la prise, voir la planche) : de ___ à ___",
    "",
    "## On jette si, dans la fenêtre gardée, l'une de ces lignes est vraie (§7.10)",
    "",
    ...lines.map((l) => `- [ ] ${l}`),
    "",
    "## On garde ?",
    "",
    "Est-ce qu'on mettrait cette seconde dans une bande-annonce : oui / non",
    "",
    "Avis :",
    "",
  ].join("\n");
}
