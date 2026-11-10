// Recherche du LinkedIn et garde-fous de coût, sans un seul appel réel : le
// fournisseur est un faux, la base est en mémoire.

import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { LinkedinProfiles, linkedinEnv, linkedinProfilesFromEnv } from "./index";
import type { LinkedinProfile, LinkedinProvider, ProviderResult } from "./profile";
import { LinkedinCache } from "./store";
import { profileToText, asLinkedinCard } from "./text";
import { linkedinFromGithub } from "./url";
import { linkedinFindings } from "./findings";

const NOW = Date.parse("2026-11-09T12:00:00Z");
const DAY = 24 * 3600 * 1000;
const CAMILLE = "https://www.linkedin.com/in/camille-ardent";

const profile = (url = CAMILLE): LinkedinProfile => ({
  url,
  name: "Camille Ardent",
  headline: "Senior Full-Stack Engineer",
  title: "Senior Full-Stack Engineer",
  summary: "Full-stack depuis 7 ans.",
  roles: [{ title: "Senior Full-Stack Engineer", company: "Paysolde", start: "2022-03", end: null, description: "Refonte du paiement." }],
  education: [{ school: "INSA Lyon", degree: "Diplôme d'ingénieur", field: "Informatique", start: 2014, end: 2019 }],
  skills: ["TypeScript", "React"],
  photoUrl: "https://media.example.invalid/camille.jpg",
});

/** Les faits GitHub tels que collect.ts les rend (seuls les champs lus ici). */
const facts = (p: Partial<{ blog: string; bio: string; socialAccounts: { provider: string; url: string }[] }> = {}) => ({
  login: "camille-ardent",
  profile: { name: "Camille Ardent", createdAt: "2016-04-02T08:00:00Z", blog: p.blog ?? null, bio: p.bio ?? null, socialAccounts: p.socialAccounts ?? [] },
});

