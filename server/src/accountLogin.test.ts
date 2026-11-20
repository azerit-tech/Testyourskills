// Le compte léger (SPEC §18.91), de bout en bout avec de faux LinkedIn et GitHub :
// connexion = compte, la fiche liée au lancement, revenir droit sur sa fiche, et
// rien sans SESSION_SECRET.

import { afterEach, describe, expect, it } from "vitest";
import { ACCOUNT_COOKIE, ACCOUNT_TTL_MS, linkedinKey, signAccount } from "./account";
import { BASE, EMAIL, PICTURE, SECRET, SUB, closeAll, githubCard, githubIn, linkedinCard, linkedinIn, me, rows, setupAccount, type AccountSetup } from "./accountTesting";
import { cookiesOf, postCard } from "./entry/testing";

afterEach(closeAll);

const setup = (o: AccountSetup = {}) => ({ ctx: setupAccount(o) });

describe("connexion = compte", () => {
  it("LinkedIn : un compte, et seulement l'empreinte du sub ; un cookie de 180 jours", async () => {
    const { ctx } = setup();
    const { back, jar, location } = await linkedinIn(ctx);
    expect(location).toBe(`${BASE}/?li=1`);
    const set = back.headers.getSetCookie().find((l) => l.startsWith(`${ACCOUNT_COOKIE}=`))!;
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/Secure/i);
    expect(set).toMatch(/SameSite=Lax/i);
    expect(set).toMatch(new RegExp(`Max-Age=${ACCOUNT_TTL_MS / 1000}`));
    const [row] = rows(ctx);
    expect(row).toMatchObject({ linkedin_key: linkedinKey(SECRET, SUB), github_id: null, card_id: null });
    // Le nom et une copie de la photo sont gardés depuis le §18.105 ; jamais le sub, l'email ni l'adresse signée de LinkedIn.
    const dump = JSON.stringify(ctx.store.db.prepare(`SELECT * FROM accounts`).all());
    for (const secretBit of [SUB, EMAIL, PICTURE]) expect(dump).not.toContain(secretBit);
    expect(await me(ctx, jar)).toEqual({ login: null, hidden: false, cardId: null, cardLogin: null, overall: null, avatarUrl: null, initial: null, sources: ["linkedin"] });
  });

  it("LinkedIn : la fiche lancée par l'entrée connectée va au compte ; revenir mène droit dessus, sans recherche ni calcul", async () => {
    const { ctx } = setup();
    const first = await linkedinIn(ctx);
    const { json, status } = await linkedinCard(ctx, first.jar);
    expect(status).toBe(202);
    expect(rows(ctx)[0]!.card_id).toBe(json.id);
    expect(await me(ctx, first.jar)).toMatchObject({ cardId: json.id, initial: expect.any(String), sources: ["linkedin"] });

    // Un autre téléphone, sans rien : la même personne retrouve le même compte, et sa fiche.
    const searches = ctx.calls.byName.length;
    const jobs = ctx.calls.forUrl.length;
    const again = await linkedinIn(ctx);
    expect(again.location).toBe(`${BASE}/c/${json.id}`);
    expect(rows(ctx)).toHaveLength(1);
    expect(ctx.calls.byName.length).toBe(searches);
    expect(ctx.calls.forUrl.length).toBe(jobs);
    expect(await me(ctx, again.jar)).toMatchObject({ cardId: json.id });

    // « Refaire ma fiche » : le profil que le compte retient, sans repasser chez LinkedIn ni rien chercher (§18.105).
    const redo = await ctx.app.request("/auth/linkedin/enter?redo=1", { headers: { cookie: again.jar } });
    expect(redo.headers.get("location")).toBe(`${BASE}/?li=1`);
    expect(ctx.calls.byName.length).toBe(searches);
  });

  it("GitHub : un compte par l'identifiant ; la fiche du pseudo échangé y va, et revenir y mène", async () => {
    const { ctx } = setup();
    const first = await githubIn(ctx);
    expect(first.location).toBe(`${BASE}/?gh=1`);
    expect(rows(ctx)[0]).toMatchObject({ github_id: 4242, linkedin_key: null });
    const { json } = await githubCard(ctx, first.jar);
    expect(rows(ctx)[0]!.card_id).toBe(json.id);
    expect(await me(ctx, first.jar)).toMatchObject({ login: null, cardId: json.id, sources: ["github"] });

    const collected = ctx.calls.collect.length;
    const again = await githubIn(ctx);
    expect(again.location).toBe(`${BASE}/c/${json.id}`);
    expect(again.jar).not.toContain("tys_gh=");
    expect(ctx.calls.collect.length).toBe(collected);
    expect((await githubIn(ctx, again.jar, "?redo=1")).location).toBe(`${BASE}/?gh=1`);
  });

  it("GitHub prouvé, « C'est moi » réglé : « Ma fiche » est la dernière fiche du pseudo, même faite ailleurs", async () => {
    const { ctx } = setup({ claim: true });
    const typed = await postCard(ctx, { login: "camille-dev" });
    const back = await githubIn(ctx);
    expect(back.location).toBe(`${BASE}/c/${typed.json.id}`);
    expect(await me(ctx, back.jar)).toMatchObject({ login: "camille-dev", cardId: typed.json.id, sources: ["github"] });
  });

  it("« C'est moi » crée aussi le compte", async () => {
    const { ctx } = setup({ claim: true });
    const card = await postCard(ctx, { login: "camille-dev" });
    const start = await ctx.app.request(`/auth/github/start?card=${card.json.id}`);
    const state = new URL(start.headers.get("location")!).searchParams.get("state");
    let jar = cookiesOf(start);
    const back = await ctx.app.request(`/auth/github/callback?code=abc&state=${state}`, { headers: { cookie: jar } });
    jar = cookiesOf(back, jar);
    expect(back.headers.get("location")).toBe(`${BASE}/c/${card.json.id}?claim=ok&as=camille-dev`);
    expect(rows(ctx)[0]).toMatchObject({ github_id: 4242 });
    expect(await me(ctx, jar)).toMatchObject({ cardId: card.json.id, sources: ["github"] });
  });

  it("LinkedIn puis GitHub sur ce navigateur : un compte, deux sources", async () => {
    const { ctx } = setup();
    const li = await linkedinIn(ctx);
    const gh = await githubIn(ctx, li.jar);
    expect(rows(ctx)).toHaveLength(1);
    expect(rows(ctx)[0]).toMatchObject({ linkedin_key: linkedinKey(SECRET, SUB), github_id: 4242 });
    expect(await me(ctx, gh.jar)).toMatchObject({ sources: ["linkedin", "github"] });
  });

  it("deux comptes de la même personne fusionnent : celui qui a une fiche reste", async () => {
    const { ctx } = setup();
    // Le téléphone : GitHub, sans fiche.
    await githubIn(ctx);
    // L'ordinateur : LinkedIn, avec sa fiche.
    const li = await linkedinIn(ctx);
    const { json } = await linkedinCard(ctx, li.jar);
    expect(rows(ctx)).toHaveLength(2);
    // Sur l'ordinateur, GitHub : les deux comptes n'en font qu'un, avec la fiche.
    const gh = await githubIn(ctx, li.jar);
    expect(gh.location).toBe(`${BASE}/c/${json.id}`);
    expect(rows(ctx)).toHaveLength(1);
    expect(rows(ctx)[0]).toMatchObject({ github_id: 4242, linkedin_key: linkedinKey(SECRET, SUB), card_id: json.id });
  });

  it("une fiche lancée par un lien collé, un pseudo tapé ou une dénonciation n'est jamais liée", async () => {
    const { ctx } = setup();
    const li = await linkedinIn(ctx);
    // Un autre profil que le sien, collé.
    await postCard(ctx, { linkedin: "https://www.linkedin.com/in/quelqu-un-d-autre" }, li.jar);
    expect(rows(ctx)[0]!.card_id).toBeNull();
    const gh = await githubIn(ctx, li.jar);
    // Un pseudo tapé, pas celui que l'entrée a échangé.
    const typed = await postCard(ctx, { login: "autre-dev" }, gh.jar);
    expect(rows(ctx)[0]!.card_id).toBeNull();
    // Le pseudo échangé, envoyé comme une dénonciation : pas lié non plus.
    const r = await ctx.app.request("/api/entry/github", { headers: { cookie: gh.jar } });
    const { login } = (await r.json()) as { login: string };
    await postCard(ctx, { login, denouncedBy: typed.json.id }, gh.jar);
    expect(rows(ctx)[0]!.card_id).toBeNull();
    // Le pseudo échangé, lancé tel quel : lié.
    const mine = await githubCard(ctx, (await githubIn(ctx, gh.jar, "?redo=1")).jar);
    expect(rows(ctx)[0]!.card_id).toBe(mine.json.id);
  });

  it("« Ma fiche » suit la fiche qui la remplace (superseded_by)", async () => {
    const { ctx } = setup();
    const li = await linkedinIn(ctx);
    const { json } = await linkedinCard(ctx, li.jar);
    // « Ajoute ton GitHub » : la fiche plus complète de la même personne la remplace (Store.completedBy, §18.84).
    const dossier = await postCard(ctx, { login: "camille-dev" });
    ctx.store.db.prepare(`UPDATE cards SET superseded_by = ? WHERE id = ?`).run(dossier.json.id, json.id);
    expect(await me(ctx, li.jar)).toMatchObject({ cardId: dossier.json.id });
    expect((await linkedinIn(ctx)).location).toBe(`${BASE}/c/${dossier.json.id}`);
  });

  it("une fiche partie (supprimée, expirée) : le parcours d'aujourd'hui", async () => {
    const { ctx } = setup();
    const li = await linkedinIn(ctx);
    const { json } = await linkedinCard(ctx, li.jar);
    ctx.store.db.prepare(`UPDATE cards SET expires_at = 1 WHERE id = ?`).run(json.id);
    expect(await me(ctx, li.jar)).toMatchObject({ cardId: null });
    expect((await linkedinIn(ctx)).location).toBe(`${BASE}/?li=1`);
  });
});

