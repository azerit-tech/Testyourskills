// Le compte léger (SPEC §18.91) : la session du compte vaut le jeton de la fiche
// pour la personne fichée, depuis un navigateur qui n'a pas ce jeton ; jamais pour
// la fiche d'un autre. Supprimer sa fiche par son compte emporte le compte.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { JobState } from "../../shared/types";
import { ACCOUNT_COOKIE } from "./account";
import { BASE, closeAll, githubCard, githubIn, linkedinCard, linkedinIn, me, onlyAccount, rows, setupAccount } from "./accountTesting";
import { SESSION_COOKIE, signSession } from "./auth";
import { cookiesOf, postCard, type EntryCtx } from "./entry/testing";

afterEach(closeAll);

const get = async (ctx: EntryCtx, id: string, cookie = "") => (await (await ctx.app.request(`/api/card/${id}`, { headers: { cookie } })).json()) as JobState & { mine?: boolean };

const send = (ctx: EntryCtx, path: string, init: { method?: string; cookie?: string; origin?: string; body?: unknown }) =>
  ctx.app.request(path, {
    method: init.method ?? "POST",
    headers: { "content-type": "application/json", cookie: init.cookie ?? "", ...(init.origin ? { origin: init.origin } : {}) },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });

/** Une personne connectée par LinkedIn, sa fiche faite ailleurs ; ici, rien que le cookie du compte. */
async function linkedinPerson(ctx: EntryCtx) {
  const li = await linkedinIn(ctx);
  const card = await linkedinCard(ctx, li.jar);
  const other = await postCard(ctx, { linkedin: "https://www.linkedin.com/in/quelqu-un-d-autre" });
  return { id: card.json.id, token: card.json.deleteToken!, otherId: other.json.id, jar: onlyAccount(li.jar) };
}

