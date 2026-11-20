// GET /api/search/linkedin (SPEC §18.80) : les suggestions du champ « Ton nom ».

import { afterEach, describe, expect, it } from "vitest";
import { SEARCHES_PER_IP } from "../linkedinProfile/search";
import type { RegistryPort } from "../registry/index";
import { APP_SEARCHES_PER_IP, licdnPhoto } from "./linkedinSearch";
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

describe("les profils de l'App Azerit sous le champ (§18.96)", () => {
  const appUrl = (n: number) => `https://www.linkedin.com/in/camille-ardent-${n}`;
  /** Un registre factice qui ne sait que chercher par le nom. */
  const registry = (namesakes: RegistryPort["namesakes"]) => ({ namesakes }) as unknown as RegistryPort;

  it("d'abord, puis le web, un profil une seule fois ; ni photo ni rien d'autre que le nom et le titre", async () => {
    const asked: { typed: string; partial?: boolean }[] = [];
    const ctx = setup({
      app: {
        registry: registry(async (typed, o) => {
          asked.push({ typed, partial: o?.partial });
          return [
            { url: appUrl(1), name: "Camille Ardent", headline: "Titre 1", hasPhoto: true },
            { url: CAMILLE_URL, name: "Camille Ardent", headline: "Titre de l'App", hasPhoto: false },
            { url: appUrl(3), name: null, headline: "", hasPhoto: true },
          ];
        }),
      },
    });
    const { json } = await search(ctx, "Camille Ard");
    expect(asked).toEqual([{ typed: "Camille Ard", partial: true }]);
    expect(json.results).toEqual([
      { url: appUrl(1), name: "Camille Ardent", headline: "Titre 1" },
      { url: CAMILLE_URL, name: "Camille Ardent", headline: "Titre de l'App", photo: CAMILLE.photoUrl },
      { url: HOMONYM.url, name: HOMONYM.name, headline: HOMONYM.headline },
    ]);
  });

  it("le web en panne : les profils de l'App seuls ; l'App en panne : le web seul", async () => {
    const one = [{ url: appUrl(1), name: "Camille Ardent", headline: "Titre 1", hasPhoto: false }];
    const off = setup({ people: { byName: () => ({ status: "off" }) }, app: { registry: registry(async () => one) } });
    expect((await search(off, "Camille Ardent")).json).toEqual({ results: [{ url: appUrl(1), name: "Camille Ardent", headline: "Titre 1" }] });
    const down = setup({ app: { registry: registry(async () => []) } });
    expect((await search(down, "Camille Ardent")).json.results.map((r) => r.url)).toEqual([CAMILLE_URL, HOMONYM.url]);
  });

  it("six cents recherches dans l'App par IP et par jour, puis le web seul", async () => {
    let n = 0;
    const ctx = setup({ people: { byName: () => ({ status: "ok", results: [] }) }, app: { registry: registry(async () => (n++, [])) } });
    for (let i = 0; i < APP_SEARCHES_PER_IP + 2; i++) await search(ctx, "Camille Ardent");
    expect(n).toBe(APP_SEARCHES_PER_IP);
  });
});
