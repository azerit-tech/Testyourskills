// La fiche d'une personne dénoncée (§18.48) : un titre pour tout visiteur, deux sorties, le retrait dans le bloc.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LangProvider } from "../i18n";
import { Denounced } from "./Denounced";
import { RemovalRequest } from "./Removal";

const page = readFileSync(join(__dirname, "../pages/CardPage.tsx"), "utf8");

function render(props: { by?: string | null; lawyer?: boolean; remake?: boolean; notMe?: boolean; removal?: boolean; who?: string }, lang = "fr-FR"): string {
  vi.stubGlobal("window", {
    location: { origin: "https://skills.test", pathname: "/c/x", search: "" },
    matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("navigator", { userAgent: "test", language: lang });
  const node = createElement(
    Denounced,
    {
      who: props.who ?? "@camroux",
      by: props.by ?? null,
      onLawyer: props.lawyer === false || props.remake ? null : () => undefined,
      onRemake: props.remake ? { go: () => undefined, busy: false } : null,
      notMe: props.notMe !== false,
    },
    props.removal ? createElement(RemovalRequest, { cardId: "DenCard0001", short: true }) : null,
  );
  return renderToStaticMarkup(createElement(LangProvider, null, node)).replace(/&#x27;/g, "'");
}

afterEach(() => vi.unstubAllGlobals());

describe("le bloc d'une fiche dénoncée", () => {
  it("« C'est toi ? » pour tout visiteur, qui a dénoncé dit une fois, « Vérifie-la toi-même » en rose et « Ce n'est pas moi » en lien (§18.52, §18.104)", () => {
    const html = render({ by: "leamd" }).replace(/\u00a0/g, " ");
    expect(html).toContain('<h2 class="denounced-title" id="denounced-title">C\'est toi ?</h2>');
    expect(html).not.toContain("à ton nom");
    // Qui a dénoncé : la phrase au-dessus de la fiche (téléphone), ce rappel au bureau seulement (denounce.css).
    expect(html).toContain('<p class="denounced-by">@leamd a dénoncé @camroux.</p>');
    expect(render({})).toContain('<p class="denounced-by">Quelqu\'un a dénoncé @camroux.</p>');
    const buttons = [...html.matchAll(/<button type="button" class="([^"]+)">([^<]+)<\/button>/g)].map((m) => [m[1], m[2]]);
    // Un bouton par intention : le formulaire de « Ce n'est pas moi » est celui de « À ton tour ».
    expect(buttons).toEqual([
      ["pill pill-big", "Vérifie-la toi-même"],
      ["link-alt denounced-notme", "Ce n'est pas moi : faire la mienne"],
    ]);
    // Aucune ligne de justification sous le bouton (§18.104).
    expect(html).not.toContain("denounced-hint");
    expect(html).not.toContain("Connexion GitHub");
    const css = readFileSync(join(__dirname, "denounce.css"), "utf8");
    expect(css).toMatch(/@media \(max-width: 899px\) \{\s*\.denounced-by \{\s*display: none;/);
  });

  it("en anglais : “Check it yourself” d'abord", () => {
    const html = render({}, "en-US");
    expect(html).toContain(">Is this you?</h2>");
    expect(html).toMatch(/class="pill pill-big">Check it yourself<\/button>/);
    expect(html).toContain(">Not me: get mine</button>");
  });

  it("sans reprise possible : « Ce n'est pas moi » devient le bouton rose, la demande de retrait est dans le bloc", () => {
    const html = render({ lawyer: false, removal: true, who: "Camille Ardent" });
    expect(html).toContain(">Quelqu'un a dénoncé Camille Ardent.</p>");
    expect(html.match(/pill-big/g)).toHaveLength(1);
    expect(html).toMatch(/class="pill pill-big">Ce n'est pas moi/);
    expect(html).toMatch(/<p class="removal"><button type="button" class="link-alt">C'est toi \? Demander le retrait de cette fiche<\/button><\/p><\/section>$/);
  });

  it("qui a déjà une autre fiche ici n'a pas « faire la mienne », et « Vérifie-la toi-même » reste le rose (§18.104)", () => {
    const html = render({ notMe: false });
    expect(html).not.toContain("faire la mienne");
    expect(html.match(/pill-big/g)).toHaveLength(1);
    expect(html).toContain('<button type="button" class="pill pill-big">Vérifie-la toi-même</button>');
  });

  it("dénoncée par son lien LinkedIn : « Vérifie-la toi-même » en rose, la refaire depuis ce lien, sans ligne dessous", () => {
    const html = render({ lawyer: false, remake: true, removal: true, who: "Maxime Bernard" }).replace(/\u00a0/g, " ");
    const buttons = [...html.matchAll(/<button type="button" class="((?:pill|link-alt denounced)[^"]*)">([^<]+)<\/button>/g)].map((m) => [m[1], m[2]]);
    expect(buttons).toEqual([
      ["pill pill-big", "Vérifie-la toi-même"],
      ["link-alt denounced-notme", "Ce n'est pas moi : faire la mienne"],
    ]);
    expect(html).not.toContain("denounced-hint");
    expect(render({ lawyer: false, remake: true }, "en-US")).toContain(">Check it yourself</button>");
    // Dans la page : la nouvelle fiche part de ce lien, et la barre fixe porte le même geste.
    expect(page).toMatch(/useRemake\(wantedYou && !cardLogin && main\.linkedinUrl \? main\.linkedinUrl : null/);
    // Qu'on ait ou non une autre fiche dans ce navigateur (§18.104).
    expect(page).toMatch(/const lawyer = claimHere \?\? remake\?\.go \?\? null;/);
  });

  it("dans la page : la demande de retrait ne se répète pas en pied de colonne", () => {
    expect(page).toMatch(/\{!cardLogin && <RemovalRequest cardId=\{id\} short \/>\}/);
    expect(page).toMatch(/visitor && !cardLogin && !wantedYou && <RemovalRequest/);
  });
});
