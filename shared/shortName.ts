// Le nom court d'une personne dans un classement (SPEC §18.127) : le prénom, puis l'initiale
// du nom de famille. « Pierre-Antoine Bannier » donne « Pierre-Antoine B. », « Enzo Le Van »
// « Enzo L. » (la particule est la première lettre du nom), « Charles-Meldhine Madi Mnemoi »
// « Charles-Meldhine M. ». Un seul mot reste tel quel. Les recruteurs passent par Azerit,
// pas par le nom complet de la personne. Pur, même règle au serveur et en démo.

/** Le prénom et l'initiale du nom : « Enzo L. ». Un nom d'un seul mot reste entier ; vide reste vide. */
export function shortName(full: string | null | undefined): string {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  // L'initiale : la première lettre de ce qui suit le prénom (« d'Arc » donne « D. »).
  const letter = [...parts.slice(1).join(" ")].find((ch) => /\p{L}/u.test(ch));
  return letter ? `${parts[0]} ${letter.toLocaleUpperCase("fr")}.` : parts[0]!;
}
