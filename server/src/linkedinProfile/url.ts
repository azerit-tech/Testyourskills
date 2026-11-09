// Adresses de profil LinkedIn (SPEC §18.24) : une seule forme acceptée,
// https://www.linkedin.com/in/<slug> (shared/entry.ts), et la recherche gratuite
// dans ce que le profil GitHub déclare (comptes sociaux, site, bio).

import { normalizeLinkedinUrl } from "../../../shared/entry";

export { normalizeLinkedinUrl };

/** Ce que le profil GitHub déclare, tel que la collecte le garde. */
export interface GithubDeclared {
  login: string;
  name?: string | null;
  createdAt?: string | null;
  blog?: string | null;
  bio?: string | null;
  /** GET /users/{login}/social_accounts : { provider, url }. */
  socialAccounts?: { provider: string; url: string }[] | null;
}

const IN_TEXT_RE = /(?:https?:\/\/)?(?:[a-z]{2,3}\.|www\.)?linkedin\.com\/in\/[^\s"'<>)\],;]+/gi;

/**
 * Le LinkedIn que la personne affiche elle-même sur GitHub, gratuit : d'abord
 * ses comptes sociaux (provider `linkedin`), puis le champ site, puis la bio.
 * Le premier trouvé gagne.
 */
export function linkedinFromGithub(gh: GithubDeclared): string | null {
  for (const a of gh.socialAccounts ?? []) {
    if (a?.provider?.toLowerCase() !== "linkedin") continue;
    const url = normalizeLinkedinUrl(a.url);
    if (url) return url;
  }
  for (const a of gh.socialAccounts ?? []) {
    const url = normalizeLinkedinUrl(a?.url);
    if (url) return url;
  }
  const blog = normalizeLinkedinUrl(gh.blog ?? "");
  if (blog) return blog;
  for (const m of (gh.bio ?? "").matchAll(IN_TEXT_RE)) {
    const url = normalizeLinkedinUrl(m[0]);
    if (url) return url;
  }
  return null;
}

/** Faits GitHub (opaques pour le pipeline) → ce qui sert à retrouver le LinkedIn. */
export function githubDeclaredOf(facts: unknown): GithubDeclared | null {
  const f = facts as { login?: unknown; profile?: Record<string, unknown> } | null;
  const p = f?.profile;
  const login = typeof f?.login === "string" ? f.login : typeof p?.login === "string" ? p.login : null;
  if (!login) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const accounts = Array.isArray(p?.socialAccounts)
    ? (p.socialAccounts as unknown[]).flatMap((a) => {
        const o = a as { provider?: unknown; url?: unknown } | null;
        return typeof o?.provider === "string" && typeof o?.url === "string" ? [{ provider: o.provider, url: o.url }] : [];
      })
    : null;
  return {
    login,
    name: str(p?.name),
    createdAt: str(p?.createdAt),
    blog: str(p?.blog),
    bio: str(p?.bio),
    socialAccounts: accounts,
  };
}

/** Ce GitHub affiche-t-il lui-même cette adresse LinkedIn (déjà normalisée) ? C'est ce qui prouve le lien entre les deux. */
export function githubShowsLinkedin(facts: unknown, url: string): boolean {
  const gh = githubDeclaredOf(facts);
  return !!gh && linkedinFromGithub(gh) === url;
}

/** Le profil GitHub de `login`, pour vérifier une correspondance Crustdata. */
export function sameGithub(url: unknown, login: string): boolean {
  if (typeof url !== "string") return false;
  const m = /github\.com\/([A-Za-z0-9-]+)\/?$/i.exec(url.trim());
  return !!m && m[1]!.toLowerCase() === login.toLowerCase();
}
