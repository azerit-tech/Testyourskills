// La référence du rang (SPEC §18.3, calibration du §4.6) : des profils GitHub
// sourcés par Azerit passent dans le vrai moteur, et il n'en sort que des
// agrégats dans data/percentiles.json (centiles de la note globale, en tout,
// par langage et par poste, et fréquence de chaque statut). La logique est dans
// server/src/percentiles.ts ; ici, le câblage réel et la ligne de commande.
//
// ─── Mode d'emploi, pour Jacques ─────────────────────────────────────────────
//
// 1. Préparer le fichier de pseudos : un pseudo GitHub par ligne (une URL
//    github.com/pseudo ou un @pseudo passent aussi ; lignes vides, lignes en `#`
//    et doublons ignorés). Le mettre dans var/ (ignoré par git). Les dumps de
//    sourcing sont des données personnelles : aucun agent ne les a ouverts, la
//    commande ci-dessous est générique, à adapter à leur format réel.
//
//      grep -rhoE 'github\.com/[A-Za-z0-9-]{1,39}' ../hiring-traces ../App/recruiting \
//        | sed -E 's#^github\.com/##' \
//        | grep -viE '^(orgs|sponsors|features|about|pricing|topics|collections|marketplace|settings|apps|login|join|enterprise|site|security|customer-stories|readme|trending|explore)$' \
//        | sort -fu > var/logins.txt
//      wc -l var/logins.txt
//
//    Si les dumps sont en JSON avec un champ du pseudo (nom à vérifier) :
//      jq -r '.. | .github_login? // empty' ../App/recruiting/*.json | sort -fu > var/logins.txt
//
//    Pour un premier essai, prendre un extrait : `shuf -n 50 var/logins.txt > var/essai.txt`.
//    Les organisations et les pseudos inconnus sont ignorés en route.
//
// 2. Lancer (il faut GITHUB_TOKENS ou GITHUB_TOKEN dans .env, sinon `gh auth token` ;
//    et OPENROUTER_API_KEY pour la lecture IA, avec AI_MODEL_CODE=anthropic/claude-haiku-5.5) :
//
//      npm run percentiles -- --logins var/logins.txt
//
//    Options : --ai-sample N (profils lus par l'IA, 300 par défaut), --max-usd X
//    (plafond de dépense IA, 3 par défaut, cumulé sur tous les passages),
//    --salt S (sel du hachage ; sinon tiré au hasard et gardé dans le fichier
//    de travail), --work chemin (var/percentiles-work.jsonl), --out chemin
//    (data/percentiles.json), --aggregate-only (écrit la sortie depuis le
//    fichier de travail tel quel, sans appeler GitHub ni l'IA).
//
// 3. Ctrl-C à tout moment : les profils déjà notés sont gardés. Relancer la même
//    commande reprend où ça s'est arrêté. Changer de barème refait les profils.
//    Repartir de zéro : supprimer var/percentiles-work.jsonl.
//
// 4. Relire data/percentiles.json (que des nombres et des noms de langages, de
//    postes et de statuts), puis le committer : le serveur l'applique au
//    démarrage, sur les cartes du même barème seulement.
//
// Durée : environ 45 appels REST par profil, un profil à la fois, et le script
// attend la remise à zéro du compteur quand un jeton est à sec. Compter
// environ 100 à 200 profils par heure avec un jeton, à peu près le double avec
// deux, soit pour 1 000 profils 5 à 10 h avec un jeton et 3 à 5 h avec deux.
// L'estimation réelle s'affiche à chaque profil. Le serveur de production
// partage peut-être ces jetons : lancer de préférence la nuit.
//
// Coût : seule la lecture IA coûte, sur l'échantillon. En Haiku 5.5, environ
// 0,002 $ par profil lu (15 000 tokens d'entrée), donc environ 0,60 $ pour 300
// profils et 2 $ pour 1 000. Sans AI_MODEL_CODE, le code retombe sur Haiku 4.5,
// dix fois plus cher : le plafond de 3 $ s'arrêterait vers 150 profils lus.
// Les profils non lus gardent le TEC de repli décalé de l'écart médian mesuré
// sur les profils lus (voir referenceOverall) ; la sortie dit combien ont le TEC réel.

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { aiConfigured, aiCostToday } from "../server/src/ai/budget";
import { DEFAULT_MODEL } from "../server/src/ai/client";
import { readCode } from "../server/src/ai/readCode";
import { collectGithub, pickFilesForReading } from "../server/src/github/collect";
import { TokenPool, tokensFromEnv } from "../server/src/github/tokens";
import { DEFAULT_AI_SAMPLE, DEFAULT_MAX_USD, runPercentiles, type Engine } from "../server/src/percentiles";
import { scoreGithub } from "../server/src/scoring/index";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);

