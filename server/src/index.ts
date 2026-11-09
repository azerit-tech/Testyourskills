// Point d'entrée : lit l'environnement, ouvre la base, démarre Hono sur PORT.
// Dev : `npm run dev` (Vite sur 5180 proxifie /api, /og et /c vers 8787).
// Prod : `npm start` (NODE_ENV=production), sert aussi le front buildé de dist/web.

import { serve } from "@hono/node-server";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp, purge } from "./app";
import { useBudgetDb } from "./ai/budget";
import { checkOpenRouterCredits } from "./ai/credits";
import { linkedinFromEnv } from "./linkedin";
import { Store } from "./db";
import { realDeps } from "./deps";
import { TokenPool, tokensFromEnv } from "./github/tokens";

const prod = process.env.NODE_ENV === "production";
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const port = Number(process.env.PORT ?? 8787);
// GITHUB_TOKENS (plusieurs jetons, séparés par des virgules) ou, à défaut, GITHUB_TOKEN.
const githubTokens = tokensFromEnv(process.env);
const githubToken = githubTokens[0] ?? "";
const baseUrl = (process.env.BASE_URL ?? (prod ? "https://skills.azerit.tech" : "http://localhost:5180")).replace(/\/+$/, "");
const dbPath = resolve(process.env.DB_PATH ?? join(projectRoot, "var/cards.db"));
const ogDir = join(dirname(dbPath), "og");
const devWebUrl = (process.env.DEV_WEB_URL ?? "http://localhost:5180").replace(/\/+$/, "");
const webRoot = join(projectRoot, "dist/web");
const avatarDir = join(dirname(dbPath), "avatars");
const linkedin = linkedinFromEnv(process.env);

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
if (prod && !existsSync(join(webRoot, "index.html"))) {
  console.warn(`Front introuvable dans ${webRoot} : lance \`npx vite build\` avant \`npm start\`.`);
}

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
// Solde OpenRouter : simple avertissement sous 2 $, sans jamais retarder le démarrage.
void checkOpenRouterCredits();
const { app, pipeline } = createApp({
  store,
  deps: realDeps,
  githubToken,
  githubPool: new TokenPool(githubTokens),
  baseUrl,
  ogDir,
  leadsEndpoint: process.env.LEADS_ENDPOINT || undefined,
  ipSalt: process.env.IP_SALT || undefined,
  showcaseLogin: process.env.SHOWCASE_LOGIN ?? "jmougeot",
  showcasePhoto: process.env.SHOWCASE_PHOTO ?? (process.env.SHOWCASE_LOGIN ? undefined : "/jmougeot-linkedin.jpg"),
  staticRoot: prod ? webRoot : undefined,
  indexHtml,
  linkedin,
  avatarDir,
});

// Purge 90 jours (§11) au démarrage puis toutes les heures.
const runPurge = () =>
  purge(store, ogDir, Date.now(), avatarDir)
    .then((n) => n && console.log(`[purge] ${n} carte(s) expirée(s) supprimée(s)`))
    .catch((err) => console.error("[purge]", err));
void runPurge();
const purgeTimer = setInterval(runPurge, 3600_000);
purgeTimer.unref();

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Testyourskills API sur http://localhost:${info.port} (${prod ? "production" : "dev"}), base ${baseUrl}`);
});

// Arrêt propre : on laisse 8 s aux cartes en cours, sous les 10 s de Docker.
const shutdown = async () => {
  server.close();
  await Promise.race([pipeline.drain(), new Promise((r) => setTimeout(r, 8000))]);
  useBudgetDb(null);
  store.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
