// Le chien de garde de la lecture (docs/cinematique-poursuite.md §5.5).
import { describe, expect, it } from "vitest";
import { FREEZE_MS, PlaybackWatchdog } from "./watchdog";

/** L'horloge d'une vidéo qui avance à 24 i/s jusqu'à `until` (ms), puis se fige. */
const clockAt = (ms: number, until = Infinity) => Math.min(ms, until) / 1000;

describe("le chien de garde de la lecture", () => {
  it("une horloge qui avance : rien à signaler", () => {
    const d = new PlaybackWatchdog();
    d.arm(0, 0);
    for (let t = 16; t < 10_000; t += 16) expect(d.check(t, clockAt(t))).toBe("ok");
    expect(d.retries).toBe(0);
  });

  it("figée plus d'une seconde et demie : une relance, puis le flash si elle reste figée", () => {
    const d = new PlaybackWatchdog();
    d.arm(0, 0);
    const frozenAt = 2000;
    const seen: string[] = [];
    for (let t = 16; t < 8000; t += 16) {
      const a = d.check(t, clockAt(t, frozenAt));
      if (a !== "ok") seen.push(`${a}@${Math.round((t - frozenAt) / 100) * 100}`);
    }
    // la relance après 1,5 s figée, le flash 1,5 s plus tard ; plus rien ensuite
    expect(seen).toEqual([`retry@${FREEZE_MS}`, `fail@${2 * FREEZE_MS}`]);
    expect(d.watching).toBe(false);
  });

  it("une relance qui marche : la lecture continue ; un second incident plus tard : le flash", () => {
    const d = new PlaybackWatchdog();
    d.arm(0, 0);
    expect(d.check(1600, 0)).toBe("retry");
    // elle repart
    expect(d.check(1700, 0.1)).toBe("ok");
    expect(d.check(3000, 1.4)).toBe("ok");
    // figée de nouveau
    expect(d.check(3000 + FREEZE_MS - 1, 1.4)).toBe("ok");
    expect(d.check(3000 + FREEZE_MS, 1.4)).toBe("fail");
  });

  it("une pause non demandée : une relance, puis le flash", () => {
    const d = new PlaybackWatchdog();
    d.arm(0, 0);
    expect(d.incident(500)).toBe("retry");
    expect(d.incident(900)).toBe("fail");
  });

  it("désarmé (pause demandée, onglet caché, gel de fin) : une horloge immobile n'est pas un incident", () => {
    const d = new PlaybackWatchdog();
    expect(d.check(10_000, 0)).toBe("ok");
    d.arm(0, 0);
    d.disarm();
    expect(d.check(60_000, 0)).toBe("ok");
    expect(d.incident(60_000)).toBe("ok");
    // réarmé à la reprise : le temps passé en pause ne compte pas
    d.arm(60_000, 0);
    expect(d.check(60_000 + FREEZE_MS - 1, 0)).toBe("ok");
  });

  it("la bascule vers la fin réarme sur la nouvelle balise", () => {
    const d = new PlaybackWatchdog();
    d.arm(0, 0);
    expect(d.check(1000, 1)).toBe("ok");
    // la fin part de son début : une horloge qui « recule » n'est pas figée
    d.arm(1000, 0.02);
    expect(d.check(1100, 0.1)).toBe("ok");
    expect(d.check(1100 + FREEZE_MS, 0.1)).toBe("retry");
  });
});
