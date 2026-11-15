// /{pseudo} préremplit l'accueil, il ne lance plus de fiche à la simple visite (§18.48).
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { takePrefill } from "../lib/session";
import { openDirect } from "./DirectCard";

function stubWindow(search = "") {
  const at = { path: "/kevin-dev42" };
  vi.stubGlobal("window", {
    location: { search, pathname: at.path },
    history: { replaceState: (_s: unknown, _t: string, url: string) => (at.path = url), pushState: () => undefined },
    scrollTo: () => undefined,
    addEventListener: () => undefined,
  });
  return at;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  takePrefill();
});

describe("la route /{pseudo}", () => {
  it("l'accueil, le champ prérempli, la porte GitHub ; aucune fiche demandée", () => {
    const create = vi.spyOn(api, "createCard");
    const at = stubWindow("?mock=1");
    openDirect("kevin-dev42");
    expect(at.path).toBe("/?mock=1");
    expect(takePrefill()).toMatchObject({ login: "kevin-dev42", mode: "single", tab: "github" });
    expect(create).not.toHaveBeenCalled();
  });

  it("un mot réservé n'est pas un pseudo : l'accueil, champ vide", () => {
    stubWindow();
    openDirect("primes");
    expect(takePrefill()).toBeNull();
  });
});
