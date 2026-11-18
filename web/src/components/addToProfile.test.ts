// « Ajouter à mon profil LinkedIn » (§18.75) : l'adresse du formulaire prérempli et son bouton.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addToProfileUrl, AZERIT_LINKEDIN_ORG_ID, certName } from "../../../shared/addToProfile";
import { FIXTURES } from "../../../shared/fixtures";
import type { CardData } from "../../../shared/types";
import { LangProvider } from "../i18n";
import { aimAt, ShareBar } from "./After";

const query = (href: string) => new URL(href).searchParams;

describe("adresse « Add to Profile »", () => {
  const base = { stars: 5, lang: "fr" as const, createdAt: "2026-03-07T22:10:00.000Z", certUrl: "https://skills.azerit.tech/c/AbCdEf1234", certId: "AbCdEf1234" };

  it("la forme de LinkedIn, paramètres dans l'ordre, nom et adresse encodés", () => {
    expect(addToProfileUrl(base)).toBe(
      "https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=Dev%205%20%C3%A9toiles&organizationId=138413959&issueYear=2026&issueMonth=3&certUrl=https%3A%2F%2Fskills.azerit.tech%2Fc%2FAbCdEf1234&certId=AbCdEf1234",
    );
  });

  it("l'organisme par son seul id, jamais par son nom", () => {
    const q = query(addToProfileUrl(base));
    expect(q.get("organizationId")).toBe(AZERIT_LINKEDIN_ORG_ID);
    expect(q.has("organizationName")).toBe(false);
  });

  it("le mois sans zéro en tête, de 1 à 12, en UTC", () => {
    expect(query(addToProfileUrl({ ...base, createdAt: "2026-01-01T00:30:00.000Z" })).get("issueMonth")).toBe("1");
    const dec = query(addToProfileUrl({ ...base, createdAt: "2026-12-31T23:59:00.000Z" }));
    expect([dec.get("issueYear"), dec.get("issueMonth")]).toEqual(["2026", "12"]);
    expect(addToProfileUrl(base)).not.toMatch(/issueMonth=0/);
  });

  it("une adresse à caractères spéciaux revient intacte", () => {
    const certUrl = "https://skills.azerit.tech/c/Ab?x=1&y=é #z";
    expect(query(addToProfileUrl({ ...base, certUrl })).get("certUrl")).toBe(certUrl);
  });

  it("le nom suit la note et la langue, au singulier pour une étoile", () => {
    expect([1, 5, 6].map((n) => certName(n, "fr"))).toEqual(["Dev 1 étoile", "Dev 5 étoiles", "Dev 6 étoiles"]);
    expect(certName(4, "en")).toBe("4-star dev");
    expect(query(addToProfileUrl({ ...base, stars: 6, lang: "en" })).get("name")).toBe("6-star dev");
    expect(certName(5, "fr")).not.toMatch(/testyourskills|github/i);
  });
});

describe("bouton sous la fiche", () => {
  afterEach(() => vi.unstubAllGlobals());

  const gold: CardData = { ...FIXTURES.gold, id: "AbCdEf1234", createdAt: "2026-11-19T08:00:00.000Z" };

  function render(card: CardData = gold, language = "fr-FR") {
    vi.stubGlobal("window", { location: { origin: "https://skills.azerit.tech", pathname: `/c/${card.id}`, search: "" }, matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh)", language });
    return renderToStaticMarkup(createElement(LangProvider, null, createElement(ShareBar, { item: { kind: "card", card }, toast: () => undefined })));
  }

  it("juste après le partage LinkedIn, une ligne, l'adresse de la fiche tant qu'on ne clique pas", () => {
    const html = render();
    expect(html).toMatch(
      /<span>Partager sur LinkedIn<\/span><\/a><p class="out-hint"[^>]*>[^<]*<\/p><a class="pill pill-ghost out-second out-profile" href="https:\/\/skills\.azerit\.tech\/c\/AbCdEf1234\?r=AbCdEf1234" target="_blank" rel="noopener">.*?<span>Ajouter à mon profil LinkedIn<\/span><\/a><div class="out-more">/,
    );
    // Un bloqueur de contenu masquerait un lien vers LinkedIn : l'adresse n'est pas dans la page.
    expect(html).not.toContain("linkedin.com");
  });

  it("en anglais", () => {
    expect(render(gold, "en-US")).toContain("<span>Add to my LinkedIn profile</span>");
  });

  it("pas de bouton sur une fiche scellée, sans note à poser", () => {
    expect(render({ ...gold, sealed: true })).not.toContain("out-profile");
  });

  it("au clic, le lien vise le formulaire de LinkedIn puis reprend l'adresse de la fiche", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout });
    const a = { href: "https://skills.azerit.tech/c/x" } as HTMLAnchorElement;
    aimAt(a, addToProfileUrl({ stars: 5, lang: "fr", createdAt: "2026-11-19T08:00:00.000Z", certUrl: "https://skills.azerit.tech/c/x", certId: "x" }), "https://skills.azerit.tech/c/x");
    expect(a.href).toMatch(/^https:\/\/www\.linkedin\.com\/profile\/add\?startTask=CERTIFICATION_NAME&/);
    vi.runAllTimers();
    expect(a.href).toBe("https://skills.azerit.tech/c/x");
    vi.useRealTimers();
  });
});
