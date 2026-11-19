// Ce qu'une personne dit de son LinkedIn côté GitHub (SPEC §18.89), porté de la
// découverte de l'App Azerit (linkedin_discover.py), avec son échelle :
//   compte social du profil 0,99 · champ « site » 0,98 · README de profil 0,975 ·
//   site personnel 0,97.
// Les deux premiers se lisent dans les faits déjà collectés (url.ts). Ici, le
// troisième : le README du dépôt `login/login`, la page que la personne écrit sur
// elle-même, où vit souvent un badge LinkedIn. Un appel à l'API GitHub, gratuit.
// Le site personnel n'est pas lu : ce serveur n'ouvre aucune adresse donnée par un tiers.

import { linkedinSlug } from "../../../shared/entry";
import type { GithubDeclared } from "./url";
import { linkedinUrlsInText } from "./webSearch";

/** L'échelle de confiance de l'App pour un lien que la personne déclare elle-même. */
export const SIGNAL_SCORE = { githubSocial: 0.99, githubWebsite: 0.98, profileReadme: 0.975, personalSite: 0.97 } as const;

export const README_TIMEOUT_MS = 3000;
const README_MAX_CHARS = 512_000;
const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const UA = "testyourskills (azerit.tech)";

/** Les adresses d'exemple des modèles de README (« linkedin.com/in/your-username »). */
const PLACEHOLDER_RE = /^(?:your|my|the)?[-_]?(?:user[-_]?name|name|linkedin|profile|handle|id|url|link)(?:[-_]?here)?$|^(?:x{3,}|example|username|yourusername|yourname)$/i;

/**
 * Le LinkedIn d'un README de profil : son seul lien `/in/`. Plusieurs liens (une
 * équipe, des remerciements) ne désignent personne : aucun n'est retenu, comme dans l'App.
 */
export function linkedinFromReadme(text: unknown): string | null {
  const urls = linkedinUrlsInText(text).filter((u) => !PLACEHOLDER_RE.test(linkedinSlug(u) ?? ""));
  return urls.length === 1 ? urls[0]! : null;
}

export interface ReadmeSignalOptions {
  /** Jeton GitHub (sans lui, 60 lectures par heure pour tout le serveur). */
  token?: () => string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Signal gratuit : l'adresse trouvée, null si le README n'en dit rien ; lève si GitHub n'a pas répondu. */
export type GithubSignal = (gh: GithubDeclared, signal?: AbortSignal) => Promise<string | null>;

export function readmeSignal(o: ReadmeSignalOptions = {}): GithubSignal {
  return async (gh, signal) => {
    if (!LOGIN_RE.test(gh.login)) return null;
    const token = o.token?.();
    const limit = AbortSignal.timeout(o.timeoutMs ?? README_TIMEOUT_MS);
    const res = await (o.fetchImpl ?? fetch)(`https://api.github.com/repos/${gh.login}/${gh.login}/readme`, {
      headers: { accept: "application/vnd.github.raw", "user-agent": UA, ...(token ? { authorization: `bearer ${token}` } : {}) },
      signal: signal ? AbortSignal.any([signal, limit]) : limit,
    });
    // Pas de dépôt `login/login`, ou pas de README : le cas courant.
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`README de profil : HTTP ${res.status}`);
    return linkedinFromReadme((await res.text()).slice(0, README_MAX_CHARS));
  };
}
