// Les lieux du crime (SPEC §18.28) : un décor peint par profil, plus `default`
// pour les fiches sans profil, dans web/public/profiles/{id}.jpg (1152 × 768) et
// {id}-s.jpg (576 × 384). Une seule liste pour le site (ciel de la page d'une
// fiche, mur des profils, couverture, film) et pour les images de partage du serveur.
//
// Un profil absent de SCENE_LIGHT prend `default`. C'est le cas de `forger`
// (« Sous couverture ») : son décor, un atelier de faux diplômes, disait qu'on
// truque un CV. Le fichier reste sur disque, plus rien ne l'affiche, en attendant
// le nouveau décor ; il reviendra ici avec sa lumière.

/** Les quatre lumières des décors (docs/brief-personnages.md §7). */
export type Light = "pink" | "gold" | "night" | "dawn";

/** La lumière de chaque lieu du crime. */
export const SCENE_LIGHT: Record<string, Light> = {
  kingpin: "pink",
  hoarder: "pink",
  chameleon: "pink",
  sleeper_agent: "pink",
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

/**
 * Le décor d'une fiche : celui de son profil s'il est à l'affiche (SCENE_LIGHT), sinon `default`.
 * Seuls ces identifiants deviennent une adresse ou un fichier.
 */
export function sceneOf(profileId: string | undefined | null): string {
  return profileId && Object.prototype.hasOwnProperty.call(SCENE_LIGHT, profileId) ? profileId : DEFAULT_SCENE;
}

/** Ciel sombre (heure bleue) : le texte posé dessus est crème. Ciel clair (heure rose) : il est d'encre. */
export type SkyTone = "dark" | "light";

/** Les quatre ciels de l'heure bleue sont sombres ; les neuf autres sont clairs (AA mesuré sur chacun, en haut de l'image). */
export const skyTone = (sceneId: string): SkyTone => (SCENE_LIGHT[sceneId] === "night" ? "dark" : "light");

/** La couleur d'un texte posé sur le haut d'un ciel : crème (#fff9cb) sur l'heure bleue, encre (#0c0d1b) sinon. */
export const SKY_TEXT: Record<SkyTone, string> = { dark: "#fff9cb", light: "#0c0d1b" };
