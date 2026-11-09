// Le tableau de la semaine (SPEC §13, §18.0), en markdown sur la sortie standard.
// Lit la base DB_PATH en lecture seule : sans risque sur la base de production.
// Usage : npm run weekly [-- --weeks N]   (8 semaines par défaut)
import Database from "better-sqlite3";
import { join, resolve } from "node:path";
import { formatWeekly, weeklyReport } from "../server/src/weekly";

const args = process.argv.slice(2);
const i = args.indexOf("--weeks");
const raw = i >= 0 ? args[i + 1] : args.find((a) => a.startsWith("--weeks="))?.slice(8);
const weeks = raw === undefined ? 8 : Number(raw);
if (!Number.isInteger(weeks) || weeks < 1) {
  console.error("--weeks attend un entier positif, ex. --weeks 12");
  process.exit(1);
}

const path = resolve(process.env.DB_PATH ?? join(import.meta.dirname, "../var/cards.db"));
let db: Database.Database;
try {
  db = new Database(path, { readonly: true, fileMustExist: true });
} catch (err) {
  console.error(`Base introuvable ou illisible : ${path} (${(err as Error).message})`);
  process.exit(1);
}

console.log(formatWeekly(weeklyReport(db, { weeks })));
db.close();
