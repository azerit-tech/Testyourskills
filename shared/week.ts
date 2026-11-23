// Le classement (§18.22, §18.128) : il court sur le mois civil, en UTC, du 1er à
// 00:00 au dernier jour à 23:59:59. Les noms « week » (WeekTop, WeekRank, weekStart)
// restent ceux de l'API ; leur période est le mois depuis le 23 novembre 2026.
// Le nombre de dossiers ne s'affiche qu'à partir de 20 (§18.27) : en dessous, il
// dirait surtout que le site est vide.

export const MIN_SHOWN_TOTAL = 20;

/** Le nombre de dossiers du mois se montre-t-il ? */
export function showsTotal(total: number): boolean {
  return total >= MIN_SHOWN_TOTAL;
}

/** Début de la période du classement qui contient `t` : le 1er du mois, 00:00 UTC, en ms. */
export function periodStart(t: number): number {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/** Fin de la période qui commence à `start` : le 1er du mois suivant, 00:00 UTC, en ms (exclue). */
export function periodEnd(start: number): number {
  const d = new Date(start);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

/** Le mois de la période (1 = janvier, 12 = décembre) : le champ `week` de l'API. */
export function periodMonth(start: number): number {
  return new Date(start).getUTCMonth() + 1;
}

const MONTHS = {
  fr: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
} as const;

/** Le nom du mois `month` (1 à 12), en minuscules en français : « novembre », « November ». */
export function monthName(month: number, lang: "fr" | "en"): string {
  return MONTHS[lang][(((Math.round(month) - 1) % 12) + 12) % 12]!;
}

/** « de novembre », « d'octobre » : l'élision devant avril, août, octobre. */
export function deMois(month: number): string {
  const m = monthName(month, "fr");
  return /^[aeiouyéèêâàô]/i.test(m) ? `d'${m}` : `de ${m}`;
}

/** Le nom du mois en tête de ligne : « Novembre », « November ». */
export function monthTitle(month: number, lang: "fr" | "en"): string {
  const m = monthName(month, lang);
  return m.charAt(0).toUpperCase() + m.slice(1);
}
