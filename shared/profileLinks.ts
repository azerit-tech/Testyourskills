// Les liens vers les profils publics d'une personne fichée (SPEC §18.108) : le logo
// LinkedIn vers son linkedin.com/in/…, le logo GitHub vers github.com/<pseudo>.
// Pur, même règle au serveur (GET /api/card/:id, les classements) et en démo.
//
// - GitHub : le pseudo que la fiche montre déjà (« @pseudo » en tête de page).
// - LinkedIn : l'adresse lue pour la fiche (la fiche LinkedIn seule, le dossier), faite,
//   revendiquée ou dénoncée : ce ne sont que des données publiques (20 nov. 2026, Jacques).
// - Jamais un email, jamais une autre adresse que ces deux formes, refaites ici :
//   une adresse qui ne se normalise pas ne fait pas de lien.
// - Une fiche ou un pseudo masqué n'arrive pas jusqu'ici (410, hors des classements).

import { normalizeLinkedinUrl, parseGithubLogin } from "./entry";

/** Les deux liens, absents quand la fiche n'a pas la source. */
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

/** Les liens d'une fiche : son LinkedIn et son GitHub, ceux de ses propres pièces. */
export function profileLinks(p: { login?: string | null; linkedinUrl?: string | null }): ProfileLinks {
  const github = githubHref(p.login);
  const linkedin = linkedinHref(p.linkedinUrl);
  return { ...(linkedin ? { linkedin } : {}), ...(github ? { github } : {}) };
}

/** Les liens d'une ligne de classement. */
export function personLinks(p: { cardId?: string; login?: string; linkedinUrl?: string }): ProfileLinks {
  if (!p.cardId) return {};
  return profileLinks(p);
}

/** Aucun lien. */
export const hasLinks = (l: ProfileLinks | null | undefined): l is ProfileLinks => !!l && !!(l.github || l.linkedin);
