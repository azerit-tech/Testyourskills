// Une image de la poursuite (§18.33) : un arbre SVG pour un instant donné,
// fonction pure du temps et du plan. Ni état, ni effet, ni hasard au rendu (la
// ville se tire de la graine de la fiche), ni animation CSS, ni foreignObject,
// ni filtre : la même image dans le navigateur et dans resvg (rendu serveur,
// futur clip vertical). Les polices passent par fontAttrs et fit, comme la fiche.
//
// Cadrage, de haut en bas : les six étoiles et la radio, le ciel et ses
// hélicoptères, la ville en silhouettes (trois plans), l'avenue en perspective
// qui file vers un point de fuite sous la ville, la meute, et la voiture du
// suspect de face, en bas au centre. La caméra recule devant elle : ce qu'elle
// dépasse entre grand par les bords et rapetisse vers l'horizon.
import { memo } from "react";
import type { ReactElement } from "react";
import type { Lang } from "../types";
import { fontAttrs } from "../card/fonts";
import { fit, upper } from "../card/text";
import { STAR_PATH } from "../stars";
import { escalation, rng, type ChasePlan, type Unit } from "./plan";
import { BLUSH, CORAL, CREAM, INK, PALETTES, PERIWINKLE, type ChasePalette } from "./palette";

export interface ChaseFrameProps {
  /** Instant de la séquence (s), de 0 à plan.duration (au-delà : le flash retombe). */
  t: number;
  plan: ChasePlan;
  width: number;
  height: number;
  lang: Lang;
  /** Marge du haut (encoche, barre d'état) : le HUD se pose dessous. */
  insetTop?: number;
  /** Le décor peint de la fin : son URL dans le navigateur, une data URI pour resvg. */
  backdropHref?: string;
  idPrefix?: string;
}

// ---------- outils ----------

