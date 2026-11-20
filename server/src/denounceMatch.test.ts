// La dénonciation trouve l'autre source d'office (SPEC §18.121) : par LinkedIn, le GitHub
// qui va avec son nom et un employeur ou une école en commun est attaché, prouvé, et la fiche
// entre au top ; un compte qui ne va qu'avec son nom reste une proposition. La recherche part
// dès le départ avec le nom de la suggestion, et la collecte du compte qu'il désigne aussi :
// rien ne s'ajoute à la durée de la fiche.

import { afterEach, describe, expect, it } from "vitest";
import type { ComparisonData, Proposal } from "../../shared/types";
import { Store } from "./db";
import { deferred, fakeEngine } from "./__fixtures__/fakeEngine";
import type { GithubLookup, LinkedinFinder, LinkedinProfile, UrlLookup } from "./linkedinProfile/index";
import type { GithubAccount, GithubFound } from "./match/github";
import { openProposal } from "./match/store";
import { Pipeline, type Deps, type JobInput, type PipelineOptions } from "./pipeline";
import { enteringRootIds } from "./top";

const URL = "https://www.linkedin.com/in/jacquesmougeot";
const PROFILE: LinkedinProfile = {
  url: URL,
  name: "Jacques Mougeot",
  headline: "Fondateur",
  title: "Fondateur",
  summary: "",
  roles: [{ title: "Fondateur", company: "Azerit", start: "2024-01", end: null, description: "" }],
  education: [{ school: "École polytechnique", degree: "", field: "", start: 2018, end: 2022 }],
  skills: [],
};
const acct = (login: string, extra: Partial<GithubAccount> = {}): GithubAccount => ({ login, name: null, avatarUrl: `https://avatars.example/${login}`, bio: null, company: null, websiteUrl: null, socialAccounts: [], ...extra });
/** @jmougeot tel que GitHub le rendait le 20 novembre 2026 : « Jacques », son site azerit.tech. */
const JMOUGEOT = acct("jmougeot", { name: "Jacques", websiteUrl: "https://www.azerit.tech" });
const facts = (login: string) => ({ login, profile: { login, name: "Jacques" }, repos: [], activeRepos: [], trees: [], commits: [] });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const settle = () => sleep(0);

const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
});

function setup(o: { over?: Partial<Deps>; linkedin: LinkedinFinder; propose: NonNullable<PipelineOptions["propose"]> }) {
  const store = new Store(":memory:");
  stores.push(store);
  const { deps } = fakeEngine(o.over);
  const pipeline = new Pipeline({ store, deps, githubToken: "t", timingLog: false, linkedin: o.linkedin, propose: o.propose });
  const run = async (input: Omit<JobInput, "lang">) => {
    const { id } = pipeline.start({ lang: "fr", ...input });
    await pipeline.wait(id);
    return { id, row: store.getCard(id) };
  };
  return { store, pipeline, run };
}

/** Un lecteur de profils qui rend PROFILE, sans GitHub dans ses liens, après `gate` ou `ms`. */
function profiles(wait: () => Promise<unknown> = settle): LinkedinFinder {
  return {
    async forGithub(): Promise<GithubLookup | null> {
      return null;
    },
    async forUrl(): Promise<UrlLookup> {
      await wait();
      return { status: "found", profile: PROFILE, githubLogin: null };
    },
  };
}

