import { describe, expect, it } from "vitest";
import { verdict } from "./versus";

describe("ligne de comparaison (§18.7)", () => {
  it("compte les étoiles d'avance ou de retard d'abord", () => {
    expect(verdict(78, 71)).toEqual({ by: "stars", ahead: true, n: 1 }); // ★★★★★ contre ★★★★
    expect(verdict(44, 91)).toEqual({ by: "stars", ahead: false, n: 4 });
  });

  it("à étoiles égales, les points", () => {
    expect(verdict(64, 71)).toEqual({ by: "points", ahead: false, n: 7 });
    expect(verdict(62, 61)).toEqual({ by: "points", ahead: true, n: 1 });
  });

  it("même note : égalité", () => {
    expect(verdict(71, 71)).toEqual({ by: "tie" });
  });
});