const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const easeOut = (x: number) => 1 - (1 - clamp(x)) ** 3;
const easeInOut = (x: number) => {
  const v = clamp(x);
  return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2;
};
const smooth = (a: number, b: number, x: number) => {
  const v = clamp((x - a) / (b - a));
  return v * v * (3 - 2 * v);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** Coordonnée arrondie au dixième : des chemins courts, identiques d'un rendu à l'autre. */
const r1 = (n: number) => Math.round(n * 10) / 10;

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Mélange de deux couleurs : la brume qui gagne les objets lointains. */
function mix(a: string, b: string, k: number): string {
  const x = hex(a);
  const y = hex(b);
  const c = x.map((v, i) => Math.round(lerp(v, y[i], clamp(k))));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}

// ---------- cadrage ----------

export interface Layout {
  W: number;
  H: number;
  /** Largeur de la scène portrait (centrée ; sur ordinateur, le décor déborde sur les côtés). */
  u: number;
  cx: number;
  /** L'horizon, où la route se perd. */
  hy: number;
  /** Largeur de la voiture du suspect, à la profondeur 1 : l'unité du monde. */
  carW: number;
  /** Le sol sous la voiture du suspect. */
  gY: number;
  G: number;
  top: number;
}

export function layoutOf(W: number, H: number, insetTop = 0): Layout {
  const u = Math.min(W, H * 0.62);
  const hy = Math.round(H * 0.44);
  const carW = 0.38 * u;
  const gY = H * 0.935;
  return { W, H, u, cx: W / 2, hy, carW, gY, G: gY - hy, top: insetTop };
}

/** Projection : X en largeurs de voiture, d en profondeur (1 = la voiture du suspect). */
const px = (L: Layout, X: number, d: number, cam: number) => L.cx + ((X - cam) * L.carW) / d;
const py = (L: Layout, d: number) => L.hy + L.G / d;
const sc = (L: Layout, d: number) => L.carW / d;

// ---------- le mouvement ----------

/** Vitesse de la route, en profondeurs par seconde. */
const SPEED = 4.2;
const BRAKE = 0.8;

/** Chemin parcouru : constant, puis la voiture freine (vitesse en (1 - x)²). */
function travel(plan: ChasePlan, t: number): number {
  const b = plan.brakeAt;
  if (t <= b) return SPEED * t;
  const x = clamp((t - b) / BRAKE);
  return SPEED * b + ((SPEED * BRAKE) / 3) * (1 - (1 - x) ** 3);
}

/** 0 en pleine course, 1 à l'arrêt. */
const brakeOf = (plan: ChasePlan, t: number) => easeOut((t - plan.brakeAt) / BRAKE);
/** La caméra ondule un peu : la route bouge sous elle, la ville presque pas. */
const camOf = (t: number, still: number) => (0.22 * Math.sin(0.83 * t) + 0.06 * Math.sin(2.1 * t + 1)) * (1 - still);

// ---------- la ville (tirée de la graine, mise en cache) ----------

interface City {
  far: string;
  mid: string;
  hedge: string;
  /** Fenêtres, rangées dans l'ordre où elles s'allument. */
  windows: { x: number; y: number; w: number; h: number }[];
  /** Petits palmiers de l'horizon. */
  palms: { x: number; s: number }[];
  /** Feux d'artifice : position et couleur. */
  bursts: { x: number; y: number; r: number; color: string }[];
}

const cityCache = new Map<string, City>();

function cityOf(seed: number, L: Layout): City {
  const key = `${seed}:${L.W}:${L.H}`;
  const hit = cityCache.get(key);
  if (hit) return hit;
  const r = rng(seed ^ 0x9e3779b9);
  const { W, H, u, hy } = L;
  const span = W / 2 + u * 0.2;
  const left = L.cx - span;
  const right = L.cx + span;

  // Plan lointain : de grands blocs et deux tours, brumeux.
  let far = "";
  for (let x = left; x < right; ) {
    const w = u * (0.07 + 0.09 * r());
    let h = H * (0.045 + 0.07 * r());
    if (r() < 0.16) h *= 1.75;
    far += `M${r1(x)} ${hy + 2}V${r1(hy - h)}H${r1(x + w)}V${hy + 2}Z`;
    if (r() < 0.35) {
      // gradin art déco
      const iw = w * 0.5;
      const ix = x + w * 0.25;
      far += `M${r1(ix)} ${r1(hy - h + 1)}V${r1(hy - h - H * 0.018)}H${r1(ix + iw)}V${r1(hy - h + 1)}Z`;
    }
    x += w * (0.75 + 0.2 * r());
  }

  // Plan moyen : façades art déco plus basses, avec leurs fenêtres.
  let mid = "";
  const windows: (City["windows"][number] & { rank: number })[] = [];
  const ww = Math.max(2, Math.round(u * 0.0075));
  const wh = Math.max(3, Math.round(ww * 1.5));
  for (let x = left - u * 0.03; x < right; ) {
    const w = u * (0.055 + 0.075 * r());
    const h = H * (0.028 + 0.05 * r()) * (r() < 0.12 ? 1.6 : 1);
    const top = hy - h;
    mid += `M${r1(x)} ${hy + 2}V${r1(top)}H${r1(x + w)}V${hy + 2}Z`;
    const deco = r();
    if (deco < 0.3) {
      // tourelle centrale et sa flèche
      const tw = w * 0.22;
      const tx = x + w / 2 - tw / 2;
      mid += `M${r1(tx)} ${r1(top + 1)}V${r1(top - H * 0.022)}H${r1(tx + tw)}V${r1(top + 1)}Z`;
      mid += `M${r1(x + w / 2 - 0.8)} ${r1(top - H * 0.021)}V${r1(top - H * 0.036)}H${r1(x + w / 2 + 0.8)}V${r1(top - H * 0.021)}Z`;
    } else if (deco < 0.55) {
      // auvent arrondi d'un côté
      const rr = Math.min(w * 0.3, h * 0.3);
      mid += `M${r1(x + w - rr)} ${r1(top + 1)}V${r1(top - rr * 0.6)}A${r1(rr)} ${r1(rr)} 0 0 1 ${r1(x + w)} ${r1(top + rr * 0.4)}V${r1(top + 1)}Z`;
    }
    // fenêtres en grille
    const gx = ww * 2.6;
    const gy = wh * 2.1;
    const cols = Math.floor((w - ww * 1.6) / gx);
    const rows = Math.floor((h - wh * 2.4) / gy);
    const ox = x + (w - (cols - 1) * gx - ww) / 2;
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) windows.push({ x: r1(ox + i * gx), y: r1(top + wh * 1.4 + j * gy), w: ww, h: wh, rank: r() });
    x += w * (0.8 + 0.25 * r());
  }

  // Haies et palmiers bas, à l'horizon : la route s'y perd.
  let hedge = `M${r1(left)} ${hy + 3}`;
  for (let x = left; x < right; ) {
    const rr = u * (0.014 + 0.016 * r());
    hedge += `A${r1(rr)} ${r1(rr * 0.75)} 0 0 1 ${r1(x + rr * 1.6)} ${hy + 3 - (r() < 0.5 ? 0 : 0)}`;
    x += rr * 1.6;
  }
  hedge += `V${hy + 3}H${r1(left)}Z`;
  const palms: City["palms"] = [];
  for (let x = left + u * 0.05; x < right; x += u * (0.12 + 0.2 * r())) {
    if (Math.abs(x - L.cx) < u * 0.08) continue;
    palms.push({ x: r1(x), s: 0.42 + 0.3 * r() });
  }

  const colors = [CREAM, BLUSH, CORAL, PERIWINKLE, CREAM, BLUSH];
  const bursts: City["bursts"] = [];
  for (let i = 0; i < 4; i++) {
    bursts.push({
      x: r1(L.cx + u * (-0.36 + 0.72 * ((i * 0.37 + r() * 0.3) % 1))),
      y: r1(H * (0.16 + 0.14 * r())),
      r: u * (0.08 + 0.05 * r()),
      color: colors[i % colors.length],
    });
  }

  windows.sort((a, b) => a.rank - b.rank);
  const city: City = { far, mid, hedge, windows: windows.map(({ x, y, w, h }) => ({ x, y, w, h })), palms, bursts };
  if (cityCache.size > 24) cityCache.clear();
  cityCache.set(key, city);
  return city;
}

// ---------- les formes (dessinées une fois, en 100 de large, le sol à y = 0) ----------

