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

  it("?scene=chase choisit la poursuite, et le choix tient pour la session", () => {
    const store = new Map<string, string>();
    fakeWindow("?mock=1&scene=chase", store);
    expect(revealScene()).toBe("chase");
    fakeWindow("", store);
    expect(revealScene()).toBe("chase");
    fakeWindow("?scene=walkout", store);
    expect(revealScene()).toBe("walkout");
  });

  it("une valeur inconnue ne change rien", () => {
    expect(parseScene("3d")).toBeNull();
    fakeWindow("?scene=3d", new Map());
    expect(revealScene()).toBe("walkout");
  });

  it("mouvement réduit : rien ne joue, ni poursuite ni ascenseur", () => {
    expect(revealToPlay("chase", true)).toBeNull();
    expect(revealToPlay("walkout", true)).toBeNull();
    expect(revealToPlay("chase", false)).toBe("chase");
  });
});
