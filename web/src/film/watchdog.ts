// Le chien de garde de la lecture (docs/cinematique-poursuite.md §5.5) : pur,
// sans DOM, testé par watchdog.test.ts. Pendant que le film joue, l'horloge de
// la balise active doit avancer. Figée plus de FREEZE_MS, ou une pause que le
// lecteur n'a pas demandée : une relance (la balise est replacée sur son image
// et relancée) ; au second incident, le flash et la fiche. Jamais d'image
// figée ni d'écran noir.

/** L'horloge de la vidéo figée plus que ça, en lecture : incident. */
export const FREEZE_MS = 1500;
/** Relances permises sur tout le film avant le flash. */
export const MAX_RETRIES = 1;

export type WatchAction = "ok" | "retry" | "fail";

export class PlaybackWatchdog {
  /** Relances faites sur ce film. */
  retries = 0;
  private armed = false;
  private lastT = 0;
  private lastMoveAt = 0;

  /** La lecture est demandée, reprise, ou la balise change (bascule, seek) : l'horloge doit avancer à partir de là. */
  arm(now: number, mediaTime: number): void {
    this.armed = true;
    this.lastT = mediaTime;
    this.lastMoveAt = now;
  }

  /** La lecture s'arrête à la demande (pause, onglet caché, gel de fin, flash). */
  disarm(): void {
    this.armed = false;
  }

  get watching(): boolean {
    return this.armed;
  }

  /** À chaque rafraîchissement, l'horloge de la balise active. */
  check(now: number, mediaTime: number): WatchAction {
    if (!this.armed) return "ok";
    if (Math.abs(mediaTime - this.lastT) > 1e-4) {
      this.lastT = mediaTime;
      this.lastMoveAt = now;
      return "ok";
    }
    if (now - this.lastMoveAt < FREEZE_MS) return "ok";
    return this.incident(now);
  }

  /** Un incident signalé par la balise (pause non demandée) : une relance, puis le flash. */
  incident(now: number): WatchAction {
    if (!this.armed) return "ok";
    if (this.retries < MAX_RETRIES) {
      this.retries++;
      this.lastMoveAt = now;
      return "retry";
    }
    this.armed = false;
    return "fail";
  }
}
