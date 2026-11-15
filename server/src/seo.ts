// Ce que lisent les moteurs de recherche et les aperçus de lien : robots.txt et
// sitemap.xml, de vrais fichiers ; l'adresse canonique de l'accueil ; le titre
// et la description propres au règlement et à la vie privée. Les fiches ne
// figurent pas au plan du site : elles portent un nom, et sont en noindex
// (balise et en-tête X-Robots-Tag, app.ts). Rien n'est interdit au passage :
// LinkedIn et X lisent les aperçus des fiches, et respectent robots.txt.

import type { Lang } from "../../shared/types";
import { escapeHtml, staticPageMeta, type PageMeta } from "./html";

/** L'en-tête des réponses qui ne doivent pas entrer dans un index (fiche nominative et ses images). */
export const NOINDEX = "noindex, noimageindex";

export function robotsTxt(baseUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`;
}

/** Les pages publiques du site : l'accueil, les bandes, les primes et le règlement quand ils existent, la vie privée. */
export function sitemapPaths(o: { primesListed: boolean; rulesPublished: boolean }): string[] {
  return ["/", "/bandes", ...(o.primesListed ? ["/primes"] : []), ...(o.rulesPublished ? ["/reglement"] : []), "/confidentialite", "/privacy"];
}

export function sitemapXml(baseUrl: string, paths: string[]): string {
  const urls = paths.map((p) => `  <url><loc>${escapeHtml(baseUrl + p)}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** La description propre au règlement et à la vie privée, au lieu de celle de l'accueil. Leur titre vient de html.ts. */
export const PAGE_DESCRIPTIONS: Record<"rules" | "privacy", Record<Lang, string>> = {
  rules: {
    fr: "Le règlement des primes de la saison : entrée gratuite dès 18 ans, fiches classées par leur seule note, les dix premières finalistes.",
    en: "The season's bounty rules: free entry from age 18, sheets ranked by their rating alone, the top ten become finalists.",
  },
  privacy: {
    fr: "Ce qu'Azerit garde de ta fiche, pourquoi, et comment tout effacer. Court, parce qu'on stocke peu.",
    en: "What Azerit keeps from your sheet, why, and how to erase it all. Short, because we keep very little.",
  },
};

/**
 * Les balises d'une page du front qui a les siennes : le règlement (dans la
 * langue demandée), la vie privée (celle de son adresse). Null pour les
 * autres, qui gardent celles de l'accueil.
 */
export function sitePageMeta(path: string, baseUrl: string, lang: Lang): PageMeta | null {
  const own = staticPageMeta(baseUrl, path, lang);
  if (!own) return null;
  const page = /^\/reglement/i.test(path) ? "rules" : "privacy";
  return { ...own, description: PAGE_DESCRIPTIONS[page][own.lang] };
}

/** L'adresse canonique d'une page (accueil, ou accueil prérempli par /pseudo) : canonical et og:url, remplacés, jamais doublés. */
export function withPageUrl(html: string, url: string): string {
  const e = escapeHtml;
  const cleaned = html.replace(/<link\s+rel=["']canonical["'][^>]*>\s*/gi, "").replace(/<meta\s+property=["']og:url["'][^>]*>\s*/gi, "");
  const tags = `<link rel="canonical" href="${e(url)}">\n    <meta property="og:url" content="${e(url)}">`;
  return /<\/head>/i.test(cleaned) ? cleaned.replace(/<\/head>/i, `    ${tags}\n  </head>`) : cleaned;
}
