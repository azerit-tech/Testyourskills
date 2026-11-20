// Retrouver un profil LinkedIn de l'App Azerit par son nom (SPEC §18.96).
//
// L'App ne garde le nom d'une personne que dans son CV, compressé (`cvs.data`) :
// aucun index n'y mène. Mais l'adresse d'un profil LinkedIn est presque toujours
// faite du nom (« camille-ardent », « camille-ardent-4b2a1b23 », « camilleardent »,
// « ardent-camille ») : trois quarts des 30 848 CV le 20 novembre 2026. Le nom
// tapé donne donc quelques tranches de `accounts.handle_key`, lues par l'index
// unique `(platform, handle_key)` en moins d'un dixième de milliseconde chacune ;
// le CV de chaque compte trouvé dit ensuite le vrai nom et le titre.
//
// La base est en collation `en_US.utf8` sous musl, c'est-à-dire l'ordre des
// octets : la tranche [p, p⁺[ est exactement « commence par p ».

import { nameWords } from "../names";

/** Les mots d'un nom en minuscules, accents gardés (une adresse LinkedIn peut en porter). */
function accentedWords(value: string): string[] {
  return value.normalize("NFC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** p⁺ : p dont le dernier caractère passe au suivant, la borne haute de « commence par p ». */
export function after(p: string): string {
  const cps = Array.from(p);
  const last = cps.pop()!;
  return cps.join("") + String.fromCodePoint(last.codePointAt(0)! + 1);
}

export interface SlugRange {
  /** Ce par quoi l'adresse commence. */
  prefix: string;
  lo: string;
  hi: string;
}

/**
 * Les débuts d'adresse d'un nom : « prénom-nom », « prénomnom », et pour un nom
 * complet « nom-prénom » ; sans accents, et avec s'il y en a. Il faut deux mots.
 * `partial` : le dernier mot est en cours de frappe, pas d'ordre inversé.
 */
export function slugRanges(name: string, o: { partial?: boolean } = {}): SlugRange[] {
  const out: string[] = [];
  for (const ws of [nameWords(name), accentedWords(name)]) {
    if (ws.length < 2 || ws.length > 6) continue;
    const forms = [ws.join("-"), ws.join("")];
    if (!o.partial) forms.push([ws[ws.length - 1]!, ...ws.slice(0, -1)].join("-"));
    for (const f of forms) if (f.length >= 3 && f.length <= 100 && !out.includes(f)) out.push(f);
  }
  return out.map((prefix) => ({ prefix, lo: prefix, hi: after(prefix) }));
}

/**
 * Une adresse faite de ce nom, et pas d'un nom plus long : la forme seule, ou
 * suivie d'un tiret ou d'un chiffre (« camille-ardent-4b2a », « camilleardent87 ») ;
 * jamais « camille-ardentes ».
 */
export function slugOfName(slug: string, ranges: SlugRange[]): boolean {
  return ranges.some(({ prefix }) => {
    if (!slug.startsWith(prefix)) return false;
    const next = slug.charAt(prefix.length);
    return next === "" || next === "-" || /[0-9]/.test(next);
  });
}

/**
 * Le nom d'un CV commence-t-il par ce qui est tapé ? Tous les mots tapés, dans
 * l'ordre, le dernier pouvant être le début d'un mot (« camille ard »).
 */
export function nameStartsWith(name: string, typed: string): boolean {
  const n = nameWords(name);
  const t = nameWords(typed);
  if (t.length < 2 || n.length < t.length) return false;
  return t.every((w, i) => (i === t.length - 1 ? n[i]!.startsWith(w) : n[i] === w));
}
