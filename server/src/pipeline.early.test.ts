// Rien n'attend ce qui ne lui sert pas (SPEC §18.89) : la lecture du code et celle
// du LinkedIn partent pendant la collecte GitHub, dès que leurs entrées existent ;
// à l'entrée LinkedIn, le GitHub prouvé par l'email se collecte pendant la lecture
// du profil. Mêmes fiches, mêmes replis.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardData, ComparisonData } from "../../shared/types";
import { Store } from "./db";
import { FILES, deferred, fakeEngine } from "./__fixtures__/fakeEngine";
import type { GithubLookup, LinkedinFinder, LinkedinProfile, UrlLookup } from "./linkedinProfile/index";
import { Pipeline, type Deps, type JobInput } from "./pipeline";

const LOGIN = "camille-ardent";
const URL = "https://www.linkedin.com/in/camille-ardent";
const PROFILE: LinkedinProfile = { url: URL, name: "Camille Ardent", headline: "Développeuse", title: "Développeuse", summary: "", roles: [], education: [], skills: [] };
const FULL = { login: LOGIN, profile: { login: LOGIN }, repos: [], activeRepos: [], trees: [], commits: [] };
const PARTIAL_PROFILE = { schema: 1, login: LOGIN, profile: { login: LOGIN } };
const READABLE = { repos: [], activeRepos: ["api"], trees: [], commits: [] };

type CollectOpts = Parameters<Deps["collectGithub"]>[1];

const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
  vi.restoreAllMocks();
});

function setup(over: Partial<Deps> = {}, linkedin?: LinkedinFinder) {
  const store = new Store(":memory:");
  stores.push(store);
  const { deps, calls } = fakeEngine(over);
  const pipeline = new Pipeline({ store, deps, githubToken: "t", timingLog: false, ...(linkedin ? { linkedin } : {}) });
  const run = async (input: Omit<JobInput, "lang">) => {
    const { id } = pipeline.start({ lang: "fr", ...input });
    await pipeline.wait(id);
    return { id, row: store.getCard(id), state: pipeline.jobState(id) };
  };
  return { store, pipeline, calls, run };
}

