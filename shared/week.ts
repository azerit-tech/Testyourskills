// Top de la semaine (§18.27) : le nombre de dossiers ne s'affiche qu'à partir de 20.
// En dessous, il dirait surtout que le site est vide.

export const MIN_SHOWN_TOTAL = 20;

/** Le nombre de dossiers de la semaine se montre-t-il ? */
export function showsTotal(total: number): boolean {
  return total >= MIN_SHOWN_TOTAL;
}
