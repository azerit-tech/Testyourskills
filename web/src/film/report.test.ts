// L'événement `film` (docs/cinematique-poursuite.md §5.6) : ce que le front
// envoie passe la validation du serveur, et ne porte rien de personnel.
import { describe, expect, it } from "vitest";
import { clientEventSchema, filmMetaSchema } from "../../../server/src/events";
import { filmReport, interruptedOutcome, type FilmFacts } from "./report";

const facts = (f: Partial<FilmFacts> = {}): FilmFacts => ({
  outcome: "played",
  variant: "720",
  bytes: 5_123_456.4,
  loadMs: 2345.6,
  startMs: 180.2,
  dropped: 0,
  switchMs: 41.7,
  bps: 12_345_678,
  inApp: false,
  gesture: false,
  ...f,
});

describe("l'événement film", () => {
  it("des entiers bornés, le débit en kbit/s, dix clés au plus", () => {
    const m = filmReport(facts());
    expect(m).toEqual({ outcome: "played", variant: "720", bytes: 5_123_456, loadMs: 2346, startMs: 180, dropped: 0, switchMs: 42, kbps: 12_346, inApp: false, gesture: false });
    expect(Object.keys(m).length).toBeLessThanOrEqual(10);
    expect(filmMetaSchema.safeParse(m).success).toBe(true);
    expect(clientEventSchema.safeParse({ event: "film", meta: m }).success).toBe(true);
  });

  it("rien de mesuré : null, et toujours valide (codec illisible, abandon au délai)", () => {
    const m = filmReport(facts({ outcome: "nocodec", variant: null, bytes: 0, loadMs: null, startMs: null, dropped: null, switchMs: null, bps: null }));
    expect(m.kbps).toBeNull();
    expect(filmMetaSchema.safeParse(m).success).toBe(true);
    expect(filmMetaSchema.safeParse(filmReport(facts({ outcome: "timeout", loadMs: Number.NaN, startMs: -5 }))).success).toBe(true);
  });

  it("des valeurs absurdes sont ramenées dans les bornes du serveur", () => {
    const m = filmReport(facts({ startMs: 9e9, switchMs: 1e12, bytes: 1e12, dropped: 1e9 }));
    expect(filmMetaSchema.safeParse(m).success).toBe(true);
  });

  it("l'issue d'une lecture interrompue : passée, pilule jamais touchée, ou page quittée", () => {
    expect(interruptedOutcome({ closed: true, started: true, gesture: false })).toBe("skipped");
    expect(interruptedOutcome({ closed: true, started: true, gesture: true })).toBe("skipped");
    expect(interruptedOutcome({ closed: false, started: false, gesture: true })).toBe("gesture");
    expect(interruptedOutcome({ closed: false, started: true, gesture: false })).toBe("left");
    expect(interruptedOutcome({ closed: false, started: false, gesture: false })).toBe("left");
  });
});
