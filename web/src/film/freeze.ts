// L'arrêt sur image en deux tons (§18.36, docs/cinematique-poursuite.md §3.3) :
// la dernière image de la fin, tirée comme une affiche sérigraphiée. La berline
// sort en teinte claire, le fond s'efface dans la teinte d'ombre, la toise
// passe derrière elle.
//
// Pourquoi une clé et pas le gris : l'image est de nuit et la voiture est
// rouge. En gris, sa carrosserie est aussi sombre que le bitume ; un seuil sur
// la luminance garde le ciel et perd le sujet. La clé mesure donc ce qui
// distingue la voiture : la pureté d'un rouge cramoisi (la carrosserie, même
// dans l'ombre), plus les lumières vives (feux, phares, gants, lampes). Le
// bitume brun, les reflets orangés au sol, le ciel bleu et violet restent bas.
//
// Les deux seuils sont lus sur l'image (Otsu à trois classes sur la zone
// d'action : fond sombre, fond moyen, sujet) : un rendu final plus contrasté
// déplace les classes, pas le résultat. Pur sur les pixels (testé sans
// navigateur) ; `paintStill` le pose sur une toile, une fois, avant le gel.
import type { FreezeTone } from "../../../shared/film";
import { filmVideos } from "./unlock";

type Rgb = [number, number, number];

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
/** Les lumières vives sortent en clair, au-delà de cette luminance. */
const HIGHLIGHT_FROM = 140;
const HIGHLIGHT_GAIN = 1.2;
const LUMA_GAIN = 0.1;
/** La zone d'action (docs §7.3) : sous la bande du haut, au-dessus de celle du bas, sans les bords rognés. */
const ZONE = { x0: 0.09, x1: 0.91, y0: 0.12, y1: 0.85 };
/** La toise : un trait tous les 7 % de la hauteur, de la teinte d'ombre éclaircie de 20 %. */
export const RULE_STEP = 0.07;
const RULE_MIX = 0.2;

export interface FreezeLevels {
  /** Sous `lo`, l'ombre ; au-dessus de `hi`, la lumière. */
  lo: number;
  hi: number;
}

function hex(c: string): Rgb {
  const n = parseInt(c.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** La clé de chaque pixel (0 à ~255) : la pureté du rouge de la carrosserie, plus les lumières vives. */
export function freezeKey(px: Uint8ClampedArray, w: number, h: number): Float32Array {
  // La teinte sur des blocs de 2 × 2 : la chroma du fichier est à demi-résolution.
  const hw = (w + 1) >> 1;
  const hh = (h + 1) >> 1;
  const red = new Float32Array(hw * hh);
  for (let by = 0; by < hh; by++) {
    const y0 = by * 2;
    const y1 = Math.min(h - 1, y0 + 1);
    for (let bx = 0; bx < hw; bx++) {
      const x0 = bx * 2;
      const x1 = Math.min(w - 1, x0 + 1);
      const a = (y0 * w + x0) * 4;
      const b = (y0 * w + x1) * 4;
      const c = (y1 * w + x0) * 4;
      const d = (y1 * w + x1) * 4;
      const r = (px[a] + px[b] + px[c] + px[d]) / 4;
      const g = (px[a + 1] + px[b + 1] + px[c + 1] + px[d + 1]) / 4;
      const bl = (px[a + 2] + px[b + 2] + px[c + 2] + px[d + 2]) / 4;
      const mx = r >= g && r >= bl ? r : 0;
      if (!mx) continue;
      const chroma = mx - Math.min(g, bl);
      if (chroma <= CHROMA_FLOOR) continue;
      const hue = (60 * (g - bl)) / chroma;
      const wHue = Math.min(1, Math.max(0, (HUE_ZERO - hue) / (HUE_ZERO - HUE_FULL))) * Math.min(1, Math.max(0, (hue + 60) / 20));
      red[by * hw + bx] = wHue * Math.min(1, (chroma - CHROMA_FLOOR) / Math.max(mx, PURITY_FLOOR));
    }
  }
  const raw = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = (y >> 1) * hw;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const p = i * 4;
      const lum = 0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2];
      raw[i] = 255 * red[row + (x >> 1)] + LUMA_GAIN * lum + HIGHLIGHT_GAIN * Math.max(0, lum - HIGHLIGHT_FROM);
    }
  }
  // Un flou de 3 × 3 (deux passes de trois) : pas de grésillement au seuil.
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const r = y * w;
    for (let x = 0; x < w; x++) tmp[r + x] = (raw[r + Math.max(0, x - 1)] + raw[r + x] + raw[r + Math.min(w - 1, x + 1)]) / 3;
  }
  for (let y = 0; y < h; y++) {
    const up = Math.max(0, y - 1) * w;
    const r = y * w;
    const dn = Math.min(h - 1, y + 1) * w;
    for (let x = 0; x < w; x++) raw[r + x] = (tmp[up + x] + tmp[r + x] + tmp[dn + x]) / 3;
  }
  return raw;
}

