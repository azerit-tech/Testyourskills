// La sauvegarde de la base (scripts/backup.ts) sur une base jetable, en WAL, écrite pendant la copie.
import Database from "better-sqlite3";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../shared/fixtures";
import { Store } from "../server/src/db";
import { BACKUP_KEEP, backupDatabase, backupName } from "./backup";

function base() {
  const dir = mkdtempSync(join(tmpdir(), "tys-backup-"));
  const store = new Store(join(dir, "cards.db"));
  const add = (i: number) =>
    store.insertCards([{ id: `Card${String(i).padStart(6, "0")}`, createdAt: Date.now(), source: "github", login: `dev${i}`, kind: "card", data: { ...FIXTURES.gold, id: `Card${i}` }, deleteToken: "t" }]);
  return { dir, store, add };
}

describe("sauvegarde de la base", () => {
  it("une copie cohérente, autonome et vérifiée, base ouverte en WAL", async () => {
    const { dir, store, add } = base();
    for (let i = 0; i < 50; i++) add(i);
    // La base sert pendant la copie : des écritures arrivent encore.
    const writing = (async () => {
      for (let i = 50; i < 80; i++) {
        add(i);
        await new Promise((r) => setImmediate(r));
      }
    })();
    const r = await backupDatabase(join(dir, "cards.db"), { now: new Date(Date.UTC(2026, 10, 19, 3, 17, 0)) });
    await writing;
    expect(r.file).toBe(join(dir, "backups", "cards-20261119-031700Z.db"));
    expect(existsSync(`${r.file}-wal`)).toBe(false);
    const copy = new Database(r.file, { readonly: true });
    expect(copy.pragma("journal_mode", { simple: true })).toBe("delete");
    expect(copy.pragma("integrity_check", { simple: true })).toBe("ok");
    const n = (copy.prepare("SELECT COUNT(*) AS n FROM cards").get() as { n: number }).n;
    expect(n).toBeGreaterThanOrEqual(50);
    expect(n).toBeLessThanOrEqual(80);
    copy.close();
    store.close();
  });

  it(`garde les ${BACKUP_KEEP} dernières, ne touche à rien d'autre`, async () => {
    const { dir, store, add } = base();
    add(1);
    const out = join(dir, "backups");
    for (let d = 1; d <= 16; d++) await backupDatabase(join(dir, "cards.db"), { now: new Date(Date.UTC(2026, 10, d, 3)) });
    writeFileSync(join(out, "notes.txt"), "à garder");
    const last = await backupDatabase(join(dir, "cards.db"), { now: new Date(Date.UTC(2026, 10, 17, 3)) });
    const files = readdirSync(out).sort();
    expect(files.filter((f) => f.endsWith(".db"))).toHaveLength(BACKUP_KEEP);
    expect(files[0]).toBe(backupName(new Date(Date.UTC(2026, 10, 4, 3))));
    expect(files).toContain("notes.txt");
    expect(last.removed).toEqual([backupName(new Date(Date.UTC(2026, 10, 3, 3)))]);
    store.close();
  });

  it("base introuvable : une erreur claire, rien d'écrit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tys-backup-"));
    await expect(backupDatabase(join(dir, "absente.db"))).rejects.toThrow(/introuvable/);
    expect(existsSync(join(dir, "backups"))).toBe(false);
  });
});
