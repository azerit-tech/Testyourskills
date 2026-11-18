// Les 144 images du tour de la berline (SPEC §18.79), importées par Vite : chacune reçoit une
// empreinte dans son nom et sort dans /assets, servi avec un cache long immuable. Jamais en ligne
// dans le JS (`?no-inline`). Ce module ne se charge qu'au moment de faire tourner la voiture.
const files = import.meta.glob("./spin/*.avif", { eager: true, query: "?no-inline", import: "default" }) as Record<string, string>;

/** Les adresses des images, dans l'ordre du tour (000 à 143). */
export const SPIN_FRAMES: string[] = Object.keys(files)
  .sort()
  .map((k) => files[k]);
