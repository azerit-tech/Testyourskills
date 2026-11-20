// La photo LinkedIn par défaut (SPEC §18.98) : chaque porte, de bout en bout, avec de
// faux LinkedIn, GitHub et fournisseur de profils. Aucun appel réel.

import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fileOf } from "../../shared/caseFile";
import type { CardData, ComparisonData, JobState } from "../../shared/types";
import { GH_TOKEN_URL, GH_USER_URL } from "./auth";
import { TOKEN_URL, USERINFO_URL } from "./linkedin";
import type { LinkedinFinder } from "./linkedinProfile/index";
import { CAMILLE, CAMILLE_URL, PROFILE, cookiesOf, postCard, setupEntry, type EntryCtx } from "./entry/testing";

const BASE = "https://skills.test";
const SECRET = "s".repeat(40);
/** La photo que « Se connecter avec LinkedIn » rend. */
const PICTURE = "https://media.licdn.com/dms/image/v2/D4E03AQoidc/profile-displayphoto-shrink_100_100/0/9?e=1790000000&t=sig";
/** La photo que le fournisseur de profils lit sur le profil public. */
const PROFILE_PHOTO = "https://media.licdn.com/dms/image/v2/D4E03AQprof/profile-displayphoto-shrink_400_400/0/1?e=1790000000&t=sig";
const GH_AVATAR = "https://avatars.githubusercontent.com/u/4242?v=4";
const OIDC_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 1]);
const PROFILE_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 2, 2]);

const ctxs: EntryCtx[] = [];
afterEach(() => {
  while (ctxs.length) ctxs.pop()!.store.close();
  vi.restoreAllMocks();
});

interface Opts {
  /** Le GitHub que l'identité LinkedIn donne ; null : aucun. */
  github?: { login: string; how: "email" | "name" } | null;
  /** La photo du profil lu par le fournisseur ; null : aucune. */
  profilePhoto?: string | null;
  /** Le LinkedIn que la fiche GitHub trouve (entrée GitHub). */
  forGithub?: boolean;
  /** La photo de LinkedIn ne se télécharge plus (adresse signée expirée). */
  expired?: boolean;
}

function setup(o: Opts = {}) {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const photoFetches: string[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url === TOKEN_URL || url === GH_TOKEN_URL) return Response.json({ access_token: "T" });
    if (url === USERINFO_URL) return Response.json({ sub: "sub-1", name: "Camille Ardent", picture: PICTURE, email: "camille@ardent.dev", email_verified: true });
    if (url === GH_USER_URL) return Response.json({ login: "camille-dev", id: 4242 });
    if (url.startsWith("https://media.licdn.com/")) {
      photoFetches.push(url);
      if (o.expired) return new Response("URL signature expired", { status: 403 });
      return new Response(url === PICTURE ? OIDC_JPEG : PROFILE_JPEG, { headers: { "content-type": "image/jpeg" } });
    }
    throw new Error(`appel réseau inattendu : ${url}`);
  }) as unknown as typeof fetch;
  const profile = { ...PROFILE, ...(o.profilePhoto === null ? {} : { photoUrl: o.profilePhoto ?? PROFILE_PHOTO }) };
  const linkedinProfiles: LinkedinFinder = {
    async forGithub(_facts, opts) {
      if (opts?.url) return { profile: { ...profile, url: opts.url }, proven: false };
      return o.forGithub ? { profile, proven: true } : null;
    },
    async forUrl(url) {
      return { status: "found", profile: { ...profile, url }, githubLogin: null };
    },
  };
  const avatarDir = mkdtempSync(join(tmpdir(), "tys-photo-"));
  const ctx = setupEntry({
    app: {
      fetchImpl,
      avatarDir,
      linkedin: { clientId: "client", clientSecret: "secret" },
      githubLogin: { clientId: "gh", clientSecret: "gh-secret" },
      accountSecret: SECRET,
      githubIdentity: async () => (o.github === undefined ? null : o.github),
      samePhoto: async (a, b) => a === PICTURE && b === CAMILLE.photoUrl,
      linkedinProfiles,
    },
  });
  // Les fiches GitHub du banc portent un vrai avatar GitHub : la photo LinkedIn doit passer devant.
  const scoreGithub = ctx.pipeline["opts"].deps.scoreGithub;
  ctx.pipeline["opts"].deps.scoreGithub = (...args: Parameters<typeof scoreGithub>) => ({ ...scoreGithub(...args), avatarUrl: GH_AVATAR });
  ctxs.push(ctx);
  return { ctx, avatarDir, photoFetches, linkedinProfiles };
}