describe("dénonciation par LinkedIn : le GitHub trouvé d'office", () => {
  it("son nom et son employeur sur le compte : un dossier prouvé, au top ; la collecte part avant la fin de la lecture du profil", async () => {
    const gate = deferred();
    const searched: string[] = [];
    const collected: string[] = [];
    const { store, pipeline } = setup({
      over: {
        async collectGithub(login) {
          collected.push(login);
          return facts(login);
        },
      },
      linkedin: profiles(() => gate.promise),
      propose: {
        githubAccounts: async (name) => {
          searched.push(name);
          return { accounts: [JMOUGEOT], namesakes: 0 };
        },
      },
    });
    const { id } = pipeline.start({ lang: "fr", linkedinUrl: URL, match: { name: "Jacques Mougeot" } });
    await settle();
    await settle();
    // Le profil n'est pas encore lu : le nom de la suggestion a cherché, le compte se collecte.
    expect(searched).toEqual(["Jacques Mougeot"]);
    expect(collected).toEqual(["jmougeot"]);
    gate.resolve();
    await pipeline.wait(id);
    // Une seule recherche, une seule collecte.
    expect(searched).toHaveLength(1);
    expect(collected).toEqual(["jmougeot"]);
    const row = store.getCard(id)!;
    expect(row).toMatchObject({ kind: "comparison", source: "linkedin", login: "jmougeot" });
    expect(row.facts).toMatchObject({ linkedinUrl: URL, linkedinProven: true, linkedinProof: "match" });
    expect((row.data as ComparisonData).github.login).toBe("jmougeot");
    // Née d'une dénonciation, non revendiquée : elle entre au top de la semaine (§18.119).
    store.markDenounced(id, "AAAAAAAAAA", null, true);
    expect(enteringRootIds(store.db)).toContain(id);
  });

  it("l'école en commun vaut l'employeur", async () => {
    const { run } = setup({
      over: { collectGithub: async (login) => facts(login) },
      linkedin: profiles(),
      propose: { githubAccounts: async () => ({ accounts: [acct("jmougeot", { name: "Jacques", bio: "Étudiant à Polytechnique" })], namesakes: 0 }) },
    });
    const { row } = await run({ linkedinUrl: URL, match: { name: "Jacques Mougeot" } });
    expect(row).toMatchObject({ kind: "comparison", login: "jmougeot" });
    expect(row!.facts).toMatchObject({ linkedinProven: true, linkedinProof: "match" });
  });

  it("son nom seul : la fiche sort LinkedIn seule, le compte lui est proposé, la collecte à l'essai est coupée", async () => {
    let aborted = false;
    const { run } = setup({
      over: {
        collectGithub: (_login, opts) =>
          new Promise((_, reject) => {
            opts.signal?.addEventListener("abort", () => {
              aborted = true;
              reject(new Error("coupée"));
            });
          }),
      },
      linkedin: profiles(() => sleep(20)),
      // « Jacques Mougeot » en nom complet, sans employeur ni école : probable, pas sûr.
      propose: { githubAccounts: async () => ({ accounts: [acct("jacques-dev", { name: "Jacques Mougeot" })], namesakes: 1 }) },
    });
    const { id, row } = await run({ linkedinUrl: URL, match: { name: "Jacques Mougeot" } });
    expect(row).toMatchObject({ kind: "card", source: "linkedin", login: null });
    expect(aborted).toBe(true);
    // Proposé à la personne, quand elle revendique sa fiche (§18.100).
    expect(openProposal(stores[0]!.db, id)).toMatchObject({ kind: "github", login: "jacques-dev", sure: false } satisfies Partial<Proposal>);
  });

  it("un nom courant, même avec le pseudo fait du nom : rien d'attaché", async () => {
    const { run } = setup({
      over: { collectGithub: async (login) => facts(login) },
      linkedin: profiles(),
      propose: { githubAccounts: async () => ({ accounts: [acct("jacquesmougeot", { name: "Jacques Mougeot" })], namesakes: 40 }) },
    });
    const { row } = await run({ linkedinUrl: URL, match: { name: "Jacques Mougeot" } });
    expect(row).toMatchObject({ kind: "card", source: "linkedin", login: null });
  });

  it("la recherche lente ne s'ajoute pas à la lecture du profil : la durée est celle du plus long, pas leur somme", async () => {
    const SLOW = 300;
    const { run } = setup({
      over: { collectGithub: async (login) => facts(login) },
      linkedin: profiles(() => sleep(SLOW)),
      propose: {
        githubAccounts: async (): Promise<GithubFound> => {
          await sleep(SLOW);
          return { accounts: [JMOUGEOT], namesakes: 0 };
        },
      },
    });
    const t0 = performance.now();
    const { row } = await run({ linkedinUrl: URL, match: { name: "Jacques Mougeot" } });
    const ms = performance.now() - t0;
    expect(row).toMatchObject({ kind: "comparison", login: "jmougeot" });
    expect(ms).toBeGreaterThanOrEqual(SLOW - 5);
    // Leur somme serait de 600 ms au moins.
    expect(ms).toBeLessThan(2 * SLOW - 60);
  });

  it("sans nom de suggestion : le nom lu sur le profil cherche, après la lecture", async () => {
    const searched: string[] = [];
    const { run } = setup({
      over: { collectGithub: async (login) => facts(login) },
      linkedin: profiles(),
      propose: {
        githubAccounts: async (name) => {
          searched.push(name);
          return { accounts: [JMOUGEOT], namesakes: 0 };
        },
      },
    });
    const { row } = await run({ linkedinUrl: URL, match: {} });
    expect(searched).toEqual(["Jacques Mougeot"]);
    expect(row).toMatchObject({ kind: "comparison", login: "jmougeot" });
  });

  it("une fiche que la personne fait pour elle ne cherche pas ainsi : rien n'est attaché sans elle", async () => {
    const searched: string[] = [];
    const { run } = setup({
      over: { collectGithub: async (login) => facts(login) },
      linkedin: profiles(),
      propose: {
        githubAccounts: async (name) => {
          searched.push(name);
          return { accounts: [JMOUGEOT], namesakes: 0 };
        },
      },
    });
    const { row } = await run({ linkedinUrl: URL });
    expect(searched).toEqual([]);
    expect(row).toMatchObject({ kind: "card", source: "linkedin" });
  });
});

