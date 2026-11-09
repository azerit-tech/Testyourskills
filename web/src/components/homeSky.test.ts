// Le ciel de l'accueil (§18.29) : rendu en chaîne, sans navigateur.
import { existsSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomeSky, SKY_ORDER } from "./HomeSky";

describe("ciel de l'accueil (§18.29)", () => {
  it("cinq lieux du crime, dans l'ordre, qui existent en deux tailles", () => {
    expect(SKY_ORDER).toEqual(["kingpin", "arsonist", "delivery_machine", "night_owl", "default"]);
    for (const id of SKY_ORDER) {
      expect(existsSync(`web/public/profiles/${id}.jpg`)).toBe(true);
      expect(existsSync(`web/public/profiles/${id}-s.jpg`)).toBe(true);
    }
  });

  it("premier rendu : la première image seule, en priorité haute, les autres absentes", () => {
    const html = renderToStaticMarkup(createElement(HomeSky));
    const imgs = html.match(/<img[^>]*>/g) ?? [];
    expect(imgs).toHaveLength(1);
    const first = imgs[0] ?? "";
    expect(first).toContain('src="/profiles/kingpin.jpg"');
    // Le rendu en chaîne garde la casse React (srcSet, fetchPriority) : HTML l'ignore.
    expect(first.toLowerCase()).toContain('srcset="/profiles/kingpin-s.jpg 576w, /profiles/kingpin.jpg 1152w"');
    expect(first.toLowerCase()).toContain('fetchpriority="high"');
    expect(first).not.toContain("loading=");
    expect(first).toContain('alt=""');
    expect(first).toContain('width="1152"');
    expect(first).toContain('height="768"');
    expect(first).toMatch(/class="home-sky-img is-on"/);
    for (const id of SKY_ORDER.slice(1)) expect(html).not.toContain(`/profiles/${id}`);
  });

  it("décor seulement : caché aux lecteurs d'écran", () => {
    const html = renderToStaticMarkup(createElement(HomeSky));
    expect(html).toMatch(/<div class="home-sky" aria-hidden="true"><img /);
  });
});