async function linkedinIn(ctx: EntryCtx, jar = "") {
  const start = await ctx.app.request("/auth/linkedin/enter", { headers: { cookie: jar } });
  const state = new URL(start.headers.get("location")!).searchParams.get("state");
  jar = cookiesOf(start, jar);
  const back = await ctx.app.request(`/auth/linkedin/callback?code=abc&state=${state}`, { headers: { cookie: jar } });
  return { jar: cookiesOf(back, jar), location: back.headers.get("location") };
}

/** La fiche lancée par l'entrée LinkedIn connectée : le profil sûr (même photo), la fiche part. */
async function linkedinCard(ctx: EntryCtx, jar: string) {
  const r = await ctx.app.request("/api/entry/linkedin", { headers: { cookie: jar } });
  expect(((await r.json()) as { auto?: { url: string } }).auto?.url).toBe(CAMILLE_URL);
  return postCard(ctx, { linkedin: CAMILLE_URL }, jar);
}

/** Ce que la page de la fiche montre : la fiche, ou celle du dossier. */
async function shown(ctx: EntryCtx, id: string): Promise<CardData> {
  const job = (await (await ctx.app.request(`/api/card/${id}`)).json()) as JobState;
  if (job.state !== "done") throw new Error(`fiche ${id} : ${job.state}`);
  return job.kind === "card" ? job.card : fileOf(job.comparison as ComparisonData);
}

/** La photo est chez nous, sous le nom de la fiche, et c'est bien celle attendue. */
function expectOwnPhoto(card: CardData, avatarDir: string, id: string, bytes: Uint8Array) {
  expect(card.photoSource).toBe("linkedin");
  expect(card.avatarUrl?.startsWith(`${BASE}/avatar/${id}.jpg?v=`)).toBe(true);
  expect(card.avatarUrl).not.toContain("licdn");
  const file = join(avatarDir, `${id}.jpg`);
  expect(existsSync(file)).toBe(true);
  expect(new Uint8Array(readFileSync(file))).toEqual(bytes);
}

