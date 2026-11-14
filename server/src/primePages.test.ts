// Le partage d'une prime (§18.4) : l'image 1200 × 630, son cache, les balises
// de /primes et /primes/:id. Entreprises inventées, aucun vrai logo.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PrimeView } from "../../shared/primes";
import type { Prime, Season } from "../../shared/season";
import { createApp } from "./app";
import { Store } from "./db";
import type { Deps, RenderInput } from "./pipeline";
import { logoSize, primeImageKey, primeMeta, readLogo } from "./primePages";
import { renderImage } from "./render/index";

const DAY = 24 * 3600 * 1000;
const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

const prime = (over: Partial<Prime> = {}): Prime => ({
  id: "demo-stage",
  company: "Entreprise Démo",
  contract: "stage",
  positions: ["BE", "FS"],
  languages: ["Go"],
  interviews: 3,
  place: "Ville Démo",
  remote: false,
  pitch: { fr: "Démo.", en: "Demo." },
  ...over,
});
const season = (primes: Prime[]): Season => ({ number: 1, start: day(-30), end: day(60), primes, rulesPublished: false });

const view = (over: Partial<PrimeView> = {}): PrimeView => ({ ...prime(), from: day(-30), to: day(12), phase: "open", daysLeft: 12, entrants: 4, ...over });

/** Un PNG minimal de 40 × 10 : signature et en-tête IHDR suffisent à logoSize. */
function tinyPng(w: number, h: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
});

function setup(s: Season | null) {
  const store = new Store(":memory:");
  stores.push(store);
  const root = mkdtempSync(join(tmpdir(), "tys-prime-og-"));
  const ogDir = join(root, "og");
  mkdirSync(ogDir);
  const calls: RenderInput[] = [];
  const deps = {
    aiAvailable: () => true,
    async renderImage(input: RenderInput) {
      calls.push(input);
      return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    },
  } as unknown as Deps;
  const index = `<html><head><title>x</title></head><body><div id="root"></div></body></html>`;
  writeFileSync(join(root, "index.html"), index);
  const { app } = createApp({ store, deps, githubToken: "t", baseUrl: "https://skills.test", ogDir, season: s, staticRoot: root, indexHtml: async () => index });
  return { app, calls };
}

describe("le logo d'une prime", () => {
  it("lit la taille d'un PNG et d'un SVG, refuse le reste", async () => {
    expect(logoSize(tinyPng(40, 10), "png")).toEqual({ width: 40, height: 10 });
    expect(logoSize(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 80"></svg>`), "svg")).toEqual({ width: 300, height: 80 });
    expect(logoSize(Buffer.from("pas une image"), "png")).toBeNull();
    const dir = mkdtempSync(join(tmpdir(), "tys-logo-"));
    writeFileSync(join(dir, "demo.png"), tinyPng(40, 10));
    const logo = await readLogo("demo.png", dir);
    expect(logo).toMatchObject({ width: 40, height: 10 });
    expect(logo!.href.startsWith("data:image/png;base64,")).toBe(true);
    for (const bad of ["../demo.png", "demo.jpg", "absent.png", undefined]) expect(await readLogo(bad, dir)).toBeNull();
  });
});

describe("l'image d'une prime", () => {
  it("1200 × 630, rendue une fois puis lue sur disque", async () => {
    const ctx = setup(season([prime()]));
    const a = await ctx.app.request("/og/p/demo-stage.png");
    expect(a.status).toBe(200);
    expect(a.headers.get("content-type")).toBe("image/png");
    await ctx.app.request("/og/p/demo-stage.png");
    expect(ctx.calls).toHaveLength(1);
    expect(ctx.calls[0]).toMatchObject({ format: "prime", lang: "fr", logo: null, prime: { id: "demo-stage", company: "Entreprise Démo", phase: "open" } });
    expect((await ctx.app.request("/og/p/inconnue.png")).status).toBe(404);
  });

  it("la clé change avec ce que l'image dit", () => {
    expect(primeImageKey(view())).toBe(primeImageKey(view({ entrants: 99 })));
    expect(primeImageKey(view())).not.toBe(primeImageKey(view({ daysLeft: 11 })));
    expect(primeImageKey(view())).not.toBe(primeImageKey(view({ phase: "closed", daysLeft: null })));
  });

  it("sans prime, ni image ni page", async () => {
    const ctx = setup(season([]));
    expect((await ctx.app.request("/og/p/demo-stage.png")).status).toBe(404);
    expect((await ctx.app.request("/primes/demo-stage")).status).toBe(302);
    expect(ctx.calls).toHaveLength(0);
  });

  it("un vrai rendu : PNG opaque de 1200 × 630, nom ou logo", async () => {
    for (const logo of [null, { href: `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 80"><rect width="300" height="80" fill="#ffd3a5"/></svg>`).toString("base64")}`, width: 300, height: 80 }]) {
      const png = await renderImage({ format: "prime", prime: view({ company: "Atelier Démo au nom assez long" }), logo, lang: "fr" });
      expect(png.readUInt32BE(16)).toBe(1200);
      expect(png.readUInt32BE(20)).toBe(630);
    }
  }, 30_000);
});

describe("les balises des pages", () => {
  it("/primes/:id porte l'image et le poste ; /primes l'image de l'accueil", async () => {
    const ctx = setup(season([prime()]));
    const page = await (await ctx.app.request("/primes/demo-stage")).text();
    expect(page).toContain("/og/p/demo-stage.png?");
    expect(page).toContain("Entreprise Démo : stage Backend, Full-stack");
    const list = await ctx.app.request("/primes");
    expect(list.status).toBe(200);
    expect(await list.text()).toContain("/og/home.png");
    expect((await ctx.app.request("/primes/inconnue")).status).toBe(404);
  });

  it("le texte suit la phase, sans pseudo ni rang", () => {
    expect(primeMeta(view(), "https://x").description).toBe("3 entretiens pour le haut du classement, J-12. Fais ta fiche et concours.");
    expect(primeMeta(view({ phase: "closed", daysLeft: null }), "https://x").description).toMatch(/^Prime close/);
  });
});
