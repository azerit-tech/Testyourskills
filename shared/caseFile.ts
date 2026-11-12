// Un dossier, une fiche, une note (SPEC §18.36) : un dossier à deux pièces
// (LinkedIn ou CV, et GitHub) s'affiche comme une fiche seule. Cette fonction
// pure fabrique la fiche du dossier à la lecture, sans migration, à partir de ce
// qui est rangé : la page, le texte de partage, l'aperçu de lien et les images
// savent déjà montrer une fiche. Aucune soustraction, aucune phrase d'écart.
//
// - Base : la pièce GitHub quand le code est jugeable, sinon la pièce déclarative
//   (GitHub « dossier vide »). Peine, caution, preuves, métier et langage : ceux de la base.
// - Note, étoiles, palier et grille : ceux du dossier (sans grille rangée, ceux de la base).
// - Nom, pseudo et portrait : ceux de la pièce GitHub. Profil et sa phrase : toujours
//   ceux de la pièce GitHub (une façon de travailler vue en public).
// - Barre XP : celle de la pièce où la grille a pris l'expérience.
// - Employeur : la pièce déclarative d'abord, sinon GitHub.
// - Chefs d'accusation : ceux de la base, sans ton `gap` (ils étaient nés de l'écart) ;
//   s'il n'en reste aucun, « Casier vierge ». Une caution qui citait un chef retiré passe à la suivante.
// - Rang en centiles : retiré, il a été calculé pour une autre note.

import sentencesJson from "../data/sentences.json";
import statusesJson from "../data/statuses.json";
import { linkedinFact } from "./linkedinText";
import type { CardData, CardSentence, ComparisonData, Fact, Piece, Special, Stat, StatusInstance } from "./types";
import { declaredOf, tierFor } from "./types";

/** Les cautions par statut (data/sentences.json) : celles des statuts d'écart sont retirées. */
const BAIL = sentencesJson.bail as Record<string, Fact>;

/** « Casier vierge », le statut de repli du moteur (data/statuses.json) : une fiche n'a jamais zéro chef d'accusation. */
const CLEAN_RECORD: StatusInstance = (() => {
  const d = statusesJson.statuses.find((s) => s.source === "fallback")!;
  return { id: d.id, tone: "positive", label: { ...d.label }, rule: { ...d.ruleText } };
})();

export type { Piece };

/** « LinkedIn » ou « CV », selon ce que la pièce déclarative a lu (§18.24). */
export const declaredLabel = (cmp: Pick<ComparisonData, "declaredSource">): string => (declaredOf(cmp) === "linkedin" ? "LinkedIn" : "CV");

/** Le nom d'une pièce, tel qu'on l'écrit : « LinkedIn », « CV », « GitHub ». */
export const pieceLabel = (p: Piece): string => (p === "linkedin" ? "LinkedIn" : p === "cv" ? "CV" : "GitHub");

/** `["linkedin", "github"]` ou `["cv", "github"]`. */
export const piecesOf = (cmp: Pick<ComparisonData, "declaredSource">): Piece[] => [declaredOf(cmp), "github"];

/** Le code est jugeable : la pièce GitHub n'est ni un dossier vide, ni scellée (vue publique). */
const codeJudged = (cmp: Pick<ComparisonData, "github">): boolean => cmp.github.grid?.rule !== "empty_file" && !cmp.github.sealed;

/** La fiche du dossier, à la lecture : voir l'en-tête. */
export function caseCard(cmp: ComparisonData): CardData {
  const gh = cmp.github;
  const declared = cmp.cv;
  const base = codeJudged(cmp) ? gh : declared;
  const grid = cmp.grid ?? base.grid;
  const overall = cmp.grid ? cmp.grid.overall : base.overall;

  // La barre XP : celle de la pièce où la grille a pris l'expérience.
  const xpFrom = grid?.criteria.find((c) => c.code === "XP")?.source;
  const xpPiece = !grid ? base : xpFrom === "github" ? gh : declared;
  const xp = xpPiece.stats.find((s) => s.code === "XP");
  const stats: Stat[] = base.stats.map((s) => (s.code === "XP" && xp ? xp : s));

  // « Débarque en ville » ne tient plus quand l'expérience vient de la pièce déclarative.
  const fromDeclared = !!grid && xpFrom !== "github";
  const special: Special | undefined = gh.special === "wonderkid" && fromDeclared ? undefined : (gh.special ?? base.special);

  // Chefs d'accusation sans ton `gap` ; s'il n'en reste aucun, « Casier vierge », comme le moteur.
  const kept = base.statuses.filter((s) => s.tone !== "gap");
  const statuses = kept.length ? kept : [CLEAN_RECORD];
  // La caution citait le premier chef qui en a une : si c'était un statut d'écart retiré, la suivante, ou aucune.
  let sentence: CardSentence | undefined = base.sentence;
  if (sentence && kept.length !== base.statuses.length) {
    const charge = statuses.find((s) => BAIL[s.id]);
    const bail = charge ? (base.declaredSource === "linkedin" ? linkedinFact(BAIL[charge.id]) : { ...BAIL[charge.id] }) : undefined;
    sentence = { label: sentence.label, ...(bail ? { bail } : {}) };
  }

  const { rank: _rank, deleteToken: _token, special: _special, grid: _grid, sealed: _sealed, sentence: _sentence, ...rest } = base;
  const avatar = gh.avatarUrl ? gh : declared;
  return {
    ...rest,
    id: cmp.id,
    createdAt: cmp.createdAt,
    name: gh.name,
    ...(gh.login ? { login: gh.login } : {}),
    initials: gh.initials,
    ...(avatar.avatarUrl ? { avatarUrl: avatar.avatarUrl } : {}),
    ...(avatar.photoSource ? { photoSource: avatar.photoSource } : {}),
    overall,
    tier: tierFor(overall),
    ...(special ? { special } : {}),
    club: declared.club ?? gh.club ?? null,
    stats,
    statuses,
    ...(sentence ? { sentence } : {}),
    ...(gh.profile ? { profile: gh.profile } : {}),
    ...(gh.findings?.length ? { findings: gh.findings } : base.findings?.length ? { findings: base.findings } : {}),
    ...(grid ? { grid } : {}),
    pieces: piecesOf(cmp),
  };
}

/** La fiche d'un dossier : celle que le serveur a attachée (vue publique), sinon calculée. */
export const fileOf = (cmp: ComparisonData): CardData => cmp.file ?? caseCard(cmp);
