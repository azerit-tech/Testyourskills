// La page d'une bande : les fiches anonymes comptées et réparties par étoiles, dans le
// même bloc que les fiches nommées.
import { describe, expect, it } from "vitest";
import { starSpread } from "./Bands";

describe("les fiches anonymes d'une bande", () => {
  it("leur répartition va du plus étoilé au moins étoilé", () => {
    const m = (stars: number) => ({ stars, profile: null });
    expect(starSpread([m(4), m(6), m(4), m(5), m(6), m(4)])).toEqual([
      [6, 2],
      [5, 1],
      [4, 3],
    ]);
    expect(starSpread([])).toEqual([]);
  });
});
