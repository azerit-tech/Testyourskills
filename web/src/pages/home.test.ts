// La fiche de Jacques sur l'accueil (§18.35) : rendue en chaîne, sans navigateur.
import { readFileSync } from "node:fs";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../../../shared/fixtures";
import { Sunset } from "../components/Sunset";
import { SUNSET } from "../../../shared/sunset";
import { LangProvider } from "../i18n";
import type { Showcase } from "../lib/api";
import { MOCK_SHOWCASE_ID, mockApi } from "../lib/mock";
import { ExampleCard, MineCard } from "./Home";

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
});

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("la scène du premier écran (§18.81)", () => {
  const home = read("./Home.tsx");
  const css = read("../styles.css");

  it("la fiche d'exemple est dans le héros, après le formulaire, sur le crépuscule ; plus de couverture", () => {
    expect(home).not.toMatch(/<Cover|components\/Cover/);
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

describe("l'accueil de qui a déjà sa fiche (§18.89)", () => {
  const mine = { id: "Card000001", login: "kevin-dev42", overall: 68 };
  const own = { ...FIXTURES.bronze, id: mine.id, overall: 68 };
  const count = (html: string, needle: string) => html.split(needle).length - 1;

  it("sa fiche debout sur le crépuscule, tout entière un lien vers sa page, et un seul bouton rose dessous", () => {
    const html = render(createElement(MineCard, { mine, card: own }));
    expect(html).toMatch(/^<div class="home-stage"><div class="home-stage-in"><div class="sunset"/);
    expect(html).toMatch(/<a class="home-mine-link" href="\/c\/Card000001" aria-label="Voir ma fiche, Fiche [^"]+">/);
    // la fiche elle-même, pas une vignette : le composant de la page d'une fiche
    expect(count(html, "tys-card__svg")).toBe(1);
    expect(html).toContain("KEVIN-DEV42");
    expect(html).toMatch(/<a class="pill pill-big home-see" href="\/c\/Card000001">Voir ma fiche<\/a>/);
    expect(count(html, "pill-big")).toBe(1);
    expect(html.indexOf("tys-card__svg")).toBeLessThan(html.indexOf("home-see"));
    // ni légende, ni phrase, ni formulaire
    expect(html).not.toContain("<figcaption");
    expect(html).not.toContain("Faire une autre fiche");
    expect(html).not.toContain("home-back");
  });

  it("la fiche pas encore lue : son cadre à sa taille, le bouton déjà là", () => {
    const html = render(createElement(MineCard, { mine, card: undefined }));
    expect(html).toContain('<span class="home-mine-wait"></span>');
    expect(html).not.toContain("tys-card");
    expect(html).toMatch(/<a class="pill pill-big home-see" href="\/c\/Card000001">Voir ma fiche<\/a>/);
    expect(read("../styles.css")).toMatch(/\.home-mine-wait \{[^}]*aspect-ratio: 360 \/ 520;/);
  });

  it("la fiche illisible (réseau) : la ligne de sa note, et le bouton", () => {
    const html = render(createElement(MineCard, { mine, card: null }));
    expect(html).not.toContain("home-stage");
    expect(html).toContain("68/100.");
    expect(html).toMatch(/<a class="pill pill-big home-see" href="\/c\/Card000001">Voir ma fiche<\/a>/);
  });

  it("en anglais", () => {
    const html = render(createElement(MineCard, { mine, card: own }), "en-US");
    expect(html).toContain(">See my sheet<");
  });

  it("la page : sa fiche, le top de la semaine, les primes ouvertes, les bandes, puis « Faire une autre fiche » ; rien d'autre", () => {
    const home = read("./Home.tsx");
    const page = home.slice(home.indexOf("if (mineHome && mem.mine) {"), home.indexOf('<main className="page page-home" id="main">'));
    const order = ["<MineCard ", "<WeekBoard ", "<PrimesStrip />", "<BandsTop onPlay={play} cardId={mem.mine.id} />", "h.back.another"].map((x) => page.indexOf(x));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // le formulaire ne s'ouvre qu'à la demande, à la place du lien ; connecté (§18.91), « Se déconnecter » à côté
    expect(page).toMatch(/\{open \? \(\s*<EntryForm inputRef=\{inputRef\} another \/>\s*\) : acct \? \([\s\S]*?h\.account\.out[\s\S]*?\) : \(\s*<button type="button" className="link-alt home-another"/);
    // les bandes : les deux classements du §18.92 (BandsTop), et non le bloc d'avant (HomeBands)
    for (const gone of ["hero-title", "hero-hook", "<ExampleCard", "<Spin", "<ProfileWall", "<HomeBands", "home-last", "<BackLine"]) expect(page).not.toContain(gone);
    // un préremplissage (« Réessayer », /<pseudo>), une dénonciation, un film à voir ou un dossier en cours gardent l'accueil du formulaire
    expect(home).toMatch(/const returning = !!mem\.mine && !owed && !mem\.pending;/);
    expect(home).toMatch(/const mineHome = returning && !denounce && !fromPrefill && !returnBack;/);
  });

  it("téléphone : une colonne ; bureau : la scène à gauche, les classements à droite", () => {
    const css = read("../styles.css");
    expect(css).toMatch(/\.home-mine \{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
    expect(css).toMatch(/@media \(min-width: 900px\) \{\s*\.home-mine \{\s*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/);
    expect(css).toMatch(/\.home-mine > \.board,\s*\.home-mine > \.leagues \{\s*grid-column: 2;/);
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
