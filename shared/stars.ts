// Les étoiles dans un texte (§18.27) : toujours les six, pleines puis vides.
// Partagé par le front (partage, dénonciation) et le serveur (balises OG).

/** Le dessin d'une étoile, en 24 × 24 : celui de la fiche, du HUD et de la poursuite. */
export const STAR_PATH = "M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4l-6 3.3 1.3-6.6L2.4 9.5l6.7-.8z";

/** Six étoiles, pleines puis vides : ★★★★☆☆. */
export function starsLine(n: number): string {
  const on = Math.max(0, Math.min(6, Math.round(Number.isFinite(n) ? n : 0)));
  return "★".repeat(on) + "☆".repeat(6 - on);
}
