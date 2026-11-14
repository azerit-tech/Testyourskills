// Tableau de la semaine (§13, §18.0) sur une base de test en mémoire.

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURES } from "../../shared/fixtures";
import { EVENTS_RETENTION_MS, Store, type NewCardRow } from "./db";
import { formatWeekly, isoWeekLabel, viralCoefficient, weekStart, weeklyReport } from "./weekly";

const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
});

// Lundi 9 novembre 2026, 00:00 UTC : semaine ISO 2026-W46.
const W46 = Date.UTC(2026, 10, 9);
const W45 = W46 - 7 * 24 * 3600 * 1000;
const NOW = W46 + 2 * 24 * 3600 * 1000 + 15 * 3600 * 1000; // mercredi 11, 15:00
const H = 3600 * 1000;

function card(id: string, createdAt: number, login: string | null, over: Partial<NewCardRow> = {}): NewCardRow {
  return {
    id,
    createdAt,
    source: login ? "github" : "cv",
    login,
    kind: "card",
    data: { ...FIXTURES.gold, id },
    deleteToken: "tok",
    ...over,
  };
}

describe("semaines ISO", () => {
  it("du lundi au dimanche en UTC, numérotées selon l'ISO 8601", () => {
    expect(weekStart(NOW)).toBe(W46);
    expect(weekStart(W46)).toBe(W46);
    expect(weekStart(W46 - 1)).toBe(W45); // dimanche 23:59:59.999
    expect(isoWeekLabel(W46)).toBe("2026-W46");
    // Le 1er janvier 2027 est un vendredi : il appartient à la semaine 53 de 2026.
    expect(isoWeekLabel(weekStart(Date.UTC(2027, 0, 1)))).toBe("2026-W53");
    expect(isoWeekLabel(weekStart(Date.UTC(2027, 0, 4)))).toBe("2027-W01");
  });
});