describe("la session du compte vaut le jeton", () => {
  it("sa fiche, sans jeton : `mine` et la grille entière ; la fiche d'un autre : la vue publique", async () => {
    const ctx = setupAccount();
    const p = await linkedinPerson(ctx);
    expect(p.jar).toMatch(/^tys_acct=/);
    const mine = await get(ctx, p.id, p.jar);
    expect(mine.mine).toBe(true);
    expect(await get(ctx, p.id)).not.toHaveProperty("mine");
    expect((await get(ctx, p.otherId, p.jar)).mine).toBeUndefined();
  });

  it("l'email : à sa fiche oui, depuis le site seulement ; à celle d'un autre, non", async () => {
    const ctx = setupAccount();
    const p = await linkedinPerson(ctx);
    expect((await send(ctx, "/api/email", { cookie: p.jar, origin: BASE, body: { cardId: p.id, email: "c@ardent.dev" } })).status).toBe(200);
    expect((await send(ctx, "/api/email", { cookie: p.jar, origin: "https://evil.example", body: { cardId: p.id, email: "c@ardent.dev" } })).status).toBe(403);
    expect((await send(ctx, "/api/email", { cookie: p.jar, origin: BASE, body: { cardId: p.otherId, email: "c@ardent.dev" } })).status).toBe(403);
    expect((await send(ctx, "/api/email", { origin: BASE, body: { cardId: p.id, email: "c@ardent.dev" } })).status).toBe(403);
  });

  it("la photo LinkedIn : sa fiche, sans jeton ; pas celle d'un autre", async () => {
    const ctx = setupAccount();
    const p = await linkedinPerson(ctx);
    // La copie de la photo de connexion se fait en arrière-plan (§18.105) : on l'attend.
    await vi.waitFor(() => expect((ctx.store.db.prepare(`SELECT linkedin_json FROM accounts`).get() as { linkedin_json: string | null }).linkedin_json).toContain("/avatar/"));
    const ok = await ctx.app.request(`/auth/linkedin/start?card=${p.id}`, { headers: { cookie: p.jar } });
    expect(ok.status).toBe(302);
    // Connectée par LinkedIn : la copie de la photo de sa connexion, sans repasser chez LinkedIn (§18.105).
    expect(ok.headers.get("location")).toBe(`${BASE}/c/${p.id}?photo=linkedin`);
    expect((await ctx.app.request(`/auth/linkedin/start?card=${p.otherId}`, { headers: { cookie: p.jar } })).status).toBe(403);
    expect((await ctx.app.request(`/auth/linkedin/start?card=${p.id}`)).status).toBe(403);
  });

  it("« Ajoute ton GitHub » sans jeton : sa fiche cède la place au dossier, comme avec le jeton", async () => {
    const ctx = setupAccount();
    const p = await linkedinPerson(ctx);
    const res = await ctx.app.request("/api/card", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: p.jar, origin: BASE },
      body: JSON.stringify({ lang: "fr", login: "camille-dev", linkedin: "https://www.linkedin.com/in/camille-ardent", from: p.id }),
    });
    const { id } = (await res.json()) as { id: string };
    await ctx.pipeline.wait(id);
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.store.getCard(id)!.kind).toBe("comparison");
    expect(ctx.store.fileRow(p.id)!.id).toBe(id);
    expect(await me(ctx, p.jar)).toMatchObject({ cardId: id });
    // La fiche d'un autre ne se complète pas par le compte.
    const other = await ctx.app.request("/api/card", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: p.jar, origin: BASE },
      body: JSON.stringify({ lang: "fr", login: "autre-dev", linkedin: "https://www.linkedin.com/in/quelqu-un-d-autre", from: p.otherId }),
    });
    await ctx.pipeline.wait(((await other.json()) as { id: string }).id);
    expect(ctx.store.fileRow(p.otherId)!.id).toBe(p.otherId);
  });

  it("supprimer : sa fiche oui, le compte part avec et les cookies s'effacent ; celle d'un autre, non", async () => {
    const ctx = setupAccount();
    const p = await linkedinPerson(ctx);
    expect((await ctx.app.request(`/api/card/${p.otherId}`, { method: "DELETE", headers: { cookie: p.jar, origin: BASE } })).status).toBe(403);
    expect((await ctx.app.request(`/api/card/${p.id}`, { method: "DELETE", headers: { cookie: p.jar, origin: "https://evil.example" } })).status).toBe(403);
    // Le lien GET ne vaut que par son jeton, même avec la session.
    expect((await ctx.app.request(`/api/card/${p.id}/delete`, { headers: { cookie: p.jar } })).status).toBe(403);
    const del = await ctx.app.request(`/api/card/${p.id}`, { method: "DELETE", headers: { cookie: p.jar, origin: BASE } });
    expect(del.status).toBe(200);
    expect(ctx.store.getCard(p.id)).toBeNull();
    expect(rows(ctx)).toHaveLength(0);
    const gone = cookiesOf(del, p.jar);
    expect(gone).not.toContain(`${ACCOUNT_COOKIE}=`);
    expect(await me(ctx, p.jar)).toBeNull();
  });

  it("supprimer par le jeton seul, depuis un autre navigateur : le compte reste", async () => {
    const ctx = setupAccount();
    const p = await linkedinPerson(ctx);
    expect((await ctx.app.request(`/api/card/${p.id}?token=${p.token}`, { method: "DELETE" })).status).toBe(200);
    expect(rows(ctx)).toHaveLength(1);
    expect(await me(ctx, p.jar)).toMatchObject({ cardId: null });
  });
});

describe("le GitHub prouvé par le compte", () => {
  it("reste propriétaire après les 30 jours de tys_owner : `mine`, masquer, /api/me", async () => {
    const ctx = setupAccount({ claim: true });
    const gh = await githubIn(ctx);
    const card = await githubCard(ctx, gh.jar);
    // tys_owner expiré : seul le compte reste.
    const expired = signSession("s".repeat(40), { login: "camille-dev", githubId: 4242 }, Date.now() - 31 * 24 * 3600 * 1000);
    const jar = `${onlyAccount(gh.jar)}; ${SESSION_COOKIE}=${expired}`;
    expect((await get(ctx, card.json.id, jar)).mine).toBe(true);
    expect(await me(ctx, jar)).toMatchObject({ login: "camille-dev", cardId: card.json.id });
    expect((await send(ctx, "/api/owner/hide", { cookie: jar, origin: BASE })).status).toBe(200);
    expect(ctx.store.isHidden("camille-dev")).toBe(true);
    // Un compte LinkedIn seul n'est le propriétaire d'aucun pseudo.
    const li = await linkedinIn(ctx);
    expect((await send(ctx, "/api/owner/unhide", { cookie: onlyAccount(li.jar), origin: BASE })).status).toBe(401);
  });
});

