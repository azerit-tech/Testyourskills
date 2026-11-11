// La page partagée (rapport « jugé comme par un recruteur », §6 ; SPEC §18.37) :
// ce qu'une personne qui n'est pas la personne fichée reçoit de sa grille. Pur,
// appliqué par le serveur à la réponse de GET /api/card/:id (rien de privé ne
// part sur le réseau) et par le front à la vue partagée (mêmes règles en démo).
//
// - L'école est gardée pour la personne : sa note ne se montre que si elle a
//   fait monter la note (comptée dans la moyenne), jamais son rang ni son nom.
// - Les recoupements ne se montrent que positifs : « moins d'années de code
//   public », « sans trace publique », « aucune retrouvée » restent privés, comme
//   les chefs d'accusation de la grille (« Senior à confirmer », « PR entre
//   proches »…). Restent « Équipe encadrée » et « LinkedIn en dessous de la vérité ».
// - Une pièce lue sur LinkedIn ou le CV part dans sa version publique, sans nom
//   d'école ni d'employeur ; « ce qui manque » (il s'adresse à la personne) ne part pas.
// - Une fiche faite par un tiers (dénoncée) et pas encore revendiquée : pas de
//   grille du tout. Le jeu reste ; la grille s'ouvre quand la personne revendique.
// Idempotent : appliqué deux fois, le même résultat.

import type { CardData, ComparisonData, CriterionCode, Fact, Grid, GridCriterion } from "./types";

const f = (fr: string, en: string): Fact => ({ fr, en });

/** Ce que la page partagée dit de l'école, à la place du rang et du nom. */
export const SCHOOL_KEPT: Fact = f("Gardée pour la personne fichée.", "Kept for the person on file.");

/** Les critères dont la pièce lue sur LinkedIn ou le CV peut nommer une école ou un employeur. */
const NAMED: CriterionCode[] = ["EDU", "XP", "EMP", "OWN"];

/** Les chefs d'accusation qui jouent pour la personne : les seuls montrés en public. */
const POSITIVE_FLAG = /^(?:Équipe encadrée|Team led)|en dessous de la vérité|undersells the code/;

/** Les recoupements négatifs, en fin de pièce (server/src/scoring/grid.ts, xpCrossCheck et stkCrossCheck). */
const XP_LESS = { fr: "Moins d'années de code public que de métier compté.", en: "Fewer years of public code than counted work." };
const STK_NONE = { fr: "Aucune retrouvée dans le code.", en: "None found in the code." };
const STK_ABSENT = { fr: /\s*Sans trace publique\s?:\s.*$/, en: /\s*No public trace:\s.*$/ };
/** Où commence la partie GitHub d'une pièce d'expérience recoupée : la dernière « GitHub : ». */
const XP_GITHUB = /\sGitHub\s?:\s/g;

const mapFact = (x: Fact, fn: (s: string, lang: "fr" | "en") => string): Fact => f(fn(x.fr, "fr"), fn(x.en, "en"));

/** Un chef d'accusation réduit à son nom (« Équipe encadrée : « … » » → « Équipe encadrée »). */
const flagName = (s: string): string => {
  const i = s.search(/\s?:\s/);
  return (i > 0 ? s.slice(0, i) : s).trim();
};

/** La pièce d'un critère, en public : la version sans nom, les recoupements négatifs retirés. Undefined : plus rien à montrer. */
function publicEvidence(c: GridCriterion): GridCriterion["evidence"] {
  const ev = c.evidence;
  if (!ev) return undefined;
  if (ev.source === "github") return ev;
  // Lue sur LinkedIn ou le CV : la version publique, ou rien (fiche d'avant, le front retombe sur le niveau).
  const pub = ev.publicText;
  if (!pub && NAMED.includes(c.code)) return undefined;
  let text = pub ?? ev.text;
  let source = ev.source;
  let proof = ev.proof;
  if (c.code === "XP" && text.fr.includes(XP_LESS.fr)) {
    // Moins d'années de code public : la pièce redevient celle de LinkedIn, sans le face-à-face.
    text = mapFact(text, (s) => {
      const i = [...s.matchAll(XP_GITHUB)].pop()?.index ?? -1;
      return (i > 0 ? s.slice(0, i) : s).trim();
    });
    source = "linkedin";
    proof = undefined;
  }
  if (c.code === "STK") {
    if (text.fr.includes(STK_NONE.fr)) return undefined;
    text = mapFact(text, (s, l) => s.replace(STK_ABSENT[l], "").trim());
  }
  return { text, publicText: text, source, ...(proof ? { proof } : {}) };
}

/** Un critère, en public. */
function publicCriterion(c: GridCriterion): GridCriterion {
  const { next: _next, evidence: _ev, ...rest } = c;
  // Réduits à leur nom : la suite cite parfois le texte de la personne (« chez Banque Orsay »).
  const flags = c.flags.filter((x) => POSITIVE_FLAG.test(x.fr) || POSITIVE_FLAG.test(x.en)).map((x) => mapFact(x, flagName));
  if (c.code === "EDU" && c.source !== "github") {
    // L'école : sa note seulement si elle a fait monter la note, jamais son rang ni son nom.
    const counted = c.counted && c.score !== null;
    const { declared: _d, proven: _p, ...edu } = rest;
    return counted
      ? { ...edu, reached: SCHOOL_KEPT, flags }
      : { ...edu, score: null, counted: false, reached: SCHOOL_KEPT, flags, private: true };
  }
  const evidence = publicEvidence(c);
  // Le niveau atteint d'un parcours lu sur LinkedIn peut nommer un employeur : le front montre la table à la place.
  const named = NAMED.includes(c.code) && c.code !== "XP" && c.source !== "github" && c.score !== null;
  return { ...rest, ...(named ? { reached: f("", "") } : {}), flags, ...(evidence ? { evidence } : {}) };
}

/** La grille en public. */
export function publicGrid(grid: Grid): Grid {
  return { ...grid, criteria: grid.criteria.map(publicCriterion) };
}

export interface ViewOpts {
  /** Fiche faite par un tiers (dénoncée) et pas encore revendiquée : pas de grille. */
  thirdParty: boolean;
}

function publicCard(card: CardData, o: ViewOpts): CardData {
  if (!card.grid) return card;
  const { grid, ...rest } = card;
  if (!o.thirdParty) return { ...rest, grid: publicGrid(grid) };
  // Un dossier vide fait par un tiers : la note plancher (20) ne se dit pas, elle jugerait sans pièce.
  return grid.rule === "empty_file" ? { ...rest, sealed: true } : rest;
}

/** Ce que reçoit quelqu'un qui n'est pas la personne fichée. */
export function publicView<T extends CardData | ComparisonData>(data: T, o: ViewOpts): T {
  if ("cv" in data && "github" in data) {
    const cmp = data as ComparisonData;
    const { grid, ...rest } = cmp;
    const out: ComparisonData = { ...rest, cv: publicCard(cmp.cv, o), github: publicCard(cmp.github, o) };
    if (grid && !o.thirdParty) out.grid = publicGrid(grid);
    return out as T;
  }
  return publicCard(data as CardData, o) as T;
}
