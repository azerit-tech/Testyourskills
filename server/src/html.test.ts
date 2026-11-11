// Aperçus de lien d'une comparaison : lus par qui n'a pas fait la fiche, donc à la troisième personne.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURE_COMPARISON, FIXTURES } from "../../shared/fixtures";
import { publicView } from "../../shared/publicView";
import { HOME_PROMISE, homeTitle, promiseTitle } from "../../shared/promise";
import type { CardData, ComparisonData, Grid } from "../../shared/types";
import { genericMeta, homeImageAlt, injectHomeImage, metaFor } from "./html";

/** Une comparaison où la fiche déclarative a `cv` points et la fiche GitHub `gh`. */
function cmp(cv: number, gh: number, over: Partial<ComparisonData> = {}): ComparisonData {
  return {
    ...FIXTURE_COMPARISON,
    cv: { ...FIXTURE_COMPARISON.cv, overall: cv, lang: "fr" },
    github: { ...FIXTURE_COMPARISON.github, overall: gh, login: "lea" },
    headline: { fr: "(titre rangé, jamais relu)", en: "(stored headline, never read)" },
    ...over,
  };
}

/** La fiche GitHub en « dossier vide » (note plancher de la grille). */
function emptyGh(c: ComparisonData): ComparisonData {
  return { ...c, github: { ...c.github, grid: { criteria: [], overall: c.github.overall, rule: "empty_file" } } };
}

describe("aperçu de lien d'une comparaison", () => {
  it("LinkedIn devant : « Le LinkedIn de @lea annonce 21 points que son code public ne montre pas encore »", () => {
    expect(metaFor(cmp(80, 59, { declaredSource: "linkedin" }), "https://s.test").title).toBe("Le LinkedIn de @lea annonce 21 points que son code public ne montre pas encore");
  });

  it("le code devant : « Le code de @lea en montre plus que son CV : 12 points »", () => {
    expect(metaFor(cmp(60, 72), "https://s.test").title).toBe("Le code de @lea en montre plus que son CV : 12 points");
  });

  it("en anglais, et au singulier", () => {
    const en = (c: ComparisonData) => ({ ...c, cv: { ...c.cv, lang: "en" as const } });
    expect(metaFor(en(cmp(80, 59, { declaredSource: "linkedin" })), "https://s.test").title).toBe("@lea's LinkedIn claims 21 points their public code doesn't show yet");
    expect(metaFor(en(cmp(60, 61)), "https://s.test").title).toBe("@lea's code shows more than their CV: 1 point");
  });

  it("sans pseudo, le nom ; à égalité, les deux pièces d'accord ; jamais le titre rangé", () => {
    const anon = cmp(60, 72);
    anon.github = { ...anon.github, login: undefined };
    expect(metaFor(anon, "https://s.test").title).toBe(`Le code de ${anon.github.name} en montre plus que son CV : 12 points`);
    expect(metaFor(cmp(70, 70), "https://s.test").title).toBe("Le CV et le code de @lea sont d'accord");
  });

  it("jamais un mot qui accuse : ni vol, ni suspect, ni « contre »", () => {
    for (const c of [cmp(80, 59), cmp(60, 72), cmp(70, 70), cmp(80, 59, { declaredSource: "linkedin" })])
      for (const lang of ["fr", "en"] as const) {
        const m = metaFor({ ...c, cv: { ...c.cv, lang } }, "https://s.test");
        expect(`${m.title} ${m.description}`).not.toMatch(/\bvol|stole|suspect|butin|loot|\bcontre\b|\bvs\b|against/i);
      }
  });

  it("ne tutoie jamais le lecteur", () => {
    for (const c of [cmp(80, 59), cmp(60, 72), cmp(80, 59, { declaredSource: "linkedin" }), emptyGh(cmp(45, 20, { declaredSource: "linkedin" }))])
      expect(metaFor(c, "https://s.test").title).not.toMatch(/\bton\b|\bTon\b/);
  });

  it("face à un GitHub vide : le code reste à prouver, sans chiffre ni vol", () => {
    const fr = metaFor(emptyGh(cmp(45, 20, { declaredSource: "linkedin" })), "https://s.test").title;
    expect(fr).toBe("Le code de @lea reste à prouver : son LinkedIn parle seul");
    const en = emptyGh(cmp(45, 20));
    en.cv = { ...en.cv, lang: "en" };
    expect(metaFor(en, "https://s.test").title).toBe("@lea's code is still unproven: their CV does all the talking");
    for (const t of [fr, metaFor(en, "https://s.test").title]) expect(t).not.toMatch(/\d|\bvol|stole/);
  });
});

