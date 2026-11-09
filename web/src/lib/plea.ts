// Le pari (§18.27) : avant le verdict, la personne dit combien d'étoiles elle
// plaide. Il reste dans ce navigateur, rangé par fiche ; rien ne part au serveur.

const KEY = (cardId: string) => `tys_plea_${cardId}`;

/** L'écart entre le pari et le verdict : trop haut, juste, trop bas. */
export type PleaGap = "over" | "exact" | "under";

const valid = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 6;

/** Range le pari de cette fiche. Stockage bloqué : le pari vaut pour cette page seulement. */
const memory = new Map<string, number>();

export function setPlea(cardId: string, stars: number): void {
  if (!valid(stars)) return;
  memory.set(cardId, stars);
  try {
    window.localStorage.setItem(KEY(cardId), String(stars));
  } catch {
    /* navigation privée, webview : la mémoire suffit */
  }
}

/** Le pari de cette fiche, de 1 à 6, ou null. */
export function getPlea(cardId: string): number | null {
  const inMemory = memory.get(cardId);
  if (inMemory !== undefined) return inMemory;
  try {
    const n = Number(window.localStorage.getItem(KEY(cardId)));
    return valid(n) ? n : null;
  } catch {
    return null;
  }
}

export function pleaGap(pleaded: number, actual: number): PleaGap {
  return pleaded > actual ? "over" : pleaded < actual ? "under" : "exact";
}
