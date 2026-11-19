import { describe, expect, it } from "vitest";
import { count, currentTrace, noteAi, phase, phaseSync, Trace, withTrace } from "./timing";

/** Une horloge qu'on avance à la main. */
function clock() {
  let t = 1000;
  return { now: () => t, tick: (ms: number) => (t += ms) };
}

const ai = { label: "readCode", model: "anthropic/claude-haiku-5.5", inputTokens: 25445, outputTokens: 507, cachedTokens: 0, reasoningTokens: 0, finish: "stop" };

describe("Trace", () => {
  it("garde le début et la durée de chaque phase, réussie ou non", async () => {
    const c = clock();
    const trace = new Trace(c.now);
    c.tick(100);
    await trace.phase("faits", async () => void c.tick(3000));
    await expect(
      trace.phase("code", async () => {
        c.tick(500);
        throw new Error("panne");
      }),
    ).rejects.toThrow("panne");
    expect(trace.phaseSync("barème", () => (c.tick(20), 7))).toBe(7);
    expect(trace.phases).toEqual([
      { name: "faits", at: 100, ms: 3000, ok: true },
      { name: "code", at: 3100, ms: 500, ok: false },
      { name: "barème", at: 3600, ms: 20, ok: true },
    ]);
    expect(trace.elapsed()).toBe(3620);
  });

  it("écrit une ligne compacte : phases dans l'ordre, appels GitHub, modèle et tokens de chaque lecture", async () => {
    const c = clock();
    const trace = new Trace(c.now);
    await trace.phase("faits", async () => {
      await trace.phase("gh.profil", async () => void c.tick(400));
      await trace.phase("gh.arbres", async () => void c.tick(2600));
      trace.count("rest", 65);
      trace.count("graphql", 16);
    });
    await trace.phase("fichiers", async () => void c.tick(1800));
    await trace.phase("code", async () => {
      c.tick(3600);
      trace.noteAi({ ...ai, ms: 3600 });
    });
    trace.phaseSync("barème", () => c.tick(40));
    expect(trace.line("[fiche abc] 8.4 s · github · file 0.0")).toBe(
      "[fiche abc] 8.4 s · github · file 0.0 · faits@0.0+3.0 (fin arbres, rest 65, graphql 16) · fichiers@3.0+1.8 · code@4.8+3.6 (claude-haiku-5.5 25445→507 3.6s) · barème@8.4+0.0",
    );
  });

  it("dit le raisonnement, le cache, une relance et un échec", async () => {
    const c = clock();
    const trace = new Trace(c.now);
    await trace
      .phase("parcours", async () => {
        c.tick(9000);
        trace.noteAi({ ...ai, label: "readCv", ms: 9000, outputTokens: 5815, reasoningTokens: 4642, cachedTokens: 7058, finish: "length" });
        c.tick(3000);
        trace.noteAi({ ...ai, label: "readCv", ms: 3000, inputTokens: 0, outputTokens: 0, finish: "error" });
        throw new Error("panne");
      })
      .catch(() => {});
    trace.count("linkedin_cache");
    expect(trace.line("x")).toBe(
      "x · parcours@0.0+12.0! (claude-haiku-5.5 25445→5815 raisonnement 4642 cache 7058 9.0s length, claude-haiku-5.5 0→0 3.0s error) · linkedin_cache 1",
    );
  });

  it("deux lectures en parallèle gardent chacune leurs appels", async () => {
    const c = clock();
    const trace = new Trace(c.now);
    const code = trace.phase("code", async () => {
      await Promise.resolve();
      c.tick(4000);
      trace.noteAi({ ...ai, ms: 4000 });
    });
    const cv = trace.phase("parcours", async () => {
      await Promise.resolve();
      await Promise.resolve();
      c.tick(2000);
      trace.noteAi({ ...ai, label: "readCv", ms: 6000, outputTokens: 1700 });
    });
    await Promise.all([code, cv]);
    const line = trace.line("x");
    expect(line).toContain("code@0.0+4.0 (claude-haiku-5.5 25445→507 4.0s)");
    expect(line).toContain("parcours@0.0+6.0 (claude-haiku-5.5 25445→1700 6.0s)");
  });
});

describe("la trace de la fiche en cours", () => {
  it("suit le fil asynchrone, et deux fiches en même temps ne se mélangent pas", async () => {
    const a = new Trace();
    const b = new Trace();
    const work = async (n: number) => {
      await phase("faits", async () => {
        await new Promise((r) => setTimeout(r, 5));
        count("rest", n);
      });
      phaseSync("barème", () => noteAi({ ...ai, ms: 1 }));
      return currentTrace();
    };
    const [ta, tb] = await Promise.all([withTrace(a, () => work(1)), withTrace(b, () => work(2))]);
    expect(ta).toBe(a);
    expect(tb).toBe(b);
    expect(a.counts).toEqual({ rest: 1 });
    expect(b.counts).toEqual({ rest: 2 });
    expect(a.phases.map((p) => p.name)).toEqual(["faits", "barème"]);
    expect(a.ai).toHaveLength(1);
  });

  it("hors d'une fiche, tout est sans effet et rend la valeur", async () => {
    expect(currentTrace()).toBeUndefined();
    expect(await phase("faits", async () => 3)).toBe(3);
    expect(phaseSync("barème", () => 4)).toBe(4);
    count("rest");
    noteAi({ ...ai, ms: 1 });
  });
});
