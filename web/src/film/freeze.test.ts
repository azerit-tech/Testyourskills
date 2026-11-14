// L'arrêt sur image en deux tons (freeze.ts), sur une image de nuit fabriquée :
// la berline rouge sort en clair, éclairée ou dans l'ombre, avec ses feux ; le
// ciel, le bitume brun, le reflet orangé au sol et les vitres restent dans
// l'ombre. Même verdict sur un rendu plus contrasté ou plus sombre.
import { describe, expect, it } from "vitest";
import { duotone } from "./freeze";

const W = 180;
const H = 320;
const TONE = { light: "#ccc2f5", shadow: "#243152" };
type Rgb = [number, number, number];

function scene(grade: (c: Rgb) => Rgb = (c) => c): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  let seed = 7;
  const noise = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed % 7) - 3;
  };
  const put = (x: number, y: number, c: Rgb) => {
    const g = grade(c);
    const p = (y * W + x) * 4;
    px[p] = g[0] + noise();
    px[p + 1] = g[1] + noise();
    px[p + 2] = g[2] + noise();
    px[p + 3] = 255;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let c: Rgb = y < 120 ? [60, 60, 140] : y < 126 ? [128, 51, 57] : [31, 20, 13];
      if (y >= 260 && y < 300 && x >= 130 && x < 170) c = [78, 28, 14]; // reflet orangé au sol
      if (x >= 86 && x < 94 && y >= 36 && y < 44) c = [250, 250, 250]; // la lampe
      if (x >= 30 && x < 150 && y >= 170 && y < 240) {
        c = y < 205 ? [139, 23, 53] : [70, 8, 20]; // carrosserie éclairée, puis dans l'ombre
        if (y >= 176 && y < 192 && x >= 60 && x < 120) c = [20, 20, 28]; // vitres
        if (y >= 222 && y < 232 && ((x >= 36 && x < 48) || (x >= 132 && x < 144))) c = [255, 200, 180]; // feux, cœur blanc rosé
      }
      put(x, y, c);
    }
  }
  return px;
}

/** 1 : teinte claire, 0 : teinte d'ombre (la toise compte comme ombre). */
function lightness(px: Uint8ClampedArray, x: number, y: number): number {
  const p = (y * W + x) * 4;
  // la teinte claire #ccc2f5 contre l'ombre #243152 : le vert sépare le mieux (0x31 à 0xc2)
  return (px[p + 1] - 0x31) / (0xc2 - 0x31);
}

const SPOTS: [string, number, number, "light" | "shadow"][] = [
  ["carrosserie éclairée", 40, 196, "light"],
  ["carrosserie dans l'ombre", 90, 216, "light"],
  ["feu", 42, 227, "light"],
  ["lampe", 90, 40, "light"],
  ["vitre", 90, 184, "shadow"],
  ["ciel", 20, 60, "shadow"],
  ["bitume brun", 20, 280, "shadow"],
  ["reflet orangé", 150, 280, "shadow"],
];

function check(px: Uint8ClampedArray) {
  for (const [name, x, y, want] of SPOTS) {
    const l = lightness(px, x, y);
    if (want === "light") expect(l, name).toBeGreaterThan(0.9);
    else expect(l, name).toBeLessThan(0.25);
  }
}

describe("arrêt sur image en deux tons", () => {
  it("la berline rouge sort en clair, le fond s'efface", () => {
    const px = scene();
    duotone(px, W, H, TONE);
    check(px);
  });

  it("deux teintes seulement : chaque pixel est l'une, l'autre, ou un bord", () => {
    const px = scene();
    duotone(px, W, H, TONE);
    let mid = 0;
    for (let i = 0; i < W * H; i++) {
      const l = lightness(px, i % W, Math.floor(i / W));
      if (l > 0.25 && l < 0.75) mid++;
    }
    expect(mid / (W * H)).toBeLessThan(0.03);
  });

  it("même verdict sur un rendu plus contrasté, ou plus sombre", () => {
    const contrast = (c: Rgb): Rgb => c.map((v) => Math.min(255, 1.2 * 255 * (v / 255) ** 1.3)) as Rgb;
    // plus sombre : la scène perd 40 %, les lumières restent saturées
    const dark = (c: Rgb): Rgb => (Math.max(...c) > 240 ? c : (c.map((v) => v * 0.6) as Rgb));
    for (const grade of [contrast, dark]) {
      const px = scene(grade);
      duotone(px, W, H, TONE);
      check(px);
    }
  });

  it("une image unie reste dans l'ombre, sans valeur folle", () => {
    const px = new Uint8ClampedArray(W * H * 4).fill(40);
    const lv = duotone(px, W, H, TONE);
    expect(Number.isFinite(lv.lo) && Number.isFinite(lv.hi) && lv.hi > lv.lo).toBe(true);
    expect(lightness(px, 90, 160)).toBeLessThan(0.1);
  });

  it("la toise passe derrière la voiture, pas sur elle", () => {
    const px = scene();
    duotone(px, W, H, TONE);
    const step = Math.round(H * 0.07);
    // une ligne de toise dans le ciel est plus claire que l'ombre, mais reste sombre
    const sky = lightness(px, 20, step * 2);
    expect(sky).toBeGreaterThan(0.1);
    expect(sky).toBeLessThan(0.3);
    // sur la carrosserie, la même ligne ne se voit pas
    const onCar = step * 3 >= 196 && step * 3 < 205 ? step * 3 : null;
    if (onCar) expect(lightness(px, 40, onCar)).toBeGreaterThan(0.9);
  });
});