function opt(name: string): string | undefined {
  const i = args.indexOf(name);
  if (i >= 0) return args[i + 1];
  return args.find((a) => a.startsWith(name + "="))?.slice(name.length + 1);
}

function num(name: string, fallback: number, check: (n: number) => boolean): number {
  const raw = opt(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !check(n)) {
    console.error(`${name} : valeur invalide « ${raw} »`);
    process.exit(1);
  }
  return n;
}

const aggregateOnly = args.includes("--aggregate-only");
const loginsPath = opt("--logins");
if (!loginsPath && !aggregateOnly) {
  console.error("usage : npm run percentiles -- --logins var/logins.txt [--ai-sample 300] [--max-usd 3] [--salt S] [--aggregate-only]");
  console.error("Mode d'emploi complet en tête de scripts/percentiles.ts.");
  process.exit(1);
}
if (loginsPath && !existsSync(loginsPath)) {
  console.error(`Fichier de pseudos introuvable : ${loginsPath}`);
  process.exit(1);
}

const aiSample = num("--ai-sample", DEFAULT_AI_SAMPLE, (n) => Number.isInteger(n) && n >= 0);
const maxUsd = num("--max-usd", DEFAULT_MAX_USD, (n) => n >= 0);

// Le plafond du script fait foi : celui du serveur (AI_DAILY_BUDGET_USD) ne doit pas couper avant.
process.env.AI_DAILY_BUDGET_USD = String(maxUsd + 1);

let tokens = tokensFromEnv(process.env);
if (!tokens.length && !aggregateOnly) {
  try {
    tokens = [execSync("gh auth token", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim()].filter(Boolean);
  } catch {
    /* pas de gh */
  }
}
if (!tokens.length && !aggregateOnly) {
  console.error("Aucun jeton GitHub : mettre GITHUB_TOKENS (séparés par des virgules) ou GITHUB_TOKEN dans .env, ou se connecter avec `gh auth login`.");
  process.exit(1);
}

if (!aggregateOnly) {
  const model = process.env.AI_MODEL_CODE || DEFAULT_MODEL;
  console.error(`${tokens.length} jeton(s) GitHub · lecture IA : ${aiConfigured() ? model : "non configurée"}`);
  if (aiConfigured() && !/haiku-5/.test(model)) {
    console.error(`Attention : ${model} coûte environ dix fois Haiku 5.5. AI_MODEL_CODE=anthropic/claude-haiku-5.5 dans .env pour l'éviter.`);
  }
}

// Le même moteur que le serveur (deps.ts), sans le rendu ni le CV.
const engine: Engine = { collectGithub, pickFilesForReading, readCode, aiAvailable: aiConfigured, scoreGithub };

// Premier Ctrl-C : on finit proprement (le profil en cours est perdu, pas les autres). Second : on coupe.
const ac = new AbortController();
process.on("SIGINT", () => {
  if (ac.signal.aborted) process.exit(130);
  console.error("\nInterruption demandée…");
  ac.abort(new Error("interrompu"));
});

const res = await runPercentiles({
  lines: loginsPath ? readFileSync(loginsPath, "utf8").split("\n") : [],
  workPath: resolve(opt("--work") ?? join(root, "var/percentiles-work.jsonl")),
  outPath: resolve(opt("--out") ?? join(root, "data/percentiles.json")),
  engine,
  pool: new TokenPool(tokens),
  spentUsd: () => aiCostToday().usd,
  aiSample,
  maxUsd,
  salt: opt("--salt"),
  aggregateOnly,
  signal: ac.signal,
});

process.exit(res.complete ? 0 : 130);
