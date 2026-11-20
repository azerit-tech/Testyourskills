// Rattrapage des bandes (§18.82, §18.119) : les fiches vivantes qui entrent au classement entrent
// dans la bande de leur école et de leur boîte, par la même entrée d'office qu'une fiche neuve.
// Une ligue déjà tenue ou quittée à la main n'est jamais touchée. Logique et tests :
// server/src/rattrapageBandes.ts.
//
// Usage, en production (sauvegarde d'abord, ops/DEPLOY.md) :
//   ssh azerit docker exec testyourskills node_modules/.bin/tsx ops/rattrapage-bandes.ts         # ce qu'il ferait
//   ssh azerit docker exec testyourskills node_modules/.bin/tsx ops/rattrapage-bandes.ts --oui   # le fait
// Sans --oui, rien n'est écrit. Idempotent : relancé, il ne trouve plus rien à faire.
// Les classements gardés par le serveur (60 s) se recalculent d'eux-mêmes.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { Store } from "../server/src/db";
import { catchUpBands } from "../server/src/rattrapageBandes";

const apply = process.argv.includes("--oui");
const dbPath = resolve(process.env.DB_PATH ?? join(import.meta.dirname, "../var/cards.db"));
if (!existsSync(dbPath)) {
  console.error(`Base introuvable : ${dbPath}`);
  process.exit(1);
}
const store = new Store(dbPath);
const list = catchUpBands(store, { apply });
for (const d of list) {
  const bands = d.joined.map((j) => `${j.type === "ecole" ? "école" : "boîte"} « ${j.label} »`).join(", ") || "—";
  console.log(`${d.id}  ${d.who}  →  ${bands}${d.moved ? "  (entrées de sa fiche d'avant reprises)" : ""}`);
}
const joins = list.reduce((n, d) => n + d.joined.length, 0);
console.log(
  apply
    ? `${list.length} fiche(s), ${joins} entrée(s) écrite(s).`
    : `${list.length} fiche(s), ${joins} entrée(s) à faire. Rien n'est écrit : relancer avec --oui.`,
);
store.close();
