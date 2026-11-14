// Sauvegarde de la base SQLite (ops/DEPLOY.md, « Sauvegarde de la base »).
// Copie cohérente par l'API de sauvegarde de SQLite (better-sqlite3 `backup`),
// sans arrêter le serveur et sans risque de copier une page à moitié écrite,
// contrairement à un `cp` du fichier en cours d'écriture (mode WAL). La copie est
// horodatée, vérifiée (`PRAGMA quick_check`), autonome (journal DELETE, sans
// fichier -wal), posée dans le dossier `backups/` à côté de la base (le volume
// /data en production), et seules les BACKUP_KEEP dernières sont gardées.
//
// Usage : npm run backup                          (DB_PATH, sinon var/cards.db)
//         tsx scripts/backup.ts [--dir DOSSIER] [--keep N]
// En production : docker exec testyourskills node_modules/.bin/tsx scripts/backup.ts
// Codes de sortie : 0 sauvegardée ; 1 échec (rien d'ancien n'est effacé).

import Database from "better-sqlite3";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const BACKUP_KEEP = 14;
const NAME_RE = /^cards-\d{8}-\d{6}Z\.db$/;

/** cards-20261119-031700Z.db : l'heure UTC, triable par nom. */
export function backupName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `cards-${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}Z.db`;
}

export interface BackupResult {
  file: string;
  bytes: number;
  /** Anciennes sauvegardes effacées. */
  removed: string[];
}

export async function backupDatabase(dbPath: string, opts: { dir?: string; keep?: number; now?: Date } = {}): Promise<BackupResult> {
  const dir = opts.dir ?? join(dirname(dbPath), "backups");
  const keep = Math.max(1, Math.floor(opts.keep ?? BACKUP_KEEP));
  if (!existsSync(dbPath)) throw new Error(`base introuvable : ${dbPath}`);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, backupName(opts.now ?? new Date()));
  // Écrite sous un nom provisoire, renommée une fois vérifiée : une copie
  // interrompue ne passe jamais pour une sauvegarde, ni n'en chasse une bonne.
  const tmp = `${file}.partiel`;
  rmSync(tmp, { force: true });
  const src = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    await src.backup(tmp);
  } finally {
    src.close();
  }
  const copy = new Database(tmp);
  try {
    copy.pragma("journal_mode = DELETE");
    const check = copy.pragma("quick_check", { simple: true });
    if (check !== "ok") throw new Error(`copie invalide (quick_check : ${String(check)})`);
  } catch (err) {
    copy.close();
    rmSync(tmp, { force: true });
    throw err;
  }
  copy.close();
  renameSync(tmp, file);

  const all = readdirSync(dir)
    .filter((f) => NAME_RE.test(f))
    .sort();
  const removed = all.slice(0, Math.max(0, all.length - keep));
  for (const f of removed) rmSync(join(dir, f), { force: true });
  return { file, bytes: statSync(file).size, removed };
}

function arg(name: string): string | undefined {
  const args = process.argv.slice(2);
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const dbPath = resolve(process.env.DB_PATH ?? join(import.meta.dirname, "../var/cards.db"));
  const keepRaw = arg("--keep");
  const keep = keepRaw === undefined ? BACKUP_KEEP : Number(keepRaw);
  if (!Number.isInteger(keep) || keep < 1) {
    console.error("--keep attend un entier positif, ex. --keep 14");
    process.exit(1);
  }
  const dirArg = arg("--dir");
  try {
    const t0 = Date.now();
    const r = await backupDatabase(dbPath, { keep, dir: dirArg ? resolve(dirArg) : undefined });
    console.log(`${new Date().toISOString()} sauvegarde ${r.file} (${(r.bytes / 1e6).toFixed(1)} Mo, ${Date.now() - t0} ms)${r.removed.length ? `, ${r.removed.length} ancienne(s) effacée(s)` : ""}`);
  } catch (err) {
    console.error(`${new Date().toISOString()} sauvegarde impossible : ${(err as Error).message}`);
    process.exit(1);
  }
}
