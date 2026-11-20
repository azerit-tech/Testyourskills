// Une personne, une ligne par ligue (§18.123). Le cas d'origine : Florent, une fiche LinkedIn
// seule née d'une dénonciation (14:20), puis son dossier LinkedIn + GitHub prouvé (14:35) qui la
// remplace ; les deux entraient chez Criteo et à Centrale Méditerranée : « 2 fiches ».

import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../../shared/fixtures";
import type { CardData, ComparisonData } from "../../shared/types";
import { autoJoinBands, bandPage, bandStanding, forgetBands } from "./bands";
import { Store, type NewCardRow } from "./db";
import { cleanBands } from "./nettoyageBandes";
import { weekTop } from "./top";

const ROOT = join(import.meta.dirname, "../..");
const NOW = Date.now();
const URL = "https://www.linkedin.com/in/florent-delorme";
const LOGIN = "florent765";

const tmpDb = () => join(mkdtempSync(join(tmpdir(), "tys-nettoyage-")), "cards.db");

/** Sa fiche LinkedIn seule, dénoncée : Centrale Méditerranée, Criteo. */
function denounced(id = "UPtWIsLmtS", at = NOW - 15 * 60_000): NewCardRow {
  const data = { ...FIXTURES.cv, id, createdAt: new Date(at).toISOString(), overall: 73, declaredSource: "linkedin", school: "centrale-mediterranee", club: "Criteo", linkedinUrl: URL } as CardData;
  return { id, createdAt: at, source: "linkedin", login: null, kind: "card", data, facts: { linkedinUrl: URL }, deleteToken: "t" };
}

/** Son dossier LinkedIn + GitHub prouvé, et ses deux pièces. */
function dossier(id = "TDm4QYDjj4", at = NOW): NewCardRow[] {
  const iso = new Date(at).toISOString();
  const cv = { ...FIXTURES.cv, id: "96vWMS61q5", createdAt: iso, overall: 80, school: "centrale-mediterranee", club: "Criteo", login: "Florent765" } as CardData;
  const github = { ...FIXTURES.gold, id: "2zkq67C8JM", createdAt: iso, overall: 80, login: "Florent765", club: null } as unknown as CardData;
  const data = { id, createdAt: iso, declaredSource: "linkedin", cv, github, grid: { criteria: [], overall: 80 } } as ComparisonData;
  return [
    { id, createdAt: at, source: "linkedin", login: LOGIN, kind: "comparison", data, facts: { linkedinUrl: URL, linkedinProven: true }, deleteToken: "t" },
    { id: cv.id, parentId: id, createdAt: at, source: "linkedin", login: null, kind: "card", data: cv, deleteToken: "t" },
    { id: github.id, parentId: id, createdAt: at, source: "github", login: LOGIN, kind: "card", data: github, facts: { login: LOGIN, profile: { login: LOGIN, followers: 3 } }, deleteToken: "t" },
  ];
}

/** L'état de la production avant le correctif : chaque fiche entrée sous sa clé, la fiche dénoncée jamais reprise. */
function before(path: string): Store {
  const store = new Store(path);
  store.insertCards([denounced()]);
  store.db.prepare(`UPDATE cards SET denounce_born = 1, denounced_by = 'wHlzlVogoD' WHERE id = 'UPtWIsLmtS'`).run();
  autoJoinBands(store, store.getCard("UPtWIsLmtS")!);
  store.insertCards(dossier());
  expect(store.getCard("UPtWIsLmtS")!.supersededBy).toBe("TDm4QYDjj4");
  const add = store.db.prepare(
    `INSERT INTO band_members (person_key, kind, band_id, label, card_id, login, stars, joined_at) VALUES (?, ?, ?, ?, 'TDm4QYDjj4', ?, 5, ?)`,
  );
  add.run(`gh:${LOGIN}`, "ecole", "centrale-mediterranee", "Centrale Méditerranée", LOGIN, NOW);
  add.run(`gh:${LOGIN}`, "boite", "criteo", "Criteo", LOGIN, NOW);
  forgetBands(store.db);
  return store;
}

const members = (store: Store) =>
  (store.db.prepare(`SELECT person_key || ' ' || kind || ' ' || band_id || ' ' || card_id AS m FROM band_members ORDER BY m`).all() as { m: string }[]).map((r) => r.m);

