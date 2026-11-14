// La trace du film (filmTrace.ts) : route absente sans FILM_TRACE, corps borné et validé, écriture ligne par ligne.
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { Store } from "./db";
import { FILM_TRACE_MAX_BODY } from "./filmTrace";
import type { Deps } from "./pipeline";

const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
});

function setup(traced: boolean) {
  const store = new Store(":memory:");
  stores.push(store);
  const dir = mkdtempSync(join(tmpdir(), "tys-trace-"));
  const file = join(dir, "sous", "film-trace.log");
  const { app } = createApp({
    store,
    deps: {} as Deps,
    githubToken: "t",
    baseUrl: "https://skills.test",
    ogDir: mkdtempSync(join(tmpdir(), "tys-trace-og-")),
    season: null,
    filmTraceFile: traced ? file : undefined,
  });
  const send = (body: unknown) =>
    app.request("/api/film-trace", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
  return { app, store, file, send };
}

const lines = [
  { t: 0, k: "head", ua: "Mozilla/5.0" },
  { t: 12.5, k: "ev", v: "A", e: "playing", ct: 0.02 },
];

describe("POST /api/film-trace", () => {
  it("sans FILM_TRACE : la route n'existe pas (404), rien n'est écrit", async () => {
    const ctx = setup(false);
    const res = await ctx.send({ session: "abcdef12", lines });
    expect(res.status).toBe(404);
    expect(existsSync(ctx.file)).toBe(false);
  });

  it("avec : chaque ligne part en JSON dans le fichier, avec l'heure du serveur et la session ; rien en base", async () => {
    const ctx = setup(true);
    const res = await ctx.send({ session: "abcdef12", lines });
    expect(res.status).toBe(202);
    await ctx.send({ session: "abcdef12", lines: [{ t: 20, k: "step", s: "prepare", at: "faux", session: "autre" }] });
    const out = readFileSync(ctx.file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ session: "abcdef12", t: 0, k: "head", ua: "Mozilla/5.0" });
    expect(new Date(out[0].at).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(out[1]).toMatchObject({ k: "ev", v: "A", e: "playing" });
    // une ligne ne remplace ni l'heure ni la session
    expect(out[2]).toMatchObject({ session: "abcdef12", s: "prepare" });
    expect(out[2].at).not.toBe("faux");
    expect(ctx.store.listEvents()).toEqual([]);
  });

  it("refuse un corps mal formé (400)", async () => {
    const ctx = setup(true);
    expect((await ctx.send("pas du json")).status).toBe(400);
    expect((await ctx.send({ session: "abcdef12", lines: [] })).status).toBe(400);
    expect((await ctx.send({ session: "a b/c", lines })).status).toBe(400);
    expect((await ctx.send({ session: "abcdef12", lines: [{ k: "ev" }] })).status).toBe(400);
    expect((await ctx.send({ session: "abcdef12", lines: ["texte"] })).status).toBe(400);
    expect(existsSync(ctx.file)).toBe(false);
  });

  it("refuse un corps de plus de 128 Ko (413)", async () => {
    const ctx = setup(true);
    const big = { session: "abcdef12", lines: [{ t: 0, k: "head", pad: "x".repeat(FILM_TRACE_MAX_BODY) }] };
    const res = await ctx.send(big);
    expect(res.status).toBe(413);
    expect(existsSync(ctx.file)).toBe(false);
  });
});