function fakeProvider(reply: (url: string) => ProviderResult | Error | Promise<ProviderResult>) {
  const calls: { url: string; withGithub?: boolean }[] = [];
  const provider: LinkedinProvider = {
    name: "apify",
    timeoutMs: 60_000,
    async fetchProfile(url, opts) {
      calls.push({ url, withGithub: opts?.withGithub });
      const r = await reply(url);
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return { provider, calls };
}

function setup(reply: (url: string) => ProviderResult | Error | Promise<ProviderResult> = (u) => ({ profile: profile(u), githubLogin: null, githubChecked: true }), extra: { daily?: number; search?: (q: unknown) => Promise<{ url: string | null; credits: number }> } = {}) {
  const db = new Database(":memory:");
  const cache = new LinkedinCache(db);
  const f = fakeProvider(reply);
  let now = NOW;
  const search = extra.search ? { searchByGithub: vi.fn(extra.search) } : undefined;
  const finder = new LinkedinProfiles({ cache, provider: f.provider, dailyProfiles: extra.daily, search: search as never, now: () => now });
  return { db, cache, finder, calls: f.calls, search, advance: (ms: number) => (now += ms) };
}

describe("le LinkedIn qu'un GitHub affiche (gratuit)", () => {
  it("ordre : compte social LinkedIn, puis autre compte social, puis site, puis bio", () => {
    const gh = (o: Parameters<typeof facts>[0]) => ({ login: "x", name: null, createdAt: null, blog: o?.blog ?? null, bio: o?.bio ?? null, socialAccounts: o?.socialAccounts ?? [] });
    expect(
      linkedinFromGithub(gh({ socialAccounts: [{ provider: "twitter", url: "https://x.com/c" }, { provider: "linkedin", url: "https://linkedin.com/in/Social/" }], blog: "linkedin.com/in/blog", bio: "linkedin.com/in/bio" })),
    ).toBe("https://www.linkedin.com/in/social");
    expect(linkedinFromGithub(gh({ socialAccounts: [{ provider: "generic", url: "https://fr.linkedin.com/in/generic?trk=x" }], blog: "linkedin.com/in/blog" }))).toBe("https://www.linkedin.com/in/generic");
    expect(linkedinFromGithub(gh({ blog: "https://www.linkedin.com/in/blog/", bio: "linkedin.com/in/bio" }))).toBe("https://www.linkedin.com/in/blog");
    expect(linkedinFromGithub(gh({ blog: "https://camille.dev", bio: "Dev. linkedin.com/in/bio-camille" }))).toBe("https://www.linkedin.com/in/bio-camille");
    expect(linkedinFromGithub(gh({ blog: "https://camille.dev" }))).toBeNull();
  });
});

describe("forGithub", () => {
  it("lit le profil que GitHub affiche, le garde 30 jours sans photo, et lie le compte", async () => {
    const t = setup();
    const p = await t.finder.forGithub(facts({ blog: "linkedin.com/in/Camille-Ardent" }));
    expect(p?.profile.name).toBe("Camille Ardent");
    expect(p?.proven).toBe(true);
    expect(t.calls).toEqual([{ url: CAMILLE, withGithub: undefined }]);
    const hit = t.cache.getProfile(CAMILLE, NOW + 29 * DAY);
    expect(hit).toMatchObject({ found: true, githubLogin: "camille-ardent" });
    expect(hit?.found && hit.profile.photoUrl).toBeUndefined();
    expect(t.cache.getProfile(CAMILLE, NOW + 31 * DAY)).toBeNull();
    // Deuxième fiche : le cache, aucun appel.
    const again = await t.finder.forGithub(facts({ blog: "linkedin.com/in/camille-ardent" }));
    expect(again?.proven).toBe(true);
    expect(t.calls).toHaveLength(1);
    expect(t.cache.readsToday(NOW)).toBe(1);
  });

  it("aucun LinkedIn affiché : rien, sans appel ni recherche par défaut", async () => {
    const t = setup();
    expect(await t.finder.forGithub(facts())).toBeNull();
    expect(t.calls).toHaveLength(0);
  });

  it("l'adresse donnée par le joueur passe devant, mais ne lie pas le compte GitHub", async () => {
    const t = setup((u) => ({ profile: profile(u), githubLogin: null, githubChecked: true }));
    const other = await t.finder.forGithub(facts({ blog: "linkedin.com/in/camille-ardent" }), { url: "https://linkedin.com/in/autre-personne/" });
    expect(t.calls[0]!.url).toBe("https://www.linkedin.com/in/autre-personne");
    expect(t.cache.getProfile("https://www.linkedin.com/in/autre-personne", NOW)).toMatchObject({ githubLogin: null });
    // Le lien n'est pas prouvé, à la lecture comme depuis le cache ; ni sur un GitHub qui n'affiche rien.
    expect(other?.proven).toBe(false);
    expect((await t.finder.forGithub(facts({ blog: "linkedin.com/in/camille-ardent" }), { url: "https://linkedin.com/in/autre-personne/" }))?.proven).toBe(false);
    expect((await t.finder.forGithub(facts(), { url: CAMILLE }))?.proven).toBe(false);
  });

  it("l'adresse donnée par le joueur est celle que GitHub affiche : le lien est prouvé", async () => {
    const t = setup();
    const p = await t.finder.forGithub(facts({ blog: "linkedin.com/in/camille-ardent" }), { url: "https://fr.linkedin.com/in/Camille-Ardent/?trk=x" });
    expect(p?.proven).toBe(true);
    expect(t.cache.getProfile(CAMILLE, NOW)).toMatchObject({ githubLogin: "camille-ardent" });
  });

  it("introuvable : gardé 7 jours, sans nouvel appel", async () => {
    const t = setup(() => ({ profile: null, githubLogin: null, githubChecked: true }));
    expect(await t.finder.forGithub(facts({ blog: "linkedin.com/in/camille-ardent" }))).toBeNull();
    expect(await t.finder.forGithub(facts({ blog: "linkedin.com/in/camille-ardent" }))).toBeNull();
    expect(t.calls).toHaveLength(1);
    t.advance(8 * DAY);
    await t.finder.forGithub(facts({ blog: "linkedin.com/in/camille-ardent" }));
    expect(t.calls).toHaveLength(2);
  });

  it("panne réseau : rien, rien en cache, la fiche GitHub sort seule", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = setup(() => new TypeError("fetch failed"));
    expect(await t.finder.forGithub(facts({ blog: "linkedin.com/in/camille-ardent" }))).toBeNull();
    expect(t.cache.getProfile(CAMILLE, NOW)).toBeNull();
    expect(warn.mock.calls.flat().join(" ")).not.toContain("camille");
    warn.mockRestore();
  });

  it("plafond du jour : au-delà, plus aucun appel ; le lendemain, ça repart", async () => {
    const t = setup(undefined, { daily: 2 });
    for (const slug of ["a-1", "a-2", "a-3"]) await t.finder.forGithub(facts({ blog: `linkedin.com/in/${slug}` }));
    expect(t.calls.map((c) => c.url)).toEqual(["https://www.linkedin.com/in/a-1", "https://www.linkedin.com/in/a-2"]);
    t.advance(DAY);
    await t.finder.forGithub(facts({ blog: "linkedin.com/in/a-3" }));
    expect(t.calls).toHaveLength(3);
  });

  it("limite par IP : spend() refusé, aucun appel, rien compté", async () => {
    const t = setup();
    expect(await t.finder.forGithub(facts({ blog: "linkedin.com/in/camille-ardent" }), { spend: () => false })).toBeNull();
    expect(t.calls).toHaveLength(0);
    expect(t.cache.readsToday(NOW)).toBe(0);
  });

  it("une lecture lente prévient le pipeline (onSlow, au plus le délai du fournisseur)", async () => {
    const t = setup();
    const onSlow = vi.fn();
    await t.finder.forGithub(facts({ blog: "linkedin.com/in/camille-ardent" }), { onSlow });
    expect(onSlow).toHaveBeenCalledWith(60_000);
  });

  it("recherche payante seulement si configurée ; résultat gardé, y compris « rien »", async () => {
    const t = setup(undefined, { search: async () => ({ url: CAMILLE, credits: 0.83 }) });
    expect(await t.finder.forGithub(facts())).toMatchObject({ profile: { name: "Camille Ardent" }, proven: true });
    expect(t.search!.searchByGithub).toHaveBeenCalledTimes(1);
    expect(t.cache.getLookup("camille-ardent", NOW)).toBe(CAMILLE);
    expect(t.cache.getProfile(CAMILLE, NOW)).toMatchObject({ githubLogin: "camille-ardent" });
    await t.finder.forGithub(facts());
    expect(t.search!.searchByGithub).toHaveBeenCalledTimes(1);
    expect(t.cache.readsToday(NOW)).toBe(2); // une recherche, une lecture

    const none = setup(undefined, { search: async () => ({ url: null, credits: 0 }) });
    expect(await none.finder.forGithub(facts())).toBeNull();
    expect(await none.finder.forGithub(facts())).toBeNull();
    expect(none.search!.searchByGithub).toHaveBeenCalledTimes(1);
    expect(none.calls).toHaveLength(0);
  });
});

describe("forUrl (entrée LinkedIn)", () => {
  it("trouvé, avec le GitHub que le profil donne ; puis en cache", async () => {
    const t = setup((u) => ({ profile: profile(u), githubLogin: "camille-ardent", githubChecked: true }));
    expect(await t.finder.forUrl("https://fr.linkedin.com/in/Camille-Ardent/?trk=x")).toMatchObject({ status: "found", githubLogin: "camille-ardent" });
    expect(t.calls).toEqual([{ url: CAMILLE, withGithub: true }]);
    expect(await t.finder.forUrl(CAMILLE)).toMatchObject({ status: "found", githubLogin: "camille-ardent" });
    expect(t.calls).toHaveLength(1);
  });

  it("trouvé sans GitHub : null, gardé comme « demandé, rien »", async () => {
    const t = setup((u) => ({ profile: profile(u), githubLogin: null, githubChecked: true }));
    expect(await t.finder.forUrl(CAMILLE)).toMatchObject({ status: "found", githubLogin: null });
    expect(await t.finder.forUrl(CAMILLE)).toMatchObject({ status: "found", githubLogin: null });
    expect(t.calls).toHaveLength(1);
  });

  it("profil en cache sans réponse sur le GitHub : relu une fois", async () => {
    const t = setup((u) => ({ profile: profile(u), githubLogin: "camille-ardent", githubChecked: true }));
    t.cache.putProfile(CAMILLE, profile(), undefined, NOW);
    expect(await t.finder.forUrl(CAMILLE)).toMatchObject({ status: "found", githubLogin: "camille-ardent" });
    expect(t.calls).toHaveLength(1);
  });

  it("introuvable, adresse invalide, panne, plafond", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await setup(() => ({ profile: null, githubLogin: null, githubChecked: true })).finder.forUrl(CAMILLE)).toEqual({ status: "not_found" });
    expect(await setup().finder.forUrl("https://linkedin.com/company/brumes")).toEqual({ status: "not_found" });
    expect(await setup(() => new Error("boom")).finder.forUrl(CAMILLE)).toEqual({ status: "unavailable" });
    expect(await setup(undefined, { daily: 0 }).finder.forUrl(CAMILLE)).toEqual({ status: "unavailable" });
    expect(await setup().finder.forUrl(CAMILLE, { spend: () => false })).toEqual({ status: "unavailable" });
    warn.mockRestore();
  });
});

