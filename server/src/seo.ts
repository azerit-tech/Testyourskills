// Ce que lisent les moteurs de recherche : robots.txt et sitemap.xml, de vrais
// fichiers. Les fiches n'y figurent pas : elles portent un nom, et sont en
// noindex (balise et en-tête X-Robots-Tag, app.ts). Rien n'est interdit au
// passage : LinkedIn et X lisent les aperçus des fiches, et respectent robots.txt.

import { escapeHtml } from "./html";

/** L'en-tête des réponses qui ne doivent pas entrer dans un index (fiche nominative et ses images). */
export const NOINDEX = "noindex, noimageindex";

export function robotsTxt(baseUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`;
}

/** Les pages publiques du site : l'accueil, les bandes, et les primes et le règlement quand ils existent. */
export function sitemapPaths(o: { primesListed: boolean; rulesPublished: boolean }): string[] {
  return ["/", "/bandes", ...(o.primesListed ? ["/primes"] : []), ...(o.rulesPublished ? ["/reglement"] : []), "/confidentialite", "/privacy"];
}

export function sitemapXml(baseUrl: string, paths: string[]): string {
  const urls = paths.map((p) => `  <url><loc>${escapeHtml(baseUrl + p)}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
