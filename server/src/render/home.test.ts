// L'image d'aperçu de l'accueil : la promesse et une fiche, en 1200 × 630.

import { describe, expect, it } from "vitest";
import { FIXTURES } from "../../../shared/fixtures";
import { renderImage, renderSvg } from "./index";

// Sans photo : le rendu ne touche pas au réseau.
const card = { ...FIXTURES.jmougeot, avatarUrl: undefined };

describe("image de l'accueil", () => {
  it("porte la promesse et l'invitation, en français et en anglais", async () => {
    const fr = await renderSvg({ format: "home", card, lang: "fr" });
    expect(fr).toContain(`viewBox="0 0 1200 630"`);
    for (const line of ["TON GITHUB", "REMPLACE", "TON CV."]) expect(fr.toUpperCase()).toContain(line);
    expect(fr).toContain("Fais la tienne");
    const en = await renderSvg({ format: "home", card, lang: "en" });
    for (const line of ["YOUR GITHUB", "REPLACES", "YOUR CV."]) expect(en.toUpperCase()).toContain(line);
  });

  it("sort un PNG de 1200 × 630", async () => {
    const png = await renderImage({ format: "home", card, lang: "fr" });
    expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  }, 30_000);
});
