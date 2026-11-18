// L'arrêt sur image en deux tons (§18.36, §18.54, docs/cinematique-poursuite.md
// §3.3) : la dernière image du dernier tronçon joué (Pk, FIN6 à six étoiles : le
// gel sur place des §18.53 et §18.56), tirée comme une affiche sérigraphiée. La
// berline sort en silhouette claire, cernée d'ombre ; le décor reste derrière,
// calme, en trame claire ; la toise passe derrière la voiture.
//
// Pourquoi un contour et pas une clé seule : les six images gelées sont des
// images fixes du film, et sur l'avenue (P1) la carrosserie, de nuit et sous le
// ciel violet, a la couleur du bitume. Aucun seuil ne l'en sépare : le tirage
// par la clé rouge faisait une tache. La berline est donc détourée une fois pour
// toutes sur chaque image gelée (STILL_CARS, à retracer quand le film est
// rendu à nouveau ; scripts/film-media.test.ts vérifie que le contour tient
// encore la voiture). Le reste est lu sur l'image :
//
// - **Dans le contour**, une clé « rouge de la carrosserie + luminance », seuillée
//   à la moitié du seuil d'Otsu : la caisse sort en clair, même dans l'ombre ;
//   la lunette, la plaque, la calandre et le dessous restent dans l'ombre. Les
//   feux et les phares sont cernés d'un trait d'ombre, pour se lire sur la caisse.
// - **Hors du contour**, les grandes masses claires (la luminance lissée, où les
//   blocs du codec disparaissent, au-dessus d'un seuil lu par Otsu) et les
//   lampes nettes passent en trame : la teinte claire à 32 % sur l'ombre ; le
//   reste dans l'ombre. Autour de la voiture, le décor s'éteint : un liseré
//   d'ombre la détache, même devant un ciel clair.
//
// Pur sur les pixels (testé sans navigateur) ; `paintStill` le pose sur une
// toile, une fois, pendant l'attente.
import { CHASE_SHOTS, type FilmPlan, type FreezeTone, type ShotId } from "../../../shared/film";
import { filmVideo } from "./unlock";

type Rgb = [number, number, number];
type Outline = readonly (readonly [number, number])[];
/** Les images qui peuvent geler : la dernière de P1 à P5 (une à cinq étoiles), celle de FIN6 (six). */
export type StillShot = Exclude<ShotId, "OUV" | "P6">;

/** Les contours sont tracés sur l'image du fichier 720 × 1280 ; ils valent pour toutes les tailles. */
const TRACED = { w: 720, h: 1280 };

/**
 * La berline sur chaque image gelée, en pixels de l'image 720 × 1280, dans le
 * sens des aiguilles d'une montre depuis le haut du toit (§18.54). P1 à P5 :
 * la dernière image du tronçon dans `poursuite` ; FIN6 : la dernière du fichier.
 * À retracer à chaque nouveau rendu de ces images.
 *
 * Tracés le 18 novembre (SPEC §18.78) sur le rendu final v11 (bras B), images
 * 107, 214, 317, 425, 485 et 719 de `poursuite-720.mp4` : de dos au bras commun
 * de P1 à P4, de trois quarts arrière dans le dérapage du port (P5), de trois
 * quarts avant arrêtée sur la pointe (FIN6) ; pare-chocs compris, roues
 * comprises de profil.
 */
/** La longueur du fichier `poursuite` sur lequel STILL_CARS a été tracé : les 720 images du trajet roulé. */
export const STILL_TRACED_FRAMES = 720;

