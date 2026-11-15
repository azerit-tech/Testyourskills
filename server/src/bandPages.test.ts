// Le partage d'une bande (§18.38) : l'image 1200 × 630 et les balises de sa page.

import { mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BandStanding } from "../../shared/bands";
import { FIXTURES } from "../../shared/fixtures";
import type { CardData } from "../../shared/types";
import { createApp } from "./app";
import { joinBand } from "./bands";
import { bandMeta, bandImageKey, boardMeta } from "./bandPages";
import { Store } from "./db";
import type { Deps, RenderInput } from "./pipeline";
import { renderSvg } from "./render/index";
import { bandRankLine } from "./render/band";

const BASE = "https://skills.test";
const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
});

function setup() {
  const store = new Store(":memory:");
  stores.push(store);
  const ogDir = join(mkdtempSync(join(tmpdir(), "tys-bandog-")), "og");
  mkdirSync(ogDir);
  const renders: RenderInput[] = [];
  const deps = {
    aiAvailable: () => true,
    async renderImage(input: RenderInput) {
      renders.push(input);
      return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    },
  } as unknown as Deps;
  const template = `<!doctype html><html lang="fr"><head><title>x</title><meta property="og:title" content="x"></head><body><div id="root"></div></body></html>`;
  const { app } = createApp({ store, deps, githubToken: "t", baseUrl: BASE, ogDir, indexHtml: async () => template });
  return { app, store, ogDir, renders };
}

let seq = 0;
function member(store: Store, band: string, overall = 65) {
  const id = `Band${String(++seq).padStart(6, "0")}`;
  const data: CardData = { ...FIXTURES.gold, id, overall, login: `p${seq}`, createdAt: new Date().toISOString() };
  store.insertCards([{ id, createdAt: Date.now(), source: "github", login: `p${seq}`, kind: "card", data, deleteToken: "t" }]);
  joinBand(store, store.getCard(id)!, { type: "ecole", id: band, label: band });
}

const standing = (o: Partial<BandStanding>): BandStanding => ({
  type: "ecole",
  id: "centralesupelec",
  label: "CentraleSupélec",
  score: 74,
  members: 31,
  rank: 3,
  missing: 0,
  gap: 6,
  ahead: { id: "epitech", label: "Epitech", rank: 2 },
  hasPage: true,
  ...o,
});