describe("profil gardé (§18.37)", () => {
  it("type de contrat et distinctions passent la base ; un profil gardé avant se relit", () => {
    const cache = new LinkedinCache(new Database(":memory:"));
    const url = "https://www.linkedin.com/in/nouveau";
    const p: LinkedinProfile = {
      url,
      name: "N",
      headline: "Dev",
      title: "Dev",
      summary: "",
      roles: [{ title: "Stagiaire", company: "Acme", start: "2025-02", end: "2025-11", description: "", contract: "internship" }],
      education: [],
      skills: [],
      honors: [{ title: "Prix du jury", issuer: "Hackathon X", date: "2024-05", description: "" }],
      photoUrl: "https://media.example.invalid/n.jpg",
    };
    cache.putProfile(url, p, null);
    const got = cache.getProfile(url);
    expect(got).toMatchObject({ found: true });
    const kept = (got as { profile: LinkedinProfile }).profile;
    expect(kept.roles[0]!.contract).toBe("internship");
    expect(kept.honors).toEqual(p.honors);
    expect(kept.photoUrl).toBeUndefined();
    // Un profil gardé avant le §18.37 : ni contrat ni distinctions, il se relit et se met en texte.
    const old = "https://www.linkedin.com/in/ancien";
    const { honors: _h, photoUrl: _p, ...rest } = p;
    cache.putProfile(old, { ...rest, url: old, roles: [{ title: "Dev", company: "Acme", start: "2020-01", end: null, description: "" }] }, null);
    const oldKept = (cache.getProfile(old) as { profile: LinkedinProfile }).profile;
    expect(oldKept.honors).toBeUndefined();
    expect(oldKept.roles[0]!.contract).toBeUndefined();
    expect(profileToText(oldKept)).toContain("Dev — Acme (2020-01 – present)");
  });
});