describe("la photo LinkedIn, par défaut (§18.98)", () => {
  it("« Se connecter avec LinkedIn » : la fiche naît avec la photo que LinkedIn vient de rendre, copiée chez nous", async () => {
    const { ctx, avatarDir } = setup();
    const { jar } = await linkedinIn(ctx);
    const { json, status } = await linkedinCard(ctx, jar);
    expect(status).toBe(202);
    const card = await shown(ctx, json.id);
    expectOwnPhoto(card, avatarDir, json.id, OIDC_JPEG);
    // Servie par nous, pour toujours : l'adresse signée de LinkedIn peut expirer.
    const av = await ctx.app.request(new URL(card.avatarUrl!).pathname);
    expect(av.status).toBe(200);
    expect(new Uint8Array(await av.arrayBuffer())).toEqual(OIDC_JPEG);
  });

  it("connexion LinkedIn et GitHub retrouvé : le dossier montre la photo LinkedIn, pas l'avatar GitHub", async () => {
    const { ctx, avatarDir } = setup({ github: { login: "camille-dev", how: "email" } });
    const { jar } = await linkedinIn(ctx);
    const { json } = await linkedinCard(ctx, jar);
    const row = ctx.store.getCard(json.id)!;
    expect(row.kind).toBe("comparison");
    const cmp = row.data as ComparisonData;
    expect(cmp.github.avatarUrl).toBe(cmp.cv.avatarUrl);
    expectOwnPhoto(await shown(ctx, json.id), avatarDir, json.id, OIDC_JPEG);
  });

  it("un lien LinkedIn collé, ou une personne choisie sous le champ : la photo du profil lu", async () => {
    const { ctx, avatarDir } = setup();
    const { json } = await postCard(ctx, { linkedin: CAMILLE_URL });
    expectOwnPhoto(await shown(ctx, json.id), avatarDir, json.id, PROFILE_JPEG);
  });

  it("une dénonciation par le nom : la photo du profil lu aussi", async () => {
    const { ctx, avatarDir } = setup();
    const mine = await postCard(ctx, { login: "lea-dev" });
    const { json, status } = await postCard(ctx, { linkedin: "https://www.linkedin.com/in/sacha-roux", denouncedBy: mine.json.id });
    expect(status).toBe(202);
    expectOwnPhoto(ctx.store.getCard(json.id)!.data as CardData, avatarDir, json.id, PROFILE_JPEG);
  });

  it("une fiche GitHub dont le LinkedIn est trouvé (bio, README, registre) : la photo LinkedIn passe devant l'avatar GitHub", async () => {
    const { ctx, avatarDir } = setup({ forGithub: true });
    const { json } = await postCard(ctx, { login: "camille-dev" });
    expect(ctx.store.getCard(json.id)!.kind).toBe("comparison");
    expectOwnPhoto(await shown(ctx, json.id), avatarDir, json.id, PROFILE_JPEG);
  });

  it("GitHub seul, sans LinkedIn : l'avatar GitHub, et aucune photo téléchargée", async () => {
    const { ctx, photoFetches } = setup();
    const { json } = await postCard(ctx, { login: "lea-dev" });
    const card = await shown(ctx, json.id);
    expect(card.avatarUrl).toBe(GH_AVATAR);
    expect(card.photoSource).toBeUndefined();
    expect(photoFetches).toEqual([]);
  });

  it("une photo LinkedIn qui ne se télécharge plus (adresse expirée) : la fiche sort, avec l'avatar GitHub à défaut", async () => {
    const { ctx } = setup({ forGithub: true, expired: true });
    const { json } = await postCard(ctx, { login: "camille-dev" });
    const card = await shown(ctx, json.id);
    expect(card.avatarUrl).toBe(GH_AVATAR);
    expect(card.photoSource).toBeUndefined();
  });

  it("revenir par LinkedIn sur sa fiche sans photo : la photo de la connexion s'y pose", async () => {
    const { ctx, avatarDir } = setup({ profilePhoto: null });
    const first = await linkedinIn(ctx);
    const { json } = await linkedinCard(ctx, first.jar);
    // Une fiche d'avant le §18.98 : sans photo.
    const row = ctx.store.getCard(json.id)!;
    ctx.store.updateData(json.id, { ...(row.data as CardData), avatarUrl: undefined, photoSource: undefined });
    const again = await linkedinIn(ctx);
    expect(again.location).toBe(`${BASE}/c/${json.id}`);
    expectOwnPhoto(await shown(ctx, json.id), avatarDir, json.id, OIDC_JPEG);
  });

  it("la fiche de son profil resservie du cache (faite par un lien collé, sans photo) : la photo de la connexion s'y pose", async () => {
    const { ctx, avatarDir } = setup({ profilePhoto: null });
    const pasted = await postCard(ctx, { linkedin: CAMILLE_URL });
    expect((await shown(ctx, pasted.json.id)).avatarUrl).toBeUndefined();
    const { jar } = await linkedinIn(ctx);
    const { json } = await linkedinCard(ctx, jar);
    expect(json).toMatchObject({ id: pasted.json.id, cached: true });
    expectOwnPhoto(await shown(ctx, json.id), avatarDir, json.id, OIDC_JPEG);
  });

  it("« Ajoute ton GitHub » : la photo LinkedIn de la fiche complétée passe au dossier", async () => {
    const { ctx, avatarDir, linkedinProfiles } = setup();
    const li = await postCard(ctx, { linkedin: CAMILLE_URL });
    expectOwnPhoto(await shown(ctx, li.json.id), avatarDir, li.json.id, PROFILE_JPEG);
    // Le profil n'a plus de photo à la relecture (cache) : celle de la fiche complétée suit.
    linkedinProfiles.forGithub = async (_f, opts) =>
      opts?.url ? { profile: { ...PROFILE, url: opts.url }, proven: false } : null;
    const r = await ctx.app.request("/api/card", {
      method: "POST",
      headers: { "content-type": "application/json", "x-card-token": li.json.deleteToken! },
      body: JSON.stringify({ lang: "fr", login: "camille-dev", linkedin: CAMILLE_URL, from: li.json.id }),
    });
    const body = (await r.json()) as { id: string };
    await ctx.pipeline.wait(body.id);
    await vi.waitFor(() => expect((ctx.store.getCard(body.id)!.data as ComparisonData).cv.photoSource).toBe("linkedin"));
    expectOwnPhoto(await shown(ctx, body.id), avatarDir, body.id, PROFILE_JPEG);
  });
});
