// « Se connecter avec LinkedIn » (SPEC §18.80) : de la connexion à la fiche, avec
// un faux LinkedIn, un faux chercheur de profils et un faux GitHub.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { GithubIdentity } from "../github/identity";
import { AUTHORIZE_URL, LI_STATE_COOKIE, TOKEN_URL, USERINFO_URL } from "../linkedin";
import { ENTER_COOKIE, ENTER_STARTS_PER_DAY } from "./linkedinLogin";
import { CAMILLE, CAMILLE_URL, HOMONYM, cardState, cookiesOf, postCard, setupEntry, type EntryCtx, type EntrySetup } from "./testing";

const BASE = "https://skills.test";
const EMAIL = "camille@ardent.dev";
const ACCESS_TOKEN = "SECRET-ACCESS-TOKEN";
const PICTURE = "https://media.licdn.com/dms/image/v2/D4E03AQoidc/profile-displayphoto-shrink_100_100/0/9";
const LEADS = "https://leads.test/hook";

interface Opts extends EntrySetup {
  userinfo?: Record<string, unknown>;
  github?: GithubIdentity | null;
  samePhoto?: (a: string, b: string) => boolean;
  linkedin?: boolean;
}

const ctxs: EntryCtx[] = [];
afterEach(() => {
  while (ctxs.length) ctxs.pop()!.store.close();
  vi.restoreAllMocks();
});

function setup(o: Opts = {}) {
  const leads: { email: string; cardId: string }[] = [];
  const asked: { name: string; email?: string }[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === TOKEN_URL) {
      expect(new URLSearchParams(String(init?.body)).get("redirect_uri")).toBe(`${BASE}/auth/linkedin/callback`);
      return Response.json({ access_token: ACCESS_TOKEN });
    }
    if (url === USERINFO_URL) {
      return Response.json(o.userinfo ?? { name: "Camille Ardent", given_name: "Camille", family_name: "Ardent", picture: PICTURE, email: EMAIL, email_verified: true });
    }
    if (url === LEADS) {
      leads.push(JSON.parse(String(init?.body)));
      return Response.json({ ok: true });
    }
    throw new Error(`appel réseau inattendu : ${url}`);
  }) as unknown as typeof fetch;
  const ctx = setupEntry({
    people: o.people,
    forUrl: o.forUrl,
    app: {
      fetchImpl,
      leadsEndpoint: LEADS,
      linkedin: o.linkedin === false ? undefined : { clientId: "client", clientSecret: "secret" },
      githubIdentity: async (_auth, who) => {
        asked.push(who);
        return o.github === undefined ? { login: "camille-dev", how: "email" } : o.github;
      },
      samePhoto: async (a, b) => (o.samePhoto ? o.samePhoto(a, b) : a === PICTURE && b === CAMILLE.photoUrl),
      ...o.app,
    },
  });
  ctxs.push(ctx);
  return { ctx, leads, asked, fetchImpl };
}

/** Le tour complet chez LinkedIn : départ, retour, et les cookies du navigateur ensuite. */
async function signIn(ctx: EntryCtx, returnPath?: string, ip = "1.1.1.1") {
  const start = await ctx.app.request(`/auth/linkedin/enter${returnPath ? `?return=${encodeURIComponent(returnPath)}` : ""}`, { headers: { "x-forwarded-for": ip } });
  const to = new URL(start.headers.get("location") ?? "http://x/");
  let jar = cookiesOf(start);
  const back = await ctx.app.request(`/auth/linkedin/callback?code=abc&state=${to.searchParams.get("state")}`, { headers: { cookie: jar, "x-forwarded-for": ip } });
  jar = cookiesOf(back, jar);
  return { start, to, back, jar };
}

const entry = async (ctx: EntryCtx, jar: string) =>
  (await (await ctx.app.request("/api/entry/linkedin", { headers: { cookie: jar } })).json()) as {
    signedIn: boolean;
    name?: string;
    auto?: { url: string; name: string; headline: string; photo?: string };
    candidates?: { url: string }[];
    off?: boolean;
  };

