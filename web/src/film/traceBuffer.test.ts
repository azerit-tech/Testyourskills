import { describe, expect, it } from "vitest";
import { BATCH_MAX_LINES, byteLength, notable, QUEUE_MAX_LINES, SHOWN_LINES, TraceBuffer, type TraceLine } from "./traceBuffer";

const ev = (t: number, e: string, v = "A"): TraceLine => ({ t, k: "ev", v, e });

describe("le tampon de la trace du film", () => {
  it("garde les trois premiers timeupdate de chaque balise, puis un par seconde", () => {
    const b = new TraceBuffer();
    const kept = [0, 50, 100, 150, 400, 1099, 1100, 1500, 2099, 2100].filter((t) => b.keepTimeupdate("A", t));
    expect(kept).toEqual([0, 50, 100, 1100, 2100]);
    // l'autre balise a son propre compte
    expect(b.keepTimeupdate("B", 2101)).toBe(true);
    expect(b.keepTimeupdate("B", 2102)).toBe(true);
  });

  it("découpe la file en lots bornés en octets et en lignes, dans l'ordre, puis la vide", () => {
    const b = new TraceBuffer();
    for (let i = 0; i < 30; i++) b.push({ t: i, k: "snap", pad: "x".repeat(1000) });
    const lots = b.takeBatches(5000);
    expect(lots.length).toBeGreaterThan(5);
    for (const lot of lots) expect(byteLength(lot.map((l) => JSON.stringify(l)).join("\n"))).toBeLessThanOrEqual(5000);
    expect(lots.flat().map((l) => l.t)).toEqual(Array.from({ length: 30 }, (_, i) => i));
    expect(b.size).toBe(0);
    expect(b.takeBatches()).toEqual([]);

    for (let i = 0; i < BATCH_MAX_LINES + 10; i++) b.push(ev(i, "playing"));
    expect(b.takeBatches().map((l) => l.length)).toEqual([BATCH_MAX_LINES, 10]);
  });

  it("une ligne trop grosse part seule ; un lot raté repasse en tête", () => {
    const b = new TraceBuffer();
    b.push({ t: 0, k: "head", pad: "y".repeat(200) });
    b.push(ev(1, "play"));
    const lots = b.takeBatches(100);
    expect(lots.map((l) => l.length)).toEqual([1, 1]);
    b.push(ev(2, "pause"));
    b.requeue(lots[1]!);
    expect(b.takeBatches().flat().map((l) => l.t)).toEqual([1, 2]);
  });

  it("oublie les plus anciennes lignes au-delà de la file", () => {
    const b = new TraceBuffer();
    for (let i = 0; i < QUEUE_MAX_LINES + 5; i++) b.push({ t: i, k: "snap" });
    expect(b.size).toBe(QUEUE_MAX_LINES);
    expect(b.lost).toBe(5);
    expect(b.takeBatches(Infinity, Infinity)[0]![0]!.t).toBe(5);
  });

  it("le calque ne montre que les lignes marquantes, les huit dernières", () => {
    const b = new TraceBuffer();
    expect(notable({ t: 0, k: "snap" })).toBe(false);
    expect(notable(ev(0, "timeupdate"))).toBe(false);
    expect(notable(ev(0, "waiting"))).toBe(true);
    expect(notable({ t: 0, k: "step", s: "prepare" })).toBe(true);
    for (let i = 0; i < 12; i++) {
      b.push(ev(i, "stalled"));
      b.push({ t: i, k: "snap" });
      b.push(ev(i, "timeupdate"));
    }
    expect(b.shown().map((l) => l.t)).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
    expect(b.shown()).toHaveLength(SHOWN_LINES);
  });

  it("compte les octets en UTF-8", () => {
    expect(byteLength("abc")).toBe(3);
    expect(byteLength("é")).toBe(2);
    expect(byteLength("€")).toBe(3);
    expect(byteLength("😀")).toBe(4);
  });
});
