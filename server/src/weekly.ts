// Le tableau de la semaine (SPEC §13, §18.0) : une ligne par semaine ISO, du
// lundi au dimanche en UTC, la plus récente en premier. Lu par scripts/weekly.ts
// sur la base de production ouverte en lecture seule.
//
// Une « fiche » est une ligne racine de `cards` (carte seule ou comparaison),
// jamais l'une des deux cartes enfants d'une comparaison. Les parts (partagée,
// avec email) se calculent sur les fiches nées dans la semaine ; les clics et
// les visites sont comptés dans la semaine où ils ont lieu.

import type Database from "better-sqlite3";

const DAY_MS = 24 * 3600 * 1000;
const WEEK_MS = 7 * DAY_MS;

export interface WeekRow {
  /** Lundi 00:00 UTC, en ms. */
  start: number;
  /** Étiquette ISO, ex. « 2026-W46 ». */
  label: string;
  generated: number;
  shared: number;
  withEmail: number;
  ctaClicks: number;
  sharedVisits: number;
  /** Fiches nées d'un partage, hors fiches faites sur le même pseudo que la fiche d'origine. */
  bornFromShare: number;
}

/** Lundi 00:00 UTC de la semaine qui contient `t`. */
export function weekStart(t: number): number {
  const d = new Date(t);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const sinceMonday = (d.getUTCDay() + 6) % 7; // lundi = 0
  return midnight - sinceMonday * DAY_MS;
}

/** Semaine ISO 8601 : l'année est celle du jeudi de la semaine. */
export function isoWeekLabel(monday: number): string {
  const thursday = new Date(monday + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - weekStart(Date.UTC(year, 0, 4))) / WEEK_MS) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function hasColumn(db: Database.Database, table: string, col: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === col);
}

/** Les `weeks` dernières semaines, semaine en cours comprise, les plus récentes en premier. */
export function weeklyReport(db: Database.Database, opts: { weeks?: number; now?: number } = {}): WeekRow[] {
  const weeks = Math.max(1, Math.floor(opts.weeks ?? 8));
  const current = weekStart(opts.now ?? Date.now());
  const from = current - (weeks - 1) * WEEK_MS;
  const rows: WeekRow[] = [];
  for (let i = 0; i < weeks; i++) {
    const start = current - i * WEEK_MS;
    rows.push({ start, label: isoWeekLabel(start), generated: 0, shared: 0, withEmail: 0, ctaClicks: 0, sharedVisits: 0, bornFromShare: 0 });
  }
  const at = (t: number) => rows[Math.floor((current - weekStart(t)) / WEEK_MS)];

  // Base antérieure à la colonne (jamais ouverte par le serveur depuis) : aucune origine connue.
  const withRef = hasColumn(db, "cards", "ref_card_id");
  const refSelect = withRef ? `c.ref_card_id AS ref, o.login AS ref_login` : `NULL AS ref, NULL AS ref_login`;
  const refJoin = withRef ? `LEFT JOIN cards o ON o.id = c.ref_card_id` : "";
  const cards = db
    .prepare(
      `SELECT c.created_at, c.login, c.email IS NOT NULL AS has_email,
              EXISTS (SELECT 1 FROM events e WHERE e.event = 'card_shared' AND e.card_id = c.id) AS shared,
              ${refSelect}
       FROM cards c ${refJoin}
       WHERE c.parent_id IS NULL AND c.created_at >= ?`,
    )
    .all(from) as { created_at: number; login: string | null; has_email: number; shared: number; ref: string | null; ref_login: string | null }[];

  for (const c of cards) {
    const w = at(c.created_at);
    if (!w) continue; // date dans le futur
    w.generated++;
    if (c.shared) w.shared++;
    if (c.has_email) w.withEmail++;
    // Recliquer sur son propre lien ne fait pas une fiche née d'un partage.
    const sameLogin = c.login !== null && c.ref_login !== null && c.login === c.ref_login;
    if (c.ref && !sameLogin) w.bornFromShare++;
  }

  const events = db
    .prepare(`SELECT at, event FROM events WHERE at >= ? AND event IN ('cta_azerit_clicked', 'shared_visit')`)
    .all(from) as { at: number; event: string }[];
  for (const e of events) {
    const w = at(e.at);
    if (!w) continue;
    if (e.event === "cta_azerit_clicked") w.ctaClicks++;
    else w.sharedVisits++;
  }

  return rows;
}

/** Coefficient viral : fiches nées d'un partage / fiches générées, deux décimales. */
export function viralCoefficient(w: Pick<WeekRow, "generated" | "bornFromShare">): string {
  return w.generated ? (w.bornFromShare / w.generated).toFixed(2) : "—";
}

function share(n: number, total: number): string {
  return total ? `${Math.round((100 * n) / total)} % (${n})` : "—";
}

function dayMonth(t: number): string {
  const d = new Date(t);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Tableau markdown, une ligne par semaine. */
export function formatWeekly(rows: WeekRow[]): string {
  const head = [
    "Semaine",
    "Fiches générées",
    "Partagées",
    "Avec email",
    "Clics azerit.tech",
    "Visites par partage",
    "Nées d'un partage",
    "Coefficient viral",
  ];
  const lines = [`| ${head.join(" | ")} |`, `|${head.map((_, i) => (i === 0 ? " --- " : " ---: ")).join("|")}|`];
  for (const w of rows) {
    const cells = [
      `${w.label} (${dayMonth(w.start)} → ${dayMonth(w.start + 6 * DAY_MS)})`,
      String(w.generated),
      share(w.shared, w.generated),
      share(w.withEmail, w.generated),
      String(w.ctaClicks),
      String(w.sharedVisits),
      String(w.bornFromShare),
      viralCoefficient(w),
    ];
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}
