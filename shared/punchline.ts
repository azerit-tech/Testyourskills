// La phrase de la fiche et le nom de son profil, propres à chaque fiche (SPEC §18.103).
//
// - La phrase : celle que l'IA a écrite pendant la lecture (`profile.line`), si
//   elle passe encore le contrôle ; sinon une phrase du recueil data/punchlines.json,
//   remplie avec les faits publics de la fiche et tirée par le hachage de son id.
//   Même fiche, même phrase ; deux voisines, deux phrases.
// - Le nom : un des noms du profil, tiré par le même hachage. L'id du profil, sa
//   règle et sa note ne bougent pas.
// - Le contrôle (`checkLine`) : longueur, place sur la fiche (deux lignes au plus,
//   jamais sous le corps minimal de la phrase), ni lien, ni adresse, ni insulte,
//   rien sur l'âge, le genre, l'origine, la religion, la santé ou l'apparence,
//   aucune vraie accusation, aucun nom interdit (l'école, un ancien employeur).
//
// Pur et déterministe. Rien de privé : l'école n'entre jamais, l'employeur est
// celui que la fiche affiche déjà.

import data from "../data/punchlines.json";
import { LAYOUT, profileTagline } from "./card/Card";
import { langTitle } from "./card/languages";
import { frTypo } from "./typo";
import type { CardData, CardProfile, Fact, Lang } from "./types";

type Tails = Record<string, Fact[]>;
const ALIASES = data.aliases as Record<string, Fact[]>;
const LEADS = data.leads as Fact[];
const TAILS = data.tails as Tails;

/** FNV-1a sur 32 bits : stable d'une machine à l'autre, d'une version de Node à l'autre. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const pick = (seed: string, salt: string, n: number): number => (n > 0 ? hash32(`${salt}:${seed}`) % n : 0);

/** Les noms d'un profil, celui du catalogue d'abord. Vide pour un id inconnu. */
export function aliasesOf(profileId: string): Fact[] {
  return ALIASES[profileId] ?? [];
}

/** Le nom du profil pour cette fiche : un de ses noms, tiré par l'id de la fiche. */
export function aliasFor(profileId: string, seed: string): Fact | null {
  const list = aliasesOf(profileId);
  return list.length ? list[pick(seed, "name", list.length)]! : null;
}

/** Ce nom est-il un des noms de ce profil ? */
export function isAlias(profileId: string, label: Fact): boolean {
  return aliasesOf(profileId).some((a) => a.fr === label.fr && a.en === label.en);
}

/* ------------------------------------------------------------------ */
/* Le contrôle                                                          */
/* ------------------------------------------------------------------ */

export const LINE_MIN = 12;
export const LINE_MAX = 90;

/** Minuscules, sans accents : les listes se comparent là-dessus. */
const plain = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Un mot entier de la liste, dans un texte déjà passé par `plain`. */
const words = (list: string[]) => new RegExp(`(?<![\\p{L}\\d])(?:${list.join("|")})(?![\\p{L}\\d])`, "u");
/** Un début de mot de la liste (« harcel » attrape « harcèlement »). */
const stems = (list: string[]) => new RegExp(`(?<![\\p{L}\\d])(?:${list.join("|")})`, "u");

const URL_RE = /https?:|www\.|[\p{L}\d-]+\.(?:com|fr|io|net|org|dev|ai|app|co|eu|tech|me|xyz|ly|gg)(?![\p{L}\d])/iu;
const EMAIL_RE = /@/;
const PHONE_RE = /\d[\d .-]{7,}\d/;
const EMOJI_RE = /\p{Extended_Pictographic}/u;
/** Écriture inclusive et accords incertains : le français de la fiche n'accorde rien avec la personne. */
const INCLUSIVE_RE = /\p{L}[·.]e\b|\(e\)|\(s\)|\p{L}·\p{L}/u;

