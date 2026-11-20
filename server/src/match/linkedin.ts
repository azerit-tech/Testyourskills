// Le LinkedIn d'un GitHub (SPEC §18.100, §18.113, §18.121, §18.125) : trouvé par le nom,
// jugé sur ce que l'index en dit, attaché d'office quand le lien est fort, proposé d'un
// toucher quand il est moyen, rien sinon.
//
// Ne cherche que quand ce qui existe déjà n'a rien donné (le registre de l'App, les comptes
// sociaux, le site, la bio, le README : linkedinProfile/index.ts), et seulement avec un nom
// complet sur GitHub. Dans cet ordre : les profils de l'App à ce nom (§18.96, quelques
// millisecondes), puis l'index web (§18.90), **une requête** : `site:linkedin.com/in "Nom"`.
// Mesuré le 20 novembre : le nom suivi d'une école de plusieurs mots (« CentraleSupélec /
// Linköping University ») vide la page de Brave ; le nom seul rend le profil avec son lieu.
//
// Le jugement reprend l'application Azerit (`linkedin_discover.py` : le nom exact, l'employeur,
// le lieu, le pseudo dans l'adresse), en règles d'acceptation :
// - **fort** (attaché, prouvé `"match"`) : le nom complet exactement le sien, et, parmi les
//   profils à ce nom, le seul qui nomme son école ou son employeur (titre ou extrait), sinon le
//   seul dans sa ville, sinon le seul dont l'adresse porte son pseudo ou son site, sinon le seul
//   à ce nom (un nom rare) quand son lieu ne contredit pas celui du GitHub ;
// - **à vérifier** : plusieurs profils à ce nom, rien ne les départage, le premier n'affiche
//   aucun poste : une lecture payée de ce profil compare ses écoles et ses employeurs ;
// - **moyen** (proposé, « C'est ton LinkedIn ? ») : un nom rare dans une autre ville, ou le
//   seul profil d'un nom voisin (« Pierre Bannier » pour « Pierre-Antoine Bannier ») ;
// - **faible** : rien.

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
  /** « Gif-sur-Yvette - France » ; absent des faits collectés avant le §18.125. */
  location?: string | null;
  /** Le champ « site » : son domaine, dans l'adresse d'un profil, est un indice. */
  blog?: string | null;
  /** La bio : ses `@organisation` comptent comme employeurs. */
  bio?: string | null;
}

/** fort : attaché d'office ; moyen : proposé ; à vérifier : une lecture payée tranche. */
export type MatchStrength = "strong" | "medium" | "verify";

export interface LinkedinMatch {
  proposal: LinkedinProposal;
  strength: MatchStrength;
  /** Ce qui a concordé : `org`, `city`, `handle`, `rare`, `near`. */
  why: string[];
}

export interface LinkedinFindDeps {
  /** Les profils de l'App à ce nom complet (§18.96) ; absent : aucun. */
  namesakes?: (name: string) => Promise<Namesake[]>;
  /** L'index web (§18.90) ; absent : rien sur le web. */
  byName?: (name: string, opts: { strict: true; nameOnly: true; company: null; spend?: () => boolean; signal?: AbortSignal }) => Promise<SearchResult>;
}

// --- Les mots qui comptent ------------------------------------------------------------

const joined = (v: unknown): string => nameWords(v).join("");

/** Mots d'un lieu qui ne désignent aucune ville : pays, régions trop larges, liaisons. */
const PLACE_NOISE = new Set(
  "france fr french belgique belgium suisse switzerland schweiz canada usa us uk united states kingdom america europe european eu germany deutschland allemagne spain espagne espana italy italie italia netherlands nederland sweden suede sverige norway denmark finland poland portugal ireland austria remote world worldwide earth internet anywhere region area greater metropolitan metro et and de du des la le les sur en the of ile idf grand nord sud est ouest north south east west city ville area paca".split(" "),
);
/** Mots d'un employeur ou d'une école qui ne désignent personne. */
const ORG_NOISE = new Set(
  "university universite universitat universidad college school ecole institute institut of de du des la le the and et inc sas sa sasu ltd llc gmbh corp co company group groupe labs lab team student etudiant engineer ingenieur freelance freelancer independent independant self employed none no nothing home personal open source opensource".split(" "),
);
/** Hébergeurs dont le sous-domaine est la personne : `hennzau.github.io` → `hennzau`. */
const HOSTS = new Set(["github.io", "gitlab.io", "vercel.app", "netlify.app", "pages.dev", "medium.com", "substack.com", "carrd.co", "notion.site", "wordpress.com", "blogspot.com"]);

/** Les mots d'un lieu qui désignent une ville : « Gif-sur-Yvette - France » → gif, yvette. */
export function placeWords(location: unknown): string[] {
  return [...new Set(nameWords(location).filter((w) => w.length >= 3 && !PLACE_NOISE.has(w)))];
}

