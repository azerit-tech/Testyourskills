import { describe, expect, it } from "vitest";
import { after, nameStartsWith, slugOfName, slugRanges } from "./names";

// Noms inventés.
describe("un nom → des tranches d'adresses LinkedIn", () => {
  it("prénom-nom, prénomnom, nom-prénom ; les accents en plus s'il y en a", () => {
    expect(slugRanges("Camille Ardent").map((r) => r.prefix)).toEqual(["camille-ardent", "camilleardent", "ardent-camille"]);
    expect(slugRanges("Élodie Véran").map((r) => r.prefix)).toEqual(["elodie-veran", "elodieveran", "veran-elodie", "élodie-véran", "élodievéran", "véran-élodie"]);
    expect(slugRanges("Jean-Pierre Lafleur")[0]!.prefix).toBe("jean-pierre-lafleur");
  });

  it("en cours de frappe : pas d'ordre inversé ; un seul mot : rien", () => {
    expect(slugRanges("camille ard", { partial: true }).map((r) => r.prefix)).toEqual(["camille-ard", "camilleard"]);
    expect(slugRanges("Camille")).toEqual([]);
  });

  it("la borne haute : le dernier caractère suivant, « commence par » en ordre d'octets", () => {
    expect(after("camille-ardent")).toBe("camille-ardenu");
    expect(after("élodie-véran")).toBe("élodie-vérao");
    const r = slugRanges("Camille Ardent")[0]!;
    for (const s of ["camille-ardent", "camille-ardent-4b2a", "camille-ardentes"]) expect(s >= r.lo && s < r.hi).toBe(true);
    expect("camille-ardenu" < r.hi).toBe(false);
  });

  it("une adresse faite du nom, pas d'un nom plus long", () => {
    const r = slugRanges("Camille Ardent");
    for (const s of ["camille-ardent", "camille-ardent-4b2a1b23", "camilleardent87", "ardent-camille"]) expect(slugOfName(s, r)).toBe(true);
    for (const s of ["camille-ardentes", "camilleardentx", "camille-arden"]) expect(slugOfName(s, r)).toBe(false);
  });

  it("le nom d'un CV commence par ce qui est tapé", () => {
    expect(nameStartsWith("Camille Ardent", "camille ard")).toBe(true);
    expect(nameStartsWith("Camille Ardent", "Camille Ardent")).toBe(true);
    expect(nameStartsWith("Camille Ardentes", "camille ardent")).toBe(true);
    expect(nameStartsWith("Camille Ardent", "camil ardent")).toBe(false);
    expect(nameStartsWith("Camille Ardent", "camille")).toBe(false);
  });
});
