// Les bandes (SPEC §18.38) : les noms et les formes échangées entre le serveur
// et le front. Pur : aucune base, aucun réseau.
//
// - Une école vient de la liste fermée de data/bands.json (la liste du barème,
//   sans ses rangs, plus les écoles de dev courantes) : un nom lu y est comparé,
//   hors liste, rien. Le rang d'école du barème n'est jamais lu ici.
// - Une boîte se normalise par règle : casse, accents, « @ », forme juridique
//   (SAS, Inc…) et « Groupe » retirés, puis une petite table d'alias. Freelance,
//   indépendant, étudiant, stealth, sans emploi et leurs variantes ne font pas une bande.
// - Le nom d'une boîte hors alias est un texte libre, affiché en public : il est
//   refusé s'il porte une insulte ou un terme haineux (data/bands.json), une
//   adresse, un @ ou un numéro, et toujours nettoyé (espaces, casse, ni emoji ni
//   ponctuation décorative). Une bande fermée à la main (`blocked`) n'existe plus.
//   Une boîte hors alias n'a de page publique, d'image ni de place au tableau
//   qu'à partir de trois dossiers (`hasPage`).

import raw from "../data/bands.json";
import type { Fact } from "./types";

/** Les deux ligues, telles qu'elles s'écrivent dans les adresses (/bandes/ecole/:id). */
export type BandType = "ecole" | "boite";
export const BAND_TYPES: readonly BandType[] = ["ecole", "boite"];

/** Membres qu'il faut à une bande pour entrer au tableau ; en dessous, « bande en formation ». */
export const BAND_MIN_MEMBERS = 3;
/** Les dossiers qui comptent dans le score d'une bande : ses vingt meilleurs. */
export const BAND_TOP_MEMBERS = 20;
/** Entrées dans une bande par jour et par adresse IP. */
export const BAND_JOINS_PER_DAY = 3;

/** Identifiant d'une bande : minuscules, chiffres, tirets, 60 signes au plus. */
export const BAND_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const BAND_ID_MAX = 60;
/** Nom de boîte tapé : au-delà, refusé. */
export const COMPANY_INPUT_MAX = 80;

export interface BandRef {
  type: BandType;
  id: string;
  label: string;
}

/** Une bande au classement de sa ligue, calculé à la lecture. */
export interface BandStanding extends BandRef {
  /** Somme des étoiles de ses vingt meilleurs dossiers. */
  score: number;
  /** Dossiers comptés (fiches en ligne, non masquées). */
  members: number;
  /** Rang dans sa ligue, à partir de trois dossiers ; null : bande en formation. */
  rank: number | null;
  /** Complices qui manquent pour entrer au tableau ; 0 au tableau. */
  missing: number;
  /** Étoiles qui la séparent de la bande de devant ; null en tête ou en formation. */
  gap: number | null;
  /** La bande de devant, au tableau ; null en tête ou en formation. */
  ahead: { id: string; label: string; rank: number } | null;
  /**
   * Sa page publique et son image existent : toute école de la liste, toute boîte
   * de la table d'alias, une autre boîte à partir de trois dossiers. Sinon, seule
   * la personne la voit, sous sa fiche.
   */
  hasPage: boolean;
}

/** GET /api/bands?type= : le tableau d'une ligue. */
export interface BandBoard {
  type: BandType;
  /** Bandes au tableau (trois dossiers ou plus). */
  total: number;
  /** Les vingt premières. */
  entries: BandStanding[];
  /** La bande demandée par `with`, si elle est plus bas ou en formation. */
  extra: BandStanding | null;
}

/** GET /api/bands/top : les cinq premières de chaque ligue, pour l'accueil. */
export interface BandsTop {
  ecole: BandStanding[];
  boite: BandStanding[];
}

/** Un membre sur la page d'une bande : jamais un nom ; le @pseudo seulement si la fiche est revendiquée. */
export interface BandMember {
  stars: number;
  /** Nom du profil criminel, si la fiche en a un. */
  profile: Fact | null;
  /** Pseudo GitHub, seulement pour une fiche revendiquée. */
  login?: string;
  /** Adresse de la fiche, seulement pour une fiche revendiquée. */
  cardId?: string;
}

