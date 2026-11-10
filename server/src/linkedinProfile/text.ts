// Profil LinkedIn → texte déclaratif, lu par le chemin CV (SPEC §18.24) : même
// lecture IA, même barème. Le texte est construit comme un CV propre (titre,
// résumé, postes datés avec leur description, formation, compétences) ; il
// n'existe qu'en mémoire, le temps de la lecture, comme le texte d'un PDF.

export { asLinkedinCard, asLinkedinComparison, linkedinFact } from "../../../shared/linkedinText";
import type { ContractType, LinkedinProfile } from "./profile";

const CONTRACT_LABEL: Record<ContractType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  internship: "Internship",
  work_study: "Apprenticeship (work-study)",
  freelance: "Freelance",
};

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
      const kind = r.contract ? ` · ${CONTRACT_LABEL[r.contract]}` : "";
      out.push(`${head}${kind}${range(r.start, r.end, r.end === null)}`);
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
  if (p.honors?.length) {
    out.push("", "Honors and awards");
    for (const h of p.honors) {
      out.push(`${h.title}${h.issuer ? ` — ${h.issuer}` : ""}${h.date ? ` (${h.date})` : ""}`);
      if (h.description) out.push(h.description);
    }
  }
  return out.join("\n").trim();
}
