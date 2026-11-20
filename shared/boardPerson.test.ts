// La personne d'une ligne de classement (§18.88, §18.127) : le nom court de la fiche, sinon
// son @pseudo ; sa photo, sinon ses initiales ; son niveau.
import { describe, expect, it } from "vitest";
import { boardPerson, personLabel, seniorityOf } from "./boardPerson";
import { shortName } from "./shortName";

describe("le nom court (§18.127)", () => {
  it("le prénom et l'initiale du nom, prénoms composés compris", () => {
    expect(shortName("Pierre-Antoine Bannier")).toBe("Pierre-Antoine B.");
    expect(shortName("Charles-Meldhine Madi Mnemoi")).toBe("Charles-Meldhine M.");
    expect(shortName("Léa Martin-Dubois")).toBe("Léa M.");
  });

  it("une particule est la première lettre du nom", () => {
    expect(shortName("Enzo Le Van")).toBe("Enzo L.");
    expect(shortName("Jean de La Fontaine")).toBe("Jean D.");
    expect(shortName("Marie d'Arc")).toBe("Marie D.");
    expect(shortName("Ana van der Berg")).toBe("Ana V.");
  });

  it("un seul mot reste entier ; vide reste vide ; déjà court, inchangé ; les espaces en trop ne comptent pas", () => {
    expect(shortName("Em'")).toBe("Em'");
    expect(shortName("")).toBe("");
    expect(shortName(null)).toBe("");
    expect(shortName("Enzo L.")).toBe("Enzo L.");
    expect(shortName("  Inès   Carpentier ")).toBe("Inès C.");
    expect(shortName("Élodie émery")).toBe("Élodie É.");
  });
});

describe("le niveau d'une ligne (§18.127)", () => {
  it("lu sur la grille de la fiche ou du dossier ; absent sur une grille d'avant", () => {
    expect(seniorityOf({ grid: { criteria: [], overall: 70, seniority: { code: "mid", months: 40, source: "linkedin" } } })).toBe("mid");
    expect(seniorityOf({ grid: { criteria: [], overall: 70 } })).toBeUndefined();
    expect(seniorityOf(null)).toBeUndefined();
    expect(boardPerson({ name: "Enzo Le Van" }, "c", null, "junior")).toMatchObject({ name: "Enzo L.", seniority: "junior" });
    expect(boardPerson({ name: "Enzo Le Van" }, "c").seniority).toBeUndefined();
  });
});

describe("la personne d'une ligne de classement", () => {
  it("une fiche LinkedIn ou CV seule : son nom court, ses initiales, pas de pseudo", () => {
    const p = boardPerson({ name: "Florence Delmas", initials: "FD" }, "Card000001");
    expect(p).toEqual({ cardId: "Card000001", name: "Florence D.", initials: "FD" });
    expect(personLabel(p)).toBe("Florence D.");
  });

  it("une fiche GitHub : le nom court de la fiche et sa photo ; sans nom (le bandeau répète le pseudo), le @pseudo", () => {
    const named = boardPerson({ name: "Léa Martin-Dubois", login: "leamd", avatarUrl: "https://avatars.githubusercontent.com/u/1", initials: "LM" }, "Card000002");
    expect(named).toEqual({ cardId: "Card000002", name: "Léa M.", login: "leamd", avatarUrl: "https://avatars.githubusercontent.com/u/1", initials: "LM" });
    expect(personLabel(named)).toBe("Léa M.");
    const bare = boardPerson({ name: "Nour-RS", login: "nour-rs", initials: "NR" }, "Card000003");
    expect(bare.name).toBeUndefined();
    expect(personLabel(bare)).toBe("@nour-rs");
  });

  it("le pseudo de la ligne en base sert quand la fiche n'en porte pas ; celui de la fiche garde sa casse", () => {
    expect(boardPerson({ name: "Camille Ardent", initials: "CA" }, "c", "camille").login).toBe("camille");
    expect(boardPerson({ name: "Camille Ardent", login: "CamilleA", initials: "CA" }, "c", "camillea").login).toBe("CamilleA");
  });

  it("une fiche sans initiales rangées : celles du nom, jamais une lettre de remplacement", () => {
    expect(boardPerson({ name: "Inès Carpentier" }, "c").initials).toBe("IC");
    expect(boardPerson({ name: "Jean-Pierre Lefèvre" }, "c").initials).toBe("JP");
    expect(boardPerson({ login: "kevin" }, "c").initials).toBe("KE");
    expect(boardPerson({}, "c")).toEqual({ cardId: "c", initials: "?" });
    expect(personLabel(boardPerson({}, "c"))).toBe("");
  });
});
