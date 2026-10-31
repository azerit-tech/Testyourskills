// Textures procédurales (canvas 2D) pour la scène 3D : lueurs, étincelles, face
// et dos du pack, masque et dos de carte. Générées au vol ; les assets chargés
// (stade, matières, joueur, police) sont dans assets.ts.
import * as THREE from "three";
import { CARD_H, CARD_PATH, CARD_W } from "../../../shared/card/geometry";

const DISPLAY = "'Barlow Condensed', 'Arial Narrow', sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

/** Précharge les polices utilisées par les textes de la scène. */
export async function loadSceneFonts(): Promise<void> {
  if (!("fonts" in document)) return;
  const want = ["800 64px 'Barlow Condensed'", "700 64px 'Barlow Condensed'", "600 64px 'Barlow Condensed'", "700 32px 'JetBrains Mono'", "500 24px 'JetBrains Mono'", "600 32px 'Inter'"];
  await Promise.all(want.map((f) => document.fonts.load(f).catch(() => undefined)));
}

function srgb(t: THREE.Texture): THREE.Texture {
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Disque lumineux doux (sprites de lueur, flashs). */
export function makeGlowTexture(size = 256, inner = 0.0): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(Math.max(0.01, inner), "rgba(255,255,255,0.85)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.32)");
  grad.addColorStop(0.7, "rgba(255,255,255,0.06)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

/** Étoile à quatre branches pour les étincelles. */
export function makeSparkTexture(size = 64): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.6)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = "lighter";
  g.strokeStyle = "rgba(255,255,255,0.9)";
  g.lineWidth = size * 0.06;
  g.beginPath();
  g.moveTo(r, 0);
  g.lineTo(r, size);
  g.moveTo(0, r);
  g.lineTo(size, r);
  g.stroke();
  return new THREE.CanvasTexture(c);
}

/** Trait horizontal doux (éclat de lentille, rayon). */
export function makeStreakTexture(w = 512, h = 32): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(0.5, "rgba(255,255,255,1)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const v = g.createLinearGradient(0, 0, 0, h);
  v.addColorStop(0, "rgba(0,0,0,1)");
  v.addColorStop(0.5, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,1)");
  g.globalCompositeOperation = "destination-out";
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  return new THREE.CanvasTexture(c);
}

/** Masque de la silhouette de carte (coins coupés), blanc sur transparent. */
export function makeCardMaskTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = CARD_W * 2;
  c.height = CARD_H * 2;
  const g = c.getContext("2d")!;
  g.scale(2, 2);
  g.fillStyle = "#fff";
  g.fill(new Path2D(CARD_PATH));
  return new THREE.CanvasTexture(c);
}

