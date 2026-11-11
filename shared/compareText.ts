// Le titre de l'écart d'une comparaison, en une seule formulation pour tout le
// site : la page (tutoyée pour qui l'a faite, à la troisième personne pour le
// visiteur), l'aperçu de lien (html.ts), les images (render/compositions.tsx),
// le texte de partage (à la première personne) et le moteur, qui le range avec
// la comparaison (scoring/compare.ts). Les titres se calculent sur les deux
// notes : une comparaison rangée avant ce texte sort avec les mots d'aujourd'hui.
//
// Un seul dossier, deux pièces (rapport « jugé comme par un recruteur ») :
// LinkedIn ou le CV porte le parcours, GitHub porte le code. Rien n'accuse :
// une note que le code ne montre pas encore est « pas encore prouvée », jamais
// « volée ». Épicène : « de @x », « son code » (le possessif s'accorde avec le nom).

import { declaredLabel } from "./caseFile";
import type { ComparisonData, Lang } from "./types";

type Cmp = Pick<ComparisonData, "cv" | "github" | "declaredSource">;

/** « LinkedIn » ou « CV » : défini avec la fiche du dossier (shared/caseFile.ts). */
export { declaredLabel };

const pts: Record<Lang, (n: number) => string> = {
  fr: (n) => `${n}\u00a0${n > 1 ? "points" : "point"}`,
  en: (n) => `${n} ${n === 1 ? "point" : "points"}`,
};

/** L'écart : `n` > 0, la pièce déclarée annonce plus que le code ; < 0, le code en montre plus ; null, le code n'est pas prouvé (GitHub « dossier vide », §18.37). */
export function caseGap(cmp: Pick<ComparisonData, "cv" | "github">): number | null {
  // Dossier vide, ou dossier vide d'un tiers dont la grille ne part pas (shared/publicView.ts).
  if (cmp.github.grid?.rule === "empty_file" || cmp.github.sealed) return null;
  return cmp.cv.overall - cmp.github.overall;
}

interface Voice {
  /** La pièce déclarée annonce plus que le code public. */
  declaredAhead: (src: string, n: string) => string;
  /** Le code en montre plus que la pièce déclarée. */
  codeAhead: (src: string, n: string) => string;
  even: (src: string) => string;
  unproven: (src: string) => string;
}

/** Tutoyé : qui vient de faire la comparaison. */
const OWN: Record<Lang, Voice> = {
  fr: {
    declaredAhead: (src, n) => `Ton ${src} annonce ${n} que ton code public ne montre pas encore.`,
    codeAhead: (src, n) => `Ton ${src} te sous-vend de ${n}. Ton code le prouve.`,
    even: (src) => `${src} et code d'accord. Dossier solide.`,
    unproven: (src) => `Code non prouvé\u00a0: ton ${src} parle seul. Publie un vrai projet sur GitHub et on compare.`,
  },
  en: {
    declaredAhead: (src, n) => `Your ${src} claims ${n} your public code doesn't show yet.`,
    codeAhead: (src, n) => `Your ${src} undersells you by ${n}. Your code proves it.`,
    even: (src) => `${src} and code agree. Solid file.`,
    unproven: (src) => `Code not proven: your ${src} does all the talking. Publish one real project on GitHub and we'll compare.`,
  },
};

/** À la première personne : le texte de partage, posté par la personne. */
const MINE: Record<Lang, Voice> = {
  fr: {
    declaredAhead: (src, n) => `Mon ${src} annonce ${n} que mon code public ne montre pas encore.`,
    codeAhead: (src, n) => `Mon ${src} me sous-vend de ${n}.`,
    even: (src) => `${src} et code d'accord.`,
    unproven: (src) => `Code pas encore prouvé\u00a0: mon ${src} parle seul.`,
  },
  en: {
    declaredAhead: (src, n) => `My ${src} claims ${n} my public code doesn't show yet.`,
    codeAhead: (src, n) => `My ${src} undersells me by ${n}.`,
    even: (src) => `${src} and code agree.`,
    unproven: (src) => `Code not proven yet: my ${src} does the talking.`,
  },
};

function speak(v: Voice, cmp: Cmp, lang: Lang): string {
  const src = declaredLabel(cmp);
  const n = caseGap(cmp);
  if (n === null) return v.unproven(src);
  if (n === 0) return v.even(src);
  return n > 0 ? v.declaredAhead(src, pts[lang](n)) : v.codeAhead(src, pts[lang](-n));
}

/** Le titre pour qui a fait la comparaison : « Ton LinkedIn te sous-vend de 20 points. Ton code le prouve. » */
export const ownHeadline = (cmp: Cmp, lang: Lang): string => speak(OWN[lang], cmp, lang);

/** Le titre dans le texte de partage : « Mon LinkedIn me sous-vend de 20 points. » */
export const myVerdict = (cmp: Cmp, lang: Lang): string => speak(MINE[lang], cmp, lang);

/** À la troisième personne, pour qui n'a pas fait la fiche (visiteur, aperçu de lien). */
const THEIRS: Record<Lang, (who: string) => Voice> = {
  fr: (who) => ({
    declaredAhead: (src, n) => `Le ${src} de ${who} annonce ${n} que son code public ne montre pas encore`,
    codeAhead: (src, n) => `Le code de ${who} en montre plus que son ${src}\u00a0: ${n}`,
    even: (src) => `Le ${src} et le code de ${who} sont d'accord`,
    unproven: (src) => `Le code de ${who} reste à prouver\u00a0: son ${src} parle seul`,
  }),
  en: (who) => ({
    declaredAhead: (src, n) => `${who}'s ${src} claims ${n} their public code doesn't show yet`,
    codeAhead: (src, n) => `${who}'s code shows more than their ${src}: ${n}`,
    even: (src) => `${who}'s ${src} and code agree`,
    unproven: (src) => `${who}'s code is still unproven: their ${src} does all the talking`,
  }),
};

/** Le titre pour `who` (« @lea » ou un nom). */
export const theirHeadline = (cmp: Cmp, lang: Lang, who: string): string => speak(THEIRS[lang](who), cmp, lang);
