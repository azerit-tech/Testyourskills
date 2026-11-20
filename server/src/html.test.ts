// Aperçus de lien d'une comparaison : lus par qui n'a pas fait la fiche, donc à la troisième personne.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURE_COMPARISON, FIXTURES } from "../../shared/fixtures";
import { fileOf } from "../../shared/caseFile";
import { IMAGE_QUERY } from "../../shared/images";
import { publicView } from "../../shared/publicView";
import { HOME_PROMISE, heroTitleEm, homeTitle, pageTitle, promiseSentence, promiseTitle } from "../../shared/promise";
import { measure, upper } from "../../shared/card/text";
import { frTypo } from "../../shared/typo";
import type { CardData, ComparisonData, Grid } from "../../shared/types";
import { genericMeta, homeImageAlt, injectHomeImage, metaFor, requestLang, staticPageMeta } from "./html";

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

describe("aperçu de lien d'un dossier à deux pièces (§18.36) : l'aperçu d'une fiche, une note", () => {
  const VERSUS = /sous-vend|annonce \d|en montre plus|undersell|claims \d|shows more|d'accord|\bécart|points? (que|between)/i;

  it("le titre et l'image de la fiche du dossier ; la description dit ses deux pièces, aucune autre note", () => {
    const c = cmp(60, 72);
    const file = fileOf(c);
    const m = metaFor(c, "https://s.test");
    const alone = metaFor({ ...file, lang: "fr" }, "https://s.test");
    expect(m.title).toBe(alone.title);
    expect(m.title).toMatch(/^@lea est dans le viseur ★/);
    expect(m.image).toBe(`https://s.test/og/${c.id}.png?${IMAGE_QUERY}`);
    expect(m.description).toContain("Sources\u00a0: CV et GitHub.");
    expect(`${m.title} ${m.description} ${m.imageAlt}`).not.toMatch(/\b60\b/);
    expect(`${m.title} ${m.description}`).not.toMatch(VERSUS);
  });

  it("LinkedIn, en anglais", () => {
    const c = cmp(80, 59, { declaredSource: "linkedin" });
    const m = metaFor({ ...c, cv: { ...c.cv, lang: "en" } }, "https://s.test");
    expect(m.title).toMatch(/^@lea is in the crosshairs ★/);
    expect(m.description).toContain("Sources: LinkedIn and GitHub.");
    expect(`${m.title} ${m.description}`).not.toMatch(VERSUS);
  });

  it("noté (§18.37) : la note et les étoiles du dossier, pas celles d'une pièce", () => {
    const graded: ComparisonData = { ...cmp(60, 72), grid: { criteria: [{ code: "CODE", score: 6, state: "scored", counted: true, source: "github", reached: { fr: "", en: "" }, flags: [] }], overall: 57 } };
    const m = metaFor(graded, "https://s.test");
    expect(m.title).toContain("★★★☆☆☆");
    expect(m.imageAlt).toContain("57");
    expect(`${m.title} ${m.description} ${m.imageAlt}`).not.toMatch(/\b(60|72)\b/);
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

  it("face à un GitHub vide : la fiche du dossier est celle du LinkedIn, sa note, rien côté GitHub", () => {
    const m = metaFor(emptyGh(cmp(45, 20, { declaredSource: "linkedin" })), "https://s.test");
    expect(m.title).toMatch(/^@lea est dans le viseur ★/);
    expect(m.imageAlt).toContain("45");
    expect(`${m.title} ${m.description} ${m.imageAlt}`).not.toMatch(/\b20\b/);
  });
});

describe("dossier vide fait par un tiers, non revendiqué : l'aperçu ne dit pas la note", () => {
  const empty: Grid = { criteria: [{ code: "CODE", score: null, state: "unproven", counted: false, source: "github", reached: { fr: "", en: "" }, flags: [] }], overall: 20, rule: "empty_file" };
  const card: CardData = { ...FIXTURES.gold, login: "camroux", overall: 20, grid: empty };
  const NOTE = /\b20\b|★|☆/;

  it("une fiche : ni la note, ni les étoiles ; l'image est celle de la fiche scellée ; le profil reste", () => {
    for (const lang of ["fr", "en"] as const) {
      const m = metaFor(publicView({ ...card, lang }, { thirdParty: true }), "https://s.test");
      expect(`${m.title} ${m.description} ${m.imageAlt}`).not.toMatch(NOTE);
      // La fiche scellée ne porte pas la note : son image revient dans l'aperçu.
      expect(m.image).toBe(`https://s.test/og/${card.id}.png?${IMAGE_QUERY}`);
      expect(m.title).toContain("@camroux");
    }
    // Revendiquée, ou faite par la personne : la note revient.
    expect(metaFor(publicView(card, { thirdParty: false }), "https://s.test").title).toMatch(/★/);
  });

  it("un dossier à deux pièces face à un GitHub vide garde la note de son LinkedIn, aucun chiffre côté GitHub", () => {
    const c = cmp(45, 20, { declaredSource: "linkedin" });
    c.github = { ...c.github, grid: empty };
    const m = metaFor(publicView(c, { thirdParty: true }), "https://s.test");
    expect(m.title).toMatch(/★/);
    expect(m.description).toContain("Sources\u00a0: LinkedIn et GitHub.");
    expect(`${m.title} ${m.description} ${m.imageAlt}`).not.toMatch(/\b20\b/);
    expect(m.image).toBeDefined();
  });

  it("un dossier vide (sa propre grille en dossier vide) : scellé, ni note ni étoiles, l'image scellée", () => {
    const c: ComparisonData = { ...cmp(20, 20, { declaredSource: "linkedin" }), grid: empty };
    c.github = { ...c.github, grid: empty };
    for (const lang of ["fr", "en"] as const) {
      const m = metaFor(publicView({ ...c, cv: { ...c.cv, lang } }, { thirdParty: true }), "https://s.test");
      expect(`${m.title} ${m.description} ${m.imageAlt}`).not.toMatch(NOTE);
      expect(m.image).toBe(`https://s.test/og/${c.id}.png?${IMAGE_QUERY}`);
    }
  });
});

describe("la langue des balises d'une page sans fiche", () => {
  it("`?lang=` d'abord, puis la première langue du navigateur ; un robot qui ne dit rien lit le français", () => {
    expect(requestLang("en", "fr-FR,fr;q=0.9")).toBe("en");
    expect(requestLang("fr", "en-US")).toBe("fr");
    expect(requestLang(undefined, "en-US,en;q=0.9,fr;q=0.8")).toBe("en");
    expect(requestLang(undefined, "fr-CA,en;q=0.8")).toBe("fr");
    expect(requestLang("de", "de-DE")).toBe("en");
    expect(requestLang(undefined, undefined)).toBe("fr");
    expect(requestLang(null, "")).toBe("fr");
  });

  it("la vie privée et le règlement ont leur titre, « sujet · Azerit » ; toute autre adresse garde l'accueil", () => {
    expect(staticPageMeta("https://s.test", "/confidentialite", "en")).toMatchObject({ lang: "fr", title: "Vie privée · Azerit", url: "https://s.test/confidentialite" });
    expect(staticPageMeta("https://s.test", "/privacy", "fr")).toMatchObject({ lang: "en", title: "Privacy · Azerit" });
    expect(staticPageMeta("https://s.test", "/reglement", "fr")?.title).toBe("Règlement de la saison · Azerit");
    expect(staticPageMeta("https://s.test", "/reglement/", "en")?.title).toBe("Season rules · Azerit");
    expect(staticPageMeta("https://s.test", "/", "fr")).toBeNull();
    expect(staticPageMeta("https://s.test", "/nimporte", "en")).toBeNull();
  });
});

describe("l'aperçu d'une fiche : la note avec son échelle, sans chaîne de points médians", () => {
  it("« Fiche ★★★★★☆, 79/100 » ; le titre sépare le profil par une virgule", () => {
    for (const lang of ["fr", "en"] as const) {
      const m = metaFor({ ...FIXTURES.gold, lang }, "https://s.test");
      expect(m.imageAlt).toContain(`${FIXTURES.gold.overall}/100`);
      expect(m.title).not.toContain("·");
      expect(m.title).toContain(`, ${FIXTURES.gold.profile!.label[lang]}`);
      expect(`${m.title} ${m.description} ${m.imageAlt}`).not.toMatch(/Testyourskills|Make yours|\bgrid\b|\bproof\b/);
    }
    expect(metaFor({ ...FIXTURES.gold, lang: "en" }, "https://s.test").imageAlt).toMatch(/rap sheet/);
  });
});

describe("le titre de l'accueil, en un seul endroit (shared/promise.ts)", () => {
  const INDEX = readFileSync(join(__dirname, "../../web/index.html"), "utf8");

  it("web/index.html, la seule copie à la main, porte le même titre, la même description et le même texte d'image", () => {
    expect(INDEX).toContain(`<title>${homeTitle("fr")}</title>`);
    expect(INDEX).toContain(`<meta property="og:title" content="${homeTitle("fr")}" />`);
    expect(INDEX.match(new RegExp(`content="${HOME_PROMISE.fr.description}"`, "g"))).toHaveLength(3);
    expect(INDEX).toContain(`<meta name="twitter:title" content="${homeTitle("fr")}" />`);
    expect(INDEX).toContain(`<meta property="og:image:alt" content="${homeImageAlt("fr")}" />`);
  });

  it("les balises des pages sans fiche et le texte de l'image de l'accueil viennent de la même source", () => {
    for (const lang of ["fr", "en"] as const) {
      const m = genericMeta("https://s.test", "/", lang);
      // Le seul nom visible du produit est « Azerit » (§18.48).
      expect(m.title).toBe(`Azerit · ${promiseTitle(lang)}`);
      expect(`${m.title} ${m.description} ${m.imageAlt}`).not.toMatch(/Testyourskills/);
      expect(m.description).toBe(HOME_PROMISE[lang].description);
    }
    expect(promiseTitle("fr")).toBe("Découvre à quel point tu es recherché par les recruteurs\u00a0!");
    expect(promiseTitle("en")).toBe("See how much recruiters want your profile!");
    // La taille du héros se tire de sa plus longue ligne, la chute comptée entière (§18.103).
    for (const lang of ["fr", "en"] as const) {
      const p = HOME_PROMISE[lang];
      const em = (l: string) => measure(upper(lang === "fr" ? frTypo(l) : l, lang), "display-700", 1);
      const longest = Math.max(...[...p.claim, ...p.proof, promiseSentence(p.proof)].map(em));
      expect(heroTitleEm(lang)).toBeCloseTo(longest, 2);
    }
    expect(pageTitle("Vie privée")).toBe("Vie privée · Azerit");
    // Une apostrophe dans le titre sortirait échappée dans la balise.
    expect(injectHomeImage("<html><head></head></html>", "https://s.test")).toContain(`content="${homeImageAlt().replace(/'/g, "&#39;")}"`);
  });

  it("la description dit la méthode, sans opposer le profil et le code", () => {
    for (const lang of ["fr", "en"] as const) expect(`${promiseTitle(lang)} ${HOME_PROMISE[lang].description}`).not.toMatch(/\bcontre\b|\bvs\b|against|IA t'interroge|\bAI\b/i);
  });

  it("la description ne promet pas de durée en secondes (on mesure 24 s, §18.40)", () => {
    expect(HOME_PROMISE.fr.description).toContain("LinkedIn ou GitHub, une minute.");
    expect(HOME_PROMISE.en.description).toContain("LinkedIn or GitHub, one minute.");
    for (const lang of ["fr", "en"] as const) expect(HOME_PROMISE[lang].description).not.toMatch(/secondes?|seconds?|instant/i);
  });
});