const kindOf = async (ctx: EntryCtx, id: string) => ((await cardState(ctx, id)) as { kind?: string }).kind;
const facts = (ctx: EntryCtx, id: string) => ctx.store.getCard(id)?.facts as { linkedinUrl?: string; linkedinProven?: boolean } | null;

describe("le départ et le retour chez LinkedIn", () => {
  it("demande nom, photo et email, puis revient sur la page de départ avec ?li=1", async () => {
    const { ctx } = setup();
    const { start, to, back, jar } = await signIn(ctx, "/c/abc?x=1");
    expect(start.status).toBe(302);
    expect(`${to.origin}${to.pathname}`).toBe(AUTHORIZE_URL);
    expect(to.searchParams.get("scope")).toBe("openid profile email");
    expect(to.searchParams.get("redirect_uri")).toBe(`${BASE}/auth/linkedin/callback`);
    expect(back.headers.get("location")).toBe(`${BASE}/c/abc?x=1&li=1`);
    expect(jar).toContain(`${ENTER_COOKIE}=`);
    expect(jar).not.toContain(`${LI_STATE_COOKIE}=`);
    const set = back.headers.getSetCookie().find((l) => l.startsWith(`${ENTER_COOKIE}=`))!;
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/Secure/i);
    // Ni l'email ni le jeton dans le cookie : un identifiant signé, rien d'autre.
    expect(decodeURIComponent(set)).not.toContain(EMAIL);
    expect(set).not.toContain(ACCESS_TOKEN);
  });

  it("une adresse de retour étrangère est ignorée", async () => {
    const { ctx } = setup();
    expect((await signIn(ctx, "https://evil.example/")).back.headers.get("location")).toBe(`${BASE}/?li=1`);
    expect((await signIn(ctx, "//evil.example")).back.headers.get("location")).toBe(`${BASE}/?li=1`);
  });

  it("annulation, état d'un autre navigateur, profil sans nom : retour sans session", async () => {
    const { ctx } = setup({ userinfo: { picture: PICTURE, email: EMAIL, email_verified: true } });
    const start = await ctx.app.request("/auth/linkedin/enter");
    const state = new URL(start.headers.get("location")!).searchParams.get("state");
    const cancel = await ctx.app.request(`/auth/linkedin/callback?error=user_cancelled_login&state=${state}`, { headers: { cookie: cookiesOf(start) } });
    expect(cancel.headers.get("location")).toBe(`${BASE}/?li=cancel`);

    const other = await ctx.app.request("/auth/linkedin/enter?return=/c/abc");
    const stolen = new URL(other.headers.get("location")!).searchParams.get("state");
    const noCookie = await ctx.app.request(`/auth/linkedin/callback?code=abc&state=${stolen}`);
    expect(noCookie.headers.get("location")).toBe(`${BASE}/?li=error`);
    expect(cookiesOf(noCookie)).not.toContain(ENTER_COOKIE);

    // LinkedIn ne rend pas de nom : rien à chercher.
    const { back, jar } = await signIn(ctx);
    expect(back.headers.get("location")).toBe(`${BASE}/?li=error`);
    expect(jar).not.toContain(ENTER_COOKIE);
    expect(await entry(ctx, jar)).toEqual({ signedIn: false });
  });

  it("le bouton n'existe qu'avec la connexion, la lecture et la recherche des profils", async () => {
    const on = setup().ctx;
    expect(await (await on.app.request("/api/config")).json()).toMatchObject({ linkedinLogin: true });
    for (const off of [setup({ people: null }).ctx, setup({ linkedin: false }).ctx]) {
      expect(await (await off.app.request("/api/config")).json()).toMatchObject({ linkedinLogin: false });
      expect((await off.app.request("/auth/linkedin/enter")).status).toBe(404);
    }
  });

  it("vingt connexions par IP et par jour", async () => {
    const { ctx } = setup();
    for (let i = 0; i < ENTER_STARTS_PER_DAY; i++) {
      expect((await ctx.app.request("/auth/linkedin/enter", { headers: { "x-forwarded-for": "9.9.9.9" } })).headers.get("location")).toContain("linkedin.com");
    }
    expect((await ctx.app.request("/auth/linkedin/enter", { headers: { "x-forwarded-for": "9.9.9.9" } })).headers.get("location")).toBe(`${BASE}/?li=error`);
    expect((await ctx.app.request("/auth/linkedin/enter", { headers: { "x-forwarded-for": "8.8.8.8" } })).headers.get("location")).toContain("linkedin.com");
  });
});

