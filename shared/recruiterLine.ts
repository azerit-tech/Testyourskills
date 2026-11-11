// La ligne du recruteur et l'ordre des huit tuiles (rapport « jugé comme par un
// recruteur », §3 ; docs/bareme-recrutement.md §6) : ce qu'un recruteur dit en
// cinq secondes, écrit par gabarit depuis la grille de la fiche. Aucun texte
// libre, aucune IA : la spécialité, le langage, les années comptées, le point
// fort (la note la plus haute) et le point à creuser (la plus basse parmi les
// critères notés, jamais l'école ni l'open source), ou « À prouver » quand un
// critère n'a pas encore de pièce. Pur : partagé par le front (sous la fiche)
// et le texte de partage (« Point fort »), testé sans navigateur.

import { t as cardT } from "./card/i18n";
import { langTitle } from "./card/languages";
import { FORMULA_ORDER, GRID_WEIGHTS, usableGrid } from "./gridText";
import type { CardData, CriterionCode, Grid, GridCriterion, Lang } from "./types";

/** L'ordre du recruteur : le métier et les années, où, la stack, le code, puis le reste. */
export const RECRUITER_ORDER: CriterionCode[] = ["XP", "EMP", "STK", "CODE", "OWN", "ACT", "EDU", "OSS"];

/** Ce qui ne fait jamais un « à creuser » : ces deux critères ne baissent jamais la note (§4, règle 2). */
const NEVER_DIG: CriterionCode[] = ["EDU", "OSS"];
/** Ce qui ne fait pas un point fort : l'école se garde pour la personne (page partagée, texte de partage). */
const NEVER_STRONG: CriterionCode[] = ["EDU"];
/** Sous ce seuil, une note n'est pas un point fort. */
const STRONG_MIN = 5;
/** Au-dessus, une note n'est pas « à creuser » : un 7 n'inquiète pas un recruteur. */
const DIG_MAX = 6;

const noted = (c: GridCriterion | undefined): c is GridCriterion & { score: number } => !!c && c.score !== null;

/**
 * Les tuiles : les critères notés dans l'ordre du recruteur, puis ceux sans note
 * (« Pas encore au dossier »). L'école gardée pour la personne (page partagée)
 * reste à sa place parmi les notés : elle est au dossier, elle ne se montre pas.
 */
export function tileOrder(grid: Grid): { scored: GridCriterion[]; pending: GridCriterion[] } {
  const byCode = new Map(grid.criteria.map((c) => [c.code, c]));
  const all = RECRUITER_ORDER.map((code) => byCode.get(code)).filter((c): c is GridCriterion => !!c);
  const on = (c: GridCriterion) => c.score !== null || !!c.private;
  return { scored: all.filter(on), pending: all.filter((c) => !on(c)) };
}

/** La note la plus haute (5 et plus), jamais l'école ; à égalité, le plus lourd coefficient, puis l'ordre du recruteur. */
export function strongPoint(grid: Grid): (GridCriterion & { score: number }) | null {
  const ranked = RECRUITER_ORDER.map((code) => grid.criteria.find((c) => c.code === code))
    .filter(noted)
    .filter((c) => !NEVER_STRONG.includes(c.code) && c.score >= STRONG_MIN)
    .sort((a, b) => b.score - a.score || GRID_WEIGHTS[b.code] - GRID_WEIGHTS[a.code] || RECRUITER_ORDER.indexOf(a.code) - RECRUITER_ORDER.indexOf(b.code));
  return ranked[0] ?? null;
}

export type Dig =
  | { kind: "prove"; code: CriterionCode }
  | { kind: "dig"; code: CriterionCode; score: number }
  /** Rien à creuser : la note la plus basse (hors école et open source), pour « rien sous n/10 ». */
  | { kind: "even"; floor: number };

/**
 * Le point à creuser. D'abord un critère sans pièce (sans note), le plus lourd
 * d'abord (le code avant tout) : « À prouver : le code. » Sinon la note la plus
 * basse parmi les critères notés, si elle vaut 6 ou moins et reste strictement
 * sous le point fort ; à égalité, l'ordre du recruteur. Jamais l'école ni l'open
 * source. Sinon le dossier est régulier : « rien sous n/10 », n la note la plus basse.
 */
export function digPoint(grid: Grid, strong = strongPoint(grid)): Dig | null {
  const byCode = new Map(grid.criteria.map((c) => [c.code, c]));
  const open = FORMULA_ORDER.filter((code) => !NEVER_DIG.includes(code)).find((code) => {
    const c = byCode.get(code);
    return !!c && c.score === null;
  });
  if (open) return { kind: "prove", code: open };
  const marked = RECRUITER_ORDER.map((code) => byCode.get(code))
    .filter(noted)
    .filter((c) => !NEVER_DIG.includes(c.code));
  const low = marked
    .filter((c) => c.code !== strong?.code && c.score <= DIG_MAX && (!strong || c.score < strong.score))
    .sort((a, b) => a.score - b.score || RECRUITER_ORDER.indexOf(a.code) - RECRUITER_ORDER.indexOf(b.code))[0];
  if (low) return { kind: "dig", code: low.code, score: low.score };
  // Régulier : un point fort, au moins deux notes, et aucune sous 7. Sinon (tout à
  // égalité sous 7), la ligne s'arrête au point fort.
  const floor = Math.min(...marked.map((c) => c.score));
  return strong && marked.length >= 2 && floor > DIG_MAX ? { kind: "even", floor } : null;
}

