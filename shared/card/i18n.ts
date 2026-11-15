// Libellés de la fiche et des compositions d'images, en français et en anglais.
import type { Lang } from "../types";

const NBSP = " ";

export const STRINGS = {
  fr: {
    loneWolf: "Sans bande",
    /** Pied : « Dossier lu par Azerit en 9 s · preuves 34 % ». Épicène (§2.4) : rien ne s'accorde avec la personne. */
    questioned: (s: number) => `Dossier lu par Azerit en ${s}${NBSP}s`,
    evidence: "preuves",
    percent: (n: number) => `${n}${NBSP}%`,
    /** La part de la note appuyée sur des preuves : « prouvé à 95 % ». */
    proven: (n: number) => `prouvé à ${n}${NBSP}%`,
    /** L'étiquette des six barres du recto (§18.48) : des traits, pas la note. */
    traits: "Portrait en six traits",
    traitsNote: `Portrait en six traits · la note${NBSP}: huit critères`,
    ai: "IA",
    cvStamp: "D'APRÈS LE CV",
    linkedinStamp: "D'APRÈS LINKEDIN",
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
    overall: "Note",
    /** Dossier vide fait par un tiers, pas encore revendiqué (shared/publicView.ts) : ni note ni étoiles. */
    sealed: "Dossier scellé",
    sealedSub: "Le code reste à prouver",
    positions: {
      FS: "Full-stack", BE: "Backend", FE: "Frontend", MOB: "Mobile", DATA: "Data", ML: "Machine learning",
      OPS: "Ops", SEC: "Sécurité", EMB: "Embarqué", PM: "Produit", DESIGN: "Design", CTO: "CTO",
    } as Record<string, string>,
    /** Dos de la fiche (§18.27, §18.48) : les huit critères et leur pièce, puis la formule. */
    back: {
      title: "Pièces à conviction",
      /** Le lien sous la fiche qui la retourne, et celui qui revient au recto. */
      toBack: "Pièces à conviction",
      toFront: "Retour à la fiche",
      /** L'état d'un critère sans note, ou noté hors de la moyenne. */
      unproven: "non prouvé",
      missing: "sans objet",
      outOfMean: "hors moyenne",
      /** Repli d'une pièce qui ne se montre pas en public : d'où elle vient. */
      readOn: (src: string) => `Lu sur ${src}.`,
      /** Fiche sans grille rangée (dénoncée, pas encore reprise) : d'où vient la note, sans formule. */
      fromGrid: "Note lue sur la grille de recrutement : huit critères, chacun noté sur 10.",
      axes: { TEC: "Technique", SHIP: "Livraison", ARCH: "Rigueur", DOC: "Communication", XP: "Expérience", BUZZ: "Buzzwords" },
      noFact: "Aucun fait relevé",
      rating: "La note",
      /** Un poids de la formule : « 30 % ». */
      weight: (w: number) => `${Math.round(w * 100)}${NBSP}%`,
      /** La grille de recrutement (§18.37) : la note est la moyenne pondérée des critères notés, × 10. */
      gridRating: "La note · moyenne pondérée des critères notés × 10",
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
    questioned: (s: number) => `File read by Azerit in ${s}${NBSP}s`,
    evidence: "evidence",
    percent: (n: number) => `${n}%`,
    proven: (n: number) => `${n}% proven`,
    traits: "A portrait in six traits",
    traitsNote: "A portrait in six traits · the rating: eight criteria",
    ai: "AI",
    cvStamp: "PER THE CV",
    linkedinStamp: "PER LINKEDIN",
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
    overall: "Rating",
    sealed: "Sealed file",
    sealedSub: "Code yet to prove",
    positions: {
      FS: "Full-stack", BE: "Backend", FE: "Frontend", MOB: "Mobile", DATA: "Data", ML: "Machine learning",
      OPS: "Ops", SEC: "Security", EMB: "Embedded", PM: "Product", DESIGN: "Design", CTO: "CTO",
    } as Record<string, string>,
    back: {
      title: "Exhibits",
      toBack: "Exhibits",
      toFront: "Back to the sheet",
      unproven: "unproven",
      missing: "not applicable",
      outOfMean: "not averaged",
      readOn: (src: string) => `Read on ${src}.`,
      fromGrid: "Rating read from the hiring scorecard: eight criteria, each scored out of 10.",
      axes: { TEC: "Technique", SHIP: "Shipping", ARCH: "Rigor", DOC: "Communication", XP: "Experience", BUZZ: "Buzzwords" },
      noFact: "No fact on file",
      rating: "The rating",
      weight: (w: number) => `${Math.round(w * 100)}%`,
      gridRating: "The rating · weighted mean of the scored criteria × 10",
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
