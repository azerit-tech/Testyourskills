// Le filet (§18.27) : écran de repli et repli de la révélation, sans navigateur.
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LangProvider } from "../i18n";
import { Crash, ErrorBoundary } from "./ErrorBoundary";

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
      expect(html).toContain(`<button type="button" class="pill">${button}</button>`);
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
