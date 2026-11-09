// Le script de référence (§18.3) sur cinq faux profils, moteur simulé, sans réseau.

import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CodeReadingResult, RepoFiles } from "../../shared/readings";
import { STAT_CODES, tierFor, type StatCode } from "../../shared/types";
import { EngineError } from "./github/http";
import { TokenPool } from "./github/tokens";
import type { CardBody } from "./pipeline";
import { aggregate, hashLogin, parseLogins, readWork, referenceOverall, runPercentiles, type CardLine, type Engine, type RunOptions } from "./percentiles";
import { overallOf } from "./scoring/common";
import { SCORING } from "./scoring/config";
import { AiClosedError } from "./ai/budget";

// Pseudos choisis pour ne ressembler à aucun langage, poste ou statut.
const LOGINS = ["Zorglub-Dev", "qwxv42", "maribel-codes", "ottokarst", "Yuki-Tanabe9"];

interface FakeFacts {
  login: string;
  i: number;
}

/** Profil i : langage et notes fixes ; le TEC vient de la lecture IA simulée (niveau 4 → 80), sinon 50. */
function fakeCard(f: FakeFacts, ai: CodeReadingResult | null): CardBody {
  const tec = ai?.readings.length ? 80 : 50;
  const values: Record<StatCode, number> = { TEC: tec, SHIP: 40 + 10 * f.i, ARCH: 30 + 5 * f.i, DOC: 60, XP: 50 + f.i, BUZZ: 20 };
  const overall = overallOf(values);
  return {
    source: "github",
    scoringVersion: SCORING.version,
    // Le pseudo traîne partout dans une vraie carte : il ne doit sortir nulle part.
    name: f.login,
    login: f.login,
    avatarUrl: `https://avatars.example/${f.login}`,
    initials: "ZZ",
    overall,
    tier: tierFor(overall),
    position: f.i % 2 ? "BE" : "FS",
    mainLanguage: f.i < 3 ? "python" : "rust",
    club: `${f.login} corp`,
    stats: STAT_CODES.map((code) => ({ code, value: values[code], sufficient: true, facts: [{ fr: f.login, en: f.login }] })),
    statuses: [
      { id: f.i === 0 ? "gh_lazy_commits" : "gh_polyglot", tone: "negative", label: { fr: f.login, en: f.login }, rule: { fr: "r", en: "r" } },
    ],
    reliability: 95,
    judgedInSeconds: 1,
    lang: "fr",
  };
}

