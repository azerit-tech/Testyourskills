// Noms de personnes (SPEC §18.80) : ce qu'on tape dans « Ton nom », et la règle
// qui dit que deux noms publics sont ceux d'une même personne. Reprise de
// l'application Azerit (`_same_public_full_name`, mesurée à 95,7 % d'accord sur
// 46 profils le 19 août 2026).

/** Les mots d'un nom : sans accents, en minuscules, lettres et chiffres seulement. */
export function nameWords(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return (
    value
      .normalize("NFKD")
      .replace(/\p{M}+/gu, "")
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? []
  );
}

/**
 * Deux noms complets concordants, jamais un prénom seul : au moins deux mots de
 * chaque côté, et les mots de l'un tous dans l'autre (« Alice Martin » et
 * « Dr Alice B Martin »).
 */
export function samePublicFullName(a: unknown, b: unknown): boolean {
  const x = nameWords(a);
  const y = nameWords(b);
  if (x.length < 2 || y.length < 2) return false;
  const sx = new Set(x);
  const sy = new Set(y);
  return x.every((w) => sy.has(w)) || y.every((w) => sx.has(w));
}

export interface PersonName {
  first: string;
  last: string;
  full: string;
  /** Clé de cache : sans accents ni casse. */
  key: string;
}

/**
 * « Prénom Nom » tel qu'on le cherche : deux mots d'au moins deux lettres (la
 * règle de l'application Azerit : une initiale ne désigne personne), 80
 * caractères au plus. Le premier mot est le prénom, le reste le nom. null sinon.
 */
export function parsePersonName(raw: unknown): PersonName | null {
  if (typeof raw !== "string") return null;
  const s = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (s.length < 3 || s.length > 80 || /[@/:\\<>"{}]|\d{3}/.test(s)) return null;
  const words = s.split(" ").filter((w) => /\p{L}/u.test(w));
  if (words.filter((w) => (w.match(/\p{L}/gu) ?? []).length >= 2).length < 2) return null;
  const first = words[0]!;
  const last = words.slice(1).join(" ");
  const full = `${first} ${last}`;
  return { first, last, full, key: nameWords(full).join(" ") };
}

/** Les particules d'un nom de famille : « Florent de La Tour », « Anna van der Berg ». */
const PARTICLES = new Set(["de", "du", "des", "d", "da", "das", "do", "dos", "di", "del", "della", "der", "den", "van", "von", "ter", "ten", "le", "la", "les", "mac", "mc", "st", "ste", "saint", "sainte", "el", "al", "ben", "bin", "y", "zu"]);

/**
 * Ce qui est tapé sous « Ton nom » (§18.112) : le nom, puis un mot-clé qui départage
 * les homonymes (« florent delorme criteo »). Le nom : le premier mot, les
 * particules qui suivent, puis un mot (« jean de la fontaine » : quatre mots, sans
 * mot-clé). Le reste, tel quel, est le mot-clé (une entreprise, une école, un métier).
 */
export function splitTyped(raw: string): { name: string; context: string } {
  const ws = raw.normalize("NFC").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  let i = 1;
  while (i < ws.length && PARTICLES.has(nameWords(ws[i]).join(""))) i++;
  const end = Math.min(ws.length, i + 1);
  return { name: ws.slice(0, end).join(" "), context: ws.slice(end).join(" ") };
}
