import { describe, expect, it } from "vitest";
import { CLIENT_GRACE_MS, CLIENT_TIMEOUT_MS, gaveUp, nextPatience, type Patience } from "./patience";

const start: Patience = { started: 1000, giveUpAt: null };

describe("patience du front", () => {
  it("attend le délai annoncé par le serveur, plus la marge", () => {
    const p = nextPatience(start, { timeLeft: 60_000 }, 1000);
    expect(p.giveUpAt).toBe(1000 + 60_000 + CLIENT_GRACE_MS);
    expect(gaveUp(p, 1000 + 74_000)).toBe(false);
    expect(gaveUp(p, 1000 + 76_000)).toBe(true);
  });

  it("suit la rallonge LinkedIn : le délai annoncé grandit, la patience aussi", () => {
    let p = nextPatience(start, { timeLeft: 60_000 }, 1000);
    p = nextPatience(p, { timeLeft: 115_000 }, 6000);
    expect(p.giveUpAt).toBe(6000 + 115_000 + CLIENT_GRACE_MS);
  });

  it("ne repousse plus quand le serveur a fini son délai", () => {
    let p = nextPatience(start, { timeLeft: 0 }, 50_000);
    expect(p.giveUpAt).toBe(50_000 + CLIENT_GRACE_MS);
    p = nextPatience(p, { timeLeft: 0 }, 60_000);
    expect(p.giveUpAt).toBe(50_000 + CLIENT_GRACE_MS);
    expect(gaveUp(p, 66_000)).toBe(true);
  });

  it("en file, ne coupe jamais et repart de zéro à la sortie", () => {
    let p = nextPatience({ started: 0, giveUpAt: 5 }, { queue: 3 }, 200_000);
    expect(p).toEqual({ started: 200_000, giveUpAt: null });
    expect(gaveUp(p, 10_000_000)).toBe(false);
    p = nextPatience(p, {}, 201_000);
    expect(p.giveUpAt).toBe(200_000 + CLIENT_TIMEOUT_MS);
  });

  it("serveur muet (mode démo) : le pire cas, LinkedIn compris", () => {
    expect(nextPatience(start, {}, 9999).giveUpAt).toBe(1000 + CLIENT_TIMEOUT_MS);
  });
});
