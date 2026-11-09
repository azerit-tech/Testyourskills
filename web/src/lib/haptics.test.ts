// La vibration : courte, jamais en mouvement réduit, jamais une erreur.

import { afterEach, describe, expect, it, vi } from "vitest";
import { buzz } from "./haptics";

function device(opts: { reduced?: boolean; vibrate?: (ms: number) => boolean } = {}) {
  const vibrate = opts.vibrate ?? vi.fn(() => true);
  vi.stubGlobal("window", { matchMedia: (q: string) => ({ matches: !!opts.reduced && q.includes("reduce") }) });
  vi.stubGlobal("navigator", { vibrate });
  return vibrate;
}

afterEach(() => vi.unstubAllGlobals());

describe("buzz", () => {
  it("vibre 12 ms par défaut", () => {
    const vibrate = device();
    buzz();
    expect(vibrate).toHaveBeenCalledWith(12);
  });

  it("ne vibre pas en mouvement réduit", () => {
    const vibrate = device({ reduced: true });
    buzz();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("se tait sans navigator.vibrate (Safari) ou si le navigateur refuse", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});
    expect(() => buzz()).not.toThrow();
    device({
      vibrate: () => {
        throw new Error("NotAllowedError");
      },
    });
    expect(() => buzz()).not.toThrow();
  });
});
