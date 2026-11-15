// La fiche de Jacques sur l'accueil (§18.35) : rendue en chaîne, sans navigateur.
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../../../shared/fixtures";
import { Cover } from "../components/Cover";
import { LangProvider } from "../i18n";
import type { Showcase } from "../lib/api";
import { MOCK_SHOWCASE_ID, mockApi } from "../lib/mock";
import { ExampleCard } from "./Home";

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

describe("démo (?mock=1)", () => {
  it("la vitrine montre ses deux pièces et mène à un dossier LinkedIn de démo", async () => {
    const s = await mockApi.getShowcase();
    expect(s).toEqual({ card: FIXTURES.jmougeot, href: `/c/${MOCK_SHOWCASE_ID}`, pieces: ["linkedin", "github"] });
    const job = await mockApi.getJob(MOCK_SHOWCASE_ID);
    expect(job).toMatchObject({ state: "done", kind: "comparison", comparison: { declaredSource: "linkedin" } });
  });
});
