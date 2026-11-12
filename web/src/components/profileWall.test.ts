// Le mur des 13 profils de l'accueil (§18.28) : rendu en chaîne, sans navigateur.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import profilesJson from "../../../data/profiles.json";
import { LangProvider } from "../i18n";
import { sceneOf } from "../../../shared/scenes";
import { ProfileWall, WALL_PROFILES } from "./ProfileWall";

function render(language: string): string {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("navigator", { language });
  return renderToStaticMarkup(createElement(LangProvider, null, createElement(ProfileWall, { onPlay: () => undefined })));
}

const srcs = (html: string) => [...html.matchAll(/<img[^>]*src="\/profiles\/([a-z_]+)-s\.jpg"/g)].map((m) => m[1]);
const names = (html: string) => [...html.matchAll(/<h3 class="wall-name">([^<]*)<\/h3>/g)].map((m) => m[1]);

afterEach(() => vi.unstubAllGlobals());

describe("mur des profils (§18.28)", () => {
  const catalog = profilesJson.profiles;

  it("13 tuiles, les plus parlants d'abord, la vieille école vers la fin", () => {
    const ids = WALL_PROFILES.map((p) => p.id);
    expect(ids).toHaveLength(13);
    expect(new Set(ids)).toEqual(new Set(catalog.map((p) => p.id)));
    expect(ids.slice(0, 6)).toEqual(["arsonist", "night_owl", "repeat_offender", "forger", "delivery_machine", "mastermind"]);
    expect(ids.indexOf("old_school")).toBeGreaterThanOrEqual(10);
    // chaque tuile sur le décor de son profil ; « Sous couverture » (forger) sur le décor par
    // défaut : l'atelier de faux diplômes n'est plus affiché
    const html = render("fr-FR");
    expect(srcs(html)).toEqual(ids.map((id) => sceneOf(id)));
    expect(srcs(html)[3]).toBe("default");
    expect(names(html)[3]).toBe("Sous couverture");
    expect(html).not.toContain("forger");
  });

  it("images en -s.jpg, paresseuses, dimensionnées, sans texte de remplacement", () => {
    const imgs = render("fr-FR").match(/<img[^>]*>/g) ?? [];
    expect(imgs).toHaveLength(13);
    for (const img of imgs) {
      expect(img).toMatch(/src="\/profiles\/[a-z_]+-s\.jpg"/);
      expect(img).toContain('alt=""');
      expect(img).toContain('loading="lazy"');
      expect(img).toContain('decoding="async"');
      expect(img).toContain('width="576"');
      expect(img).toContain('height="384"');
    }
  });

  it("français : titre, noms et phrases du catalogue, puis « Et toi ? »", () => {
    const html = render("fr-FR");
    expect(html).toContain('<h2 id="wall-title">Lequel es-tu ?</h2>');
    const ids = WALL_PROFILES.map((p) => p.id);
    expect(srcs(html)).toEqual(ids.map((id) => sceneOf(id)));
    const byId = new Map(catalog.map((p) => [p.id, p]));
    expect(names(html)).toEqual([...ids.map((id) => byId.get(id)!.label.fr), "Et toi ?"]);
    for (const id of ids) expect(html).toContain(byId.get(id)!.tagline.fr.replace(/'/g, "&#x27;"));
    expect(html).toMatch(/<button type="button" class="pill">Découvre le tien<\/button><\/li><\/ul>/);
  });

  it("anglais : mêmes tuiles, textes anglais", () => {
    const html = render("en-US");
    expect(html).toContain("Which one are you?");
    const ids = WALL_PROFILES.map((p) => p.id);
    expect(srcs(html)).toEqual(ids.map((id) => sceneOf(id)));
    const byId = new Map(catalog.map((p) => [p.id, p]));
    expect(names(html)).toEqual([...ids.map((id) => byId.get(id)!.label.en), "And you?"]);
    for (const id of ids) expect(html).toContain(byId.get(id)!.tagline.en.replace(/'/g, "&#x27;"));
    expect(html).toContain(">Find yours</button>");
  });

  it("une liste au clavier, nommée par le titre", () => {
    const html = render("fr-FR");
    expect(html).toMatch(/<ul class="wall-list" role="list" aria-labelledby="wall-title" tabindex="0">/);
    expect(html.match(/<li /g)).toHaveLength(14);
  });
});
