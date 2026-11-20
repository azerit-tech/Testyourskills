// Déjà connecté (SPEC §18.105) : une personne dont le compte a son LinkedIn n'est plus
// jamais renvoyée chez LinkedIn quand le compte suffit. Chaque porte : connectée → pas de
// passage chez LinkedIn ; pas connectée (ou sans LinkedIn au compte) → le passage d'aujourd'hui.
// Et le cookie du compte : ce qui le pose, le renouvelle, et ce qui ne l'efface pas.

import { afterEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_COOKIE, ACCOUNT_TTL_MS, signAccount } from "./account";
import { BASE, EMAIL, PICTURE, SECRET, SUB, closeAll, githubIn, linkedinCard, linkedinIn, me, onlyAccount, rows, setupAccount } from "./accountTesting";
import { CAMILLE_URL, cookiesOf, postCard, type EntryCtx } from "./entry/testing";
import type { CardData } from "../../shared/types";

afterEach(closeAll);

const memoOf = (ctx: EntryCtx) => JSON.parse((ctx.store.db.prepare(`SELECT linkedin_json FROM accounts`).get() as { linkedin_json: string | null }).linkedin_json ?? "null") as Record<string, unknown> | null;
const enter = (ctx: EntryCtx, jar: string, query = "") => ctx.app.request(`/auth/linkedin/enter${query}`, { headers: { cookie: jar } });
const toLinkedin = (res: Response) => (res.headers.get("location") ?? "").startsWith("https://www.linkedin.com/oauth/");

/** Connectée par LinkedIn, sa fiche faite ; ici, rien que le cookie du compte (un autre onglet, un autre jour). */
async function connected(ctx: EntryCtx) {
  const li = await linkedinIn(ctx);
  const card = await linkedinCard(ctx, li.jar);
  await vi.waitFor(() => expect(memoOf(ctx)?.photo).toBeTruthy());
  return { id: card.json.id, token: card.json.deleteToken!, jar: onlyAccount(li.jar) };
}

describe("ce que le compte retient de la connexion LinkedIn", () => {
  it("le nom, le profil lancé, une copie de la photo chez nous ; jamais le sub, l'email ni l'adresse signée de LinkedIn", async () => {
    const ctx = setupAccount();
    await connected(ctx);
    const memo = memoOf(ctx)!;
    expect(memo).toMatchObject({ name: "Camille Ardent", url: CAMILLE_URL, how: "photo" });
    expect(String(memo.photo)).toMatch(new RegExp(`^${BASE}/avatar/a[0-9a-f]{24}\\.jpg\\?v=`));
    const dump = JSON.stringify(ctx.store.db.prepare(`SELECT * FROM accounts`).all());
    for (const secretBit of [SUB, EMAIL, PICTURE, "access_token"]) expect(dump).not.toContain(secretBit);
    // La copie est servie, comme la photo d'une fiche.
    const file = new URL(String(memo.photo)).pathname;
    expect((await ctx.app.request(file)).status).toBe(200);
  });

  it("supprimer sa fiche par son compte emporte le compte et la copie de sa photo", async () => {
    const ctx = setupAccount();
    const p = await connected(ctx);
    const file = new URL(String(memoOf(ctx)!.photo)).pathname;
    const del = await ctx.app.request(`/api/card/${p.id}`, { method: "DELETE", headers: { cookie: p.jar, origin: BASE } });
    expect(del.status).toBe(200);
    expect(rows(ctx)).toHaveLength(0);
    expect((await ctx.app.request(file)).status).toBe(404);
  });
});

