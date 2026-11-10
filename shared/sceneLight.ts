// La lumière de chaque lieu du crime (§18.28, docs/brief-illustrations.md §4),
// partagée par la couverture de l'accueil (web/src/lib/cover.ts) et la
// poursuite (shared/chase), qui peint son ciel à la lumière du profil.

/** Les quatre lumières des décors (docs/brief-illustrations.md). */
export type Light = "pink" | "gold" | "night" | "dawn";

/** La lumière de chaque lieu du crime (web/public/profiles). */
export const SCENE_LIGHT: Record<string, Light> = {
  kingpin: "pink",
  hoarder: "pink",
  chameleon: "pink",
  sleeper_agent: "pink",
  forger: "gold",
  delivery_machine: "gold",
  arsonist: "gold",
  repeat_offender: "gold",
  old_school: "gold",
  mastermind: "night",
  night_owl: "night",
  ghost: "night",
  default: "night",
  fresh_blood: "dawn",
};

/** Le décor d'une fiche : celui de son profil s'il existe, sinon `default`. */
export function sceneOf(profileId: string | undefined): string {
  return profileId && Object.prototype.hasOwnProperty.call(SCENE_LIGHT, profileId) ? profileId : "default";
}
