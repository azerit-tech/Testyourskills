// Page /c/:id rendue côté serveur (SPEC §7) : les robots de LinkedIn et X
// lisent les balises Open Graph et Twitter sans exécuter de JS, puis le
// navigateur charge le front SPA qui affiche la carte.

import type { CardData, ComparisonData, Lang, Special } from "../../shared/types";
import { starsFor } from "../../shared/types";

export interface PageMeta {
  lang: Lang;
  title: string;
  description: string;
  url: string;
  /** Image 1200×630 ; absente pour une carte inconnue (pas d'image générique pour l'instant). */
  image?: string;
  imageAlt: string;
}

const SPECIAL_NAMES: Record<Lang, Record<Special, string>> = {
  fr: { wonderkid: "Nouveau en ville", flashback: "Affaire classée", totw: "Les 5 plus recherchés" },
  en: { wonderkid: "New in town", flashback: "Cold case", totw: "5 most wanted" },
};

const SITE = "Testyourskills · azerit.tech";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

/** « Fiche ★★★★, 78 » / « ★★★★ sheet, 78 » ; une spéciale ajoute son nom (§17.3). */
export function cardLabel(card: Pick<CardData, "tier" | "special" | "overall">, lang: Lang): string {
  const stars = "★".repeat(starsFor(card.overall));
  const special = card.special ? ` ${SPECIAL_NAMES[lang][card.special]}` : "";
  return lang === "fr" ? `Fiche ${stars}${special}, ${card.overall}` : `${stars}${special} sheet, ${card.overall}`;
}

function isComparison(d: CardData | ComparisonData): d is ComparisonData {
  return "cv" in d && "github" in d;
}

export function metaFor(data: CardData | ComparisonData, baseUrl: string): PageMeta {
  const url = `${baseUrl}/c/${data.id}`;
  const image = `${baseUrl}/og/${data.id}.png`;

  if (isComparison(data)) {
    const lang = data.cv.lang ?? data.github.lang ?? "fr";
    const name = data.github.name || data.cv.name;
    const head = data.headline[lang];
    const fr = lang === "fr";
    return {
      lang,
      url,
      image,
      title: `${head} — ${name}`,
      description: fr
        ? `CV : ${cardLabel(data.cv, lang)}. GitHub : ${cardLabel(data.github, lang)}. Le butin : ce que le CV déclare contre ce que le code prouve. Fais la tienne.`
        : `CV: ${cardLabel(data.cv, lang)}. GitHub: ${cardLabel(data.github, lang)}. The loot: what the CV claims vs what the code proves. Make yours.`,
      imageAlt: fr ? `Fiche CV contre fiche GitHub de ${name}` : `${name}'s CV sheet vs GitHub sheet`,
    };
  }

  const lang = data.lang ?? "fr";
  const fr = lang === "fr";
  const label = cardLabel(data, lang);
  const status = data.statuses[0]?.label[lang];
  const parts = [
    status ? (fr ? `Chef d'accusation : « ${status} ».` : `Charge: "${status}".`) : "",
    // Épicène (§2.4) : « interrogé » s'accordait avec la personne.
    fr ? `Interrogatoire par une IA : ${data.judgedInSeconds} s.` : `Interrogated by an AI for ${data.judgedInSeconds}s.`,
    fr ? "Fais la tienne." : "Make yours.",
  ].filter(Boolean);
  return {
    lang,
    url,
    image,
    title: `${label} — ${data.name}`,
    description: parts.join(" "),
    imageAlt: fr ? `${label}, fiche de dev de ${data.name}` : `${label}, ${data.name}'s dev rap sheet`,
  };
}

