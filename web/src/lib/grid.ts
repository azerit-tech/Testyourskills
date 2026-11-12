// Ce que le bloc « Voici comment un recruteur d'Azerit te lit » montre de
// chaque critère (docs/bareme-recrutement.md §3, §4, §6 ; SPEC §18.37) : ses
// étiquettes d'état, l'étiquette de sa pièce, la ligne de la note finale, la
// pièce où la note a été lue, et la version de la page partagée, sans nom d'école ni
// d'ancien employeur (question 5 du barème). Pur : testé sans navigateur.

import { dec, excludedWhy, gridMath, GRID_WEIGHTS } from "../../../shared/gridText";
import type { CriterionCode, DeclaredSource, Grid, GridCriterion, GridSource, Lang } from "../../../shared/types";
import type { Dict } from "../i18n";

type G = Dict["grid"];
type PickFn = (f: { fr: string; en: string } | undefined | null) => string;

export type Tag = keyof G["tags"];

/**
 * Les étiquettes d'un critère, lisibles sans la couleur : « déclaré, non
 * prouvé », « non prouvé », « non renseigné », « estimée » (l'expérience lue
 * sur GitHub), « hors moyenne » (l'école ou l'open source sous la moyenne des
 * autres). Un critère noté sur sa source de preuve n'en a aucune (§3).
 */
export function stateTags(c: GridCriterion, grid?: Pick<Grid, "rule">): Tag[] {
  // Page partagée : l'école hors moyenne est gardée pour la personne fichée (shared/publicView.ts).
  if (c.private) return ["private"];
  const tags: Tag[] = [];
  if (c.state === "declared") tags.push("declared");
  if (c.state === "unproven" || (c.score === null && c.state !== "missing")) tags.push("unproven");
  if (c.state === "missing") tags.push("missing");
  if (c.code === "XP" && c.state === "scored" && c.source === "github") tags.push("estimated");
  const why = excludedWhy(c);
  if (why === "below" && grid?.rule !== "empty_file") tags.push("below");
  // Dossier vide : rien n'entre dans la moyenne, la note plancher s'applique (§4, règle 4).
  if (why === "unproven" || why === "missing" || (why === "below" && grid?.rule === "empty_file")) tags.push("out");
  return tags;
}

/** Le nom d'un dépôt dans une preuve GitHub (« https://github.com/x/sequence-mail/blob/… » → « sequence-mail »). */
export function repoOf(proof: string | undefined): string | null {
  const m = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)/.exec(proof ?? "");
  if (!m || m[1] === "search" || m[1] === "orgs") return null;
  return m[2];
}

/** Une preuve qu'on peut ouvrir : une page publique de GitHub ou de LinkedIn, rien d'autre. */
export function safeHref(proof: string | undefined): string | null {
  return proof && /^https:\/\/(github\.com|www\.linkedin\.com)\//.test(proof) ? proof : null;
}

/** La source affichée d'une pièce : ce qui déclare porte son nom (« LinkedIn » ou « CV »). */
const declaredWord = (g: G, declared: DeclaredSource) => (declared === "cv" ? g.source.cv : g.source.linkedin);

/**
 * L'étiquette de la pièce : « LinkedIn, postes datés », « GitHub, sequence-mail »,
 * « GitHub, calendrier », « recoupé ». Sans pièce : null.
 */
export function sourceLabel(c: GridCriterion, g: G, declared: DeclaredSource): string | null {
  const ev = c.evidence;
  if (!ev) return null;
  const src: GridSource = ev.source;
  if (src === "both") return g.source.both;
  if (src === "linkedin") return g.sourceWith(declaredWord(g, declared), g.detailDeclared[c.code]);
  const repo = repoOf(ev.proof);
  return g.sourceWith(g.source.github, repo ?? g.detailGithub[c.code]);
}