let dir: string;
let spend: number;
let clock: number;
let calls: { collect: string[]; read: number; sleeps: number[] };
let logs: string[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tys-percentiles-"));
  spend = 0;
  clock = Date.parse("2026-11-09T10:00:00Z");
  calls = { collect: [], read: 0, sleeps: [] };
  logs = [];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function engine(over: Partial<Engine> = {}): Engine {
  return {
    async collectGithub(login: string) {
      calls.collect.push(login);
      const i = LOGINS.findIndex((l) => l.toLowerCase() === login);
      if (i < 0) throw new EngineError("unknown_user", `pseudo inconnu : ${login}`);
      return { login: LOGINS[i]!, i } satisfies FakeFacts;
    },
    async pickFilesForReading(facts: unknown): Promise<RepoFiles[]> {
      const f = facts as FakeFacts;
      return [{ repo: `${f.login}/app`, activity: 10, files: [{ path: "src/main.py", content: "print(1)" }] }];
    },
    async readCode(repos: RepoFiles[]): Promise<CodeReadingResult> {
      calls.read++;
      spend += 0.01;
      return {
        readings: repos.map((r) => ({ repo: r.repo, level: 4, evidence_file: "src/main.py", evidence_quote: "", observed_traits: [] })),
        ai_status: null,
      };
    },
    aiAvailable: () => true,
    scoreGithub: (facts: unknown, ai: CodeReadingResult | null) => fakeCard(facts as FakeFacts, ai),
    ...over,
  };
}

function opts(over: Partial<RunOptions> = {}): RunOptions {
  return {
    lines: [...LOGINS, "", "# commentaire", "pas un pseudo !", `https://github.com/${LOGINS[0]}`],
    workPath: join(dir, "var/work.jsonl"),
    outPath: join(dir, "data/percentiles.json"),
    engine: engine(),
    pool: new TokenPool(["jeton-de-test"], () => clock),
    spentUsd: () => spend,
    aiSample: 5,
    maxUsd: 1,
    minGroup: 1,
    sleep: async (ms) => {
      calls.sleeps.push(ms);
      clock += ms;
    },
    now: () => clock,
    log: (s) => logs.push(s),
    ...over,
  };
}

/** Aucune trace d'un pseudo de l'entrée, quelle que soit la casse. */
function expectNoLogin(text: string) {
  const lower = text.toLowerCase();
  for (const l of LOGINS) expect(lower).not.toContain(l.toLowerCase());
  // Ni morceau de pseudo assez long pour l'identifier.
  for (const l of LOGINS) for (const part of l.toLowerCase().split("-").filter((p) => p.length >= 5)) expect(lower).not.toContain(part);
}

describe("parseLogins", () => {
  it("garde les pseudos valides, en minuscules, sans doublon (URL et @ compris)", () => {
    expect(parseLogins(["Foo", "@foo", "https://github.com/Bar/repo", "", "# x", "pas valide !", "baz"])).toEqual({
      logins: ["foo", "bar", "baz"],
      invalid: 1,
    });
  });
});

describe("runPercentiles", () => {
  it("note les cinq profils et n'écrit que des agrégats, sans aucun pseudo", async () => {
    const res = await runPercentiles(opts());
    expect(res.complete).toBe(true);
    expect(res.scored).toBe(5);
    expect(calls.collect).toHaveLength(5); // le doublon en URL n'est pas refait

    const out = readFileSync(join(dir, "data/percentiles.json"), "utf8");
    expectNoLogin(out);
    const t = JSON.parse(out);
    expect(Object.keys(t).sort()).toEqual(["generatedAt", "minGroup", "overall", "profiles", "scoringVersion", "source", "statuses", "tec"]);
    expect(t).toMatchObject({ scoringVersion: SCORING.version, source: "github", generatedAt: "2026-11-09", profiles: 5, tec: { real: 5 } });
    expect(t.overall.all.n).toBe(5);
    expect(t.overall.all.centiles).toHaveLength(99);
    expect(Object.keys(t.overall.language).sort()).toEqual(["python", "rust"]);
    expect(t.overall.language.python.n).toBe(3);
    expect(Object.keys(t.overall.position).sort()).toEqual(["BE", "FS"]);
    // Fréquences : tout le catalogue GitHub, 0 si jamais vu.
    expect(t.statuses.gh_lazy_commits).toBe(20);
    expect(t.statuses.gh_polyglot).toBe(80);
    expect(t.statuses.gh_no_tests).toBe(0);
    expect(Object.keys(t.statuses).some((id) => id.startsWith("cv_"))).toBe(false);
    // Que des nombres et des clés de groupe ou de statut : rien d'autre ne sort.
    const strings: string[] = [];
    JSON.parse(out, (_k, v) => (typeof v === "string" && strings.push(v), v));
    expect(strings.sort()).toEqual(["2026-11-09", SCORING.version, "github"].sort());

    // Le fichier de travail : des hachages et des notes, pas de pseudo non plus.
    const work = readFileSync(join(dir, "var/work.jsonl"), "utf8");
    expectNoLogin(work);
    const { header, lines } = readWork(join(dir, "var/work.jsonl"));
    expect(lines.map((l) => l.h).sort()).toEqual(LOGINS.map((l) => hashLogin(header!.salt, l)).sort());
    expect(logs.join("\n")).not.toMatch(/zorglub|qwxv42|maribel|ottokarst|yuki/i);
  });

  it("reprend où il s'est arrêté après une interruption, même avec une ligne coupée", async () => {
    const ac = new AbortController();
    const base = engine();
    const first = await runPercentiles(
      opts({
        signal: ac.signal,
        engine: engine({
          async collectGithub(login, o) {
            if (calls.collect.length === 2) {
              ac.abort(new Error("Ctrl-C"));
              throw new Error("aborted");
            }
            return base.collectGithub(login, o);
          },
        }),
      }),
    );
    expect(first.complete).toBe(false);
    expect(first.scored).toBe(2);
    expect(existsSync(join(dir, "data/percentiles.json"))).toBe(false);
    // Arrêt brutal pendant une écriture : une ligne à moitié écrite.
    appendFileSync(join(dir, "var/work.jsonl"), '{"k":"card","h":"abc');

    const done = new Set(calls.collect.slice(0, 2));
    calls.collect = [];
    const second = await runPercentiles(opts());
    expect(second.complete).toBe(true);
    expect(calls.collect).toHaveLength(3);
    expect(calls.collect.some((l) => done.has(l))).toBe(false);
    expect(second.table!.profiles).toBe(5);

    // Troisième passage : tout est fait, ni GitHub ni l'IA.
    calls.collect = [];
    calls.read = 0;
    const third = await runPercentiles(opts());
    expect(calls.collect).toEqual([]);
    expect(calls.read).toBe(0);
    expect(third.table!.profiles).toBe(5);
  });

  it("respecte le plafond de dépense IA, y compris d'un passage à l'autre", async () => {
    const res = await runPercentiles(opts({ maxUsd: 0.025 }));
    // 0,01 $ par lecture : après deux, 0,02 + 0,01 dépasserait 0,025.
    expect(calls.read).toBe(2);
    expect(res.spentUsd).toBeCloseTo(0.02);
    expect(res.table!.tec.real).toBe(2);
    expect(res.table!.tec.imputedDelta).toBe(30); // 80 réel − 50 de repli
    expect(logs.some((l) => l.includes("Plafond IA atteint"))).toBe(true);

    // Nouveau passage avec un pseudo de plus : la dépense passée compte toujours.
    calls.read = 0;
    const again = await runPercentiles(opts({ maxUsd: 0.025, lines: [...LOGINS, "inconnu-total"] }));
    expect(calls.read).toBe(0);
    expect(again.spentUsd).toBeCloseTo(0.02);
  });

  it("--max-usd 0 : aucune lecture IA", async () => {
    const res = await runPercentiles(opts({ maxUsd: 0 }));
    expect(calls.read).toBe(0);
    expect(res.table!.tec.real).toBe(0);
  });

  it("IA fermée en route (plafond du jour, crédit) : la suite passe sans lecture", async () => {
    const res = await runPercentiles(
      opts({
        engine: engine({
          async readCode() {
            throw new AiClosedError("credits");
          },
        }),
      }),
    );
    expect(res.complete).toBe(true);
    expect(res.table!.tec).toEqual({ real: 0, imputedDelta: null });
  });

  it("pseudo inconnu : noté comme ignoré, jamais redemandé", async () => {
    await runPercentiles(opts({ lines: [...LOGINS, "inconnu-total"] }));
    expect(calls.collect).toHaveLength(6);
    calls.collect = [];
    const res = await runPercentiles(opts({ lines: [...LOGINS, "inconnu-total"] }));
    expect(calls.collect).toEqual([]);
    expect(res.skipped).toBe(1);
    expect(readFileSync(join(dir, "var/work.jsonl"), "utf8")).not.toContain("inconnu");
  });

  it("GitHub à sec : attend la remise à zéro au lieu d'échouer, et refait l'appel limité", async () => {
    const pool = new TokenPool(["jeton-de-test"], () => clock);
    const got = pool.acquire("core");
    if (!got.lease) throw new Error("jeton attendu");
    pool.record(
      got.lease,
      new Headers({ "x-ratelimit-remaining": "0", "x-ratelimit-limit": "5000", "x-ratelimit-reset": String((clock + 600_000) / 1000) }),
    );
    let limited = false;
    const base = engine();
    const res = await runPercentiles(
      opts({
        pool,
        engine: engine({
          async collectGithub(login, o) {
            if (!limited && calls.collect.length === 3) {
              limited = true;
              calls.collect.push(login);
              throw new EngineError("rate_limited", "GitHub rate limit");
            }
            return base.collectGithub(login, o);
          },
        }),
      }),
    );
    expect(res.complete).toBe(true);
    expect(res.scored).toBe(5);
    expect(calls.sleeps[0]).toBeGreaterThanOrEqual(600_000); // la remise à zéro, pas une erreur
    expect(calls.sleeps).toContain(60_000); // limite sans date connue : une minute
    expect(calls.collect).toHaveLength(6); // le profil limité est refait
  });

  it("refuse un sel différent de celui du fichier de travail", async () => {
    await runPercentiles(opts({ salt: "sel-un" }));
    await expect(runPercentiles(opts({ salt: "sel-deux" }))).rejects.toThrow(/autre sel/);
  });

  it("trop peu de profils pour la taille de groupe : rien d'écrit", async () => {
    const res = await runPercentiles(opts({ minGroup: 100 }));
    expect(res.table).toBeNull();
    expect(existsSync(join(dir, "data/percentiles.json"))).toBe(false);
  });

  it("--aggregate-only : sortie depuis le fichier de travail, sans GitHub ni IA", async () => {
    await runPercentiles(opts());
    calls.collect = [];
    calls.read = 0;
    const res = await runPercentiles(opts({ aggregateOnly: true, lines: [] }));
    expect(res.table!.profiles).toBe(5);
    expect(calls.collect).toEqual([]);
  });
});

describe("aggregate", () => {
  const line = (over: Partial<CardLine>): CardLine => ({
    k: "card",
    h: "h",
    v: SCORING.version,
    overall: 50,
    stats: { TEC: 50, SHIP: 50, ARCH: 50, DOC: 50, XP: 50, BUZZ: 10 },
    tecFallback: 50,
    tecReal: false,
    language: "go",
    position: "BE",
    statuses: [],
    usd: 0,
    ...over,
  });

  it("impute aux profils non lus l'écart médian réel − repli des profils lus", () => {
    const read = [10, 20, 30].map((d) => line({ tecReal: true, stats: { TEC: 50 + d, SHIP: 50, ARCH: 50, DOC: 50, XP: 50, BUZZ: 10 } }));
    const unread = line({ tecFallback: 54, stats: { TEC: 54, SHIP: 50, ARCH: 50, DOC: 50, XP: 50, BUZZ: 10 } });
    const t = aggregate([...read, unread], { minGroup: 1 })!;
    expect(t.tec).toEqual({ real: 3, imputedDelta: 20 });
    expect(referenceOverall(unread, 20)).toBe(overallOf({ ...unread.stats, TEC: 74 }));
    // Un profil lu garde sa note telle quelle.
    expect(referenceOverall(read[0]!, 20)).toBe(read[0]!.overall);
  });

  it("ignore les lignes d'un autre barème, et les groupes trop petits", () => {
    const lines = [...Array.from({ length: 4 }, () => line({})), line({ v: "0.0.0", language: "zig" }), line({ language: "ocaml" })];
    const t = aggregate(lines, { minGroup: 2 })!;
    expect(t.profiles).toBe(5);
    expect(Object.keys(t.overall.language)).toEqual(["go"]);
    expect(aggregate(lines, { minGroup: 6 })).toBeNull();
  });
});
