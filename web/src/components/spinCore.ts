// La berline qui tourne au doigt (SPEC §18.79) : la logique sans DOM, testée seule.
// 144 images pré-rendues d'un tour complet, l'image 143 suivie de l'image 0 sans saut.

/** Le nombre d'images du tour. */
export const FRAMES = 144;
/** L'image au repos : la vue trois-quarts avant. */
export const POSTER = 140;
/** Un tour complet pour ce nombre de largeurs d'encart glissées. */
export const TURN_WIDTHS = 1.5;
/** Images décodées gardées en mémoire, au plus (chacune 960 × 480 × 4 octets, 1,8 Mo). */
export const DECODED_MAX = 10;
/** L'élan au lâcher : constante de temps du freinage, en ms. */
export const COAST_TAU = 320;
/** L'élan s'arrête sous cette vitesse (images par ms). */
export const COAST_STOP = 0.004;
/** L'élan ne dépasse pas cette vitesse (images par ms) : un tour en un peu moins de 2 s. */
export const COAST_MAX = 0.08;
/** Au clavier, une flèche fait tourner de 10°. */
export const KEY_STEP = 4;

/** Un indice ramené dans le tour. */
export function wrap(i: number, n = FRAMES): number {
  return ((Math.round(i) % n) + n) % n;
}

/** Les pixels glissés pour une image, selon la largeur de l'encart. */
export function pxPerFrame(width: number, n = FRAMES): number {
  return Math.max(1, (width * TURN_WIDTHS) / n);
}

/**
 * La position (en images, non bornée) après un glissement de dx pixels.
 * Glisser vers la droite emmène vers la droite le flanc proche de l'objectif : les images reculent.
 */
export function dragTo(start: number, dx: number, width: number, n = FRAMES): number {
  return start - dx / pxPerFrame(width, n);
}

/** L'ordre de chargement : l'image au repos, puis de plus en plus fin (tous les 16, 8, 4, 2, 1). */
export function loadOrder(n = FRAMES, first = POSTER): number[] {
  const out = [wrap(first, n)];
  const seen = new Set(out);
  for (const step of [16, 8, 4, 2, 1]) {
    for (let k = 0; k < n; k += step) {
      const i = wrap(first + k, n);
      if (!seen.has(i)) {
        seen.add(i);
        out.push(i);
      }
    }
  }
  return out;
}

/** L'image disponible la plus proche de i dans le tour, ou null. */
export function nearest(i: number, has: (j: number) => boolean, n = FRAMES, reach = n / 2): number | null {
  const c = wrap(i, n);
  for (let d = 0; d <= reach; d++) {
    if (has(wrap(c + d, n))) return wrap(c + d, n);
    if (d > 0 && has(wrap(c - d, n))) return wrap(c - d, n);
  }
  return null;
}

/** Un pas de l'élan : la vitesse freinée en douceur après dt ms, nulle sous le seuil. */
export function coast(v: number, dt: number): number {
  const next = v * Math.exp(-dt / COAST_TAU);
  return Math.abs(next) < COAST_STOP ? 0 : next;
}

/**
 * La vitesse au lâcher (images par ms), d'après les derniers points du geste : ceux des 100 ms
 * avant le dernier, ou à défaut l'avant-dernier. Le doigt resté immobile plus de 100 ms : pas d'élan.
 */
export function releaseSpeed(samples: { t: number; pos: number }[], now: number): number {
  if (samples.length < 2) return 0;
  const b = samples[samples.length - 1];
  if (now - b.t > 100) return 0;
  const recent = samples.filter((s) => b.t - s.t <= 100);
  const a = recent.length >= 2 ? recent[0] : samples[samples.length - 2];
  const dt = b.t - a.t;
  if (dt <= 0) return 0;
  const v = (b.pos - a.pos) / dt;
  return Math.max(-COAST_MAX, Math.min(COAST_MAX, v));
}

type Conn = { saveData?: boolean; effectiveType?: string };

/** Économie de données ou 2G : l'image fixe seule, rien d'autre ne se télécharge. */
export function stillOnly(nav: { connection?: Conn } | undefined): boolean {
  const c = nav?.connection;
  if (!c) return false;
  return c.saveData === true || /(^|-)2g$/.test(c.effectiveType ?? "");
}

/** Les images décodées, les plus anciennes rendues d'abord : jamais plus de `max` en mémoire. */
export class Lru<T> {
  private map = new Map<number, T>();
  constructor(
    private max: number,
    private drop: (v: T) => void = () => {},
  ) {}
  get(k: number): T | undefined {
    const v = this.map.get(k);
    if (v !== undefined) {
      this.map.delete(k);
      this.map.set(k, v);
    }
    return v;
  }
  has(k: number): boolean {
    return this.map.has(k);
  }
  set(k: number, v: T): void {
    const old = this.map.get(k);
    if (old !== undefined && old !== v) this.drop(old);
    this.map.delete(k);
    this.map.set(k, v);
    while (this.map.size > this.max) {
      const [oldest, ov] = this.map.entries().next().value as [number, T];
      this.map.delete(oldest);
      this.drop(ov);
    }
  }
  get size(): number {
    return this.map.size;
  }
  clear(): void {
    for (const v of this.map.values()) this.drop(v);
    this.map.clear();
  }
}
