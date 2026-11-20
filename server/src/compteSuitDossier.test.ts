// Le compte suit le dossier (SPEC §18.106) : quand un dossier remplace la fiche d'un
// compte, `accounts.card_id` passe au dossier ; un compte resté sur une fiche remplacée
// y passe à sa première lecture ; la purge de la fiche remplacée laisse « Ma fiche ».

import { afterEach, describe, expect, it } from "vitest";
import { FIXTURE_COMPARISON, FIXTURES } from "../../shared/fixtures";
import { createAccounts } from "./account";
import { BASE, closeAll, linkedinCard, linkedinIn, me, rows, setupAccount } from "./accountTesting";
import { RETENTION_MS, Store } from "./db";
import { postCard } from "./entry/testing";

const SECRET = "s".repeat(40);
const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
  closeAll();
});

const T0 = 1_000_000;

function setup() {
  const store = new Store(":memory:");
  stores.push(store);
  let t = T0;
  const kit = createAccounts({ store, secret: SECRET, secure: false, now: () => t })!;
  const account = (cardId: string) => {
    store.db.prepare(`INSERT INTO accounts (id, linkedin_key, github_id, card_id, created_at, seen_at) VALUES (?, ?, NULL, ?, ?, ?)`).run(`acct-${cardId}`, `k-${cardId}`, cardId, t, t);
    return `acct-${cardId}`;
  };
  const cardIdOf = (id: string) => (store.db.prepare(`SELECT card_id FROM accounts WHERE id = ?`).get(id) as { card_id: string | null }).card_id;
  return { store, kit, account, cardIdOf, at: (ms: number) => (t = ms) };
}

/** Une fiche GitHub seule de leamd. */
function github(store: Store, id: string, at: number) {
  store.insertCards([{ id, createdAt: at, source: "github", login: "leamd", kind: "card", data: { ...FIXTURES.gold, id }, deleteToken: "tok" }]);
}

/** Une fiche LinkedIn seule de ce profil. */
function linkedin(store: Store, id: string, at: number, url = "https://www.linkedin.com/in/lea") {
  store.insertCards([{ id, createdAt: at, source: "linkedin", kind: "card", data: { ...FIXTURES.gold, id }, facts: { linkedinUrl: url }, deleteToken: "tok" }]);
}

/** Un dossier LinkedIn + GitHub de leamd, au lien prouvé : il remplace ses fiches d'avant (§18.84). */
function dossier(store: Store, id: string, at: number, url = "https://www.linkedin.com/in/lea") {
  const cmp = { ...FIXTURE_COMPARISON, id };
  store.insertCards([
    { id, createdAt: at, source: "linkedin", login: "leamd", kind: "comparison", data: cmp, facts: { linkedinUrl: url, linkedinProven: true }, deleteToken: "tok" },
  ]);
}

