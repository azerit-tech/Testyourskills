// La fiche : hiérarchie et textes. La phrase du profil est la blague qu'on
// capture : elle tient en deux lignes au plus, jamais coupée, pour les 13
// profils dans les deux langues.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import profilesJson from "../../data/profiles.json";
import { FIXTURES } from "../fixtures";
import type { CardData, Lang } from "../types";
import { CardGraphic, LAYOUT, profileTagline } from "./Card";
import { measure, upper } from "./text";
import { THEMES } from "./themes";

const LANGS: Lang[] = ["fr", "en"];
const FW = 360 - 18 - 20;

function render(card: CardData, lang: Lang): string {
  return renderToStaticMarkup(createElement(CardGraphic, { card, lang, avatarHref: "" }));
}

describe("phrase du profil", () => {
  for (const p of profilesJson.profiles) {
    for (const lang of LANGS) {
      it(`${p.id} (${lang}) tient en deux lignes, sans coupe`, () => {
        const text = p.tagline[lang];
        const f = profileTagline(text);
        expect(f.truncated).toBe(false);
        expect(f.lines.length).toBeLessThanOrEqual(2);
        expect(f.lines.join(" ")).toBe(text.replace(/[ \t\n]+/g, " "));
        for (const line of f.lines) {
          expect(measure(line, "sans-600", f.size)).toBeLessThanOrEqual(FW);
          expect(line).not.toMatch(/^[:;!?»]/);
        }
        // Deuxième texte le plus lisible après la note et le nom du profil.
        expect(f.size).toBeGreaterThanOrEqual(LAYOUT.tagline.minSize);
        expect(f.size).toBeGreaterThan(LAYOUT.charges.size);
      });
    }
  }

  it("le nom de chaque profil tient sur une ligne, sans coupe", () => {
    for (const p of profilesJson.profiles) {
      for (const lang of LANGS) {
        const name = upper(p.label[lang], lang);
        expect(measure(name, "display-700", LAYOUT.profileName.minSize)).toBeLessThanOrEqual(FW);
      }
    }
  });

  it("chaque fixture rend sa phrase entière, en français et en anglais", () => {
    for (const card of Object.values(FIXTURES) as CardData[]) {
      for (const lang of LANGS) {
        const svg = render(card, lang);
        if (!card.profile) continue;
        const words = card.profile.tagline[lang].split(/[ \t\n]+/);
        for (const w of words) expect(svg).toContain(w.replace(/&/g, "&amp;").replace(/'/g, "&#x27;"));
      }
    }
  });
});

describe("horizon des petites notes", () => {
  it("★ à ★★★★ ont un horizon ton sur ton qui grandit avec le niveau ; les ciels peints n'en ont pas", () => {
    const low = (["s1", "s2", "s3", "s4"] as const).map((k) => THEMES[k].horizon!);
    for (const h of low) expect(h).toBeTruthy();
    for (let i = 1; i < low.length; i++) {
      expect(low[i].scale).toBeGreaterThanOrEqual(low[i - 1].scale);
      expect(low[i].palms).toBeGreaterThanOrEqual(low[i - 1].palms);
    }
    expect(THEMES.s5.horizon).toBeUndefined();
    expect(THEMES.s6.horizon).toBeUndefined();
  });

  it("la silhouette est une teinte voisine du fond, jamais noire", () => {
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    };
    for (const th of Object.values(THEMES)) {
      if (!th.horizon) continue;
      const d = lum(th.horizon.color) - lum(th.bg[0]);
      expect(Math.abs(d)).toBeLessThan(20);
      expect(lum(th.horizon.color)).toBeGreaterThan(30);
    }
  });
});

describe("cotes de la fiche", () => {
  it("les blocs se suivent de haut en bas sans se chevaucher", () => {
    const L = LAYOUT;
    const taglineBottom = L.tagline.y + L.tagline.lineH + 5;
    expect(L.profileName.y + 4).toBeLessThan(L.tagline.y - L.tagline.size * 0.75);
    expect(taglineBottom).toBeLessThan(L.divider);
    expect(L.divider).toBeLessThan(L.facts.labelY - L.facts.labelSize);
    expect(L.facts.valueY + 4).toBeLessThan(L.stats.y + 5);
    expect(L.stats.y + 2 * L.stats.rowH + 16).toBeLessThan(L.charges.labelY - L.charges.labelSize);
    expect(L.charges.y + 2 * L.charges.lineH + 4).toBeLessThan(L.footer.y - L.footer.size);
    expect(L.footer.y).toBeLessThan(520 - 6);
  });
});
