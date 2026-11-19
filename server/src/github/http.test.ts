// Le limiteur de concurrence des appels à GitHub : jamais plus de `max` en vol,
// et les appels urgents passent devant ceux qui attendent (SPEC §18.92).

import { describe, expect, it } from "vitest";
import { makeCtx, makeLimiter, urgent } from "./http";

/** Un appel qu'on termine à la main, et le journal des départs. */
function harness(max: number) {
  const limit = makeLimiter(max);
  const started: string[] = [];
  const release = new Map<string, () => void>();
  let inFlight = 0;
  let peak = 0;
  const call = (name: string, isUrgent = false) =>
    limit(
      () =>
        new Promise<string>((resolve) => {
          started.push(name);
          peak = Math.max(peak, ++inFlight);
          release.set(name, () => {
            inFlight--;
            resolve(name);
          });
        }),
      isUrgent,
    );
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return { call, started, release, tick, peak: () => peak };
}

describe("makeLimiter", () => {
  it("jamais plus de `max` appels en vol, les autres dans leur ordre d'arrivée", async () => {
    const h = harness(2);
    const all = ["a", "b", "c", "d"].map((n) => h.call(n));
    await h.tick();
    expect(h.started).toEqual(["a", "b"]);
    h.release.get("a")!();
    await h.tick();
    expect(h.started).toEqual(["a", "b", "c"]);
    h.release.get("b")!();
    h.release.get("c")!();
    await h.tick();
    h.release.get("d")!();
    expect(await Promise.all(all)).toEqual(["a", "b", "c", "d"]);
    expect(h.peak()).toBe(2);
  });

  it("un appel urgent passe devant ceux qui attendent, pas devant ceux qui sont partis", async () => {
    const h = harness(1);
    const all = [h.call("a"), h.call("b"), h.call("c"), h.call("u1", true), h.call("u2", true)];
    await h.tick();
    expect(h.started).toEqual(["a"]);
    for (const next of ["a", "u1", "u2", "b", "c"]) {
      h.release.get(next)!();
      await h.tick();
    }
    await Promise.all(all);
    // Les urgents d'abord, entre eux dans leur ordre d'arrivée ; le plafond tient.
    expect(h.started).toEqual(["a", "u1", "u2", "b", "c"]);
    expect(h.peak()).toBe(1);
  });

  it("un appel qui lève rend sa place", async () => {
    const limit = makeLimiter(1);
    await expect(limit(() => Promise.reject(new Error("panne")))).rejects.toThrow("panne");
    expect(await limit(async () => "suite")).toBe("suite");
  });
});

describe("urgent", () => {
  it("le même contexte (jetons, compteurs, plafond), dont les appels passent devant", async () => {
    const ctx = makeCtx("t");
    const seen: boolean[] = [];
    const first = urgent({ ...ctx, limit: (fn, u) => (seen.push(!!u), fn()) });
    expect(first.pool).toBe(ctx.pool);
    expect(first.calls).toBe(ctx.calls);
    await first.limit(async () => 1);
    expect(seen).toEqual([true]);
  });
});
