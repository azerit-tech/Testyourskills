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
  it("jugée avec son LinkedIn : une note, celle de la fiche, et ses pièces sous la légende, vers le dossier (§18.36)", () => {
    const html = render(createElement(ExampleCard, COMPARED));
    const links = captionLinks(html);
    expect(links).toHaveLength(2);
    for (const l of links) expect(l.attrs).toContain('href="/c/Cmp1234567"');
    const pieces = links[1]!;
    expect(pieces.attrs).toContain('class="showcase-scores"');
    expect(pieces.inner).toBe("Pièces au dossier\u00a0: LinkedIn · GitHub");
    // Plus de deuxième note sous la fiche.
    const caption = /<figcaption>(.*)<\/figcaption>/s.exec(html)![1]!;
    expect(caption).not.toContain("<b");
    expect(caption).not.toContain("71");
  });

  it("en anglais", () => {
    const links = captionLinks(render(createElement(ExampleCard, COMPARED), "en-US"));
    expect(links[1]!.inner).toBe("Exhibits on file: LinkedIn · GitHub");
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
