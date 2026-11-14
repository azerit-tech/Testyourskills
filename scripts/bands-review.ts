// Relecture à la main des bandes de boîte au nom libre (SPEC §18.38) : celles qui
// ne sont pas dans la table d'alias de data/bands.json, avec leurs dossiers, le
// libellé affiché et les noms tapés. Lit la base DB_PATH en lecture seule.
// Usage : npm run bands:review
// Pour fermer une bande : ajouter « boite/son-id » à `blocked` dans
// data/bands.json, puis redéployer (la liste est lue au démarrage du serveur).
import Database from "better-sqlite3";
import { join, resolve } from "node:path";
import { BAND_MIN_MEMBERS, cleanCompanyLabel, companyAliasLabel, isBlockedBand } from "../shared/bands";

const path = resolve(process.env.DB_PATH ?? join(import.meta.dirname, "../var/cards.db"));
let db: Database.Database;
try {
  db = new Database(path, { readonly: true, fileMustExist: true });
} catch (err) {
  console.error(`Base introuvable ou illisible : ${path} (${(err as Error).message})`);
  process.exit(1);
}

const now = Date.now();
const rows = db
  .prepare(
    `SELECT m.band_id AS id, m.label, m.joined_at AS at,
            (c.id IS NOT NULL AND c.degraded = 0 AND (c.expires_at IS NULL OR c.expires_at > ?)) AS live
     FROM band_members m LEFT JOIN cards c ON c.id = m.card_id
     WHERE m.kind = 'boite'
     ORDER BY m.band_id, m.joined_at`,
  )
  .all(now) as { id: string; label: string; at: number; live: number }[];
db.close();

interface Band {
  id: string;
  first: string;
  names: Set<string>;
  live: number;
  total: number;
}
const bands = new Map<string, Band>();
for (const r of rows) {
  if (companyAliasLabel(r.id) !== null) continue;
  let b = bands.get(r.id);
  if (!b) bands.set(r.id, (b = { id: r.id, first: r.label, names: new Set(), live: 0, total: 0 }));
  b.names.add(r.label);
  b.total += 1;
  if (r.live) b.live += 1;
}

const list = [...bands.values()].sort((a, b) => b.live - a.live || a.id.localeCompare(b.id));
if (!list.length) {
  console.log("Aucune bande de boîte au nom libre.");
  process.exit(0);
}

const cell = (s: string) => s.replace(/\|/g, "\\|");
console.log(`${list.length} bande(s) de boîte au nom libre. Page publique à partir de ${BAND_MIN_MEMBERS} dossiers en ligne.\n`);
console.log("| dossiers en ligne (total) | page | état | adresse | libellé affiché | noms tapés |");
console.log("|---|---|---|---|---|---|");
for (const b of list) {
  const blocked = isBlockedBand("boite", b.id, b.first);
  const page = !blocked && b.live >= BAND_MIN_MEMBERS ? "oui" : "non";
  const state = blocked ? "fermée" : "ouverte";
  const names = [...b.names].map((n) => `« ${cell(n)} »`).join(", ");
  console.log(`| ${b.live} (${b.total}) | ${page} | ${state} | /bandes/boite/${b.id} | ${cell(cleanCompanyLabel(b.first) || b.id)} | ${names} |`);
}
console.log(`\nFermer une bande : ajouter "boite/<id>" à "blocked" dans data/bands.json, puis redéployer.`);
