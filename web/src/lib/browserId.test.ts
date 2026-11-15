// L'identifiant du navigateur (§18.48) : tiré au hasard une fois, gardé en
// stockage local, de la forme que le serveur accepte ; sans stockage, stable
// le temps de la visite.
import { afterEach, describe, expect, it, vi } from "vitest";
import { browserId } from "./api";

const FORM = /^[A-Za-z0-9_-]{16,64}$/;

afterEach(() => vi.unstubAllGlobals());

describe("browserId", () => {
  it("tiré une fois, puis relu en stockage local", () => {
    const kept = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => kept.set(k, v) });
    const id = browserId();
    expect(id).toMatch(FORM);
    expect(browserId()).toBe(id);
    expect([...kept.values()]).toEqual([id]);
  });

  it("sans stockage : un identifiant valide, le même jusqu'au rechargement", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("bloqué");
      },
      setItem: () => undefined,
    });
    const id = browserId();
    expect(id).toMatch(FORM);
    expect(browserId()).toBe(id);
  });
});
