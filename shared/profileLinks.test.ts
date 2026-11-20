// La règle des liens vers ses profils publics (§18.108) : quelles sources font un lien, selon la fiche.
import { describe, expect, it } from "vitest";
import { boardPerson } from "./boardPerson";
import { githubHref, linkedinHref, personLinks, profileLinks } from "./profileLinks";

const LI = "https://www.linkedin.com/in/lea-martin-dubois";
const GH = "https://github.com/leamd";

describe("les liens d'une fiche", () => {
  it("GitHub seule, LinkedIn seule, les deux", () => {
    expect(profileLinks({ login: "leamd" })).toEqual({ github: GH });
    expect(profileLinks({ linkedinUrl: LI })).toEqual({ linkedin: LI });
    expect(profileLinks({ login: "leamd", linkedinUrl: LI })).toEqual({ linkedin: LI, github: GH });
    expect(profileLinks({})).toEqual({});
  });

  it("jamais autre chose qu'un profil linkedin.com/in/… ou github.com/<pseudo>", () => {
    expect(linkedinHref("https://fr.linkedin.com/in/Léa-M/?trk=x")).toBe("https://www.linkedin.com/in/l%C3%A9a-m");
    expect(linkedinHref("https://www.linkedin.com/company/azerit")).toBeNull();
    expect(linkedinHref("javascript:alert(1)")).toBeNull();
    expect(linkedinHref("lea@exemple.fr")).toBeNull();
    expect(githubHref("lea@exemple.fr")).toBeNull();
    expect(githubHref("-bad")).toBeNull();
    expect(githubHref("Nour-RS")).toBe("https://github.com/Nour-RS");
    expect(profileLinks({ login: "a b", linkedinUrl: "https://evil.test/in/x" })).toEqual({});
  });
});

describe("les liens d'une ligne de classement", () => {
  it("la personne montrée : son GitHub, et son LinkedIn quand le serveur l'a mis", () => {
    expect(personLinks(boardPerson({ name: "Léa", login: "leamd" }, "Card000001", null, LI))).toEqual({ linkedin: LI, github: GH });
    expect(personLinks(boardPerson({ name: "Inès Carpentier" }, "Card000002", null, LI))).toEqual({ linkedin: LI });
    expect(personLinks(boardPerson({ login: "leamd" }, "Card000003"))).toEqual({ github: GH });
  });

  it("une ligne anonyme (sans fiche) : aucun lien ; une adresse qui n'est pas un profil ne part pas", () => {
    expect(personLinks({ login: "leamd", linkedinUrl: LI })).toEqual({});
    expect(boardPerson({ name: "Léa" }, "Card000004", null, "https://evil.test/in/lea").linkedinUrl).toBeUndefined();
  });
});