const BANNED: Record<Lang, RegExp[]> = {
  fr: [
    // Insultes, grossièretés, mépris
    words(["cons?", "connes?", "connards?", "connasses?", "salauds?", "salopes?", "putes?", "putain", "merde", "merdique", "encules?", "batards?", "pd", "pedes?", "tapettes?", "gouines?", "abrutis?", "cretins?", "idiots?", "imbeciles?", "debiles?", "nuls?", "nulles?", "minables?", "pourris?", "losers?", "boloss?", "bouffons?", "gogols?", "mongols?", "attardes?", "chiant", "chiante", "naze", "nazes", "foireux", "ridicules?", "pitoyables?", "honte"]),
    stems(["negr", "bougnoul", "bicot", "youpin", "chinetoqu", "niakou", "bamboula", "tranny"]),
    // Caractéristiques protégées, corps et santé
    words(["femmes?", "hommes?", "filles?", "garcons?", "mecs?", "nanas?", "meufs?", "madame", "monsieur", "juifs?", "juives?", "musulmans?", "musulmanes?", "chretiens?", "chretiennes?", "catholiques?", "religions?", "dieu", "allah", "arabes?", "africains?", "africaines?", "asiatiques?", "chinois", "chinoises?", "indiens?", "indiennes?", "maghrebins?", "beurs?", "rebeus?", "noirs?", "noires?", "etrangers?", "etrangeres?", "immigres?", "nationalites?", "origines?", "gitans?", "roms?", "malades?", "maladies?", "cancers?", "handicaps?", "handicapes?", "autistes?", "autisme", "depression", "depressifs?", "fous", "folles?", "fou", "tares?", "psychopathes?", "schizos?", "bipolaires?", "gros", "grosses?", "obeses?", "maigres?", "moches?", "laids?", "laides?", "chauves?", "vieux", "vieilles?", "ages?", "boomers?", "enceintes?", "grossesses?", "sexy", "sexe", "sexuels?", "sexuelles?", "physiques?", "elles?"]),
    // Le vouvoiement, pas « rendez-vous »
    /(?<![\p{L}\d-])(?:vous|votre|vos)(?![\p{L}\d-])/u,
    // Le pronom de la troisième personne genre la personne ; « il y a », « il faut » restent
    /(?<![\p{L}\d])ils?(?![\p{L}\d])(?!\s+(?:y|faut|reste|parait|semble|etait|suffit))/u,
    // Vraies accusations, au-delà du jeu
    stems(["fraud", "escro", "arnaq", "voleu", "menteu", "mensong", "mytho", "plagi", "drogu", "dealer", "meurtr", "tueu", "terroris", "pedophil", "harcel", "corrupt", "corromp", "blanchiment", "detourn", "condamn", "racis", "nazi"]),
    words(["vols?", "voles?", "voler", "viols?", "violer", "violeurs?"]),
  ],
  en: [
    words(["fuck\\w*", "shit\\w*", "crap\\w*", "bitch\\w*", "bastards?", "assholes?", "dicks?", "cunts?", "whores?", "sluts?", "fags?", "faggots?", "retards?", "retarded", "idiots?", "morons?", "stupid", "dumb", "losers?", "sucks?", "garbage", "trash", "lame", "pathetic", "useless", "worthless", "shame\\w*"]),
    stems(["nigg", "spic", "chink", "kike", "tranny"]),
    words(["wom[ae]n", "men", "man", "girls?", "boys?", "guys?", "lad(?:y|ies)", "gentlem[ae]n", "he", "she", "him", "her", "his", "hers", "jews?", "jewish", "muslims?", "christians?", "catholics?", "religion", "religious", "god", "allah", "black", "white", "asian", "african", "arab", "mexican", "indian", "chinese", "foreigners?", "immigrants?", "nationality", "ethnic\\w*", "racial", "sick", "illness", "disease", "cancer", "disabled", "disability", "autistic", "autism", "depressed", "depression", "crazy", "insane", "psycho\\w*", "fat", "obese", "skinny", "ugly", "bald", "elderly", "boomers?", "grandpa", "grandma", "old (?:man|lady|timer)", "too old", "aged?", "pregnant", "sexy", "sex", "sexual", "weight", "height"]),
    stems(["fraud", "scam", "con artist", "thie", "liar", "plagiar", "drug", "dealer", "rapist", "murder", "killer", "terror", "pedophil", "harass", "corrupt", "launder", "embezzl", "convict", "felon", "racis", "nazi"]),
    words(["steal", "steals", "stealing", "stole", "stolen", "lies", "lying", "rape", "raped"]),
  ],
};

/** Les grossièretés qui passent jusque dans un mot composé (« brainfuck »), dans les deux langues. */
const ANYWHERE = /fuck|shit|cunt|bitch|nigg|merde|putain|encul/;

export interface LineCheck {
  /** Noms qui ne doivent pas paraître, l'école, les anciens employeurs : entiers ou par un de leurs mots propres (« Dauphine »). Sans accents ni casse. */
  names?: (string | null | undefined)[];
  /** Phrases qui ne doivent pas être reprises (les exemples des consignes) : entières. */
  forbid?: (string | null | undefined)[];
}