describe("configuration", () => {
  it("apify par défaut, sans jeton : absente", () => {
    expect(linkedinEnv({})).toBeNull();
    expect(linkedinEnv({ APIFY_TOKEN: "t" })).toEqual({ provider: "apify", token: "t", actor: undefined, inputTemplate: undefined, dailyProfiles: 300, searchKey: undefined });
    expect(linkedinEnv({ APIFY_TOKEN: "t", APIFY_LINKEDIN_ACTOR: "u~a", LINKEDIN_DAILY_PROFILES: "50" })).toMatchObject({ actor: "u~a", dailyProfiles: 50 });
    expect(linkedinEnv({ APIFY_TOKEN: "t", LINKEDIN_DAILY_PROFILES: "n'importe" })?.dailyProfiles).toBe(300);
  });

  it("crustdata : sa clé ; la recherche seulement avec LINKEDIN_AUTOFIND=crustdata", () => {
    expect(linkedinEnv({ LINKEDIN_PROVIDER: "crustdata" })).toBeNull();
    expect(linkedinEnv({ LINKEDIN_PROVIDER: "crustdata", CRUSTDATA_API_KEY: "k" })).toMatchObject({ provider: "crustdata", apiKey: "k", searchKey: undefined });
    expect(linkedinEnv({ APIFY_TOKEN: "t", CRUSTDATA_API_KEY: "k" })?.searchKey).toBeUndefined();
    expect(linkedinEnv({ APIFY_TOKEN: "t", CRUSTDATA_API_KEY: "k", LINKEDIN_AUTOFIND: "crustdata" })?.searchKey).toBe("k");
  });

  it("fournisseur inconnu : absente", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(linkedinEnv({ LINKEDIN_PROVIDER: "autre", APIFY_TOKEN: "t" })).toBeNull();
    warn.mockRestore();
  });

  it("branché sur la base, sans appel au démarrage", () => {
    const fetchImpl = vi.fn();
    const p = linkedinProfilesFromEnv({ APIFY_TOKEN: "t" }, new Database(":memory:"), fetchImpl as never);
    expect(p?.providerName).toBe("apify");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(linkedinProfilesFromEnv({}, new Database(":memory:"))).toBeNull();
  });
});

