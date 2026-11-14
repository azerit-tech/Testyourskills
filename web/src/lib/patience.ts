// Jusqu'où le front attend une fiche en traitement (§12, §18.24). Le serveur
// coupe lui-même la fiche à la fin de son délai (CARD_TIMEOUT_MS, 60 s par
// défaut, repoussé par une lecture LinkedIn lente) et dit dans l'état du job le
// temps qui lui reste (`timeLeft`) : le front patiente jusque-là, plus une marge.
// En file, rien : le serveur coupe au bout de 3 min. Pur, sans DOM.

/** Au-delà du délai annoncé par le serveur : le temps d'un dernier aller-retour. */
export const CLIENT_GRACE_MS = 15_000;
/** Serveur muet sur son délai (mode démo) : 60 s, la rallonge LinkedIn de 60 s, et la marge. */
export const CLIENT_TIMEOUT_MS = 135_000;

export interface Patience {
  /** Début du traitement vu par le front (ms epoch). */
  started: number;
  /** Instant où le front abandonne (ms epoch) ; null en file. */
  giveUpAt: number | null;
}

/** La patience mise à jour par un état « pending » du job, lu à `now`. */
export function nextPatience(p: Patience, job: { queue?: number; timeLeft?: number }, now: number): Patience {
  if (job.queue) return { started: now, giveUpAt: null };
  if (typeof job.timeLeft === "number") {
    // Délai écoulé côté serveur (timeLeft à 0) : on ne repousse plus, la coupure arrive.
    if (job.timeLeft > 0 || p.giveUpAt === null) return { ...p, giveUpAt: now + job.timeLeft + CLIENT_GRACE_MS };
    return p;
  }
  return { ...p, giveUpAt: p.started + CLIENT_TIMEOUT_MS };
}

export const gaveUp = (p: Patience, now: number): boolean => p.giveUpAt !== null && now > p.giveUpAt;
