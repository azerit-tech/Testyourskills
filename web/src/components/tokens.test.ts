// Le système visuel (SPEC §18.48) : sept tailles de texte, trois rayons, et plus aucune
// valeur écrite en dur dans les feuilles du site. La fiche et le film ont leurs feuilles.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const site = read("../styles.css");
const SHEETS: Record<string, string> = {
  "styles.css": site,
  "bands.css": read("./bands.css"),
  "primes.css": read("./primes.css"),
  "denounce.css": read("./denounce.css"),
};

/** La valeur d'un jeton dans le premier :root. */
const token = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(site)?.[1];

/** Le corps d'une feuille, sans les commentaires ni les déclarations de jetons. Aucun bloc n'y échappe. */
function body(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--[\w-]+:[^;]*;/gm, "");
}

describe("les jetons", () => {
  it("sept tailles de texte, le titre de page à 64 au bureau", () => {
    expect(["--t-12", "--t-14", "--t-16", "--t-22", "--t-28", "--t-44", "--t-60"].map(token)).toEqual(["12px", "14px", "16px", "22px", "28px", "44px", "60px"]);
    expect(token("--t-page")).toBe("var(--t-44)");
    expect(site).toMatch(/@media \(min-width: 900px\) \{\s*:root \{[^}]*--t-page: 64px;/);
  });

  it("trois rayons, deux hauteurs tactiles, les marges", () => {
    expect([token("--r-pill"), token("--r-block"), token("--r-item")]).toEqual(["999px", "24px", "14px"]);
    expect([token("--h-main"), token("--h-tap")]).toEqual(["52px", "44px"]);
    // La marge : 16 px, ou plus si l'encoche d'un téléphone en paysage l'exige.
    expect([token("--gutter"), token("--pad-block"), token("--page-w")]).toEqual(["max(16px, env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px))", "20px", "1080px"]);
  });

  it("le rose ne sert qu'à l'action, la crème à l'emphase et aux étoiles", () => {
    expect(token("--c-action")).toBe("var(--blush)");
    expect(token("--c-emphasis")).toBe("var(--cream)");
    expect(token("--star")).toBe("var(--cream)");
  });
});

describe("les feuilles du site", () => {
  for (const [name, css] of Object.entries(SHEETS)) {
    const s = body(css);

    it(`${name} : aucune taille de texte en dur`, () => {
      expect(s.match(/font-size:\s*[\d.]+px/g) ?? []).toEqual([]);
      // Le raccourci « font: graisse taille / interligne famille » : la taille est un jeton.
      expect(s.match(/font:\s*(?:italic\s+)?\d{3}\s+[\d.]+px/g) ?? []).toEqual([]);
    });

    it(`${name} : aucun rayon de bloc ou de pilule en dur`, () => {
      // Restent permis : les ronds (50 %), les petits traits (2 px) et la case à cocher (6 px).
      expect(s.match(/border-radius:\s*(?:[1-9]\d+|[7-9])px/g) ?? []).toEqual([]);
    });

    it(`${name} : les couleurs de rôle, pas la palette, pour le texte et les fonds`, () => {
      expect(s.match(/var\(--(?:lilac|lilac-2|lilac-dim|lilac-faint|navy|plum|blush|peach)\)/g) ?? []).toEqual([]);
    });
  }
});