/** Les mots de la ligne, épicènes : rien ne s'accorde avec la personne. */
export const LINE_WORDS: Record<
  Lang,
  {
    /** Le nom d'un critère dans une phrase (« niveau du code »). */
    names: Record<CriterionCode, string>;
    /** Avec son article, après « À prouver : » (« le code »). */
    the: Record<CriterionCode, string>;
    strong: (name: string, score: number) => string;
    dig: (name: string) => string;
    prove: (the: string) => string;
    /** Rien à creuser : « Dossier régulier : rien sous 7/10. » */
    even: (floor: number) => string;
    /** Les années, du palier de la table d'expérience (docs/bareme-recrutement.md §3). */
    years: Record<number, string>;
    counted: (years: string, n: number) => string;
    estimated: (years: string) => string;
    claimed: (years: string) => string;
  }
> = {
  fr: {
    names: { EDU: "école", XP: "expérience", EMP: "parcours", STK: "stack", CODE: "niveau du code", ACT: "activité", OWN: "ownership", OSS: "open source" },
    the: { EDU: "l'école", XP: "l'expérience", EMP: "le parcours", STK: "la stack", CODE: "le code", ACT: "l'activité", OWN: "l'ownership", OSS: "l'open source" },
    strong: (name, score) => `Point fort\u00a0: ${name}, ${score}/10.`,
    dig: (name) => `À creuser\u00a0: ${name}.`,
    prove: (the) => `À prouver\u00a0: ${the}.`,
    even: (floor) => `Dossier régulier\u00a0: rien sous ${floor}/10.`,
    years: { 10: "10\u00a0ans et plus", 9: "8 ou 9\u00a0ans", 8: "6 ou 7\u00a0ans", 7: "5\u00a0ans", 6: "4\u00a0ans", 5: "3\u00a0ans", 4: "2\u00a0ans", 3: "1\u00a0an", 2: "moins d'un an" },
    counted: (years, score) => `${years} ${score <= 3 ? "compté" : "comptés"}`,
    estimated: (years) => `${years} estimés sur GitHub`,
    claimed: (years) => `${years} affirmés`,
  },
  en: {
    names: { EDU: "school", XP: "experience", EMP: "career path", STK: "stack", CODE: "code level", ACT: "activity", OWN: "ownership", OSS: "open source" },
    the: { EDU: "school", XP: "experience", EMP: "the career path", STK: "the stack", CODE: "the code", ACT: "activity", OWN: "ownership", OSS: "open source" },
    strong: (name, score) => `Strong point: ${name}, ${score}/10.`,
    dig: (name) => `To dig into: ${name}.`,
    prove: (the) => `Yet to prove: ${the}.`,
    even: (floor) => `Even file: nothing under ${floor}/10.`,
    years: { 10: "10+ years", 9: "8 or 9 years", 8: "6 or 7 years", 7: "5 years", 6: "4 years", 5: "3 years", 4: "2 years", 3: "1 year", 2: "under a year" },
    counted: (years) => `${years} counted`,
    estimated: (years) => `${years} estimated from GitHub`,
    claimed: (years) => `${years} claimed`,
  },
};

/** « 5 ans comptés », « 4 ans estimés sur GitHub », « 3 ans affirmés » ; null sans note d'expérience. */
export function yearsText(grid: Grid, lang: Lang): string | null {
  const xp = grid.criteria.find((c) => c.code === "XP");
  if (!noted(xp)) return null;
  const w = LINE_WORDS[lang];
  const y = w.years[Math.max(2, Math.min(10, xp.score))];
  if (!y) return null;
  if (xp.state === "declared") return w.claimed(y);
  if (xp.source === "github") return w.estimated(y);
  return w.counted(y, xp.score);
}

export interface RecruiterRead {
  /** « Full-stack TypeScript, 5 ans comptés. » */
  head: string;
  strong: string | null;
  dig: string | null;
  /** La ligne entière. */
  text: string;
}

/**
 * La ligne du recruteur : « Full-stack TypeScript, 5 ans comptés. Point fort :
 * niveau du code, 8/10. À creuser : ownership. » Le métier et le langage
 * viennent de la fiche (la fiche GitHub pour une comparaison), le reste de la
 * grille (celle du dossier pour une comparaison). Null sans grille utilisable.
 */
export function recruiterRead(card: Pick<CardData, "position" | "mainLanguage">, grid: Grid | undefined | null, lang: Lang): RecruiterRead | null {
  if (!usableGrid(grid)) return null;
  const w = LINE_WORDS[lang];
  const job = cardT(lang).positions[card.position] ?? card.position;
  const raw = card.mainLanguage ? langTitle(card.mainLanguage) : "";
  const tongue = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";
  const years = yearsText(grid, lang);
  const head = `${[job, tongue].filter(Boolean).join(" ")}${years ? `, ${years}` : ""}.`;
  const s = strongPoint(grid);
  const strong = s ? w.strong(w.names[s.code], s.score) : null;
  const d = digPoint(grid, s);
  const dig = !d ? null : d.kind === "prove" ? w.prove(w.the[d.code]) : d.kind === "even" ? w.even(d.floor) : w.dig(w.names[d.code]);
  return { head, strong, dig, text: [head, strong, dig].filter(Boolean).join(" ") };
}
