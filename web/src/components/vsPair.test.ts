// Le face-à-face reçu (§18.115) : la ligne au-dessus des deux fiches, les deux fiches, « VS ».
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../../../shared/fixtures";
import type { CardData } from "../../../shared/types";
import { DICTS, LangProvider } from "../i18n";
import { VsPair, vsLine } from "./VsPair";

const sender: CardData = { ...FIXTURES.gold, id: "SenderCard1", login: "leamd", overall: 79 };
const page: CardData = { ...FIXTURES.gold, id: "PageCard001", login: "camroux", overall: 80 };

afterEach(() => vi.unstubAllGlobals());

function render(node: ReturnType<typeof createElement>) {
  vi.stubGlobal("window", {
    location: { origin: "https://skills.test", pathname: "/c/PageCard001", search: "" },
    matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("navigator", { userAgent: "test", language: "fr-FR" });
  vi.stubGlobal("document", { documentElement: { dataset: {} }, querySelector: () => null, querySelectorAll: () => [] });
  return renderToStaticMarkup(createElement(LangProvider, null, node)).replace(/&#x27;/g, "'");
}

describe("le face-à-face reçu (§18.115)", () => {
  it("la ligne : les deux notes, l'écart, pour qui ; les étoiles d'abord ; l'égalité ; un dossier scellé invite", () => {
    const fr = DICTS.fr;
    expect(vsLine(fr, sender, page).replace(/\s/g, " ")).toBe("79 % contre 80 % : 1 point d'avance pour @camroux");
    expect(vsLine(fr, { ...sender, overall: 95 }, page).replace(/\s/g, " ")).toBe("95 % contre 80 % : une étoile d'avance pour @leamd");
    expect(vsLine(fr, page, page).replace(/\s/g, " ")).toBe("80 % contre 80 % : égalité");
    expect(vsLine(fr, sender, { ...page, sealed: true })).toBe("Fais mieux que @leamd ?");
    expect(vsLine(DICTS.en, sender, page)).toBe("79% vs 80%: @camroux is 1 point ahead");
  });

  it("deux fiches, « VS » entre elles, chacune s'ouvre en grand", () => {
    const html = render(createElement(VsPair, { sender, card: page }));
    expect(html.match(/class="vs-card"/g)).toHaveLength(2);
    expect(html).toContain(">VS</span>");
    expect(html).toContain("Voir la fiche de @leamd en grand");
    expect(html).toContain("Voir la fiche de @camroux en grand");
    expect(html).toContain("1 point d'avance pour @camroux");
  });

  it("pendant la lecture de la fiche de qui envoie : sa place est gardée", () => {
    const html = render(createElement(VsPair, { sender: "loading", card: page }));
    expect(html).toContain("vs-card vs-card-wait");
    expect(html.match(/class="vs-card"/g)).toHaveLength(1);
  });
});