describe("une bande compte une personne une fois (§18.123)", () => {
  it("la fiche dénoncée remplacée par son dossier ne compte plus : Criteo et Centrale, une fiche chacune", () => {
    const store = before(tmpDb());
    // Les deux entrées sont encore en base (l'état de la production) : la lecture n'en compte qu'une.
    expect(members(store)).toHaveLength(4);
    expect(bandStanding(store.db, "boite", "criteo")!.members).toBe(1);
    expect(bandStanding(store.db, "ecole", "centrale-mediterranee")!.members).toBe(1);
    const page = bandPage(store, "boite", "criteo")!;
    expect(page.members).toHaveLength(1);
    expect(page.members[0]!.stars).toBe(5);
    store.close();
  });

  it("deux fiches vivantes de la même personne (même LinkedIn) : son dossier compte, l'autre non", () => {
    const store = new Store(tmpDb());
    store.insertCards([denounced()]);
    autoJoinBands(store, store.getCard("UPtWIsLmtS")!);
    // Un dossier non prouvé ne remplace rien : les deux fiches restent vivantes.
    const rows = dossier();
    rows[0] = { ...rows[0]!, facts: { linkedinUrl: URL } };
    store.insertCards(rows);
    autoJoinBands(store, store.getCard("TDm4QYDjj4")!);
    expect(store.getCard("UPtWIsLmtS")!.supersededBy).toBeNull();
    expect(members(store)).toHaveLength(4);
    expect(bandStanding(store.db, "boite", "criteo")!.members).toBe(1);
    expect(bandPage(store, "boite", "criteo")!.members[0]!.login?.toLowerCase()).toBe(LOGIN);
    store.close();
  });

  it("le dossier qui remplace la fiche reprend ses entrées, comme « Ajoute ton GitHub » : une ligne par ligue, la sortie à la main gardée", () => {
    const store = new Store(tmpDb());
    store.insertCards([denounced()]);
    store.db.prepare(`UPDATE cards SET denounce_born = 1 WHERE id = 'UPtWIsLmtS'`).run();
    autoJoinBands(store, store.getCard("UPtWIsLmtS")!);
    // Sortie de l'école à la main, sous l'ancienne clé.
    store.db.prepare(`DELETE FROM band_members WHERE person_key = ? AND kind = 'ecole'`).run(`li:${URL}`);
    store.db.prepare(`INSERT INTO band_optouts (person_key, kind, card_id, at) VALUES (?, 'ecole', 'UPtWIsLmtS', ?)`).run(`li:${URL}`, NOW);
    store.insertCards(dossier());
    autoJoinBands(store, store.getCard("TDm4QYDjj4")!);
    expect(members(store)).toEqual([`gh:${LOGIN} boite criteo TDm4QYDjj4`]);
    expect(store.db.prepare(`SELECT person_key, kind FROM band_optouts`).all()).toEqual([{ person_key: `gh:${LOGIN}`, kind: "ecole" }]);
    store.close();
  });

  it("le top de la semaine : une ligne pour Florent, celle de son dossier", () => {
    const store = before(tmpDb());
    const top = weekTop(store.db, { now: NOW + 1000 });
    expect(top.total).toBe(1);
    expect(top.entries.map((e) => e.overall)).toEqual([80]);
    store.close();
  });
});

describe("ops/nettoyage-bandes.ts", () => {
  function run(db: string, ...args: string[]): string {
    const r = spawnSync(join(ROOT, "node_modules/.bin/tsx"), [join(ROOT, "ops/nettoyage-bandes.ts"), ...args], { env: { ...process.env, DB_PATH: db }, encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    return r.stdout;
  }
  const read = (db: string) => {
    const s = new Store(db);
    const m = members(s);
    s.close();
    return m;
  };

  it("à blanc rien d'écrit ; --oui laisse une ligne par personne et par ligue ; relancé, plus rien", () => {
    const db = tmpDb();
    before(db).close();
    const state = read(db);
    expect(state).toHaveLength(4);

    const dry = run(db);
    expect(dry).toContain("Rien n'est écrit");
    expect(dry).not.toContain("Rien à faire");
    expect(read(db)).toEqual(state);

    const done = run(db, "--oui");
    expect(done).toContain("Écrit.");
    expect(read(db)).toEqual([`gh:${LOGIN} boite criteo TDm4QYDjj4`, `gh:${LOGIN} ecole centrale-mediterranee TDm4QYDjj4`]);

    expect(run(db)).toContain("Rien à faire");
    expect(run(db, "--oui")).toContain("0 dossier(s) repris, 0 pièce(s), 0 entrée(s) supprimée(s).");
    expect(read(db)).toEqual([`gh:${LOGIN} boite criteo TDm4QYDjj4`, `gh:${LOGIN} ecole centrale-mediterranee TDm4QYDjj4`]);
    // Quatre lancements du script, chacun son tsx : plus long que le délai par défaut quand toute la suite tourne.
  }, 30_000);

  it("une entrée sous l'ancienne clé seulement passe au dossier, avec ses étoiles ; un doublon vivant sort", () => {
    const store = new Store(tmpDb());
    store.insertCards([denounced()]);
    store.db.prepare(`UPDATE cards SET denounce_born = 1 WHERE id = 'UPtWIsLmtS'`).run();
    autoJoinBands(store, store.getCard("UPtWIsLmtS")!);
    store.insertCards(dossier());
    const r = cleanBands(store, { apply: true });
    expect(r.adopted).toEqual([{ id: "TDm4QYDjj4", changes: 4 }]);
    expect(members(store)).toEqual([`gh:${LOGIN} boite criteo TDm4QYDjj4`, `gh:${LOGIN} ecole centrale-mediterranee TDm4QYDjj4`]);
    expect(store.db.prepare(`SELECT DISTINCT stars FROM band_members`).all()).toEqual([{ stars: 5 }]);
    expect(cleanBands(store, { apply: true })).toEqual({ adopted: [], pieces: [], removed: [] });
    store.close();
  });
});