describe("dénonciation par GitHub : le LinkedIn trouvé d'office", () => {
  const OCTO = { login: "camille-ardent", profile: { login: "camille-ardent", name: "Camille Ardent", company: "@criteo" }, repos: [], activeRepos: [], trees: [], commits: [] };
  const CAMILLE_URL = "https://www.linkedin.com/in/camille-ardent-42";
  const CAMILLE: LinkedinProfile = { ...PROFILE, url: CAMILLE_URL, name: "Camille Ardent", roles: [] };

  function finder(read: string[]): LinkedinFinder {
    return {
      async forGithub(_facts, opts): Promise<GithubLookup | null> {
        if (!opts?.url) return null;
        read.push(opts.url);
        return { profile: CAMILLE, proven: false };
      },
      async forUrl(): Promise<UrlLookup> {
        return { status: "not_found" };
      },
    };
  }

  it("son nom et l'entreprise de son GitHub dans le titre : le profil est lu, le dossier prouvé", async () => {
    const read: string[] = [];
    const { run } = setup({
      over: { collectGithub: async () => OCTO },
      linkedin: finder(read),
      propose: { linkedin: async () => ({ kind: "linkedin", url: CAMILLE_URL, name: "Camille Ardent", headline: "Data @ Criteo", sure: false }) },
    });
    const { row } = await run({ login: "camille-ardent", match: {} });
    expect(read).toEqual([CAMILLE_URL]);
    expect(row).toMatchObject({ kind: "comparison", source: "linkedin", login: "camille-ardent" });
    expect(row!.facts).toMatchObject({ linkedinUrl: CAMILLE_URL, linkedinProven: true, linkedinProof: "match" });
  });

  it("son nom seul : aucune lecture payée, la fiche GitHub sort seule", async () => {
    const read: string[] = [];
    const { run } = setup({
      over: { collectGithub: async () => OCTO },
      linkedin: finder(read),
      propose: { linkedin: async () => ({ kind: "linkedin", url: CAMILLE_URL, name: "Camille Ardent", headline: "Data engineer", sure: false }) },
    });
    const { row } = await run({ login: "camille-ardent", match: {} });
    expect(read).toEqual([]);
    expect(row).toMatchObject({ kind: "card", source: "github" });
  });
});
