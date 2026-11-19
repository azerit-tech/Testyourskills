// Point d'entrée : lit l'environnement, ouvre la base, démarre Hono sur PORT.
// Dev : `npm run dev` (Vite sur 5180 proxifie /api, /og et /c vers 8787).
// Prod : `npm start` (NODE_ENV=production), sert aussi le front buildé de dist/web.

import { serve } from "@hono/node-server";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { IMAGE_DESIGN_DIR } from "../../shared/images";
import { createApp, pruneStaleImages, purge } from "./app";
import { useBudgetDb } from "./ai/budget";
import { startCreditsWatch, stopCreditsWatch } from "./ai/credits";
import { linkedinFromEnv } from "./linkedin";
import { linkedinProfilesFromEnv, normalizeLinkedinUrl } from "./linkedinProfile/index";
import { linkedinSearchFromEnv } from "./linkedinProfile/search";
import { githubAuthFromEnv } from "./auth";
import { githubLoginFromEnv } from "./entry/githubLogin";
import { Store } from "./db";
import { CARDS_PER_BROWSER, CARDS_PER_DAY, limitFromEnv } from "./ratelimit";
import { realDeps } from "./deps";
import { TokenPool, tokensFromEnv } from "./github/tokens";
import { SCORING } from "./scoring/config";
import { EMPLOYERS_ENV, highBarEmployers } from "./scoring/employers";
import { SCHOOLS_ENV, rankedSchools } from "./scoring/school";

const prod = process.env.NODE_ENV === "production";
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const port = Number(process.env.PORT ?? 8787);
// GITHUB_TOKENS (plusieurs jetons, séparés par des virgules) ou, à défaut, GITHUB_TOKEN.
const githubTokens = tokensFromEnv(process.env);
const githubToken = githubTokens[0] ?? "";
// Fiches traitées en même temps ; les suivantes attendent leur tour (le VPS est partagé).
const maxConcurrentCards = Math.floor(Number(process.env.MAX_CONCURRENT_CARDS)) || undefined;
// Délai de traitement d'une fiche, en ms, hors file d'attente (60 s par défaut, pipeline.ts).
const cardTimeoutMs = Math.floor(Number(process.env.CARD_TIMEOUT_MS)) > 0 ? Math.floor(Number(process.env.CARD_TIMEOUT_MS)) : undefined;
const baseUrl = (process.env.BASE_URL ?? (prod ? "https://skills.azerit.tech" : "http://localhost:5180")).replace(/\/+$/, "");
const dbPath = resolve(process.env.DB_PATH ?? join(projectRoot, "var/cards.db"));
// Cache disque des images, un dossier par dessin (shared/images.ts) : og/v2/…
const ogRoot = join(dirname(dbPath), "og");
const ogDir = join(ogRoot, IMAGE_DESIGN_DIR);
const devWebUrl = (process.env.DEV_WEB_URL ?? "http://localhost:5180").replace(/\/+$/, "");
const webRoot = join(projectRoot, "dist/web");
const avatarDir = join(dirname(dbPath), "avatars");
const linkedin = linkedinFromEnv(process.env);
// Le LinkedIn de la vitrine (§18.35) : par défaut celui de Jacques, avec le pseudo par défaut.
const showcaseLinkedinRaw = process.env.SHOWCASE_LINKEDIN ?? (process.env.SHOWCASE_LOGIN ? undefined : "https://www.linkedin.com/in/jacquesmougeot");
const showcaseLinkedin = showcaseLinkedinRaw?.trim() ? (normalizeLinkedinUrl(showcaseLinkedinRaw) ?? undefined) : undefined;
if (showcaseLinkedinRaw?.trim() && !showcaseLinkedin) console.warn("SHOWCASE_LINKEDIN n'est pas une adresse de profil (linkedin.com/in/…) : vitrine sans LinkedIn.");
const githubAuth = githubAuthFromEnv(process.env);
// « Se connecter avec GitHub » (§18.80) : GITHUB_OAUTH_CLIENT_ID / _SECRET, sinon l'application de « C'est moi ».
const githubLogin = githubLoginFromEnv(process.env);
if (!githubLogin) console.warn("GITHUB_OAUTH_CLIENT_ID / GITHUB_OAUTH_CLIENT_SECRET absents (et pas de GITHUB_CLIENT_ID / _SECRET) : bouton « Se connecter avec GitHub » caché.");
// La trace du film (FILM_TRACE=1) : à côté de la base, var/film-trace.log en local.
const filmTraceFile = process.env.FILM_TRACE === "1" ? join(dirname(dbPath), "film-trace.log") : undefined;
if (filmTraceFile) console.log(`Trace du film : POST /api/film-trace écrit dans ${filmTraceFile}.`);