/** GET /api/bands/:type/:id. */
export interface BandPage {
  band: BandStanding;
  members: BandMember[];
}

/** GET /api/card/:id/bands : les bandes de la personne fichée, et les pastilles proposées. */
export interface MyBands {
  /** Les étoiles que la personne rapporte à ses bandes (celles de la fiche, du dossier pour deux pièces). */
  stars: number;
  ecole: BandStanding | null;
  boite: BandStanding | null;
  /** Lues sur la fiche : l'école (LinkedIn, CV) et l'employeur actuel. */
  suggest: { ecole: BandRef | null; boite: BandRef | null };
}

interface SchoolEntry {
  id: string;
  label: string;
  pattern: string;
}

const DATA = raw as {
  schools: SchoolEntry[];
  blocked: string[];
  companies: {
    aliases: { id: string; label: string; names: string[] }[];
    none: string[];
    noneExact: string[];
    refusedWords: string[];
    refusedStems: string[];
    legalForms: string[];
  };
};

/** Minuscules, sans accents, toute ponctuation ramenée à une espace (comme server/src/scoring/school.ts). */
export function normName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/* ---------- écoles ---------- */

const SCHOOLS = DATA.schools.map((s) => ({ id: s.id, label: s.label, re: new RegExp(s.pattern), key: normName(s.label) }));
const SCHOOL_BY_ID = new Map(SCHOOLS.map((s) => [s.id, s]));

/** La liste des écoles, dans l'ordre du fichier : id et libellé, jamais de rang. */
export function schoolList(): { id: string; label: string }[] {
  return SCHOOLS.map(({ id, label }) => ({ id, label }));
}

/** L'école de cet id, ou null. */
export function schoolById(id: string): BandRef | null {
  const s = SCHOOL_BY_ID.get(id);
  return s ? { type: "ecole", id: s.id, label: s.label } : null;
}

/** L'école de la liste qui correspond à un nom lu (LinkedIn, CV), ou null hors liste. */
export function matchSchool(name: string | null | undefined): BandRef | null {
  const key = normName(name ?? "");
  if (!key) return null;
  const hit = SCHOOLS.find((s) => s.re.test(key));
  return hit ? { type: "ecole", id: hit.id, label: hit.label } : null;
}

/**
 * La recherche dans la liste : le texte tapé est dans le libellé, ou le motif de
 * l'école le reconnaît (« supelec », « n7 », « x »). Huit au plus, ceux dont le
 * libellé commence par le texte d'abord.
 */
export function searchSchools(query: string, limit = 8): { id: string; label: string }[] {
  const q = normName(query);
  if (!q) return [];
  const hits = SCHOOLS.filter((s) => s.key.includes(q) || s.re.test(q));
  const starts = (s: (typeof SCHOOLS)[number]) => (s.key.startsWith(q) || s.key.split(" ").some((w) => w.startsWith(q)) ? 0 : 1);
  return [...hits]
    .sort((a, b) => starts(a) - starts(b))
    .slice(0, limit)
    .map(({ id, label }) => ({ id, label }));
}

/* ---------- boîtes ---------- */

const NONE = DATA.companies.none.map((w) => new RegExp(`(?:^| )${w}(?: |$)`));
const NONE_EXACT = new Set(DATA.companies.noneExact);
/** Les formes juridiques, les plus longues d'abord (« s a s u » avant « s a »). */
const LEGAL = [...DATA.companies.legalForms].sort((a, b) => b.length - a.length);
const ALIAS = new Map<string, { id: string; label: string }>();
for (const a of DATA.companies.aliases) {
  ALIAS.set(a.id.replace(/-/g, " "), a);
  for (const n of a.names) ALIAS.set(n, a);
}

/** Retire les formes juridiques de fin (« doctolib sas » → « doctolib »), et « groupe » ou « the » en tête ; jamais jusqu'au vide. */
function stripForms(key: string): string {
  let s = ` ${key} `;
  for (let changed = true; changed; ) {
    changed = false;
    for (const f of LEGAL) {
      if (s.endsWith(` ${f} `) && s.trim() !== f) {
        s = s.slice(0, s.length - f.length - 1);
        changed = true;
      }
    }
    for (const lead of ["groupe", "group", "the"]) {
      if (s.startsWith(` ${lead} `) && s.trim() !== lead) {
        s = s.slice(lead.length + 1);
        changed = true;
      }
    }
  }
  return s.trim();
}

