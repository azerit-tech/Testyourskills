// Le GitHub d'une personne d'après son identité (SPEC §18.80) : après « Continuer
// avec LinkedIn », LinkedIn rend un nom et un email vérifié, jamais un pseudo
// GitHub. Règle reprise de l'application Azerit (`resolve_github`, mesurée à
// environ 90 % de justesse le 29 septembre 2026) :
//
// - par l'email : un commit public signé de cette adresse, que GitHub rattache
//   lui-même à un compte (`search/commits?q=author-email:`), sinon un compte qui
//   l'affiche (`search/users?q=… in:email`). Une preuve : l'adresse est vérifiée
//   des deux côtés ;
// - par le nom : la recherche `"Prénom Nom" in:name`, gardée seulement si UN
//   seul compte de personne (jamais une organisation) porte ce nom complet, et
//   si le nom a deux mots d'au moins deux lettres (une initiale ne désigne
//   personne). Un indice, pas une preuve.
//
// Au moindre doute, ou si GitHub ne répond pas : null.

import { nameWords, samePublicFullName } from "../names";
import { graphql, makeCtx, rest, type Ctx, type GithubAuth } from "./http";

const TIMEOUT_MS = 5000;
const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
/** Une adresse qu'on peut poser telle quelle dans une recherche : ni espace, ni guillemet, ni filtre. */
const EMAIL_RE = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,180}\.[A-Za-z]{2,24}$/;
/** Comptes lus par la recherche par nom. */
const NAME_HITS = 5;

interface Account {
  login?: unknown;
  type?: unknown;
}

const person = (a: Account | null | undefined): string | null =>
  a && typeof a.login === "string" && LOGIN_RE.test(a.login) && (a.type ?? "User") === "User" ? a.login : null;

async function byEmail(ctx: Ctx, email: string): Promise<string | null> {
  if (!EMAIL_RE.test(email)) return null;
  const q = encodeURIComponent(`author-email:${email}`);
  const commits = await rest<{ items?: { author?: Account | null }[] }>(ctx, `/search/commits?q=${q}&sort=author-date&order=desc&per_page=10`);
  const logins = new Set((commits.data?.items ?? []).flatMap((i) => person(i.author)?.toLowerCase() ?? []));
  // Deux comptes pour une adresse : rien de sûr.
  if (logins.size === 1) return person((commits.data?.items ?? []).find((i) => person(i.author))!.author);
  if (logins.size > 1) return null;
  const users = await rest<{ items?: Account[] }>(ctx, `/search/users?q=${encodeURIComponent(`${email} in:email`)}&per_page=2`);
  const found = (users.data?.items ?? []).flatMap((u) => person(u) ?? []);
  return found.length === 1 ? found[0]! : null;
}

const NAME_QUERY = `query($q: String!, $n: Int!) {
  search(query: $q, type: USER, first: $n) {
    nodes { __typename ... on User { login name } }
  }
}`;

async function byName(ctx: Ctx, name: string): Promise<string | null> {
  const clean = name.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
  if (clean.length > 80 || nameWords(clean).filter((w) => /^[a-z]{2,}$/.test(w)).length < 2) return null;
  const q = `"${clean}" in:name`;
  let accounts: { login: string; name: string }[];
  if (!ctx.pool.anonymous) {
    const { data } = await graphql<{ search: { nodes: ({ __typename: string; login?: string; name?: string | null } | null)[] } | null }>(ctx, NAME_QUERY, { q, n: NAME_HITS });
    accounts = (data?.search?.nodes ?? []).flatMap((n) => (n?.__typename === "User" && typeof n.login === "string" && LOGIN_RE.test(n.login) ? [{ login: n.login, name: n.name ?? "" }] : []));
  } else {
    // Sans jeton (dev) : la recherche REST ne rend pas les noms, on lit chaque compte.
    const { data } = await rest<{ items?: Account[] }>(ctx, `/search/users?q=${encodeURIComponent(q)}&per_page=${NAME_HITS}`);
    accounts = [];
    for (const login of (data?.items ?? []).flatMap((u) => person(u) ?? [])) {
      const user = await rest<Account & { name?: unknown }>(ctx, `/users/${login}`);
      if (person(user.data)) accounts.push({ login, name: typeof user.data?.name === "string" ? user.data.name : "" });
    }
  }
  const same = accounts.filter((a) => samePublicFullName(clean, a.name));
  return same.length === 1 ? same[0]!.login : null;
}

/** Jamais l'adresse ni le nom dans les journaux : le type d'erreur seulement. */
async function quiet(what: string, run: () => Promise<string | null>): Promise<string | null> {
  try {
    return await run();
  } catch (err) {
    console.warn(`[github] ${what} indisponible :`, String((err as { code?: unknown; name?: unknown })?.code ?? (err as Error)?.name ?? "erreur"));
    return null;
  }
}

/** Le compte GitHub de cette adresse email, ou null. Une preuve. */
export function githubByEmail(auth: GithubAuth, email: string, signal?: AbortSignal): Promise<string | null> {
  return quiet("recherche par email", () => byEmail(makeCtx(auth, signal, TIMEOUT_MS), email.trim()));
}

/** Le seul compte de personne qui porte ce nom complet, ou null. Un indice. */
export function githubByName(auth: GithubAuth, name: string, signal?: AbortSignal): Promise<string | null> {
  return quiet("recherche par nom", () => byName(makeCtx(auth, signal, TIMEOUT_MS), name));
}

/** Ce que l'entrée par LinkedIn sait du GitHub de la personne, avant même de lire son profil. */
export interface GithubIdentity {
  login: string;
  /** `email` : prouvé par l'adresse ; `name` : le seul compte à ce nom. */
  how: "email" | "name";
}

export interface IdentityInput {
  name: string;
  /** L'adresse rendue par LinkedIn, seulement si LinkedIn la dit vérifiée. */
  email?: string;
}

/** L'email d'abord, le nom ensuite. */
export async function resolveGithubIdentity(auth: GithubAuth, who: IdentityInput, signal?: AbortSignal): Promise<GithubIdentity | null> {
  const sure = who.email ? await githubByEmail(auth, who.email, signal) : null;
  if (sure) return { login: sure, how: "email" };
  const named = await githubByName(auth, who.name, signal);
  return named ? { login: named, how: "name" } : null;
}
