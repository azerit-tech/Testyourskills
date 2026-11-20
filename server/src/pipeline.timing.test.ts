// Le chronométrage d'une fiche (SPEC §18.93) : une ligne par fiche, sortie ou en
// échec, avec ses phases et ses appels IA.

import { afterEach, describe, expect, it } from "vitest";
import { fakeClient } from "./ai/testing";
import { readCode } from "./ai/readCode";
import { resetBudgetForTests } from "./ai/budget";
import { Store } from "./db";
import { FILES, fakeEngine } from "./__fixtures__/fakeEngine";
import { Pipeline, type Deps } from "./pipeline";
import type { Trace } from "./timing";

function setup(over: Partial<Deps> = {}) {
  const store = new Store(":memory:");
  const { deps, calls } = fakeEngine(over);
  const lines: string[] = [];
  const traces: Trace[] = [];
  const pipeline = new Pipeline({
    store,
    deps,
    githubToken: "t",
    timingLog: (line, trace) => {
      lines.push(line);
      traces.push(trace);
    },
  });
  return { store, pipeline, calls, lines, traces };
}

afterEach(() => resetBudgetForTests());

describe("la ligne de chronométrage", () => {
  it("une fiche GitHub : ses phases dans l'ordre, sans pseudo", async () => {
    const { pipeline, lines, traces } = setup();
    const { id } = pipeline.start({ lang: "fr", login: "camille-ardent" });
    await pipeline.wait(id);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(new RegExp(`^\\[fiche ${id}\\] \\d+\\.\\d s · github · file 0\\.0 · faits@`));
    expect(traces[0]!.phases.map((p) => p.name)).toEqual(["faits", "fichiers", "code", "barème"]);
    expect(traces[0]!.phases.every((p) => p.ok)).toBe(true);
    expect(lines[0]).not.toContain("camille");
  });

  it("un CV seul : pdf, parcours, barème", async () => {
    const { pipeline, lines, traces } = setup();
    const { id } = pipeline.start({ lang: "fr", pdf: new Uint8Array([1, 2, 3]) });
    await pipeline.wait(id);
    expect(traces[0]!.phases.map((p) => p.name)).toEqual(["pdf", "parcours", "barème"]);
    expect(lines[0]).toContain(" · cv · ");
  });

  it("un dossier CV + GitHub : « dossier both », les deux lectures et un seul barème", async () => {
    const { pipeline, lines, traces } = setup();
    const { id } = pipeline.start({ lang: "fr", login: "camille-ardent", pdf: new Uint8Array([1, 2, 3]) });
    await pipeline.wait(id);
    expect(lines[0]).toContain(" · dossier both · ");
    const names = traces[0]!.phases.map((p) => p.name);
    expect(names.filter((n) => n === "barème")).toHaveLength(1);
    expect(names).toEqual(expect.arrayContaining(["faits", "fichiers", "code", "pdf", "parcours"]));
  });

  it("une fiche en échec sort aussi sa ligne, avec le code de l'erreur et la phase tombée", async () => {
    const { pipeline, lines } = setup({
      async collectGithub() {
        throw Object.assign(new Error("unknown_user"), { code: "unknown_user" });
      },
    });
    const { id } = pipeline.start({ lang: "fr", login: "ghost" });
    await pipeline.wait(id);
    expect(lines[0]).toMatch(/ · échec unknown_user · file 0\.0 · faits@0\.0\+0\.0!$/);
  });

  it("le temps passé en file est dit à part", async () => {
    const store = new Store(":memory:");
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { deps } = fakeEngine({
      async collectGithub(login) {
        if (login === "first") await gate;
        return { login };
      },
    });
    const lines: string[] = [];
    const pipeline = new Pipeline({ store, deps, githubToken: "t", maxConcurrent: 1, timingLog: (l) => lines.push(l) });
    const a = pipeline.start({ lang: "fr", login: "first" });
    const b = pipeline.start({ lang: "fr", login: "second" });
    await new Promise((r) => setTimeout(r, 120));
    release();
    await Promise.all([pipeline.wait(a.id), pipeline.wait(b.id)]);
    const waited = Number(/file (\d+\.\d)/.exec(lines.find((l) => l.includes(b.id))!)![1]);
    expect(waited).toBeGreaterThanOrEqual(0.1);
    expect(lines.find((l) => l.includes(a.id))).toContain("file 0.0");
  });

  it("un appel IA verse son modèle, ses tokens et sa durée à la trace de sa fiche", async () => {
    const { client } = fakeClient([{ readings: [{ repo: "api", observations: "", evidence_file: "src/a.ts", evidence_quote: "export const a = 1;", observed_traits: [], level: 3 }], ai_status: null }]);
    const { pipeline, lines, traces } = setup({ readCode: (repos, opts) => readCode(repos, { ...opts, client }) });
    const { id } = pipeline.start({ lang: "fr", login: "camille-ardent" });
    await pipeline.wait(id);
    expect(traces[0]!.ai).toHaveLength(1);
    expect(traces[0]!.ai[0]).toMatchObject({ label: "readCode", inputTokens: 5000, outputTokens: 200, cachedTokens: 4000, finish: "stop" });
    expect(lines[0]).toMatch(/code@\d+\.\d\+\d+\.\d \(gpt-oss-120b 5000→200 cache 4000 \d+\.\ds\)/);
    expect(FILES[0]!.files).toHaveLength(1);
  });

  it("`timingLog: false` coupe la ligne, et un journal qui casse ne casse pas la fiche", async () => {
    const store = new Store(":memory:");
    const quiet = new Pipeline({ store, deps: fakeEngine().deps, githubToken: "t", timingLog: false });
    const a = quiet.start({ lang: "fr", login: "a" });
    await quiet.wait(a.id);
    expect(store.getCard(a.id)).toBeTruthy();
    const broken = new Pipeline({
      store,
      deps: fakeEngine().deps,
      githubToken: "t",
      timingLog: () => {
        throw new Error("journal en panne");
      },
    });
    const b = broken.start({ lang: "fr", login: "b" });
    await broken.wait(b.id);
    expect(store.getCard(b.id)).toBeTruthy();
  });
});
