// Les lieux du crime (SPEC §18.28) : un décor peint par profil, plus `default`
// pour les fiches sans profil, dans web/public/profiles/{id}.jpg (1152 × 768) et
// {id}-s.jpg (576 × 384). Une seule liste pour le site (ciel de la page d'une
// fiche, couverture) et pour les images de partage du serveur.

/** Les quatre lumières des décors (docs/brief-personnages.md §7). */
export type Light = "pink" | "gold" | "night" | "dawn";

/** La lumière de chaque lieu du crime. */
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

/** Le décor d'une fiche sans profil. */
export const DEFAULT_SCENE = "default";

/** Le décor d'une fiche : celui de son profil s'il existe, sinon `default`. */
export function sceneOf(profileId: string | undefined): string {
  return profileId && Object.prototype.hasOwnProperty.call(SCENE_LIGHT, profileId) ? profileId : DEFAULT_SCENE;
}

/** Seuls les identifiants de data/profiles.json (minuscules, chiffres, `_`) deviennent une adresse ou un fichier. */
export const safeSceneId = (id: string | undefined | null): string | null => (id && /^[a-z0-9_]{1,40}$/.test(id) ? id : null);

/** Ciel sombre (heure bleue) : le texte posé dessus est crème. Ciel clair (heure rose) : il est d'encre. */
export type SkyTone = "dark" | "light";

/** Les quatre ciels de l'heure bleue sont sombres ; les dix autres sont clairs (AA mesuré sur les 14, en haut de l'image). */
export const skyTone = (sceneId: string): SkyTone => (SCENE_LIGHT[sceneId] === "night" ? "dark" : "light");

/** La couleur d'un texte posé sur le haut d'un ciel : crème (#fff9cb) sur l'heure bleue, encre (#0c0d1b) sinon. */
export const SKY_TEXT: Record<SkyTone, string> = { dark: "#fff9cb", light: "#0c0d1b" };
