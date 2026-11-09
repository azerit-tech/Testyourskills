// Les trouvailles LinkedIn de l'enquête en direct (SPEC §18.24, §18.26) :
// « LinkedIn retrouvé », et le nombre de compétences déclarées quand il fait
// sourire. Ton de procès-verbal, sans « tu » ; preuve : l'adresse du profil.
// Rien d'autre du profil (ni lieu, ni photo, ni employeur passé).

import type { Finding } from "../../../shared/types";
import { frTypo, NBSP, num, plural } from "../findings/format";
import type { LinkedinProfile } from "./profile";

/** Scores sur l'échelle des trouvailles GitHub (findings/github.ts, BASE). */
export const LINKEDIN_BASE = { linkedin_found: 32, linkedin_skills: 26 } as const;
/** Sous ce nombre de compétences, rien à en dire. */
const SKILLS_MIN = 15;

export function linkedinFindings(p: LinkedinProfile): Finding[] {
  if (!p.url.startsWith("https://www.linkedin.com/in/")) return [];
  const out: Finding[] = [];
  const title = (p.title || p.headline).replace(/\s+/g, " ").trim().slice(0, 80);
  out.push(
    title
      ? {
          kind: "linkedin_found",
          source: "linkedin",
          text: { fr: frTypo(`LinkedIn retrouvé : « ${title} ».`), en: `LinkedIn found: “${title}”.` },
          key: { fr: title, en: title },
          proof: p.url,
          score: LINKEDIN_BASE.linkedin_found,
        }
      : { kind: "linkedin_found", source: "linkedin", text: { fr: "LinkedIn retrouvé.", en: "LinkedIn found." }, proof: p.url, score: LINKEDIN_BASE.linkedin_found },
  );
  const n = p.skills.length;
  if (n >= SKILLS_MIN) {
    const fr = `${num(n, "fr")}${NBSP}${plural(n, "compétence", "compétences")}`;
    const en = `${num(n, "en")} ${plural(n, "skill", "skills")}`;
    out.push({
      kind: "linkedin_skills",
      source: "linkedin",
      text: { fr: `${fr} déclarées sur LinkedIn.`, en: `${en} declared on LinkedIn.` },
      key: { fr, en },
      proof: p.url,
      score: LINKEDIN_BASE.linkedin_skills + Math.min(20, Math.round((n - SKILLS_MIN) / 2)),
    });
  }
  return out;
}
