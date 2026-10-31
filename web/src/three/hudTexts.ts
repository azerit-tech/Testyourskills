// Les textes du HUD de la révélation (SPEC §17.4), en français et en anglais.
// Les libellés des quatre lignes du dossier viennent de web/src/i18n.ts
// (reveal.tells, partagés avec les révélations chromées) ; ici, le préfixe des
// messages radio et le mot sous la note du carton de fin.
import type { Lang } from "../../../shared/types";

export interface HudTexts {
  /** Les quatre lignes, dans l'ordre : spécialité, arme, dossier, affiliation. */
  specialty: string;
  weapon: string;
  file: string;
  affiliation: string;
  /** Préfixe des messages radio. */
  dispatch: string;
  /** Sous le titre du carton de fin. */
  score: string;
}

export const HUD_TEXTS: Record<Lang, Pick<HudTexts, "dispatch" | "score">> = {
  fr: { dispatch: "Central", score: "Note" },
  en: { dispatch: "Dispatch", score: "Rating" },
};
