// « CV » devient « LinkedIn » (SPEC §18.24), partagé par le serveur et le mode
// démo du front. Le barème et les catalogues (statuts, profils, peines) parlent de CV ; pour une fiche jugée sur LinkedIn, leurs textes
// finaux sont réécrits ici, une fois, à la sortie du moteur : le barème ne change pas.

import type { CardData, ComparisonData, Fact } from "./types";

const FR: [RegExp, string][] = [
  [/\bdu CV\b/g, "du profil LinkedIn"],
  [/\bsur le CV\b/g, "sur LinkedIn"],
  [/\bd'après le CV\b/g, "d'après LinkedIn"],
  [/\b(depuis|selon) le CV\b/g, "$1 LinkedIn"],
  [/\b([Ll])e CV\b/g, "$1e profil LinkedIn"],
  [/\b([Uu])n CV\b/g, "$1n profil LinkedIn"],
  [/\bCV\b/g, "LinkedIn"],
];
// En anglais, le CV se dit “résumé” (§18.51) ; « CV » reste reconnu pour les fiches d'avant.
// « \b » ne borne pas un « é » final : la fin du mot se teste à la main.
const CV_EN = "(?:CV|[Rr]ésumé)(?![\\wÀ-ɏ])";
const EN: [RegExp, string][] = [
  [new RegExp(`\\b(on|per|from|since) the ${CV_EN}`, "g"), "$1 LinkedIn"],
  [new RegExp(`\\b([Tt])he ${CV_EN}`, "g"), "$1he LinkedIn profile"],
  [new RegExp(`\\b([Aa]) ([\\w-]+ )?${CV_EN}`, "g"), "$1 $2LinkedIn profile"],
  [new RegExp(`(?<![\\wÀ-ɏ])${CV_EN}`, "g"), "LinkedIn"],
];

const sub = (s: string, rules: [RegExp, string][]) => rules.reduce((acc, [re, to]) => acc.replace(re, to), s);
export const linkedinFact = (f: Fact): Fact => ({ fr: sub(f.fr, FR), en: sub(f.en, EN) });

/** Carte déclarative jugée sur LinkedIn : textes réécrits, `declaredSource` posé. */
export function asLinkedinCard<T extends Omit<CardData, "id" | "createdAt">>(card: T): T {
  return {
    ...card,
    declaredSource: "linkedin",
    stats: card.stats.map((s) => ({ ...s, facts: s.facts.map(linkedinFact) })),
    statuses: card.statuses.map((st) => ({ ...st, label: linkedinFact(st.label), rule: linkedinFact(st.rule) })),
    ...(card.profile ? { profile: { ...card.profile, label: linkedinFact(card.profile.label), tagline: linkedinFact(card.profile.tagline) } } : {}),
    ...(card.sentence
      ? { sentence: { label: linkedinFact(card.sentence.label), ...(card.sentence.bail ? { bail: linkedinFact(card.sentence.bail) } : {}) } }
      : {}),
  };
}

/** Dossier LinkedIn et GitHub (§18.36) : la pièce déclarative et le profil de la pièce GitHub réécrits. Plus de titre d'écart. */
export function asLinkedinComparison<T extends Omit<ComparisonData, "id" | "createdAt">>(cmp: T): T {
  const gh = cmp.github;
  return {
    ...cmp,
    declaredSource: "linkedin",
    cv: asLinkedinCard(cmp.cv),
    github: {
      ...gh,
      ...(gh.profile ? { profile: { ...gh.profile, label: linkedinFact(gh.profile.label), tagline: linkedinFact(gh.profile.tagline) } } : {}),
    },
  };
}
