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
const COMPARED: Showcase = { card, href: "/c/Cmp1234567", declared: { source: "linkedin", overall: 55 } };

function render(el: ReactElement, language = "fr-FR"): string {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("navigator", { language });
  return renderToStaticMarkup(createElement(LangProvider, null, el));
}

/** Les liens de la légende, dans l'ordre. */
const captionLinks = (html: string) => [...(/<figcaption>(.*)<\/figcaption>/s.exec(html)?.[1] ?? "").matchAll(/<a ([^>]*)>(.*?)<\/a>/gs)].map((m) => ({ attrs: m[1]!, inner: m[2]! }));

afterEach(() => vi.unstubAllGlobals());

describe("la fiche de Jacques sous le titre", () => {
  it("jugée avec son LinkedIn : les deux notes sous la légende, vers la comparaison", () => {
    const links = captionLinks(render(createElement(ExampleCard, COMPARED)));
    expect(links).toHaveLength(2);
    for (const l of links) expect(l.attrs).toContain('href="/c/Cmp1234567"');
    const scores = links[1]!;
    expect(scores.attrs).toContain('class="showcase-scores"');
    expect(scores.attrs).toContain('aria-label="LinkedIn : 55 sur 100. GitHub : 71 sur 100."');
    expect(scores.inner.replace(/<[^>]+>/g, "")).toBe("LinkedIn 55 · GitHub 71");
    expect(scores.inner).toContain('<b class="is-linkedin">55</b>');
    expect(scores.inner).toContain('<b class="is-github">71</b>');
  });

  it("en anglais, le même libellé lu en entier", () => {
    const links = captionLinks(render(createElement(ExampleCard, COMPARED), "en-US"));
    expect(links[1]!.attrs).toContain('aria-label="LinkedIn: 55 out of 100. GitHub: 71 out of 100."');
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
  it("la vitrine montre ses deux notes et mène à une comparaison LinkedIn de démo", async () => {
    const s = await mockApi.getShowcase();
    expect(s).toEqual({ card: FIXTURES.jmougeot, href: `/c/${MOCK_SHOWCASE_ID}`, declared: { source: "linkedin", overall: 55 } });
    const job = await mockApi.getJob(MOCK_SHOWCASE_ID);
    expect(job).toMatchObject({ state: "done", kind: "comparison", comparison: { declaredSource: "linkedin" } });
  });
});
