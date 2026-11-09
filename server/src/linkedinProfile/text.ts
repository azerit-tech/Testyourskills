// Profil LinkedIn → texte déclaratif, lu par le chemin CV (SPEC §18.24) : même
// lecture IA, même barème. Le texte est construit comme un CV propre (titre,
// résumé, postes datés avec leur description, formation, compétences) ; il
// n'existe qu'en mémoire, le temps de la lecture, comme le texte d'un PDF.

import type { CardData, ComparisonData, Fact } from "../../../shared/types";
import type { LinkedinProfile } from "./profile";

const range = (a: string | number | null, b: string | number | null, current: boolean) =>
  a || b ? ` (${a ?? "?"} – ${current ? "present" : (b ?? "?")})` : "";

export function profileToText(p: LinkedinProfile): string {
  const out: string[] = [];
  if (p.name) out.push(p.name);
  if (p.headline) out.push(p.headline);
  if (p.title && p.title !== p.headline) out.push(`Current title: ${p.title}`);
  if (p.summary) out.push("", "About", p.summary);
  if (p.roles.length) {
    out.push("", "Experience");
    for (const r of p.roles) {
      const head = [r.title, r.company].filter(Boolean).join(" — ");
      out.push(`${head}${range(r.start, r.end, r.end === null)}`);
      if (r.description) out.push(r.description);
    }
  }
  if (p.education.length) {
    out.push("", "Education");
    for (const s of p.education) {
      const what = [s.degree, s.field].filter(Boolean).join(", ");
      out.push(`${what ? `${what} — ` : ""}${s.school}${range(s.start, s.end, false)}`);
    }
  }
  if (p.skills.length) out.push("", "Skills", p.skills.join(", "));
  return out.join("\n").trim();
}

// --- « CV » devient « LinkedIn » ---------------------------------------------
// Le barème et les catalogues (statuts, profils, peines, titres d'écart) parlent
// de CV. Pour une fiche LinkedIn, leurs textes finaux sont réécrits ici, une fois,
// à la sortie du moteur : le barème ne change pas.

const FR: [RegExp, string][] = [
  [/\bdu CV\b/g, "du profil LinkedIn"],
  [/\bsur le CV\b/g, "sur LinkedIn"],
  [/\bd'après le CV\b/g, "d'après LinkedIn"],
  [/\b([Ll])e CV\b/g, "$1e profil LinkedIn"],
  [/\b([Uu])n CV\b/g, "$1n profil LinkedIn"],
  [/\bChange de CV\b/g, "Change de LinkedIn"],
  [/\bCV\b/g, "LinkedIn"],
];
const EN: [RegExp, string][] = [
  [/\b(on|per|from|since) the CV\b/g, "$1 LinkedIn"],
  [/\bRewrite the CV\b/g, "Rewrite your LinkedIn"],
  [/\b([Tt])he CV\b/g, "$1he LinkedIn profile"],
  [/\b([Aa]) ([\w-]+ )?CV\b/g, "$1 $2LinkedIn profile"],
  [/\bCV\b/g, "LinkedIn"],
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

/** Comparaison LinkedIn contre GitHub : la carte déclarative, le profil de la fiche GitHub et le titre de l'écart. */
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
    headline: linkedinFact(cmp.headline),
  };
}
