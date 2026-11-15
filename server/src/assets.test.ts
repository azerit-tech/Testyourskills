import { describe, expect, it } from "vitest";
import { pageModule, preloadTags, withPreloads, type Manifest } from "./assets";

const MANIFEST: Manifest = {
  "index.html": { file: "assets/index-a.js", isEntry: true, css: ["assets/index-a.css"] },
  "_Stars-b.js": { file: "assets/Stars-b.js", imports: ["index.html", "_unlock-c.js"] },
  "_unlock-c.js": { file: "assets/unlock-c.js" },
  "_CardView-d.js": { file: "assets/CardView-d.js", imports: ["index.html", "_Stars-b.js"] },
  "src/pages/Home.tsx": { file: "assets/Home-e.js", imports: ["index.html", "_CardView-d.js", "_Stars-b.js"] },
  "src/pages/CardPage.tsx": { file: "assets/CardPage-f.js", imports: ["index.html", "_CardView-d.js"], css: ["assets/CardPage-f.css"] },
};

describe("préchargement des pages du front", () => {
  it("choisit le module de la page comme le routeur du front", () => {
    expect(pageModule("/", 200)).toBe("src/pages/Home.tsx");
    expect(pageModule("/c/abc", 200)).toBe("src/pages/CardPage.tsx");
    expect(pageModule("/c/inconnue", 404)).toBe("src/pages/CardPage.tsx");
    expect(pageModule("/bandes/ecole/insa", 200)).toBe("src/pages/Bands.tsx");
    expect(pageModule("/primes", 200)).toBe("src/pages/Primes.tsx");
    expect(pageModule("/reglement", 200)).toBe("src/pages/Rules.tsx");
    expect(pageModule("/privacy", 200)).toBe("src/pages/Privacy.tsx");
    expect(pageModule("/nimporte/quoi", 404)).toBe("src/pages/Privacy.tsx");
    expect(pageModule("/torvalds", 200)).toBe("src/pages/Home.tsx");
  });

  it("annonce la page et ses morceaux une fois chacun, jamais le paquet de départ", () => {
    const tags = preloadTags(MANIFEST, "src/pages/Home.tsx");
    expect(tags.match(/modulepreload/g)).toHaveLength(4);
    expect(tags).toContain('href="/assets/Home-e.js"');
    expect(tags).toContain('href="/assets/unlock-c.js"');
    expect(tags).not.toContain("index-a");
  });

  it("pose la feuille d'une page qui en a une, et tout avant </head>", () => {
    const html = withPreloads("<html><head><title>x</title></head><body></body></html>", MANIFEST, "/c/abc", 200);
    expect(html).toContain('<link rel="stylesheet" crossorigin href="/assets/CardPage-f.css">');
    expect(html.indexOf("CardPage-f.js")).toBeLessThan(html.indexOf("</head>"));
  });

  it("laisse le HTML tel quel pour un module absent du manifeste", () => {
    const html = "<html><head></head></html>";
    expect(withPreloads(html, MANIFEST, "/bandes", 200)).toBe(html);
  });
});