/**
 * Les deux seuils, lus sur la zone d'action : Otsu à trois classes (fond
 * sombre, fond moyen, sujet). L'ombre jusqu'au premier seuil, la lumière à
 * mi-chemin du second : la carrosserie dans l'ombre sort encore en clair.
 */
export function freezeLevels(key: Float32Array, w: number, h: number): FreezeLevels {
  const hist = new Float64Array(256);
  for (let y = Math.floor(h * ZONE.y0); y < Math.ceil(h * ZONE.y1); y++) {
    for (let x = Math.floor(w * ZONE.x0); x < Math.ceil(w * ZONE.x1); x++) {
      const v = key[y * w + x];
      hist[v >= 255 ? 255 : v <= 0 ? 0 : Math.round(v)]++;
    }
  }
  const P = new Float64Array(257);
  const M = new Float64Array(257);
  for (let i = 0; i < 256; i++) {
    P[i + 1] = P[i] + hist[i];
    M[i + 1] = M[i] + i * hist[i];
  }
  const cls = (a: number, b: number) => {
    const n = P[b] - P[a];
    if (!n) return 0;
    const m = M[b] - M[a];
    return (m * m) / n;
  };
  let best = -1;
  let t1 = 0;
  let t2 = 0;
  for (let a = 1; a < 255; a++) {
    const left = cls(0, a);
    for (let b = a + 1; b < 256; b++) {
      const v = left + cls(a, b) + cls(b, 256);
      if (v > best) {
        best = v;
        t1 = a;
        t2 = b;
      }
    }
  }
  // Garde-fous : une image presque unie (pas de sujet) reste dans l'ombre.
  const lo = Math.min(160, Math.max(16, t1));
  const hi = Math.max(lo + 16, lo + 0.5 * (t2 - lo));
  return { lo, hi };
}

/** Le deux-tons, en place dans `px` (RGBA) ; rend les seuils retenus. */
export function duotone(px: Uint8ClampedArray, w: number, h: number, tone: FreezeTone): FreezeLevels {
  const key = freezeKey(px, w, h);
  const lv = freezeLevels(key, w, h);
  const L = hex(tone.light);
  const S = hex(tone.shadow);
  const R: Rgb = [S[0] + (L[0] - S[0]) * RULE_MIX, S[1] + (L[1] - S[1]) * RULE_MIX, S[2] + (L[2] - S[2]) * RULE_MIX];
  const step = Math.max(4, Math.round(h * RULE_STEP));
  const thick = Math.max(1, Math.round(h / 640));
  const span = lv.hi - lv.lo;
  for (let y = 0; y < h; y++) {
    // la toise ne passe que sur l'ombre : derrière la voiture
    const base = y % step < thick && y >= thick ? R : S;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let t = (key[i] - lv.lo) / span;
      t = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
      const p = i * 4;
      px[p] = base[0] + (L[0] - base[0]) * t;
      px[p + 1] = base[1] + (L[1] - base[1]) * t;
      px[p + 2] = base[2] + (L[2] - base[2]) * t;
      px[p + 3] = 255;
    }
  }
  return lv;
}

/**
 * Pose l'image affichée par `video` en deux tons sur `canvas`, à la taille du
 * fichier. Faux si l'image n'est pas lisible (pas encore décodée, toile
 * refusée) : le gel montre alors l'image en couleur.
 */
export function paintStill(video: HTMLVideoElement, canvas: HTMLCanvasElement | null, tone: FreezeTone): boolean {
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
    duotone(img.data, w, h, tone);
    g.putImageData(img, 0, 0);
    canvas.dataset.ready = "";
    return true;
  } catch {
    return false;
  }
}

/** Au gel : si l'arrêt sur image n'a pas été préparé pendant l'attente, il se fait sur l'image à l'écran. */
export function ensureStill(canvas: HTMLCanvasElement | null, tone: FreezeTone): void {
  if (!canvas || canvas.dataset.ready !== undefined) return;
  const v = filmVideos()[1];
  if (v.seeking) v.addEventListener("seeked", () => paintStill(v, canvas, tone), { once: true });
  else paintStill(v, canvas, tone);
}
