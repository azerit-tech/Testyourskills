// Le petit aléa de la note (SPEC §18.101, décision du 20 novembre 2026) : « ajoute un tout
// petit peu d'aléatoire de 2-3 points à la fin ». Après la moyenne et le plafond, la note
// bouge de 1 à 3 points, vers le haut ou vers le bas, et ce tirage est fixé par la fiche :
// il se lit dans un hachage de son id, la même fiche a toujours la même note (rendus,
// recalculs, image partagée). Les critères restent exacts : seule la note finale bouge.
// Un dossier vide garde son plancher ; le plafond sans code prouvé et les bornes 1 à 99 tiennent.
// Jamais dit sur le site (« on ne le dit pas sur le site ») : ni la note exacte ni l'écart ne
// sont rangés dans la fiche, rien ne part au navigateur ; le site n'imprime ni moyenne ni calcul.
// Appliqué une seule fois, sur la note exacte que le barème vient de calculer (`finalNotes`,
// pipeline.ts ; `scripts/recalcule-notes.ts`), jamais sur une note déjà rangée.

import { tierFor, type CardData, type ComparisonData, type Grid } from "./types";

/** FNV-1a 32 bits : stable, sans dépendance, le même résultat partout (serveur, script). */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Le tirage d'une fiche : ±1, ±2 ou ±3, jamais 0, fixé par son id. */
export function jitterOf(id: string): number {
  const h = fnv1a(`tys-alea:${id}`);
  const k = (h % 3) + 1;
  return (h >>> 8) & 1 ? k : -k;
}

export interface JitterBounds {
  min: number;
  max: number;
  /** Le plafond sans code prouvé (rule « capped_unproven »). */
  capUnproven: number;
}

/** La grille avec sa note finale : la note exacte du barème, plus le tirage de la fiche, bornée. */
export function withJitter(grid: Grid, id: string, b: JitterBounds): Grid {
  if (grid.rule === "empty_file") return grid;
  const max = grid.rule === "capped_unproven" ? Math.min(b.max, b.capUnproven) : b.max;
  return { ...grid, overall: Math.min(max, Math.max(b.min, grid.overall + jitterOf(id))) };
}

/**
 * Une fiche ou un dossier avec sa note finale, tirée sur l'id de la fiche racine : la grille,
 * la note et le niveau de la fiche, et ceux des deux pièces d'un dossier (elles portent sa note).
 */
export function jitterCard<T extends CardData | ComparisonData>(data: T, id: string, b: JitterBounds): T {
  if (!data.grid) return data;
  const grid = withJitter(data.grid, id, b);
  const note = { overall: grid.overall, tier: tierFor(grid.overall) };
  if ("cv" in data && "github" in data) return { ...data, grid, cv: { ...data.cv, ...note }, github: { ...data.github, ...note } };
  return { ...data, grid, ...note };
}
