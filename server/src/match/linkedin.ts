// Le LinkedIn d'une fiche GitHub seule (SPEC §18.100) : proposé à la personne
// d'un toucher (« C'est ton LinkedIn ? »), jamais lu sans elle.
//
// Ne cherche que quand ce qui existe déjà n'a rien donné (le registre de l'App,
// les comptes sociaux, le site, la bio, le README : linkedinProfile/index.ts), et
// seulement avec un nom complet sur GitHub. Les recherches qui existent, dans cet
// ordre : les profils de l'App à ce nom (§18.96, quelques millisecondes), puis
// l'index web (§18.90, Brave puis Serper, cache d'un jour, plafonds du jour et de
// l'IP). Aucune lecture de profil : ni Apify, ni photo payée.
//
// Proposé : le seul profil au même nom complet ; plusieurs, celui dont le titre
// nomme l'entreprise du GitHub, ou le seul que l'index dit sûr (nom et employeur).
// Sinon rien.

import type { Proposal } from "../../../shared/types";
import { mergeCandidates, type LinkedinCandidate, type SearchResult } from "../linkedinProfile/search";
import { confidenceFor } from "../linkedinProfile/webSearch";
import { githubFitsName, nameWords, parsePersonName, samePublicFullName } from "../names";
import type { Namesake } from "../registry/index";
import { FIND_BUDGET_MS } from "./github";

export type LinkedinProposal = Extract<Proposal, { kind: "linkedin" }>;

/** Ce que la fiche GitHub sait de la personne. */
export interface GithubHints {
  login: string;
  name: string | null;
  company: string | null;
}

export interface LinkedinFindDeps {
  /** Les profils de l'App à ce nom complet (§18.96) ; absent : aucun. */
  namesakes?: (name: string) => Promise<Namesake[]>;
  /** L'index web (§18.90) ; absent : rien sur le web. */
  byName?: (name: string, opts: { strict: true; company: string | null; spend?: () => boolean; signal?: AbortSignal }) => Promise<SearchResult>;
}

/** L'entreprise du GitHub, en mots : « @azerit-tech » → « azerit tech ». */
function companyWords(company: string | null): string[] {
  return nameWords((company ?? "").replace(/^@/, "")).filter((w) => w.length >= 3);
}

/** Le seul profil à proposer parmi ces candidats, ou null. */
export function pickLinkedin(gh: GithubHints, list: LinkedinCandidate[]): LinkedinProposal | null {
  if (!gh.name) return null;
  const seen = new Set<string>();
  const same = list.filter((c) => samePublicFullName(gh.name, c.name) && !seen.has(c.url.toLowerCase()) && !!seen.add(c.url.toLowerCase()));
  let pick: LinkedinCandidate | null = same.length === 1 ? same[0]! : null;
  if (!pick && same.length > 1) {
    const words = companyWords(gh.company);
    const atWork = words.length ? same.filter((c) => words.some((w) => nameWords(c.headline).includes(w))) : [];
    const strong = same.filter((c) => c.score !== undefined && confidenceFor(c.score) === "high");
    pick = atWork.length === 1 ? atWork[0]! : strong.length === 1 ? strong[0]! : null;
  }
  if (!pick) return null;
  return { kind: "linkedin", url: pick.url, name: pick.name.slice(0, 80), headline: (pick.headline ?? "").slice(0, 120), ...(pick.photoUrl ? { photoUrl: pick.photoUrl } : {}), sure: false };
}

/**
 * Le LinkedIn trouvé est-il assez sûr pour qu'une dénonciation par GitHub l'attache d'office
 * (§18.121) ? Son nom complet est celui du GitHub, ce GitHub va avec ce nom (`githubFitsName`),
 * et son titre nomme l'entreprise du GitHub. Le nom seul ne suffit jamais.
 */
export function strongLinkedin(gh: GithubHints, p: LinkedinProposal): boolean {
  const words = companyWords(gh.company);
  if (!gh.name || !words.length || !samePublicFullName(gh.name, p.name) || !githubFitsName(p.name, gh.login, gh.name)) return false;
  const headline = nameWords(p.headline);
  return words.some((w) => headline.includes(w));
}

const namesakeCandidate =(n: Namesake): LinkedinCandidate | null => (n.name ? { url: n.url, name: n.name, headline: n.headline } : null);

export interface LinkedinFindOptions {
  spend?: () => boolean;
  signal?: AbortSignal;
  budgetMs?: number;
}

/** Le LinkedIn à proposer pour ce GitHub, ou null. Jamais d'erreur ; deux secondes au plus. */
export async function findLinkedinFor(deps: LinkedinFindDeps, gh: GithubHints, o: LinkedinFindOptions = {}): Promise<LinkedinProposal | null> {
  const name = parsePersonName(gh.name ?? "");
  if (!name) return null;
  const budget = o.budgetMs ?? FIND_BUDGET_MS;
  const signal = o.signal ? AbortSignal.any([o.signal, AbortSignal.timeout(budget)]) : AbortSignal.timeout(budget);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((res) => {
    timer = setTimeout(() => res(null), budget);
    timer.unref?.();
  });
  const run = async (): Promise<LinkedinProposal | null> => {
    const app = deps.namesakes ? (await deps.namesakes(name.full).catch(() => [])).flatMap((n) => namesakeCandidate(n) ?? []) : [];
    const fromApp = pickLinkedin(gh, app);
    if (fromApp) return fromApp;
    if (!deps.byName || signal.aborted) return null;
    const web = await deps.byName(name.full, { strict: true, company: companyWords(gh.company).join(" ") || null, spend: o.spend, signal }).catch(() => ({ status: "off" }) as const);
    return pickLinkedin(gh, mergeCandidates(app, web.status === "ok" ? web.results : []));
  };
  try {
    return await Promise.race([run().catch(() => null), late]);
  } finally {
    clearTimeout(timer);
  }
}
