import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SCENE, parseScene, revealScene, revealToPlay } from "./revealScene";

function fakeWindow(search: string, store: Map<string, string>) {
  vi.stubGlobal("window", {
    location: { search },
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  });
}

describe("la scène de la révélation (§18.33)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("l'ascenseur par défaut, tant que la poursuite n'est pas validée", () => {
    expect(DEFAULT_SCENE).toBe("walkout");
    fakeWindow("", new Map());
    expect(revealScene()).toBe("walkout");
  });

  it("?scene=film choisit le film (§18.36), sans changer le défaut", () => {
    const store = new Map<string, string>();
    fakeWindow("?mock=1&scene=film", store);
    expect(revealScene()).toBe("film");
    fakeWindow("", store);
    expect(revealScene()).toBe("film");
    expect(parseScene("film")).toBe("film");
    expect(DEFAULT_SCENE).toBe("walkout");
  });

  it("une valeur inconnue ne change rien", () => {
    expect(parseScene("3d")).toBeNull();
    fakeWindow("?scene=3d", new Map());
    expect(revealScene()).toBe("walkout");
  });

  it("mouvement réduit : rien ne joue, ni film ni ascenseur", () => {
    expect(revealToPlay("walkout", true)).toBeNull();
    expect(revealToPlay("film", true)).toBeNull();
    expect(revealToPlay("film", false)).toBe("film");
  });
});
