// Les textes du HUD de la plongée (SPEC §17.4), en français et en anglais.
// Ils vivent ici, avec la scène, plutôt que dans web/src/i18n.ts.
import type { Lang, Stars } from "../../../shared/types";
import { LEVEL_LABELS } from "../../../shared/types";

export interface HudTexts {
  /** Les quatre lignes, dans l'ordre : spécialité, arme, dossier, affiliation. */
  specialty: string;
  weapon: string;
  file: string;
  affiliation: string;
  /** Valeurs du dossier. */
  fileGithub: string;
  fileCv: string;
  fileBoth: string;
  /** Sans employeur. */
  loneWolf: string;
  /** Sans langage reconnu. */
  polyglot: string;
  /** Préfixe des messages radio. */
  dispatch: string;
  /** Sous le titre du carton de fin. */
  score: string;
  /** Le carton de fin, par niveau. */
  level: (stars: Stars) => string;
}

export const HUD_TEXTS: Record<Lang, HudTexts> = {
  fr: {
    specialty: "Spécialité",
    weapon: "Arme",
    file: "Dossier",
    affiliation: "Affiliation",
    fileGithub: "GitHub",
    fileCv: "CV",
    fileBoth: "GitHub × CV",
    loneWolf: "Loup solitaire",
    polyglot: "Polyglotte",
    dispatch: "Central",
    score: "Note",
    level: (s) => LEVEL_LABELS[s].fr,
  },
  en: {
    specialty: "Specialty",
    weapon: "Weapon",
    file: "File",
    affiliation: "Affiliation",
    fileGithub: "GitHub",
    fileCv: "CV",
    fileBoth: "GitHub × CV",
    loneWolf: "Lone wolf",
    polyglot: "Polyglot",
    dispatch: "Dispatch",
    score: "Rating",
    level: (s) => LEVEL_LABELS[s].en,
  },
};