/** Dans un dossier à deux pièces (§18.36), la pièce où la note du critère a été lue : « lu sur LinkedIn ». */
export function keptFrom(c: GridCriterion, g: G, declared: DeclaredSource): string {
  const k = g.compare.keptFrom;
  if (c.source === "both") return k.both;
  if (c.source === "github") return k.github;
  return declared === "cv" ? k.cv : k.linkedin;
}

// --- La table des niveaux -------------------------------------------------------

/** La table du critère : la table « déclarée » (arrêtée à 6) pour un critère déclaré, sinon la table de preuve. */
export function levelTable(c: GridCriterion, g: G): [number, string][] {
  return (c.state === "declared" && g.declaredLevels[c.code]) || g.levels[c.code];
}

/** L'indice du niveau atteint dans la table : la ligne la plus haute dont la note ne dépasse pas celle du critère. -1 sans note. */
export function reachedRow(c: GridCriterion, table: [number, string][]): number {
  if (c.score === null) return -1;
  return table.findIndex(([n]) => n <= c.score!);
}

// --- La page partagée -------------------------------------------------------------

/** Les critères dont la pièce, lue sur LinkedIn ou le CV, peut citer une école ou un employeur. */
const NAMED: CriterionCode[] = ["EDU", "XP", "EMP", "OWN"];

/** Un chef d'accusation réduit à son nom (« Senior à confirmer : « Lead dev », 1,1 an » → « Senior à confirmer »). */
export function flagName(text: string): string {
  const i = text.search(/\s?:\s/);
  return (i > 0 ? text.slice(0, i) : text).trim();
}

export interface RowText {
  /** La pièce en une phrase ; à défaut, le niveau atteint (critère sans pièce : non prouvé, non renseigné). */
  line: string;
  /** L'étiquette de la pièce (« LinkedIn, postes datés »), null sans pièce. */
  label: string | null;
  /** Le lien vers la page publique qui prouve, null s'il n'y en a pas ou s'il ne se montre pas. */
  href: string | null;
  /** Le niveau atteint en clair, quand il dit plus que la pièce. */
  reached: string | null;
  /** Ce qui manque pour le niveau suivant : pour la personne fichée seulement. */
  next: string | null;
  flags: string[];
  /** La pièce a été réduite pour la page partagée. */
  redacted: boolean;
}

/**
 * Le texte d'une ligne du bloc. `shared` : la page est vue par quelqu'un
 * d'autre que la personne fichée (question 5 du barème, par défaut) — pas de
 * nom d'école ni d'ancien employeur. Une pièce lue sur LinkedIn ou le CV, ou
 * recoupée, se montre dans sa version publique (`evidence.publicText`), que le
 * moteur écrit sans aucun nom : rien n'est masqué au mot près ici, donc rien ne
 * fuit quand la tournure du moteur change. Sur ces lignes : pas le niveau
 * atteint en clair (il peut nommer), les chefs d'accusation réduits à leur nom,
 * pas de lien vers LinkedIn, pas de « ce qui manque » (il s'adresse à la
 * personne fichée). Les pièces GitHub (dépôts publics, calendrier, PR) restent
 * entières. Une fiche d'avant, sans version publique, retombe sur ce qui ne
 * nomme personne : le rang de l'école, les années comptées, le niveau atteint.
 */
