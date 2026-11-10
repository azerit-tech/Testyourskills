// Client Crustdata, sans un seul appel réel : fetch est remplacé, les réponses
// sont des fixtures inventées (personne fictive) au format de la doc 2025-11-01.

import { describe, expect, it } from "vitest";
import enrichFixture from "./__fixtures__/enrich.json";
import searchFixture from "./__fixtures__/search.json";
import { CRUSTDATA_VERSION, CrustdataClient, CrustdataError, githubLoginOf } from "./crustdata";

const URL_ = "https://www.linkedin.com/in/camille-ardent";
const KEY = "sk-test-not-a-real-key";

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function fakeFetch(...replies: (Response | (() => Response) | Error)[]) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: JSON.parse(String(init?.body ?? "{}")),
    });
    const r = replies.shift();
    if (!r) throw new Error("appel inattendu");
    if (r instanceof Error) throw r;
    return typeof r === "function" ? r() : r;
  }) as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const client = (impl: typeof fetch) => new CrustdataClient({ apiKey: KEY, fetchImpl: impl });

describe("enrichissement (POST /person/enrich)", () => {
  it("demande la base seulement, avec la clé en Bearer et la version 2025-11-01", async () => {
    const f = fakeFetch(json(enrichFixture, 200, { "x-credits-used": "1" }));
    const r = await client(f.impl).enrich(URL_);
    expect(f.calls).toHaveLength(1);
    const c = f.calls[0]!;
    expect(c.url).toBe("https://api.crustdata.com/person/enrich");
    expect(c.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(c.headers["x-api-version"]).toBe(CRUSTDATA_VERSION);
    expect(c.body).toEqual({ professional_network_profile_urls: [URL_], fields: ["basic_profile", "experience", "education", "skills"] });
    // Jamais de contact, jamais de temps réel.
    expect(JSON.stringify(c.body)).not.toMatch(/contact|email|phone|realtime|social_posts/);
    expect(r.credits).toBe(1);
    expect(r.githubLogin).toBeNull();
    const p = r.profile!;
    expect(p.name).toBe("Camille Ardent");
    expect(p.title).toBe("Senior Full-Stack Engineer");
    expect(p.roles.map((x) => [x.company, x.start, x.end, x.contract])).toEqual([
      ["Paysolde", "2022-03", null, "full_time"],
      ["Studio Bleu", "2019-01", "2022-02", "full_time"],
      ["Atelier Quartz", "2018-02", "2018-07", "internship"],
    ]);
    expect(p.education[0]).toEqual({ school: "INSA Lyon", degree: "Diplôme d'ingénieur", field: "Informatique", start: 2014, end: 2019 });
    // Doublon de casse retiré.
    expect(p.skills).toEqual(["TypeScript", "React", "Node.js", "PostgreSQL", "Agile"]);
    // Ni lieu, ni photo, ni identifiant Crustdata : rien qui ne serve au jugement.
    expect(JSON.stringify(p)).not.toMatch(/Lyon, Auvergne|media\.example|9900001|location/);
  });

  it("entrée LinkedIn : ajoute l'adresse GitHub seule (+1 crédit) et la lit", async () => {
    const f = fakeFetch(json(enrichFixture));
    const r = await client(f.impl).enrich(URL_, { withGithub: true });
    expect(f.calls[0]!.body.fields).toEqual([
      "basic_profile",
      "experience",
      "education",
      "skills",
      "dev_platform_profiles.profile_url",
      "social_handles.dev_platform_identifier.profile_url",
    ]);
    expect(r.githubLogin).toBe("camille-ardent");
    expect(r.credits).toBe(2); // sans en-tête : estimé
  });

  it("introuvable ou retiré : null, rien de facturé", async () => {
    const f = fakeFetch(
      json([{ matched_on: URL_, match_type: "professional_network_profile_url", match_status: "not_found", matches: [] }]),
      json([{ matched_on: URL_, match_status: "redacted", matches: [] }]),
    );
    const c = client(f.impl);
    expect(await c.enrich(URL_)).toEqual({ profile: null, githubLogin: null, credits: 0 });
    expect(await c.enrich(URL_)).toEqual({ profile: null, githubLogin: null, credits: 0 });
  });

  it("champ refusé par le compte (403) : redemande une fois sans lui", async () => {
    const denied = { error: { type: "permission_error", message: "Access denied to fields: skills", metadata: [{ denied_fields: ["skills"] }] } };
    const f = fakeFetch(json(denied, 403), json(enrichFixture));
    const r = await client(f.impl).enrich(URL_);
    expect(f.calls[1]!.body.fields).toEqual(["basic_profile", "experience", "education"]);
    expect(r.profile?.name).toBe("Camille Ardent");
  });

  it("clé refusée, crédits épuisés, panne : une erreur sans la clé", async () => {
    for (const status of [401, 403, 500]) {
      const f = fakeFetch(json({ error: { type: "unauthorized", message: "Invalid API key in request." } }, status));
      const err = await client(f.impl).enrich(URL_).catch((e) => e);
      expect(err).toBeInstanceOf(CrustdataError);
      expect((err as CrustdataError).status).toBe(status);
      expect(String((err as Error).message)).not.toContain(KEY);
    }
  });

  it("githubLoginOf : plateformes dev d'abord, puis la poignée sociale", () => {
    expect(githubLoginOf({ dev_platform_profiles: [{ profile_url: "https://github.com/a-b" }] })).toBe("a-b");
    expect(githubLoginOf({ social_handles: { dev_platform_identifier: { profile_url: "github.com/zed/" } } })).toBe("zed");
    expect(githubLoginOf({ dev_platform_profiles: [{ profile_url: "https://gitlab.com/x" }] })).toBeNull();
    expect(githubLoginOf(null)).toBeNull();
  });
});

describe("recherche par compte GitHub (POST /person/search)", () => {
  const gh = { login: "camille-ardent", name: "Camille Ardent", createdAt: "2014-09-12T08:30:00Z" };

  it("filtre sur le compte GitHub (jour de création, nom) et garde l'adresse qui correspond", async () => {
    const f = fakeFetch(json(searchFixture, 200, { "x-credits-used": "1.66" }));
    const r = await client(f.impl).searchByGithub(gh);
    const c = f.calls[0]!;
    expect(c.url).toBe("https://api.crustdata.com/person/search");
    expect(c.body).toEqual({
      filters: {
        op: "and",
        conditions: [
          { field: "dev_platform_profiles.metadata.created_at", type: "=>", value: "2014-09-12" },
          { field: "dev_platform_profiles.metadata.created_at", type: "<", value: "2014-09-13" },
          { field: "dev_platform_profiles.name", type: "=", value: "Camille Ardent" },
        ],
      },
      fields: ["social_handles.professional_network_identifier.profile_url", "social_handles.dev_platform_identifier.profile_url"],
      limit: 2,
    });
    expect(r).toEqual({ url: "https://www.linkedin.com/in/camille-ardent", credits: 1.66 });
  });

  it("aucune adresse GitHub qui corresponde : rien", async () => {
    const f = fakeFetch(json(searchFixture));
    const r = await client(f.impl).searchByGithub({ ...gh, login: "quelquun" });
    expect(r.url).toBeNull();
    expect(r.credits).toBeCloseTo(1.66);
  });

  it("un seul profil sans adresse GitHub : retenu avec le nom, pas sans", async () => {
    const one = { profiles: [{ social_handles: { professional_network_identifier: { profile_url: "https://www.linkedin.com/in/camille-ardent" } } }] };
    expect((await client(fakeFetch(json(one)).impl).searchByGithub(gh)).url).toBe("https://www.linkedin.com/in/camille-ardent");
    expect((await client(fakeFetch(json(one)).impl).searchByGithub({ ...gh, name: null })).url).toBeNull();
  });

  it("sans date de création : pas d'appel", async () => {
    const f = fakeFetch();
    expect(await client(f.impl).searchByGithub({ login: "x", createdAt: null })).toEqual({ url: null, credits: 0 });
    expect(f.calls).toHaveLength(0);
  });
});