describe("le cookie du compte dans les requêtes", () => {
  it("falsifié, expiré, d'un autre usage ou d'un compte supprimé : personne", async () => {
    const { ctx } = setup();
    const li = await linkedinIn(ctx);
    const id = rows(ctx)[0]!.id;
    const value = li.jar.match(new RegExp(`${ACCOUNT_COOKIE}=([^;]+)`))![1]!;
    expect(await me(ctx, `${ACCOUNT_COOKIE}=${value}`)).not.toBeNull();
    expect(await me(ctx, `${ACCOUNT_COOKIE}=${value.slice(0, -2)}xx`)).toBeNull();
    expect(await me(ctx, `${ACCOUNT_COOKIE}=${signAccount("t".repeat(40), id)}`)).toBeNull();
    expect(await me(ctx, `${ACCOUNT_COOKIE}=${signAccount(SECRET, id, Date.now() - ACCOUNT_TTL_MS - 1)}`)).toBeNull();
    // La session de « C'est moi » mise dans le cookie du compte : rien.
    expect(await me(ctx, `${ACCOUNT_COOKIE}=${li.jar.match(/tys_enter=([^;]+)/)![1]}`)).toBeNull();
    ctx.store.db.prepare(`DELETE FROM accounts`).run();
    expect(await me(ctx, `${ACCOUNT_COOKIE}=${value}`)).toBeNull();
  });

  it("renouvelé quand il a passé la moitié de sa vie", async () => {
    const { ctx } = setup();
    await linkedinIn(ctx);
    const id = rows(ctx)[0]!.id;
    const young = await ctx.app.request("/api/me", { headers: { cookie: `${ACCOUNT_COOKIE}=${signAccount(SECRET, id)}` } });
    expect(young.headers.getSetCookie().some((l) => l.startsWith(`${ACCOUNT_COOKIE}=`))).toBe(false);
    const old = await ctx.app.request("/api/me", { headers: { cookie: `${ACCOUNT_COOKIE}=${signAccount(SECRET, id, Date.now() - ACCOUNT_TTL_MS / 2 - 1000)}` } });
    expect(old.headers.getSetCookie().find((l) => l.startsWith(`${ACCOUNT_COOKIE}=`))).toMatch(new RegExp(`Max-Age=${ACCOUNT_TTL_MS / 1000}`));
  });
});

describe("sans SESSION_SECRET", () => {
  it("pas de compte : les connexions marchent comme avant, /api/me reste nul", async () => {
    const { ctx } = setup({ secret: null });
    const li = await linkedinIn(ctx);
    expect(li.location).toBe(`${BASE}/?li=1`);
    expect(li.jar).not.toContain(`${ACCOUNT_COOKIE}=`);
    const gh = await githubIn(ctx);
    expect(gh.location).toBe(`${BASE}/?gh=1`);
    expect(gh.jar).not.toContain(`${ACCOUNT_COOKIE}=`);
    expect(rows(ctx)).toHaveLength(0);
    expect(await me(ctx, li.jar)).toBeNull();
    // Le compte d'un autre déploiement, signé d'un secret : ignoré.
    expect(await me(ctx, `${ACCOUNT_COOKIE}=${signAccount(SECRET, "a".repeat(24))}`)).toBeNull();
  });
});
