// Banc d'essai du compte léger (SPEC §18.85) : l'application avec de faux LinkedIn
// et GitHub, et les tours de connexion d'un navigateur. Aucun appel réel.

import { expect, vi } from "vitest";
import { GH_TOKEN_URL, GH_USER_URL } from "./auth";
import { TOKEN_URL, USERINFO_URL } from "./linkedin";
import type { LinkedinFinder } from "./linkedinProfile/index";
import { CAMILLE, CAMILLE_URL, PROFILE, cookiesOf, postCard, setupEntry, type EntryCtx } from "./entry/testing";

export const BASE = "https://skills.test";
export const SECRET = "s".repeat(40);
export const SUB = "oidc-sub-4f2a";
export const EMAIL = "camille@ardent.dev";
export const PICTURE = "https://media.licdn.com/dms/image/v2/D4E03AQoidc/profile-displayphoto-shrink_100_100/0/9";

const ctxs: EntryCtx[] = [];
/** À appeler après chaque test. */
export function closeAll() {
  while (ctxs.length) ctxs.pop()!.store.close();
  vi.restoreAllMocks();
}

export interface AccountSetup {
  /** SESSION_SECRET ; null : absent. */
  secret?: string | null;
  /** « C'est moi » configuré (le GitHub prouvé donne un propriétaire). */
  claim?: boolean;
  ghUser?: { login: string; id: number };
}

export function setupAccount(o: AccountSetup = {}) {
  /** Les lectures de profil, rangées dans ctx.calls.forUrl comme le banc des entrées. */
  const read: { urls: string[] } = { urls: [] };
  // Un lecteur de profils qui fait aussi le dossier LinkedIn + GitHub (« Ajoute ton GitHub »), lien non prouvé.
  const linkedinProfiles: LinkedinFinder = {
    async forGithub(_facts, opts) {
      return opts?.url ? { profile: { ...PROFILE, url: opts.url }, proven: false } : null;
    },
    async forUrl(url) {
      read.urls.push(url);
      return { status: "found", profile: { ...PROFILE, url }, githubLogin: null };
    },
  };
  const ghUser = o.ghUser ?? { login: "camille-dev", id: 4242 };
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url === TOKEN_URL || url === GH_TOKEN_URL) return Response.json({ access_token: "T" });
    if (url === USERINFO_URL) return Response.json({ sub: SUB, name: "Camille Ardent", picture: PICTURE, email: EMAIL, email_verified: true });
    if (url === GH_USER_URL) return Response.json(ghUser);
    if (url.startsWith("https://media.licdn.com/")) return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]), { headers: { "content-type": "image/jpeg" } });
    throw new Error(`appel réseau inattendu : ${url}`);
  }) as unknown as typeof fetch;
  const secret = o.secret === null ? undefined : (o.secret ?? SECRET);
  const ctx = setupEntry({
    app: {
      fetchImpl,
      linkedin: { clientId: "client", clientSecret: "secret" },
      githubLogin: { clientId: "gh", clientSecret: "gh-secret" },
      githubAuth: o.claim && secret ? { clientId: "gh", clientSecret: "gh-secret", sessionSecret: secret } : undefined,
      accountSecret: secret,
      githubIdentity: async () => null,
      samePhoto: async (a, b) => a === PICTURE && b === CAMILLE.photoUrl,
      linkedinProfiles,
    },
  });
  read.urls = ctx.calls.forUrl;
  ctxs.push(ctx);
  return ctx;
}

/** Le tour chez LinkedIn par l'entrée ; `jar` : les cookies que le navigateur a déjà. */
export async function linkedinIn(ctx: EntryCtx, jar = "", query = "") {
  const start = await ctx.app.request(`/auth/linkedin/enter${query}`, { headers: { cookie: jar } });
  const state = new URL(start.headers.get("location")!).searchParams.get("state");
  jar = cookiesOf(start, jar);
  const back = await ctx.app.request(`/auth/linkedin/callback?code=abc&state=${state}`, { headers: { cookie: jar } });
  return { back, jar: cookiesOf(back, jar), location: back.headers.get("location") };
}

/** Le tour chez GitHub par l'entrée. */
export async function githubIn(ctx: EntryCtx, jar = "", query = "") {
  const start = await ctx.app.request(`/auth/github/enter${query}`, { headers: { cookie: jar } });
  const state = new URL(start.headers.get("location")!).searchParams.get("state");
  jar = cookiesOf(start, jar);
  const back = await ctx.app.request(`/auth/github/callback?code=abc&state=${state}`, { headers: { cookie: jar } });
  return { back, jar: cookiesOf(back, jar), location: back.headers.get("location") };
}

export interface MeBody {
  login: string | null;
  hidden: boolean;
  cardId: string | null;
  avatarUrl: string | null;
  initial: string | null;
  sources: string[];
}

export const me = async (ctx: EntryCtx, jar: string) => (await (await ctx.app.request("/api/me", { headers: { cookie: jar } })).json()) as MeBody | null;

export const rows = (ctx: EntryCtx) => ctx.store.db.prepare(`SELECT * FROM accounts`).all() as { id: string; linkedin_key: string | null; github_id: number | null; card_id: string | null }[];

/** La fiche lancée par l'entrée LinkedIn connectée : le profil sûr, la fiche part. */
export async function linkedinCard(ctx: EntryCtx, jar: string) {
  const r = await ctx.app.request("/api/entry/linkedin", { headers: { cookie: jar } });
  expect(((await r.json()) as { auto?: { url: string } }).auto?.url).toBe(CAMILLE_URL);
  const card = await postCard(ctx, { linkedin: CAMILLE_URL }, jar);
  return { ...card, jar: cookiesOf(card.res, jar) };
}

/** La fiche lancée par l'entrée GitHub connectée : le pseudo échangé, puis la fiche. */
export async function githubCard(ctx: EntryCtx, jar: string) {
  const r = await ctx.app.request("/api/entry/github", { headers: { cookie: jar } });
  const { login } = (await r.json()) as { login: string };
  jar = cookiesOf(r, jar);
  const card = await postCard(ctx, { login }, jar);
  return { ...card, jar: cookiesOf(card.res, jar) };
}

/** Seulement le cookie du compte : un autre navigateur, sans jeton ni session « C'est moi ». */
export const onlyAccount = (jar: string) => jar.split(/;\s*/).filter((kv) => kv.startsWith("tys_acct=")).join("; ");