/** Le nom normalisé d'une boîte, ou "" s'il ne fait pas une bande (freelance, étudiant, stealth…). */
export function companyKey(name: string | null | undefined): string {
  const raw = (name ?? "").slice(0, COMPANY_INPUT_MAX * 2);
  const key = normName(raw.replace(/@/g, " ").replace(/&/g, " "));
  if (!key) return "";
  if (NONE_EXACT.has(key) || NONE.some((re) => re.test(key))) return "";
  const stripped = stripForms(key);
  if (!stripped || NONE_EXACT.has(stripped)) return "";
  return stripped;
}

/* ---------- le nom libre d'une boîte : refus et nettoyage ---------- */

const REFUSED_WORDS = DATA.companies.refusedWords.map(normName).filter(Boolean);
const REFUSED_STEMS = DATA.companies.refusedStems.map((w) => normName(w).replace(/ /g, "")).filter(Boolean);
const BLOCKED = new Set(DATA.blocked);

/** Les chiffres et signes tapés à la place des lettres (« s4l0pe »). */
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", $: "s", "€": "e", "!": "i", "|": "i" };

/** Les formes à comparer à la liste : telle quelle et sans chiffres-lettres, les lettres répétées (trois et plus) ramenées à une puis à deux. */
function variants(name: string): string[] {
  const bases = [normName(name), normName(name.replace(/[0-9$€!|]/g, (ch) => LEET[ch] ?? ch))];
  const out = new Set<string>();
  for (const b of bases) {
    out.add(b);
    out.add(b.replace(/([a-z])\1{2,}/g, "$1"));
    out.add(b.replace(/([a-z])\1{2,}/g, "$1$1"));
  }
  return [...out].filter(Boolean);
}

/** Un mot de la liste, entier (ou une suite de mots), ou une racine n'importe où, espaces retirées. */
function hasRefusedWord(name: string): boolean {
  return variants(name).some((v) => {
    const spaced = ` ${v} `;
    const compact = v.replace(/ /g, "");
    return REFUSED_WORDS.some((w) => spaced.includes(` ${w} `)) || REFUSED_STEMS.some((w) => compact.includes(w));
  });
}

const URL_RE = /https?:|www\.|\b[a-z0-9-]+\.(?:com|fr|io|net|org|co|ai|dev|app|me|tech|eu|uk|de|be|ch|xyz|gg|tv|ly|to|info|biz)\b/i;
const STREET_RE = /\b\d+(?: bis| ter)? (?:rue|avenue|av|bd|boulevard|chemin|allee|place|impasse|quai|route|cours|street|st|road|rd|lane)\b/;

/** Une adresse (web, email, postale), un @ ou un numéro (six chiffres et plus) : ce n'est pas un nom de boîte. */
function hasContact(name: string): boolean {
  if (name.includes("@") || URL_RE.test(name) || STREET_RE.test(normName(name))) return true;
  return (name.match(/\d/g)?.length ?? 0) >= 6;
}

/** Pourquoi un nom de boîte ne fait pas une bande : « none » (vide, freelance, étudiant…), « contact », « word » (insulte, bande fermée). */
export type CompanyRefusal = "none" | "contact" | "word";

/** Fermée à la main (`blocked`), ou nom refusé (un libellé déjà en base relu avec la liste du jour). */
export function isBlockedBand(type: BandType, id: string, label?: string | null): boolean {
  if (BLOCKED.has(`${type}/${id}`)) return true;
  if (type !== "boite") return false;
  return hasRefusedWord(id.replace(/-/g, " ")) || (!!label && hasRefusedWord(label));
}

