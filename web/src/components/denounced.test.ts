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

function render(props: { by?: string | null; lawyer?: boolean; remake?: boolean; notMe?: boolean; quiet?: boolean; removal?: boolean; who?: string }, lang = "fr-FR"): string {
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
      quiet: props.quiet,
    },
    props.removal ? createElement(RemovalRequest, { cardId: "DenCard0001", short: true }) : null,
  );
  return renderToStaticMarkup(createElement(LangProvider, null, node)).replace(/&#x27;/g, "'");
}

afterEach(() => vi.unstubAllGlobals());

describe("le bloc d'une fiche dénoncée", () => {
  it("un titre qui vaut pour tout visiteur, qui a dénoncé, puis « C'est moi » en rose et « Ce n'est pas moi » en contour", () => {
    const html = render({ by: "leamd" });
    expect(html).toContain('<h2 class="denounced-title" id="denounced-title">Quelqu\'un a dénoncé @camroux</h2>');
    expect(html).not.toContain("à ton nom");
    expect(html).toContain("Dénonciation : @leamd");
    const buttons = [...html.matchAll(/<button type="button" class="([^"]+)">([^<]+)<\/button>/g)].map((m) => [m[1], m[2]]);
    expect(buttons).toEqual([
      ["pill pill-big", "C'est moi, je reprends ma fiche"],
      ["pill", "Ce n'est pas moi : faire la mienne"],
    ]);
    // Ce que fait le premier bouton, dit dessous.
    expect(html).toMatch(/<\/button><p class="denounced-hint">Connexion GitHub : [^<]+masquer ou la supprimer\.<\/p>/);
    expect(render({})).toContain("Dénonciation anonyme");
  });

  it("en anglais : “That's me” d'abord", () => {
    const html = render({}, "en-US");
    expect(html).toContain(">Someone turned in @camroux</h2>");
    expect(html).toMatch(/class="pill pill-big">That's me, claim my sheet<\/button>/);
    expect(html).toContain(">Not me: get mine</button>");
  });

  it("sans reprise possible : « Ce n'est pas moi » devient le bouton rose, la demande de retrait est dans le bloc", () => {
    const html = render({ lawyer: false, removal: true, who: "Camille Ardent" });
    expect(html).toContain(">Quelqu'un a dénoncé Camille Ardent</h2>");
    expect(html.match(/pill-big/g)).toHaveLength(1);
    expect(html).toMatch(/class="pill pill-big">Ce n'est pas moi/);
    expect(html).toMatch(/<p class="removal"><button type="button" class="link-alt">C'est toi \? Demander le retrait de cette fiche<\/button><\/p><\/section>$/);
  });

  it("qui a déjà sa fiche n'a pas « faire la mienne », et rien en rose : le duel prend le rose", () => {
    const html = render({ notMe: false, quiet: true });
    expect(html).not.toContain("faire la mienne");
    expect(html).not.toContain("pill-big");
    expect(html).toContain('<button type="button" class="pill">C\'est moi, je reprends ma fiche</button>');
  });

  it("dénoncée par son lien LinkedIn : « C'est moi : faire ma fiche moi-même » en rose, et ce qu'il fait, dit comme dans le message reçu", () => {
    const html = render({ lawyer: false, remake: true, removal: true, who: "Maxime Bernard" }).replace(/\u00a0/g, " ");
    const buttons = [...html.matchAll(/<button type="button" class="(pill[^"]*)">([^<]+)<\/button>/g)].map((m) => [m[1], m[2]]);
    expect(buttons).toEqual([
      ["pill pill-big", "C'est moi : faire ma fiche moi-même"],
      ["pill", "Ce n'est pas moi : faire la mienne"],
    ]);
    expect(html).toContain('<p class="denounced-hint">Reprends-la : refais-la depuis ton LinkedIn');
    expect(render({ lawyer: false, remake: true }, "en-US")).toContain(">That's me: make it myself</button>");
    // Dans la page : la nouvelle fiche part de ce lien, et la barre fixe porte le même geste.
    expect(page).toMatch(/useRemake\(wantedYou && !cardLogin && main\.linkedinUrl \? main\.linkedinUrl : null/);
    expect(page).toMatch(/const lawyer = other \? null : \(claimHere \?\? remake\?\.go \?\? null\);/);
  });

  it("dans la page : la demande de retrait ne se répète pas en pied de colonne", () => {
    expect(page).toMatch(/\{!cardLogin && <RemovalRequest cardId=\{id\} short \/>\}/);
    expect(page).toMatch(/visitor && !cardLogin && !wantedYou && <RemovalRequest/);
  });
});
