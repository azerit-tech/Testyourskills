// Le compte léger (SPEC §18.85) : la table, l'empreinte LinkedIn, le cookie, et
// ce qu'une connexion fait d'un compte (création, retour, rattachement, fusion).

import { afterEach, describe, expect, it } from "vitest";
import { FIXTURES } from "../../shared/fixtures";
import { ACCOUNT_TTL_MS, Accounts, linkedinKey, signAccount, verifyAccount } from "./account";
import { signSession, verifySession } from "./auth";
import { migrate, Store } from "./db";

const SECRET = "s".repeat(40);
const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
});

function setup(start = 1_000_000) {
  const store = new Store(":memory:");
  stores.push(store);
  let t = start;
  const accounts = new Accounts(store.db, () => t);
  return { store, accounts, advance: (ms: number) => (t += ms), now: () => t };
}

function card(store: Store, id: string, at: number, expiresAt: number | null = null) {
  store.insertCards([{ id, createdAt: at, source: "github", login: "leamd", kind: "card", data: { ...FIXTURES.gold, id }, deleteToken: "tok" }]);
  store.db.prepare(`UPDATE cards SET expires_at = ? WHERE id = ?`).run(expiresAt, id);
}

describe("la table et l'empreinte", () => {
  it("une table neuve, posée sans toucher une base déjà en service", () => {
    const { store } = setup();
    const cols = (store.db.prepare(`PRAGMA table_info(accounts)`).all() as { name: string }[]).map((c) => c.name);
    expect(cols).toEqual(["id", "linkedin_key", "github_id", "card_id", "created_at", "seen_at"]);
    store.db.prepare(`INSERT INTO accounts VALUES ('a', 'k', NULL, NULL, 1, 1)`).run();
    migrate(store.db);
    expect(store.db.prepare(`SELECT COUNT(*) AS n FROM accounts`).get()).toEqual({ n: 1 });
  });

  it("le sub LinkedIn n'est jamais rangé : son empreinte, propre au secret et à cet usage", () => {
    const k = linkedinKey(SECRET, "abc123");
    expect(k).toBe(linkedinKey(SECRET, "abc123"));
    expect(k).not.toContain("abc123");
    expect(k).not.toBe(linkedinKey("t".repeat(40), "abc123"));
    expect(k).not.toBe(linkedinKey(SECRET, "abc124"));
  });
});

describe("le cookie du compte", () => {
  it("180 jours, signé ; falsifié, expiré ou d'un autre usage, il ne vaut rien", () => {
    const now = 5_000_000;
    const v = signAccount(SECRET, "a".repeat(24), now);
    expect(verifyAccount(SECRET, v, now)).toEqual({ id: "a".repeat(24), exp: now + ACCOUNT_TTL_MS });
    expect(verifyAccount(SECRET, v, now + ACCOUNT_TTL_MS)).toBeNull();
    expect(verifyAccount("t".repeat(40), v, now)).toBeNull();
    const [body, mac] = v.split(".");
    const forged = Buffer.from(JSON.stringify({ a: "b".repeat(24), e: now + 1000 })).toString("base64url");
    expect(verifyAccount(SECRET, `${forged}.${mac}`, now)).toBeNull();
    expect(verifyAccount(SECRET, `${body}.x${mac!.slice(1)}`, now)).toBeNull();
    expect(verifyAccount(SECRET, undefined, now)).toBeNull();
    // La session de « C'est moi » ne passe pas pour un compte, ni l'inverse.
    const session = signSession(SECRET, { login: "leamd", githubId: 4242 }, now);
    expect(verifyAccount(SECRET, session, now)).toBeNull();
    expect(verifySession(SECRET, v, now)).toBeNull();
  });
});

describe("une connexion et le compte", () => {
  it("chaque source crée son compte, et la même identité retrouve le même", () => {
    const { accounts, advance } = setup();
    const li = accounts.signIn(null, { linkedinKey: "K1" });
    const gh = accounts.signIn(null, { githubId: 4242 });
    expect(li.id).not.toBe(gh.id);
    expect(li).toMatchObject({ linkedinKey: "K1", githubId: null, cardId: null });
    expect(gh).toMatchObject({ linkedinKey: null, githubId: 4242 });
    advance(3 * 24 * 3600 * 1000);
    const again = accounts.signIn(null, { linkedinKey: "K1" });
    expect(again.id).toBe(li.id);
    expect(again.seenAt).toBeGreaterThan(li.seenAt);
    expect(accounts.signIn(again, { linkedinKey: "K1" }).id).toBe(li.id);
  });

  it("connecté par une source, puis par l'autre : les deux identités sur le même compte", () => {
    const { accounts } = setup();
    const li = accounts.signIn(null, { linkedinKey: "K1" });
    const both = accounts.signIn(li, { githubId: 4242 });
    expect(both).toMatchObject({ id: li.id, linkedinKey: "K1", githubId: 4242 });
    expect(accounts.signIn(null, { githubId: 4242 }).id).toBe(li.id);
  });

  it("l'autre identité avait déjà son compte : ils fusionnent, celui qui a une fiche reste", () => {
    const { store, accounts, advance, now } = setup();
    const gh = accounts.signIn(null, { githubId: 4242 });
    advance(1000);
    const li = accounts.signIn(null, { linkedinKey: "K1" });
    card(store, "card000001", now());
    accounts.linkCard(li.id, "card000001");
    const merged = accounts.signIn(accounts.get(gh.id), { linkedinKey: "K1" });
    expect(merged).toMatchObject({ id: li.id, linkedinKey: "K1", githubId: 4242, cardId: "card000001", createdAt: gh.createdAt });
    expect(accounts.get(gh.id)).toBeNull();
    expect(store.db.prepare(`SELECT COUNT(*) AS n FROM accounts`).get()).toEqual({ n: 1 });
  });

  it("sans fiche de part et d'autre, le plus ancien reste ; une fiche expirée ne compte pas", () => {
    const { store, accounts, advance, now } = setup();
    const li = accounts.signIn(null, { linkedinKey: "K1" });
    advance(1000);
    const gh = accounts.signIn(null, { githubId: 4242 });
    card(store, "card000002", now(), now() - 1);
    accounts.linkCard(gh.id, "card000002");
    const merged = accounts.signIn(accounts.get(gh.id), { linkedinKey: "K1" });
    expect(merged.id).toBe(li.id);
    expect(merged.githubId).toBe(4242);
  });

  it("une autre personne sur ce navigateur : on passe à son compte, sans rien mêler", () => {
    const { accounts } = setup();
    const a = accounts.signIn(null, { linkedinKey: "K1" });
    const b = accounts.signIn(a, { linkedinKey: "K2" });
    expect(b.id).not.toBe(a.id);
    expect(accounts.get(a.id)).toMatchObject({ linkedinKey: "K1", githubId: null });
    // Le GitHub d'un compte qui a déjà un autre LinkedIn : pas de fusion, le compte de ce GitHub.
    const gh = accounts.signIn(b, { githubId: 7 });
    expect(gh.id).toBe(b.id);
    const back = accounts.signIn(a, { githubId: 7 });
    expect(back.id).toBe(b.id);
    expect(accounts.get(a.id)).toMatchObject({ linkedinKey: "K1", githubId: null });
  });
});
