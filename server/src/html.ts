// Page /c/:id rendue côté serveur (SPEC §7) : les robots de LinkedIn et X
// lisent les balises Open Graph et Twitter sans exécuter de JS, puis le
// navigateur charge le front SPA qui affiche la carte.

import { declaredLabel, fileOf } from "../../shared/caseFile";
import { usableGrid } from "../../shared/gridText";
import { IMAGE_QUERY } from "../../shared/images";
import { HOME_PROMISE, homeTitle, pageTitle, promiseTitle, SITE_NAME } from "../../shared/promise";
import { starsLine } from "../../shared/stars";
import { frTypoDeep } from "../../shared/typo";
import type { CardData, ComparisonData, Lang, Special } from "../../shared/types";
import { LEVEL_LABELS, starsFor } from "../../shared/types";

export interface PageMeta {
  lang: Lang;
  title: string;
  description: string;
  url: string;
  /** Image 1200×630 ; absente pour une carte inconnue (pas d'image générique pour l'instant). */
  image?: string;
  imageAlt: string;
  /** Page hors des index de recherche (une fiche nominative) : <meta name="robots" content="noindex">. */
  noindex?: boolean;
}

const SPECIAL_NAMES: Record<Lang, Record<Special, string>> = {
  fr: { wonderkid: "Débarque en ville", flashback: "Affaire classée", totw: "Top 5 de la semaine" },
  en: { wonderkid: "New in town", flashback: "Cold case", totw: "This week's top 5" },
};

/** og:site_name : le seul nom visible du produit (§18.48). */
const SITE = SITE_NAME;

/**
 * La langue des balises d'une page sans fiche (bande, prime, règlement) : `?lang=` d'abord,
 * que le lien partagé depuis le site en anglais porte ; sinon la première langue du
 * navigateur. Un robot qui ne dit rien lit le français.
 */
