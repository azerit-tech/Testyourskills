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
