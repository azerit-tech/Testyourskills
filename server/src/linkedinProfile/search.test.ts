// Recherche d'un profil LinkedIn par nom (SPEC §18.80), sans un seul appel
// réel : fetch est remplacé, la base est en mémoire, les personnes sont inventées.

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { parsePersonName, samePublicFullName } from "../names";
import { CrustdataClient, CrustdataPeople } from "./crustdata";
import {
  ApifyPeopleSearch,
  DEFAULT_APIFY_SEARCH_ACTOR,
  LinkedinSearch,
  apifySearchInput,
  candidateFromApifyItem,
  linkedinSearchFromEnv,
  rankCandidates,
  type LinkedinCandidate,
  type PeopleSearchProvider,
} from "./search";
import { LinkedinCache, SEARCH_TTL_MS, purgeLinkedin } from "./store";

const NOW = Date.parse("2026-11-19T10:00:00Z");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const CAMILLE: LinkedinCandidate = { url: "https://www.linkedin.com/in/camille-ardent", name: "Camille Ardent", headline: "Senior Full-Stack Engineer", photoUrl: "https://media.licdn.com/dms/image/v2/D4E03AQabc/profile-displayphoto-shrink_200_200/0/1" };
const HOMONYM: LinkedinCandidate = { url: "https://www.linkedin.com/in/camille-ardent-2", name: "Camille Ardent", headline: "Cheffe de projet" };

