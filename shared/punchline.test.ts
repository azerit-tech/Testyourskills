// La phrase de la fiche et le nom de son profil, propres à chaque fiche (§18.103) :
// variété du recueil, déterminisme, contrôle des phrases de l'IA, place sur la
// fiche à la largeur d'un téléphone.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import profilesJson from "../data/profiles.json";
import punchlines from "../data/punchlines.json";
import { CardGraphic, LAYOUT, profileTagline } from "./card/Card";
import { measure, upper } from "./card/text";
import { FIXTURES } from "./fixtures";
import { withCatalogProfiles } from "./profileCatalog";
import { aliasFor, aliasesOf, checkLine, checkLineFact, fallbackLine, hash32, personalProfile } from "./punchline";
import type { CardData, Fact, Lang } from "./types";

const LANGS: Lang[] = ["fr", "en"];
const FW = 360 - 18 - 20;
const ids = (n: number, prefix = "") => Array.from({ length: n }, (_, i) => `${prefix}${hash32(String(i)).toString(36)}${i}`);

/** Une fiche LinkedIn seule, sans rien de plus : le cas le plus fréquent en production. */
const THIN = { ...FIXTURES.photo, source: "cv", declaredSource: "linkedin", login: undefined, profile: { ...FIXTURES.photo.profile! }, statuses: [], findings: [], club: null, mainLanguage: undefined, grid: undefined } as CardData;

/** Le typographe du site (shared/card/i18n.test.ts), sur ce qui sort. */
function typoOk(fr: string): void {
  expect(fr).not.toMatch(/ [:;!?»]|« /);
  expect(fr).not.toMatch(/—|\p{L}·\p{L}/u);
}