/** Laisse courir les suites déjà prêtes, sans rien résoudre de plus. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("la lecture du code part pendant la collecte", () => {
  it("dès que les arbres et les commits sont là, sur ces faits-là, une seule fois", async () => {
    const gate = deferred();
    const picked: unknown[] = [];
    const { pipeline, calls, store } = setup({
      async collectGithub(_login, opts) {
        opts.onReadable?.(READABLE);
        await gate.promise;
        return FULL;
      },
      async pickFilesForReading(facts) {
        picked.push(facts);
        return FILES;
      },
    });
    const { id } = pipeline.start({ lang: "fr", login: LOGIN });
    await settle();
    // La collecte n'a pas fini : les fichiers sont choisis et la lecture IA est partie.
    expect(calls).toEqual(["collectGithub", "pickFilesForReading", "readCode"]);
    expect(picked).toEqual([READABLE]);
    gate.resolve();
    await pipeline.wait(id);
    expect(calls).toEqual(["collectGithub", "pickFilesForReading", "readCode", "scoreGithub"]);
    expect(store.getCard(id)).toMatchObject({ source: "github", degraded: false, ai: { readings: [] } });
  });

  it("une collecte qui ne donne rien en avance : la lecture part à sa fin, sur les faits entiers", async () => {
    const picked: unknown[] = [];
    const { run, calls } = setup({
      async collectGithub() {
        return FULL;
      },
      async pickFilesForReading(facts) {
        picked.push(facts);
        return FILES;
      },
    });
    const { row } = await run({ login: LOGIN });
    expect(calls).toEqual(["collectGithub", "pickFilesForReading", "readCode", "scoreGithub"]);
    expect(picked).toEqual([FULL]);
    expect(row).toMatchObject({ degraded: false });
  });

  it("la collecte échoue après le départ de la lecture : c'est son erreur qui sort, pas de fiche", async () => {
    const reading = deferred<{ readings: []; ai_status: null }>();
    const { run } = setup({
      async collectGithub(_login, opts) {
        opts.onReadable?.(READABLE);
        await settle();
        throw Object.assign(new Error("pseudo inconnu"), { code: "unknown_user" });
      },
      readCode: () => reading.promise,
    });
    const { row, state } = await run({ login: LOGIN });
    expect(row).toBeNull();
    expect(state).toMatchObject({ state: "error", code: "unknown_user" });
    reading.reject(new Error("coupée")); // la lecture abandonnée ne laisse aucun rejet sans maître
    await settle();
  });

  it("la lecture partie en avance échoue : la fiche sort dégradée, comme avant", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { run } = setup({
      async collectGithub(_login, opts) {
        opts.onReadable?.(READABLE);
        await settle();
        return FULL;
      },
      async readCode() {
        throw new Error("fournisseur en panne");
      },
    });
    const { row } = await run({ login: LOGIN });
    expect(row).toMatchObject({ source: "github", degraded: true, ai: null });
  });

  it("IA fermée pendant la lecture partie en avance : la fiche échoue en closed", async () => {
    const { run } = setup({
      async collectGithub(_login, opts) {
        opts.onReadable?.(READABLE);
        await settle();
        return FULL;
      },
      async readCode() {
        throw Object.assign(new Error("plafond du jour"), { code: "closed" });
      },
    });
    const { row, state } = await run({ login: LOGIN });
    expect(row).toBeNull();
    expect(state).toMatchObject({ state: "error", code: "closed" });
  });

  it("rien à lire : pas d'appel IA, fiche non dégradée", async () => {
    const { run, calls } = setup({
      async collectGithub(_login, opts) {
        opts.onReadable?.(READABLE);
        return FULL;
      },
      async pickFilesForReading() {
        return [];
      },
    });
    const { row } = await run({ login: LOGIN });
    expect(calls).not.toContain("readCode");
    expect(row).toMatchObject({ degraded: false, ai: null });
  });
});

describe("la lecture du LinkedIn part dès le profil GitHub", () => {
  function finder(found: Promise<GithubLookup | null> | GithubLookup | null = { profile: PROFILE, proven: true }) {
    const seen: unknown[] = [];
    const f: LinkedinFinder = {
      async forGithub(facts) {
        seen.push(facts);
        return found;
      },
      async forUrl(): Promise<UrlLookup> {
        return { status: "not_found" };
      },
    };
    return { f, seen };
  }

  it("sur le profil seul, pendant la collecte, une seule fois ; le code et le parcours se lisent ensemble", async () => {
    const gate = deferred();
    const { f, seen } = finder();
    const { pipeline, calls, store } = setup(
      {
        async collectGithub(_login, opts: CollectOpts) {
          opts.onProfile?.(PARTIAL_PROFILE);
          opts.onReadable?.(READABLE);
          await gate.promise;
          return FULL;
        },
      },
      f,
    );
    const { id } = pipeline.start({ lang: "fr", login: LOGIN });
    await settle();
    // La collecte tourne encore : le LinkedIn est trouvé, les deux lectures IA sont parties.
    expect(seen).toEqual([PARTIAL_PROFILE]);
    expect(calls).toEqual(expect.arrayContaining(["collectGithub", "pickFilesForReading", "readCode", "readCv"]));
    expect(calls).not.toContain("scoreDossier");
    gate.resolve();
    await pipeline.wait(id);
    // Un dossier, une note : un seul calcul, et le chercheur n'a pas été rappelé sur les faits entiers.
    expect(seen).toHaveLength(1);
    expect(calls.filter((c) => c === "scoreDossier")).toHaveLength(1);
    expect(calls.filter((c) => c === "readCv")).toHaveLength(1);
    const row = store.getCard(id)!;
    expect(row).toMatchObject({ kind: "comparison", source: "linkedin", login: LOGIN });
    expect((row.facts as { linkedinProven?: boolean }).linkedinProven).toBe(true);
  });

  it("une collecte qui ne donne rien en avance : le chercheur part à sa fin, sur les faits entiers", async () => {
    const { f, seen } = finder();
    const { run } = setup(
      {
        async collectGithub() {
          return FULL;
        },
      },
      f,
    );
    const { row } = await run({ login: LOGIN });
    expect(seen).toEqual([FULL]);
    expect(row).toMatchObject({ kind: "comparison", source: "linkedin" });
  });

  it("aucun LinkedIn trouvé : la fiche GitHub sort seule", async () => {
    const { f } = finder(null);
    const { run } = setup(
      {
        async collectGithub(_login, opts: CollectOpts) {
          opts.onProfile?.(PARTIAL_PROFILE);
          return FULL;
        },
      },
      f,
    );
    const { row } = await run({ login: LOGIN });
    expect(row).toMatchObject({ kind: "card", source: "github", degraded: false });
  });
});

describe("entrée LinkedIn : le GitHub de l'identité", () => {
  function entryFinder(gate: Promise<void>, githubLogin: string | null = null) {
    const f: LinkedinFinder = {
      async forGithub() {
        return null;
      },
      async forUrl(): Promise<UrlLookup> {
        await gate;
        return { status: "found", profile: PROFILE, githubLogin };
      },
    };
    return f;
  }

  it("prouvé par l'email : sa collecte part pendant la lecture du profil", async () => {
    const gate = deferred();
    const collected: string[] = [];
    const { pipeline, calls, store } = setup(
      {
        async collectGithub(login) {
          collected.push(login);
          return { ...FULL, login, profile: { login } };
        },
      },
      entryFinder(gate.promise),
    );
    const { id } = pipeline.start({ lang: "fr", linkedinUrl: URL, identity: { githubLogin: LOGIN, how: "email", sureProfile: true } });
    await settle();
    // Le profil n'est pas encore lu : le GitHub est collecté et son code lu.
    expect(collected).toEqual([LOGIN]);
    expect(calls).toEqual(expect.arrayContaining(["collectGithub", "pickFilesForReading", "readCode"]));
    expect(calls).not.toContain("readCv");
    gate.resolve();
    await pipeline.wait(id);
    // Une seule collecte, un dossier prouvé.
    expect(collected).toEqual([LOGIN]);
    const row = store.getCard(id)!;
    expect(row).toMatchObject({ kind: "comparison", source: "linkedin", login: LOGIN });
    expect((row.facts as { linkedinProven?: boolean }).linkedinProven).toBe(true);
    expect((row.data as ComparisonData).github.login).toBe(LOGIN);
  });

  it("trouvé par le nom seulement : rien ne part avant le profil, dont les liens passent devant", async () => {
    const gate = deferred();
    const collected: string[] = [];
    const { pipeline, store } = setup(
      {
        async collectGithub(login) {
          collected.push(login);
          return { ...FULL, login, profile: { login } };
        },
      },
      entryFinder(gate.promise, "autre-compte"),
    );
    const { id } = pipeline.start({ lang: "fr", linkedinUrl: URL, identity: { githubLogin: LOGIN, how: "name", sureProfile: true } });
    await settle();
    expect(collected).toEqual([]);
    gate.resolve();
    await pipeline.wait(id);
    expect(collected).toEqual(["autre-compte"]);
    const row = store.getCard(id)!;
    expect(row).toMatchObject({ kind: "comparison", login: "autre-compte" });
    // Un GitHub trouvé sans preuve ne prouve pas le lien (§18.24, §18.80).
    expect((row.facts as { linkedinProven?: boolean }).linkedinProven).toBe(false);
  });

  it("GitHub de l'identité masqué par son propriétaire : rien ne part, la fiche LinkedIn sort seule", async () => {
    const collected: string[] = [];
    const { store, run } = setup(
      {
        async collectGithub(login) {
          collected.push(login);
          return FULL;
        },
      },
      entryFinder(Promise.resolve()),
    );
    store.claimOwner(LOGIN, 1);
    store.setOwnerHidden(LOGIN, true);
    const { row } = await run({ linkedinUrl: URL, identity: { githubLogin: LOGIN, how: "email", sureProfile: true } });
    expect(collected).toEqual([]);
    expect(row).toMatchObject({ kind: "card", source: "linkedin" });
    expect((row!.data as CardData).source).toBe("cv");
  });

  it("le profil est introuvable : la fiche échoue en linkedin, la collecte partie en avance est coupée", async () => {
    let aborted = false;
    const f: LinkedinFinder = {
      async forGithub() {
        return null;
      },
      async forUrl(): Promise<UrlLookup> {
        await settle();
        return { status: "not_found" };
      },
    };
    const { run } = setup(
      {
        collectGithub: (_login, opts) =>
          new Promise((_, reject) => {
            opts.signal?.addEventListener("abort", () => {
              aborted = true;
              reject(new Error("coupée"));
            });
          }),
      },
      f,
    );
    const { row, state } = await run({ linkedinUrl: URL, identity: { githubLogin: LOGIN, how: "email", sureProfile: true } });
    expect(row).toBeNull();
    expect(state).toMatchObject({ state: "error", code: "linkedin" });
    expect(aborted).toBe(true);
  });
});
