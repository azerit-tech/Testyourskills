// Le titre de l'accueil et sa description d'aperçu, en un seul endroit : le
// héros de l'accueil (web/src/i18n.ts), le titre de l'onglet, les balises de
// l'accueil servies par le serveur (server/src/html.ts) et l'image d'aperçu de
// l'accueil (server/src/render/compositions.tsx) les lisent ici. Seule copie à
// la main : web/index.html (le gabarit statique de Vite), qu'un test compare à
// ce fichier (server/src/html.test.ts).
//
// Deux phrases, chacune en deux lignes : la coupure de la ligne est la seule
// permise dans le héros (insécables ailleurs), et l'image en garde les quatre lignes.
// Variante en attente de Jacques (rapport « jugé comme par un recruteur ») :
//   fr : [["Ton LinkedIn,", "ton code."], ["Lus comme par", "un recruteur."]]
//   en : [["Your LinkedIn,", "your code."], ["Read the way", "a recruiter would."]]

import type { Lang } from "./types";

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
    claim: ["Azerit ouvre", "ton dossier."],
    proof: ["Tu plaides", "quoi ?"],
    description: "Huit critères de recrutement, chacun sur 10, chacun avec sa preuve. Ta fiche en une minute. Par Azerit.",
  },
  en: {
    claim: ["Azerit opens", "your file."],
    proof: ["How do", "you plead?"],
    description: "Eight hiring criteria, each out of 10, each with its proof. Your sheet in a minute. By Azerit.",
  },
};

/** Une phrase en texte courant : « Azerit ouvre ton dossier. » */
export const promiseSentence = (lines: readonly string[]): string => lines.join(" ");

/** Le titre entier : « Azerit ouvre ton dossier. Tu plaides quoi ? » */
export function promiseTitle(lang: Lang): string {
  const p = HOME_PROMISE[lang];
  return `${promiseSentence(p.claim)} ${promiseSentence(p.proof)}`;
}

/** Le titre de l'onglet et des balises : « Testyourskills · Azerit ouvre ton dossier. Tu plaides quoi ? » */
export const homeTitle = (lang: Lang): string => `Testyourskills · ${promiseTitle(lang)}`;

/** Pour le héros : insécables dans chaque ligne, une seule coupure possible par phrase, entre ses deux lignes. */
export const heroSentence = (lines: readonly string[]): string => lines.map((l) => l.replace(/ /g, " ")).join(" ");