describe("retrouver le profil", () => {
  it("même photo qu'un seul homonyme : c'est lui, sans rien demander, et jamais l'email au front", async () => {
    const { ctx, asked } = setup();
    const { jar } = await signIn(ctx);
    const got = await entry(ctx, jar);
    expect(got).toEqual({ signedIn: true, name: "Camille Ardent", auto: { url: CAMILLE_URL, name: "Camille Ardent", headline: "Senior Full-Stack Engineer", photo: CAMILLE.photoUrl }, candidates: [] });
    expect(JSON.stringify(got)).not.toContain(EMAIL);
    expect(ctx.calls.byName).toEqual([{ raw: "Camille Ardent", strict: true, spent: true }]);
    expect(asked).toEqual([{ name: "Camille Ardent", email: EMAIL }]);
  });

  it("l'email d'abord : un profil rendu par la recherche inverse est sûr, sans recherche par nom", async () => {
    const { ctx } = setup({ people: { byEmail: () => HOMONYM } });
    const { jar } = await signIn(ctx);
    expect((await entry(ctx, jar)).auto?.url).toBe(HOMONYM.url);
    expect(ctx.calls.byEmail).toEqual([EMAIL]);
    expect(ctx.calls.byName).toHaveLength(0);
  });

  it("aucune photo ne concorde, ou deux : « C'est toi ? », trois candidats au plus, les homonymes d'abord", async () => {
    const others = Array.from({ length: 4 }, (_, i) => ({ ...HOMONYM, url: `${HOMONYM.url}${i}`, photoUrl: `https://media.licdn.com/dms/image/v2/D4E03AQautre${i}xxxx/p/0/1` }));
    const stranger = { ...HOMONYM, url: "https://www.linkedin.com/in/camille-autre", name: "Camille Autre" };
    const none = setup({ people: { byName: () => ({ status: "ok", results: [stranger, CAMILLE, ...others] }) }, samePhoto: () => false });
    const a = await entry(none.ctx, (await signIn(none.ctx)).jar);
    expect(a.auto).toBeUndefined();
    expect(a.candidates!.map((c) => c.url)).toEqual([CAMILLE_URL, others[0]!.url, others[1]!.url]);

    const twice = setup({ people: { byName: () => ({ status: "ok", results: [CAMILLE, ...others] }) }, samePhoto: () => true });
    const b = await entry(twice.ctx, (await signIn(twice.ctx)).jar);
    expect(b.auto).toBeUndefined();
    expect(b.candidates).toHaveLength(3);
  });

  it("un email que LinkedIn ne dit pas vérifié n'est ni cherché ni gardé", async () => {
    const { ctx, asked, leads } = setup({ userinfo: { name: "Camille Ardent", picture: PICTURE, email: EMAIL, email_verified: false } });
    const { jar } = await signIn(ctx);
    await entry(ctx, jar);
    expect(ctx.calls.byEmail).toHaveLength(0);
    expect(asked).toEqual([{ name: "Camille Ardent", email: undefined }]);
    const { json } = await postCard(ctx, { linkedin: CAMILLE_URL }, jar);
    expect(ctx.store.getCard(json.id)?.email ?? null).toBeNull();
    expect(leads).toHaveLength(0);
  });

  it("recherche éteinte ou plafond atteint : « off », le champ reprend la main", async () => {
    const { ctx } = setup({ people: { byName: () => ({ status: "off" }) } });
    expect(await entry(ctx, (await signIn(ctx)).jar)).toEqual({ signedIn: true, name: "Camille Ardent", candidates: [], off: true });
  });

  it("sans cookie, ou avec celui d'un autre : pas de session", async () => {
    const { ctx } = setup();
    await signIn(ctx);
    expect(await entry(ctx, "")).toEqual({ signedIn: false });
    expect(await entry(ctx, `${ENTER_COOKIE}=faux.faux`)).toEqual({ signedIn: false });
  });
});