if (!githubToken) {
  if (prod) {
    console.error("GITHUB_TOKENS / GITHUB_TOKEN manquant : impossible de collecter les profils GitHub. Renseigne-le dans .env.");
    process.exit(1);
  }
  console.warn("[dev] GITHUB_TOKEN absent : l'API GitHub sera limitée à 60 requêtes par heure.");
} else {
  console.log(`GitHub : ${githubTokens.length} jeton(s) en rotation.`);
}
if (!process.env.OPENROUTER_API_KEY) {
  console.warn("OPENROUTER_API_KEY absent : cartes sans lecture IA (TEC peu fiable, CV illisibles).");
}
if (!linkedin) console.warn("LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET absents : photo LinkedIn désactivée.");
if (!githubAuth) {
  console.warn("GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET / SESSION_SECRET absents : « C'est moi » (revendication GitHub) désactivé.");
} else if (githubAuth.sessionSecret.length < 32) {
  console.warn("SESSION_SECRET trop court : prends au moins 32 caractères aléatoires (openssl rand -hex 32).");
}
if (prod && !existsSync(join(webRoot, "index.html"))) {
  console.warn(`Front introuvable dans ${webRoot} : lance \`npx vite build\` avant \`npm start\`.`);
}
// Les deux listes privées, hors du dépôt (SPEC §18.37, §18.50), lues dès le démarrage pour le dire ici.
const schools = rankedSchools();
if (schools.schools.length) console.log(`Écoles : ${schools.schools.length} rangs lus dans ${schools.source}.`);
else
  console.warn(
    `${SCHOOLS_ENV} absent ou illisible : aucune école listée, chaque école prend le rang de l'IA plafonné à ${SCORING.cv.TEC.school.aiMaxTier} (critère École). Poser data/schools.json sur le serveur (ops/DEPLOY.md).`,
  );
const employers = highBarEmployers();
if (employers.employers.length) console.log(`Employeurs à forte barre : ${employers.employers.length} lus dans ${employers.source}.`);
else console.warn(`${EMPLOYERS_ENV} absent ou illisible : aucun employeur à forte barre (critère Parcours). Poser data/employers.json sur le serveur (ops/DEPLOY.md).`);

/**
 * index.html du front où injecter les balises OG de /c/:id.
 * Prod : dist/web/index.html, lu une fois. Dev : demandé au serveur Vite, qui
 * y ajoute son client et le préambule React ; si Vite ne tourne pas, page autonome.
 */
let prodIndex: Promise<string | null> | null = null;
const indexHtml = prod
  ? () => (prodIndex ??= readFile(join(webRoot, "index.html"), "utf8").catch(() => null))
  : async () => {
      const res = await fetch(`${devWebUrl}/`, { signal: AbortSignal.timeout(2000) }).catch(() => null);
      return res?.ok ? res.text() : null;
    };