/** Les employeurs et écoles du GitHub, chacun en un mot collé : « CentraleSupélec / Linköping University » → centralesupelec, linkoping. */
export function orgTerms(gh: Pick<GithubHints, "company" | "bio" | "name">): string[] {
  const own = new Set(nameWords(gh.name));
  const parts = (gh.company ?? "").split(/[\/,;|&+·•]|\s+(?:and|et|x)\s+|\s@/i);
  const mentions = [...(gh.bio ?? "").matchAll(/(?:^|[\s(])@([A-Za-z0-9][A-Za-z0-9-]{1,38})/g)].map((m) => m[1]!);
  const out = new Set<string>();
  for (const raw of [...parts, ...mentions]) {
    const w = nameWords(raw.replace(/^\s*@/, "")).filter((x) => x.length >= 2 && !ORG_NOISE.has(x) && !own.has(x));
    const term = w.join("");
    if (term.length >= 4) out.add(term);
  }
  return [...out];
}

/** Ce qui, dans l'adresse d'un profil, désigne ce compte : le pseudo, le nom du site. */
function handles(gh: Pick<GithubHints, "login" | "blog" | "name">): string[] {
  const out = new Set<string>();
  const login = joined(gh.login);
  if (login.length >= 5) out.add(login);
  const host = (gh.blog ?? "").trim().replace(/^[a-z]+:\/\//i, "").split(/[/?#]/)[0]!.toLowerCase().replace(/^www\./, "");
  const labels = host.split(".").filter(Boolean);
  if (labels.length >= 2) {
    const tail = labels.slice(-2).join(".");
    const label = HOSTS.has(tail) ? labels[labels.length - 3] : labels[labels.length - 2];
    const j = joined(label);
    if (j.length >= 5) out.add(j);
  }
  // `enzolevan` pour Enzo Le Van : l'adresse de tous ses homonymes le porte, ce n'est pas un indice.
  const name = joined(gh.name);
  return [...out].filter((h) => !name.includes(h));
}

/** Le nom complet exactement le même, aux accents, à la casse et aux tirets près. */
export function exactName(a: unknown, b: unknown): boolean {
  const x = [...new Set(nameWords(a))].sort().join(" ");
  const y = [...new Set(nameWords(b))].sort().join(" ");
  return nameWords(a).length >= 2 && x === y;
}

const slugOf = (url: string): string => {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/\/+$/, "").split("/").pop() ?? "");
  } catch {
    return "";
  }
};

/** Ce que l'index dit d'un profil, hors son nom : son titre, son lieu, son extrait. */
const aboutOf = (c: LinkedinCandidate): string => `${c.headline} ${c.location ?? ""} ${c.snippet ?? ""}`;

function hasOrg(terms: string[], text: string): boolean {
  const t = joined(text);
  return terms.some((term) => t.includes(term));
}

function inCity(place: string[], c: LinkedinCandidate): boolean {
  const have = new Set(nameWords(`${aboutOf(c)}`));
  return place.some((w) => have.has(w));
}

/** Les deux lieux sont connus et n'ont aucune ville en commun (Lyon contre Bordeaux). */
function otherCity(place: string[], location: unknown, c: LinkedinCandidate): boolean {
  const theirs = placeWords(c.location);
  if (!place.length || !theirs.length) return false;
  const mine = new Set(nameWords(location));
  return !inCity(place, c) && !theirs.some((w) => mine.has(w));
}

const proposalOf = (c: LinkedinCandidate): LinkedinProposal => ({
  kind: "linkedin",
  url: c.url,
  name: c.name.slice(0, 80),
  headline: (c.headline ?? "").slice(0, 120),
  ...(c.photoUrl ? { photoUrl: c.photoUrl } : {}),
  sure: false,
});

/** L'entreprise du GitHub, en mots : « @azerit-tech » → « azerit tech ». */
function companyWords(company: string | null): string[] {
  return nameWords((company ?? "").replace(/^@/, "")).filter((w) => w.length >= 3);
}

/** Le seul profil d'un nom voisin à proposer (règle du §18.100), ou null. */
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
  return pick ? proposalOf(pick) : null;
}

/**
 * Le jugement (§18.125) : parmi ces candidats, le LinkedIn de ce GitHub, et à quel point
 * c'est sûr. null : rien, ou plusieurs homonymes que rien ne départage.
 */
