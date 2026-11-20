// Le GitHub d'une fiche LinkedIn seule (SPEC §18.100) : cherché pendant la lecture
// du profil, proposé à la personne d'un toucher (« C'est ton GitHub ? »), jamais
// attaché sans elle.
//
// Un seul appel GraphQL (un point sur 5 000 par heure et par jeton) : la recherche
// `"Prénom Nom" in:name`, et les pseudos faits du nom (jacquesmougeot,
// jacques-mougeot, jmougeot…) lus directement. Deux secondes au plus.
//
// La note d'un compte :
// - ce LinkedIn sur son profil GitHub (comptes sociaux, site, bio) : sûr ;
// - le nom complet sur GitHub : 60 ; le prénom seul (ou « Prénom N. ») : 25 ; un
//   autre nom complet : écarté ;
// - un pseudo fait du nom complet : 45 ; de l'initiale et du nom : 35 ;
// - un employeur du profil LinkedIn dans son entreprise, son site ou sa bio : 20.
// Proposé à partir de 60, seul : deux comptes à moins de 15 points l'un de
// l'autre, aucun. Un nom courant (six comptes ou plus à ce nom complet sur
// GitHub) : il faut aussi l'employeur. Le nom seul n'est jamais sûr.

import { normalizeLinkedinUrl } from "../../../shared/entry";
import type { Proposal } from "../../../shared/types";
import { graphql, makeCtx, type GithubAuth } from "../github/http";
import { linkedinFromGithub } from "../linkedinProfile/url";
import { nameWords, samePublicFullName } from "../names";

/** Ce que la recherche s'accorde, de son départ à sa réponse. */
export const FIND_BUDGET_MS = 2000;
export const PROBABLE = 60;
/** Deux comptes plus proches que ça : rien de sûr, aucun n'est proposé. */
export const MARGIN = 15;
const SURE = 100;
const FULL_NAME = 60;
const FIRST_NAME = 25;
const LOGIN_FULL = 45;
const LOGIN_INITIAL = 35;
const EMPLOYER = 20;
/** Comptes au même nom complet sur GitHub à partir desquels un nom est courant (« Thomas Martin » : 95 ; « Sindre Sorhus » : 4, lui et ses copies). */
export const COMMON_NAME = 6;
/** Pseudos lus directement, au plus. */
const LOGINS_MAX = 7;
const NAME_HITS = 10;

const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/** Ce que la fiche LinkedIn sait de la personne. */
export interface PersonHints {
  name: string;
  /** Adresse normalisée du profil. */
  url: string;
  /** Les employeurs de ses postes. */
  companies: string[];
}

/** Un compte GitHub tel que l'appel le rend. */
export interface GithubAccount {
  login: string;
  name: string | null;
  avatarUrl: string;
  bio: string | null;
  company: string | null;
  websiteUrl: string | null;
  socialAccounts: { provider: string; url: string }[];
}

export type GithubProposal = Extract<Proposal, { kind: "github" }>;

/** Les pseudos qu'une personne se fait de son nom : complets d'abord, puis à l'initiale. */
export function loginsFromName(name: string): { full: string[]; initial: string[] } {
  const words = nameWords(name).filter((w) => /^[a-z]/.test(w));
  if (words.length < 2 || words.filter((w) => w.length >= 2).length < 2) return { full: [], initial: [] };
  const first = words[0]!;
  const last = words[words.length - 1]!;
  const rest = words.slice(1).join("");
  const ok = (l: string) => LOGIN_RE.test(l);
  const uniq = (l: string[]) => [...new Set(l.filter(ok))];
  const full = uniq([`${first}${last}`, `${first}-${last}`, `${last}${first}`, `${last}-${first}`, `${first}${rest}`, `${first}-${words.slice(1).join("-")}`]);
  const initial = uniq([`${first[0]}${last}`, `${last}${first[0]}`, `${first[0]}-${last}`]).filter((l) => !full.includes(l));
  return { full, initial };
}

/** Les mots qui disent un employeur : trois lettres au moins, sans les formes juridiques ni les mots vides. */
const COMPANY_NOISE = new Set(["sas", "sarl", "inc", "ltd", "llc", "gmbh", "group", "groupe", "the", "and", "les", "des", "company", "freelance", "independent", "independant", "self", "employed", "stealth", "startup", "consulting", "france", "paris", "labs", "lab", "tech", "technologies", "solutions", "services"]);
function companyKeys(companies: string[]): string[] {
  const keys = new Set<string>();
  for (const c of companies) {
    const words = nameWords(c).filter((w) => w.length >= 3 && !COMPANY_NOISE.has(w));
    if (!words.length) continue;
    keys.add(words.join(""));
    for (const w of words) if (w.length >= 4) keys.add(w);
  }
  return [...keys];
}

