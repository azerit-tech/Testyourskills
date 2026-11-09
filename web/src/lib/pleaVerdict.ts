// Le verdict du pari (§18.27) : le pari (lib/plea.ts) contre les étoiles de la
// fiche, et le drapeau « déjà compté » pour n'envoyer l'événement `plea` qu'une
// fois par fiche et par navigateur.
import { starsFor } from "../../../shared/types";
import { pleaGap, type PleaGap } from "./plea";

export interface Verdict {
  /** Étoiles plaidées, de 1 à 6. */
  pleaded: number;
  /** Étoiles de la fiche. */
  actual: number;
  gap: PleaGap;
  /** Plaidées moins obtenues : positif, la personne s'est surestimée. */
  diff: number;
}

export function pleaVerdict(pleaded: number, overall: number): Verdict {
  const actual = starsFor(overall);
  return { pleaded, actual, gap: pleaGap(pleaded, actual), diff: pleaded - actual };
}

const SENT_KEY = (cardId: string) => `tys_plea_sent_${cardId}`;
const sent = new Set<string>();

/** Vrai la première fois que le verdict de cette fiche s'affiche dans ce navigateur. */
export function firstVerdict(cardId: string): boolean {
  if (sent.has(cardId)) return false;
  sent.add(cardId);
  try {
    if (window.localStorage.getItem(SENT_KEY(cardId))) return false;
    window.localStorage.setItem(SENT_KEY(cardId), "1");
  } catch {
    /* stockage bloqué : une fois par page */
  }
  return true;
}
