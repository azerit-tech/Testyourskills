// Le duel d'une dénonciation (§18.94) : l'aperçu du lien envoyé par le dénonciateur.

import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURES } from "../../shared/fixtures";
import type { CardData, Grid } from "../../shared/types";
import { createApp, removeImages } from "./app";
import { SESSION_COOKIE, signSession } from "./auth";
import { Store } from "./db";
import { DUEL_DIR, duelVerdict } from "./duel";
import type { CardBody, Deps } from "./pipeline";
import { renderSvg } from "./render/index";

const BASE = "https://skills.test";
const SECRET = "s".repeat(40);

function body(card: CardData): CardBody {
  const { id: _id, createdAt: _c, ...rest } = card;
  return rest;
}

/** Un dossier vide (rien de prouvé) : fait par un tiers, il sort scellé (shared/publicView.ts). */
const EMPTY: Grid = {
  criteria: [{ code: "CODE", score: null, state: "unproven", counted: false, source: "github", reached: { fr: "", en: "" }, flags: [] }],
  overall: 20,
  rule: "empty_file",
};

/** La note de chaque pseudo : leamd 79 (★★★★★), camroux 67 (★★★★), ines-h 75 (★★★★★), « vide » : un dossier vide. */
const OVERALL: Record<string, number> = { leamd: 79, camroux: 67, "ines-h": 75 };

const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
});

function setup() {
  const store = new Store(":memory:");
  stores.push(store);
  const ogDir = join(mkdtempSync(join(tmpdir(), "tys-duel-")), "og");
  mkdirSync(ogDir);
  const rendered: Parameters<Deps["renderImage"]>[0][] = [];
  const deps = {
    async collectGithub(login: string) {
      return { login, profile: { login }, accomplices: [] };
    },
    async pickFilesForReading() {
      return [];
    },
    async readCode() {
      return { readings: [], ai_status: "ai_typed" };
    },
    aiAvailable: () => true,
    scoreGithub(facts: unknown, _ai: unknown, { lang, judgedInSeconds }: { lang: "fr" | "en"; judgedInSeconds: number }) {
      const login = (facts as { login: string }).login;
      const empty = login === "vide";
      return {
        ...body(FIXTURES.gold),
        login,
        name: login,
        lang,
        judgedInSeconds,
        overall: empty ? EMPTY.overall : (OVERALL[login] ?? 79),
        ...(empty ? { grid: EMPTY } : {}),
      };
    },
    async renderImage(input: Parameters<Deps["renderImage"]>[0]) {
      rendered.push(input);
      return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    },
  } as unknown as Deps;
  const { app, pipeline } = createApp({ store, deps, githubToken: "t", baseUrl: BASE, ogDir, githubAuth: { clientId: "gh-client", clientSecret: "x", sessionSecret: SECRET } });
  return { app, pipeline, store, ogDir, rendered };
}

type Ctx = ReturnType<typeof setup>;

async function post(ctx: Ctx, payload: Record<string, unknown>, headers: Record<string, string> = {}) {
  const res = await ctx.app.request("/api/card", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7", ...headers },
    body: JSON.stringify({ lang: "fr", ...payload }),
  });
  const json = (await res.json()) as { id: string };
  await ctx.pipeline.wait(json.id);
  return json.id;
}

const asOwner = (login: string, githubId: number) => ({ cookie: `${SESSION_COOKIE}=${encodeURIComponent(signSession(SECRET, { login, githubId }))}` });

const meta = (html: string, prop: string) => new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)">`).exec(html)?.[1];

async function page(ctx: Ctx, path: string) {
  return (await ctx.app.request(path)).text();
}

