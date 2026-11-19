// Le registre de l'App Azerit branché sur la lecture des profils (§18.91) : lu
// avant tout appel payant, enrichi de ce qui est lu. Base de l'App en mémoire,
// fournisseur factice, noms inventés.

import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { LinkedinProfiles } from "./index";
import type { LinkedinProfile, LinkedinProvider, ProviderResult } from "./profile";
import { LinkedinCache } from "./store";
import { Registry } from "../registry/index";
import { MemoryRegistryDb } from "../registry/memory";
import { newCvDocument, packCv, trimApifyItem } from "../registry/appFormat";

const NOW = new Date(2026, 10, 20, 12, 0, 0).getTime();
const URL_ = "https://www.linkedin.com/in/camille-ardent";
const ITEM = {
  linkedinUrl: URL_,
  firstName: "Camille",
  lastName: "Ardent",
  headline: "Développeuse backend",
  experience: [{ position: "Développeuse", companyName: "Paysolde", employmentType: "Full-time", startDate: { year: 2022, month: "Mar" }, endDate: { text: "Present" } }],
  skills: [{ name: "Rust" }],
};
const profile = (url = URL_): LinkedinProfile => ({ url, name: "Camille Ardent", headline: "Dev", title: "Dev", summary: "Résumé", roles: [], education: [], skills: ["Rust"] });
const facts = (p: { blog?: string } = {}) => ({ login: "camardent", profile: { name: "Camille Ardent", createdAt: null, blog: p.blog ?? null, bio: null, socialAccounts: [] } });

function setup(reply: (url: string) => ProviderResult = (u) => ({ profile: profile(u), githubLogin: null, githubChecked: true, raw: ITEM }), extra: { readme?: string | null; search?: string | null } = {}) {
  const app = new MemoryRegistryDb();
  const registry = new Registry(app, { now: () => NOW });
  const calls: string[] = [];
  const provider: LinkedinProvider = {
    name: "apify",
    timeoutMs: 60_000,
    async fetchProfile(url) {
      calls.push(url);
      return reply(url);
    },
  };
  const signal = extra.readme !== undefined ? vi.fn(async () => extra.readme ?? null) : undefined;
  const search = extra.search !== undefined ? { searchByGithub: vi.fn(async () => ({ url: extra.search ?? null, credits: 1 })) } : undefined;
  const finder = new LinkedinProfiles({ cache: new LinkedinCache(new Database(":memory:")), provider, registry, signal, search: search as never, now: () => NOW });
  return { app, registry, finder, calls, signal, search };
}

function seedCv(app: MemoryRegistryDb, slug: string) {
  const a = app.ensure("linkedin", slug);
  const doc = newCvDocument(`https://www.linkedin.com/in/${slug}`, trimApifyItem(ITEM)!, { fetchedAt: "2026-11-01T09:00:00" });
  app.cvs.push({ account: a.id, data: packCv(doc), sha256: doc.versions[0]!.sha256, fetchedAt: "2026-11-01T09:00:00" });
}

describe("entrée GitHub : le registre avant le README et la recherche payante", () => {
  it("lien prouvé (force 2) et CV récent : la comparaison est prouvée, rien n'est payé ni lu chez GitHub", async () => {
    const t = setup(undefined, { readme: null, search: "https://www.linkedin.com/in/autre" });
    t.app.seedLink("camardent", "camille-ardent", 2);
    seedCv(t.app, "camille-ardent");
    const r = await t.finder.forGithub(facts());
    expect(r).toMatchObject({ proven: true, profile: { url: URL_, name: "Camille Ardent", title: "Développeuse" } });
    expect(t.calls).toEqual([]);
    expect(t.signal).not.toHaveBeenCalled();
    expect(t.search!.searchByGithub).not.toHaveBeenCalled();
  });

  it("lien trouvé (force 1) : le README gratuit passe devant, la recherche payante jamais", async () => {
    const t = setup(undefined, { readme: null, search: "https://www.linkedin.com/in/autre" });
    t.app.seedLink("camardent", "camille-ardent", 1, { source: "brave_search" });
    const r = await t.finder.forGithub(facts());
    expect(t.signal).toHaveBeenCalled();
    expect(t.search!.searchByGithub).not.toHaveBeenCalled();
    expect(r).toMatchObject({ proven: false, profile: { url: URL_ } });
    // Profil payé : son CV va au registre, au format de l'App.
    await t.registry.flush();
    expect(t.app.cvs).toHaveLength(1);
  });

  it("le LinkedIn que GitHub affiche est versé au registre, force 2, étape github_website", async () => {
    const t = setup();
    await t.finder.forGithub(facts({ blog: "https://www.linkedin.com/in/Camille-Ardent" }));
    await t.registry.flush();
    expect(t.app.written()).toEqual([{ login: "camardent", slug: "camille-ardent", strength: 2, step: "github_website" }]);
    // Le CV porte le GitHub prouvé.
    expect(t.app.cvs).toHaveLength(1);
  });

  it("README : force 2 ; recherche payante : force 1", async () => {
    const a = setup(undefined, { readme: URL_ });
    await a.finder.forGithub(facts());
    await a.registry.flush();
    expect(a.app.written()[0]).toMatchObject({ strength: 2, step: "profile_readme" });
    const b = setup(undefined, { search: URL_ });
    await b.finder.forGithub(facts());
    await b.registry.flush();
    expect(b.app.written()[0]).toMatchObject({ strength: 1, step: "crustdata_search" });
  });

  it("registre en panne : exactement comme avant", async () => {
    const t = setup(undefined, { readme: URL_ });
    t.app.failWith = new Error("down");
    const r = await t.finder.forGithub(facts());
    expect(r).toMatchObject({ proven: true, profile: { name: "Camille Ardent", summary: "Résumé" } });
    expect(t.calls).toEqual([URL_]);
  });
});

describe("entrée LinkedIn : le GitHub et le CV du registre", () => {
  it("CV récent et GitHub lié en force 2 : rien de payé, GitHub prouvé", async () => {
    const t = setup();
    t.app.seedLink("CamArdent", "camille-ardent", 2);
    seedCv(t.app, "camille-ardent");
    const r = await t.finder.forUrl(URL_);
    expect(r).toMatchObject({ status: "found", githubLogin: "CamArdent", githubProven: true, profile: { title: "Développeuse" } });
    expect(t.calls).toEqual([]);
  });

  it("le GitHub des liens du profil passe devant le registre, et y est versé (étape linkedin_profile)", async () => {
    const t = setup((u) => ({ profile: profile(u), githubLogin: "camille-gh", githubChecked: true, raw: ITEM }));
    t.app.seedLink("autre", "camille-ardent", 1, { source: "cv_search" });
    const r = await t.finder.forUrl(URL_);
    expect(r).toMatchObject({ status: "found", githubLogin: "camille-gh" });
    expect(r.status === "found" && r.githubProven).toBeFalsy();
    await t.registry.flush();
    expect(t.app.written()).toEqual([{ login: "camille-gh", slug: "camille-ardent", strength: 2, step: "linkedin_profile" }]);
  });

  it("profil sans GitHub : celui du registre, « trouvé » seulement en force 1", async () => {
    const t = setup();
    t.app.seedLink("camardent", "camille-ardent", 1, { source: "cv_search" });
    const r = await t.finder.forUrl(URL_);
    expect(r).toMatchObject({ status: "found", githubLogin: "camardent", githubProven: false });
    expect(t.calls).toEqual([URL_]);
  });
});
