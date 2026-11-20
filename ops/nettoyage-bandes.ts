// Nettoyage des bandes (§18.123) : une personne, une ligne par ligue. Les entrées des fiches
// remplacées passent au dossier qui les remplace ; celles d'une pièce, à son dossier ; une
// deuxième fiche de la même personne (même login ou même LinkedIn) sort. Les sorties à la main
// restent. Logique et tests : server/src/nettoyageBandes.ts.
//
// Usage, en production (sauvegarde d'abord, ops/DEPLOY.md) :
//   ssh azerit docker exec testyourskills node_modules/.bin/tsx ops/nettoyage-bandes.ts         # ce qu'il ferait
//   ssh azerit docker exec testyourskills node_modules/.bin/tsx ops/nettoyage-bandes.ts --oui   # le fait
// Sans --oui, rien n'est écrit. Idempotent : relancé, il ne trouve plus rien à faire.
// Les classements gardés par le serveur (60 s) se recalculent d'eux-mêmes.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { Store } from "../server/src/db";
import { cleanBands } from "../server/src/nettoyageBandes";

const apply = process.argv.includes("--oui");
const dbPath = resolve(process.env.DB_PATH ?? join(import.meta.dirname, "../var/cards.db"));
if (!existsSync(dbPath)) {
  console.error(`Base introuvable : ${dbPath}`);
  process.exit(1);
}
const store = new Store(dbPath);
const r = cleanBands(store, { apply });
for (const a of r.adopted) console.log(`${a.id}  reprend les entrées des fiches qu'il remplace (${a.changes} ligne(s))`);
for (const p of r.pieces) console.log(`${p.pieceId}  pièce  →  son dossier ${p.dossierId}`);
const why = { superseded: "fiche remplacée", duplicate: "déjà comptée dans la ligue", piece: "pièce" } as const;
for (const x of r.removed) console.log(`${x.cardId}  ${x.personKey}  sort de ${x.type === "ecole" ? "l'école" : "la boîte"} « ${x.band} » (${why[x.why]})`);
const total = r.adopted.length + r.pieces.length + r.removed.length;
console.log(
  apply
    ? `${r.adopted.length} dossier(s) repris, ${r.pieces.length} pièce(s), ${r.removed.length} entrée(s) supprimée(s). Écrit.`
    : `${total ? `${r.adopted.length} dossier(s) à reprendre, ${r.pieces.length} pièce(s), ${r.removed.length} entrée(s) à supprimer` : "Rien à faire"}. Rien n'est écrit : relancer avec --oui.`,
);
store.close();
