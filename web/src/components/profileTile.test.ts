// Le décor du profil (§18.28, §18.29) : le ciel de page, rendu en chaîne. La peine sous la fiche est retirée (§18.76).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../../../shared/fixtures";
import { LangProvider } from "../i18n";
import { ProfileSky, skyOf } from "./ProfileTile";

function render(node: ReturnType<typeof createElement>, lang = "fr-FR"): string {
  vi.stubGlobal("window", { location: { origin: "https://skills.test", pathname: "/c/x", search: "" }, matchMedia: () => ({ matches: false }) });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("navigator", { userAgent: "test", language: lang });
  return renderToStaticMarkup(createElement(LangProvider, null, node));
}

afterEach(() => vi.unstubAllGlobals());

describe("le ciel de page (§18.29)", () => {
  it("l'image du profil, cachée tant qu'elle ne s'est pas chargée", () => {
    const html = render(createElement(ProfileSky, { card: FIXTURES.gold, shown: true }));
    expect(html).toContain(
      `<div class="card-sky sky-light" aria-hidden="true"><picture><source media="(max-width: 640px)" srcSet="/profiles/${FIXTURES.gold.profile!.id}-s.jpg" width="576" height="384"/><img src="/profiles/${FIXTURES.gold.profile!.id}.jpg" width="1152" height="768" alt="" decoding="async" fetchPriority="high"/></picture></div>`,
    );
  });

  it("un identifiant inattendu ne devient jamais une adresse : l'image par défaut", () => {
    const card = { ...FIXTURES.gold, profile: { ...FIXTURES.gold.profile!, id: "../x" } };
    expect(skyOf(card.profile.id)).toEqual({ src: "/profiles/default.jpg", tone: "dark" });
  });

  it("les quatre ciels de l'heure bleue sont sombres, les neuf autres profils clairs", () => {
    const dark = ["mastermind", "night_owl", "ghost", "default"];
    const light = ["kingpin", "delivery_machine", "arsonist", "repeat_offender", "hoarder", "chameleon", "fresh_blood", "old_school", "sleeper_agent"];
    expect(dark.every((id) => skyOf(id).tone === "dark")).toBe(true);
    expect(light.every((id) => skyOf(id).tone === "light")).toBe(true);
  });

  it("« Sous couverture » n'a plus l'atelier de faux diplômes : le ciel par défaut", () => {
    expect(skyOf("forger")).toEqual({ src: "/profiles/default.jpg", tone: "dark" });
  });
});
