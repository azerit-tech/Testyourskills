// Le film et le réseau (docs/cinematique-poursuite.md §5.3, §5.4) : la partie
// pure, sans DOM, testée par net.test.ts. Les adresses des fichiers, le choix
// de la variante (haute ou éco) sur le débit mesuré, et le compteur de débit.
// Le chargement lui-même est dans loader.ts.

/** « 720 » : la variante haute ; « 540 » : la variante éco. */
export type Quality = "720" | "540";

/**
 * L'adresse d'un fichier du film. Sans base : celle que Vite a donnée
 * (/assets/nom-empreinte.mp4). Avec une base (VITE_FILM_BASE) : le même nom à
 * empreinte, sous cette base.
 */
export function filmAssetUrl(base: string, url: string): string {
  const b = base.trim();
  if (!b) return url;
  const name = url.slice(url.lastIndexOf("/") + 1);
  return (b.endsWith("/") ? b : `${b}/`) + name;
}

/** Sous ce débit mesuré, la variante haute est abandonnée pour l'éco (bits par seconde). */
export const ECO_BELOW_BPS = 5_000_000;
/** Le débit se mesure sur les premiers octets du premier fichier en variante haute. */
export const PROBE_BYTES = 350_000;
/** Un fichier fini plus court que ça ne dit rien du débit : la variante haute reste. */
export const PROBE_MIN_BYTES = 300_000;

export interface NetFacts {
  /** L'économiseur de données (navigator.connection.saveData). */
  saveData: boolean;
  /** Le type de connexion annoncé, s'il y en a un (Android). */
  effectiveType?: string;
  /** La réponse se lit en flux (ReadableStream) : le débit se mesure. */
  canStream: boolean;
}

/**
 * La variante au départ. Économiseur de données : éco d'emblée. Sinon la
 * haute, que la mesure du débit peut faire abandonner ; sans lecture en flux,
 * pas de mesure : le repli d'avant, sur la connexion annoncée.
 */
export function initialVariant(f: NetFacts): Quality {
  if (f.saveData) return "540";
  if (!f.canStream && f.effectiveType && /^(slow-2g|2g|3g)$/.test(f.effectiveType)) return "540";
  return "720";
}

/** Débit en bits par seconde, ou null si rien ne se mesure encore. */
export const bitsPerSecond = (bytes: number, ms: number): number | null => (ms > 0 ? (bytes * 8 * 1000) / ms : null);

/**
 * Le verdict de la mesure, sur le premier fichier en variante haute :
 * « pending » tant que PROBE_BYTES ne sont pas arrivés (et le fichier pas fini),
 * « eco » sous ECO_BELOW_BPS, « keep » sinon. `ms` : depuis l'arrivée des
 * en-têtes (la latence du premier octet n'est pas du débit).
 */
export function probeVerdict(loaded: number, ms: number, done: boolean): "pending" | "keep" | "eco" {
  if (loaded < PROBE_BYTES) {
    if (!done) return "pending";
    if (loaded < PROBE_MIN_BYTES) return "keep";
  }
  const bps = bitsPerSecond(loaded, ms);
  return bps !== null && bps < ECO_BELOW_BPS ? "eco" : "keep";
}

/** Plus d'un octet reçu depuis ce temps, un téléchargement en cours : le réseau est tenu pour coupé. */
export const STALL_MS = 1500;

/**
 * Le compteur de débit de la page : les octets reçus sur le temps où un
 * téléchargement était en cours (les fichiers se chargent un par un, les
 * périodes ne se chevauchent pas). Les instants sont passés par l'appelant.
 */
export class RateMeter {
  bytes = 0;
  private activeMs = 0;
  private since: number | null = null;
  private lastByteAt = 0;

  /** Les en-têtes d'un fichier sont arrivés : le temps compte. */
  begin(now: number): void {
    if (this.since === null) this.since = now;
    this.lastByteAt = now;
  }

  add(n: number, now: number): void {
    this.bytes += n;
    this.lastByteAt = now;
  }

  /** Le fichier est fini (ou abandonné). */
  end(now: number): void {
    if (this.since === null) return;
    this.activeMs += Math.max(0, now - this.since);
    this.since = null;
  }

  /**
   * Le débit moyen, en bits par seconde ; 0 si un téléchargement en cours ne
   * reçoit plus rien depuis STALL_MS ; null tant qu'il n'y a pas de quoi mesurer.
   */
  bps(now: number): number | null {
    if (this.since !== null && now - this.lastByteAt >= STALL_MS) return 0;
    const ms = this.activeMs + (this.since === null ? 0 : Math.max(0, now - this.since));
    if (this.bytes < 32_000 || ms < 50) return null;
    return bitsPerSecond(this.bytes, ms);
  }
}