/** Dos de carte : sombre, gemme, mot-symbole, liseré à la couleur du tier. */
export function makeCardBackTexture(accent: string): THREE.CanvasTexture {
  const W = CARD_W * 2;
  const H = CARD_H * 2;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.scale(2, 2);
  const grad = g.createLinearGradient(0, 0, 0, CARD_H);
  grad.addColorStop(0, "#1b2a3c");
  grad.addColorStop(0.6, "#0b131d");
  grad.addColorStop(1, "#121f2e");
  g.fillStyle = grad;
  g.fill(new Path2D(CARD_PATH));
  g.save();
  g.clip(new Path2D(CARD_PATH));
  g.strokeStyle = accent;
  g.globalAlpha = 0.7;
  g.lineWidth = 9;
  g.stroke(new Path2D(CARD_PATH));
  g.globalAlpha = 0.14;
  g.lineWidth = 1.5;
  for (let r = 20; r < 180; r += 16) {
    g.beginPath();
    g.arc(CARD_W / 2, CARD_H * 0.42, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.globalAlpha = 1;
  // la gemme Azerit
  g.translate(CARD_W / 2 - 52 * 0.6, CARD_H * 0.42 - 60 * 0.6);
  g.scale(0.6, 0.6);
  g.fillStyle = "#9fd8c2";
  g.beginPath();
  g.moveTo(52, 8);
  g.lineTo(14, 50);
  g.lineTo(37, 102);
  g.closePath();
  g.fill();
  g.fillStyle = "#4f8fa0";
  g.beginPath();
  g.moveTo(63, 10);
  g.lineTo(92, 42);
  g.lineTo(85, 80);
  g.lineTo(47, 112);
  g.closePath();
  g.fill();
  g.restore();
  g.fillStyle = "rgba(255,255,255,0.55)";
  g.font = `800 26px ${DISPLAY}`;
  g.textAlign = "center";
  g.fillText("TESTYOURSKILLS", CARD_W / 2, CARD_H - 72);
  return srgb(new THREE.CanvasTexture(c)) as THREE.CanvasTexture;
}

/** Face du pack : sachet sombre, liseré, gemme, « DEV PACK ». */
export function makePackFaceTexture(accentA: string, accentB: string, lang: "fr" | "en"): THREE.CanvasTexture {
  const W = 512;
  const H = 768;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const base = g.createLinearGradient(0, 0, W, H);
  base.addColorStop(0, "#22344a");
  base.addColorStop(0.34, "#0f1926");
  base.addColorStop(0.58, "#15293b");
  base.addColorStop(1, "#0a121c");
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  const halo = g.createRadialGradient(W / 2, H * 0.38, 10, W / 2, H * 0.38, W * 0.7);
  halo.addColorStop(0, hexA(accentA, 0.45));
  halo.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = halo;
  g.fillRect(0, 0, W, H);
  // rayons
  g.save();
  g.translate(W / 2, H * 0.38);
  for (let i = 0; i < 24; i++) {
    g.rotate((Math.PI * 2) / 24);
    g.fillStyle = hexA(accentA, 0.09);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-18, -520);
    g.lineTo(18, -520);
    g.closePath();
    g.fill();
  }
  g.restore();
  // liseré
  g.strokeStyle = hexA(accentA, 0.8);
  g.lineWidth = 4;
  roundRect(g, 20, 20, W - 40, H - 40, 18);
  g.stroke();
  g.strokeStyle = hexA(accentB, 0.5);
  g.lineWidth = 2;
  roundRect(g, 30, 30, W - 60, H - 60, 14);
  g.stroke();
  // anneau + gemme
  g.save();
  g.translate(W / 2, H * 0.38);
  g.strokeStyle = hexA(accentA, 0.9);
  g.lineWidth = 5;
  g.beginPath();
  g.arc(0, 0, 96, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = hexA(accentB, 0.5);
  g.lineWidth = 2;
  g.beginPath();
  g.arc(0, 0, 84, 0, Math.PI * 2);
  g.stroke();
  g.translate(-52 * 0.85, -60 * 0.85);
  g.scale(0.85, 0.85);
  g.shadowColor = accentA;
  g.shadowBlur = 30;
  g.fillStyle = "#dde27d";
  g.beginPath();
  g.moveTo(52, 8);
  g.lineTo(14, 50);
  g.lineTo(37, 102);
  g.closePath();
  g.fill();
  g.fillStyle = "#93dbcf";
  g.beginPath();
  g.moveTo(63, 10);
  g.lineTo(92, 42);
  g.lineTo(85, 80);
  g.lineTo(47, 112);
  g.closePath();
  g.fill();
  g.restore();
  // textes
  g.textAlign = "center";
  g.fillStyle = "rgba(230,236,242,0.75)";
  g.font = `700 20px ${MONO}`;
  g.fillText(lang === "fr" ? "AZERIT · SAISON 26" : "AZERIT · SEASON 26", W / 2, 120);
  const tg = g.createLinearGradient(0, 480, 0, 640);
  tg.addColorStop(0, "#ffffff");
  tg.addColorStop(0.55, "#b8c7d6");
  tg.addColorStop(1, "#7a8ea3");
  g.fillStyle = tg;
  g.font = `800 118px ${DISPLAY}`;
  g.fillText("DEV", W / 2, 560);
  g.fillText("PACK", W / 2, 655);
  g.fillStyle = "rgba(230,236,242,0.7)";
  g.font = `500 18px ${MONO}`;
  g.fillText(lang === "fr" ? "1 CARTE · NOTÉE PAR BARÈME" : "1 CARD · RUBRIC-RATED", W / 2, 706);
  return srgb(new THREE.CanvasTexture(c)) as THREE.CanvasTexture;
}

/** Face arrière du pack : foil sombre uni avec le liseré. */
export function makePackBackTexture(accentA: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 768;
  const g = c.getContext("2d")!;
  const base = g.createLinearGradient(0, 0, 512, 768);
  base.addColorStop(0, "#1a2a3c");
  base.addColorStop(1, "#0a121c");
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 768);
  g.strokeStyle = hexA(accentA, 0.5);
  g.lineWidth = 4;
  roundRect(g, 20, 20, 472, 728, 18);
  g.stroke();
  return srgb(new THREE.CanvasTexture(c)) as THREE.CanvasTexture;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** « #rrggbb » + alpha → rgba(). */
export function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Image → texture sRGB (avatar, PNG de carte). */
export function loadImageTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const t = new THREE.Texture(img);
      t.needsUpdate = true;
      resolve(srgb(t));
    };
    img.onerror = () => reject(new Error(`image : ${url}`));
    img.src = url;
  });
}