/** Palmier : tronc courbe et palmes tombantes, 100 de haut. */
const PALM = (() => {
  let d = "M-3.4 0C-2.2-38 1-70 6.2-97L9.6-96.4C5.4-69 2.6-38 3.4 0Z";
  const cx = 8;
  const cy = -98;
  // palmes : une nervure courbe, un bord supérieur lisse, un bord inférieur dentelé (les folioles)
  const fronds: [number, number][] = [
    [-178, 34], [-152, 38], [-128, 32], [-104, 24], [-80, 25], [-56, 32], [-30, 38], [-4, 34], [14, 28],
  ];
  for (const [a, len] of fronds) {
    const rad = (a * Math.PI) / 180;
    const droop = 16 * Math.abs(Math.cos(rad)) + 3;
    const tx = cx + Math.cos(rad) * len;
    const ty = cy + Math.sin(rad) * len + droop;
    const qx = cx + Math.cos(rad) * len * 0.55;
    const qy = cy + Math.sin(rad) * len * 0.55 - 7 * Math.abs(Math.cos(rad));
    const N = 10;
    const up: string[] = [];
    const down: string[] = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const x = (1 - s) ** 2 * cx + 2 * (1 - s) * s * qx + s * s * tx;
      const y = (1 - s) ** 2 * cy + 2 * (1 - s) * s * qy + s * s * ty;
      const dx = 2 * (1 - s) * (qx - cx) + 2 * s * (tx - qx);
      const dy = 2 * (1 - s) * (qy - cy) + 2 * s * (ty - qy);
      const l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l;
      const ny = dx / l;
      const w = 4.6 * Math.sin(Math.PI * Math.min(1, s * 1.08)) ** 0.6;
      up.push(`${r1(x + nx * w * 0.55)} ${r1(y + ny * w * 0.55)}`);
      const notch = i % 2 === 0 ? 1.0 : 0.7;
      down.push(`${r1(x - nx * w * notch)} ${r1(y - ny * w * notch)}`);
    }
    d += `M${up.join("L")}L${down.reverse().join("L")}Z`;
  }
  return d;
})();

/** Lampadaire : mât, bras vers l'avenue, tête. 100 de haut. */
const LAMP_POLE = "M-1.3 0V-92C-1.3-97 2-99 7-99H17V-96.4H7C3.6-96.4 1.3-95 1.3-92V0Z";
const LAMP_HEAD = "M12-99.5H22L20.5-95.5H13.5Z";

const COUPE = {
  body:
    "M-50-9Q-50-27-46-27H46Q50-27 50-9V-8Q50-5 46-5H-46Q-50-5-50-8Z" +
    "M-45-7H-31V0H-45ZM31-7H45V0H31Z" +
    "M-40-38L-30-55H30L40-38Z" +
    "M-47-41H-40V-37H-47ZM40-41H47V-37H40Z",
  top: "M-48-26L-42-39H42L48-26ZM-29-55L-27-59H27L29-55ZM-49-13H49V-10.5H-49Z",
  glass: "M-35.5-40L-28-53H28L35.5-40Z",
  grille: "M-21-24H21V-17H-21Z",
  lights: "M-46-24H-29L-30.5-18.5H-46ZM46-24H29L30.5-18.5H46Z",
};

const CRUISER = {
  body:
    "M-50-9Q-50-30-46-30H46Q50-30 50-9V-8Q50-5 46-5H-46Q-50-5-50-8Z" +
    "M-45-7H-31V0H-45ZM31-7H45V0H31Z" +
    "M-41-42L-32-62H32L41-42Z" +
    "M-48-45H-41V-41H-48ZM41-45H48V-41H41Z" +
    "M-27-69H27V-65H-27Z",
  top: "M-48-29L-43-43H43L48-29ZM-31-62L-29-66H29L31-62Z",
  glass: "M-37-44L-30-60H30L37-44Z",
  grille: "M-23-3H-19V-27H-23ZM19-3H23V-27H19ZM-23-15H23V-12H-23Z",
  lights: "M-45-26H-31V-21H-45ZM45-26H31V-21H45Z",
};

const VAN = {
  body:
    "M-50-9Q-50-32-46-32H46Q50-32 50-9V-8Q50-5 46-5H-46Q-50-5-50-8Z" +
    "M-45-7H-31V0H-45ZM31-7H45V0H31Z" +
    "M-48-32L-46-104H46L48-32Z" +
    "M-55-62H-48V-50H-55ZM48-62H55V-50H48Z" +
    "M-27-113H27V-110H-27Z",
  top: "M-46-104L-43-110H43L46-104ZM-47.5-78H47.5V-74H-47.5Z",
  glass: "M-43-40L-41.5-68H41.5L43-40Z",
  grille: "M-24-26H24V-20H-24Z",
  lights: "M-45-28H-31V-22H-45ZM45-28H31V-22H45Z",
};

/** Hélicoptère de profil, nez à gauche ; l'origine sous la cabine. */
const HELI = {
  body:
    "M-46-14C-46-32-28-40-6-40H14C24-40 28-32 28-22V-12C28-6 24-4 18-4H-38C-44-4-46-8-46-14Z" +
    "M24-30L82-33L84-27L24-16Z" +
    "M76-32L86-50H92L88-26Z" +
    "M-40 6H22V9.5H-40ZM-28-5H-25V7H-28ZM9-5H12V7H9Z" +
    "M-6-46H2V-39H-6Z",
  top: "M-26-37C-18-40-12-40-6-40H14C21-40 25-37 27-33H-30Z",
  glass: "M-43-15C-42-28-30-35-14-36V-15Z",
};

// ---------- les véhicules au sol ----------

interface Ground {
  kind: "coupe" | "cruiser" | "van";
  X: number;
  d: number;
  /** Décalage vertical (px), cahots. */
  lift: number;
  /** Roulis (degrés). */
  roll: number;
  /** Déphasage du gyrophare. */
  phase: number;
}

/** Les places de la meute, et d'où chaque renfort déboîte. */
const SLOTS: Record<"carL" | "carR" | "carM" | "van", { from: [number, number]; to: [number, number]; phase: number }> = {
  carL: { from: [-4.2, 4.6], to: [-1.55, 2.05], phase: 0 },
  carR: { from: [4.4, 5.0], to: [1.6, 2.35], phase: 0.5 },
  carM: { from: [0.2, 9.0], to: [0.05, 2.75], phase: 0.25 },
  van: { from: [-4.4, 5.4], to: [0, 2.2], phase: 0.75 },
};
const ENTRY = 0.95;

