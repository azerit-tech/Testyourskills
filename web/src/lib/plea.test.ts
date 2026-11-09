// Le pari (§18.27) : rangé par fiche dans le navigateur, comparé aux étoiles de
// la fiche, compté une seule fois. Navigateur simulé : localStorage.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Plea = typeof import("./plea");
type PleaVerdict = typeof import("./pleaVerdict");

function browser(opts: { blocked?: boolean } = {}) {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => {
        if (opts.blocked) throw new Error("SecurityError");
        return store.get(k) ?? null;
      },
      setItem: (k: string, v: string) => {
        if (opts.blocked) throw new Error("SecurityError");
        store.set(k, v);
      },
    },
  });
  return store;
}

let plea: Plea;
let verdict: PleaVerdict;
beforeEach(async () => {
  vi.resetModules();
  plea = await import("./plea");
  verdict = await import("./pleaVerdict");
});
afterEach(() => vi.unstubAllGlobals());

describe("le pari", () => {
  it("se range par fiche et se relit après un rechargement", async () => {
    const store = browser();
    plea.setPlea("AbCdEf1234", 4);
    expect(plea.getPlea("AbCdEf1234")).toBe(4);
    expect(plea.getPlea("ZZZZZZ9999")).toBeNull();
    expect(store.get("tys_plea_AbCdEf1234")).toBe("4");
    // page rechargée : la mémoire est vide, le stockage répond
    vi.resetModules();
    const again = await import("./plea");
    expect(again.getPlea("AbCdEf1234")).toBe(4);
  });

  it("refuse ce qui n'est pas de 1 à 6 étoiles", () => {
    const store = browser();
    for (const n of [0, 7, 2.5, Number.NaN]) plea.setPlea("AbCdEf1234", n);
    expect(plea.getPlea("AbCdEf1234")).toBeNull();
    store.set("tys_plea_AbCdEf1234", "12");
    expect(plea.getPlea("AbCdEf1234")).toBeNull();
  });

  it("stockage bloqué (navigateur intégré) : le pari vaut pour la page", () => {
    browser({ blocked: true });
    expect(plea.getPlea("AbCdEf1234")).toBeNull();
    plea.setPlea("AbCdEf1234", 6);
    expect(plea.getPlea("AbCdEf1234")).toBe(6);
  });
});

describe("le verdict", () => {
  it("compare les étoiles plaidées à celles de la note", () => {
    expect(verdict.pleaVerdict(5, 64)).toEqual({ pleaded: 5, actual: 4, gap: "over", diff: 1 });
    expect(verdict.pleaVerdict(4, 74)).toEqual({ pleaded: 4, actual: 4, gap: "exact", diff: 0 });
    expect(verdict.pleaVerdict(2, 91)).toEqual({ pleaded: 2, actual: 6, gap: "under", diff: -4 });
    expect(verdict.pleaVerdict(1, 12)).toMatchObject({ actual: 1, gap: "exact" });
  });

  it("ne se compte qu'une fois par fiche, même après un rechargement", async () => {
    browser();
    expect(verdict.firstVerdict("AbCdEf1234")).toBe(true);
    expect(verdict.firstVerdict("AbCdEf1234")).toBe(false);
    expect(verdict.firstVerdict("ZZZZZZ9999")).toBe(true);
    vi.resetModules();
    const again = await import("./pleaVerdict");
    expect(again.firstVerdict("AbCdEf1234")).toBe(false);
  });

  it("stockage bloqué : une fois par page", () => {
    browser({ blocked: true });
    expect(verdict.firstVerdict("AbCdEf1234")).toBe(true);
    expect(verdict.firstVerdict("AbCdEf1234")).toBe(false);
  });
});
