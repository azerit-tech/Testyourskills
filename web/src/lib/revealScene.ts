// La révélation qui joue (§18.39) : le film de la poursuite (« film »), par
// défaut ; l'ascenseur 3D (« walkout ») ne joue plus qu'avec `?scene=walkout`,
// le temps de vérifier, avant de quitter le site. `?scene=film` ou
// `?scene=walkout` dans l'adresse la choisit, et le choix colle à la session,
// comme `?mock=1` : il survit à la navigation de l'accueil à la fiche. Avec le
// film, ni Three.js ni les assets 3D ne se téléchargent.

export type RevealScene = "walkout" | "film";

/** La scène par défaut : le film (§18.39). */
export const DEFAULT_SCENE: RevealScene = "film";
const KEY = "tys_scene";

export function parseScene(v: string | null | undefined): RevealScene | null {
  return v === "film" || v === "walkout" ? v : null;
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

/** Ce qui joue vraiment : rien en mouvement réduit. */
export function revealToPlay(scene: RevealScene, reducedMotion: boolean): RevealScene | null {
  return reducedMotion ? null : scene;
}

/**
 * Ce que le premier contact avec le formulaire précharge (EntryForm) : la
 * scène qui jouera, et elle seule (vidéos du film comprises) ; rien avec
 * l'économiseur de données (tout attendra l'envoi) ni en mouvement réduit
 * (rien ne jouera).
 */
export function prefetchScene(scene: RevealScene, o: { saveData: boolean; reduced: boolean }): RevealScene | null {
  return o.saveData ? null : revealToPlay(scene, o.reduced);
}
