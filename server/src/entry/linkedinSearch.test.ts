// GET /api/search/linkedin (SPEC §18.80) : les suggestions du champ « Ton nom ».

import { afterEach, describe, expect, it } from "vitest";
import { SEARCHES_PER_IP } from "../linkedinProfile/search";
import { licdnPhoto } from "./linkedinSearch";
import { CAMILLE, CAMILLE_URL, HOMONYM, setupEntry, type EntryCtx } from "./testing";

const ctxs: EntryCtx[] = [];
const setup = (...a: Parameters<typeof setupEntry>) => {
  const ctx = setupEntry(...a);
  ctxs.push(ctx);
  return ctx;
};
afterEach(() => {
  while (ctxs.length) ctxs.pop()!.store.close();
});

const search = async (ctx: EntryCtx, q: string, ip = "1.1.1.1") => {
  const res = await ctx.app.request(`/api/search/linkedin?q=${encodeURIComponent(q)}`, { headers: { "x-forwarded-for": ip } });
  return { status: res.status, json: (await res.json()) as { results: Record<string, unknown>[]; off?: boolean }, res };
};

describe("GET /api/search/linkedin", () => {
  it("rend au plus cinq lignes : adresse, nom, titre, photo servie par LinkedIn seulement", async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...HOMONYM, url: `${HOMONYM.url}${i}`, photoUrl: "https://evil.example/p.jpg" }));
    const ctx = setup({ people: { byName: () => ({ status: "ok", results: [CAMILLE, ...many] }) } });
    const { status, json, res } = await search(ctx, "Camille Ardent");
    expect(status).toBe(200);
    expect(json.results).toHaveLength(5);
    expect(json.results[0]).toEqual({ url: CAMILLE_URL, name: "Camille Ardent", headline: "Senior Full-Stack Engineer", photo: CAMILLE.photoUrl });
    expect(json.results[1]).not.toHaveProperty("photo");
    expect(json.off).toBeUndefined();
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
    expect(ctx.calls.byName).toEqual([{ raw: "Camille Ardent", strict: false, spent: true }]);
  });

  it("moins de trois frappes, ou un prénom seul : rien, sans appel payé", async () => {
    const ctx = setup({ people: { byName: (raw) => (raw.includes(" ") ? { status: "ok", results: [CAMILLE] } : { status: "short" }) } });
    expect((await search(ctx, "Ca")).json).toEqual({ results: [] });
    expect(ctx.calls.byName).toHaveLength(0);
    expect((await search(ctx, "Camille")).json).toEqual({ results: [] });
    expect((await search(ctx, "x".repeat(81))).json).toEqual({ results: [] });
  });

  it("sans fournisseur de recherche : « off », et la configuration le dit", async () => {
    const ctx = setup({ people: null });
    expect((await search(ctx, "Camille Ardent")).json).toEqual({ results: [], off: true });
    expect(await (await ctx.app.request("/api/config")).json()).toMatchObject({ linkedinEntry: true, linkedinSearch: false });
    const on = setup();
    expect(await (await on.app.request("/api/config")).json()).toMatchObject({ linkedinEntry: true, linkedinSearch: true });
  });

  it("plafond du jour ou panne : « off », jamais gardé en cache", async () => {
    const ctx = setup({ people: { byName: () => ({ status: "off" }) } });
    const { json, res } = await search(ctx, "Camille Ardent");
    expect(json).toEqual({ results: [], off: true });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("soixante recherches payées par IP et par jour, puis « off » pour cette IP seulement", async () => {
    const ctx = setup({ people: { byName: () => ({ status: "ok", results: [CAMILLE] }) } });
    for (let i = 0; i < SEARCHES_PER_IP; i++) expect((await search(ctx, `Camille Ardent${"x".repeat(i)}`)).json.off).toBeUndefined();
    expect((await search(ctx, "Camille Autre")).json).toEqual({ results: [], off: true });
    expect((await search(ctx, "Camille Autre", "2.2.2.2")).json.results).toHaveLength(1);
  });

  it("une photo n'est montrée que servie par licdn.com, en HTTPS", () => {
    expect(licdnPhoto("https://media.licdn.com/dms/image/x")).toBe("https://media.licdn.com/dms/image/x");
    expect(licdnPhoto("http://media.licdn.com/dms/image/x")).toBeUndefined();
    expect(licdnPhoto("https://licdn.com.evil.example/x")).toBeUndefined();
    expect(licdnPhoto("pas une adresse")).toBeUndefined();
    expect(licdnPhoto(undefined)).toBeUndefined();
  });
});
