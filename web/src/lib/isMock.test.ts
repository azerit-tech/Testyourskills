// Le mode démo (`?mock=1`) : un stockage bloqué ne le fait jamais passer en mode réel.
import { afterEach, describe, expect, it, vi } from "vitest";

function browser(search: string, blocked: boolean) {
  const store = new Map<string, string>();
  const guard = () => {
    if (blocked) throw new Error("SecurityError");
  };
  vi.stubGlobal("window", { location: { search } });
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => (guard(), store.get(k) ?? null),
    setItem: (k: string, v: string) => (guard(), void store.set(k, v)),
    removeItem: (k: string) => (guard(), void store.delete(k)),
  });
  return { setSearch: (s: string) => ((window as unknown as { location: { search: string } }).location.search = s) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("isMock", () => {
  it("?mock=1 vaut démo même quand le stockage lève une erreur, et le reste pour la page", async () => {
    const b = browser("?mock=1", true);
    const { isMock } = await import("./api");
    expect(isMock()).toBe(true);
    b.setSearch("");
    expect(isMock()).toBe(true);
  });

  it("collant par la session quand le stockage marche ; ?mock=0 l'éteint", async () => {
    const b = browser("?mock=1", false);
    const { isMock } = await import("./api");
    expect(isMock()).toBe(true);
    b.setSearch("?x=1");
    expect(isMock()).toBe(true);
    b.setSearch("?mock=0");
    expect(isMock()).toBe(false);
    b.setSearch("");
    expect(isMock()).toBe(false);
  });

  it("sans paramètre ni mémoire : le mode réel", async () => {
    browser("", true);
    const { isMock } = await import("./api");
    expect(isMock()).toBe(false);
  });
});
