// Le décor du profil (§18.28, §18.29) : le ciel de page et la peine sous la fiche, rendus en chaîne.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../../shared/types";
import { FIXTURES } from "../../../shared/fixtures";
import { LangProvider } from "../i18n";
import { Penalty, ProfileSky, skyOf } from "./ProfileTile";

function render(node: ReturnType<typeof createElement>, lang = "fr-FR"): string {
  vi.stubGlobal("window", { location: { origin: "https://skills.test", pathname: "/c/x", search: "" }, matchMedia: () => ({ matches: false }) });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("navigator", { userAgent: "test", language: lang });
  return renderToStaticMarkup(createElement(LangProvider, null, node));
}

afterEach(() => vi.unstubAllGlobals());

describe("la peine sous la fiche (§18.29)", () => {
  it("la peine puis la caution, en texte : ni image, ni nom de profil, ni phrase (ils sont sur la fiche)", () => {
    const card = FIXTURES.gold;
    const html = render(createElement(Penalty, { card }));
    expect(html).toBe(`<p class="penalty"><span>${card.sentence!.label.fr}</span><span>${card.sentence!.bail!.fr}</span></p>`);
    expect(html).not.toContain("<img");
    expect(html).not.toContain(card.profile!.label.fr);
    expect(html).not.toContain(card.profile!.tagline.fr);
  });

  it("en anglais : les textes anglais", () => {
    expect(render(createElement(Penalty, { card: FIXTURES.gold }), "en-US")).toContain(FIXTURES.gold.sentence!.label.en);
  });

  it("sans profil, la peine reste ; sans peine, rien", () => {
    const { profile: _p, ...bare } = FIXTURES.gold;
    expect(render(createElement(Penalty, { card: bare as CardData }))).toContain('class="penalty"');
    const { sentence: _s, ...free } = FIXTURES.gold;
    expect(render(createElement(Penalty, { card: free as CardData }))).toBe("");
  });

  it("une relaxe n'a pas de caution", () => {
    const html = render(createElement(Penalty, { card: FIXTURES.icon }));
    expect(html.match(/<span>/g)).toHaveLength(1);
  });
});

describe("le ciel de page (§18.29)", () => {
  it("l'image du profil, cachée tant qu'elle ne s'est pas chargée", () => {
    const html = render(createElement(ProfileSky, { card: FIXTURES.gold, shown: true }));
    expect(html).toContain(
      `<div class="card-sky sky-light" aria-hidden="true"><img src="/profiles/${FIXTURES.gold.profile!.id}.jpg" width="1152" height="768" alt="" decoding="async" fetchPriority="high"/></div>`,
    );
  });

  it("un identifiant inattendu ne devient jamais une adresse : l'image par défaut", () => {
    const card = { ...FIXTURES.gold, profile: { ...FIXTURES.gold.profile!, id: "../x" } };
    expect(skyOf(card.profile.id)).toEqual({ src: "/profiles/default.jpg", tone: "dark" });
  });

  it("les quatre ciels de l'heure bleue sont sombres, les dix autres profils clairs", () => {
    const dark = ["mastermind", "night_owl", "ghost", "default"];
    const light = ["forger", "kingpin", "delivery_machine", "arsonist", "repeat_offender", "hoarder", "chameleon", "fresh_blood", "old_school", "sleeper_agent"];
    expect(dark.every((id) => skyOf(id).tone === "dark")).toBe(true);
    expect(light.every((id) => skyOf(id).tone === "light")).toBe(true);
  });
});