describe("balises d'une bande", () => {
  it("le nom et le rang dans le titre, les fiches et les étoiles dans la description ; l'image porte la clé de ce qu'elle dit", () => {
    const m = bandMeta(standing({}), BASE);
    expect(m.title).toBe("CentraleSupélec, 3e des écoles · Azerit");
    expect(m.description).toBe("31 fiches, 74 étoiles. Viens grossir les rangs\u00a0: fais ta fiche pour CentraleSupélec.");
    expect(m.url).toBe(`${BASE}/bandes/ecole/centralesupelec`);
    expect(m.image).toMatch(new RegExp(`^${BASE}/og/b/ecole/centralesupelec\\.png\\?v=\\d+&k=[0-9a-f]{10}$`));
    expect(bandMeta(standing({ rank: 1, ahead: null, gap: null }), BASE).title).toBe("CentraleSupélec, n°\u00a01 des écoles · Azerit");
    const forming = bandMeta(standing({ rank: null, missing: 2, members: 1, score: 5, gap: null, ahead: null }), BASE);
    expect(forming.title).toBe("CentraleSupélec, bande en formation · Azerit");
    expect(forming.description).toBe("Bande en formation\u00a0: il manque 2 complices. Fais ta fiche pour CentraleSupélec.");
    expect(bandImageKey(standing({ score: 75 }))).not.toBe(bandImageKey(standing({})));
  });

  it("en anglais : « crew », « sheets », jamais « gang » ni « file »", () => {
    const m = bandMeta(standing({}), BASE, "en");
    expect(m.lang).toBe("en");
    expect(m.title).toBe("CentraleSupélec, #3 among schools · Azerit");
    expect(m.description).toBe("31 sheets, 74 stars. Come add your stars: get your rap sheet for CentraleSupélec.");
    const forming = bandMeta(standing({ rank: null, missing: 1, members: 2, score: 5, gap: null, ahead: null }), BASE, "en");
    expect(forming.title).toBe("CentraleSupélec, crew forming · Azerit");
    expect(forming.description).toBe("Crew forming: 1 more accomplice needed. Get your rap sheet for CentraleSupélec.");
    for (const x of [m, forming, boardMeta(BASE, "en")]) expect(`${x.title} ${x.description} ${x.imageAlt}`).not.toMatch(/gang|\bfiles?\b|Testyourskills/i);
    expect(boardMeta(BASE, "en").title).toBe("Crews: schools and companies · Azerit");
    expect(boardMeta(BASE, "fr").title).toBe("Les bandes\u00a0: écoles et boîtes · Azerit");
  });

  it("la ligne du rang", () => {
    expect(bandRankLine(standing({}), "fr")).toBe("3e des écoles, à 6 étoiles de la 2e");
    expect(bandRankLine(standing({ rank: 2, ahead: { id: "x", label: "X", rank: 1 }, gap: 0 }), "fr")).toBe("2e des écoles, à égalité avec la tête");
    expect(bandRankLine(standing({ type: "boite", rank: 1, ahead: null, gap: null }), "fr")).toBe("n° 1 des boîtes");
    expect(bandRankLine(standing({ rank: null, missing: 1, gap: null, ahead: null }), "fr")).toBe("Bande en formation : il manque 1 complice");
    expect(bandRankLine(standing({}), "en")).toBe("#3 among schools, 6 stars behind #2");
  });

  it("GET /bandes/:type/:id injecte ses balises dans le front ; elles suivent le score", async () => {
    const ctx = setup();
    for (let i = 0; i < 3; i++) member(ctx.store, "epitech");
    const html = await (await ctx.app.request("/bandes/ecole/epitech")).text();
    expect(html).toContain(`<meta property="og:title" content="Epitech, n°\u00a01 des écoles · Azerit">`);
    // La langue des balises : `?lang=` d'abord, puis celle du navigateur ; la réponse le dit aux caches.
    const en = await ctx.app.request("/bandes/ecole/epitech?lang=en");
    expect(en.headers.get("Vary")).toMatch(/Accept-Language/);
    expect(await en.text()).toContain(`<meta property="og:title" content="Epitech, #1 among schools · Azerit">`);
    const byHeader = await ctx.app.request("/bandes/ecole/epitech", { headers: { "Accept-Language": "en-US,en;q=0.9" } });
    expect(await byHeader.text()).toContain("#1 among schools");
    expect(html).toContain('<div id="root">');
    const image = /og:image" content="([^"]+)"/.exec(html)![1]!;
    member(ctx.store, "epitech");
    const html2 = await (await ctx.app.request("/bandes/ecole/epitech")).text();
    expect(/og:image" content="([^"]+)"/.exec(html2)![1]).not.toBe(image.replace(/&amp;/g, "&"));
    expect((await ctx.app.request("/bandes/boite/inconnue")).status).toBe(404);
    expect((await ctx.app.request("/bandes")).status).toBe(200);
  });
});

describe("GET /og/b/:type/:id.png", () => {
  it("rend l'image une fois, la garde, et la refait quand le score change", async () => {
    const ctx = setup();
    for (let i = 0; i < 3; i++) member(ctx.store, "epitech");
    const a = await ctx.app.request("/og/b/ecole/epitech.png");
    expect(a.status).toBe(200);
    expect(a.headers.get("content-type")).toBe("image/png");
    await ctx.app.request("/og/b/ecole/epitech.png");
    expect(ctx.renders).toHaveLength(1);
    expect(ctx.renders[0]).toMatchObject({ format: "band", band: { id: "epitech", score: 12, rank: 1 } });
    member(ctx.store, "epitech");
    await ctx.app.request("/og/b/ecole/epitech.png");
    expect(ctx.renders).toHaveLength(2);
    // L'ancienne image est partie.
    expect(readdirSync(join(ctx.ogDir, "bands")).filter((n) => n.startsWith("ecole.epitech."))).toHaveLength(1);
    expect((await ctx.app.request("/og/b/boite/inconnue.png")).status).toBe(404);
    expect((await ctx.app.request("/og/b/ville/paris.png")).status).toBe(404);
  });
});

describe("la composition", () => {
  it("dit le nom, le score, les dossiers et le rang ; jamais un rang d'école", async () => {
    const svg = await renderSvg({ format: "band", band: standing({}), lang: "fr" });
    expect(svg).toContain("CENTRALESUPÉLEC");
    // Chaque nombre avec son mot, l'accroche au premier rang, puis ce qui sépare de la bande de devant.
    expect(svg).toMatch(/>74<\/text><text[^>]*>ÉTOILES</);
    expect(svg).toMatch(/>31<\/text><text[^>]*>FICHES</);
    expect(svg).toContain(">3E DES ÉCOLES<");
    expect(svg).toContain(">À 6 étoiles de la 2e<");
    expect(svg).not.toMatch(/rang [SABC]\b|tier/i);
  });
});