describe("dossier vide fait par un tiers, non revendiqué : l'aperçu ne dit pas la note", () => {
  const empty: Grid = { criteria: [{ code: "CODE", score: null, state: "unproven", counted: false, source: "github", reached: { fr: "", en: "" }, flags: [] }], overall: 20, rule: "empty_file" };
  const card: CardData = { ...FIXTURES.gold, login: "camroux", overall: 20, grid: empty };
  const NOTE = /\b20\b|★|☆/;

  it("une fiche : ni la note, ni les étoiles, ni l'image ; le profil reste", () => {
    for (const lang of ["fr", "en"] as const) {
      const m = metaFor(publicView({ ...card, lang }, { thirdParty: true }), "https://s.test");
      expect(`${m.title} ${m.description} ${m.imageAlt}`).not.toMatch(NOTE);
      expect(m.image).toBeUndefined();
      expect(m.title).toContain("@camroux");
    }
    // Revendiquée, ou faite par la personne : la note revient.
    expect(metaFor(publicView(card, { thirdParty: false }), "https://s.test").title).toMatch(/★/);
  });

  it("une comparaison face à ce dossier vide : le code reste à prouver, aucun chiffre côté GitHub", () => {
    const c = cmp(45, 20, { declaredSource: "linkedin" });
    c.github = { ...c.github, grid: empty };
    const m = metaFor(publicView(c, { thirdParty: true }), "https://s.test");
    expect(m.title).toBe("Le code de @lea reste à prouver : son LinkedIn parle seul");
    expect(m.description).toContain("GitHub : code à prouver.");
    expect(m.description).not.toMatch(/GitHub : Fiche|\b20\b/);
    expect(m.image).toBeUndefined();
  });
});

describe("aperçu de lien d'une comparaison notée (§18.37)", () => {
  const graded = (c: ComparisonData): ComparisonData => ({ ...c, grid: { criteria: [{ code: "CODE", score: 6, state: "scored", counted: true, source: "github", reached: { fr: "", en: "" }, flags: [] }], overall: 57 } });

  it("la note du dossier et ses étoiles en titre, la phrase en tête de la description", () => {
    const m = metaFor(graded(cmp(60, 72)), "https://s.test");
    expect(m.title).toBe("Le dossier de @lea : ★★★☆☆☆, 57");
    expect(m.description.startsWith("Le code de @lea en montre plus que son CV : 12 points. CV : Fiche")).toBe(true);
    const en = graded(cmp(60, 72));
    en.cv = { ...en.cv, lang: "en" };
    expect(metaFor(en, "https://s.test").title).toBe("@lea's file: ★★★☆☆☆, 57");
  });

  it("sans grille (comparaison d'avant, ou fiche dénoncée non revendiquée) : la phrase en titre", () => {
    expect(metaFor(cmp(60, 72), "https://s.test").title).toBe("Le code de @lea en montre plus que son CV : 12 points");
  });
});

describe("le titre de l'accueil, en un seul endroit (shared/promise.ts)", () => {
  const INDEX = readFileSync(join(__dirname, "../../web/index.html"), "utf8");

  it("web/index.html, la seule copie à la main, porte le même titre, la même description et le même texte d'image", () => {
    expect(INDEX).toContain(`<title>${homeTitle("fr")}</title>`);
    expect(INDEX).toContain(`<meta property="og:title" content="${homeTitle("fr")}" />`);
    expect(INDEX.match(new RegExp(`content="${HOME_PROMISE.fr.description}"`, "g"))).toHaveLength(2);
    expect(INDEX).toContain(`<meta property="og:image:alt" content="${homeImageAlt("fr")}" />`);
  });

  it("les balises des pages sans fiche et le texte de l'image de l'accueil viennent de la même source", () => {
    for (const lang of ["fr", "en"] as const) {
      const m = genericMeta("https://s.test", "/", lang);
      expect(m.title).toBe(`Testyourskills · ${promiseTitle(lang)}`);
      expect(m.description).toBe(HOME_PROMISE[lang].description);
    }
    expect(promiseTitle("fr")).toBe("Azerit ouvre ton dossier. Tu plaides quoi ?");
    expect(promiseTitle("en")).toBe("Azerit opens your file. How do you plead?");
    expect(injectHomeImage("<html><head></head></html>", "https://s.test")).toContain(`content="${homeImageAlt()}"`);
  });

  it("la description dit la méthode, sans opposer le profil et le code", () => {
    for (const lang of ["fr", "en"] as const) expect(`${promiseTitle(lang)} ${HOME_PROMISE[lang].description}`).not.toMatch(/\bcontre\b|\bvs\b|against|IA t'interroge|\bAI\b/i);
  });
});
