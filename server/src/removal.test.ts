// Demande de retrait d'une fiche sans pseudo GitHub (removal.ts), base en mémoire, faux relais.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../../shared/fixtures";
import { createApp } from "./app";
import { Store } from "./db";
import type { Deps } from "./pipeline";
import { REMOVALS_PER_DAY } from "./removal";

const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
  vi.restoreAllMocks();
});

function setup(opts: { endpoint?: string; ok?: boolean } = {}) {
  const store = new Store(":memory:");
  stores.push(store);
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    sent.push({ url, body: JSON.parse(String(init?.body)) });
    return new Response("{}", { status: opts.ok === false ? 500 : 200 });
  }) as typeof fetch;
  const { app } = createApp({
    store,
    deps: {} as Deps,
    githubToken: "t",
    baseUrl: "https://skills.test",
    ogDir: mkdtempSync(join(tmpdir(), "tys-rm-")),
    leadsEndpoint: opts.endpoint,
    fetchImpl,
    season: null,
  });
  const now = Date.now();
  store.insertCards([
    { id: "LinkedIn01", createdAt: now, source: "linkedin", login: null, kind: "card", data: { ...FIXTURES.cv, id: "LinkedIn01" }, deleteToken: "tok" },
    { id: "Github0001", createdAt: now, source: "github", login: "lea", kind: "card", data: { ...FIXTURES.gold, id: "Github0001" }, deleteToken: "tok" },
  ]);
  const ask = (body: unknown, ip = "1.2.3.4") =>
    app.request("/api/removal", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });
  return { app, store, sent, ask };
}

describe("POST /api/removal", () => {
  it("relaie la demande par LEADS_ENDPOINT : type « retrait », id et adresse de la fiche, email saisi ; rien en base", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ctx = setup({ endpoint: "https://leads.test/hook" });
    const res = await ctx.ask({ cardId: "LinkedIn01", email: "camille@example.com" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(ctx.sent).toHaveLength(1);
    expect(ctx.sent[0]!.url).toBe("https://leads.test/hook");
    expect(ctx.sent[0]!.body).toMatchObject({ event: "retrait", cardId: "LinkedIn01", cardUrl: "https://skills.test/c/LinkedIn01", email: "camille@example.com" });
    // Ni l'email sur la fiche, ni un événement, ni l'email dans les journaux.
    expect(ctx.store.getCard("LinkedIn01")!.email).toBeNull();
    expect(ctx.store.listEvents()).toEqual([]);
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain("camille@");
  });

  it("refuse un email douteux, une fiche inconnue, une fiche avec un pseudo GitHub", async () => {
    const ctx = setup({ endpoint: "https://leads.test/hook" });
    expect((await ctx.ask({ cardId: "LinkedIn01", email: "pas-un-email" })).status).toBe(400);
    expect((await ctx.ask({ cardId: "Inconnue01", email: "a@b.co" })).status).toBe(404);
    const gh = await ctx.ask({ cardId: "Github0001", email: "a@b.co" });
    expect(gh.status).toBe(409);
    expect(((await gh.json()) as { message: { fr: string } }).message.fr).toMatch(/C'est moi/);
    expect(ctx.sent).toHaveLength(0);
  });

  it(`${REMOVALS_PER_DAY} demandes par jour et par IP`, async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ctx = setup({ endpoint: "https://leads.test/hook" });
    for (let i = 0; i < REMOVALS_PER_DAY; i++) expect((await ctx.ask({ cardId: "LinkedIn01", email: "a@b.co" })).status).toBe(200);
    expect((await ctx.ask({ cardId: "LinkedIn01", email: "a@b.co" })).status).toBe(429);
    expect((await ctx.ask({ cardId: "LinkedIn01", email: "a@b.co" }, "5.6.7.8")).status).toBe(200);
    expect(ctx.sent).toHaveLength(REMOVALS_PER_DAY + 1);
  });

  it("sans LEADS_ENDPOINT, ou relais en panne : repli sur l'adresse de contact", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const none = setup();
    const r1 = await none.ask({ cardId: "LinkedIn01", email: "a@b.co" });
    expect(r1.status).toBe(503);
    expect(await r1.json()).toEqual({ ok: false, fallback: true });
    const down = setup({ endpoint: "https://leads.test/hook", ok: false });
    const r2 = await down.ask({ cardId: "LinkedIn01", email: "a@b.co" });
    expect(r2.status).toBe(502);
    expect(await r2.json()).toEqual({ ok: false, fallback: true });
  });
});
