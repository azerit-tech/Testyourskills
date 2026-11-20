// Recherche d'un profil LinkedIn par nom (SPEC §18.80), sans un seul appel
// réel : fetch est remplacé, la base est en mémoire, les personnes sont inventées.

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { parsePersonName, samePublicFullName, splitTyped } from "../names";
import { CrustdataClient, CrustdataPeople } from "./crustdata";
import {
  LinkedinSearch,
  linkedinSearchFromEnv,
  rankByContext,
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
  const calls: { full: string; strict: boolean; company?: string | null; context?: string | null }[] = [];
  const provider: PeopleSearchProvider = {
    name: "brave",
    async searchByName(name, opts) {
      calls.push({ full: name.full, strict: opts.strict, ...(opts.company ? { company: opts.company } : {}), ...(opts.context ? { context: opts.context } : {}) });
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

describe("le nom, puis un mot-clé (§18.112)", () => {
  it("deux mots font le nom, trois avec une particule ; le reste est le mot-clé", () => {
    expect(splitTyped("  camille   ardent  criteo ")).toEqual({ name: "camille ardent", context: "criteo" });
    expect(splitTyped("Camille Ardent")).toEqual({ name: "Camille Ardent", context: "" });
    expect(splitTyped("Camille Ard")).toEqual({ name: "Camille Ard", context: "" });
    expect(splitTyped("camille ardent école 42")).toEqual({ name: "camille ardent", context: "école 42" });
    expect(splitTyped("Léa de Vigny Datadog")).toEqual({ name: "Léa de Vigny", context: "Datadog" });
    expect(splitTyped("Anna van der Berg ing")).toEqual({ name: "Anna van der Berg", context: "ing" });
    expect(splitTyped("Jean de La Fontaine")).toEqual({ name: "Jean de La Fontaine", context: "" });
    expect(splitTyped("Yann Le Gall Qonto")).toEqual({ name: "Yann Le Gall", context: "Qonto" });
    expect(splitTyped("Léa de")).toEqual({ name: "Léa de", context: "" });
    expect(splitTyped("Camille")).toEqual({ name: "Camille", context: "" });
  });

  it("ceux qui portent le mot-clé (titre, nom ou adresse) passent d'abord, les autres restent dans leur ordre", () => {
    const a: LinkedinCandidate = { url: "https://www.linkedin.com/in/camille-ardent-1", name: "Camille Ardent", headline: "Boulangerie Ardent" };
    const b: LinkedinCandidate = { url: "https://www.linkedin.com/in/camille-ardent-2", name: "Camille Ardent", headline: "ml @ Criteo AI Lab" };
    const c: LinkedinCandidate = { url: "https://www.linkedin.com/in/camille-ardent-criteo", name: "Camille Ardent", headline: "" };
    const d: LinkedinCandidate = { url: "https://www.linkedin.com/in/camille-ardent-4", name: "Camille Ardent", headline: "Lyon" };
    expect(rankByContext([a, b, c, d], "Criteo")).toEqual([b, c, a, d]);
    // Un mot-clé en cours de frappe classe déjà ; le plus de mots concordants d'abord.
    expect(rankByContext([a, b, d], "cri")).toEqual([b, a, d]);
    expect(rankByContext([a, d, b], "lyon criteo")).toEqual([d, b, a]);
    expect(rankByContext([a, b], "")).toEqual([a, b]);
  });

  const DELORME = (n: number, headline: string): LinkedinCandidate => ({ url: `https://www.linkedin.com/in/camille-ardent-${n}`, name: "Camille Ardent", headline });

  it("une requête au nom et au mot-clé, suivie des homonymes déjà en cache, sans payer davantage", async () => {
    const criteo = DELORME(9, "ml @ Criteo AI Lab");
    const others = [1, 2, 3, 4, 5, 6].map((n) => DELORME(n, `Poste ${n}`));
    const { provider, calls } = fakeProvider(() => (calls.at(-1)?.context ? [criteo] : [...others, criteo]));
    const { search, cache } = service(provider);
    await search.byName("Camille Ardent");
    const r = await search.byName("Camille Ardent", { context: "criteo" });
    expect(calls).toEqual([
      { full: "Camille Ardent", strict: false },
      { full: "Camille Ardent", strict: false, context: "criteo" },
    ]);
    expect(r.status === "ok" && r.results.map((c) => c.url)).toEqual([criteo, ...others].map((c) => c.url));
    expect(cache.searchesToday(NOW)).toBe(2);
    // Un mot-clé de moins de trois lettres ne part pas : le nom seul, du cache, classé.
    const short = await search.byName("Camille Ardent", { context: "Po" });
    expect(short.status === "ok" && short.results[0]!.url).toBe(others[0]!.url);
    expect(calls).toHaveLength(2);
  });

  it("rien au mot-clé : le nom seul, classé par le mot-clé ; la connexion n'en a jamais", async () => {
    const { provider, calls } = fakeProvider(() => (calls.at(-1)?.context ? [] : [DELORME(1, "Boiron"), DELORME(2, "Criteo")]));
    const { search } = service(provider);
    const r = await search.byName("Camille Ardent", { context: "criteo paris" });
    expect(r.status === "ok" && r.results.map((c) => c.headline)).toEqual(["Criteo", "Boiron"]);
    expect(calls.map((c) => c.context ?? null)).toEqual(["criteo paris", null]);
    await search.byName("Camille Ardent", { strict: true, context: "ignoré" });
    expect(calls.at(-1)).toEqual({ full: "Camille Ardent", strict: true });
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

  it("l'employeur départage les homonymes : sa propre recherche, et dans la clé du cache son empreinte seulement", async () => {
    const { provider, calls } = fakeProvider(() => [CAMILLE]);
    const { search, db } = service(provider);
    await search.byName("Camille Ardent", { strict: true, company: "Paysolde" });
    await search.byName("Camille Ardent", { strict: true, company: "paysolde " });
    await search.byName("Camille Ardent", { strict: true });
    // Une saisie en cours ne porte jamais d'employeur.
    await search.byName("Camille Ardent", { company: "Paysolde" });
    expect(calls).toEqual([
      { full: "Camille Ardent", strict: true, company: "paysolde" },
      { full: "Camille Ardent", strict: true },
      { full: "Camille Ardent", strict: false },
    ]);
    const keys = (db.prepare("SELECT key FROM linkedin_searches").all() as { key: string }[]).map((r) => r.key);
    expect(keys).toHaveLength(3);
    expect(keys.join(" ")).not.toContain("paysolde");
  });

  it("un fournisseur trop lent pour la frappe : la saisie en cours répond « off » sans rien payer, le nom exact part", async () => {
    const { provider, calls } = fakeProvider(() => [CAMILLE]);
    const { search, cache } = service({ ...provider, typing: false });
    expect(await search.byName("Camille Ardent")).toEqual({ status: "off" });
    expect(cache.searchesToday(NOW)).toBe(0);
    expect((await search.byName("Camille Ardent", { strict: true })).status).toBe("ok");
    expect(calls).toHaveLength(1);
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
  it("sans clé : pas de recherche ; les index web dans l'ordre Brave, Serper, Apify ; Crustdata à la demande", () => {
    expect(linkedinSearchFromEnv({}, db())).toBeNull();
    expect(linkedinSearchFromEnv({ APIFY_TOKEN: "t", SERPER_API_KEY: "s", BRAVE_SEARCH_API_KEY: "b" }, db())?.providerName).toBe("brave, serper, apify-google");
    expect(linkedinSearchFromEnv({ SERPER_API_KEY: "s" }, db())?.providerName).toBe("serper");
    // L'ancien nom du fournisseur par défaut reste lu.
    expect(linkedinSearchFromEnv({ APIFY_TOKEN: "t", LINKEDIN_SEARCH_PROVIDER: "apify" }, db())?.providerName).toBe("apify-google");
    expect(linkedinSearchFromEnv({ BRAVE_SEARCH_API_KEY: "b", LINKEDIN_SEARCH_PROVIDER: "crustdata" }, db())).toBeNull();
    expect(linkedinSearchFromEnv({ CRUSTDATA_API_KEY: "k", LINKEDIN_SEARCH_PROVIDER: "crustdata" }, db())?.providerName).toBe("crustdata");
    expect(linkedinSearchFromEnv({ CRUSTDATA_API_KEY: "k", LINKEDIN_PROVIDER: "crustdata" }, db())?.providerName).toBe("crustdata");
    expect(linkedinSearchFromEnv({ CRUSTDATA_API_KEY: "k", LINKEDIN_PROVIDER: "crustdata", LINKEDIN_SEARCH_PROVIDER: "web", BRAVE_SEARCH_API_KEY: "b" }, db())?.providerName).toBe("brave");
  });

  it("avec le seul jeton Apify : pas de suggestions pendant la frappe", async () => {
    const search = linkedinSearchFromEnv({ APIFY_TOKEN: "t" }, db(), (async () => {
      throw new Error("aucun appel attendu");
    }) as typeof fetch)!;
    expect(await search.byName("Camille Ardent")).toEqual({ status: "off" });
  });
});