/** Les mots d'un nom d'école ou d'employeur qui ne le désignent pas à eux seuls. */
const GENERIC = new Set(
  "universite university universitat ecole ecoles school institut institute instituto national nationale superieure superieur college faculte faculty polytech paris lyon lille marseille nantes toulouse france french group groupe societe company technologie technologies technology tech sciences science engineering ingenieurs ingenieur business management digital consulting services solutions systems labs studio".split(" "),
);
const tokens = (s: string) => s.split(" ").filter((w) => w.length >= 5 && !GENERIC.has(w));

/** Ce que la fiche dessine : une phrase nettoyée, ou null si elle ne passe pas. Le français sort en typographie du site. */
export function checkLine(raw: string, lang: Lang, opts: LineCheck = {}): string | null {
  let text = raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*[—–]\s*/g, ", ")
    .trim();
  // Une phrase rendue entre guillemets : les guillemets tombent, pas ceux d'un mot cité.
  const quoted = /^["«“]\s*(.*?)\s*["»”]$/u.exec(text);
  if (quoted && !/["«“»”]/u.test(quoted[1]!)) text = quoted[1]!.trim();
  if (lang === "fr") text = frTypo(text);
  if (text.length < LINE_MIN || text.length > LINE_MAX) return null;
  if (URL_RE.test(text) || EMAIL_RE.test(text) || PHONE_RE.test(text) || EMOJI_RE.test(text) || INCLUSIVE_RE.test(text)) return null;
  const p = plain(text);
  if (ANYWHERE.test(p) || BANNED[lang].some((re) => re.test(p))) return null;
  const flat = (s: string) => plain(s).replace(/[^\p{L}\d]+/gu, " ").trim();
  const said = ` ${flat(text)} `;
  for (const name of [...(opts.names ?? []), ...(opts.forbid ?? [])]) {
    const n = name ? flat(name) : "";
    if (n.length >= 3 && said.includes(` ${n} `)) return null;
  }
  for (const name of opts.names ?? []) if (name && tokens(flat(name)).some((w) => said.includes(` ${w} `))) return null;
  return fits(text) ? text : null;
}

/** La phrase tient sur la fiche : deux lignes au plus, entière, au corps minimal de la phrase ou plus. */
export function fits(text: string): boolean {
  const f = profileTagline(text);
  return !f.truncated && f.lines.length <= 2 && f.size >= LAYOUT.tagline.minSize;
}

/** Les deux langues d'une phrase, contrôlées ensemble : null si l'une ne passe pas. */
export function checkLineFact(line: Partial<Fact> | null | undefined, opts: LineCheck = {}): Fact | null {
  if (!line || typeof line.fr !== "string" || typeof line.en !== "string") return null;
  const fr = checkLine(line.fr, "fr", opts);
  const en = checkLine(line.en, "en", opts);
  return fr && en ? { fr, en } : null;
}

/* ------------------------------------------------------------------ */
/* Le recueil                                                           */
/* ------------------------------------------------------------------ */

type Vars = Partial<Record<"club" | "lang" | "key" | "years" | "s", Fact>>;
interface Hook {
  key: string;
  vars: Vars;
}

const same = (s: string): Fact => ({ fr: s, en: s });
const FOUNDED = /(?<!no company )\bfounded\b/i;

/** Les faits publics de la fiche qui ouvrent une phrase du recueil : l'employeur affiché, l'arme, les années, les chefs, les trouvailles. */
export function lineHooks(card: Pick<CardData, "club" | "mainLanguage" | "statuses" | "findings" | "grid" | "source" | "login" | "pieces">): Hook[] {
  const hooks: Hook[] = [];
  const has = (key: string) => (TAILS[key]?.length ?? 0) > 0;
  const club = card.club?.trim();
  if (club && club.length <= 24) hooks.push({ key: "club", vars: { club: same(club) } });
  const lang = card.mainLanguage ? langTitle(card.mainLanguage) : "";
  if (lang && lang.length <= 16) hooks.push({ key: "lang", vars: { lang: same(lang) } });
  const sen = card.grid?.seniority;
  if (sen) {
    const years = Math.floor(sen.months / 12);
    if (sen.code === "student") hooks.push({ key: "seniority:student", vars: {} });
    else if (years >= 1 && years < 3) hooks.push({ key: "seniority:junior", vars: { years: same(String(years)), s: same(years > 1 ? "s" : "") } });
    else if (years >= 3 && years < 60) hooks.push({ key: "years", vars: { years: same(String(years)) } });
  }
  const founded = card.grid?.criteria.some(
    (c) => (c.code === "EMP" || c.code === "OWN") && [c.reached.en, c.evidence?.publicText?.en ?? c.evidence?.text.en ?? ""].some((t) => FOUNDED.test(t)),
  );
  if (founded) hooks.push({ key: "founder", vars: {} });
  if (card.source === "cv" && !card.login && !card.pieces?.includes("github")) hooks.push({ key: "no_github", vars: {} });
  for (const st of card.statuses ?? []) if (has(`status:${st.id}`)) hooks.push({ key: `status:${st.id}`, vars: {} });
  for (const fd of card.findings ?? []) {
    const k = `finding:${fd.kind}`;
    if (!has(k)) continue;
    if (TAILS[k]!.some((t) => t.fr.includes("{key}")) && !fd.key) continue;
    hooks.push({ key: k, vars: fd.key ? { key: { fr: fd.key.fr, en: fd.key.en } } : {} });
  }
  return hooks;
}

const fill = (tpl: string, vars: Vars, lang: Lang): string => tpl.replace(/\{(\w+)\}/g, (_, k: keyof Vars) => vars[k]?.[lang] ?? "");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function compose(lead: Fact, tail: Fact, vars: Vars): Fact {
  const one = (lang: Lang) => {
    const t = fill(tail[lang], vars, lang);
    const s = lead[lang] ? `${lead[lang]} ${t}` : cap(t);
    return lang === "fr" ? frTypo(s) : s;
  };
  return { fr: one("fr"), en: one("en") };
}

type Candidate = { tail: Fact; vars: Vars };

/** Les suites possibles d'une fiche : celles de ses faits d'abord, puis celles de son profil, de son poste et les communes. */
export function candidates(card: Pick<CardData, "position" | "profile"> & Parameters<typeof lineHooks>[0]): { facts: Candidate[]; base: Candidate[] } {
  const facts = lineHooks(card).flatMap((h) => (TAILS[h.key] ?? []).map((tail) => ({ tail, vars: h.vars })));
  const base = [
    ...(card.profile ? TAILS[`profile:${card.profile.id}`] ?? [] : []),
    ...(TAILS[`position:${card.position}`] ?? []),
    ...TAILS.generic!,
  ].map((tail) => ({ tail, vars: {} }));
  return { facts, base };
}

/**
 * La phrase de repli d'une fiche : une suite tirée par le hachage de son id (celles
 * de ses faits quatre fois sur cinq quand elle en a), un en-tête tiré à part. Si le
 * tout ne passe pas le contrôle (place sur la fiche comprise), la même suite sans
 * en-tête, puis la suivante.
 */
export function fallbackLine(card: Pick<CardData, "id"> & Parameters<typeof candidates>[0]): Fact {
  const seed = card.id;
  const { facts, base } = candidates(card);
  const pool = facts.length && pick(seed, "pool", 5) !== 0 ? facts : [...facts, ...base];
  const lead = LEADS[pick(seed, "lead", LEADS.length)]!;
  const start = pick(seed, "tail", pool.length);
  const none: Fact = { fr: "", en: "" };
  for (let i = 0; i < pool.length; i++) {
    const c = pool[(start + i) % pool.length]!;
    for (const l of [lead, none]) {
      // Le contrôle vaut aussi pour le recueil : un fait de la fiche (un nom de langage, d'employeur) ne passe pas tout seul.
      const line = checkLineFact(compose(l, c.tail, c.vars));
      if (line) return line;
    }
  }
  return compose(none, TAILS.generic![0]!, {});
}

/** La phrase que la fiche montre : celle de l'IA si elle passe encore le contrôle, sinon celle du recueil. */
export function cardLine(card: Pick<CardData, "id"> & Parameters<typeof candidates>[0]): Fact {
  return checkLineFact(card.profile?.line) ?? fallbackLine(card);
}

/** Le profil tel que la fiche le montre : un de ses noms, sa phrase à elle. Inchangé pour un id hors du recueil. */
export function personalProfile(card: Pick<CardData, "id"> & Parameters<typeof candidates>[0]): CardProfile | undefined {
  const p = card.profile;
  if (!p || !aliasesOf(p.id).length) return p;
  return { ...p, label: aliasFor(p.id, card.id)!, tagline: cardLine(card) };
}