describe("« Se connecter avec LinkedIn » quand on l'est déjà", () => {
  it("avec sa fiche : droit dessus, sans passer chez LinkedIn, et le cookie repart pour 180 jours", async () => {
    const ctx = setupAccount();
    const p = await connected(ctx);
    const res = await enter(ctx, p.jar);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${BASE}/c/${p.id}`);
    const set = res.headers.getSetCookie().find((l) => l.startsWith(`${ACCOUNT_COOKIE}=`))!;
    expect(set).toMatch(new RegExp(`Max-Age=${ACCOUNT_TTL_MS / 1000}`));
  });

  it("« Refaire ma fiche » : le profil retenu, sans LinkedIn ni recherche ; la fiche va au compte, avec sa photo", async () => {
    const ctx = setupAccount();
    const p = await connected(ctx);
    const searches = ctx.calls.byName.length;
    const res = await enter(ctx, p.jar, "?redo=1&return=%2Fbandes");
    expect(toLinkedin(res)).toBe(false);
    expect(res.headers.get("location")).toBe(`${BASE}/bandes?li=1`);
    const jar = cookiesOf(res, p.jar);
    const found = (await (await ctx.app.request("/api/entry/linkedin", { headers: { cookie: jar } })).json()) as { auto?: { url: string } };
    expect(found.auto?.url).toBe(CAMILLE_URL);
    expect(ctx.calls.byName.length).toBe(searches);
    const card = await postCard(ctx, { linkedin: CAMILLE_URL }, jar);
    expect([200, 202]).toContain(card.status);
    expect(rows(ctx)[0]!.card_id).toBe(card.json.id);
  });

  it("sa fiche supprimée (le compte reste) : refaite d'après le compte, sans LinkedIn, avec la copie de sa photo", async () => {
    const ctx = setupAccount();
    const p = await connected(ctx);
    // Supprimée par son jeton, depuis un autre navigateur : le compte survit, sans fiche.
    expect((await ctx.app.request(`/api/card/${p.id}?token=${p.token}`, { method: "DELETE" })).status).toBe(200);
    expect(await me(ctx, p.jar)).toMatchObject({ cardId: null, sources: ["linkedin"] });
    const res = await enter(ctx, p.jar);
    expect(toLinkedin(res)).toBe(false);
    expect(res.headers.get("location")).toBe(`${BASE}/?li=1`);
    const jar = cookiesOf(res, p.jar);
    await ctx.app.request("/api/entry/linkedin", { headers: { cookie: jar } });
    const card = await postCard(ctx, { linkedin: CAMILLE_URL }, jar);
    expect(card.status).toBe(202);
    expect(await me(ctx, p.jar)).toMatchObject({ cardId: card.json.id });
    const data = ctx.store.getCard(card.json.id)!.data as CardData;
    expect(data.photoSource).toBe("linkedin");
    expect(data.avatarUrl).toMatch(new RegExp(`^${BASE}/avatar/${card.json.id}\\.jpg`));
  });

  it("pas connecté : le passage chez LinkedIn d'aujourd'hui", async () => {
    const ctx = setupAccount();
    expect(toLinkedin(await enter(ctx, ""))).toBe(true);
  });

  it("un compte sans LinkedIn (GitHub seul) : LinkedIn est nécessaire, le passage a lieu", async () => {
    const ctx = setupAccount();
    const gh = await githubIn(ctx);
    expect(toLinkedin(await enter(ctx, onlyAccount(gh.jar)))).toBe(true);
  });

  it("un compte LinkedIn qui n'a jamais lancé sa fiche (rien de retenu) : le passage a lieu", async () => {
    const ctx = setupAccount();
    const li = await linkedinIn(ctx);
    expect(toLinkedin(await enter(ctx, onlyAccount(li.jar), "?redo=1"))).toBe(true);
  });

  it("un cookie dont le compte a disparu (base remise à zéro) : rien à reprendre, le passage a lieu", async () => {
    const ctx = setupAccount();
    const jar = `${ACCOUNT_COOKIE}=${signAccount(SECRET, "compte-disparu-0123456789")}`;
    expect(toLinkedin(await enter(ctx, jar))).toBe(true);
  });
});

describe("« Mets ta photo LinkedIn » quand on l'est déjà", () => {
  it("sa fiche sans photo LinkedIn : la copie de la connexion, sans passer chez LinkedIn", async () => {
    const ctx = setupAccount();
    const p = await connected(ctx);
    // La fiche montre l'avatar GitHub, comme une fiche faite par GitHub.
    const row = ctx.store.getCard(p.id)!;
    ctx.store.updateData(p.id, { ...(row.data as CardData), avatarUrl: "https://avatars.githubusercontent.com/u/1", photoSource: undefined });
    const res = await ctx.app.request(`/auth/linkedin/start?card=${p.id}`, { headers: { cookie: p.jar } });
    expect(res.headers.get("location")).toBe(`${BASE}/c/${p.id}?photo=linkedin`);
    const data = ctx.store.getCard(p.id)!.data as CardData;
    expect(data.photoSource).toBe("linkedin");
    expect(data.avatarUrl).toMatch(new RegExp(`^${BASE}/avatar/${p.id}\\.jpg`));
  });

  it("la fiche d'un autre dont ce navigateur tient le jeton : le passage chez LinkedIn, comme avant", async () => {
    const ctx = setupAccount();
    const li = await linkedinIn(ctx);
    await linkedinCard(ctx, li.jar);
    await vi.waitFor(() => expect(memoOf(ctx)?.photo).toBeTruthy());
    const other = await postCard(ctx, { linkedin: "https://www.linkedin.com/in/quelqu-un-d-autre" });
    const res = await ctx.app.request(`/auth/linkedin/start?card=${other.json.id}&token=${other.json.deleteToken}`, { headers: { cookie: onlyAccount(li.jar) } });
    expect(toLinkedin(res)).toBe(true);
  });

  it("pas connecté, le jeton seul : le passage chez LinkedIn", async () => {
    const ctx = setupAccount();
    const card = await postCard(ctx, { login: "camille-dev" });
    expect(toLinkedin(await ctx.app.request(`/auth/linkedin/start?card=${card.json.id}&token=${card.json.deleteToken}`))).toBe(true);
  });
});

describe("le cookie du compte tient", () => {
  it("posé au retour de LinkedIn : HttpOnly, Secure, SameSite=Lax (il passe le retour de linkedin.com), 180 jours", async () => {
    const ctx = setupAccount();
    const { back } = await linkedinIn(ctx);
    const set = back.headers.getSetCookie().find((l) => l.startsWith(`${ACCOUNT_COOKIE}=`))!;
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/Secure/i);
    expect(set).toMatch(/SameSite=Lax/i);
    expect(set).toMatch(/Path=\//);
    expect(set).toMatch(new RegExp(`Max-Age=${ACCOUNT_TTL_MS / 1000}`));
  });

  it("voir sa fiche, celle d'un autre, l'accueil : rien n'efface le cookie", async () => {
    const ctx = setupAccount();
    const p = await connected(ctx);
    const other = await postCard(ctx, { linkedin: "https://www.linkedin.com/in/quelqu-un-d-autre" });
    for (const path of [`/api/card/${p.id}`, `/api/card/${other.json.id}`, "/api/me", `/c/${p.id}`, "/"]) {
      const res = await ctx.app.request(path, { headers: { cookie: p.jar } });
      expect(res.headers.getSetCookie().filter((l) => l.startsWith(`${ACCOUNT_COOKIE}=`))).toEqual([]);
    }
    expect(await me(ctx, p.jar)).toMatchObject({ cardId: p.id });
  });

  it("passé la moitié de sa vie, renouvelé par n'importe quelle visite, même une fiche", async () => {
    const ctx = setupAccount();
    const p = await connected(ctx);
    const id = rows(ctx)[0]!.id;
    const old = `${ACCOUNT_COOKIE}=${signAccount(SECRET, id, Date.now() - ACCOUNT_TTL_MS * 0.6)}`;
    const res = await ctx.app.request(`/api/card/${p.id}`, { headers: { cookie: old } });
    const set = res.headers.getSetCookie().find((l) => l.startsWith(`${ACCOUNT_COOKIE}=`))!;
    expect(set).toMatch(new RegExp(`Max-Age=${ACCOUNT_TTL_MS / 1000}`));
  });

  it("« Ajoute ton GitHub » : le dossier remplace la fiche, le cookie reste, « Ma fiche » est le dossier", async () => {
    const ctx = setupAccount();
    const p = await connected(ctx);
    const res = await ctx.app.request("/api/card", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: p.jar, origin: BASE },
      body: JSON.stringify({ lang: "fr", login: "camille-dev", linkedin: CAMILLE_URL, from: p.id }),
    });
    expect(res.headers.getSetCookie().filter((l) => l.startsWith(`${ACCOUNT_COOKIE}=`) && /max-age=0/i.test(l))).toEqual([]);
    const { id } = (await res.json()) as { id: string };
    await ctx.pipeline.wait(id);
    await new Promise((r) => setTimeout(r, 0));
    expect(await me(ctx, p.jar)).toMatchObject({ cardId: id, sources: ["linkedin"] });
    // Toujours connectée : « Se connecter avec LinkedIn » mène au dossier, sans LinkedIn.
    expect((await enter(ctx, p.jar)).headers.get("location")).toBe(`${BASE}/c/${id}`);
  });

  it("« Se déconnecter » l'efface : ensuite, LinkedIn est de nouveau nécessaire", async () => {
    const ctx = setupAccount();
    const p = await connected(ctx);
    const out = await ctx.app.request("/auth/logout", { method: "POST", headers: { cookie: p.jar, origin: BASE } });
    const jar = cookiesOf(out, p.jar);
    expect(jar).not.toContain(`${ACCOUNT_COOKIE}=`);
    expect(toLinkedin(await enter(ctx, jar))).toBe(true);
  });
});
