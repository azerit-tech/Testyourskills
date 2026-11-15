// Le bouton en cours (SPEC §18.48) : rose plein, son libellé suivi de trois points animés.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BusyDots, busyLabel } from "./Busy";

describe("le bouton en cours", () => {
  it("perd ses points de suspension : les trois points animés les remplacent", () => {
    expect(busyLabel("Ouverture…")).toBe("Ouverture");
    expect(busyLabel("Opening...")).toBe("Opening");
    expect(busyLabel("Envoi")).toBe("Envoi");
  });

  it("trois points, hors de la lecture d'écran", () => {
    const html = renderToStaticMarkup(createElement(BusyDots));
    expect(html.match(/<i><\/i>/g)).toHaveLength(3);
    expect(html).toContain('aria-hidden="true"');
  });

  it("le formulaire d'entrée : l'erreur entre le champ et le bouton, le bouton en cours avec ses points", () => {
    const src = readFileSync(new URL("./EntryForm.tsx", import.meta.url), "utf8");
    // Dans chaque forme du formulaire, la ligne d'erreur vient avant le bouton d'envoi.
    const forms = src.split("<form ").slice(1);
    expect(forms.length).toBeGreaterThanOrEqual(2);
    for (const f of forms) {
      const err = f.indexOf("{errorLine}");
      const btn = f.indexOf("entry-submit");
      expect(err).toBeGreaterThan(-1);
      expect(btn).toBeGreaterThan(err);
      expect(f).toContain("is-busy");
      expect(f).toContain("<BusyDots />");
    }
  });
});
