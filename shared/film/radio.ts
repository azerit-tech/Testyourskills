// La radio de la poursuite (§18.33) : une ligne par étoile, qui cite les faits
// de la fiche, dans l'ordre des quatre lignes du dossier de la révélation 3D
// (spécialité, arme, affiliation : web/src/three/hudTexts.ts et reveal.tells),
// plus le chef d'accusation, le profil et le niveau. Sans DOM ni Three.js :
// mêmes libellés que la fiche (shared/card/i18n.ts). Épicène : rien ne
// s'accorde avec la personne (« véhicule », « profil », « unités »).
//
// Chaque ligne est faite d'une étiquette et d'un texte (`FilmLine`), le gabarit
// du bloc posé sous la berline : « Véhicule en fuite », puis « Backend ». Le
// chef d'accusation garde son libellé tel quel (« Commits : fix, fix2, final
// fix »). Ni interception ni fin de course à l'écran : la jauge de l'étoile
// suivante et la ligne de l'étoile refusée, au gel, les remplacent.
//
// C'est le format que les pièces du parcours reprendront (une par étoile
// gagnée, tirées du barème) : une autre source pour `plan.lines`, le même
// bloc, les mêmes instants.
import type { CardData, Lang } from "../types";
import { LEVEL_LABELS } from "../types";
import { STRINGS } from "../card/i18n";
import { langTitle } from "../card/languages";

export type RadioCard = Pick<CardData, "overall" | "position" | "mainLanguage" | "club" | "statuses" | "profile">;

/** Une ligne du film : l'étiquette (22 signes au plus), puis le texte, sur une ligne (32 signes visés, cut.ts). */
export interface FilmLine {
  label: string;
  text: string;
}

const WORDS = {
  fr: {
    fleeing: "Véhicule en fuite",
    weapon: "Arme signalée",
    polyglot: "Polyglotte",
    charge: "Chef d'accusation",
    noCharge: "Lecture en cours",
    affiliation: "Affiliation",
    profile: "Profil identifié",
    noProfile: { label: "Profil", text: "Inconnu au fichier" },
    allUnits: "Toutes les unités",
  },
  en: {
    fleeing: "Vehicle fleeing",
    weapon: "Weapon reported",
    polyglot: "Polyglot",
    charge: "Charge",
    noCharge: "Still reading",
    affiliation: "Affiliation",
    profile: "Profile identified",
    noProfile: { label: "Profile", text: "Not on file" },
    allUnits: "All units",
  },
} satisfies Record<Lang, Record<string, unknown>>;

/** Les lignes de la radio d'une fiche, dans une langue : une par étoile, de la première à la sixième. */
export function radioLines(card: RadioCard, lang: Lang): FilmLine[] {
  const w = WORDS[lang];
  const s = STRINGS[lang];
  const charge = card.statuses.find((x) => x.tone === "negative") ?? card.statuses[0];
  return [
    { label: w.fleeing, text: s.positions[card.position] ?? card.position },
    { label: w.weapon, text: card.mainLanguage ? langTitle(card.mainLanguage) : w.polyglot },
    { label: w.charge, text: charge ? charge.label[lang] : w.noCharge },
    { label: w.affiliation, text: card.club ?? s.loneWolf },
    card.profile ? { label: w.profile, text: card.profile.label[lang] } : w.noProfile,
    { label: w.allUnits, text: LEVEL_LABELS[6][lang] },
  ];
}
