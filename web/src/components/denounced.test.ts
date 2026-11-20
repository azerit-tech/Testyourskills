// La fiche d'une personne dénoncée (§18.48, §18.118) : « C'est bien moi » en très grand, la connexion de la
// fiche, une ligne dessous, « Ce n'est pas moi » en lien, le retrait dans le bloc.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LangProvider } from "../i18n";
import { Denounced } from "./Denounced";
import { RemovalRequest } from "./Removal";

const page = readFileSync(join(__dirname, "../pages/CardPage.tsx"), "utf8");

type Via = "github" | "linkedin";

function render(props: { by?: string | null; via?: Via[]; remake?: boolean; notMe?: boolean; removal?: boolean; who?: string }, lang = "fr-FR"): string {
  vi.stubGlobal("window", {
    location: { origin: "https://skills.test", pathname: "/c/x", search: "" },
    matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("navigator", { userAgent: "test", language: lang });
  const via = props.via ?? (props.remake ? [] : (["github"] as Via[]));
  const node = createElement(
    Denounced,
    {
      who: props.who ?? "@camroux",
      by: props.by ?? null,
      signIns: via.map((v) => ({ via: v, go: () => undefined })),
      onRemake: props.remake ? { go: () => undefined, busy: false } : null,
      notMe: props.notMe !== false,
    },
    props.removal ? createElement(RemovalRequest, { cardId: "DenCard0001", short: true }) : null,
  );
  return renderToStaticMarkup(createElement(LangProvider, null, node)).replace(/&#x27;/g, "'");
}

/** Les boutons du bloc : [classe, texte visible], sans l'icône ni ce qui n'est dit qu'au lecteur d'écran. */
const buttonsOf = (html: string) =>
  [...html.matchAll(/<button type="button" class="([^"]+)"[^>]*>(.*?)<\/button>/g)].map((m) => [
    m[1],
    m[2]!
      .replace(/<svg.*?<\/svg>/g, "")
      .replace(/<span class="sr-only">.*?<\/span>/g, "")
      .replace(/<\/?span>/g, "")
      .replace(/ /g, " "),
  ]);

afterEach(() => vi.unstubAllGlobals());

describe("le bloc d'une fiche dénoncée", () => {
  it("« C'est bien moi » en très grand, premier et seul rose, une ligne dessous, « Ce n'est pas moi » en lien (§18.118)", () => {
    const html = render({ by: "leamd" }).replace(/ /g, " ");
    // « C'est toi ? » reste le nom du bloc, lu, pas montré : le bouton y répond.
    expect(html).toContain('<h2 class="sr-only" id="denounced-title">C\'est toi ?</h2>');
    expect(html).toContain('<p class="denounced-by">@leamd a dénoncé @camroux.</p>');
    expect(render({})).toContain('<p class="denounced-by">Quelqu\'un a dénoncé @camroux.</p>');
    expect(buttonsOf(html)).toEqual([
      ["pill denounced-me", "C'est bien moi"],
      ["link-alt denounced-notme", "Ce n'est pas moi : faire la mienne"],
    ]);
    expect(html.indexOf("denounced-me")).toBeLessThan(html.indexOf('class="denounced-why"'));
    expect(html).toContain('<p class="denounced-why" id="denounced-why">Pour la faire tienne : la refaire, la cacher, la partager.</p>');
    expect(html).not.toContain("classement");
    // La connexion de la fiche est dite au lecteur d'écran ; l'icône la montre.
    expect(html).toContain('<span class="sr-only"> : connexion GitHub</span>');
    expect(html.match(/pill-big|denounced-me"/g)).toHaveLength(1);
    const css = readFileSync(join(__dirname, "denounce.css"), "utf8");
    expect(css).toMatch(/@media \(max-width: 899px\) \{\s*\.denounced-by \{\s*display: none;/);
    expect(css).toMatch(/\.denounced \.denounced-me \{\s*width: 100%;\s*min-height: 84px;/);
  });

  it("en anglais : “That's me”, et sa ligne", () => {
    const html = render({}, "en-US");
    expect(buttonsOf(html)[0]).toEqual(["pill denounced-me", "That's me"]);
    expect(html).toContain("To make it yours: redo it, hide it, share it.");
    expect(html).toContain(">Not me: get mine</button>");
  });

  it("la connexion qui va avec la fiche : LinkedIn pour un profil ; un dossier porte les deux, GitHub en grand, LinkedIn en lien", () => {
    const li = render({ via: ["linkedin"], removal: true, who: "Maxime Bernard" });
    expect(li).toContain('<span class="sr-only"> : connexion LinkedIn</span>');
    expect(buttonsOf(li).map((b) => b[0])).toEqual(["pill denounced-me", "link-alt denounced-notme", "link-alt"]);
    expect(buttonsOf(render({ via: ["github", "linkedin"] }))).toEqual([
      ["pill denounced-me", "C'est bien moi"],
      ["link-alt denounced-also", "Ou avec LinkedIn"],
      ["link-alt denounced-notme", "Ce n'est pas moi : faire la mienne"],
    ]);
  });

  it("sans connexion possible : « Ce n'est pas moi » devient le bouton rose, « C'est toi ? » se montre, la demande de retrait est dans le bloc", () => {
    const html = render({ via: [], removal: true, who: "Camille Ardent" }).replace(/\u00a0/g, " ");
    expect(html).toContain(">Quelqu'un a dénoncé Camille Ardent.</p>");
    expect(html.replace(/\u00a0/g, " ")).toContain('<h2 class="denounced-title" id="denounced-title">C\'est toi ?</h2>');
    expect(html.match(/pill-big/g)).toHaveLength(1);
    expect(html).toMatch(/class="pill pill-big">Ce n'est pas moi/);
    expect(html).toMatch(/<p class="removal"><button type="button" class="link-alt">C'est toi \? Demander le retrait de cette fiche<\/button><\/p><\/section>$/);
  });

  it("qui a déjà une autre fiche ici n'a pas « faire la mienne », et « C'est bien moi » reste le rose", () => {
    const html = render({ notMe: false });
    expect(html).not.toContain("faire la mienne");
    expect(buttonsOf(html)).toEqual([["pill denounced-me", "C'est bien moi"]]);
  });

  it("connexion LinkedIn éteinte : la fiche se refait depuis son lien, même bouton", () => {
    const html = render({ remake: true, removal: true, who: "Maxime Bernard" });
    expect(buttonsOf(html)[0]).toEqual(["pill denounced-me", "C'est bien moi"]);
    expect(page).toMatch(/useRemake\(wantedYou && !cardLogin && !liHere && main\.linkedinUrl \? main\.linkedinUrl : null/);
    expect(page).toMatch(/const lawyer = signIns\[0\]\?\.go \?\? remake\?\.go \?\? null;/);
  });

  it("dans la page : le bloc est le premier sous la fiche, avant le jury ; pas de second « C'est moi » dessous", () => {
    const col = page.slice(page.indexOf('<div className="visitor-col">'));
    expect(col.indexOf("<Denounced ")).toBeLessThan(col.indexOf("<Jury "));
    expect(page).toContain("{!wantedYou && <Claim ");
    // GitHub pour un pseudo, LinkedIn pour un profil (§18.118).
    expect(page).toContain("const claimHere = wantedYou && claimOn && cardLogin ? () => api.startClaim(id, cardLogin) : null;");
    expect(page).toContain("const liHere = wantedYou && liLogin && main.linkedinUrl ? () => startLinkedinLogin() : null;");
  });

  it("dans la page : la demande de retrait ne se répète pas en pied de colonne", () => {
    expect(page).toMatch(/\{!cardLogin && <RemovalRequest cardId=\{id\} short \/>\}/);
    expect(page).toMatch(/visitor && !cardLogin && !wantedYou && <RemovalRequest/);
  });
});
