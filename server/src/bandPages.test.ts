// Les anciennes adresses des bandes (§18.101) : 301 vers le classement de l'accueil.

import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { rankingUrl } from "./bandPages";
import { Store } from "./db";
import type { Deps } from "./pipeline";

const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
});

function setup() {
  const store = new Store(":memory:");
  stores.push(store);
  const deps = { aiAvailable: () => true } as unknown as Deps;
  const template = `<!doctype html><html lang="fr"><head><title>x</title></head><body><div id="root"></div></body></html>`;
  return createApp({ store, deps, githubToken: "t", baseUrl: "https://skills.test", ogDir: "/tmp/tys-none", indexHtml: async () => template }).app;
}

describe("les anciennes adresses des bandes", () => {
  it("/bandes et la page d'une bande : 301 vers l'ancre du classement, la langue gardée", async () => {
    const app = setup();
    for (const path of ["/bandes", "/bandes/", "/bandes?t=ecole", "/bandes/ecole/centralesupelec", "/bandes/boite/inconnue", "/bandes/zzz/zzz"]) {
      const res = await app.request(path);
      expect(res.status, path).toBe(301);
      expect(res.headers.get("location"), path).toBe("/#classement");
    }
    expect((await app.request("/bandes/ecole/epitech?lang=en")).headers.get("location")).toBe("/?lang=en#classement");
    expect(rankingUrl("de")).toBe("/#classement");
  });

  it("l'image d'une bande n'existe plus", async () => {
    expect((await setup().request("/og/b/ecole/epitech.png")).status).toBe(404);
  });
});
