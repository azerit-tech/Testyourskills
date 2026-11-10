// La révélation qui joue (§18.33) : l'ascenseur 3D (« walkout », par défaut le
// temps de valider la poursuite) ou la poursuite 2D (« chase »). `?scene=chase`
// ou `?scene=walkout` dans l'adresse la choisit, et le choix colle à la session,
// comme `?mock=1` : il survit à la navigation de l'accueil à la fiche. Avec la
// poursuite, ni Three.js ni les assets 3D ne se téléchargent.

export type RevealScene = "walkout" | "chase";

/** La scène par défaut, tant que la poursuite n'est pas validée. */
export const DEFAULT_SCENE: RevealScene = "walkout";
const KEY = "tys_scene";

export function parseScene(v: string | null | undefined): RevealScene | null {
  return v === "chase" || v === "walkout" ? v : null;
}

/** La scène de la page : celle de l'adresse, sinon celle gardée pour la session, sinon le défaut. */
export function revealScene(): RevealScene {
  if (typeof window === "undefined") return DEFAULT_SCENE;
  const asked = parseScene(new URLSearchParams(window.location.search).get("scene"));
  try {
    if (asked) window.sessionStorage.setItem(KEY, asked);
    return parseScene(window.sessionStorage.getItem(KEY)) ?? asked ?? DEFAULT_SCENE;
  } catch {
    return asked ?? DEFAULT_SCENE;
  }
}

/** Ce qui joue vraiment : rien en mouvement réduit, comme l'ascenseur aujourd'hui. */
export function revealToPlay(scene: RevealScene, reducedMotion: boolean): RevealScene | null {
  return reducedMotion ? null : scene;
}
