// La tuile de profil (§18.28) : rendue en chaîne, sans navigateur.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../../shared/types";
import { FIXTURES } from "../../../shared/fixtures";
import { LangProvider } from "../i18n";
import { ProfileTile, tintOf } from "./ProfileTile";

function render(card: CardData, lang = "fr-FR"): string {
  vi.stubGlobal("window", { location: { origin: "https://skills.test", pathname: "/c/x", search: "" }, matchMedia: () => ({ matches: false }) });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("navigator", { userAgent: "test", language: lang });
  return renderToStaticMarkup(createElement(LangProvider, null, createElement(ProfileTile, { card })));
}

afterEach(() => vi.unstubAllGlobals());

describe("tuile de profil (§18.28)", () => {
  it("avec un profil : l'illustration du profil, le nom, la phrase, puis la peine et la caution", () => {
    const card = FIXTURES.gold;
    expect(card.profile).toBeDefined();
    const html = render(card);
    expect(html).toContain(`src="/profiles/${card.profile!.id}.webp"`);
    expect(html).toMatch(/<img[^>]*alt=""[^>]*loading="lazy"/);
    expect(html).toMatch(/class="profile-kicker">Profil</);
    expect(html).toContain(`>${card.profile!.label.fr}</h2>`);
    expect(html).toContain(`>${card.profile!.tagline.fr}</p>`);
    // le palmier de repli est toujours dessous : il reste si l'image manque
    expect(html).toContain('class="profile-palm"');
    // le voile n'est posé qu'une fois l'image chargée
    expect(html).not.toContain("has-art");
    if (card.sentence) expect(html).toMatch(/class="profile-sentence"><span>Peine/);
  });

  it("en anglais : « Profile » et les textes anglais du profil", () => {
    const html = render(FIXTURES.gold, "en-US");
    expect(html).toMatch(/class="profile-kicker">Profile</);
    expect(html).toContain(FIXTURES.gold.profile!.label.en);
  });

  it("sans profil : rien", () => {
    const { profile: _drop, ...card } = FIXTURES.gold;
    expect(render(card as CardData)).toBe("");
  });

  it("la teinte est fixe pour un profil : marine pour l'heure bleue, prune sinon", () => {
    expect(tintOf("night_owl")).toBe("navy");
    expect(tintOf("ghost")).toBe("navy");
    expect(tintOf("arsonist")).toBe("plum");
    expect(tintOf("arsonist")).toBe(tintOf("arsonist"));
    expect(render(FIXTURES.gold)).toMatch(/class="profile-tile tint-(plum|navy)"/);
  });

  it("un identifiant inattendu ne devient jamais une adresse", () => {
    const card = { ...FIXTURES.gold, profile: { ...FIXTURES.gold.profile!, id: "../x" } };
    const html = render(card);
    expect(html).not.toContain("<img");
    expect(html).toContain('class="profile-palm"');
  });
});