export function judgeLinkedin(gh: GithubHints, list: LinkedinCandidate[]): LinkedinMatch | null {
  if (!gh.name || !parsePersonName(gh.name)) return null;
  const seen = new Set<string>();
  const unique = list.filter((c) => !seen.has(c.url.toLowerCase()) && !!seen.add(c.url.toLowerCase()));
  const exact = unique.filter((c) => exactName(gh.name, c.name));
  const orgs = orgTerms(gh);
  const place = placeWords(gh.location);
  const ids = handles(gh);
  const done = (c: LinkedinCandidate, strength: MatchStrength, why: string[]): LinkedinMatch => ({ proposal: proposalOf(c), strength, why });
  if (exact.length) {
    const only = (f: (c: LinkedinCandidate) => boolean) => {
      const hit = exact.filter(f);
      return hit.length === 1 ? hit[0]! : null;
    };
    const org = orgs.length ? only((c) => hasOrg(orgs, aboutOf(c))) : null;
    if (org) return done(org, "strong", ["org"]);
    const city = place.length ? only((c) => inCity(place, c)) : null;
    if (city) return done(city, "strong", ["city"]);
    const handle = ids.length ? only((c) => ids.some((h) => joined(slugOf(c.url)).includes(h))) : null;
    if (handle) return done(handle, "strong", ["handle"]);
    if (exact.length === 1) {
      const c = exact[0]!;
      return otherCity(place, gh.location, c) ? done(c, "medium", ["rare", "other_city"]) : done(c, "strong", ["rare"]);
    }
    // Des homonymes que l'index ne départage pas : le premier qui n'affiche aucun poste se lit, si le GitHub a de quoi comparer.
    const blank = orgs.length ? exact.find((c) => (c.placeOnly || !c.headline) && !otherCity(place, gh.location, c)) : undefined;
    return blank ? done(blank, "verify", ["namesakes"]) : null;
  }
  const near = pickLinkedin(gh, unique);
  return near ? { proposal: near, strength: "medium", why: ["near"] } : null;
}

/** Le profil lu nomme-t-il une école ou un employeur du GitHub (§18.125, la lecture « à vérifier ») ? */
export function profileNamesOrg(gh: GithubHints, profile: { roles?: { company?: string | null }[]; education?: { school?: string | null }[]; headline?: string | null }): boolean {
  const orgs = orgTerms(gh);
  const text = [...(profile.roles ?? []).map((r) => r.company ?? ""), ...(profile.education ?? []).map((e) => e.school ?? ""), profile.headline ?? ""].join(" ");
  return orgs.length > 0 && hasOrg(orgs, text);
}

/**
 * Une proposition nue (d'avant le §18.125) : forte si son nom complet est celui du GitHub, ce
 * GitHub va avec ce nom (`githubFitsName`), et son titre nomme l'entreprise du GitHub (§18.121).
 */
export function strongLinkedin(gh: GithubHints, p: LinkedinProposal): boolean {
  const words = companyWords(gh.company);
  if (!gh.name || !words.length || !samePublicFullName(gh.name, p.name) || !githubFitsName(p.name, gh.login, gh.name)) return false;
  const headline = nameWords(p.headline);
  return words.some((w) => headline.includes(w));
}

/** Un résultat de chercheur, nouveau (`LinkedinMatch`) ou nu (`Proposal`), en jugement. */
export function asLinkedinMatch(gh: GithubHints, r: LinkedinMatch | Proposal | null | undefined): LinkedinMatch | null {
  if (!r) return null;
  if ("strength" in r) return r;
  return r.kind === "linkedin" ? { proposal: r, strength: strongLinkedin(gh, r) ? "strong" : "medium", why: [] } : null;
}

const namesakeCandidate = (n: Namesake): LinkedinCandidate | null => (n.name ? { url: n.url, name: n.name, headline: n.headline } : null);

export interface LinkedinFindOptions {
  spend?: () => boolean;
  signal?: AbortSignal;
  budgetMs?: number;
}

/** Le LinkedIn de ce GitHub et sa force, ou null. Jamais d'erreur ; deux secondes au plus, une recherche payée au plus. */
export async function matchLinkedinFor(deps: LinkedinFindDeps, gh: GithubHints, o: LinkedinFindOptions = {}): Promise<LinkedinMatch | null> {
  const name = parsePersonName(gh.name ?? "");
  if (!name) return null;
  const budget = o.budgetMs ?? FIND_BUDGET_MS;
  const signal = o.signal ? AbortSignal.any([o.signal, AbortSignal.timeout(budget)]) : AbortSignal.timeout(budget);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((res) => {
    timer = setTimeout(() => res(null), budget);
    timer.unref?.();
  });
  const run = async (): Promise<LinkedinMatch | null> => {
    const app = deps.namesakes ? (await deps.namesakes(name.full).catch(() => [])).flatMap((n) => namesakeCandidate(n) ?? []) : [];
    const fromApp = judgeLinkedin(gh, app);
    if (fromApp?.strength === "strong") return fromApp;
    if (!deps.byName || signal.aborted) return fromApp;
    const web = await deps.byName(name.full, { strict: true, nameOnly: true, company: null, spend: o.spend, signal }).catch(() => ({ status: "off" }) as const);
    if (web.status !== "ok") return fromApp;
    return judgeLinkedin(gh, mergeCandidates(app, web.results));
  };
  try {
    return await Promise.race([run().catch(() => null), late]);
  } finally {
    clearTimeout(timer);
  }
}

/** Le LinkedIn à montrer pour ce GitHub (fort ou moyen), ou null. */
export async function findLinkedinFor(deps: LinkedinFindDeps, gh: GithubHints, o: LinkedinFindOptions = {}): Promise<LinkedinProposal | null> {
  const m = await matchLinkedinFor(deps, gh, o);
  return m && m.strength !== "verify" ? m.proposal : null;
}