function fakeProvider(reply: () => LinkedinCandidate[] | Error) {
  const calls: { full: string; strict: boolean }[] = [];
  const provider: PeopleSearchProvider = {
    name: "apify",
    async searchByName(name, opts) {
      calls.push({ full: name.full, strict: opts.strict });
      const r = reply();
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return { provider, calls };
}

function service(provider: PeopleSearchProvider, over: { dailySearches?: number; now?: () => number } = {}) {
  const db = new Database(":memory:");
  const cache = new LinkedinCache(db);
  return { db, cache, search: new LinkedinSearch({ cache, provider, now: () => NOW, ...over }) };
}

describe("le nom tapé", () => {
  it("un prénom et un nom, deux mots d'au moins deux lettres", () => {
    expect(parsePersonName("  Camille   Ardent ")).toEqual({ first: "Camille", last: "Ardent", full: "Camille Ardent", key: "camille ardent" });
    expect(parsePersonName("Léa de La Tour")).toMatchObject({ first: "Léa", last: "de La Tour", key: "lea de la tour" });
    expect(parsePersonName("Camille")).toBeNull();
    expect(parsePersonName("Camille A")).toBeNull();
    expect(parsePersonName("a b")).toBeNull();
    expect(parsePersonName("linkedin.com/in/camille-ardent")).toBeNull();
    expect(parsePersonName("camille@exemple.fr dupont")).toBeNull();
    expect(parsePersonName("x".repeat(40) + " " + "y".repeat(45))).toBeNull();
  });

  it("deux noms publics concordent par leurs mots, jamais par un prénom seul", () => {
    expect(samePublicFullName("Camille Ardent", "camille ARDENT")).toBe(true);
    expect(samePublicFullName("Alice Martin", "Dr Alice B Martin")).toBe(true);
    expect(samePublicFullName("Léa Dupré", "Lea Dupre")).toBe(true);
    expect(samePublicFullName("Camille", "Camille Ardent")).toBe(false);
    expect(samePublicFullName("Camille Ardent", "Camille Durand")).toBe(false);
    expect(samePublicFullName("Camille Ardent", "")).toBe(false);
  });
});

describe("l'acteur Apify de recherche par nom", () => {
  it("demande une page en mode Short, prénom et nom séparés, jeton en Bearer", async () => {
    const calls: { url: string; headers: Headers; body: unknown }[] = [];
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
      return json([
        { publicIdentifier: "camille-ardent", linkedinUrl: "https://www.linkedin.com/in/ACoAAB1234567890abcdef", firstName: "Camille", lastName: "Ardent", headline: "Senior Full-Stack Engineer", photo: "https://media.licdn.com/dms/image/v2/D4E03AQabc/x/0/1" },
        { linkedinUrl: "https://www.linkedin.com/in/ACoAAB1234567890abcdef", name: "LinkedIn Member" },
        { error: "not found" },
      ]);
    }) as typeof fetch;
    const provider = new ApifyPeopleSearch({ token: "apify-test", fetchImpl: impl });
    const found = await provider.searchByName(parsePersonName("Camille Ardent")!, { strict: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain(`/acts/${DEFAULT_APIFY_SEARCH_ACTOR}/run-sync-get-dataset-items`);
    expect(calls[0]!.headers.get("authorization")).toBe("Bearer apify-test");
    expect(calls[0]!.body).toEqual({ profileScraperMode: "Short", firstName: "Camille", lastName: "Ardent", strictSearch: true, maxPages: 1, maxItems: 10 });
    // L'adresse vient du nom public ; un profil sans nom public (ACoAA…) est écarté.
    expect(found).toEqual([{ url: "https://www.linkedin.com/in/camille-ardent", name: "Camille Ardent", headline: "Senior Full-Stack Engineer", photoUrl: "https://media.licdn.com/dms/image/v2/D4E03AQabc/x/0/1" }]);
  });

  it("lit les formes voisines d'un élément, et refuse ce qui n'est pas un profil", () => {
    expect(candidateFromApifyItem({ url: "https://fr.linkedin.com/in/Léa-M/", fullName: "Léa M", position: "CTO", profilePicture: { url: "https://media.licdn.com/p.jpg" } })).toEqual({
      url: "https://www.linkedin.com/in/l%C3%A9a-m",
      name: "Léa M",
      headline: "CTO",
      photoUrl: "https://media.licdn.com/p.jpg",
    });
    expect(candidateFromApifyItem({ url: "https://www.linkedin.com/company/azerit", name: "Azerit" })).toBeNull();
    expect(candidateFromApifyItem({ publicIdentifier: "camille-ardent" })).toBeNull();
    expect(candidateFromApifyItem(null)).toBeNull();
  });

  it("le modèle d'entrée se remplace, « {strict} » devient un booléen", () => {
    const name = parsePersonName("Camille Ardent")!;
    expect(apifySearchInput('{"q":"{name}","exact":"{strict}","n":[1,"{last}"]}', name, false)).toEqual({ q: "Camille Ardent", exact: false, n: [1, "Ardent"] });
    expect(() => new ApifyPeopleSearch({ token: "t", inputTemplate: "{pas du json" })).toThrow();
  });

  it("une panne HTTP lève une erreur sans le jeton", async () => {
    const provider = new ApifyPeopleSearch({ token: "apify-secret", fetchImpl: (async () => json({}, 402)) as typeof fetch });
    await expect(provider.searchByName(parsePersonName("Camille Ardent")!, { strict: false })).rejects.toMatchObject({ status: 402 });
    await provider.searchByName(parsePersonName("Camille Ardent")!, { strict: false }).catch((e: Error) => expect(e.message).not.toContain("apify-secret"));
  });
});

describe("Crustdata : recherche par nom et recherche inverse par email", () => {
  const people = (impl: typeof fetch) => new CrustdataPeople(new CrustdataClient({ apiKey: "sk-test", fetchImpl: impl }));

  it("cherche les mots du nom, cinq résultats, sans groupe payant", async () => {
    const bodies: unknown[] = [];
    const impl = (async (_u: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return json({
        profiles: [
          { basic_profile: { name: "Camille Ardent", headline: "Senior", profile_picture_permalink: "https://media.licdn.com/p.jpg" }, social_handles: { professional_network_identifier: { profile_url: "https://www.linkedin.com/in/Camille-Ardent/" } } },
          { basic_profile: { name: "Sans Adresse" } },
        ],
      });
    }) as typeof fetch;
    const hits = await people(impl).searchByName("Camille Ardent");
    expect(bodies[0]).toMatchObject({ filters: { field: "basic_profile.name", type: "(.)", value: "Camille Ardent" }, limit: 5 });
    expect((bodies[0] as { fields: string[] }).fields.every((f) => f.startsWith("basic_profile.") || f.startsWith("social_handles."))).toBe(true);
    expect(hits).toEqual([{ url: "https://www.linkedin.com/in/camille-ardent", name: "Camille Ardent", headline: "Senior", photoUrl: "https://media.licdn.com/p.jpg" }]);
  });

  it("l'email professionnel rend un profil seulement s'il n'y en a qu'un", async () => {
    const one = { person_data: { basic_profile: { name: "Camille Ardent" }, social_handles: { professional_network_identifier: { profile_url: "https://www.linkedin.com/in/camille-ardent" } } } };
    const bodies: unknown[] = [];
    const reply = (matches: unknown[], status = "matched") =>
      (async (_u: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)));
        return json([{ match_type: "business_email", match_status: status, matches }]);
      }) as typeof fetch;
    expect(await people(reply([one])).findByEmail("camille@paysolde.example")).toMatchObject({ url: "https://www.linkedin.com/in/camille-ardent" });
    expect(bodies[0]).toMatchObject({ business_emails: ["camille@paysolde.example"] });
    expect(await people(reply([one, one])).findByEmail("camille@paysolde.example")).toBeNull();
    expect(await people(reply([], "no_match")).findByEmail("camille@paysolde.example")).toBeNull();
  });
});

