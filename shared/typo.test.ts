// La typographie française des textes du site (shared/typo.ts).

import { describe, expect, it } from "vitest";
import { frTypo, frTypoDeep, NBSP, ordinalParts, typoFact, typoFacts } from "./typo";

const N = NBSP;

describe("frTypo", () => {
  it("espace insécable avant « : ; ! ? » et dans les guillemets", () => {
    expect(frTypo("Combien d'étoiles ?")).toBe(`Combien d'étoiles${N}?`);
    expect(frTypo("Sources : LinkedIn et GitHub ; rien d'autre !")).toBe(`Sources${N}: LinkedIn et GitHub${N}; rien d'autre${N}!`);
    expect(frTypo("profil « Oiseau de nuit »")).toBe(`profil «${N}Oiseau de nuit${N}»`);
  });

  it("un nombre ne quitte pas son unité", () => {
    expect(frTypo("5 Mo, 10 pages max")).toBe(`5${N}Mo, 10${N}pages max`);
    expect(frTypo("gardée 90 jours, lue en 9 s, à 71 %")).toBe(`gardée 90${N}jours, lue en 9${N}s, à 71${N}%`);
    expect(frTypo("fin dans 1 j")).toBe(`fin dans 1${N}j`);
    expect(frTypo("1 000 stars GitHub")).toBe(`1${N}000 stars GitHub`);
    expect(frTypo("N° 1 des écoles")).toBe(`N°${N}1 des écoles`);
  });

  it("une insécable déjà écrite à la source reste en place", () => {
    expect(frTypo(`100${N}stars GitHub, 20${N}commits`)).toBe(`100${N}stars GitHub, 20${N}commits`);
  });

  it("ne touche ni un mot qui commence comme une unité, ni une adresse, ni une heure", () => {
    expect(frTypo("3 sources, 2 jeux, 4 heures")).toBe("3 sources, 2 jeux, 4 heures");
    expect(frTypo("https://skills.azerit.tech/c/x")).toBe("https://skills.azerit.tech/c/x");
    expect(frTypo("79/100")).toBe("79/100");
  });

  it("idempotent : une chaîne déjà juste ne bouge pas", () => {
    const once = frTypo("« Ta fiche : 79/100 », en 9 s ?");
    expect(frTypo(once)).toBe(once);
  });
});

describe("frTypoDeep", () => {
  it("chaque chaîne, chaque tableau et chaque résultat de fonction d'un dictionnaire", () => {
    const d = frTypoDeep({
      a: "Prêt ?",
      list: ["Un : deux", "trois"],
      fn: (n: number) => `Encore ${n} jours !`,
      nested: { pair: [10, "Oui !"] as [number, string], deep: (who: string) => ({ line: `${who} : vu` }) },
      n: 3,
      flag: true,
    });
    expect(d.a).toBe(`Prêt${N}?`);
    expect(d.list).toEqual([`Un${N}: deux`, "trois"]);
    expect(d.fn(3)).toBe(`Encore 3${N}jours${N}!`);
    expect(d.nested.pair).toEqual([10, `Oui${N}!`]);
    expect(d.nested.deep("Léa").line).toBe(`Léa${N}: vu`);
    expect(d.n).toBe(3);
    expect(d.flag).toBe(true);
  });
});

describe("les messages bilingues du serveur", () => {
  it("seul le français est repris", () => {
    expect(typoFact({ fr: "Trop long : 5 Mo max.", en: "Too long: 5 MB max." })).toEqual({ fr: `Trop long${N}: 5${N}Mo max.`, en: "Too long: 5 MB max." });
    expect(typoFacts({ a: { fr: "Quoi ?", en: "What?" } }).a).toEqual({ fr: `Quoi${N}?`, en: "What?" });
  });
});

describe("les ordinaux en exposant (§18.52)", () => {
  it("« 3e », « 1er » : la marque à part ; le reste intact", () => {
    expect(ordinalParts("3e des écoles, à 6 étoiles de la 2e")).toEqual([
      { text: "3", sup: false },
      { text: "e", sup: true },
      { text: " des écoles, à 6 étoiles de la 2", sup: false },
      { text: "e", sup: true },
    ]);
    expect(ordinalParts("Du 1er novembre")).toEqual([
      { text: "Du 1", sup: false },
      { text: "er", sup: true },
      { text: " novembre", sup: false },
    ]);
    for (const plain of ["J-12", "n° 1 des écoles", "#2 among companies", "3 entretiens", "2emploi", ""]) expect(ordinalParts(plain)).toEqual([{ text: plain, sup: false }]);
  });
});