export function requestLang(query: string | undefined | null, acceptLanguage: string | undefined | null): Lang {
  if (query === "en" || query === "fr") return query;
  return langOfRequest(acceptLanguage);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

/** « Fiche ★★★★★☆, 78/100 » / « ★★★★★☆ rap sheet, 78/100 » ; une spéciale ajoute son nom (§17.3). */
export function cardLabel(card: Pick<CardData, "tier" | "special" | "overall">, lang: Lang): string {
  const stars = starsLine(starsFor(card.overall));
  const special = card.special ? ` ${SPECIAL_NAMES[lang][card.special]}` : "";
  return lang === "fr" ? `Fiche ${stars}${special}, ${card.overall}/100` : `${stars}${special} rap sheet, ${card.overall}/100`;
}

function isComparison(d: CardData | ComparisonData): d is ComparisonData {
  return "cv" in d && "github" in d;
}

export function metaFor(data: CardData | ComparisonData, baseUrl: string): PageMeta {
  // Un dossier à deux sources (§18.36) : l'aperçu d'une fiche, celle du dossier
  // (shared/caseFile.ts), une seule note ; la description dit ses deux sources.
  if (isComparison(data)) {
    const file = fileOf(data);
    return cardMeta({ ...file, lang: data.cv.lang ?? data.github.lang ?? file.lang }, baseUrl, declaredLabel(data));
  }
  return cardMeta(data, baseUrl);
}

/** L'aperçu d'une fiche ; `exhibits` (« LinkedIn » ou « CV ») : celle d'un dossier à deux sources. */
function cardMeta(data: CardData, baseUrl: string, exhibits?: string): PageMeta {
  const url = `${baseUrl}/c/${data.id}`;
  // Spéciale de la semaine (§18.22), ou nouveau dessin (shared/images.ts) : une autre adresse
  // d'image, pour que les réseaux ne resservent pas l'ancienne.
  const image = `${baseUrl}/og/${data.id}.png?${IMAGE_QUERY}${data.special === "totw" ? "&s=totw" : ""}`;
  const lang = data.lang ?? "fr";
  const fr = lang === "fr";
  const pieces = exhibits ? (fr ? `Sources\u00a0: ${exhibits} et GitHub.` : `Sources: ${exhibits} and GitHub.`) : "";
  if (data.sealed) return sealedMeta(data, lang, url, image, pieces);
  const label = cardLabel(data, lang);
  // §18.7 : « @X est dans le viseur ★★★★☆☆, Oiseau de nuit » (épicène, §18.18 ;
  // les six étoiles, §18.27) ; sans profil (fiche d'avant le barème 0.2.0), le niveau.
  const who = data.login ? `@${data.login}` : data.name;
  const n = starsFor(data.overall);
  const tag = data.profile ? data.profile.label[lang] : LEVEL_LABELS[n][lang];
  const title = `${who} ${fr ? "est dans le viseur" : "is in the crosshairs"} ${starsLine(n)}, ${tag}`;
  const status = data.statuses[0]?.label[lang];
  // Ce qu'est la note : une grille de recrutement (§18.37) ; une fiche d'avant la grille dit son temps de lecture.
  const parts = [
    status ? (fr ? `Chef d'accusation\u00a0: «\u00a0${status}\u00a0».` : `Charge: “${status}”.`) : "",
    pieces,
    usableGrid(data.grid)
      ? fr
        ? "Fiche de dev lue sur huit critères de recrutement, chacun avec sa preuve. Fais la tienne."
        : "Dev rap sheet, scored on eight hiring criteria, each with its evidence. Get yours."
      : fr
        ? `Fiche dressée par Azerit en ${data.judgedInSeconds}\u00a0s. Fais la tienne.`
        : `Rap sheet drawn up by Azerit in ${data.judgedInSeconds}s. Get yours.`,
  ].filter(Boolean);
  return {
    lang,
    url,
    image,
    title,
    description: parts.join(" "),
    imageAlt: fr ? `${label}, fiche de dev de ${data.name}` : `${label}, ${data.name}'s dev rap sheet`,
  };
}

/**
 * Un dossier vide fait par un tiers et pas encore revendiqué (shared/publicView.ts) :
 * l'aperçu ne dit pas la note (la note plancher jugerait sans preuve), ni ses étoiles.
 * L'image est celle de la fiche scellée, qui ne la porte pas non plus. Le profil et le chef d'accusation restent.
 */
function sealedMeta(data: CardData, lang: Lang, url: string, image: string, pieces: string): PageMeta {
  const fr = lang === "fr";
  const who = data.login ? `@${data.login}` : data.name;
  const tag = data.profile ? `, ${data.profile.label[lang]}` : "";
  const status = data.statuses[0]?.label[lang];
  const parts = [
    status ? (fr ? `Chef d'accusation\u00a0: «\u00a0${status}\u00a0».` : `Charge: “${status}”.`) : "",
    pieces,
    fr ? "Le code reste à prouver\u00a0: la note attend la personne fichée. Fais la tienne." : "Code still unproven: the rating waits for the person on file. Get yours.",
  ].filter(Boolean);
  return {
    lang,
    url,
    image,
    title: `${who} ${fr ? "est dans le viseur" : "is in the crosshairs"}${tag}`,
    description: parts.join(" "),
    imageAlt: fr ? `Fiche de dev de ${data.name}` : `${data.name}'s dev rap sheet`,
  };
}

/** Les balises de l'accueil et des pages sans fiche : le titre et la description de shared/promise.ts. */
export function genericMeta(baseUrl: string, path: string, lang: Lang = "fr"): PageMeta {
  return {
    lang,
    url: `${baseUrl}${path}`,
    title: homeTitle(lang),
    description: HOME_PROMISE[lang].description,
    imageAlt: homeImageAlt(lang),
  };
}

/** Le texte de l'image de l'accueil : « Azerit : Ta fiche de dev. Combien d'étoiles ? » */
export const homeImageAlt = (lang: Lang = "fr"): string => `${SITE_NAME}${lang === "fr" ? "\u00a0: " : ": "}${promiseTitle(lang)}`;

/**
 * Les pages du front qui ont leur titre sans fiche ni image à elles : la vie privée
 * (une adresse par langue) et le règlement. Null pour toute autre adresse.
 */
export function staticPageMeta(baseUrl: string, path: string, lang: Lang): PageMeta | null {
  const p = path.replace(/\/+$/, "").toLowerCase();
  const page =
    p === "/confidentialite"
      ? { lang: "fr" as Lang, title: "Vie privée" }
      : p === "/privacy"
        ? { lang: "en" as Lang, title: "Privacy" }
        : p === "/reglement"
          ? { lang, title: lang === "fr" ? "Règlement de la saison" : "Season rules" }
          : null;
  if (!page) return null;
  return { ...genericMeta(baseUrl, p, page.lang), title: pageTitle(page.title), image: `${baseUrl}${HOME_IMAGE_PATH}` };
}

/** L'image de l'accueil (la promesse et la fiche de la vitrine), à cette adresse stable. */
export const HOME_IMAGE_PATH = "/og/home.png";

/**
 * Pages du front sans fiche (accueil, repli SPA) : l'image de l'accueil en
 * adresse absolue, celle de ce serveur. Le index.html porte déjà ces balises
 * avec l'adresse de production ; elles sont remplacées, jamais doublées.
 */
export function injectHomeImage(template: string, baseUrl: string): string {
  const e = escapeHtml;
  const image = `${baseUrl}${HOME_IMAGE_PATH}`;
  const tags = [
    `<meta property="og:image" content="${e(image)}">`,
    `<meta property="og:image:type" content="image/png">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${e(homeImageAlt())}">`,
    `<meta name="twitter:image" content="${e(image)}">`,
  ].join("\n    ");
  const cleaned = template.replace(/<meta\s+(?:property|name)=["'](?:og:image(?::[a-z_]+)?|twitter:image)["'][^>]*>\s*/gi, "");
  return /<\/head>/i.test(cleaned) ? cleaned.replace(/<\/head>/i, `    ${tags}\n  </head>`) : cleaned;
}

export function metaTags(m: PageMeta): string {
  const e = escapeHtml;
  return [
    `<title>${e(m.title)}</title>`,
    `<meta name="description" content="${e(m.description)}">`,
    `<link rel="canonical" href="${e(m.url)}">`,
    ...(m.noindex ? [`<meta name="robots" content="noindex, noimageindex">`] : []),
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
    .replace(/<meta\s+(?:property|name)=["'](?:og:[^"']*|twitter:[^"']*|description|robots)["'][^>]*>\s*/gi, "")
    .replace(/<link\s+rel=["']canonical["'][^>]*>\s*/gi, "")
    .replace(/<html([^>]*)\blang=["'][^"']*["']/i, `<html$1lang="${m.lang}"`);
  const tags = metaTags(m);
  if (/<\/head>/i.test(cleaned)) return cleaned.replace(/<\/head>/i, `    ${tags}\n  </head>`);
  return `<!doctype html><html lang="${m.lang}"><head><meta charset="utf-8">${tags}</head><body>${cleaned}</body></html>`;
}

/**
 * La configuration du site (/api/config), écrite dans la page : le front la lit au
 * premier rendu (web/src/lib/api.ts, knownConfig). Le bandeau de saison et le pied
 * sont justes dès la première image, sans attendre une réponse ni pousser la page.
 * Un bloc de données, jamais exécuté ; « < » échappé, il ne ferme rien.
 */
export function injectConfig(html: string, config: object): string {
  if (!/<\/head>/i.test(html) || html.includes('id="tys-config"')) return html;
  const json = JSON.stringify(config).replace(/</g, "\\u003c");
  return html.replace(/<\/head>/i, () => `    <script id="tys-config" type="application/json">${json}</script>\n  </head>`);
}

// --- Les pages servies sans le site ------------------------------------------------
// Lien de suppression ouvert depuis un email, fiche retirée ou page introuvable
// quand le front n'est pas là : une langue (celle du navigateur), le gabarit du
// site (l'encre, la crème, la marque en haut à gauche, un bouton de retour).

/** La langue d'une requête, d'après Accept-Language : le français s'il vient en tête, sinon l'anglais. */
export function langOfRequest(acceptLanguage: string | undefined | null): Lang {
  const first = (acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  if (!first) return "fr";
  return first.startsWith("fr") ? "fr" : "en";
}

export type MessageKey = "deleted" | "badDeleteLink" | "cardNotFound" | "withdrawn" | "pageNotFound";

/** Les textes de ces pages : un titre court, une phrase. */
export const SERVER_PAGES: Record<Lang, Record<MessageKey, { title: string; text: string }> & { home: string }> = {
  fr: frTypoDeep({
    deleted: { title: "Fiche supprimée", text: "Ta fiche et ses images sont effacées." },
    badDeleteLink: { title: "Lien non valide", text: "Ce lien de suppression n'est pas valide : ta fiche n'a pas bougé." },
    cardNotFound: { title: "Fiche introuvable", text: "Elle a expiré, ou elle a été supprimée." },
    withdrawn: { title: "Fiche retirée", text: "La personne fichée l'a retirée." },
    pageNotFound: { title: "Page introuvable", text: "Cette adresse ne mène à aucune page." },
    home: "Retour à l'accueil",
  }),
  en: {
    deleted: { title: "Sheet deleted", text: "Your rap sheet and its images are erased." },
    badDeleteLink: { title: "Invalid link", text: "This delete link isn't valid: your sheet hasn't changed." },
    cardNotFound: { title: "Sheet not found", text: "It expired, or it was deleted." },
    withdrawn: { title: "Sheet withdrawn", text: "The person on file withdrew it." },
    pageNotFound: { title: "Page not found", text: "This address doesn't lead to any page." },
    home: "Back to home",
  },
};

/** Les feuilles de style du front (ses polices) lues dans son index.html ; aucune sans lui. */
export function siteStylesheets(template: string | null | undefined): string {
  if (!template) return "";
  return (template.match(/<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi) ?? []).join("\n    ");
}

/** La gemme d'Azerit (web/src/components/Brand.tsx), en clair. */
const MARK = `<svg width="13" height="15" viewBox="0 0 104 120" fill="none" aria-hidden="true"><path d="M52 8 L14 50 L37 102 Z" fill="#c9d67c" stroke="#c9d67c" stroke-width="9" stroke-linejoin="round"/><path d="M63 10 L92 42 L85 80 L47 112 Z" fill="#6fb2a8" stroke="#6fb2a8" stroke-width="9" stroke-linejoin="round"/></svg>`;

/** Le gabarit du site (web/src/styles.css) : encre, crème, lilas, rose pour ce qui se touche. */
const SHELL_CSS = `:root{color-scheme:dark}
*{box-sizing:border-box}
html,body{margin:0;background:#0c0d1b}
body{min-height:100vh;min-height:100svh;display:flex;flex-direction:column;color:#e5ddff;font:400 16px/1.5 "Outfit",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.m-top{width:100%;max-width:1180px;height:64px;margin:0 auto;padding:0 16px;display:flex;align-items:center}
.m-brand{display:inline-flex;align-items:center;gap:8px;min-height:44px;font:700 12px/1 "Outfit",system-ui,sans-serif;letter-spacing:.24em;color:#ccc2f5;text-decoration:none}
.m-main{flex:1;width:100%;max-width:540px;margin:0 auto;padding:48px 16px 80px;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center}
.m-main h1{margin:0;font:700 44px/.92 "Barlow Condensed","Arial Narrow",sans-serif;text-transform:uppercase;color:#fff9cb}
.m-main p{margin:0 0 8px;color:#ccc2f5}
.m-main img{max-width:100%;height:auto;border-radius:24px}
.m-btn{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 24px;border-radius:999px;background:#ffb2c6;color:#0c0d1b;font:600 16px/1.1 "Outfit",system-ui,sans-serif;text-decoration:none}
a:focus-visible{outline:2px solid #fff9cb;outline-offset:3px}
@media (min-width:900px){.m-top{height:76px}.m-main h1{font-size:64px}}`;

function shell(lang: Lang, head: string, main: string, styles: string): string {
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#0c0d1b">
    ${head}
    ${styles}
    <style>${SHELL_CSS}</style>
  </head>
  <body>
    <header class="m-top"><a class="m-brand" href="/" aria-label="Azerit">${MARK}AZERIT</a></header>
    <main class="m-main" id="main">
      ${main}
    </main>
  </body>
</html>`;
}

/** Repli sans index.html du front : les balises pour les robots, l'image et un bouton pour les humains. */
export function standalonePage(m: PageMeta): string {
  const img = m.image ? `<img src="${escapeHtml(m.image)}" alt="${escapeHtml(m.imageAlt)}" width="1200" height="630">` : "";
  return shell(m.lang, metaTags(m), `${img}\n      <a class="m-btn" href="/">${m.lang === "fr" ? "Fais la tienne" : "Get yours"}</a>`, "");
}

/**
 * Page de message servie sans le site : lien de suppression ouvert depuis un
 * email, fiche retirée ou page introuvable quand le front manque. `styles` :
 * les feuilles du front (siteStylesheets), pour ses polices.
 */
export function messagePage(key: MessageKey, lang: Lang, styles = ""): string {
  const t = SERVER_PAGES[lang];
  const { title, text } = t[key];
  const head = `<meta name="robots" content="noindex">\n    <title>${escapeHtml(pageTitle(title))}</title>`;
  const main = `<h1>${escapeHtml(title)}</h1>\n      <p>${escapeHtml(text)}</p>\n      <a class="m-btn" href="/">${escapeHtml(t.home)}</a>`;
  return shell(lang, head, main, styles);
}
