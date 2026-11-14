// Les finalistes d'une prime : les dix premiers, leur email et leurs preuves,
// le classement figé à la clôture. Entreprises et pseudos inventés.

import { afterEach, describe, expect, it } from "vitest";
import { FIXTURES } from "../../shared/fixtures";
import type { Prime, Season } from "../../shared/season";
import type { CardData } from "../../shared/types";
import { Store } from "./db";
import { finalists, finalistsCsv, finalistsText } from "./finalists";

const NOW = Date.parse("2026-12-01T12:00:00Z");
const prime: Prime = { id: "demo-stage", company: "Entreprise Démo", contract: "stage", positions: ["BE"], languages: [], interviews: 2, remote: true, from: "2026-11-01", to: "2026-11-30", pitch: { fr: "Démo.", en: "Demo." } };
const season: Season = { number: 1, start: "2026-11-01", end: "2026-12-31", primes: [prime], rulesPublished: false };

const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
});

function seed(n: number) {
  const store = new Store(":memory:");
  stores.push(store);
  const { login: _l, ...base } = FIXTURES.gold;
  const ins = store.db.prepare(
    `INSERT INTO entries (login, prime_id, card_id, contract, email, proofs_json, consent_at, adult, place_ok, score, reliability, state, joined_at)
     VALUES (?, 'demo-stage', ?, 'stage', ?, ?, ?, 1, NULL, ?, 80, 'racing', ?)`,
  );
  for (let i = 1; i <= n; i++) {
    const login = `dev-demo-${i}`;
    const id = `Fin${String(i).padStart(7, "0")}`;
    const createdAt = Date.parse("2026-11-10T10:00:00Z");
    const data: CardData = { ...base, id, login, createdAt: new Date(createdAt).toISOString(), overall: 40 + i, reliability: 80, position: "BE" };
    store.insertCards([{ id, createdAt, source: "github", login, kind: "card", data, deleteToken: `tok-${id}` }]);
    store.claimOwner(login, 900 + i);
    ins.run(login, id, `${login}@exemple.dev`, i === n ? JSON.stringify(["https://exemple.dev/projet"]) : null, createdAt, 40 + i, createdAt + i);
  }
  return store;
}

describe("les finalistes d'une prime", () => {
  it("les dix premiers par note, avec email, fiche et preuves", () => {
    const r = finalists(seed(14), season, prime, "https://skills.test", NOW);
    expect(r.closed).toBe(true);
    expect(r.total).toBe(14);
    expect(r.finalists).toHaveLength(10);
    expect(r.finalists[0]).toEqual({ rank: 1, login: "dev-demo-14", email: "dev-demo-14@exemple.dev", cardUrl: "https://skills.test/c/Fin0000014", overall: 54, proofs: ["https://exemple.dev/projet"] });
    expect(r.finalists.map((f) => f.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(r.finalists.at(-1)!.login).toBe("dev-demo-5");
  });

  it("moins de dix inscriptions : toutes ; prime ouverte : provisoire", () => {
    const store = seed(3);
    const open = finalists(store, season, prime, "https://skills.test", Date.parse("2026-11-20T12:00:00Z"));
    expect(open.closed).toBe(false);
    expect(open.finalists).toHaveLength(3);
    expect(finalistsText(open)).toContain("provisoire");
  });

  it("CSV et texte, une ligne d'en-tête", () => {
    const r = finalists(seed(2), season, prime, "https://skills.test", NOW);
    const csv = finalistsCsv(r).split("\n");
    expect(csv[0]).toBe("rang,login,email,note,fiche,preuves");
    expect(csv[1]).toBe("1,dev-demo-2,dev-demo-2@exemple.dev,42,https://skills.test/c/Fin0000002,https://exemple.dev/projet");
    expect(finalistsText(r)).toContain("Prime close : classement figé.");
  });
});
