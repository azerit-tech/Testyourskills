// Les textes du HUD de la révélation (SPEC §17.4, §18.18), en français et en
// anglais. Les libellés des quatre lignes du dossier viennent de web/src/i18n.ts
// (reveal.tells, partagés avec les révélations chromées) ; le mot du niveau, de
// LEVEL_LABELS (shared/types.ts), lu par Walkout3D. Ici : ce qui n'existe que
// sur le carton de fin, et les seuils des étoiles de la montée.
import type { Lang } from "../../../shared/types";

/**
 * Les étoiles de la montée (SPEC §18.18) : la note affichée allume une étoile à
 * chaque seuil franchi. Autant d'emplacements que de seuils. Doit rester
 * aligné sur `starsFor` de shared/types.ts (une étoile de plus à 30, 45, 60, 75
 * et 90) : à relier à une constante de shared/ si elle y apparaît.
 */
export const STAR_THRESHOLDS = [1, 30, 45, 60, 75, 90] as const;

export interface HudTexts {
  /** Les quatre lignes, dans l'ordre : spécialité, arme, dossier, affiliation. */
  specialty: string;
  weapon: string;
  file: string;
  affiliation: string;
  /**
   * Devant le profil criminel sur le carton de fin (§18.2). « Identifié »
   * s'accorde avec « profil », jamais avec la personne (§2.4).
   */
  suspect: string;
  /** Le bouton du carton de fin, qui passe directement à la fiche. */
  cta: string;
}

export const HUD_TEXTS: Record<Lang, Pick<HudTexts, "suspect" | "cta">> = {
  fr: { suspect: "Profil identifié :", cta: "Voir ma fiche" },
  en: { suspect: "Profile identified:", cta: "See my file" },
};
