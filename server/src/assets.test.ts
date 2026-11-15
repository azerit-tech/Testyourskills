import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { compressHtml, pageModule, pickEncoding, preloadTags, StaticCompressor, withPreloads, type Manifest } from "./assets";

describe("compression", () => {
  const root = mkdtempSync(join(tmpdir(), "tys-assets-"));
  mkdirSync(join(root, "assets"));
  const js = "export const x = 1;\n".repeat(400);
  writeFileSync(join(root, "assets", "index-a.js"), js);
  writeFileSync(join(root, "assets", "petit.js"), "x");
  writeFileSync(join(root, "assets", "photo.png"), "png".repeat(1000));
  const packer = new StaticCompressor(root);

  it("préfère brotli, puis gzip, et respecte q=0", () => {
    expect(pickEncoding("gzip, deflate, br, zstd")).toBe("br");
    expect(pickEncoding("gzip, deflate")).toBe("gzip");
    expect(pickEncoding("br;q=0, gzip")).toBe("gzip");
    expect(pickEncoding("identity")).toBeNull();
    expect(pickEncoding(undefined)).toBeNull();
  });

  it("sert un JS en brotli ou en gzip, le même contenu une fois décompressé", async () => {
    const br = await packer.serve("GET", "/assets/index-a.js", "gzip, br");
    expect(br?.headers.get("content-encoding")).toBe("br");
    expect(br?.headers.get("vary")).toBe("Accept-Encoding");
    expect(br?.headers.get("content-type")).toContain("javascript");
    expect(brotliDecompressSync(Buffer.from(await br!.arrayBuffer())).toString()).toBe(js);
    const gz = await packer.serve("GET", "/assets/index-a.js", "gzip");
    expect(gunzipSync(Buffer.from(await gz!.arrayBuffer())).toString()).toBe(js);
  });

  it("laisse au statique ce qu'il ne compresse pas", async () => {
    expect(await packer.serve("GET", "/assets/index-a.js", "")).toBeNull();
    expect(await packer.serve("GET", "/assets/photo.png", "br")).toBeNull();
    expect(await packer.serve("GET", "/assets/petit.js", "br")).toBeNull();
    expect(await packer.serve("GET", "/assets/absent.js", "br")).toBeNull();
    expect(await packer.serve("POST", "/assets/index-a.js", "br")).toBeNull();
    expect(await packer.serve("GET", "/../../etc/passwd.txt", "br")).toBeNull();
    expect(await packer.serve("GET", "/%2e%2e/%2e%2e/etc/hosts.txt", "br")).toBeNull();
  });

  it("compresse le HTML d'une page et garde son statut et ses en-têtes", async () => {
    const html = `<!doctype html><html><head></head><body>${"<p>fiche</p>".repeat(200)}</body></html>`;
    const res = await compressHtml(new Response(html, { status: 404, headers: { "Content-Type": "text/html", "Cache-Control": "no-cache" } }), "gzip");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("content-encoding")).toBe("gzip");
    expect(gunzipSync(Buffer.from(await res.arrayBuffer())).toString()).toBe(html);
  });
});

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
    expect(pageModule("/nimporte/quoi", 404)).toBeNull();
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