const store = new Store(dbPath);
// Dépense IA du jour persistée : un redémarrage ne remet pas le plafond à zéro.
useBudgetDb(store.db);
// Solde OpenRouter lu au démarrage puis toutes les 5 minutes, sans jamais
// retarder le démarrage : sous AI_MIN_CREDIT_USD (0,50 $), commissariat fermé.
startCreditsWatch();
// LinkedIn contre GitHub (§18.24) : sans jeton du fournisseur (APIFY_TOKEN, ou
// CRUSTDATA_API_KEY avec LINKEDIN_PROVIDER=crustdata), la fonctionnalité est absente.
const linkedinProfiles = linkedinProfilesFromEnv(process.env, store.db) ?? undefined;
if (linkedinProfiles) console.log(`LinkedIn : profils lus par ${linkedinProfiles.providerName}.`);
else console.warn("Fournisseur LinkedIn sans jeton : LinkedIn contre GitHub et l'entrée LinkedIn désactivés.");
// La recherche d'un profil par nom (§18.80, §18.85) : un index web, Brave puis Serper.
const linkedinPeople = (linkedinProfiles && linkedinSearchFromEnv(process.env, store.db)) || undefined;
if (linkedinPeople) console.log(`LinkedIn : recherche par nom par ${linkedinPeople.providerName}.`);
else if (linkedinProfiles) console.warn("Recherche LinkedIn par nom sans clé (BRAVE_SEARCH_API_KEY, SERPER_API_KEY) : pas de « Se connecter avec LinkedIn », le champ ne prend qu'un lien collé.");
const { app, pipeline, refreshShowcase } = createApp({
  linkedinProfiles,
  linkedinPeople,
  store,
  deps: realDeps,
  githubToken,
  githubPool: new TokenPool(githubTokens),
  maxConcurrentCards,
  timeoutMs: cardTimeoutMs,
  baseUrl,
  ogDir,
  leadsEndpoint: process.env.LEADS_ENDPOINT || undefined,
  ipSalt: process.env.IP_SALT || undefined,
  // Fiches calculées par jour : par adresse IP, et par navigateur (SPEC §18.48).
  cardsPerDay: limitFromEnv(process.env.CARDS_PER_DAY, CARDS_PER_DAY),
  cardsPerBrowser: limitFromEnv(process.env.CARDS_PER_BROWSER, CARDS_PER_BROWSER),
  showcaseLogin: process.env.SHOWCASE_LOGIN ?? "jmougeot",
  showcasePhoto: process.env.SHOWCASE_PHOTO ?? (process.env.SHOWCASE_LOGIN ? undefined : "/jmougeot-linkedin.jpg"),
  showcaseLinkedin,
  staticRoot: prod ? webRoot : undefined,
  indexHtml,
  linkedin,
  githubAuth,
  githubLogin,
  secureCookies: prod,
  avatarDir,
  filmTraceFile,
});

// Purge 90 jours (§11) au démarrage puis toutes les heures.
const runPurge = () =>
  purge(store, ogDir, Date.now(), avatarDir)
    .then((n) => n && console.log(`[purge] ${n} carte(s) expirée(s) supprimée(s)`))
    .catch((err) => console.error("[purge]", err));
void runPurge();
// Les images d'un ancien dessin ne sont plus jamais servies : on rend la place.
void pruneStaleImages(ogRoot, IMAGE_DESIGN_DIR)
  .then((n) => n && console.log(`[og] ${n} image(s) ou dossier(s) d'un ancien dessin supprimé(s)`))
  .catch((err) => console.error("[og]", err));
const purgeTimer = setInterval(runPurge, 3600_000);
purgeTimer.unref();

// La vitrine de l'accueil se refait ici, au démarrage puis tous les quarts d'heure,
// jamais à la visite : une seule à la fois, sous le plafond du jour (app.ts, refreshShowcase).
const runShowcase = () => {
  try {
    const id = refreshShowcase();
    if (id) console.log(`[vitrine] jugement relancé : ${id}`);
  } catch (err) {
    console.error("[vitrine]", err);
  }
};
runShowcase();
const showcaseTimer = setInterval(runShowcase, 15 * 60_000);
showcaseTimer.unref();

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Testyourskills API sur http://localhost:${info.port} (${prod ? "production" : "dev"}), base ${baseUrl}`);
});

// Arrêt propre : on laisse 8 s aux cartes en cours, sous les 10 s de Docker.
const shutdown = async () => {
  server.close();
  clearInterval(showcaseTimer);
  stopCreditsWatch();
  await Promise.race([pipeline.drain(), new Promise((r) => setTimeout(r, 8000))]);
  useBudgetDb(null);
  store.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
