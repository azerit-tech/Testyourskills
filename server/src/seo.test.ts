import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE_DESCRIPTIONS, sitePageMeta, withPageUrl } from "./seo";

describe("balises des pages du site", () => {
  it("le règlement et la vie privée ont leur titre et leur description, dans la bonne langue, avec l'image de l'accueil", () => {
    const rules = sitePageMeta("/reglement", "https://skills.test", "en");
    expect(rules?.title).toBe("Season rules · Azerit");
    expect(rules?.description).toBe(PAGE_DESCRIPTIONS.rules.en);
    expect(rules?.url).toBe("https://skills.test/reglement");
    expect(rules?.image).toBe("https://skills.test/og/home.png");
    expect(sitePageMeta("/reglement", "https://skills.test", "fr")?.lang).toBe("fr");
    expect(sitePageMeta("/confidentialite", "https://skills.test", "en")?.description).toBe(PAGE_DESCRIPTIONS.privacy.fr);
    expect(sitePageMeta("/privacy/", "https://skills.test", "fr")?.title).toBe("Privacy · Azerit");
    expect(sitePageMeta("/", "https://skills.test", "fr")).toBeNull();
    expect(sitePageMeta("/torvalds", "https://skills.test", "fr")).toBeNull();
  });

  it("les descriptions ne nomment qu'Azerit, sans tiret long", () => {
    for (const page of Object.values(PAGE_DESCRIPTIONS)) for (const d of Object.values(page)) expect(d).not.toMatch(/Testyourskills|—/);
  });

  it("l'adresse canonique et og:url remplacent celles du gabarit, une fois", () => {
    const html = withPageUrl(`<html><head><link rel="canonical" href="https://x/"><meta property="og:url" content="https://x/"></head></html>`, "https://skills.test/");
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html.match(/og:url/g)).toHaveLength(1);
    expect(html).toContain('<link rel="canonical" href="https://skills.test/">');
  });

  it("web/index.html annonce les icônes, le manifeste et l'adresse de l'accueil", () => {
    const index = readFileSync(join(__dirname, "../../web/index.html"), "utf8");
    for (const tag of ['rel="apple-touch-icon"', 'rel="manifest"', 'href="/favicon.ico"', 'rel="canonical"', 'property="og:url"', 'name="theme-color"'])
      expect(index).toContain(tag);
    const manifest = JSON.parse(readFileSync(join(__dirname, "../../web/public/site.webmanifest"), "utf8"));
    expect(manifest.name).toBe("Azerit");
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(["192x192", "512x512"]);
  });
});
