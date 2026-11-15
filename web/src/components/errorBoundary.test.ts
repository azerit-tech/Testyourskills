// Le filet (§18.27) : écran de repli et repli de la révélation, sans navigateur.
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LangProvider } from "../i18n";
import { Crash, ErrorBoundary, isChunkError, reloadOnce } from "./ErrorBoundary";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function crashed(props: ConstructorParameters<typeof ErrorBoundary>[0]) {
  const b = new ErrorBoundary(props);
  b.state = ErrorBoundary.getDerivedStateFromError();
  return b;
}

describe("ErrorBoundary", () => {
  it("laisse passer ses enfants tant que rien ne casse", () => {
    const b = new ErrorBoundary({ children: "fiche" });
    expect(b.render()).toBe("fiche");
  });

  it("sans repli donné : l'écran « Recharger », en français et en anglais", () => {
    const el = crashed({ children: "fiche" }).render();
    expect(isValidElement(el) && el.type).toBe(Crash);
    for (const [lang, title, button] of [
      ["fr", "La page n&#x27;a pas chargé", "Recharger"],
      ["en", "The page didn&#x27;t load", "Reload"],
    ]) {
      vi.stubGlobal("localStorage", { getItem: () => lang, setItem: () => undefined });
      const html = renderToStaticMarkup(createElement(LangProvider, null, createElement(Crash)));
      expect(html).toContain(title);
      expect(html).toContain(`<button type="button" class="btn-primary err-action">${button}</button>`);
      // la mise en page d'erreur commune : la toise, le tampon « Interrompu »
      expect(html).toContain(`class="err-stamp is-crash"`);
    }
  });

  it("la scène 3D qui ne charge pas : rien à l'écran, la révélation passe la main (onDone)", () => {
    const onError = vi.fn();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const b = crashed({ children: "scène", fallback: null, onError });
    expect(b.render()).toBeNull();
    const err = new TypeError("Failed to fetch dynamically imported module");
    b.componentDidCatch(err, { componentStack: "" });
    expect(onError).toHaveBeenCalledWith(err);
    expect(log).toHaveBeenCalled();
  });
});

describe("après un déploiement : un morceau introuvable recharge la page, une fois", () => {
  it("reconnaît un morceau introuvable, pas une autre panne", () => {
    expect(isChunkError(new TypeError("Failed to fetch dynamically imported module: https://x/assets/Bands-1.js"))).toBe(true);
    expect(isChunkError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkError(new Error("Cannot read properties of undefined"))).toBe(false);
  });

  it("recharge une fois, puis plus avant une minute : jamais de boucle", () => {
    const store: Record<string, string> = {};
    const reload = vi.fn();
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v) });
    vi.stubGlobal("window", { location: { reload } });
    expect(reloadOnce(1_000_000)).toBe(true);
    expect(reloadOnce(1_010_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadOnce(1_000_000 + 61_000)).toBe(true);
  });

  it("le filet garde la marque, un vrai lien vers l'accueil, et le retour sous « Recharger »", () => {
    vi.stubGlobal("localStorage", { getItem: () => "fr", setItem: () => undefined });
    const html = renderToStaticMarkup(createElement(LangProvider, null, createElement(Crash)));
    expect(html).toMatch(/<a href="\/" class="topbar-brand"/);
    expect(html).toContain(`<a class="link-alt" href="/">Retour à l&#x27;accueil</a>`);
  });
});