function groundUnits(plan: ChasePlan, t: number, units: Unit[], still: number): Ground[] {
  const out: Ground[] = [];
  const at = (u: Unit) => {
    const star = u === "carL" ? 1 : u === "carR" ? 2 : u === "carM" ? 3 : 4;
    return plan.beats[star - 1]?.at ?? Infinity;
  };
  const vanAt = at("van");
  for (const u of units) {
    if (u.startsWith("heli")) continue;
    const s = SLOTS[u as keyof typeof SLOTS];
    const p = (t - at(u)) / ENTRY;
    let [toX, toD] = s.to;
    // Le fourgon prend le milieu : la troisième voiture lui cède la place et recule.
    if (u === "carM") toD += 1.05 * easeInOut((t - vanAt - 0.15) / 0.8);
    const X = lerp(s.from[0], toX, easeOut(p * 1.25)) + 0.1 * Math.sin(1.6 * t + s.phase * 6) * (1 - still);
    let d = lerp(s.from[1], toD, easeInOut(p)) + 0.12 * Math.sin(1.1 * t + s.phase * 9) * (1 - still);
    // À l'arrêt, la meute serre la voiture du suspect.
    d *= 1 - 0.16 * still;
    out.push({
      kind: u === "van" ? "van" : "cruiser",
      X,
      d,
      lift: Math.abs(Math.sin(9.5 * t + s.phase * 7)) * (1 - still),
      roll: 1.4 * Math.sin(1.6 * t + s.phase * 6 + 0.6) * (1 - still) * clamp(p * 2),
      phase: s.phase,
    });
  }
  return out;
}

// ---------- les morceaux de la barrière (troisième étoile) ----------

interface Piece {
  X: number;
  vx: number;
  vy: number;
  spin: number;
  kind: "cone" | "plank" | "chip";
  size: number;
}
const PIECES: Piece[] = [
  { X: -0.62, vx: -1.5, vy: 2.9, spin: -420, kind: "cone", size: 0.2 },
  { X: -0.22, vx: -0.6, vy: 3.6, spin: 300, kind: "plank", size: 0.5 },
  { X: 0.25, vx: 0.7, vy: 3.4, spin: -360, kind: "plank", size: 0.46 },
  { X: 0.6, vx: 1.6, vy: 2.7, spin: 480, kind: "cone", size: 0.2 },
  { X: -0.4, vx: -2.2, vy: 2.0, spin: 540, kind: "cone", size: 0.17 },
  { X: 0.42, vx: 2.3, vy: 2.2, spin: -500, kind: "cone", size: 0.17 },
  { X: -0.05, vx: 0.25, vy: 4.2, spin: 700, kind: "chip", size: 0.09 },
  { X: 0.1, vx: -0.9, vy: 3.0, spin: -650, kind: "chip", size: 0.08 },
];
const GRAVITY = 9;
/** Le choc a lieu un peu après la troisième étoile. */
const IMPACT_DELAY = 0.18;

// ---------- sous-composants statiques (mémorisés : seules les transformations bougent) ----------

const Defs = memo(function Defs({ idp, pal, L }: { idp: string; pal: ChasePalette; L: Layout }) {
  const veh = (id: string, s: typeof COUPE, lightsFill: string) => (
    <g id={`${idp}-${id}`}>
      <path d={s.body} fill={pal.body} />
      <path d={s.top} fill={pal.top} />
      <path d={s.glass} fill={pal.glass} />
      <path d={s.grille} fill={pal.shadow} />
      <path d={s.lights} fill={lightsFill} />
    </g>
  );
  return (
    <defs>
      <linearGradient id={`${idp}-sky`} x1="0" y1="0" x2="0" y2={L.hy} gradientUnits="userSpaceOnUse">
        {pal.sky.map(([o, c]) => (
          <stop key={o} offset={o} stopColor={c} />
        ))}
      </linearGradient>
      <linearGradient id={`${idp}-road`} x1="0" y1={L.hy} x2="0" y2={L.H} gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor={pal.roadFar} />
        <stop offset="0.45" stopColor={pal.road} />
      </linearGradient>
      <path id={`${idp}-palm`} d={PALM} />
      <g id={`${idp}-lamp`}>
        <path d={LAMP_POLE} />
        <path d={LAMP_HEAD} fill={pal.lamp} />
      </g>
      {veh("coupe", COUPE, CREAM)}
      {veh("cruiser", CRUISER, pal.glass)}
      {veh("van", VAN, pal.glass)}
      <g id={`${idp}-heli`}>
        <path d={HELI.body} fill={pal.heli} />
        <path d={HELI.top} fill={pal.heliTop} />
        <path d={HELI.glass} fill={pal.heliTop} />
      </g>
    </defs>
  );
});

const Shape = memo(function Shape({ d, fill }: { d: string; fill: string }) {
  return <path d={d} fill={fill} />;
});

// ---------- l'image ----------