export const STILL_CARS: Record<StillShot, Outline> = {
  P1: [[320, 550], [400, 540], [490, 548], [500, 560], [508, 600], [525, 650], [538, 705], [539, 760], [543, 795], [540, 825], [215, 822], [196, 800], [195, 780], [201, 700], [215, 675], [273, 642], [290, 585]],
  P2: [[165, 622], [235, 617], [310, 627], [345, 655], [400, 710], [416, 735], [419, 775], [421, 802], [415, 815], [165, 841], [156, 822], [159, 800], [142, 745], [132, 675], [137, 647], [150, 632]],
  P3: [[312, 675], [350, 662], [440, 670], [452, 690], [462, 722], [469, 760], [471, 800], [476, 832], [470, 850], [250, 850], [235, 835], [239, 805], [241, 762], [252, 745], [287, 730], [299, 697]],
  P4: [[265, 532], [300, 517], [440, 520], [457, 540], [470, 572], [482, 625], [515, 675], [531, 707], [532, 750], [534, 800], [530, 832], [172, 832], [162, 810], [165, 780], [162, 705], [190, 665], [230, 625], [250, 570]],
  P5: [[330, 635], [450, 606], [537, 602], [560, 632], [625, 626], [636, 642], [644, 672], [630, 682], [617, 725], [505, 757], [480, 802], [385, 812], [350, 820], [192, 795], [189, 715], [210, 702], [300, 685], [317, 647]],
  FIN6: [[255, 625], [300, 612], [410, 617], [472, 632], [522, 672], [627, 682], [631, 712], [640, 750], [590, 797], [550, 812], [415, 814], [370, 780], [210, 760], [160, 762], [105, 732], [99, 700], [106, 667], [150, 655], [220, 647], [245, 630]],
};

/**
 * La teinte qui compte, en degrés autour du rouge pur : le cramoisi de la
 * carrosserie (-40° à -14°) compte en entier ; vers l'orangé (bitume, reflets
 * des feux au sol), plus rien dès +6° ; vers le magenta, plus rien sous -60°.
 */
const HUE_FULL = -14;
const HUE_ZERO = 6;
/** Bruit de chroma du fichier (blocs du codec dans le noir) : retiré avant la pureté. */
const CHROMA_FLOOR = 4;
/** Sous ce niveau, la pureté ne compte plus en entier : le noir bruité ne devient pas rouge. */
const PURITY_FLOOR = 32;
/** Le poids de la luminance dans la clé de la voiture : le toit qui reflète le ciel compte, pas seulement le rouge. */
const LUMA_GAIN = 1.6;
/** Le seuil de la voiture, en part du seuil d'Otsu : la caisse en clair, seules les parties franchement sombres en ombre. */
const CAR_BIAS = 0.5;
const CAR_SPAN = 10;
/** Les feux et phares : au-delà de cette luminance, dans la moitié basse de la voiture, cernés d'ombre. */
const LIGHT_FROM = 170;
const LIGHTS_BELOW = 0.45;
/** Le décor : la part de teinte claire de sa trame. */
export const DECOR_TINT = 0.32;
/** Le lissage des masses du décor (les blocs du codec s'y fondent), en pixels d'une image de 1280 de haut. */
const DECOR_BLUR = 10;
/** Le seuil des masses, au-dessus de celui d'Otsu : seules les plus claires passent en trame, le décor reste calme. */
const DECOR_BIAS = 1.25;
/** Les lampes, enseignes et guirlandes : nettes, en trame, au-delà de cette luminance. */
const LAMP_FROM = 170;
/** Le liseré d'ombre autour de la voiture et le trait autour des feux, pour 1280 de haut. */
const HALO = 8;
const RING = 2;
/** La toise : un trait tous les 7 % de la hauteur, de la teinte d'ombre éclaircie de 20 %. */
export const RULE_STEP = 0.07;
const RULE_MIX = 0.2;

export interface FreezeLevels {
  /** Le seuil de la clé de la voiture (au-dessus : la teinte claire). */
  car: number;
  /** Le seuil de la luminance lissée du décor (au-dessus : la trame). */
  decor: number;
}

/** L'image gelée d'un plan de film : la dernière du dernier tronçon joué (FIN6 à six étoiles). */
export function stillShot(plan: Pick<FilmPlan, "level">): StillShot {
  return plan.level >= 6 ? "FIN6" : (CHASE_SHOTS[plan.level] as StillShot);
}

