// La typographie française des textes du site, en un seul endroit : espace
// insécable avant « : ; ! ? », à l'intérieur des guillemets, entre un nombre et
// son unité (« 9 s », « 5 Mo », « 90 jours », « 1 000 »), et dans « n° 1 ».
// Aucun signe ne passe seul à la ligne. Les dictionnaires français du front et
// les messages du serveur passent par ici : une chaîne écrite avec une espace
// simple en sort juste.

/** Espace insécable. */
export const NBSP = " ";

/** Les unités qui ne quittent pas leur nombre. */
const UNITS = "s|h|j|min|Mo|Ko|%|ans?|mois|jours?|semaines?|minutes?|secondes?|pages?";
const UNIT_RE = new RegExp(`(\\d) (${UNITS})(?![\\p{L}\\d])`, "gu");

/** Une chaîne française : les espaces qui doivent l'être deviennent insécables. Idempotent. */
export function frTypo(s: string): string {
  return s
    .replace(/ ([:;!?»])/g, `${NBSP}$1`)
    .replace(/« /g, `«${NBSP}`)
    .replace(UNIT_RE, `$1${NBSP}$2`)
    .replace(/(\d) (?=\d{3}(?!\d))/g, `$1${NBSP}`)
    .replace(/\b([Nn])° (?=\d)/g, `$1°${NBSP}`);
}

/**
 * Un dictionnaire français entier : chaque chaîne, chaque élément de tableau et
 * chaque résultat de fonction passe par `frTypo`. Les types ne changent pas.
 */
export function frTypoDeep<T>(value: T): T {
  if (typeof value === "string") return frTypo(value) as T;
  if (Array.isArray(value)) return value.map((v) => frTypoDeep(v)) as T;
  if (typeof value === "function") {
    const fn = value as unknown as (...args: unknown[]) => unknown;
    return function (this: unknown, ...args: unknown[]) {
      return frTypoDeep(fn.apply(this, args));
    } as T;
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = frTypoDeep(v);
    return out as T;
  }
  return value;
}

/**
 * Un texte découpé autour de ses ordinaux français (« 1er », « 3e ») : la marque
 * à part, pour l'écrire en exposant, à l'écran comme sur les images (SPEC §18.52).
 * Sans ordinal, un seul morceau.
 */
export function ordinalParts(text: string): { text: string; sup: boolean }[] {
  const out: { text: string; sup: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(/(?<![\p{L}\d])(\d+)(er|e)(?![\p{L}\d])/gu)) {
    const cut = m.index + m[1]!.length;
    out.push({ text: text.slice(last, cut), sup: false }, { text: m[2]!, sup: true });
    last = m.index + m[0].length;
  }
  if (last < text.length || out.length === 0) out.push({ text: text.slice(last), sup: false });
  return out;
}

/** Une table de faits bilingues (messages du serveur) : le français de chacun est repris. */
export function typoFacts<T extends Record<string, { fr: string }>>(facts: T): T {
  const out: Record<string, { fr: string }> = {};
  for (const [k, v] of Object.entries(facts)) out[k] = typoFact(v);
  return out as T;
}

/** Un fait bilingue : seul le français est repris. */
export function typoFact<T extends { fr: string }>(fact: T): T {
  return { ...fact, fr: frTypo(fact.fr) };
}