describe("se déconnecter", () => {
  it("efface les deux cookies", async () => {
    const ctx = setupAccount({ claim: true });
    const gh = await githubIn(ctx);
    expect(gh.jar).toContain(`${SESSION_COOKIE}=`);
    const out = await ctx.app.request("/auth/logout", { method: "POST", headers: { cookie: gh.jar, origin: BASE } });
    expect(out.status).toBe(200);
    const after = cookiesOf(out, gh.jar);
    expect(after).not.toContain(`${SESSION_COOKIE}=`);
    expect(after).not.toContain(`${ACCOUNT_COOKIE}=`);
    expect(await me(ctx, after)).toBeNull();
    // Le compte, lui, reste : se reconnecter le retrouve.
    expect(rows(ctx)).toHaveLength(1);
  });

  it("après LinkedIn : efface tout, le compte, la session d'entrée, tys_who et son témoin (§18.90) ; plus rien ne la reconnaît", async () => {
    const ctx = setupAccount();
    const li = await linkedinIn(ctx);
    const card = await linkedinCard(ctx, li.jar);
    for (const name of [ACCOUNT_COOKIE, "tys_who", "tys_known"]) expect(card.jar).toContain(`${name}=`);
    // La session d'entrée (15 minutes) est encore là si la personne se déconnecte avant d'aller au bout.
    const jar = card.jar.includes("tys_enter=") ? card.jar : `${card.jar}; ${li.jar.split(/;\s*/).find((kv) => kv.startsWith("tys_enter="))}`;
    const out = await ctx.app.request("/auth/logout", { method: "POST", headers: { cookie: jar, origin: BASE } });
    expect(out.status).toBe(200);
    const after = cookiesOf(out, jar);
    for (const name of [ACCOUNT_COOKIE, SESSION_COOKIE, "tys_enter", "tys_who", "tys_known"]) expect(after).not.toContain(`${name}=`);
    expect(await me(ctx, after)).toBeNull();
  });
});

describe("le repli tys_who (§18.90)", () => {
  it("sans compte valide : /api/me rend sa fiche, sans source ni droit ; avec le compte, le compte passe devant", async () => {
    const ctx = setupAccount();
    const li = await linkedinIn(ctx);
    const card = await linkedinCard(ctx, li.jar);
    const whoOnly = card.jar.split(/;\s*/).filter((kv) => kv.startsWith("tys_who=") || kv.startsWith("tys_known=")).join("; ");
    expect(await me(ctx, whoOnly)).toMatchObject({ login: null, cardId: card.json.id, sources: [], known: true });
    // Aucun droit : la fiche n'est pas `mine` pour ce navigateur.
    expect((await get(ctx, card.json.id, whoOnly)).mine).toBeFalsy();
    const full = await me(ctx, card.jar);
    expect(full).toMatchObject({ cardId: card.json.id, sources: ["linkedin"] });
    expect(full).not.toHaveProperty("known");
  });

  it("supprimer sa fiche par son compte efface aussi tys_who et son témoin", async () => {
    const ctx = setupAccount();
    const li = await linkedinIn(ctx);
    const card = await linkedinCard(ctx, li.jar);
    const del = await send(ctx, `/api/card/${card.json.id}`, { method: "DELETE", cookie: onlyAccount(card.jar) + "; " + card.jar.split(/;\s*/).filter((kv) => /^tys_(who|known|enter)=/.test(kv)).join("; "), origin: BASE });
    expect(del.status).toBe(200);
    const after = cookiesOf(del, card.jar);
    for (const name of [ACCOUNT_COOKIE, "tys_who", "tys_known", "tys_enter"]) expect(after).not.toContain(`${name}=`);
    expect(await me(ctx, after)).toBeNull();
    expect(rows(ctx)).toHaveLength(0);
  });
});
