// Libellés de la fiche et des compositions d'images, en français et en anglais.
import type { Lang } from "../types";

const NBSP = " ";

export const STRINGS = {
  fr: {
    loneWolf: "Sans bande",
    /** Pied : « Interrogatoire par une IA : 9 s · preuves 34 % ». Épicène (§2.4) : rien ne s'accorde avec la personne. */
    questioned: (s: number) => `Interrogatoire par une IA${NBSP}: ${s}${NBSP}s`,
    evidence: "preuves",
    percent: (n: number) => `${n}${NBSP}%`,
    ai: "IA",
    cvStamp: "D'APRÈS LE CV",
    linkedinStamp: "D'APRÈS LINKEDIN",
    sourceGithub: "GitHub",
    sourceCv: "CV",
    file: "Dossier",
    specialty: "Spécialité",
    weapon: "Arme",
    affiliation: "Affiliation",
    charges: "Chefs d'accusation",
    caseNo: "N°",
    insufficient: "données insuffisantes",
    buzzNote: "hors note",
    cta: "Fais la tienne",
    /** Titre des images de partage, comme la page partagée (§18.18). */
    poster: "Avis de recherche",
    card: "Fiche",
    stars: (n: number) => `${n} étoile${n > 1 ? "s" : ""} sur 6`,
    cvSide: "Ce que ton CV déclare",
    linkedinSide: "Ce que ton LinkedIn déclare",
    githubSide: "Ce que ton GitHub prouve",
    overall: "Note",
    /** Alias de l'ancienne carte, encore lus par les compositions serveur. */
    freeAgent: "Sans bande",
    judged: (s: number) => `Interrogatoire par une IA${NBSP}: ${s}${NBSP}s`,
    reliability: "preuves",
    positions: {
      FS: "Full-stack", BE: "Backend", FE: "Frontend", MOB: "Mobile", DATA: "Data", ML: "Machine learning",
      OPS: "Ops", SEC: "Sécurité", EMB: "Embarqué", PM: "Produit", DESIGN: "Design", CTO: "CTO sur parole",
    } as Record<string, string>,
    /** Dos de la fiche (§18.27) : chaque axe, son fait le plus fort, puis la formule. */
    back: {
      title: "Pièces à conviction",
      axes: { TEC: "Technique", SHIP: "Livraison", ARCH: "Rigueur", DOC: "Communication", XP: "Expérience", BUZZ: "Buzzwords" },
      noFact: "Aucun fait relevé",
      rating: "La note",
      /** Un poids de la formule : « 30 % ». */
      weight: (w: number) => `${Math.round(w * 100)}${NBSP}%`,
      flip: "Retourner la fiche",
      /** Le barème de recrutement (§18.37) : la note est la moyenne pondérée des critères notés, × 10. */
      gridRating: "La note · moyenne pondérée × 10",
      criteria: { EDU: "École", XP: "Expérience", EMP: "Parcours", STK: "Stack", CODE: "Code", ACT: "Activité", OWN: "Ownership", OSS: "Open source" },
      /** « Code 7 × 2 » : la note sur 10 et son coefficient, jamais un « + n ». */
      term: (name: string, score: number, coef: string) => `${name} ${score}${NBSP}×${NBSP}${coef}`,
      divide: (den: string) => `÷${NBSP}${den}`,
      capped: `plafond 85, aucun code prouvé`,
      empty: `Dossier vide${NBSP}: moins d'un quart des coefficients notés`,
    },
  },
  en: {
    loneWolf: "Lone wolf",
    questioned: (s: number) => `Questioned by an AI for ${s}${NBSP}s`,
    evidence: "evidence",
    percent: (n: number) => `${n}%`,
    ai: "AI",
    cvStamp: "PER THE CV",
    linkedinStamp: "PER LINKEDIN",
    sourceGithub: "GitHub",
    sourceCv: "CV",
    file: "File",
    specialty: "Specialty",
    weapon: "Weapon",
    affiliation: "Affiliation",
    charges: "Charges",
    caseNo: "No.",
    insufficient: "not enough data",
    buzzNote: "not rated",
    cta: "Make yours",
    poster: "Wanted",
    card: "Sheet",
    stars: (n: number) => `${n} star${n > 1 ? "s" : ""} out of 6`,
    cvSide: "What your CV claims",
    linkedinSide: "What your LinkedIn claims",
    githubSide: "What your GitHub proves",
    overall: "Rating",
    freeAgent: "Lone wolf",
    judged: (s: number) => `Questioned by an AI for ${s}${NBSP}s`,
    reliability: "evidence",
    positions: {
      FS: "Full-stack", BE: "Backend", FE: "Frontend", MOB: "Mobile", DATA: "Data", ML: "Machine learning",
      OPS: "Ops", SEC: "Security", EMB: "Embedded", PM: "Product", DESIGN: "Design", CTO: "Self-styled CTO",
    } as Record<string, string>,
    back: {
      title: "Exhibits",
      axes: { TEC: "Technique", SHIP: "Shipping", ARCH: "Rigor", DOC: "Communication", XP: "Experience", BUZZ: "Buzzwords" },
      noFact: "No fact on file",
      rating: "The rating",
      weight: (w: number) => `${Math.round(w * 100)}%`,
      flip: "Flip the card",
      gridRating: "The rating · weighted mean × 10",
      criteria: { EDU: "School", XP: "Experience", EMP: "Career", STK: "Stack", CODE: "Code", ACT: "Activity", OWN: "Ownership", OSS: "Open source" },
      term: (name: string, score: number, coef: string) => `${name} ${score}${NBSP}×${NBSP}${coef}`,
      divide: (den: string) => `÷${NBSP}${den}`,
      capped: "capped at 85, no code proven",
      empty: "Empty file: under a quarter of the weights scored",
    },
  },
} satisfies Record<Lang, Record<string, unknown>>;

export function t(lang: Lang) {
  return STRINGS[lang] ?? STRINGS.fr;
}
