// Le titre de l'accueil et sa description d'aperçu, en un seul endroit : le
// héros de l'accueil (web/src/i18n.ts), le titre de l'onglet, les balises de
// l'accueil servies par le serveur (server/src/html.ts) et l'image d'aperçu de
// l'accueil (server/src/render/compositions.tsx) les lisent ici. Seule copie à
// la main : web/index.html (le gabarit statique de Vite), qu'un test compare à
// ce fichier (server/src/html.test.ts).
//
// Deux moitiés, chacune en deux lignes : la coupure de la ligne est la seule
// permise dans le héros (insécables ailleurs), et l'image en garde les quatre lignes.
// Le titre dit ce qu'on vient chercher : à quel point les recruteurs te veulent
// (§18.103, à la place de « Ta fiche de dev. Combien d'étoiles ? » du §18.48).

import type { Lang } from "./types";
import { measure, upper } from "./card/text";
import { frTypo } from "./typo";

export interface HomePromise {
  /** La première moitié, en deux lignes (crème dans le héros et l'image). */
  claim: [string, string];
  /** La seconde moitié, en deux lignes (rose poudré). */
  proof: [string, string];
  /** La description d'aperçu (balise description, og:description). */
  description: string;
}

export const HOME_PROMISE: Record<Lang, HomePromise> = {
  fr: {
    claim: ["Découvre à quel point", "tu es recherché"],
    proof: ["par les", "recruteurs !"],
    description: "Ta fiche de dev façon avis de recherche, notée de une à six étoiles. LinkedIn ou GitHub, une minute. Par Azerit.",
  },
  en: {
    claim: ["See how much", "recruiters"],
    proof: ["want", "your profile!"],
    description: "Your dev rap sheet, wanted-poster style, rated one to six stars. LinkedIn or GitHub, one minute. By Azerit.",
  },
};

/** Une moitié du titre en texte courant : « Découvre à quel point tu es recherché ». */
export const promiseSentence = (lines: readonly string[]): string => lines.join(" ");

/** Le titre entier : « Découvre à quel point tu es recherché par les recruteurs ! » (insécable devant le « ! »). */
export function promiseTitle(lang: Lang): string {
  const p = HOME_PROMISE[lang];
  const title = `${promiseSentence(p.claim)} ${promiseSentence(p.proof)}`;
  return lang === "fr" ? frTypo(title) : title;
}

/** Le seul nom visible du produit (§18.48). */
export const SITE_NAME = "Azerit";

/** Le titre de l'onglet et des balises : « Azerit · Découvre à quel point les recruteurs cherchent ton profil ! » */
export const homeTitle = (lang: Lang): string => `${SITE_NAME} · ${promiseTitle(lang)}`;

/** Le titre d'une page sans fiche : « Les bandes · Azerit ». */
export const pageTitle = (subject: string): string => `${subject} · ${SITE_NAME}`;

/**
 * La largeur du titre du héros, en tailles de police (Barlow Condensed 700, capitales) :
 * la plus longue de ses lignes, la seconde moitié comptée entière (la chute tient sur une
 * ligne). Le héros en tire sa taille, pour qu'aucune ligne ne déborde ni ne casse un mot,
 * quel que soit le titre (§18.103).
 */
export function heroTitleEm(lang: Lang): number {
  const p = HOME_PROMISE[lang];
  const lines = [...p.claim, ...p.proof, promiseSentence(p.proof)];
  const em = Math.max(...lines.map((l) => measure(upper(lang === "fr" ? frTypo(l) : l, lang), "display-700", 1)));
  return Math.round(em * 1000) / 1000;
}

/** Pour le héros : insécables dans chaque ligne, une seule coupure possible par phrase, entre ses deux lignes. */
export const heroSentence = (lines: readonly string[]): string => lines.map((l) => l.replace(/ /g, " ")).join(" ");