export function rowText(c: GridCriterion, opts: { g: G; pick: PickFn; declared: DeclaredSource; shared: boolean }): RowText {
  const { g, pick, declared, shared } = opts;
  const evSource: GridSource = c.evidence?.source ?? c.source;
  const label = sourceLabel(c, g, declared);
  const reachedText = pick(c.reached);
  const evidence = c.evidence ? pick(c.evidence.text) : "";
  const line = evidence || reachedText;
  const href = safeHref(c.evidence?.proof);
  const flags = c.flags.map((f) => pick(f)).filter(Boolean);
  const publicText = c.evidence?.publicText ? pick(c.evidence.publicText) : "";
  // L'école, ni son rang ni son nom : gardée pour la personne fichée (rapport du recruteur, §6).
  if (shared && c.code === "EDU" && evSource !== "github") {
    return { line: g.shared.school, label: null, href: null, reached: null, next: null, flags: [], redacted: true };
  }
  if (shared && evSource !== "github" && publicText) {
    return {
      line: publicText,
      label,
      href: href && href.startsWith("https://github.com/") ? href : null,
      reached: null,
      next: null,
      flags: flags.map(flagName),
      redacted: publicText !== evidence,
    };
  }
  if (!shared || evSource === "github" || !NAMED.includes(c.code)) {
    return {
      line,
      label,
      href: shared && href && !href.startsWith("https://github.com/") ? null : href,
      reached: reachedText && reachedText !== line ? reachedText : null,
      next: shared ? null : pick(c.next) || null,
      flags,
      redacted: false,
    };
  }
  // Page partagée, pièce lue sur LinkedIn ou le CV : rien qui nomme une école ou un employeur.
  const table = levelTable(c, g);
  const row = reachedRow(c, table);
  const level = row >= 0 ? table[row][1] : "";
  let safe: string;
  if (c.code === "XP") {
    // Le palier atteint, en années comptées : des chiffres, jamais un nom.
    safe = c.score === null ? g.shared.xpNone : reachedText;
  } else {
    safe = c.score === null ? reachedText : level;
  }
  return { line: safe, label, href: null, reached: null, next: null, flags: flags.map(flagName), redacted: true };
}

// --- La note finale -----------------------------------------------------------------

export interface FinalLines {
  /** « (Code 7 × 2 + Stack 6 × 1,5 + …) ÷ 8,5 », null pour un dossier vide. */
  formula: string | null;
  /** « = 5,65 sur 10, soit 57 sur 100 ». */
  result: string | null;
  /** Les critères hors moyenne, par raison. */
  out: string[];
  /** La règle qui a joué : plafond sans code prouvé, dossier vide. */
  rule: string | null;
  overall: number;
}

/**
 * La ligne finale : la note sur 100 tirée des huit critères, et la règle qui a
 * joué. Aucun « + n ». `unprovenCase` : la note du dossier face à un GitHub
 * « dossier vide » — la règle dit que le code n'est pas prouvé, sur quoi la
 * note se fait, et ce qui la changerait (les critères qu'un projet public ouvre).
 */
export function finalLines(grid: Grid, g: G, lang: Lang, unprovenCase?: { src: string; shared: boolean }): FinalLines {
  const m = gridMath(grid);
  const F = g.final;
  if (m.rule === "empty_file" || m.mean === null) {
    return { formula: null, result: null, out: [], rule: F.empty, overall: grid.overall };
  }
  const terms = m.terms.map((x) => F.term(g.names[x.code], x.score, dec(x.weight, lang))).join(" + ");
  const out: string[] = [];
  for (const why of ["unproven", "missing", "below"] as const) {
    const names = m.excluded.filter((x) => x.why === why).map((x) => g.names[x.code]);
    if (!names.length) continue;
    out.push(F.outList(F.out[why], names.join(", ")) + (why === "below" ? ` ${F.belowWhy}` : ""));
  }
  let rule = m.rule === "capped_unproven" ? (m.capHit ? F.cappedHit(m.raw!) : F.capped) : null;
  if (unprovenCase && m.rule === "capped_unproven") {
    const opens = F.opensList(m.excluded.filter((x) => x.why === "unproven").map((x) => g.names[x.code]));
    rule = (unprovenCase.shared ? F.caseUnprovenThem : F.caseUnproven)(unprovenCase.src, opens);
  }
  return {
    formula: F.formula(terms, dec(m.den, lang)),
    result: F.result(dec(m.mean, lang, 2)),
    out,
    rule,
    overall: grid.overall,
  };
}

export { GRID_WEIGHTS };
