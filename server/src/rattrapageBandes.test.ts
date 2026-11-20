// Rattrapage des bandes (ops/rattrapage-bandes.ts) : le script lancé sur une base jetable.

import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../../shared/fixtures";
import type { CardData } from "../../shared/types";
import { joinBand, leaveBand } from "./bands";
import { Store } from "./db";

const ROOT = join(import.meta.dirname, "../..");
const NOW = Date.now();

function run(db: string, ...args: string[]): string {
  const r = spawnSync(join(ROOT, "node_modules/.bin/tsx"), [join(ROOT, "ops/rattrapage-bandes.ts"), ...args], {
    env: { ...process.env, DB_PATH: db },
    encoding: "utf8",
  });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout;
}

function members(db: string): string[] {
  const store = new Store(db);
  const rows = store.db.prepare(`SELECT person_key || ' ' || kind || ' ' || band_id AS m FROM band_members ORDER BY m`).all() as { m: string }[];
  store.close();
  return rows.map((r) => r.m);
}

describe("ops/rattrapage-bandes.ts", () => {
  it("à blanc rien d'écrit ; --oui fait entrer ; relancé, plus rien ; une ligue quittée à la main reste quittée", () => {
    const db = join(mkdtempSync(join(tmpdir(), "tys-bandes-")), "cards.db");
    const store = new Store(db);
    const at = (n: number) => ({ createdAt: NOW - n * 60_000 });
    const gh = (id: string, login: string, club: string, n: number) => ({
      id,
      ...at(n),
      source: "github" as const,
      login,
      kind: "card" as const,
      data: { ...FIXTURES.gold, id, login, club, createdAt: new Date(NOW - n * 60_000).toISOString() } as CardData,
      facts: { login, profile: { login, followers: 3 } },
      deleteToken: "t",
    });
    const li = "https://www.linkedin.com/in/camille-ardent";
    store.insertCards([
      // Une fiche GitHub seule d'avant l'entrée d'office : sa boîte.
      gh("ghLea000001", "leamd", "Doctolib", 30),
      // Une fiche LinkedIn seule dénoncée avant le §18.119 : son école et sa boîte.
      {
        id: "liCamille01",
        ...at(20),
        source: "linkedin",
        login: null,
        kind: "card",
        data: { ...FIXTURES.cv, id: "liCamille01", declaredSource: "linkedin", school: "centrale-mediterranee", club: "Azerit", linkedinUrl: li } as CardData,
        facts: { linkedinUrl: li },
        deleteToken: "t",
      },
      // Sortie de sa boîte à la main.
      gh("ghSortie001", "sortie", "Qonto", 10),
      // Un CV n'entre pas au classement : pas dans les bandes non plus.
      { id: "cvMaxime001", ...at(5), source: "cv", login: null, kind: "card", data: { ...FIXTURES.cv, id: "cvMaxime001", club: "Doctolib" } as CardData, deleteToken: "t" },
    ]);
    store.db.prepare(`UPDATE cards SET denounce_born = 1 WHERE id = 'liCamille01'`).run();
    const sortie = store.getCard("ghSortie001")!;
    joinBand(store, sortie, { type: "boite", id: "qonto", label: "Qonto" });
    expect(leaveBand(store, sortie, "boite")).toBe(true);
    store.close();

    // À blanc : la liste, rien d'écrit.
    const dry = run(db);
    expect(dry).toContain("ghLea000001  @leamd  →  boîte « Doctolib »");
    expect(dry).toContain(`liCamille01  ${li}  →  école « Centrale Méditerranée », boîte « Azerit »`);
    expect(dry).not.toContain("ghSortie001");
    expect(dry).not.toContain("cvMaxime001");
    expect(dry).toContain("Rien n'est écrit");
    expect(members(db)).toEqual([]);

    // --oui : écrit exactement ce qui était annoncé.
    expect(run(db, "--oui")).toContain("2 fiche(s), 3 entrée(s) écrite(s).");
    const after = members(db);
    expect(after).toEqual(["gh:leamd boite doctolib", `li:${li} boite azerit`, `li:${li} ecole centrale-mediterranee`]);

    // Relancé : plus rien à faire, rien ne bouge ; la sortie à la main tient.
    expect(run(db, "--oui")).toContain("0 fiche(s), 0 entrée(s) écrite(s).");
    expect(members(db)).toEqual(after);
    const check = new Store(db);
    expect(check.db.prepare(`SELECT kind FROM band_optouts WHERE person_key = 'gh:sortie'`).all()).toEqual([{ kind: "boite" }]);
    check.close();
  });
});
