// Les employeurs à forte barre d'embauche (SPEC §18.37, critère Parcours et
// employeurs, niveaux 8 et 10). La liste vit hors du dépôt public : un fichier
// du serveur, au chemin donné par HIGH_BAR_EMPLOYERS_FILE, de la forme de
// data/employers.example.json. Le dépôt n'en garde qu'un exemple aux noms
// inventés. L'IA ne rend jamais ce rang : seule cette liste le donne.
//
// Sans fichier, ou fichier illisible : liste vide, un avertissement au plus,
// rien ne plante ; les niveaux 8 et 10 du parcours ne s'ouvrent alors que par
// les startups et scale-ups.

import { readFileSync } from "node:fs";

export interface HighBarEmployer {
  /** Le nom affiché. */
  name: string;
  /** Les façons de l'écrire, normalisées (nom compris). */
  keys: string[];
}

export interface HighBarList {
  employers: HighBarEmployer[];
  /** Le fichier lu ; null sans fichier, ou s'il est illisible. */
  source: string | null;
}

export const EMPLOYERS_ENV = "HIGH_BAR_EMPLOYERS_FILE";
const MAX_EMPLOYERS = 2000;
const MIN_KEY = 3;

/** Minuscules, sans accents, toute ponctuation ramenée à une espace. */
export function normEmployer(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Le contenu d'un fichier de liste → employeurs ; les entrées mal formées sont ignorées. */
export function parseEmployers(json: unknown): HighBarEmployer[] {
  const list = (json as { employers?: unknown } | null)?.employers;
  if (!Array.isArray(list)) return [];
  const out: HighBarEmployer[] = [];
  for (const raw of list.slice(0, MAX_EMPLOYERS)) {
    const e = raw as { name?: unknown; aliases?: unknown } | null;
    if (typeof e?.name !== "string" || !e.name.trim()) continue;
    const aliases = Array.isArray(e.aliases) ? e.aliases.filter((a): a is string => typeof a === "string") : [];
    const keys = [...new Set([e.name, ...aliases].map(normEmployer).filter((k) => k.length >= MIN_KEY))];
    if (keys.length) out.push({ name: e.name.trim().slice(0, 120), keys });
  }
  return out;
}

/**
 * Lit la liste au chemin de HIGH_BAR_EMPLOYERS_FILE. Ne lève jamais : sans
 * variable, liste vide sans un mot ; fichier absent ou illisible, liste vide et
 * un avertissement (sans le contenu).
 */
export function loadHighBarEmployers(
  env: Record<string, string | undefined> = process.env,
  read: (path: string) => string = (p) => readFileSync(p, "utf8"),
  warn: (msg: string) => void = (m) => console.warn(m),
): HighBarList {
  const path = env[EMPLOYERS_ENV]?.trim();
  if (!path) return { employers: [], source: null };
  try {
    const employers = parseEmployers(JSON.parse(read(path)));
    if (!employers.length) warn(`[employers] ${EMPLOYERS_ENV} : aucun employeur lisible dans ${path}`);
    return { employers, source: path };
  } catch (e) {
    warn(`[employers] ${EMPLOYERS_ENV} illisible (${path}) : ${(e as Error).message.split("\n")[0]!.slice(0, 120)}`);
    return { employers: [], source: null };
  }
}

let cached: HighBarList | null = null;

/** La liste du serveur, lue une fois au premier usage. */
export function highBarEmployers(): HighBarList {
  cached ??= loadHighBarEmployers();
  return cached;
}

/** Pour les tests : oublie la liste lue, ou en pose une. */
export function setHighBarEmployersForTests(list: HighBarList | null): void {
  cached = list;
}

/**
 * L'employeur de la liste que désigne ce nom d'entreprise, ou null. Le nom doit
 * être l'une de ses écritures, ou commencer par elle suivie d'un mot
 * (« Fictiva Labs Paris » pour « Fictiva Labs ») ; jamais un morceau de mot.
 */
export function highBarEmployer(company: string, list: HighBarList = highBarEmployers()): string | null {
  const c = normEmployer(company);
  if (c.length < MIN_KEY) return null;
  for (const e of list.employers) if (e.keys.some((k) => c === k || c.startsWith(`${k} `))) return e.name;
  return null;
}
