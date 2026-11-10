// Le titre de l'écart d'une comparaison, à la troisième personne : pour qui n'a
// pas fait la fiche (le visiteur de la page partagée, l'aperçu de lien). Le
// catalogue (data/statuses.json) tutoie : il parle à qui vient de la faire.
// Une seule formulation, lue par le front (i18n.ts) et le serveur (html.ts).
// Épicène : « de @x », « son code » (le possessif s'accorde avec le nom).

import type { ComparisonData, Lang } from "./types";
import { declaredOf } from "./types";

type Gap = (who: string, src: string, n: number) => string;

/** Face à un GitHub « dossier vide » : le code n'est pas prouvé, l'écart ne se chiffre pas (§18.37). */
export const THEIR_UNPROVEN: Record<Lang, (who: string, src: string) => string> = {
  fr: (who, src) => `Le code de ${who} reste à prouver : son ${src} parle seul`,
  en: (who, src) => `${who}'s code is still unproven: their ${src} does all the talking`,
};

export const THEIR_GAP: Record<Lang, { declaredAhead: Gap; codeAhead: Gap }> = {
  fr: {
    declaredAhead: (who, src, n) => `Le ${src} de ${who} a volé ${n} ${n > 1 ? "points" : "point"} à son code`,
    codeAhead: (who, src, n) => `Le code de ${who} vaut ${n} ${n > 1 ? "points" : "point"} de plus que son ${src}`,
  },
  en: {
    declaredAhead: (who, src, n) => `${who}'s ${src} stole ${n} ${n === 1 ? "point" : "points"} from their code`,
    codeAhead: (who, src, n) => `${who}'s code is worth ${n} ${n === 1 ? "point" : "points"} more than their ${src}`,
  },
};

/** « LinkedIn » ou « CV », selon ce que la fiche déclarative a lu (§18.24). */
export const declaredLabel = (cmp: Pick<ComparisonData, "declaredSource">): string => (declaredOf(cmp) === "linkedin" ? "LinkedIn" : "CV");

/** Le titre de l'écart pour `who` (« @lea » ou un nom) ; null à égalité, où le titre du catalogue ne s'adresse à personne. Un GitHub vide : code à prouver, sans chiffre. */
export function theirHeadline(cmp: Pick<ComparisonData, "cv" | "github" | "declaredSource">, lang: Lang, who: string): string | null {
  if (cmp.github.grid?.rule === "empty_file") return THEIR_UNPROVEN[lang](who, declaredLabel(cmp));
  const n = cmp.cv.overall - cmp.github.overall;
  if (n === 0) return null;
  const gap = THEIR_GAP[lang];
  return n > 0 ? gap.declaredAhead(who, declaredLabel(cmp), n) : gap.codeAhead(who, declaredLabel(cmp), -n);
}