describe("la fiche de la personne connectée", () => {
  it("profil sûr et GitHub par l'email : la comparaison part, prouvée, l'email posé sur la fiche et nulle part ailleurs", async () => {
    const { ctx, leads } = setup();
    const { jar } = await signIn(ctx);
    await entry(ctx, jar);
    const { status, json, res } = await postCard(ctx, { linkedin: CAMILLE_URL }, jar);
    expect(status).toBe(202);
    expect((await kindOf(ctx, json.id))).toBe("comparison");
    expect(ctx.calls.collect).toEqual(["camille-dev"]);
    expect(facts(ctx, json.id)).toEqual({ linkedinUrl: CAMILLE_URL, linkedinProven: true });
    expect(ctx.store.getCard(json.id)?.email).toBe(EMAIL);
    await vi.waitFor(() => expect(leads).toHaveLength(1));
    expect(leads[0]).toMatchObject({ email: EMAIL, cardId: json.id, event: "card_email" });
    // La session ne sert qu'une fois : le cookie part avec la fiche.
    expect(cookiesOf(res, jar)).not.toContain(ENTER_COOKIE);
    expect(await entry(ctx, jar)).toEqual({ signedIn: false });
    // L'email n'est écrit que sur les lignes de cette fiche.
    const dump = JSON.stringify(ctx.store.db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((t) => ({ t, rows: (t as { name: string }).name === "cards" ? [] : ctx.store.db.prepare(`SELECT * FROM "${(t as { name: string }).name}"`).all() })));
    expect(dump).not.toContain(EMAIL);
    expect(dump).not.toContain(ACCESS_TOKEN);
    expect(JSON.stringify(await cardState(ctx, json.id))).not.toContain(EMAIL);
  });

  it("GitHub trouvé par le nom seulement : la comparaison sort, jamais prouvée", async () => {
    const { ctx } = setup({ github: { login: "camille-nom", how: "name" } });
    const { jar } = await signIn(ctx);
    await entry(ctx, jar);
    const { json } = await postCard(ctx, { linkedin: CAMILLE_URL }, jar);
    expect((await kindOf(ctx, json.id))).toBe("comparison");
    expect(ctx.calls.collect).toEqual(["camille-nom"]);
    expect(facts(ctx, json.id)).toEqual({ linkedinUrl: CAMILLE_URL, linkedinProven: false });
  });

  it("profil choisi parmi des homonymes : même avec le GitHub de l'email, rien de prouvé", async () => {
    const { ctx } = setup({ samePhoto: () => false });
    const { jar } = await signIn(ctx);
    expect((await entry(ctx, jar)).candidates!.map((c) => c.url)).toEqual([CAMILLE_URL, HOMONYM.url]);
    const { json } = await postCard(ctx, { linkedin: HOMONYM.url }, jar);
    expect(ctx.calls.collect).toEqual(["camille-dev"]);
    expect(facts(ctx, json.id)).toEqual({ linkedinUrl: HOMONYM.url, linkedinProven: false });
    expect(ctx.store.getCard(json.id)?.email).toBe(EMAIL);
  });

  it("l'ordre : l'email, puis les liens du profil, puis le nom", async () => {
    const link = (url: string) => ({ status: "found" as const, profile: { ...CAMILLE, url, title: "", summary: "", roles: [], education: [], skills: [] }, githubLogin: "du-profil" });
    const byName = setup({ github: { login: "camille-nom", how: "name" }, forUrl: link });
    let jar = (await signIn(byName.ctx)).jar;
    await entry(byName.ctx, jar);
    await postCard(byName.ctx, { linkedin: CAMILLE_URL }, jar);
    expect(byName.ctx.calls.collect).toEqual(["du-profil"]);

    const byEmail = setup({ forUrl: link });
    jar = (await signIn(byEmail.ctx)).jar;
    await entry(byEmail.ctx, jar);
    await postCard(byEmail.ctx, { linkedin: CAMILLE_URL }, jar);
    expect(byEmail.ctx.calls.collect).toEqual(["camille-dev"]);
  });

  it("aucun GitHub : la fiche LinkedIn sort seule, avec son contact", async () => {
    const { ctx } = setup({ github: null });
    const { jar } = await signIn(ctx);
    await entry(ctx, jar);
    const { json } = await postCard(ctx, { linkedin: CAMILLE_URL }, jar);
    const state = await cardState(ctx, json.id);
    expect(state.state).toBe("done");
    expect((state as { kind?: string }).kind).not.toBe("comparison");
    expect(ctx.calls.collect).toHaveLength(0);
    expect(ctx.store.getCard(json.id)?.email).toBe(EMAIL);
  });

  it("un GitHub masqué par son propriétaire n'est pas ressorti par l'identité", async () => {
    const { ctx } = setup();
    ctx.store.claimOwner("camille-dev", 42);
    ctx.store.setOwnerHidden("camille-dev", true);
    const { jar } = await signIn(ctx);
    await entry(ctx, jar);
    const { json } = await postCard(ctx, { linkedin: CAMILLE_URL }, jar);
    expect((await kindOf(ctx, json.id))).not.toBe("comparison");
    expect(ctx.calls.collect).toHaveLength(0);
  });

  it("un autre profil que ceux proposés ne reçoit ni GitHub ni email, et la session reste", async () => {
    const { ctx, leads } = setup();
    const { jar } = await signIn(ctx);
    await entry(ctx, jar);
    const other = "https://www.linkedin.com/in/quelqu-un-d-autre";
    const { json, res } = await postCard(ctx, { linkedin: other }, jar);
    expect(ctx.calls.collect).toHaveLength(0);
    expect(ctx.store.getCard(json.id)?.email ?? null).toBeNull();
    expect(leads).toHaveLength(0);
    expect(cookiesOf(res, jar)).toContain(ENTER_COOKIE);
    expect((await entry(ctx, jar)).auto?.url).toBe(CAMILLE_URL);
  });

  it("une fiche déjà sortie sans GitHub est refaite en comparaison ; déjà comparée, elle est resservie avec le contact", async () => {
    const { ctx } = setup();
    const alone = await postCard(ctx, { linkedin: CAMILLE_URL });
    expect((await kindOf(ctx, alone.json.id))).not.toBe("comparison");
    let jar = (await signIn(ctx)).jar;
    await entry(ctx, jar);
    const redone = await postCard(ctx, { linkedin: CAMILLE_URL }, jar);
    expect(redone.status).toBe(202);
    expect(redone.json.id).not.toBe(alone.json.id);
    expect((await kindOf(ctx, redone.json.id))).toBe("comparison");

    ctx.store.db.prepare(`UPDATE cards SET email = NULL`).run();
    jar = (await signIn(ctx)).jar;
    await entry(ctx, jar);
    const again = await postCard(ctx, { linkedin: CAMILLE_URL }, jar);
    expect(again.status).toBe(200);
    expect(again.json).toEqual({ id: redone.json.id, cached: true });
    expect(ctx.store.getCard(redone.json.id)?.email).toBe(EMAIL);
  });

  it("une dénonciation ne prend jamais l'identité de qui dénonce", async () => {
    const { ctx } = setup();
    const mine = await postCard(ctx, { login: "moi" });
    const { jar } = await signIn(ctx);
    await entry(ctx, jar);
    const { json } = await postCard(ctx, { linkedin: CAMILLE_URL, denouncedBy: mine.json.id }, jar);
    expect(ctx.calls.collect).toEqual(["moi"]);
    expect(ctx.store.getCard(json.id)?.email ?? null).toBeNull();
  });
});
