// Rattrapage du §18.116 : les dossiers des personnes connectées à LinkedIn, nés avant la règle.

import { afterEach, describe, expect, it } from "vitest";
import { FIXTURES } from "../../shared/fixtures";
import type { CardData, ComparisonData } from "../../shared/types";
import { Store, type NewCardRow } from "./db";
import { proveSignedInDossiers, signedInDossiers } from "./rattrapageConnectes";
import { weekRank } from "./top";

const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
});

const NOW = Date.now();
const url = (slug: string) => `https://www.linkedin.com/in/${slug}`;

function dossier(id: string, login: string, slug: string, o: { ghName?: string | null; denounced?: boolean } = {}): NewCardRow[] {
  const at = new Date(NOW - 60_000).toISOString();
  const github = { ...FIXTURES.gold, id: `gh${id}`, login, overall: 70, createdAt: at } as CardData;
  const cv = { ...FIXTURES.cv, id: `cv${id}`, createdAt: at, overall: 70 } as CardData;
  const data = { id, createdAt: at, declaredSource: "linkedin", cv, github, grid: { criteria: [], overall: 70 } } as ComparisonData;
  return [
    { id, createdAt: NOW - 60_000, source: "linkedin", login, kind: "comparison", data, facts: { linkedinUrl: url(slug), linkedinProven: false }, deleteToken: "t" },
    { id: cv.id, parentId: id, createdAt: NOW - 60_000, source: "linkedin", login: null, kind: "card", data: cv, deleteToken: "t" },
    { id: github.id, parentId: id, createdAt: NOW - 60_000, source: "github", login, kind: "card", data: github, facts: { login, profile: { login, name: o.ghName ?? null, followers: 3 } }, deleteToken: "t" },
  ];
}

function account(store: Store, id: string, cardId: string, memo: Record<string, unknown>) {
  store.db.prepare(`INSERT INTO accounts (id, linkedin_key, card_id, created_at, seen_at, linkedin_json) VALUES (?, ?, ?, ?, ?, ?)`).run(id, `k${id}`, cardId, NOW, NOW, JSON.stringify(memo));
}

function base() {
  const store = new Store(":memory:");
  stores.push(store);
  // Les deux dossiers de production : « Jacques » @jmougeot, @raphael-crv.
  store.insertCards(dossier("cmpJacques1", "jmougeot", "jacques-mougeot", { ghName: "Jacques" }));
  account(store, "accJacques", "cmpJacques1", { name: "Jacques Mougeot", url: url("jacques-mougeot"), how: "photo", github: { login: "jmougeot", how: "name" } });
  store.insertCards(dossier("cmpRaphael1", "raphael-crv", "raphael-cerveau", { ghName: "Raphael-Crv" }));
  account(store, "accRaphael", "cmpRaphael1", { name: "Raphael Cerveau", url: url("raphael-cerveau"), how: "email" });
  // Un pseudo tapé sans rapport : reste hors du top.
  store.insertCards(dossier("cmpZorro001", "zorro-42", "camille-ardent"));
  account(store, "accCamille", "cmpZorro001", { name: "Camille Ardent", url: url("camille-ardent"), how: "photo" });
  // Pas de connexion LinkedIn derrière, ou un profil choisi parmi des homonymes : pas regardés.
  store.insertCards(dossier("cmpColle001", "camille-dev", "camille-dev"));
  store.insertCards(dossier("cmpPicked01", "lea-martin", "lea-martin"));
  account(store, "accLea", "cmpPicked01", { name: "Léa Martin", url: url("lea-martin"), how: "picked" });
  return store;
}

describe("rattrapage des dossiers connectés (§18.116)", () => {
  it("à blanc : dit ce qu'il ferait, n'écrit rien", () => {
    const store = base();
    const list = signedInDossiers(store);
    expect(list.map((d) => [d.id, d.proof])).toEqual([
      ["cmpJacques1", "signin+name"],
      ["cmpRaphael1", "signin+name"],
      ["cmpZorro001", null],
    ]);
    for (const id of ["cmpJacques1", "cmpRaphael1", "cmpZorro001"]) {
      expect((store.getCard(id)!.facts as { linkedinProven?: boolean }).linkedinProven).toBe(false);
      expect(weekRank(store.db, id)).toBeNull();
    }
  });

  it("avec --oui : les dossiers plausibles entrent au top, une seule fois", () => {
    const store = base();
    // Sa fiche GitHub seule, d'avant : le dossier prouvé la remplace, comme à sa naissance.
    const solo = { ...FIXTURES.gold, id: "ghSolo00001", login: "jmougeot", overall: 60, createdAt: new Date(NOW - 120_000).toISOString() } as CardData;
    store.insertCards([{ id: solo.id, createdAt: NOW - 120_000, source: "github", login: "jmougeot", kind: "card", data: solo, facts: { profile: { followers: 3 } }, deleteToken: "t" }]);
    expect(proveSignedInDossiers(store)).toBe(2);
    expect(store.getCard("cmpJacques1")!.facts).toEqual({ linkedinUrl: url("jacques-mougeot"), linkedinProven: true, linkedinProof: "signin+name" });
    expect(weekRank(store.db, "cmpJacques1")).not.toBeNull();
    expect(weekRank(store.db, "cmpRaphael1")).not.toBeNull();
    expect(weekRank(store.db, "cmpZorro001")).toBeNull();
    expect(store.getCard(solo.id)!.supersededBy).toBe("cmpJacques1");
    // Idempotent : relancé, plus rien à prouver.
    expect(signedInDossiers(store).map((d) => d.id)).toEqual(["cmpZorro001"]);
    expect(proveSignedInDossiers(store)).toBe(0);
  });

  it("un dossier né d'une dénonciation n'est jamais touché", () => {
    const store = base();
    store.db.prepare(`UPDATE cards SET denounce_born = 1 WHERE id = 'cmpJacques1'`).run();
    expect(signedInDossiers(store).map((d) => d.id)).not.toContain("cmpJacques1");
    expect(store.proveLinkedin("cmpJacques1", "signin+name")).toBe(false);
  });
});
