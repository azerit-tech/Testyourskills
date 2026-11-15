// Le titre de l'accueil et sa description d'aperçu, en un seul endroit : le
// héros de l'accueil (web/src/i18n.ts), le titre de l'onglet, les balises de
// l'accueil servies par le serveur (server/src/html.ts) et l'image d'aperçu de
// l'accueil (server/src/render/compositions.tsx) les lisent ici. Seule copie à
// la main : web/index.html (le gabarit statique de Vite), qu'un test compare à
// ce fichier (server/src/html.test.ts).
//
// Deux phrases, chacune en deux lignes : la coupure de la ligne est la seule
// permise dans le héros (insécables ailleurs), et l'image en garde les quatre lignes.
// Le premier écran dit ce qu'on obtient (§18.48) : une fiche de dev, des étoiles.

import type { Lang } from "./types";
import { frTypo } from "./typo";

export interface HomePromise {
  /** La première phrase, en deux lignes (crème dans le héros et l'image). */
  claim: [string, string];
  /** La seconde, en deux lignes (rose poudré). */
  proof: [string, string];
  /** La description d'aperçu (balise description, og:description). */
  description: string;
}

export const HOME_PROMISE: Record<Lang, HomePromise> = {
  fr: {
    claim: ["Ta fiche", "de dev."],
    proof: ["Combien", "d'étoiles ?"],
    description: "Ta fiche de dev façon avis de recherche, notée de une à six étoiles. LinkedIn ou GitHub, une minute. Par Azerit.",
  },
  en: {
    claim: ["Your dev", "rap sheet."],
    proof: ["How many", "stars?"],
    description: "Your dev rap sheet, wanted-poster style, rated one to six stars. LinkedIn or GitHub, one minute. By Azerit.",
  },
};

/** Une phrase en texte courant : « Ta fiche de dev. » */
export const promiseSentence = (lines: readonly string[]): string => lines.join(" ");

/** Le titre entier : « Ta fiche de dev. Combien d'étoiles ? » (insécable devant le « ? »). */
export function promiseTitle(lang: Lang): string {
  const p = HOME_PROMISE[lang];
  const title = `${promiseSentence(p.claim)} ${promiseSentence(p.proof)}`;
  return lang === "fr" ? frTypo(title) : title;
}

/** Le seul nom visible du produit (§18.48). */
export const SITE_NAME = "Azerit";

/** Le titre de l'onglet et des balises : « Azerit · Ta fiche de dev. Combien d'étoiles ? » */
export const homeTitle = (lang: Lang): string => `${SITE_NAME} · ${promiseTitle(lang)}`;

/** Le titre d'une page sans fiche : « Les bandes · Azerit ». */
export const pageTitle = (subject: string): string => `${subject} · ${SITE_NAME}`;

/** Pour le héros : insécables dans chaque ligne, une seule coupure possible par phrase, entre ses deux lignes. */
export const heroSentence = (lines: readonly string[]): string => lines.map((l) => l.replace(/ /g, " ")).join(" ");
