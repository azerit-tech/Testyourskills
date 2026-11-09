// Mise en forme des trouvailles (§18.26) : nombres, dates et heures, en français
// et en anglais. Écrite à la main plutôt qu'avec Intl : le rendu ne dépend ni de
// l'ICU de la machine ni de son fuseau, et les tests le figent.

import type { Lang } from "../../../shared/types";

/** Espace insécable : « 1 240 étoiles », « 61 % », « 2 h 47 » ne se coupent pas. */
export const NBSP = " ";

const MONTHS: Record<Lang, string[]> = {
  fr: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

const WEEKDAYS: Record<Lang, string[]> = {
  fr: ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

/** 7274 → « 7 274 » (fr) ou « 7,274 » (en). */
export function num(n: number, lang: Lang): string {
  const s = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, lang === "fr" ? NBSP : ",");
  return n < 0 ? `-${s}` : s;
}

/** 0.614 → « 61 % » (fr) ou « 61% » (en). */
export function pct(share: number, lang: Lang): string {
  const p = Math.round(share * 100);
  return lang === "fr" ? `${p}${NBSP}%` : `${p}%`;
}

/**
 * Une date lue en heure locale : `d` est un instant déjà décalé, dont on lit les
 * champs UTC. « 14 mars 2016 », « 1er mars 2016 » ; « March 14, 2016 ».
 */
export function dayDate(d: Date, lang: Lang): string {
  const day = d.getUTCDate();
  const month = MONTHS[lang][d.getUTCMonth()]!;
  const year = d.getUTCFullYear();
  if (lang === "fr") return `${day === 1 ? "1er" : day}${NBSP}${month} ${year}`;
  return `${month}${NBSP}${day}, ${year}`;
}

/** « avril 2011 » ; « April 2011 ». */
export function monthYear(d: Date, lang: Lang): string {
  return `${MONTHS[lang][d.getUTCMonth()]}${NBSP}${d.getUTCFullYear()}`;
}

/** « 2 h 47 » ; « 2:47 a.m. ». */
export function clock(h: number, m: number, lang: Lang): string {
  const mm = String(m).padStart(2, "0");
  if (lang === "fr") return `${h}${NBSP}h${NBSP}${mm}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm}${NBSP}${h < 12 ? "a.m." : "p.m."}`;
}

export function weekday(i: number, lang: Lang): string {
  return WEEKDAYS[lang][i]!;
}

/** Typographie française : espace insécable avant « : ; ! ? » et dans les guillemets, pour qu'aucun signe ne passe seul à la ligne. */
export function frTypo(s: string): string {
  return s.replace(/ ([:;!?»])/g, `${NBSP}$1`).replace(/« /g, `«${NBSP}`);
}

/** Singulier ou pluriel, sur le nombre seulement : jamais d'accord avec la personne. */
export function plural(n: number, one: string, many: string): string {
  return Math.abs(n) === 1 ? one : many;
}
