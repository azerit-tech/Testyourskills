// Recherche de comptes GitHub par nom ou par pseudo (SPEC §18.80), pour les
// suggestions du champ « Ton nom ou pseudo ». Avec un jeton : GraphQL, qui rend
// le nom public avec le pseudo en un appel (un point sur 5 000 par heure et par
// jeton). Sans jeton (dev) : la recherche REST, sans les noms.

import type { GithubSuggestion } from "../../../shared/entry";
import { graphql, makeCtx, rest, type GithubAuth } from "./http";

export const SEARCH_USERS_LIMIT = 6;
const SEARCH_TIMEOUT_MS = 4000;

const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/**
 * Ce qu'on cherche : les mots tapés, sans rien qui se lise comme un filtre de la
 * recherche GitHub (« : », guillemets) ni comme une adresse. null : rien à chercher.
 */
export function userQuery(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw
    .normalize("NFC")
    .replace(/^@/, "")
    .replace(/[^\p{L}\p{N} ._'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length < 3 || s.length > 60) return null;
  return s;
}

const QUERY = `query($q: String!, $n: Int!) {
  search(query: $q, type: USER, first: $n) {
    nodes { __typename ... on User { login name avatarUrl(size: 96) } }
  }
}`;

interface SearchData {
  search: { nodes: ({ __typename: string; login?: string; name?: string | null; avatarUrl?: string } | null)[] } | null;
}

/**
 * Les comptes de personnes (jamais d'organisation) dont le pseudo ou le nom
 * public porte ces mots, dans l'ordre de GitHub. Limite de débit : EngineError
 * `rate_limited`, que la route change en liste vide.
 */
export async function searchGithubUsers(auth: GithubAuth, query: string, signal?: AbortSignal): Promise<GithubSuggestion[]> {
  const ctx = makeCtx(auth, signal, SEARCH_TIMEOUT_MS);
  const q = `${query} in:login in:name type:user`;
  if (!ctx.pool.anonymous) {
    const { data } = await graphql<SearchData>(ctx, QUERY, { q, n: SEARCH_USERS_LIMIT });
    return (data?.search?.nodes ?? []).flatMap((n) =>
      n && n.__typename === "User" && typeof n.login === "string" && LOGIN_RE.test(n.login)
        ? [{ login: n.login, name: n.name?.trim() ? n.name.trim().slice(0, 80) : null, avatarUrl: n.avatarUrl ?? `https://github.com/${n.login}.png?size=96` }]
        : [],
    );
  }
  const { data } = await rest<{ items?: { login?: unknown; avatar_url?: unknown; type?: unknown }[] }>(ctx, `/search/users?q=${encodeURIComponent(q)}&per_page=${SEARCH_USERS_LIMIT}`);
  return (data?.items ?? []).flatMap((u) =>
    typeof u.login === "string" && LOGIN_RE.test(u.login) && (u.type ?? "User") === "User"
      ? [{ login: u.login, name: null, avatarUrl: typeof u.avatar_url === "string" ? u.avatar_url : `https://github.com/${u.login}.png?size=96` }]
      : [],
  );
}