describe("trouvailles LinkedIn (§18.26)", () => {
  it("« LinkedIn retrouvé » avec le titre ; les compétences seulement à partir de 15", () => {
    const [found, ...rest] = linkedinFindings(profile());
    expect(found).toMatchObject({ kind: "linkedin_found", source: "linkedin", proof: CAMILLE, key: { fr: "Senior Full-Stack Engineer" } });
    expect(found!.text.en).toBe("LinkedIn found: “Senior Full-Stack Engineer”.");
    expect(rest).toEqual([]);
    const many = linkedinFindings({ ...profile(), skills: Array.from({ length: 41 }, (_, i) => `s${i}`) });
    expect(many[1]).toMatchObject({ kind: "linkedin_skills", text: { fr: "41 compétences déclarées sur LinkedIn.", en: "41 skills declared on LinkedIn." }, score: 39 });
    expect(JSON.stringify(many)).not.toContain("Paysolde");
  });
});

describe("profil → texte, et « CV » devient « LinkedIn »", () => {
  it("un texte de CV propre, sans photo ni adresse", () => {
    const text = profileToText(profile());
    expect(text).toBe(
      [
        "Camille Ardent",
        "Senior Full-Stack Engineer",
        "",
        "About",
        "Full-stack depuis 7 ans.",
        "",
        "Experience",
        "Senior Full-Stack Engineer — Paysolde (2022-03 – present)",
        "Refonte du paiement.",
        "",
        "Education",
        "Diplôme d'ingénieur, Informatique — INSA Lyon (2014 – 2019)",
        "",
        "Skills",
        "TypeScript, React",
      ].join("\n"),
    );
    expect(text).not.toContain("media.example");
  });

  it("les textes finaux sont réécrits, le barème non", () => {
    const card = asLinkedinCard({
      login: "camille-ardent",
      source: "cv",
      stats: [{ key: "code", value: 70, facts: [{ fr: "Ton CV cite React", en: "Your CV lists React" }, { fr: "D'après le CV : 3 postes", en: "Per the CV: 3 roles" }] }],
      statuses: [{ key: "x", label: { fr: "CV gonflé", en: "Padded CV" }, rule: { fr: "Le CV promet plus", en: "The CV promises more" } }],
    } as never) as unknown as { declaredSource: string; stats: { value: number; facts: { fr: string; en: string }[] }[]; statuses: { label: { fr: string }; rule: { en: string } }[] };
    expect(card.declaredSource).toBe("linkedin");
    expect(card.stats[0]!.value).toBe(70);
    expect(card.stats[0]!.facts[0]).toEqual({ fr: "Ton LinkedIn cite React", en: "Your LinkedIn lists React" });
    expect(card.statuses[0]!.label.fr).toBe("LinkedIn gonflé");
    expect(card.statuses[0]!.rule.en).toBe("The LinkedIn profile promises more");
  });
});
