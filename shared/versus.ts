// La comparaison de deux fiches (§18.7) : « Toi 78 · @X 71 · une étoile d'avance ».
// Les étoiles d'abord, c'est ce qui se voit ; à étoiles égales, les points. Le front
// (lib/versus.ts) et le serveur (l'aperçu du duel d'une dénonciation, §18.91) la lisent ici.
import { starsFor } from "./types";

export type Verdict =
  | { by: "stars"; ahead: boolean; n: number }
  | { by: "points"; ahead: boolean; n: number }
  | { by: "tie" };

export function verdict(mine: number, theirs: number): Verdict {
  const ds = starsFor(mine) - starsFor(theirs);
  if (ds !== 0) return { by: "stars", ahead: ds > 0, n: Math.abs(ds) };
  const dp = mine - theirs;
  if (dp !== 0) return { by: "points", ahead: dp > 0, n: Math.abs(dp) };
  return { by: "tie" };
}