describe("le duel dans l'aperçu du lien envoyé (§18.94)", () => {
  it("og:image et twitter:image : le duel quand r est une autre fiche notée ; « On te dénonce » pour le dénonciateur", async () => {
    const ctx = setup();
    const by = await post(ctx, { login: "leamd" });
    const target = await post(ctx, { login: "camroux", denouncedBy: by });

    const duel = await page(ctx, `/c/${target}?r=${by}`);
    expect(meta(duel, "og:image")).toMatch(new RegExp(`^${BASE}/og/${target}-vs-${by}\\.png\\?v=\\d+&amp;k=[0-9a-f]{12}$`));
    expect(meta(duel, "twitter:image")).toBe(meta(duel, "og:image"));
    // Anonyme (pas connecté comme propriétaire) : l'aperçu ne nomme pas le dénonciateur.
    expect(meta(duel, "og:title")).toBe("On te dénonce : 79 contre 67. À toi de jouer.");
    expect(meta(duel, "og:description")).toBe("@leamd a une étoile d&#39;avance. Reprends ta fiche et fais mieux.");
    // og:url reste l'adresse de la fiche, sans r.
    expect(meta(duel, "og:url")).toBe(`${BASE}/c/${target}`);

    // r = elle-même, un id mal formé ou inconnu : l'aperçu habituel, inchangé.
    const usual = await page(ctx, `/c/${target}`);
    for (const r of [target, "pasunid", "zzzzzzzzzz"]) {
      const html = await page(ctx, `/c/${target}?r=${r}`);
      expect(meta(html, "og:image")).toBe(meta(usual, "og:image"));
      expect(meta(html, "og:title")).toBe(meta(usual, "og:title"));
    }
    expect(meta(usual, "og:image")).toMatch(new RegExp(`/og/${target}\\.png`));
  });

  it("« Lui envoyer ma note » (§18.115) : r une autre fiche notée, le face-à-face sans nommer qui envoie", async () => {
    const ctx = setup();
    const by = await post(ctx, { login: "leamd" });
    const target = await post(ctx, { login: "camroux", denouncedBy: by });
    const other = await post(ctx, { login: "ines-h" });
    const html = await page(ctx, `/c/${target}?r=${other}`);
    expect(meta(html, "og:image")).toMatch(new RegExp(`^${BASE}/og/${target}-vs-${other}\\.png\\?v=\\d+&amp;k=[0-9a-f]{12}$`));
    expect(meta(html, "og:title")).toBe("Face-à-face\u00a0: 75 contre 67. À toi de jouer.");
    expect(meta(html, "og:description")).toBe("@ines-h a une étoile d&#39;avance. Ouvre et compare.");
    // Une fiche non dénoncée, ouverte avec r = une autre : le face-à-face aussi.
    const back = await page(ctx, `/c/${by}?r=${target}`);
    expect(meta(back, "og:image")).toMatch(new RegExp(`/og/${by}-vs-${target}\\.png`));
    expect(meta(back, "og:title")).toBe("Face-à-face\u00a0: 67 contre 79. À toi de jouer.");
    expect((await ctx.app.request(`/og/${target}-vs-${other}.png`)).status).toBe(200);
    // Masquée : plus de face-à-face, l'image répond 404.
    ctx.store.claimOwner("ines-h", 77);
    ctx.store.setOwnerHidden("ines-h", true);
    expect(meta(await page(ctx, `/c/${target}?r=${other}`), "og:image")).toMatch(new RegExp(`/og/${target}\\.png`));
    expect((await ctx.app.request(`/og/${target}-vs-${other}.png`)).status).toBe(404);
  });

  it("le dénonciateur connecté comme propriétaire est nommé : « @leamd te dénonce : 79 contre 67 »", async () => {
    const ctx = setup();
    const by = await post(ctx, { login: "leamd" });
    ctx.store.claimOwner("leamd", 4242);
    const target = await post(ctx, { login: "camroux", denouncedBy: by }, asOwner("leamd", 4242));
    const html = await page(ctx, `/c/${target}?r=${by}`);
    expect(meta(html, "og:title")).toBe("@leamd te dénonce : 79 contre 67. À toi de jouer.");
  });

  it("dénonciateur masqué : l'aperçu habituel, et l'image du duel répond 404", async () => {
    const ctx = setup();
    const by = await post(ctx, { login: "leamd" });
    const target = await post(ctx, { login: "camroux", denouncedBy: by });
    ctx.store.claimOwner("leamd", 4242);
    ctx.store.setOwnerHidden("leamd", true);
    const html = await page(ctx, `/c/${target}?r=${by}`);
    expect(meta(html, "og:image")).toMatch(new RegExp(`/og/${target}\\.png`));
    expect((await ctx.app.request(`/og/${target}-vs-${by}.png`)).status).toBe(404);
  });

  it("l'image : les deux vues publiques, rendue une fois, cache court ; une fiche face à elle-même ou inconnue répond 404", async () => {
    const ctx = setup();
    const by = await post(ctx, { login: "leamd" });
    const target = await post(ctx, { login: "camroux", denouncedBy: by });
    const res = await ctx.app.request(`/og/${target}-vs-${by}.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(ctx.rendered).toHaveLength(1);
    const input = ctx.rendered[0]!;
    expect(input.format).toBe("duel");
    expect(input.duel!.by.id).toBe(by);
    expect(input.duel!.target.id).toBe(target);
    // Faite par un tiers, pas revendiquée : sans grille, comme sur la page partagée.
    expect(input.duel!.target.grid).toBeUndefined();
    // Du cache disque : pas de second rendu.
    await ctx.app.request(`/og/${target}-vs-${by}.png`);
    expect(ctx.rendered).toHaveLength(1);
    for (const path of [`/og/${target}-vs-${target}.png`, `/og/${target}-vs-zzzzzzzzzz.png`, `/og/zzzzzzzzzz-vs-${by}.png`]) {
      expect((await ctx.app.request(path)).status).toBe(404);
    }
  });

  it("dossier vide d'un tiers : ni note ni étoiles ; « ? » dans l'image et le verdict invite", async () => {
    const ctx = setup();
    const by = await post(ctx, { login: "leamd" });
    const target = await post(ctx, { login: "vide", denouncedBy: by });
    const html = await page(ctx, `/c/${target}?r=${by}`);
    expect(meta(html, "og:image")).toMatch(new RegExp(`/og/${target}-vs-${by}\\.png`));
    expect(meta(html, "og:title")).toBe("On te dénonce. À toi de jouer.");
    expect(meta(html, "og:description")).toBe("Fais mieux que @leamd ? Reprends ta fiche.");
    expect(html).not.toMatch(/content="[^"]*\b20\b[^"]*"/);
    await ctx.app.request(`/og/${target}-vs-${by}.png`);
    const { duel } = ctx.rendered[0]!;
    expect(duel!.target.sealed).toBe(true);
    const svg = await renderSvg({ format: "duel", duel: { by: { ...duel!.by, avatarUrl: undefined }, target: { ...duel!.target, avatarUrl: undefined } }, lang: "fr" });
    const side = /<g data-duel-side="target">(.*?)<\/g>/.exec(svg)![1]!;
    expect(side).toContain(">?</text>");
    expect(side).not.toContain("data-star-row");
    expect(side).not.toContain(">20<");
    expect(svg).toContain("FAIS MIEUX QUE @LEAMD ?");
  });

  it("la purge : une revendication change l'image ; removeImages efface tous les duels d'une fiche", async () => {
    const ctx = setup();
    const by = await post(ctx, { login: "leamd" });
    const target = await post(ctx, { login: "vide", denouncedBy: by });
    const files = () => (existsSync(join(ctx.ogDir, DUEL_DIR)) ? readdirSync(join(ctx.ogDir, DUEL_DIR)) : []);
    await ctx.app.request(`/og/${target}-vs-${by}.png`);
    expect(files()).toHaveLength(1);
    const before = meta(await page(ctx, `/c/${target}?r=${by}`), "og:image");

    // Revendiquée par sa personne : la clé change, l'image se redessine, non scellée
    // (« C'est moi » efface aussi l'ancien fichier, auth.test.ts).
    ctx.store.claimOwner("vide", 7);
    const after = meta(await page(ctx, `/c/${target}?r=${by}`), "og:image");
    expect(after).not.toBe(before);
    await ctx.app.request(`/og/${target}-vs-${by}.png`);
    expect(ctx.rendered).toHaveLength(2);
    expect(ctx.rendered[1]!.duel!.target.sealed).toBeUndefined();
    // removeImages, que le masquage, la photo, la suppression et la purge appellent, efface tous les duels de la fiche.
    expect(files()).toHaveLength(2);
    await removeImages(ctx.ogDir, [by]);
    expect(files()).toEqual([]);
    // Un fichier d'un autre couple reste.
    mkdirSync(join(ctx.ogDir, DUEL_DIR), { recursive: true });
    writeFileSync(join(ctx.ogDir, DUEL_DIR, `aaaaaa111-vs-bbbbbb222-0123456789ab.png`), "x");
    await removeImages(ctx.ogDir, [target]);
    expect(files()).toEqual(["aaaaaa111-vs-bbbbbb222-0123456789ab.png"]);
  });

  it("le verdict : les étoiles d'abord, les points à étoiles égales, l'égalité (shared/versus.ts)", () => {
    const c = (overall: number, login: string) => ({ ...FIXTURES.gold, overall, login });
    expect(duelVerdict({ by: c(79, "moi"), target: c(67, "x") }, "fr")).toBe("@moi a une étoile d'avance");
    expect(duelVerdict({ by: c(44, "moi"), target: c(91, "x") }, "fr")).toBe("@x a 4 étoiles d'avance");
    expect(duelVerdict({ by: c(64, "moi"), target: c(71, "x") }, "fr")).toBe("@x a 7 points d'avance");
    expect(duelVerdict({ by: c(71, "moi"), target: c(71, "x") }, "fr")).toBe("Égalité : complices");
    expect(duelVerdict({ by: c(79, "moi"), target: c(67, "x") }, "en")).toBe("@moi is one star ahead");
    expect(duelVerdict({ by: c(79, "moi"), target: { ...c(20, "x"), sealed: true } }, "en")).toBe("Beat @moi?");
  });
});
