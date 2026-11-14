// Les dix finalistes d'une prime (§18.4), sur la sortie standard, en local :
// pseudo, email, lien de fiche, preuves. Rien n'est envoyé, rien n'est publié,
// rien n'est écrit dans un journal : la transmission à l'entreprise se fait à la
// main, pour les personnes qui l'ont acceptée en concourant.
// Usage : npm run finalists -- --prime <id> [--csv]
// Lit DB_PATH (var/cards.db par défaut), SEASON_FILE (data/season.json), BASE_URL.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { Store } from "../server/src/db";
import { finalists, finalistsCsv, finalistsText } from "../server/src/finalists";
import { primeById } from "../server/src/primes";
import { loadSeason } from "../server/src/season";

const args = process.argv.slice(2);
const at = args.indexOf("--prime");
const id = at >= 0 ? args[at + 1] : args.find((a) => a.startsWith("--prime="))?.slice(8);
const csv = args.includes("--csv");

const season = loadSeason();
if (!season || season.primes.length === 0) {
  console.error("Aucune prime dans la saison (data/season.json ou SEASON_FILE).");
  process.exit(1);
}
const prime = id ? primeById(season, id) : null;
if (!prime) {
  console.error(`${id ? `Prime inconnue : ${id}.` : "--prime manquant."} Primes de la saison : ${season.primes.map((p) => p.id).join(", ")}`);
  process.exit(1);
}

const path = resolve(process.env.DB_PATH ?? join(import.meta.dirname, "../var/cards.db"));
if (!existsSync(path)) {
  console.error(`Base introuvable : ${path}`);
  process.exit(1);
}
const baseUrl = (process.env.BASE_URL ?? "https://skills.azerit.tech").replace(/\/+$/, "");
const store = new Store(path);
const report = finalists(store, season, prime, baseUrl);
console.log(csv ? finalistsCsv(report) : finalistsText(report));
store.close();
