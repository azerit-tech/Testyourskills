// Le film et le réseau (docs/cinematique-poursuite.md §5.3, §5.4) : la partie
// pure, sans DOM, testée par net.test.ts. Les adresses des fichiers.

/**
 * L'adresse d'un fichier du film. Sans base : celle que Vite a donnée
 * (/assets/nom-empreinte.mp4). Avec une base (VITE_FILM_BASE) : le même nom à
 * empreinte, sous cette base.
 */
export function filmAssetUrl(base: string, url: string): string {
  const b = base.trim();
  if (!b) return url;
  const name = url.slice(url.lastIndexOf("/") + 1);
  return (b.endsWith("/") ? b : `${b}/`) + name;
}