// Des milliers de tirages, chacun mesuré : long sous `taskpolicy -b`.
describe("le recueil de repli", { timeout: 60_000 }, () => {
  it("1 000 fiches minces : au moins 150 phrases différentes, dans chaque langue", () => {
    for (const lang of LANGS) {
      const seen = new Set(ids(1000).map((id) => fallbackLine({ ...THIN, id })[lang]));
      expect(seen.size).toBeGreaterThanOrEqual(150);
    }
  });

  it("1 000 fiches riches : au moins 150 phrases différentes, aucune sur plus de 3 % des fiches", () => {
    const rich = FIXTURES.jmougeot;
    const counts = new Map<string, number>();
    for (const id of ids(1000, "r")) {
      const fr = fallbackLine({ ...rich, id }).fr;
      counts.set(fr, (counts.get(fr) ?? 0) + 1);
    }
    expect(counts.size).toBeGreaterThanOrEqual(150);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(30);
  });

  it("même fiche, même phrase et même nom ; deux voisines, deux phrases", () => {
    for (const card of Object.values(FIXTURES) as CardData[]) {
      expect(fallbackLine(card)).toEqual(fallbackLine(structuredClone(card)));
      expect(personalProfile(card)).toEqual(personalProfile({ ...card }));
    }
    const a = fallbackLine({ ...THIN, id: "Centrale01" });
    const b = fallbackLine({ ...THIN, id: "Centrale02" });
    expect(a.fr).not.toBe(b.fr);
  });

  it("les faits de la fiche entrent dans la phrase : l'employeur affiché, l'arme, les années", () => {
    const hits = (card: CardData, needle: RegExp) => ids(200).filter((id) => needle.test(fallbackLine({ ...card, id }).fr)).length;
    expect(hits({ ...THIN, club: "Qonto" }, /Qonto/)).toBeGreaterThan(20);
    expect(hits({ ...THIN, mainLanguage: "rust" }, /Rust/)).toBeGreaterThan(20);
    const senior = { ...THIN, grid: { criteria: [], overall: 60, seniority: { code: "senior", months: 100, source: "linkedin" } } } as CardData;
    expect(hits(senior, /8\s?ans/)).toBeGreaterThan(20);
    const founder = { ...THIN, grid: { criteria: [{ code: "OWN", score: 6, state: "declared", counted: true, source: "linkedin", reached: { fr: "Une entreprise fondée.", en: "A company founded." }, flags: [] }], overall: 60 } } as CardData;
    expect(hits(founder, /affaire|boîte|bande/)).toBeGreaterThan(20);
    const noFounder = { ...THIN, grid: { criteria: [{ code: "OWN", score: 2, state: "declared", counted: true, source: "linkedin", reached: { fr: "Ni entreprise fondée.", en: "No company founded, no dated and quantified outcome." }, flags: [] }], overall: 40 } } as CardData;
    expect(hits(noFounder, /ta propre affaire|fonder ta boîte|ta propre bande/)).toBe(0);
  });

  it("jamais l'école, même quand la fiche la connaît", () => {
    const card = { ...THIN, school: "centrale-mediterranee" } as CardData;
    for (const id of ids(300)) expect(fallbackLine({ ...card, id }).fr).not.toMatch(/centrale|école d'|school/i);
  });

  it("chaque phrase tirée passe le contrôle, et le français la typographie du site", () => {
    for (const card of [THIN, ...(Object.values(FIXTURES) as CardData[])]) {
      for (const id of ids(150, card.id)) {
        const line = fallbackLine({ ...card, id });
        expect(checkLineFact(line)).toEqual(line);
        typoOk(line.fr);
      }
    }
  });

  it("chaque suite du recueil, seule, passe le contrôle et tient sur la fiche", () => {
    const fill = (s: string) => s.replace("{club}", "Doctolib").replace("{lang}", "TypeScript").replace("{key}", "12").replace("{years}", "2").replace("{s}", "s");
    for (const list of Object.values(punchlines.tails) as Fact[][]) {
      for (const t of list) {
        for (const lang of LANGS) {
          const s = fill(t[lang]);
          expect(checkLine(s.charAt(0).toUpperCase() + s.slice(1), lang), s).not.toBeNull();
        }
      }
    }
  });
});

describe("le nom du profil", () => {
  it("chaque profil du catalogue a ses noms, le premier est celui du catalogue", () => {
    for (const p of profilesJson.profiles) {
      const list = aliasesOf(p.id);
      expect(list.length).toBeGreaterThanOrEqual(4);
      expect(list[0]).toEqual(p.label);
    }
  });

  it("chaque nom tient sur une ligne au corps minimal, sans coupe, et ne suppose aucun genre", () => {
    for (const p of profilesJson.profiles) {
      for (const a of aliasesOf(p.id)) {
        for (const lang of LANGS) expect(measure(upper(a[lang], lang), "display-700", LAYOUT.profileName.minSize)).toBeLessThanOrEqual(FW);
        expect(a.fr).not.toMatch(/·|\(e\)|\b(?:il|elle|agent|parrain)\b/i);
      }
    }
  });

  it("deux « Cellule dormante » ne lisent pas toutes le même nom ; l'id du profil ne change pas", () => {
    const names = new Set(ids(200).map((id) => aliasFor("sleeper_agent", id)!.fr));
    expect(names.size).toBe(aliasesOf("sleeper_agent").length);
    const p = personalProfile({ ...THIN, id: "abc" })!;
    expect(p.id).toBe("sleeper_agent");
  });
});

describe("le contrôle des phrases de l'IA", () => {
  const ok = { fr: "Trois stages, zéro bug avoué : le dossier s'épaissit", en: "Three internships, zero confessed bugs: the file grows" };

  it("garde une bonne phrase, la typographie française remise", () => {
    expect(checkLineFact(ok)).toEqual({ fr: "Trois stages, zéro bug avoué : le dossier s'épaissit", en: ok.en });
    expect(checkLine("« Tu planques du Rust depuis 2019 »", "fr")).toBe("Tu planques du Rust depuis 2019");
  });

  it.each([
    ["trop court", "Bravo", "fr"],
    ["trop long", "Tu as passé tant de temps sur tant de projets différents que le dossier ne tient plus du tout sur la fiche", "fr"],
    ["trop large pour deux lignes", "WWWWWWWW WWWWWWWW WWWWWWWW WWWWWWWW WWWWWWWW WWWWWWWW", "en"],
    ["un lien", "Ton code est sur github.com/quelquun, la preuve", "fr"],
    ["un lien", "Check https://example.org for the evidence", "en"],
    ["une adresse", "Écris-moi à jo@exemple.fr pour l'alibi", "fr"],
    ["un pseudo", "Suis @quelquun pour la suite du casse", "fr"],
    ["une insulte", "Ton code est nul mais ton alibi tient", "fr"],
    ["une insulte", "Your code is garbage but your alibi holds", "en"],
    ["une grossièreté", "Tu codes comme un putain de pro", "fr"],
    ["un mot composé grossier", "You sign every job in brainfuck", "en"],
    ["l'origine", "Tu codes comme un vrai Africain du Python", "fr"],
    ["la religion", "Even God reviews your pull requests", "en"],
    ["la santé", "Tu codes comme un autiste, la nuit entière", "fr"],
    ["l'apparence", "Chauve mais redoutable, tu livres le vendredi", "fr"],
    ["l'âge", "Too old for React, still shipping on Fridays", "en"],
    ["le genre", "Elle code plus vite que la police ne suit", "fr"],
    ["le genre", "She ships faster than the cops can follow", "en"],
    ["l'écriture inclusive", "Tu es devenu·e fondateur·rice de ta bande", "fr"],
    ["le vouvoiement", "Vous livrez plus vite que la police ne suit", "fr"],
    ["une vraie accusation", "Ton CV relève de la fraude, ton code aussi", "fr"],
    ["une vraie accusation", "You stole that function from a maintainer", "en"],
    ["un emoji", "Tu livres le vendredi soir sans trembler 🔥", "fr"],
  ])("rejette %s : %s", (_why, line, lang) => {
    expect(checkLine(line, lang as Lang)).toBeNull();
  });

  it("rejette l'école et les anciens employeurs qu'on lui interdit", () => {
    const names = ["Centrale Méditerranée", "Capgemini", "Université Paris-Dauphine"];
    expect(checkLine("Tout droit sorti de Centrale Mediterranee, déjà fiché", "fr", { names })).toBeNull();
    expect(checkLine("Ex-capgemini, tu planques du Go maintenant", "fr", { names })).toBeNull();
    expect(checkLine("Sorti de Dauphine, tu planques du Django", "fr", { names })).toBeNull();
    expect(checkLine("Une école d'ingé, trois stages, zéro aveu", "fr", { names })).not.toBeNull();
    expect(checkLine("Paris, trois stages, zéro aveu au compteur", "fr", { names })).not.toBeNull();
    // Une phrase interdite (un exemple des consignes) : entière, pas mot à mot.
    expect(checkLine("Cinq ans de Fortran au CNES, et la fusée décolle toujours", "fr", { forbid: ["Cinq ans de Fortran au CNES, et la fusée décolle toujours"] })).toBeNull();
    expect(checkLine("Cinq ans de Rust, et la fusée décolle toujours", "fr", { forbid: ["Cinq ans de Fortran au CNES, et la fusée décolle toujours"] })).not.toBeNull();
  });

  it("une seule langue mauvaise fait tomber la phrase entière", () => {
    expect(checkLineFact({ fr: ok.fr, en: "Your code sucks but the alibi holds" })).toBeNull();
    expect(checkLineFact({ fr: "", en: "" })).toBeNull();
    expect(checkLineFact(undefined)).toBeNull();
  });
});

describe("à la lecture : la fiche montre sa phrase et un des noms de son profil", () => {
  it("la phrase de l'IA d'abord ; sans elle, ou abîmée, celle du recueil ; rien n'est réécrit", () => {
    const line = { fr: "Tu planques du Rust depuis 2019", en: "You've been stashing Rust since 2019" };
    const stored = { ...FIXTURES.photo, profile: { ...FIXTURES.photo.profile!, line } };
    const before = JSON.stringify(stored);
    const shown = withCatalogProfiles(stored);
    expect(shown.profile!.tagline).toEqual(line);
    expect(JSON.stringify(stored)).toBe(before);
    const bad = withCatalogProfiles({ ...stored, profile: { ...stored.profile, line: { fr: "Va voir www.spam.com", en: "Go to www.spam.com" } } });
    expect(bad.profile!.tagline).toEqual(fallbackLine(stored));
  });

  it("une fiche d'avant (la phrase du catalogue rangée) prend une phrase du recueil, toujours la même", () => {
    const old = { ...FIXTURES.photo };
    const once = withCatalogProfiles(old);
    expect(once.profile!.tagline.fr).not.toBe(profilesJson.profiles.find((p) => p.id === "sleeper_agent")!.tagline.fr);
    expect(withCatalogProfiles(once)).toEqual(once);
    expect(withCatalogProfiles(old)).toEqual(once);
  });

  it("un dossier : chaque pièce prend son nom et sa phrase", () => {
    const cmp = { id: "cmp1", createdAt: "2026-11-20T10:00:00Z", cv: { ...FIXTURES.cv }, github: { ...FIXTURES.gold } };
    const shown = withCatalogProfiles(cmp);
    expect(shown.github.profile!.tagline).toEqual(fallbackLine(FIXTURES.gold));
    expect(shown.cv.profile!.tagline).toEqual(fallbackLine(FIXTURES.cv));
  });

  it("à la largeur d'un téléphone, chaque fiche rend sa phrase entière, en deux lignes au plus, jamais sous 15", () => {
    for (const card of Object.values(FIXTURES) as CardData[]) {
      for (const [i, id] of ids(40, card.id).entries()) {
        const shown = withCatalogProfiles({ ...card, id });
        for (const lang of LANGS) {
          const text = shown.profile!.tagline[lang];
          const f = profileTagline(text);
          expect(f.truncated).toBe(false);
          expect(f.lines.length).toBeLessThanOrEqual(2);
          expect(f.size).toBeGreaterThanOrEqual(LAYOUT.tagline.minSize);
          expect(f.size).toBeGreaterThan(LAYOUT.charges.size);
          for (const line of f.lines) expect(line).not.toMatch(/^[:;!?»]/);
          // Le rendu entier, lent : trois tirages par fiche suffisent, la mesure ci-dessus couvre les quarante.
          if (i >= 3) continue;
          const svg = renderToStaticMarkup(createElement(CardGraphic, { card: shown, lang, avatarHref: "" }));
          for (const w of text.split(/[ \t\n]+/)) expect(svg).toContain(w.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;"));
        }
      }
    }
  }, 60_000);
});
