// Ce que vaut chaque signal du jeu, dans l'échelle de l'App (SPEC §18.95) :
// 2 quand la personne le déclare elle-même ou que son identité est vérifiée,
// 1 quand une recherche ou un nom seul l'a trouvé. Le nom du signal devient
// l'étape (`step`) du lien écrit.

import { normalizeLinkedinUrl } from "../../../shared/entry";
import type { GithubDeclared } from "../linkedinProfile/url";
import { DECLARED, SEARCHED } from "./rules";

export interface LinkSignal {
  strength: number;
  step: string;
}

/** Le LinkedIn que le profil GitHub affiche : par quel champ (comptes sociaux, site, bio). */
export function githubDeclaredSignal(gh: GithubDeclared, url: string): LinkSignal {
  if ((gh.socialAccounts ?? []).some((a) => normalizeLinkedinUrl(a?.url) === url)) return { strength: DECLARED, step: "github_social" };
  if (normalizeLinkedinUrl(gh.blog ?? "") === url) return { strength: DECLARED, step: "github_website" };
  return { strength: DECLARED, step: "github_bio" };
}

export const README_SIGNAL: LinkSignal = { strength: DECLARED, step: "profile_readme" };
/** La recherche payante (Crustdata) : trouvé, jamais déclaré. */
export const SEARCH_SIGNAL: LinkSignal = { strength: SEARCHED, step: "crustdata_search" };
/** Le GitHub que le profil LinkedIn donne dans ses liens (`cv_fetch_declared` de l'App). */
export const LINKEDIN_PROFILE_SIGNAL: LinkSignal = { strength: DECLARED, step: "linkedin_profile" };
/** « C'est moi » : la personne prouve son GitHub par OAuth sur une fiche qui porte ce LinkedIn. */
export const CLAIM_SIGNAL: LinkSignal = { strength: DECLARED, step: "cest_moi" };

/**
 * « Oui » à la proposition sous sa fiche (§18.100) : déclaré si la proposition était sûre (son GitHub
 * affiche ce LinkedIn), trouvé sinon. Le « oui » vient de qui tient la fiche, qui peut l'avoir faite
 * pour un autre en collant son lien : il ne vaut pas seul une déclaration.
 */
export function proposalSignal(sure: boolean): LinkSignal {
  return sure ? { strength: DECLARED, step: "proposition_oui:affiche" } : { strength: SEARCHED, step: "proposition_oui" };
}

/**
 * « Se connecter avec LinkedIn » (§18.80, §18.90) : le profil de la personne
 * (`profile` : sûr par l'email ou la photo, choisi par elle dans « C'est toi ? »,
 * ou seul au nom et à l'employeur) et son GitHub (`github` : un commit signé de
 * son email vérifié, ou le seul compte à son nom). Déclaré seulement si les deux
 * le sont : une identité vérifiée, un profil qu'elle désigne.
 */
export function signInSignal(profile: "email" | "photo" | "picked" | "employer", github: "email" | "name"): LinkSignal {
  const strong = github === "email" && profile !== "employer";
  return { strength: strong ? DECLARED : SEARCHED, step: `linkedin_signin:${profile}+github_${github}` };
}
