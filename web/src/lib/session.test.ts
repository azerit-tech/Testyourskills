// Origine du visiteur (§18.0) : ?r= lu à l'arrivée, gardé une fois par session,
// retiré de l'adresse. Navigateur simulé : location, history, sessionStorage.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Session = typeof import("./session");

function browser(href: string, opts: { blocked?: boolean } = {}) {
  const store = new Map<string, string>();
  const loc = { href };
  const history = {
    state: { from: "test" } as unknown,
    replaceState: vi.fn((state: unknown, _t: string, url: string) => {
      history.state = state;
      loc.href = new URL(url, loc.href).href;
    }),
  };
  const sessionStorage = {
    getItem: (k: string) => {
      if (opts.blocked) throw new Error("SecurityError");
      return store.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (opts.blocked) throw new Error("SecurityError");
      store.set(k, v);
    },
  };
  vi.stubGlobal("window", { location: loc, history });
  vi.stubGlobal("sessionStorage", sessionStorage);
  return {
    loc,
    history,
    store,
    /** Nouvelle page dans le même onglet : la RAM repart de zéro, pas sessionStorage. */
    go(next: string) {
      loc.href = next;
    },
  };
}

async function fresh(): Promise<Session> {
  vi.resetModules();
  return import("./session");
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("captureRef", () => {
  it("garde l'origine, compte la visite une fois et retire r sans toucher au chemin ni au reste", async () => {
    const b = browser("https://skills.test/c/AbCdEf1234?r=AbCdEf1234&mock=1#top");
    const s = await fresh();
    expect(s.captureRef()).toBe("AbCdEf1234");
    expect(s.currentRef()).toBe("AbCdEf1234");
    expect(b.loc.href).toBe("https://skills.test/c/AbCdEf1234?mock=1#top");
    expect(b.history.replaceState).toHaveBeenCalledWith({ from: "test" }, "", "/c/AbCdEf1234?mock=1#top");
    // Rechargement ou autre lien partagé dans la même session : première origine gardée, pas de seconde visite.
    b.go("https://skills.test/tomdev?r=ZyXwVu9876");
    const again = await fresh();
    expect(again.captureRef()).toBeNull();
    expect(again.currentRef()).toBe("AbCdEf1234");
    expect(b.loc.href).toBe("https://skills.test/tomdev");
  });

  it("ignore un r au mauvais format, mais le retire quand même de l'adresse", async () => {
    for (const bad of ["abc", "AbCdEf1234x", "AbCdEf12-4", "", "%3Cscript%3E"]) {
      const b = browser(`https://skills.test/?r=${bad}`);
      const s = await fresh();
      expect(s.captureRef()).toBeNull();
      expect(s.currentRef()).toBeNull();
      expect(b.loc.href).toBe("https://skills.test/");
      expect(b.store.size).toBe(0);
    }
  });

  it("sans r : rien, pas même un replaceState", async () => {
    const b = browser("https://skills.test/c/AbCdEf1234?photo=linkedin");
    const s = await fresh();
    expect(s.captureRef()).toBeNull();
    expect(b.history.replaceState).not.toHaveBeenCalled();
  });

  it("stockage bloqué (navigateur intégré de LinkedIn) : l'origine tient en RAM pour la page", async () => {
    const b = browser("https://skills.test/?r=AbCdEf1234", { blocked: true });
    const s = await fresh();
    expect(s.captureRef()).toBe("AbCdEf1234");
    expect(s.currentRef()).toBe("AbCdEf1234");
    expect(b.loc.href).toBe("https://skills.test/");
    // Même page, second appel : pas de seconde visite.
    b.go("https://skills.test/?r=AbCdEf1234");
    expect(s.captureRef()).toBeNull();
  });
});
