// Page partagée sur téléphone (§18.27) : le toast passe au-dessus de la pilule
// « Fais la tienne » quand elle est là, comme au-dessus de la barre du pouce.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "../styles.css"), "utf8");
const page = readFileSync(join(__dirname, "../pages/CardPage.tsx"), "utf8");

describe("toast et pilule « Fais la tienne »", () => {
  it("la pilule précède le toast dans la page : le sélecteur de frère suivant s'applique", () => {
    const pill = page.indexOf("<MakeYours");
    const toast = page.indexOf("{toast.node}");
    expect(pill).toBeGreaterThan(0);
    expect(toast).toBeGreaterThan(pill);
  });

  it("pilule visible : le toast monte au-dessus d'elle, sur téléphone", () => {
    const phone = css.slice(css.indexOf(".make-yours {"));
    const rule = /\.make-yours:not\(\.is-off\) ~ \.toast \{\s*bottom: calc\((\d+)px/.exec(phone);
    expect(rule).not.toBeNull();
    // 12 px du bas + 52 px de pilule + 4 px de liseré : le toast part au-delà.
    expect(Number(rule![1])).toBeGreaterThan(12 + 52 + 4);
    // Dans le bloc téléphone de la pilule, avant sa fermeture.
    const media = css.lastIndexOf("@media (max-width: 640px)", css.indexOf(".make-yours:not(.is-off) ~ .toast"));
    expect(css.slice(media, css.indexOf(".make-yours:not(.is-off) ~ .toast"))).toContain(".make-yours {");
  });
});