/** Le nom sans ce qui le suit sur LinkedIn : « Jacques Mougeot, PhD (il/lui) | Azerit » → « Jacques Mougeot ». */
export function bareName(name: string): string {
  return name.split(/[,(|]/)[0]!.trim();
}

/** Le compte nomme-t-il un de ces employeurs ? Son entreprise ou son domaine en entier, sa bio mot pour mot. */
function namesEmployer(a: GithubAccount, keys: string[]): boolean {
  const host = (() => {
    try {
      const raw = a.websiteUrl?.trim();
      if (!raw) return "";
      return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  const joined = [nameWords(a.company).join(""), ...host.split(".").slice(0, -1)].filter(Boolean);
  const words = new Set([...nameWords(a.company), ...nameWords(a.bio)]);
  return keys.some((k) => words.has(k) || joined.some((j) => j === k || (k.length >= 5 && j.includes(k))));
}

export interface Scored {
  account: GithubAccount;
  score: number;
  sure: boolean;
  /** Un employeur du profil LinkedIn est sur son GitHub. */
  employer: boolean;
}

/** La note d'un compte pour cette personne ; 0 : écarté. */
export function scoreGithub(person: PersonHints, a: GithubAccount): Scored {
  const out = (score: number, sure = false, employer = false): Scored => ({ account: a, score, sure, employer });
  // Ce LinkedIn sur son profil GitHub : c'est elle.
  const shown = linkedinFromGithub({ login: a.login, blog: a.websiteUrl, bio: a.bio, socialAccounts: a.socialAccounts });
  const url = normalizeLinkedinUrl(person.url);
  if (shown && url && shown === url) return out(SURE, true);
  // Un autre LinkedIn sur son profil : quelqu'un d'autre.
  if (shown && url && shown !== url) return out(0);

  const name = bareName(person.name);
  const words = nameWords(name);
  const first = words[0] ?? "";
  const last = words[words.length - 1] ?? "";
  let score = 0;
  const theirs = nameWords(a.name);
  if (theirs.length) {
    if (samePublicFullName(name, a.name)) score += FULL_NAME;
    else {
      // « Jacques », « Jacques M. » : son prénom, et rien qui dise un autre nom.
      const fits = theirs.every((w) => words.includes(w) || (w.length === 1 && words.some((x) => x.startsWith(w))));
      if (!fits || !(theirs.includes(first) || theirs.includes(last))) return out(0);
      score += FIRST_NAME;
    }
  }
  const { full, initial } = loginsFromName(name);
  const login = a.login.toLowerCase();
  if (full.includes(login)) score += LOGIN_FULL;
  else if (initial.includes(login)) score += LOGIN_INITIAL;
  const employer = namesEmployer(a, companyKeys(person.companies));
  return out(score + (employer ? EMPLOYER : 0), false, employer);
}

/**
 * Le seul compte assez proche de cette personne, ou null. `namesakes` : les comptes que GitHub dit
 * porter ce nom complet ; à partir de COMMON_NAME (un nom courant), le nom et le pseudo ne suffisent
 * plus, il faut aussi l'employeur.
 */
export function pickGithub(person: PersonHints, accounts: GithubAccount[], namesakes = 0): GithubProposal | null {
  const seen = new Set<string>();
  const ranked = accounts
    .filter((a) => LOGIN_RE.test(a.login) && !seen.has(a.login.toLowerCase()) && !!seen.add(a.login.toLowerCase()))
    .map((a) => scoreGithub(person, a))
    .filter((s) => s.score >= PROBABLE && (s.sure || s.employer || namesakes < COMMON_NAME))
    .sort((x, y) => y.score - x.score);
  const best = ranked[0];
  if (!best) return null;
  const sure = ranked.filter((s) => s.sure);
  // Deux comptes affichent ce LinkedIn : on ne choisit pas.
  if (sure.length > 1) return null;
  if (!best.sure && ranked[1] && best.score - ranked[1].score < MARGIN) return null;
  const a = best.account;
  return { kind: "github", login: a.login, name: a.name?.trim() ? a.name.trim().slice(0, 80) : null, avatarUrl: a.avatarUrl || `https://github.com/${a.login}.png?size=96`, sure: best.sure };
}

const FIELDS = `login name avatarUrl(size: 96) bio company websiteUrl socialAccounts(first: 10) { nodes { provider url } }`;

interface RawUser {
  __typename?: string;
  login?: unknown;
  name?: unknown;
  avatarUrl?: unknown;
  bio?: unknown;
  company?: unknown;
  websiteUrl?: unknown;
  socialAccounts?: { nodes?: ({ provider?: unknown; url?: unknown } | null)[] } | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
function account(u: RawUser | null | undefined): GithubAccount | null {
  if (!u || (u.__typename && u.__typename !== "User") || typeof u.login !== "string" || !LOGIN_RE.test(u.login)) return null;
  return {
    login: u.login,
    name: str(u.name),
    avatarUrl: str(u.avatarUrl) ?? `https://github.com/${u.login}.png?size=96`,
    bio: str(u.bio),
    company: str(u.company),
    websiteUrl: str(u.websiteUrl),
    socialAccounts: (u.socialAccounts?.nodes ?? []).flatMap((n) => (typeof n?.provider === "string" && typeof n?.url === "string" ? [{ provider: n.provider, url: n.url }] : [])),
  };
}

/** La requête : la recherche par nom, et chaque pseudo fait du nom, en un appel. */
export function buildQuery(name: string): { query: string; variables: Record<string, string>; logins: string[] } | null {
  const clean = bareName(name).replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
  const { full, initial } = loginsFromName(clean);
  if (clean.length > 80 || !full.length) return null;
  const logins = [...full, ...initial].slice(0, LOGINS_MAX);
  const vars = logins.map((_, i) => `$l${i}: String!`).join(", ");
  const users = logins.map((_, i) => `l${i}: user(login: $l${i}) { ${FIELDS} }`).join("\n  ");
  const query = `query($q: String!, ${vars}) {
  named: search(query: $q, type: USER, first: ${NAME_HITS}) { userCount nodes { __typename ... on User { ${FIELDS} } } }
  ${users}
}`;
  const variables: Record<string, string> = { q: `"${clean}" in:name type:user` };
  logins.forEach((l, i) => (variables[`l${i}`] = l));
  return { query, variables, logins };
}

export interface FindOptions {
  signal?: AbortSignal;
  budgetMs?: number;
}

/** Ce que l'appel rend avant toute note : les comptes vus, et combien GitHub en dit au nom complet. */
export interface GithubFound {
  accounts: GithubAccount[];
  namesakes: number;
}

/**
 * Les comptes GitHub qui pourraient être ceux de ce nom, sans encore les noter : il ne
 * faut que le nom. La connexion LinkedIn (§18.111) les cherche dès le retour de LinkedIn,
 * avant même de savoir quel profil est le sien, puis les note avec `pickGithub`. null :
 * pas de jeton, GitHub lent ou en panne, nom inutilisable. Jamais d'erreur.
 */
export async function fetchGithubAccounts(auth: GithubAuth, name: string, o: FindOptions = {}): Promise<GithubFound | null> {
  const built = buildQuery(name);
  if (!built) return null;
  const budget = o.budgetMs ?? FIND_BUDGET_MS;
  const signal = o.signal ? AbortSignal.any([o.signal, AbortSignal.timeout(budget)]) : AbortSignal.timeout(budget);
  const ctx = makeCtx(auth, signal, budget);
  if (ctx.pool.anonymous) return null;
  try {
    const { data } = await graphql<Record<string, unknown>>(ctx, built.query, built.variables, { timeoutMs: budget });
    if (!data) return null;
    const search = data.named as { userCount?: unknown; nodes?: (RawUser | null)[] } | null;
    const named = (search?.nodes ?? []).flatMap((u) => account(u) ?? []);
    const namesakes = typeof search?.userCount === "number" ? search.userCount : named.length;
    const direct = built.logins.flatMap((_, i) => account(data[`l${i}`] as RawUser | null) ?? []);
    return { accounts: [...direct, ...named], namesakes };
  } catch (err) {
    // Le délai passé, ou la fiche coupée : rien à dire.
    if (!signal.aborted) console.warn("[proposition] GitHub non cherché :", String((err as { code?: unknown; name?: unknown })?.code ?? (err as Error)?.name ?? "erreur"));
    return null;
  }
}

/**
 * Le GitHub à proposer pour cette personne, ou null : rien d'assez proche,
 * plusieurs comptes possibles, pas de jeton, GitHub lent ou en panne. Jamais d'erreur.
 */
export async function findGithubFor(auth: GithubAuth, person: PersonHints, o: FindOptions = {}): Promise<GithubProposal | null> {
  const found = await fetchGithubAccounts(auth, person.name, o);
  return found ? pickGithub(person, found.accounts, found.namesakes) : null;
}
