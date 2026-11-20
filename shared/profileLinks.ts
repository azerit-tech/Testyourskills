// Les liens vers les profils publics d'une personne fichée (SPEC §18.108) : le logo
// LinkedIn vers son linkedin.com/in/…, le logo GitHub vers github.com/<pseudo>.
// Pur, même règle au serveur (GET /api/card/:id, les classements) et en démo.
//
// - GitHub : le pseudo que la fiche montre déjà (« @pseudo » en tête de page).
// - LinkedIn : l'adresse lue pour la fiche, seulement si la personne a fait sa fiche
//   ou l'a revendiquée ; une fiche née d'une dénonciation et pas encore revendiquée
//   ne la montre que si son GitHub l'affiche déjà lui-même (comptes sociaux, site, bio).
// - Jamais un email, jamais une autre adresse que ces deux formes, refaites ici :
//   une adresse qui ne se normalise pas ne fait pas de lien.
// - Une fiche ou un pseudo masqué n'arrive pas jusqu'ici (410, hors des classements).

import { normalizeLinkedinUrl, parseGithubLogin } from "./entry";

/** Les deux liens, absents quand la fiche n'a pas la source ou que la règle la retient. */
export interface ProfileLinks {
  github?: string;
  linkedin?: string;
}

/** github.com/<pseudo> pour un pseudo valide, sinon null. */
export function githubHref(login: string | null | undefined): string | null {
  const l = login ? parseGithubLogin(login) : null;
  return l ? `https://github.com/${l}` : null;
}

/** L'adresse publique d'un profil LinkedIn (https://www.linkedin.com/in/<slug>), sinon null. */
export function linkedinHref(url: string | null | undefined): string | null {
  return url ? normalizeLinkedinUrl(url) : null;
}

export interface LinkRule {
  /** Fiche née d'une dénonciation, pas encore revendiquée : la personne n'a rien demandé. */
  anonymous: boolean;
  /** Le GitHub de la fiche affiche lui-même ce LinkedIn : il est déjà public, relié à ce pseudo. */
  linkedinOnGithub?: boolean;
}

/** Les liens d'une fiche, selon la règle. */
export function profileLinks(p: { login?: string | null; linkedinUrl?: string | null }, rule: LinkRule): ProfileLinks {
  const github = githubHref(p.login);
  const li = linkedinHref(p.linkedinUrl);
  const linkedin = li && (!rule.anonymous || rule.linkedinOnGithub) ? li : null;
  return { ...(linkedin ? { linkedin } : {}), ...(github ? { github } : {}) };
}

/** Les liens d'une ligne de classement : le serveur n'y met l'adresse LinkedIn que si la règle la permet. */
export function personLinks(p: { cardId?: string; login?: string; linkedinUrl?: string }): ProfileLinks {
  if (!p.cardId) return {};
  return profileLinks(p, { anonymous: false });
}

/** Aucun lien. */
export const hasLinks = (l: ProfileLinks | null | undefined): l is ProfileLinks => !!l && !!(l.github || l.linkedin);
