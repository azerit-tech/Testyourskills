// La fiche de Jacques sur l'accueil (§18.35) : rendue en chaîne, sans navigateur.
import { readFileSync } from "node:fs";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../../../shared/fixtures";
import { Cover } from "../components/Cover";
import { Sunset } from "../components/Sunset";
import { SUNSET } from "../../../shared/sunset";
import { LangProvider } from "../i18n";
import type { Showcase } from "../lib/api";
import { MOCK_SHOWCASE_ID, mockApi } from "../lib/mock";
import { ExampleCard, ReturnCall } from "./Home";

const card = { ...FIXTURES.jmougeot, id: "Gh12345678", overall: 71 };
const COMPARED: Showcase = { card, href: "/c/Cmp1234567", pieces: ["linkedin", "github"] };

function render(el: ReactElement, language = "fr-FR"): string {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("navigator", { language });
  return renderToStaticMarkup(createElement(LangProvider, null, el));
}

/** Les liens de la légende, dans l'ordre. */
const captionLinks = (html: string) => [...(/<figcaption>(.*)<\/figcaption>/s.exec(html)?.[1] ?? "").matchAll(/<a ([^>]*)>(.*?)<\/a>/gs)].map((m) => ({ attrs: m[1]!, inner: m[2]! }));

afterEach(() => vi.unstubAllGlobals());

describe("la fiche de Jacques sous le titre", () => {
  it("jugée avec son LinkedIn : une note, celle de la fiche, et ses sources en texte après le seul lien de la légende (§18.36)", () => {
    const html = render(createElement(ExampleCard, COMPARED));
    const links = captionLinks(html);
    expect(links).toHaveLength(1);
    expect(links[0]!.attrs).toContain('href="/c/Cmp1234567"');
    // Une seule phrase : le lien, puis « d'après LinkedIn et GitHub », sans deuxième note.
    const caption = /<figcaption>(.*)<\/figcaption>/s.exec(html)![1]!;
    expect(caption.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'")).toBe("La vraie fiche de Jacques, fondateur d'Azerit, d'après LinkedIn et GitHub");
    expect(caption).not.toContain("<b");
    expect(caption).not.toContain("71");
  });

  it("en anglais", () => {
    const caption = /<figcaption>(.*)<\/figcaption>/s.exec(render(createElement(ExampleCard, COMPARED), "en-US"))![1]!;
    expect(caption.replace(/<[^>]+>/g, "")).toBe("The actual rap sheet of Jacques, founder of Azerit, based on LinkedIn and GitHub");
  });

  it("fiche GitHub seule, ou maquette : la légende seule", () => {
    for (const s of [{ card, href: "/c/Gh12345678" }, { card: FIXTURES.jmougeot, href: "/jmougeot" }]) {
      const links = captionLinks(render(createElement(ExampleCard, s)));
      expect(links).toHaveLength(1);
      expect(links[0]!.attrs).toContain(`href="${s.href}"`);
    }
  });

  it("la case du fondateur sur la couverture mène au même endroit", () => {
    const html = render(createElement(Cover, { onPlay: () => undefined, top: null, founder: COMPARED, suspects: [] }));
    expect(html).toMatch(/<a[^>]*class="cover-panel cover-founder[^"]*"[^>]*href="\/c\/Cmp1234567"/);
  });
});

describe("la scène du premier écran (§18.81)", () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
  const home = read("./Home.tsx");
  const css = read("../styles.css");

  it("la fiche d'exemple est dans le héros, après le formulaire, sur le crépuscule ; plus de couverture", () => {
    expect(home).not.toContain("<Cover");
    const top = home.slice(home.indexOf('<div className="home-top">'), home.indexOf('<div className="home-proof">'));
    expect(top.indexOf("<EntryForm inputRef")).toBeGreaterThan(0);
    expect(top).toMatch(/<\/section>\n[^\n]*§18\.81[^\n]*\n\s*<div className="home-stage">\n\s*<div className="home-stage-in">\n\s*<Sunset \/>\n\s*<ExampleCard \{\.\.\.showcase\} \/>/);
    expect(home.match(/<ExampleCard /g)).toHaveLength(1);
  });

  it("le décor de l'aperçu de lien, en aplats, caché des lecteurs d'écran", () => {
    const html = render(createElement(Sunset));
    expect(html).toMatch(/^<div class="sunset" style="[^"]*" aria-hidden="true">/);
    for (const tint of [SUNSET.sky, SUNSET.sun, SUNSET.ground]) expect(html).toContain(tint);
    // les deux rangées d'immeubles de l'image, les fenêtres allumées sur la plus proche
    expect(html).toContain(`fill="${SUNSET.far}"`);
    expect(html).toContain(`fill="${SUNSET.near}"`);
    expect(html).toContain(`fill="${SUNSET.window}"`);
    expect(html).not.toMatch(/gradient/i);
  });

  it("à droite du héros au bureau, de bord à bord sur téléphone ; la fiche donne la mesure", () => {
    expect(css).toMatch(/\.home-stage \{[^}]*margin: 8px calc\(-1 \* var\(--gutter\)\) 0;[^}]*container-type: inline-size;/);
    expect(css).toMatch(/@media \(min-width: 900px\) \{\s*\.home-stage \{\s*grid-column: 2;\s*grid-row: 1;\s*margin: 0;/);
    expect(css).toMatch(/\.home-stage \.showcase \{[^}]*width: var\(--stage-card\);/);
    expect(css).not.toMatch(/\.sunset[^{]*\{[^}]*gradient/);
  });
});

describe("l'accueil de qui a déjà sa fiche (§18.52)", () => {
  const mine = { id: "Card000001", login: "kevin-dev42", overall: 68 };
  it("« Voir ma fiche » en rose vers elle, puis « Faire une autre fiche » en lien", () => {
    const html = render(createElement(ReturnCall, { mine, onAnother: () => undefined }));
    expect(html).toMatch(/<a class="pill pill-big home-see" href="\/c\/Card000001">Voir ma fiche<\/a>/);
    expect(html).toMatch(/<button type="button" class="link-alt home-another"[^>]*>Faire une autre fiche<\/button>/);
    expect(html).toContain("68/100.");
    expect(html.indexOf("Voir ma fiche")).toBeLessThan(html.indexOf("Faire une autre fiche"));
  });

  it("en anglais", () => {
    const html = render(createElement(ReturnCall, { mine, onAnother: () => undefined }), "en-US");
    expect(html).toContain(">See my sheet<");
    expect(html).toContain(">Make another sheet<");
  });
});

describe("démo (?mock=1)", () => {
  it("la vitrine montre ses deux pièces et mène à un dossier LinkedIn de démo", async () => {
    const s = await mockApi.getShowcase();
    expect(s).toEqual({ card: FIXTURES.jmougeot, href: `/c/${MOCK_SHOWCASE_ID}`, pieces: ["linkedin", "github"] });
    const job = await mockApi.getJob(MOCK_SHOWCASE_ID);
    expect(job).toMatchObject({ state: "done", kind: "comparison", comparison: { declaredSource: "linkedin" } });
  });
});
