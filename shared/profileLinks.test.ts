// La règle des liens vers ses profils publics (§18.108) : quelles sources font un lien, selon la fiche.
import { describe, expect, it } from "vitest";
import { boardPerson } from "./boardPerson";
import { githubHref, linkedinHref, profileLinks } from "./profileLinks";

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

describe("une ligne de classement (§18.127)", () => {
  it("ne porte aucune adresse de profil : les recruteurs passent par Azerit", () => {
    const p = boardPerson({ name: "Léa Martin-Dubois", login: "leamd" }, "Card000001");
    expect(JSON.stringify(p)).not.toMatch(/linkedin|https:/);
  });
});
