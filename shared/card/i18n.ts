// Libellés de la fiche et des compositions d'images, en français et en anglais.
import type { Lang } from "../types";

const NBSP = " ";

export const STRINGS = {
  fr: {
    loneWolf: "Loup solitaire",
    /** Pied : « Interrogatoire par une IA : 9 s · preuves 34 % ». Épicène (§2.4) : rien ne s'accorde avec la personne. */
    questioned: (s: number) => `Interrogatoire par une IA${NBSP}: ${s}${NBSP}s`,
    evidence: "preuves",
    percent: (n: number) => `${n}${NBSP}%`,
    ai: "IA",
    cvStamp: "D'APRÈS LE CV",
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
    githubSide: "Ce que ton GitHub prouve",
    overall: "Note",
    /** Alias de l'ancienne carte, encore lus par les compositions serveur. */
    freeAgent: "Loup solitaire",
    judged: (s: number) => `Interrogatoire par une IA${NBSP}: ${s}${NBSP}s`,
    reliability: "preuves",
    positions: {
      FS: "Full-stack", BE: "Backend", FE: "Frontend", MOB: "Mobile", DATA: "Data", ML: "Machine learning",
      OPS: "Ops", SEC: "Sécurité", EMB: "Embarqué", PM: "Produit", DESIGN: "Design", CTO: "CTO autoproclamé",
    } as Record<string, string>,
  },
  en: {
    loneWolf: "Lone wolf",
    questioned: (s: number) => `Questioned by an AI for ${s}${NBSP}s`,
    evidence: "evidence",
    percent: (n: number) => `${n}%`,
    ai: "AI",
    cvStamp: "PER THE CV",
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
    githubSide: "What your GitHub proves",
    overall: "Rating",
    freeAgent: "Lone wolf",
    judged: (s: number) => `Questioned by an AI for ${s}${NBSP}s`,
    reliability: "evidence",
    positions: {
      FS: "Full-stack", BE: "Backend", FE: "Frontend", MOB: "Mobile", DATA: "Data", ML: "Machine learning",
      OPS: "Ops", SEC: "Security", EMB: "Embedded", PM: "Product", DESIGN: "Design", CTO: "Self-styled CTO",
    } as Record<string, string>,
  },
} satisfies Record<Lang, Record<string, unknown>>;

export function t(lang: Lang) {
  return STRINGS[lang] ?? STRINGS.fr;
}
