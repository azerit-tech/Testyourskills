import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SCENE, parseScene, prefetchScene, revealScene, revealToPlay } from "./revealScene";

function fakeWindow(search: string, store: Map<string, string>) {
  vi.stubGlobal("window", {
    location: { search },
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  });
}

describe("la scène de la révélation (§18.39)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("le film par défaut", () => {
    expect(DEFAULT_SCENE).toBe("film");
    fakeWindow("", new Map());
    expect(revealScene()).toBe("film");
  });

  it("?scene=walkout garde l'ascenseur pour la session, sans changer le défaut", () => {
    const store = new Map<string, string>();
    fakeWindow("?mock=1&scene=walkout", store);
    expect(revealScene()).toBe("walkout");
    // la navigation de l'accueil à la fiche perd l'adresse, pas le choix
    fakeWindow("", store);
    expect(revealScene()).toBe("walkout");
    expect(parseScene("walkout")).toBe("walkout");
    expect(DEFAULT_SCENE).toBe("film");
    // ?scene=film revient au film dans la même session
    fakeWindow("?scene=film", store);
    expect(revealScene()).toBe("film");
    fakeWindow("", store);
    expect(revealScene()).toBe("film");
  });

  it("une valeur inconnue ne change rien", () => {
    expect(parseScene("3d")).toBeNull();
    fakeWindow("?scene=3d", new Map());
    expect(revealScene()).toBe("film");
  });

  it("stockage de session bloqué : l'adresse, sinon le film", () => {
    vi.stubGlobal("window", {
      location: { search: "" },
      get sessionStorage(): Storage {
        throw new Error("bloqué");
      },
    });
    expect(revealScene()).toBe("film");
  });

  it("mouvement réduit : rien ne joue, ni film ni ascenseur", () => {
    expect(revealToPlay("walkout", true)).toBeNull();
    expect(revealToPlay("film", true)).toBeNull();
    expect(revealToPlay("film", false)).toBe("film");
  });

  it("le premier contact avec le formulaire précharge la seule scène qui jouera, sauf économiseur de données ou mouvement réduit", () => {
    expect(prefetchScene(DEFAULT_SCENE, { saveData: false, reduced: false })).toBe("film");
    expect(prefetchScene("film", { saveData: true, reduced: false })).toBeNull();
    expect(prefetchScene("film", { saveData: false, reduced: true })).toBeNull();
    expect(prefetchScene("walkout", { saveData: false, reduced: false })).toBe("walkout");
  });
});