/** Les signes gardés dans un libellé : lettres, chiffres, espaces, & ' ’ . , + ( ) - /. Le reste (emoji, étoiles, #, !, _…) part. */
const KEEP_RE = /[^\p{L}\p{M}\p{N} &'’.,+()/-]/gu;

const capitalize = (w: string) => w.charAt(0).toLocaleUpperCase("fr") + w.slice(1).toLocaleLowerCase("fr");

/**
 * Le libellé affiché d'une boîte hors alias, depuis le nom tapé : sans « @ », sans
 * emoji ni ponctuation décorative, ponctuation doublée ramenée à un signe,
 * espaces resserrées, sans forme juridique de fin, et une casse raisonnable : tout
 * en capitales, les mots de plus de quatre lettres prennent une capitale initiale
 * (les sigles restent) ; tout en minuscules, la première lettre passe en capitale.
 */
export function cleanCompanyLabel(name: string): string {
  let s = name
    .normalize("NFKC")
    .replace(/@/g, " ")
    .replace(KEEP_RE, " ")
    .replace(/([&'’.,+()/-])\1+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const words = s.split(" ");
  const isForm = (w: string) => {
    const k = normName(w);
    return !!k && LEGAL.includes(k);
  };
  while (words.length > 1 && isForm(words[words.length - 1]!)) words.pop();
  // « Doctolib SAS, » : la ponctuation laissée par la forme retirée part aussi, comme celle de tête.
  s = words
    .join(" ")
    .replace(/^[^\p{L}\p{N}(]+/u, "")
    .replace(/[^\p{L}\p{N})]+$/u, "");
  const letters = s.replace(/[^\p{L}]/gu, "");
  if (letters.length > 1 && letters === letters.toLocaleUpperCase("fr") && letters !== letters.toLocaleLowerCase("fr")) {
    s = s.replace(/\p{L}+/gu, (w) => (w.length > 4 ? capitalize(w) : w));
  } else if (letters && letters === letters.toLocaleLowerCase("fr")) {
    s = s.charAt(0).toLocaleUpperCase("fr") + s.slice(1);
  }
  return s.slice(0, BAND_ID_MAX).trim();
}

/**
 * La bande d'une boîte, ou la raison du refus : vide, trop long ou pas une bande
 * (freelance, étudiant, stealth, sans emploi…) ; une adresse, un @ ou un numéro ;
 * une insulte, un terme haineux ou une bande fermée. Un alias donne son id et son libellé.
 */
export function companyCheck(name: string | null | undefined): { ref: BandRef } | { refused: CompanyRefusal } {
  if (!name || name.length > COMPANY_INPUT_MAX) return { refused: "none" };
  if (hasContact(name)) return { refused: "contact" };
  if (hasRefusedWord(name)) return { refused: "word" };
  const key = companyKey(name);
  if (!key) return { refused: "none" };
  const alias = ALIAS.get(key);
  if (alias) return BLOCKED.has(`boite/${alias.id}`) ? { refused: "word" } : { ref: { type: "boite", id: alias.id, label: alias.label } };
  const id = key.replace(/ /g, "-").slice(0, BAND_ID_MAX).replace(/-+$/, "");
  if (!BAND_ID_RE.test(id)) return { refused: "none" };
  if (isBlockedBand("boite", id)) return { refused: "word" };
  return { ref: { type: "boite", id, label: cleanCompanyLabel(name) || id } };
}

/** La bande d'une boîte, ou null si le nom est refusé (companyCheck). */
export function companyBand(name: string | null | undefined): BandRef | null {
  const c = companyCheck(name);
  return "ref" in c ? c.ref : null;
}

/** Le libellé d'alias d'une boîte (« meta » → « Meta »), sinon null : le libellé vient alors du premier membre. */
export function companyAliasLabel(id: string): string | null {
  return DATA.companies.aliases.find((a) => a.id === id)?.label ?? null;
}

/**
 * Une page publique, une image et une place au tableau : toute école de la liste
 * et toute boîte de la table d'alias ; une boîte au nom libre à partir de trois dossiers.
 */
export function bandHasPage(type: BandType, id: string, members: number): boolean {
  return type === "ecole" || companyAliasLabel(id) !== null || members >= BAND_MIN_MEMBERS;
}

export const isBandType = (x: unknown): x is BandType => x === "ecole" || x === "boite";

/** Adresse de la page d'une bande. */
export const bandPath = (b: { type: BandType; id: string }): string => `/bandes/${b.type}/${b.id}`;
