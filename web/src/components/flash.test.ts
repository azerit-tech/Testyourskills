import { describe, expect, it } from "vitest";
import { flashLook } from "./Film";

// Le flash de fin : plein en deux images, effacé en trois, jamais longtemps à mi-crème (§18.52).
describe("flashLook", () => {
  it("monte au plein en deux images sur quatre", () => {
    expect([0, 0.25, 0.5, 0.75, 1].map((o) => flashLook(o, false))).toEqual([0, 0.5, 1, 1, 1]);
  });
  it("s'efface en trois images sur six, la fiche posée", () => {
    const look = [1, 5 / 6, 4 / 6, 3 / 6, 2 / 6, 1 / 6, 0].map((o) => Math.round(flashLook(o, true) * 100) / 100);
    expect(look).toEqual([1, 0.67, 0.33, 0, 0, 0, 0]);
  });
});