function hex(c: string): Rgb {
  const n = parseInt(c.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Flou en boîte de rayon `r` (deux passes séparables, sommes glissantes), bords répétés. */
function blur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let s = 0;
    for (let k = -r; k <= r; k++) s += src[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s / n;
      s += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/** Le seuil d'Otsu (deux classes) des valeurs retenues par `pick` ; 255 sans contraste (tout reste dans l'ombre). */
function otsu(vals: Float32Array, pick: (i: number) => boolean): number {
  const hist = new Float64Array(256);
  let n = 0;
  for (let i = 0; i < vals.length; i++) {
    if (!pick(i)) continue;
    const v = vals[i];
    hist[v >= 255 ? 255 : v <= 0 ? 0 : Math.round(v)]++;
    n++;
  }
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let wB = 0;
  let sB = 0;
  let best = 0;
  let t = 255;
  for (let i = 0; i < 255 && n; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = n - wB;
    if (!wF) break;
    sB += i * hist[i];
    const d = sB / wB - (sum - sB) / wF;
    const v = wB * wF * d * d;
    if (v > best) {
      best = v;
      t = i + 0.5;
    }
  }
  return t;
}

/** Le contour rempli sur une grille w × h (1 dedans), lu au centre de chaque case. */
function fillOutline(outline: Outline, w: number, h: number): Float32Array {
  const m = new Float32Array(w * h);
  const sx = w / TRACED.w;
  const sy = h / TRACED.h;
  const xs: number[] = [];
  for (let y = 0; y < h; y++) {
    const fy = (y + 0.5) / sy;
    xs.length = 0;
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const [xi, yi] = outline[i];
      const [xj, yj] = outline[j];
      if (yi > fy !== yj > fy) xs.push(xi + ((fy - yi) / (yj - yi)) * (xj - xi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(xs[k] * sx - 0.5));
      const b = Math.min(w - 1, Math.floor(xs[k + 1] * sx - 0.5));
      for (let x = a; x <= b; x++) m[y * w + x] = 1;
    }
  }
  return m;
}

const smooth = (v: number, lo: number, hi: number): number => {
  const t = (v - lo) / (hi - lo);
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
};

/**
 * Le deux-tons, en place dans `px` (RGBA) ; rend les seuils retenus. `car` : le
 * contour de la berline sur cette image (STILL_CARS), ou rien : tout est décor.
 */
export function duotone(px: Uint8ClampedArray, w: number, h: number, tone: FreezeTone, car: Outline | null = null): FreezeLevels {
  // 1. À demi-résolution (la chroma du fichier l'est) : la luminance et la pureté du rouge.
  const hw = Math.max(1, w >> 1);
  const hh = Math.max(1, h >> 1);
  const n2 = hw * hh;
  const lum = new Float32Array(n2);
  const red = new Float32Array(n2);
  for (let by = 0; by < hh; by++) {
    const y0 = Math.min(h - 1, by * 2);
    const y1 = Math.min(h - 1, y0 + 1);
    for (let bx = 0; bx < hw; bx++) {
      const x0 = Math.min(w - 1, bx * 2);
      const x1 = Math.min(w - 1, x0 + 1);
      const a = (y0 * w + x0) * 4;
      const b = (y0 * w + x1) * 4;
      const c = (y1 * w + x0) * 4;
      const d = (y1 * w + x1) * 4;
      const r = (px[a] + px[b] + px[c] + px[d]) / 4;
      const g = (px[a + 1] + px[b + 1] + px[c + 1] + px[d + 1]) / 4;
      const bl = (px[a + 2] + px[b + 2] + px[c + 2] + px[d + 2]) / 4;
      const j = by * hw + bx;
      lum[j] = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
      const mx = r >= g && r >= bl ? r : 0;
      if (!mx) continue;
      const chroma = mx - Math.min(g, bl);
      if (chroma <= CHROMA_FLOOR) continue;
      const hue = (60 * (g - bl)) / chroma;
      const wHue = Math.min(1, Math.max(0, (HUE_ZERO - hue) / (HUE_ZERO - HUE_FULL))) * Math.min(1, Math.max(0, (hue + 60) / 20));
      red[j] = wHue * Math.min(1, (chroma - CHROMA_FLOOR) / Math.max(mx, PURITY_FLOOR));
    }
  }
  const scale = h / TRACED.h;
  const rad = (r: number) => Math.max(1, Math.round((r / 2) * scale));

  // 2. La voiture : le contour, adouci ; le liseré d'ombre qui l'entoure.
  const inCar = car ? fillOutline(car, hw, hh) : new Float32Array(n2);
  const soft = blur(inCar, hw, hh, 1);
  const halo = blur(blur(inCar, hw, hh, rad(HALO)), hw, hh, rad(HALO));

  // 3. Le décor, à demi-résolution : la luminance lissée, seuillée hors de la voiture, en trame, éteinte autour d'elle.
  const lumS = blur(blur(lum, hw, hh, rad(DECOR_BLUR)), hw, hh, rad(DECOR_BLUR));
  const decor = DECOR_BIAS * otsu(lumS, (i) => inCar[i] < 0.5);
  const lumH = blur(lum, hw, hh, 1);
  const back = new Float32Array(n2);
  for (let i = 0; i < n2; i++) {
    const v = Math.max(smooth(lumS[i], decor - 4, decor + 4), smooth(lumH[i], LAMP_FROM - 10, LAMP_FROM + 10));
    back[i] = DECOR_TINT * v * (1 - smooth(halo[i], 0.01, 0.1));
  }

  // 4. Dans la voiture, à pleine résolution et seulement dans sa boîte : la clé, le seuil, les feux cernés.
  let x0 = w;
  let x1 = -1;
  let y0 = h;
  let y1 = -1;
  if (car) {
    for (const [x, y] of car) {
      x0 = Math.min(x0, Math.floor((x * w) / TRACED.w) - 2);
      x1 = Math.max(x1, Math.ceil((x * w) / TRACED.w) + 2);
      y0 = Math.min(y0, Math.floor(y * scale) - 2);
      y1 = Math.max(y1, Math.ceil(y * scale) + 2);
    }
    x0 = Math.max(0, x0);
    y0 = Math.max(0, y0);
    x1 = Math.min(w - 1, x1);
    y1 = Math.min(h - 1, y1);
  }
  const bw = Math.max(0, x1 - x0 + 1);
  const bh = Math.max(0, y1 - y0 + 1);
  let key = new Float32Array(bw * bh);
  const lights = new Float32Array(bw * bh);
  const inside = new Uint8Array(bw * bh);
  const lightsFrom = y0 + LIGHTS_BELOW * (y1 - y0);
  for (let y = 0; y < bh; y++) {
    const Y = y0 + y;
    const row = Math.min(hh - 1, Y >> 1) * hw;
    for (let x = 0; x < bw; x++) {
      const X = x0 + x;
      const p = (Y * w + X) * 4;
      const l = 0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2];
      const j = row + Math.min(hw - 1, X >> 1);
      const i = y * bw + x;
      key[i] = 255 * red[j] + LUMA_GAIN * l;
      lights[i] = l > LIGHT_FROM && Y >= lightsFrom ? 1 : 0;
      inside[i] = inCar[j] > 0.5 ? 1 : 0;
    }
  }
  if (bw && bh) key = blur(key, bw, bh, 1);
  const carT = CAR_BIAS * otsu(key, (i) => inside[i] === 1);
  const ring = bw && bh ? blur(lights, bw, bh, Math.max(1, Math.round(RING * scale))) : lights;

  // 5. Le tirage : la voiture sur le décor, la toise sur l'ombre.
  const L = hex(tone.light);
  const S = hex(tone.shadow);
  const R: Rgb = [S[0] + (L[0] - S[0]) * RULE_MIX, S[1] + (L[1] - S[1]) * RULE_MIX, S[2] + (L[2] - S[2]) * RULE_MIX];
  const step = Math.max(4, Math.round(h * RULE_STEP));
  const thick = Math.max(1, Math.round(h / 640));
  // l'échantillonnage bilinéaire des plans à demi-résolution : colonnes voisines et poids, une fois
  const xA = new Int32Array(w);
  const xB = new Int32Array(w);
  const ax = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const fx = Math.min(hw - 1, Math.max(0, x / 2 - 0.25));
    xA[x] = Math.min(Math.max(0, hw - 2), Math.floor(fx));
    xB[x] = Math.min(hw - 1, xA[x] + 1);
    ax[x] = fx - xA[x];
  }
  const bil = (f: Float32Array, r0: number, r1: number, ay: number, x: number) => {
    const a = ax[x];
    return (f[r0 + xA[x]] * (1 - a) + f[r0 + xB[x]] * a) * (1 - ay) + (f[r1 + xA[x]] * (1 - a) + f[r1 + xB[x]] * a) * ay;
  };
  for (let y = 0; y < h; y++) {
    const base = y % step < thick && y >= thick ? R : S;
    const fy = Math.min(hh - 1, Math.max(0, y / 2 - 0.25));
    const ya = Math.min(Math.max(0, hh - 2), Math.floor(fy));
    const ay = fy - ya;
    const r0 = ya * hw;
    const r1 = Math.min(hh - 1, ya + 1) * hw;
    for (let x = 0; x < w; x++) {
      let t = bil(back, r0, r1, ay, x);
      if (y >= y0 && y <= y1 && x >= x0 && x <= x1) {
        const m = smooth(bil(soft, r0, r1, ay, x), 0.25, 0.75);
        if (m > 0) {
          const i = (y - y0) * bw + (x - x0);
          const lit = !lights[i] && ring[i] > 0 ? 0 : smooth(key[i], carT - CAR_SPAN, carT + CAR_SPAN);
          t = m * lit + (1 - m) * t;
        }
      }
      const p = (y * w + x) * 4;
      px[p] = base[0] + (L[0] - base[0]) * t;
      px[p + 1] = base[1] + (L[1] - base[1]) * t;
      px[p + 2] = base[2] + (L[2] - base[2]) * t;
      px[p + 3] = 255;
    }
  }
  return { car: carT, decor };
}

/**
 * Pose l'image affichée par `video` en deux tons sur `canvas`, à la taille du
 * fichier, avec le contour de la berline de `shot`. Faux si l'image n'est pas
 * lisible (pas encore décodée, toile refusée) : le gel montre alors l'image en
 * couleur.
 */
export function paintStill(video: HTMLVideoElement, canvas: HTMLCanvasElement | null, tone: FreezeTone, shot: StillShot): boolean {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!canvas || !w || !h || video.readyState < 2) return false;
  try {
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d", { willReadFrequently: true });
    if (!g) return false;
    g.drawImage(video, 0, 0, w, h);
    const img = g.getImageData(0, 0, w, h);
    duotone(img.data, w, h, tone, STILL_CARS[shot]);
    g.putImageData(img, 0, 0);
    canvas.dataset.ready = "";
    return true;
  } catch {
    return false;
  }
}

/**
 * Au gel : si l'arrêt sur image n'a pas été préparé pendant l'attente, il se
 * fait sur l'image à l'écran (la balise est posée sur la dernière image jouée).
 */
export function ensureStill(canvas: HTMLCanvasElement | null, tone: FreezeTone, shot: StillShot): void {
  if (!canvas || canvas.dataset.ready !== undefined) return;
  const v = filmVideo();
  if (v.seeking) v.addEventListener("seeked", () => paintStill(v, canvas, tone, shot), { once: true });
  else paintStill(v, canvas, tone, shot);
}
