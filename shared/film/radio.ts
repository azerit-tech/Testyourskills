// La radio de la poursuite (§18.33) : une ligne par étoile, qui cite les faits
// de la fiche, dans l'ordre des quatre lignes du dossier de la révélation 3D
// (spécialité, arme, affiliation : web/src/three/hudTexts.ts et reveal.tells),
// plus le chef d'accusation, le profil et le niveau. Sans DOM ni Three.js :
// mêmes libellés que la fiche (shared/card/i18n.ts). Épicène : rien ne
// s'accorde avec la personne (« véhicule », « profil », « unités »).
// Un seul séparateur, les deux-points (§18.48). Le chef d'accusation garde son
// libellé tel quel (« Commits : fix, fix2, final fix ») : son étiquette se pose
// au-dessus de la ligne (`kickers`), jamais devant, pour ne pas doubler les
// deux-points. La fin de course ne répète pas le niveau, écrit en grand au gel.
import type { CardData, Lang } from "../types";
import { LEVEL_LABELS } from "../types";
import { STRINGS } from "../card/i18n";
import { langTitle } from "../card/languages";

export type RadioCard = Pick<CardData, "overall" | "position" | "mainLanguage" | "club" | "statuses" | "profile">;

/** L'espace insécable avant les deux-points, en français. */
const NB = " ";

const WORDS = {
  fr: {
    fleeing: (pos: string) => `Véhicule en fuite${NB}: ${pos}`,
    weapon: (w: string) => `Arme signalée${NB}: ${w}`,
    polyglot: "polyglotte",
    charge: "Chef d'accusation",
    noCharge: "Lecture en cours",
    affiliation: (a: string) => `Affiliation${NB}: ${a}`,
    profile: (p: string) => `Profil identifié${NB}: ${p}`,
    noProfile: `Profil${NB}: inconnu au fichier`,
    allUnits: (l: string) => `Toutes les unités${NB}: ${l}`,
    intercept: `Interception${NB}: barrage en place`,
    end: `Fin de course${NB}: dossier ouvert`,
  },
  en: {
    fleeing: (pos: string) => `Vehicle fleeing: ${pos}`,
    weapon: (w: string) => `Weapon reported: ${w}`,
    polyglot: "polyglot",
    charge: "Charge",
    noCharge: "Still reading",
    affiliation: (a: string) => `Affiliation: ${a}`,
    profile: (p: string) => `Profile identified: ${p}`,
    noProfile: "Profile: not on file",
    allUnits: (l: string) => `All units: ${l}`,
    intercept: "Intercept: roadblock in place",
    end: "End of the line: file opened",
  },
} satisfies Record<Lang, Record<string, unknown>>;

export interface Radio {
  /** Une ligne par étoile, de la première à la sixième. */
  beats: string[];
  /** L'étiquette posée au-dessus de chaque ligne, ou null : seul le chef d'accusation en porte une. */
  kickers: (string | null)[];
  /** L'interception, juste avant la coupe vers la fin (une à cinq étoiles, §18.39). */
  intercept: string;
  /** La ligne du gel : la course est finie, le dossier s'ouvre (le niveau est déjà écrit en grand). */
  end: string;
}

/** Les lignes de la radio d'une fiche, dans une langue. */
export function radioLines(card: RadioCard, lang: Lang): Radio {
  const w = WORDS[lang];
  const s = STRINGS[lang];
  const weapon = card.mainLanguage ? langTitle(card.mainLanguage) : w.polyglot;
  const charge = card.statuses.find((x) => x.tone === "negative") ?? card.statuses[0];
  return {
    beats: [
      w.fleeing(s.positions[card.position] ?? card.position),
      w.weapon(weapon),
      charge ? charge.label[lang] : w.noCharge,
      w.affiliation(card.club ?? s.loneWolf),
      card.profile ? w.profile(card.profile.label[lang]) : w.noProfile,
      w.allUnits(LEVEL_LABELS[6][lang]),
    ],
    kickers: [null, null, w.charge, null, null, null],
    intercept: w.intercept,
    end: w.end,
  };
}