export function ChaseFrame({ t, plan, width, height, lang, insetTop = 0, backdropHref, idPrefix = "ch" }: ChaseFrameProps) {
  const L = layoutOf(width, height, insetTop);
  const pal = PALETTES[plan.light];
  const city = cityOf(plan.seed, L);
  const idp = idPrefix;
  const esc = escalation(plan, t);
  const still = brakeOf(plan, t);
  const cam = camOf(t, still);
  const dist = travel(plan, t);
  const { W, H, cx, hy, u, carW } = L;
  const nodes: ReactElement[] = [];

  // --- le ciel et ce qui y vit ---
  const discs: ReactElement[] = [];
  if (plan.light === "gold" && pal.disc) discs.push(<circle key="sun" cx={r1(cx - u * 0.27)} cy={r1(hy - H * 0.075)} r={r1(u * 0.058)} fill={pal.disc} />);
  if (plan.light === "night" && pal.disc) discs.push(<circle key="moon" cx={r1(cx - u * 0.3)} cy={r1(H * 0.215)} r={r1(u * 0.045)} fill={pal.disc} />);

  // feux d'artifice (sixième étoile), derrière la ville
  const six = plan.beats[5]?.at;
  const fireworks: ReactElement[] = [];
  if (six !== undefined) {
    city.bursts.forEach((b, i) => {
      for (const rep of [0, 1.15]) {
        const tau = t - six - 0.25 - i * 0.32 - rep;
        if (tau < 0 || tau > 1.1) continue;
        const R = b.r * easeOut(tau / 0.7);
        const a = 1 - smooth(0.45, 1.1, tau);
        let d = "";
        const n = 12;
        for (let k = 0; k < n; k++) {
          const ang = (k / n) * Math.PI * 2 + i;
          const c = Math.cos(ang);
          const s = Math.sin(ang);
          const drop = tau * tau * u * 0.03;
          d += `M${r1(b.x + c * R * 0.55)} ${r1(b.y + s * R * 0.55 + drop)}L${r1(b.x + c * R)} ${r1(b.y + s * R + drop)}`;
        }
        fireworks.push(<path key={`fw${i}-${rep}`} d={d} stroke={b.color} strokeWidth={r1(Math.max(2, u * 0.008))} strokeLinecap="round" fill="none" opacity={r1(a * 100) / 100} />);
      }
    });
  }

  // hélicoptères : derrière les toits, ils montent au-dessus
  const helis: { x: number; y: number; s: number; flip: boolean; a: number; phase: number }[] = [];
  for (const unit of esc.units) {
    if (!unit.startsWith("heli")) continue;
    const at = unit === "heli1" ? plan.beats[4].at : plan.beats[5].at + (unit === "heli3" ? 0.2 : 0);
    const p = (t - at) / 1.1;
    const bob = Math.sin(1.7 * t + (unit === "heli2" ? 2 : unit === "heli3" ? 4 : 0)) * H * 0.006;
    if (unit === "heli1") {
      helis.push({ x: cx + u * 0.21, y: lerp(hy + H * 0.02, H * 0.25, easeOut(p)) + bob, s: 0.88, flip: false, a: 1, phase: 0 });
    } else if (unit === "heli2") {
      helis.push({ x: lerp(cx - u * 0.75, cx - u * 0.25, easeOut(p)), y: lerp(H * 0.12, H * 0.205, easeOut(p)) + bob, s: 0.74, flip: true, a: 1, phase: 1.3 });
    } else {
      helis.push({ x: lerp(cx + u * 0.8, cx + u * 0.02, easeOut(p)), y: lerp(H * 0.1, H * 0.155, easeOut(p)) + bob, s: 0.5, flip: false, a: 1, phase: 2.1 });
    }
  }

  // la voiture du suspect
  const impact = plan.beats[2] ? plan.beats[2].at + IMPACT_DELAY : Infinity;
  const jolt = t >= impact ? Math.exp(-(t - impact) * 7) * Math.sin((t - impact) * 22) : 0;
  const sway = (0.07 * Math.sin(1.9 * t) + 0.03 * Math.sin(3.7 * t + 0.5)) * (1 - still);
  const carX = px(L, sway, 1, cam);
  const dive = Math.sin(clamp((t - plan.brakeAt) / 0.5) * Math.PI) * carW * 0.035;
  const carY = L.gY - Math.abs(Math.sin(11 * t)) * carW * 0.008 * (1 - still) - jolt * carW * 0.05 + dive;
  const carRoll = (1.5 * Math.sin(1.9 * t + 0.4) + 3 * jolt) * (1 - still);

  // --- couches ---
  nodes.push(<rect key="sky" width={W} height={hy + 4} fill={`url(#${idp}-sky)`} />);
  nodes.push(...discs, ...fireworks);
  helis.forEach((h, i) => {
    const s = (h.s * u * 0.24) / 100;
    const rot = 0.35 + 0.65 * Math.abs(Math.cos(t * 23 + h.phase));
    const lr = 66 * rot;
    nodes.push(
      <g key={`heli${i}`} transform={`translate(${r1(h.x)} ${r1(h.y)}) scale(${h.flip ? -r1(s * 1000) / 1000 : r1(s * 1000) / 1000} ${r1(s * 1000) / 1000}) rotate(${h.flip ? -4 : -4})`}>
        <use href={`#${idp}-heli`} />
        <path d={`M${r1(-2 - lr)} -49H${r1(-2 + lr)}V-45.5H${r1(-2 - lr)}ZM${r1(88 - 9 * rot)} -39.5H${r1(88 + 9 * rot)}V-36.5H${r1(88 - 9 * rot)}Z`} fill={pal.heli} />
      </g>,
    );
  });

  // la ville : trois plans, un soupçon de parallaxe
  const shift = (k: number) => r1(-cam * carW * k);
  nodes.push(
    <g key="far" transform={`translate(${shift(0.025)} 0)`}>
      <Shape d={city.far} fill={pal.far} />
    </g>,
  );
  const litBase = plan.light === "night" ? 0.42 : 0.2;
  const lit = six !== undefined ? lerp(litBase, 1, smooth(0, 0.9, t - six)) : litBase;
  const nLit = Math.round(city.windows.length * lit);
  let win = "";
  for (let i = 0; i < nLit; i++) {
    const w = city.windows[i];
    win += `M${w.x} ${w.y}h${w.w}v${w.h}h${-w.w}Z`;
  }
  nodes.push(
    <g key="mid" transform={`translate(${shift(0.06)} 0)`}>
      <Shape d={city.mid} fill={pal.mid} />
      <Shape d={win} fill={pal.windows} />
    </g>,
  );
  nodes.push(
    <g key="hedge" transform={`translate(${shift(0.12)} 0)`}>
      {city.palms.map((p, i) => (
        <use key={i} href={`#${idp}-palm`} fill={pal.hedge} transform={`translate(${p.x} ${hy + 2}) scale(${r1((p.s * H * 0.09 * 10) / 100) / 10})`} />
      ))}
      <Shape d={city.hedge} fill={pal.hedge} />
    </g>,
  );

  // --- le sol : bas-côtés, avenue, bordures, pointillés ---
  nodes.push(<rect key="verge" y={hy + 2} width={W} height={H - hy - 2} fill={pal.verge} />);
  const edge = 2.55;
  const dn = 0.3;
  nodes.push(
    <path
      key="road"
      d={`M${r1(px(L, -edge, dn, cam))} ${r1(py(L, dn))}L${r1(cx)} ${hy + 2}L${r1(px(L, edge, dn, cam))} ${r1(py(L, dn))}Z`}
      fill={`url(#${idp}-road)`}
    />,
  );
  const curb = (X0: number, X1: number) =>
    `M${r1(px(L, X0, dn, cam))} ${r1(py(L, dn))}L${r1(cx)} ${hy + 2}L${r1(px(L, X1, dn, cam))} ${r1(py(L, dn))}Z`;
  nodes.push(<path key="walks" d={curb(-edge - 1.25, -edge) + curb(edge, edge + 1.25)} fill={pal.walk} />);
  nodes.push(<path key="curbs" d={curb(-edge - 0.12, -edge) + curb(edge, edge + 0.12)} fill={pal.curb} />);

  // pointillés : ils filent de la caméra vers l'horizon
  const LANES = [-0.86, 0.86];
  const DASH_P = 1.15;
  const DASH_L = 0.42;
  const DASH_N = 16;
  const DMIN = 0.5;
  let dashes = "";
  for (const X of LANES) {
    for (let i = 0; i < DASH_N; i++) {
      const d1 = DMIN + ((((i * DASH_P + dist) % (DASH_N * DASH_P)) + DASH_N * DASH_P) % (DASH_N * DASH_P));
      const d2 = d1 + DASH_L;
      const y1 = py(L, d1);
      if (y1 > H + 4 && py(L, d2) > H + 4) continue;
      const hw = 0.034;
      dashes += `M${r1(px(L, X - hw, d1, cam))} ${r1(y1)}L${r1(px(L, X + hw, d1, cam))} ${r1(y1)}L${r1(px(L, X + hw, d2, cam))} ${r1(py(L, d2))}L${r1(px(L, X - hw, d2, cam))} ${r1(py(L, d2))}Z`;
    }
  }
  nodes.push(<path key="dashes" d={dashes} fill={CREAM} opacity={0.82} />);

  // palmiers et lampadaires du bord de l'avenue, du plus loin au plus près
  const SIDE_P = 2.3;
  const SIDE_N = 9;
  const span = SIDE_N * SIDE_P;
  const side: { X: number; d: number; lamp: boolean; flip: boolean }[] = [];
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < SIDE_N; i++) {
      const d = 0.45 + ((((i * SIDE_P + (sgn > 0 ? SIDE_P / 2 : 0) + dist) % span) + span) % span);
      side.push({ X: sgn * (i % 3 === 1 ? 2.95 : 3.5), d, lamp: i % 3 === 1, flip: sgn > 0 });
    }
  }
  side.sort((a, b) => b.d - a.d);
  for (const [i, o] of side.entries()) {
    const x = px(L, o.X, o.d, cam);
    const s = sc(L, o.d);
    const hgt = o.lamp ? 3.1 : 4.3;
    if (x + s * 1.5 < 0 || x - s * 1.5 > W) continue;
    const haze = smooth(1.5, span * 0.95, o.d);
    const fade = 1 - smooth(span * 0.8, span + 0.4, o.d);
    const k = (s * hgt) / 100;
    nodes.push(
      <use
        key={`side${i}`}
        href={`#${idp}-${o.lamp ? "lamp" : "palm"}`}
        fill={mix(pal.palm, pal.far, haze * 0.85)}
        opacity={fade < 1 ? r1(fade * 100) / 100 : undefined}
        transform={`translate(${r1(x)} ${r1(py(L, o.d))}) scale(${r1((o.flip !== o.lamp ? -k : k) * 1000) / 1000} ${r1(k * 1000) / 1000})`}
      />,
    );
  }

  // --- la meute ---
  const ground = groundUnits(plan, t, esc.units, still).sort((a, b) => b.d - a.d);
  let shadows = "";
  const veh: ReactElement[] = [];
  for (const [i, g] of ground.entries()) {
    const x = px(L, g.X, g.d, cam);
    const y = py(L, g.d) - g.lift * sc(L, g.d) * 0.02;
    const k = (sc(L, g.d) * (g.kind === "van" ? 1.12 : 1)) / 100;
    shadows += ellipsePath(x, py(L, g.d) - 0.5, 54 * k, 6 * k);
    const on = Math.floor(t / 0.18 + g.phase * 2) % 2 === 0;
    const barY = g.kind === "van" ? -119 : -75;
    veh.push(
      <g key={`veh${i}`} transform={`translate(${r1(x)} ${r1(y)}) scale(${r1(k * 1000) / 1000}) rotate(${r1(g.roll * 10) / 10})`}>
        <use href={`#${idp}-${g.kind}`} />
        <path d={`M-26 ${barY}H-2V${barY + 6}H-26Z`} fill={on ? CORAL : PERIWINKLE} />
        <path d={`M2 ${barY}H26V${barY + 6}H2Z`} fill={on ? PERIWINKLE : CORAL} />
      </g>,
    );
  }

  // la barrière qui vole (troisième étoile)
  let coral = "";
  let cream = "";
  if (t >= impact) {
    const tau = t - impact;
    for (const p of PIECES) {
      // en l'air, poussés par le choc ; posés, ils filent avec la route
      const tLand = (2 * p.vy) / GRAVITY;
      const ta = Math.min(tau, tLand);
      const Yw = Math.max(0, p.vy * ta - 0.5 * GRAVITY * ta * ta) + 0.08;
      const X = p.X + p.vx * ta;
      const d = 1.02 + 0.9 * ta + (tau > tLand ? SPEED * (tau - tLand) : 0);
      if (d > 20) continue;
      const s = sc(L, d);
      const x = px(L, X, d, cam);
      const y = py(L, d) - Yw * s;
      const ang = ((p.spin * ta) % 360) * (Math.PI / 180);
      const sz = p.size * s;
      const poly = (pts: [number, number][]) =>
        pts
          .map(([a, b], j) => {
            const rx = a * Math.cos(ang) - b * Math.sin(ang);
            const ry = a * Math.sin(ang) + b * Math.cos(ang);
            return `${j ? "L" : "M"}${r1(x + rx * sz)} ${r1(y + ry * sz)}`;
          })
          .join("") + "Z";
      if (p.kind === "cone") {
        coral += poly([[-0.5, 0.5], [0.5, 0.5], [0.12, -0.6], [-0.12, -0.6]]);
        cream += poly([[-0.34, 0.05], [0.34, 0.05], [0.26, -0.18], [-0.26, -0.18]]);
      } else if (p.kind === "plank") {
        cream += poly([[-0.5, -0.09], [0.5, -0.09], [0.5, 0.09], [-0.5, 0.09]]);
        coral += poly([[-0.3, -0.09], [-0.12, -0.09], [-0.12, 0.09], [-0.3, 0.09]]) + poly([[0.12, -0.09], [0.3, -0.09], [0.3, 0.09], [0.12, 0.09]]);
      } else {
        coral += poly([[-0.5, -0.4], [0.5, -0.2], [0.1, 0.5]]);
      }
    }
  }

  // les projecteurs des hélicoptères, qui suivent la voiture du suspect
  let beams = "";
  let pools = "";
  helis.forEach((h, i) => {
    const s = (h.s * u * 0.24) / 100;
    const sx = h.x + (h.flip ? 38 : -38) * s;
    const sy = h.y - 4 * s;
    const tx = carX + carW * 0.28 * Math.sin(1.25 * t + i * 2.2) * (1 - still);
    const ty = L.gY - carW * 0.05;
    const half = carW * (0.4 + 0.06 * i);
    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len;
    const ny = dx / len;
    beams += `M${r1(sx + nx * 3 * s)} ${r1(sy + ny * 3 * s)}L${r1(tx + nx * half)} ${r1(ty + ny * half * 0.3)}L${r1(tx - nx * half)} ${r1(ty - ny * half * 0.3)}L${r1(sx - nx * 3 * s)} ${r1(sy - ny * 3 * s)}Z`;
    pools += ellipsePath(tx, ty, half * 1.05, carW * 0.14);
  });
  const beamIn = helis.length ? clamp((t - plan.beats[4].at - 0.7) / 0.4) : 0;

  nodes.push(<path key="shadows" d={shadows} fill={pal.shadow} />);
  nodes.push(...veh);
  if (beams && beamIn > 0) {
    nodes.push(<path key="pools" d={pools} fill={CREAM} opacity={r1(beamIn * 12) / 100} />);
    nodes.push(<path key="beams" d={beams} fill={CREAM} opacity={r1(beamIn * 14) / 100} />);
  }
  if (coral) nodes.push(<path key="coral" d={coral} fill={CORAL} />, <path key="cream" d={cream} fill={CREAM} />);

  // --- la fin : le lieu du crime glisse derrière la voiture arrêtée ---
  const slide = easeOut((t - plan.brakeAt - 0.4) / 0.75);
  if (slide > 0) {
    // l'image couvre le cadre (ratio 3:2), calée en bas : son aplat sombre sous la voiture
    const iw = Math.max(W, H * 1.5);
    const ih = iw / 1.5;
    const ix = cx - iw / 2 + (1 - slide) * W;
    const iy = H - ih;
    nodes.push(
      <g key="scene">
        <rect x={r1(ix + (iw - W) / 2 - 1)} y={0} width={W + 2} height={H} fill={pal.road} />
        <image href={backdropHref ?? `/profiles/${plan.scene}.jpg`} x={r1(ix)} y={r1(iy)} width={r1(iw)} height={r1(ih)} preserveAspectRatio="none" />
      </g>,
    );
  }

  // la voiture du suspect : phares crème et leurs faisceaux plats vers la caméra
  const ck = carW / 100;
  nodes.push(<path key="carshadow" d={ellipsePath(carX, L.gY - 1, carW * 0.56, carW * 0.07)} fill={pal.shadow} />);
  nodes.push(
    <path
      key="headbeams"
      d={`M${r1(carX - carW * 0.44)} ${r1(carY - carW * 0.2)}L${r1(carX - carW * 0.3)} ${r1(carY - carW * 0.2)}L${r1(carX - carW * 0.2)} ${H}L${r1(carX - carW * 0.95)} ${H}Z` +
        `M${r1(carX + carW * 0.44)} ${r1(carY - carW * 0.2)}L${r1(carX + carW * 0.3)} ${r1(carY - carW * 0.2)}L${r1(carX + carW * 0.2)} ${H}L${r1(carX + carW * 0.95)} ${H}Z`}
      fill={CREAM}
      opacity={0.08}
    />,
  );
  nodes.push(
    <g key="suspect" transform={`translate(${r1(carX)} ${r1(carY)}) scale(${r1(ck * 1000) / 1000}) rotate(${r1(carRoll * 10) / 10})`}>
      <use href={`#${idp}-coupe`} />
    </g>,
  );

  // --- le HUD : six étoiles, la radio ---
  nodes.push(<Hud key="hud" plan={plan} t={t} L={L} lang={lang} />);

  // --- le flash blanc ---
  const flash = t < plan.flashAt ? 0 : t < plan.duration ? clamp((t - plan.flashAt) / 0.07) : 1 - clamp((t - plan.duration) / 0.3);
  if (flash > 0) nodes.push(<rect key="flash" width={W} height={H} fill="#ffffff" opacity={r1(flash * 100) / 100} />);

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <Defs idp={idp} pal={pal} L={L} />
      {nodes}
    </svg>
  );
}

