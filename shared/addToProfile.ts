// « Ajouter à mon profil LinkedIn » (§18.75) : le lien « Add to Profile » de LinkedIn, sans API ni
// approbation, qui ouvre le formulaire « Licences et certifications » prérempli sur le profil du membre.
// Forme relevée sur addtoprofile.linkedin.com (exemple de LinkedIn : organizationId=1337, issueMonth=2) :
// https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=…&organizationId=…&issueYear=…&issueMonth=…&certUrl=…&certId=…

import type { Lang } from "./types";

/**
 * L'identifiant de la page LinkedIn d'Azerit (linkedin.com/company/azerit-ai), relevé dans le code
 * de la page le 18 novembre 2026, confirmé le même jour sur le vrai formulaire (il préremplit
 * « Azerit » comme organisme). Un seul paramètre, l'id : pas de `organizationName` en secours.
 */
export const AZERIT_LINKEDIN_ORG_ID = "138413959";

/** Le nom de la certification, court : « Dev 5 étoiles », « 5-star dev ». Azerit est l'organisme. */
export function certName(stars: number, lang: Lang): string {
  const n = Math.max(1, Math.min(6, Math.round(stars)));
  return lang === "en" ? `${n}-star dev` : `Dev ${n} étoile${n > 1 ? "s" : ""}`;
}

export interface AddToProfileInput {
  stars: number;
  lang: Lang;
  /** Date de création de la fiche, ISO. */
  createdAt: string;
  /** L'adresse publique de la fiche. */
  certUrl: string;
  /** L'id de la fiche. */
  certId: string;
}

/** L'adresse du formulaire prérempli. Le mois va de 1 à 12, sans zéro, comme dans l'exemple de LinkedIn. */
export function addToProfileUrl(x: AddToProfileInput): string {
  const d = new Date(x.createdAt);
  const at = Number.isNaN(d.getTime()) ? new Date() : d;
  const params: [string, string][] = [
    ["startTask", "CERTIFICATION_NAME"],
    ["name", certName(x.stars, x.lang)],
    ["organizationId", AZERIT_LINKEDIN_ORG_ID],
    ["issueYear", String(at.getUTCFullYear())],
    ["issueMonth", String(at.getUTCMonth() + 1)],
    ["certUrl", x.certUrl],
    ["certId", x.certId],
  ];
  return `https://www.linkedin.com/profile/add?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}
