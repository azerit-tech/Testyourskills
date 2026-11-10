// La radio de la poursuite (§18.33) : une ligne par étoile, qui cite les faits
// de la fiche, dans l'ordre des quatre lignes du dossier de la révélation 3D
// (spécialité, arme, affiliation : web/src/three/hudTexts.ts et reveal.tells),
// plus le chef d'accusation, le profil et le niveau. Sans DOM ni Three.js :
// mêmes libellés que la fiche (shared/card/i18n.ts). Épicène : rien ne
// s'accorde avec la personne (« véhicule », « profil », « unités »).
import type { CardData, Lang } from "../types";
import { LEVEL_LABELS, starsFor } from "../types";
import { STRINGS } from "../card/i18n";
import { langTitle } from "../card/languages";

export type RadioCard = Pick<CardData, "overall" | "position" | "mainLanguage" | "club" | "statuses" | "profile">;

const WORDS = {
  fr: {
    fleeing: (pos: string) => `Véhicule en fuite · ${pos}`,
    weapon: (w: string) => `Arme signalée : ${w}`,
    polyglot: "polyglotte",
    charge: (c: string) => `Motif : ${c}`,
    noCharge: "Motif : en cours de lecture",
    affiliation: (a: string) => `Affiliation : ${a}`,
    profile: (p: string) => `Profil identifié : ${p}`,
    noProfile: "Profil : inconnu au fichier",
    allUnits: (l: string) => `Toutes les unités · ${l}`,
    end: (l: string) => `Fin de course · ${l}`,
  },
  en: {
    fleeing: (pos: string) => `Vehicle fleeing · ${pos}`,
    weapon: (w: string) => `Weapon reported: ${w}`,
    polyglot: "polyglot",
    charge: (c: string) => `Charge: ${c}`,
    noCharge: "Charge: under review",
    affiliation: (a: string) => `Affiliation: ${a}`,
    profile: (p: string) => `Profile identified: ${p}`,
    noProfile: "Profile: not on file",
    allUnits: (l: string) => `All units · ${l}`,
    end: (l: string) => `End of the line · ${l}`,
  },
} satisfies Record<Lang, Record<string, unknown>>;

export interface Radio {
  /** Une ligne par étoile, de la première à la sixième. */
  beats: string[];
  /** La ligne de la fin, quand la voiture freine : le niveau atteint. */
  end: string;
}

/** Les lignes de la radio d'une fiche, dans une langue. */
export function radioLines(card: RadioCard, lang: Lang): Radio {
  const w = WORDS[lang];
  const s = STRINGS[lang];
  const level = LEVEL_LABELS[starsFor(card.overall)][lang];
  const weapon = card.mainLanguage ? langTitle(card.mainLanguage) : w.polyglot;
  const charge = card.statuses.find((x) => x.tone === "negative") ?? card.statuses[0];
  return {
    beats: [
      w.fleeing(s.positions[card.position] ?? card.position),
      w.weapon(weapon),
      charge ? w.charge(charge.label[lang]) : w.noCharge,
      w.affiliation(card.club ?? s.loneWolf),
      card.profile ? w.profile(card.profile.label[lang]) : w.noProfile,
      w.allUnits(LEVEL_LABELS[6][lang]),
    ],
    end: w.end(level),
  };
}