export function genericMeta(baseUrl: string, path: string, lang: Lang = "fr"): PageMeta {
  const fr = lang === "fr";
  return {
    lang,
    url: `${baseUrl}${path}`,
    title: fr ? "Testyourskills — ta fiche de dev" : "Testyourskills — your dev rap sheet",
    description: fr
      ? "Ton pseudo GitHub ou ton CV, et une IA t'interroge en dix secondes : étoiles de recherche et chefs d'accusation. Ce que ton CV déclare contre ce que ton code prouve."
      : "Your GitHub username or your CV, and an AI interrogates you in ten seconds: wanted stars and charges. What your CV claims vs what your code proves.",
    imageAlt: "Testyourskills",
  };
}

export function metaTags(m: PageMeta): string {
  const e = escapeHtml;
  return [
    `<title>${e(m.title)}</title>`,
    `<meta name="description" content="${e(m.description)}">`,
    `<link rel="canonical" href="${e(m.url)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${e(SITE)}">`,
    `<meta property="og:locale" content="${m.lang === "fr" ? "fr_FR" : "en_US"}">`,
    `<meta property="og:title" content="${e(m.title)}">`,
    `<meta property="og:description" content="${e(m.description)}">`,
    `<meta property="og:url" content="${e(m.url)}">`,
    ...(m.image
      ? [
          `<meta property="og:image" content="${e(m.image)}">`,
          `<meta property="og:image:type" content="image/png">`,
          `<meta property="og:image:width" content="1200">`,
          `<meta property="og:image:height" content="630">`,
          `<meta property="og:image:alt" content="${e(m.imageAlt)}">`,
        ]
      : []),
    `<meta name="twitter:card" content="${m.image ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${e(m.title)}">`,
    `<meta name="twitter:description" content="${e(m.description)}">`,
    ...(m.image ? [`<meta name="twitter:image" content="${e(m.image)}">`] : []),
  ].join("\n    ");
}

/**
 * Injecte les balises dans le index.html du front : retire le <title> et les
 * balises description / og / twitter existantes, puis insère les nôtres.
 */
export function injectMeta(template: string, m: PageMeta): string {
  const cleaned = template
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta\s+(?:property|name)=["'](?:og:[^"']*|twitter:[^"']*|description)["'][^>]*>\s*/gi, "")
    .replace(/<link\s+rel=["']canonical["'][^>]*>\s*/gi, "")
    .replace(/<html([^>]*)\blang=["'][^"']*["']/i, `<html$1lang="${m.lang}"`);
  const tags = metaTags(m);
  if (/<\/head>/i.test(cleaned)) return cleaned.replace(/<\/head>/i, `    ${tags}\n  </head>`);
  return `<!doctype html><html lang="${m.lang}"><head><meta charset="utf-8">${tags}</head><body>${cleaned}</body></html>`;
}

/** Repli sans index.html du front : les balises pour les robots, un lien pour les humains. */
export function standalonePage(m: PageMeta): string {
  return `<!doctype html>
<html lang="${m.lang}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    ${metaTags(m)}
    <style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0f16;color:#e6ecf2;font-family:Inter,system-ui,sans-serif}a{color:#52d0bd}</style>
  </head>
  <body>
    <main style="text-align:center;padding:16px">
      ${m.image ? `<img src="${escapeHtml(m.image)}" alt="${escapeHtml(m.imageAlt)}" style="max-width:100%;height:auto;border-radius:12px">` : ""}
      <p><a href="/">${m.lang === "fr" ? "Fais la tienne" : "Make yours"}</a></p>
    </main>
  </body>
</html>`;
}

/** Page de confirmation du lien « Supprimer ma fiche » (GET, depuis un email). */
export function messagePage(fr: string, en: string): string {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>Testyourskills</title>
    <style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0f16;color:#e6ecf2;font-family:Inter,system-ui,sans-serif;padding:16px;box-sizing:border-box}p{max-width:32rem}.en{color:#8494a5}a{color:#52d0bd}</style>
  </head>
  <body>
    <main>
      <p>${escapeHtml(fr)}</p>
      <p class="en" lang="en">${escapeHtml(en)}</p>
      <p><a href="/">skills.azerit.tech</a></p>
    </main>
  </body>
</html>`;
}
