// La personne d'une ligne de classement (§18.88) : le nom de la fiche, sinon son
// @pseudo ; sa photo, sinon ses initiales.
import { describe, expect, it } from "vitest";
import { boardPerson, personLabel } from "./boardPerson";

describe("la personne d'une ligne de classement", () => {
  it("une fiche LinkedIn ou CV seule : son nom, ses initiales, pas de pseudo", () => {
    const p = boardPerson({ name: "Florence Delmas", initials: "FD" }, "Card000001");
    expect(p).toEqual({ cardId: "Card000001", name: "Florence Delmas", initials: "FD" });
    expect(personLabel(p)).toBe("Florence Delmas");
  });

  it("une fiche GitHub : le nom de la fiche et sa photo ; sans nom (le bandeau répète le pseudo), le @pseudo", () => {
    const named = boardPerson({ name: "Léa Martin-Dubois", login: "leamd", avatarUrl: "https://avatars.githubusercontent.com/u/1", initials: "LM" }, "Card000002");
    expect(named).toEqual({ cardId: "Card000002", name: "Léa Martin-Dubois", login: "leamd", avatarUrl: "https://avatars.githubusercontent.com/u/1", initials: "LM" });
    expect(personLabel(named)).toBe("Léa Martin-Dubois");
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