function ellipsePath(x: number, y: number, rx: number, ry: number): string {
  return `M${r1(x - rx)} ${r1(y)}A${r1(rx)} ${r1(ry)} 0 1 0 ${r1(x + rx)} ${r1(y)}A${r1(rx)} ${r1(ry)} 0 1 0 ${r1(x - rx)} ${r1(y)}Z`;
}

// ---------- le HUD ----------

function Hud({ plan, t, L, lang }: { plan: ChasePlan; t: number; L: Layout; lang: Lang }) {
  const size = Math.round(Math.min(30, L.u * 0.074));
  const gap = Math.round(size * 0.3);
  const total = 6 * size + 5 * gap;
  const x0 = L.cx - total / 2;
  const y0 = Math.max(18, L.top + 14);
  const stars: ReactElement[] = [];
  for (let k = 1; k <= 6; k++) {
    const beat = plan.beats[k - 1];
    let on = !!beat && t >= beat.at;
    let pop = 1;
    if (beat && on) {
      const tau = t - beat.at;
      pop = 1 + 0.5 * Math.sin(clamp(tau / 0.32) * Math.PI) * (1 - clamp(tau / 0.32) * 0.4);
    }
    if (plan.flicker && plan.flicker.star === k) {
      const tau = t - plan.flicker.at;
      on = (tau >= 0 && tau < 0.09) || (tau >= 0.22 && tau < 0.31);
    }
    const x = x0 + (k - 1) * (size + gap) + size / 2;
    const y = y0 + size / 2;
    const s = (size / 24) * pop;
    stars.push(
      <path
        key={k}
        d={STAR_PATH}
        transform={`translate(${r1(x)} ${r1(y)}) scale(${r1(s * 1000) / 1000}) translate(-12 -12)`}
        fill={on ? CREAM : INK}
        fillOpacity={on ? 1 : 0.3}
        stroke={on ? INK : CREAM}
        strokeOpacity={on ? 0.85 : 0.55}
        strokeWidth={on ? 1.4 : 1.2}
        strokeLinejoin="round"
      />,
    );
  }

  // la radio : la ligne de la dernière étoile, tapée en 0,4 s ; à l'arrêt, le niveau
  const radio = plan.radio[lang];
  let line = "";
  let since = 0;
  for (const b of plan.beats) {
    if (t >= b.at) {
      line = radio.beats[b.star - 1];
      since = t - b.at;
    }
  }
  const endAt = plan.brakeAt + 0.45;
  if (t >= endAt) {
    line = radio.end;
    since = t - endAt;
  }
  let pill: ReactElement | null = null;
  if (line) {
    const fsize = Math.round(Math.min(13, L.u * 0.032));
    const maxW = Math.min(L.u - 40, 440);
    const f = fit(upper(line, lang), { font: "mono-500", size: fsize, minSize: Math.max(9, fsize - 3), maxWidth: maxW - fsize * 2.4, letterSpacing: 0.5, minLetterSpacing: 0 });
    const shown = [...f.text].slice(0, Math.ceil([...f.text].length * clamp(since / 0.4))).join("");
    const ph = Math.round(f.size * 2.2);
    const pw = f.width + f.size * 2.6;
    const py0 = y0 + size + Math.round(size * 0.45);
    const px0 = L.cx - pw / 2;
    const blink = Math.floor(t / 0.5) % 2 === 0;
    pill = (
      <g key="radio">
        <rect x={r1(px0)} y={py0} width={r1(pw)} height={ph} rx={ph / 2} fill={INK} opacity={0.78} />
        <rect x={r1(px0 + f.size * 0.85)} y={r1(py0 + ph / 2 - f.size * 0.25)} width={r1(f.size * 0.5)} height={r1(f.size * 0.5)} fill={blink ? CORAL : PERIWINKLE} />
        <text x={r1(px0 + f.size * 1.75)} y={r1(py0 + ph / 2 + f.size * 0.36)} fontSize={f.size} letterSpacing={f.letterSpacing} fill={CREAM} {...fontAttrs("mono-500")}>
          {shown}
        </text>
      </g>
    );
  }
  return (
    <g>
      {stars}
      {pill}
    </g>
  );
}
