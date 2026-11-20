// Rattrapage du §18.116 : les dossiers LinkedIn + GitHub des personnes connectées à LinkedIn,
// avec le GitHub qu'elles ont donné ou confirmé, entrent au top s'il est plausiblement le leur.
// Logique et tests : server/src/rattrapageConnectes.ts.
//
// Usage, en production (sauvegarde d'abord, ops/DEPLOY.md) :
//   ssh azerit docker exec testyourskills node_modules/.bin/tsx ops/rattrapage-dossiers-connectes.ts         # ce qu'il ferait
//   ssh azerit docker exec testyourskills node_modules/.bin/tsx ops/rattrapage-dossiers-connectes.ts --oui   # le fait
// Sans --oui, rien n'est écrit. Idempotent : relancé, il ne trouve plus rien à faire.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { Store } from "../server/src/db";
import { proveSignedInDossiers, signedInDossiers } from "../server/src/rattrapageConnectes";

const apply = process.argv.includes("--oui");
const dbPath = resolve(process.env.DB_PATH ?? join(import.meta.dirname, "../var/cards.db"));
if (!existsSync(dbPath)) {
  console.error(`Base introuvable : ${dbPath}`);
  process.exit(1);
}
const store = new Store(dbPath);
const list = signedInDossiers(store);
for (const d of list) {
  console.log(`${d.proof ? "à prouver" : "reste    "} ${d.id}  @${d.login}  ${d.linkedinUrl}  « ${d.name} » / GitHub « ${d.githubName ?? "—"} »${d.proof ? `  (${d.proof})` : ""}`);
}
const todo = list.filter((d) => d.proof).length;
if (!apply) {
  console.log(`${list.length} dossier(s) de personnes connectées non prouvés ; ${todo} à prouver. Rien n'est écrit : relancer avec --oui.`);
} else {
  const n = proveSignedInDossiers(store, list);
  console.log(`${n} dossier(s) prouvé(s), ${list.length - n} laissé(s) hors du top.`);
}
store.close();
