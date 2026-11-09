// Les étoiles dans un texte (§18.27) : toujours les six, pleines puis vides.
// Partagé par le front (partage, dénonciation) et le serveur (balises OG).

/** Six étoiles, pleines puis vides : ★★★★☆☆. */
export function starsLine(n: number): string {
  const on = Math.max(0, Math.min(6, Math.round(Number.isFinite(n) ? n : 0)));
  return "★".repeat(on) + "☆".repeat(6 - on);
}