describe("weeklyReport", () => {
  it("compte fiches, parts, clics, visites et fiches nées d'un partage, hors même login", () => {
    const store = new Store(":memory:");
    stores.push(store);
    store.insertCards([
      // Semaine 45 : la fiche d'origine, partagée.
      card("Origin0001", W45 + 10 * H, "lea"),
      // Semaine 46.
      card("Child00001", W46 + 1 * H, "tom", { refCardId: "Origin0001" }), // née d'un partage
      card("Self000001", W46 + 2 * H, "lea", { refCardId: "Origin0001" }), // Léa reclique sur son lien : exclue
      card("CvOnly0001", W46 + 3 * H, null, { refCardId: "Origin0001" }), // CV seul né d'un partage
      card("Plain00001", W46 + 4 * H, "max"),
    ]);
    // Comparaison née d'un partage : une seule fiche, ses deux cartes ne comptent pas.
    store.insertCards([
      { ...card("Cmp0000001", W46 + 5 * H, "zoe", { refCardId: "Child00001" }), source: "both", kind: "comparison" },
      card("CmpCv00001", W46 + 5 * H, null, { parentId: "Cmp0000001", refCardId: "Child00001" }),
      card("CmpGh00001", W46 + 5 * H, "zoe", { parentId: "Cmp0000001" }),
    ]);
    store.setEmail("Plain00001", "max@example.com");

    store.recordEvent("card_shared", "Origin0001", { channel: "linkedin" }, W45 + 11 * H);
    store.recordEvent("card_shared", "Origin0001", { channel: "x" }, W46 + 1); // deux partages, une fiche
    store.recordEvent("card_shared", "Child00001", { channel: "copy" }, W46 + 2 * H);
    store.recordEvent("shared_visit", "Origin0001", { ref: "Origin0001" }, W46 + 30 * 60 * 1000);
    store.recordEvent("shared_visit", "Origin0001", { ref: "Origin0001" }, W46 + 90 * 60 * 1000);
    store.recordEvent("shared_visit", "Child00001", { ref: "Child00001" }, W46 + 4 * H);
    store.recordEvent("cta_azerit_clicked", null, { from: "footer" }, W45 + 12 * H);
    store.recordEvent("cta_azerit_clicked", "Child00001", { from: "result" }, W46 + 3 * H);
    store.recordEvent("card_generated", "Plain00001", {}, W46 + 4 * H); // ignoré : on lit la table cards

    const rows = weeklyReport(store.db, { weeks: 3, now: NOW });
    expect(rows.map((r) => r.label)).toEqual(["2026-W46", "2026-W45", "2026-W44"]);
    const [w46, w45, w44] = rows;
    expect(w46).toMatchObject({ generated: 5, shared: 1, withEmail: 1, ctaClicks: 1, sharedVisits: 3, bornFromShare: 3 });
    expect(w45).toMatchObject({ generated: 1, shared: 1, withEmail: 0, ctaClicks: 1, sharedVisits: 0, bornFromShare: 0 });
    expect(w44).toMatchObject({ generated: 0, shared: 0, bornFromShare: 0 });
    expect(viralCoefficient(w46!)).toBe("0.60");
    expect(viralCoefficient(w45!)).toBe("0.00");
    expect(viralCoefficient(w44!)).toBe("—");
  });

  it("une fiche supprimée ou purgée : ses événements ne la nomment plus, les clics et les visites restent comptés", () => {
    const store = new Store(":memory:");
    stores.push(store);
    store.insertCards([card("Gone000001", W46 + H, "tom"), card("Keep000001", W46 + H, "max"), card("Old0000001", W46 + H, "eve")]);
    store.setEmail("Keep000001", "max@example.com"); // gardée par son email
    store.recordEvent("shared_visit", "Gone000001", { ref: "Gone000001" }, W46 + 2 * H);
    store.recordEvent("cta_azerit_clicked", "Gone000001", { from: "result" }, W46 + 2 * H);
    store.recordEvent("denounce_sent", "Keep000001", { by: "Gone000001" }, W46 + 2 * H);
    store.recordEvent("card_shared", "Keep000001", { channel: "x" }, W46 + 2 * H);
    store.recordEvent("jury_vote", "Old0000001", { verdict: "guilty" }, W46 + 2 * H);
    const before = weeklyReport(store.db, { weeks: 1, now: NOW })[0]!;

    store.deleteGroup("Gone000001");
    // Purge des 90 jours : Old0000001 n'a pas d'email.
    store.purgeExpired(W46 + H + 91 * 24 * H);
    const text = JSON.stringify(store.listEvents());
    expect(text).not.toContain("Gone000001");
    expect(text).not.toContain("Old0000001");
    expect(store.listEvents("shared_visit")[0]).toMatchObject({ cardId: null, meta: {} });
    expect(store.listEvents("denounce_sent")[0]).toMatchObject({ cardId: "Keep000001", meta: {} });
    // Le tableau ne bouge pas, hors les fiches parties elles-mêmes.
    const after = weeklyReport(store.db, { weeks: 1, now: NOW })[0]!;
    expect(after).toMatchObject({ ctaClicks: before.ctaClicks, sharedVisits: before.sharedVisits, shared: 1, generated: before.generated - 2 });
  });

  it("les événements de plus de 180 jours sont effacés par la purge", () => {
    const store = new Store(":memory:");
    stores.push(store);
    const now = NOW;
    store.recordEvent("cta_azerit_clicked", null, { from: "footer" }, now - EVENTS_RETENTION_MS - 1);
    store.recordEvent("cta_azerit_clicked", null, { from: "footer" }, now - EVENTS_RETENTION_MS + 60_000);
    store.purgeExpired(now);
    expect(store.listEvents()).toHaveLength(1);
    expect(EVENTS_RETENTION_MS).toBe(180 * 24 * H);
  });

  it("une origine supprimée depuis compte toujours, faute de login à comparer", () => {
    const store = new Store(":memory:");
    stores.push(store);
    store.insertCards([card("Child00001", W46 + H, "tom", { refCardId: "GoneCard01" })]);
    expect(weeklyReport(store.db, { weeks: 1, now: NOW })[0]).toMatchObject({ generated: 1, bornFromShare: 1 });
  });

  it("8 semaines par défaut, et lit une base antérieure à la colonne ref_card_id", () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE cards (id TEXT PRIMARY KEY, parent_id TEXT, created_at INTEGER NOT NULL, source TEXT NOT NULL,
      login TEXT, kind TEXT NOT NULL, json TEXT NOT NULL, facts_json TEXT, email TEXT, delete_token TEXT NOT NULL, expires_at INTEGER);
      CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, event TEXT NOT NULL, card_id TEXT, meta TEXT);`);
    db.prepare(`INSERT INTO cards VALUES ('Old0000001', NULL, ?, 'github', 'lea', 'card', '{}', NULL, NULL, 't', NULL)`).run(W46 + H);
    const rows = weeklyReport(db, { now: NOW });
    db.close();
    expect(rows).toHaveLength(8);
    expect(rows[0]).toMatchObject({ generated: 1, bornFromShare: 0 });
  });

  it("imprime un tableau markdown, la semaine la plus récente en premier", () => {
    const store = new Store(":memory:");
    stores.push(store);
    store.insertCards([card("Origin0001", W46 + H, "lea"), card("Child00001", W46 + 2 * H, "tom", { refCardId: "Origin0001" })]);
    const md = formatWeekly(weeklyReport(store.db, { weeks: 2, now: NOW }));
    const lines = md.split("\n");
    expect(lines[0]).toBe(
      "| Semaine | Fiches générées | Partagées | Avec email | Clics azerit.tech | Visites par partage | Nées d'un partage | Coefficient viral |",
    );
    expect(lines[2]).toBe("| 2026-W46 (09/11 → 15/11) | 2 | 0 % (0) | 0 % (0) | 0 | 0 | 1 | 0.50 |");
    expect(lines[3]).toBe("| 2026-W45 (02/11 → 08/11) | 0 | — | — | 0 | 0 | 0 | — |");
  });
});