describe("le service : cache, plafond du jour, limite par IP", () => {
  it("une recherche payée, puis le cache d'un jour ; les homonymes exacts d'abord", async () => {
    const other: LinkedinCandidate = { url: "https://www.linkedin.com/in/camille-arden", name: "Camille Arden", headline: "" };
    const { provider, calls } = fakeProvider(() => [other, CAMILLE, HOMONYM, CAMILLE]);
    let now = NOW;
    const { search, cache } = service(provider, { now: () => now });
    const first = await search.byName("camille ardent");
    expect(first).toEqual({ status: "ok", results: [CAMILLE, HOMONYM, other] });
    expect(await search.byName("Camille  ARDENT")).toEqual(first);
    expect(calls).toEqual([{ full: "camille ardent", strict: false }]);
    expect(cache.searchesToday(now)).toBe(1);
    // La recherche stricte (retour de la connexion LinkedIn) a son propre cache.
    await search.byName("Camille Ardent", { strict: true });
    expect(calls).toHaveLength(2);
    now += SEARCH_TTL_MS + 1;
    await search.byName("camille ardent");
    expect(calls).toHaveLength(3);
  });

  it("un prénom seul ne coûte rien", async () => {
    const { provider, calls } = fakeProvider(() => [CAMILLE]);
    const { search } = service(provider);
    expect(await search.byName("Camille")).toEqual({ status: "short" });
    expect(calls).toHaveLength(0);
  });

  it("plafond du jour atteint, limite de l'IP ou panne : « off », rien de payé en trop", async () => {
    const { provider, calls } = fakeProvider(() => [CAMILLE]);
    const capped = service(provider, { dailySearches: 1 });
    expect((await capped.search.byName("Camille Ardent")).status).toBe("ok");
    expect(await capped.search.byName("Léa Martin")).toEqual({ status: "off" });
    expect(calls).toHaveLength(1);

    const limited = service(provider);
    expect(await limited.search.byName("Léa Martin", { spend: () => false })).toEqual({ status: "off" });
    expect(limited.cache.searchesToday(NOW)).toBe(0);

    const down = service(fakeProvider(() => new Error("boom")).provider);
    expect(await down.search.byName("Léa Martin")).toEqual({ status: "off" });
    // La panne n'est pas gardée : la recherche suivante réessaie.
    expect(down.cache.getSearch("n:lea martin", NOW)).toBeNull();
  });

  it("deux frappes du même nom en vol : une seule recherche", async () => {
    const { provider, calls } = fakeProvider(() => [CAMILLE]);
    const { search } = service(provider);
    const [a, b] = await Promise.all([search.byName("Camille Ardent"), search.byName("camille ardent")]);
    expect(a).toEqual(b);
    expect(calls).toHaveLength(1);
  });

  it("la recherche inverse ne part jamais pour une messagerie personnelle, ni sans fournisseur", async () => {
    const { provider } = fakeProvider(() => []);
    const asked: string[] = [];
    const db = new Database(":memory:");
    const withLookup = new LinkedinSearch({
      cache: new LinkedinCache(db),
      provider,
      emailLookup: {
        async findByEmail(email) {
          asked.push(email);
          return CAMILLE;
        },
      },
      now: () => NOW,
    });
    expect(await withLookup.byEmail("camille@gmail.com")).toBeNull();
    expect(await withLookup.byEmail("camille@paysolde.example")).toEqual(CAMILLE);
    expect(asked).toEqual(["camille@paysolde.example"]);
    expect(await service(provider).search.byEmail("camille@paysolde.example")).toBeNull();
  });

  it("la purge retire les recherches expirées", () => {
    const { provider } = fakeProvider(() => []);
    const { db, cache } = service(provider);
    cache.putSearch("n:camille ardent", [CAMILLE], NOW);
    purgeLinkedin(db, NOW + SEARCH_TTL_MS + 1);
    expect(cache.getSearch("n:camille ardent", NOW)).toBeNull();
  });

  it("le tri garde une adresse une seule fois", () => {
    expect(rankCandidates("Camille Ardent", [HOMONYM, CAMILLE, HOMONYM]).map((c) => c.url)).toEqual([HOMONYM.url, CAMILLE.url]);
  });
});

describe("configuration", () => {
  const db = () => new Database(":memory:");
  it("sans jeton : pas de recherche ; avec APIFY_TOKEN : Apify ; Crustdata à la demande", () => {
    expect(linkedinSearchFromEnv({}, db())).toBeNull();
    expect(linkedinSearchFromEnv({ APIFY_TOKEN: "t" }, db())?.providerName).toBe("apify");
    expect(linkedinSearchFromEnv({ APIFY_TOKEN: "t", LINKEDIN_SEARCH_PROVIDER: "crustdata" }, db())).toBeNull();
    expect(linkedinSearchFromEnv({ CRUSTDATA_API_KEY: "k", LINKEDIN_SEARCH_PROVIDER: "crustdata" }, db())?.providerName).toBe("crustdata");
    expect(linkedinSearchFromEnv({ CRUSTDATA_API_KEY: "k", LINKEDIN_PROVIDER: "crustdata" }, db())?.providerName).toBe("crustdata");
  });
});