describe("le compte suit le dossier (§18.106)", () => {
  it("« Ajoute ton GitHub » (completedBy) : le compte passe au dossier, dans la même écriture", () => {
    const { store, account, cardIdOf } = setup();
    linkedin(store, "li1", T0);
    const a = account("li1");
    // Un dossier au lien non prouvé, qui ne remplace rien d'office : completedBy le fait.
    const cmp = { ...FIXTURE_COMPARISON, id: "d1" };
    store.insertCards([{ id: "d1", createdAt: T0 + 10, source: "linkedin", login: "leamd", kind: "comparison", data: cmp, facts: { linkedinUrl: "u", linkedinProven: false }, deleteToken: "tok" }]);
    expect(cardIdOf(a)).toBe("li1");
    store.completedBy(store.getCard("li1")!, store.getCard("d1")!);
    expect(cardIdOf(a)).toBe("d1");
  });

  it("« C'est ton GitHub ? → Oui » (dossier prouvé) : les comptes de la fiche GitHub et de la fiche LinkedIn y passent", () => {
    const { store, account, cardIdOf } = setup();
    github(store, "gh1", T0);
    linkedin(store, "li1", T0 + 1);
    const a = account("gh1");
    const b = account("li1");
    dossier(store, "d1", T0 + 10);
    expect([cardIdOf(a), cardIdOf(b)]).toEqual(["d1", "d1"]);
  });

  it("deux dossiers à la suite : le compte va au plus récent", () => {
    const { store, account, cardIdOf } = setup();
    github(store, "gh1", T0);
    const a = account("gh1");
    dossier(store, "d1", T0 + 10);
    expect(cardIdOf(a)).toBe("d1");
    dossier(store, "d2", T0 + 20);
    expect(cardIdOf(a)).toBe("d2");
  });

  it("un dossier né d'une dénonciation ne prend pas le compte de la personne dénoncée", () => {
    const { store, account, cardIdOf, kit } = setup();
    github(store, "gh1", T0);
    const a = account("gh1");
    store.expectDenounced("d1");
    dossier(store, "d1", T0 + 10);
    store.markDenounced("d1", "gh1", null, true);
    store.forgetDenounced("d1");
    expect(cardIdOf(a)).toBe("gh1");
    // Ni à la lecture : « Ma fiche » reste la sienne.
    expect(kit.cardOf(kit.accounts.get(a)!)?.id).toBe("gh1");
    expect(cardIdOf(a)).toBe("gh1");
  });

  it("un compte resté sur une fiche remplacée (d'avant ce paragraphe) y passe à sa première lecture", () => {
    const { store, account, cardIdOf, kit } = setup();
    github(store, "gh1", T0);
    dossier(store, "d1", T0 + 10);
    dossier(store, "d2", T0 + 20);
    const a = account("gh1");
    expect(cardIdOf(a)).toBe("gh1");
    expect(kit.cardOf(kit.accounts.get(a)!)?.id).toBe("d2");
    expect(cardIdOf(a)).toBe("d2");
  });

  it("la purge de la fiche remplacée laisse « Ma fiche », même pour un compte resté dessus", () => {
    const { store, account, cardIdOf, kit, at } = setup();
    github(store, "gh1", T0);
    dossier(store, "d1", T0 + 10_000);
    // Un compte resté sur la vieille fiche, que personne n'a lu depuis.
    const a = account("gh1");
    // La fiche remplacée expire avant le dossier, et part à la purge.
    expect(store.purgeExpired(T0 + RETENTION_MS + 1)).toEqual(["gh1"]);
    expect(store.getCard("gh1")).toBeNull();
    expect(cardIdOf(a)).toBe("d1");
    at(T0 + RETENTION_MS + 1);
    expect(kit.cardOf(kit.accounts.get(a)!)?.id).toBe("d1");
  });

  it("le dossier parti avant la fiche qu'il remplaçait (elle porte un email) : le compte retombe sur elle", () => {
    const { store, account, cardIdOf, kit, at } = setup();
    github(store, "gh1", T0);
    store.setEmail("gh1", "lea@example.com");
    const a = account("gh1");
    dossier(store, "d1", T0 + 10);
    expect(cardIdOf(a)).toBe("d1");
    expect(store.purgeExpired(T0 + 10 + RETENTION_MS + 1)).toEqual(["d1"]);
    expect(cardIdOf(a)).toBe("gh1");
    at(T0 + 10 + RETENTION_MS + 1);
    expect(kit.cardOf(kit.accounts.get(a)!)?.id).toBe("gh1");
  });
});

describe("par le site (§18.106)", () => {
  it("connecté par LinkedIn, « Ajoute ton GitHub » : le compte a le dossier, et le garde quand sa fiche d'avant part", async () => {
    const ctx = setupAccount();
    const li = await linkedinIn(ctx);
    const { json } = await linkedinCard(ctx, li.jar);
    expect(rows(ctx)[0]!.card_id).toBe(json.id);
    const added = await postCard(ctx, { login: "camille-dev", linkedin: (ctx.store.getCard(json.id)!.facts as { linkedinUrl: string }).linkedinUrl, from: json.id }, li.jar);
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.store.getCard(json.id)!.supersededBy).toBe(added.json.id);
    expect(rows(ctx)[0]!.card_id).toBe(added.json.id);
    // La fiche LinkedIn seule expire et part ; le dossier reste.
    ctx.store.db.prepare(`UPDATE cards SET expires_at = 1, email = NULL WHERE id = ?`).run(json.id);
    ctx.store.db.prepare(`UPDATE cards SET expires_at = NULL WHERE id = ?`).run(added.json.id);
    expect(ctx.store.purgeExpired()).toContain(json.id);
    expect(await me(ctx, li.jar)).toMatchObject({ cardId: added.json.id });
    // Déjà connectée (§18.105) : « Se connecter avec LinkedIn » mène droit au dossier.
    const enter = await ctx.app.request("/auth/linkedin/enter", { headers: { cookie: li.jar } });
    expect(enter.headers.get("location")).toBe(`${BASE}/c/${added.json.id}`);
  });
});
