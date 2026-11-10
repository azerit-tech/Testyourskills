// Fournisseur Apify, sans un seul appel réel : fetch est remplacé ; deux formes
// de sortie fictives (personnes inventées) d'acteurs différents.

import { describe, expect, it } from "vitest";
import harvest from "./__fixtures__/apify-harvest.json";
import fusion from "./__fixtures__/apify-fusion.json";
import { ApifyError, ApifyProvider, apifyInput, DEFAULT_APIFY_ACTOR, githubFromApifyItem, profileFromApifyItem, whenOf } from "./apify";
import { contractOf } from "./profile";
import { profileToText } from "./text";

const TOKEN = "apify_api_test_not_a_real_token";
const URL_ = "https://www.linkedin.com/in/camille-ardent";

function fakeFetch(reply: Response | Error) {
  const calls: { url: string; headers: Record<string, string>; body: unknown; signal?: AbortSignal | null }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: Object.fromEntries(new Headers(init?.headers).entries()), body: JSON.parse(String(init?.body)), signal: init?.signal });
    if (reply instanceof Error) throw reply;
    return reply;
  }) as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("ApifyProvider : run-sync-get-dataset-items", () => {
  it("lance l'acteur par défaut, jeton en Bearer, délai de 60 s, entrée sans email", async () => {
    const f = fakeFetch(json(harvest));
    const r = await new ApifyProvider({ token: TOKEN, fetchImpl: f.impl }).fetchProfile(URL_);
    const c = f.calls[0]!;
    expect(c.url).toBe(`https://api.apify.com/v2/acts/${encodeURIComponent(DEFAULT_APIFY_ACTOR)}/run-sync-get-dataset-items?timeout=60&format=json&clean=true`);
    expect(c.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(c.url).not.toContain(TOKEN);
    expect(c.body).toEqual({ profileScraperMode: "Profile details no email ($4 per 1k)", queries: [URL_] });
    expect(r.profile?.name).toBe("Camille Ardent");
    expect(r.githubLogin).toBe("camille-ardent");
    expect(r.githubChecked).toBe(true);
  });

  it("acteur et entrée configurables : {url} remplacé partout", async () => {
    const f = fakeFetch(json(fusion));
    await new ApifyProvider({ token: TOKEN, actor: "someone~li-scraper", inputTemplate: '{"profileUrls":["{url}"],"startUrls":[{"url":"{url}"}]}', fetchImpl: f.impl }).fetchProfile(URL_);
    expect(f.calls[0]!.url).toContain("/acts/someone~li-scraper/");
    expect(f.calls[0]!.body).toEqual({ profileUrls: [URL_], startUrls: [{ url: URL_ }] });
    expect(apifyInput('{"a":{"b":["x {url} y"]},"n":3}', "U")).toEqual({ a: { b: ["x U y"] }, n: 3 });
    expect(() => new ApifyProvider({ token: TOKEN, inputTemplate: "{pas du json" })).toThrow();
  });

  it("jeu de données vide ou en erreur : introuvable", async () => {
    for (const body of [[], [{ error: "Profile not found" }], null]) {
      const r = await new ApifyProvider({ token: TOKEN, fetchImpl: fakeFetch(json(body)).impl }).fetchProfile(URL_);
      expect(r).toEqual({ profile: null, githubLogin: null, githubChecked: true });
    }
  });

  it("jeton refusé, délai dépassé (408), panne : une erreur sans le jeton", async () => {
    for (const status of [401, 402, 408, 500]) {
      const err = await new ApifyProvider({ token: TOKEN, fetchImpl: fakeFetch(json({ error: { type: "x" } }, status)).impl }).fetchProfile(URL_).catch((e) => e);
      expect(err).toBeInstanceOf(ApifyError);
      expect((err as ApifyError).status).toBe(status);
      expect((err as Error).message).not.toContain(TOKEN);
    }
  });

  it("le délai de 60 s coupe la requête (signal posé)", async () => {
    const f = fakeFetch(json(harvest));
    await new ApifyProvider({ token: TOKEN, fetchImpl: f.impl, timeoutMs: 5000 }).fetchProfile(URL_);
    expect(f.calls[0]!.url).toContain("timeout=5&");
    expect(f.calls[0]!.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("normaliseur tolérant : deux formes de sortie", () => {
  it("forme A (harvestapi) : postes datés par objets, formation, compétences en objets", () => {
    const p = profileFromApifyItem(URL_, harvest[0])!;
    expect(p.url).toBe(URL_);
    expect(p.name).toBe("Camille Ardent");
    expect(p.headline).toBe("Senior Full-Stack Engineer | TypeScript, React, Node.js");
    expect(p.title).toBe("Senior Full-Stack Engineer"); // le poste en cours
    expect(p.summary).toMatch(/^Full-stack depuis 7 ans/);
    expect(p.photoUrl).toBe("https://media.example.invalid/camille.jpg");
    // Le poste en cours d'abord.
    expect(p.roles.map((r) => [r.title, r.company, r.start, r.end, r.contract])).toEqual([
      ["Senior Full-Stack Engineer", "Paysolde", "2022-03", null, "full_time"],
      ["Développement web", "Studio Bleu", "2019-01", "2022-02", "full_time"],
      ["Développement web en alternance", "Imprimerie Lumen", "2017-09", "2018-08", "work_study"],
    ]);
    expect(p.education).toEqual([{ school: "INSA Lyon", degree: "Diplôme d'ingénieur", field: "Informatique", start: 2014, end: 2019 }]);
    expect(p.skills).toEqual(["TypeScript", "React", "Node.js"]);
    // Rien du lieu, rien des langues parlées.
    expect(JSON.stringify(p)).not.toMatch(/Auvergne|Français|Native|languages|location/);
  });

  it("forme B (dev_fusion) : postes groupés par entreprise, dates en légende française, morceaux de texte", () => {
    const p = profileFromApifyItem("https://www.linkedin.com/in/sacha-valdor", fusion[0])!;
    expect(p.url).toBe("https://www.linkedin.com/in/sacha-valdor");
    expect(p.name).toBe("Sacha Valdor");
    expect(p.title).toBe("Data engineer");
    expect(p.photoUrl).toBe("https://media.example.invalid/sacha.jpg");
    // Type de contrat : la légende du groupe (« CDI · 4 ans ») vaut pour ses postes, « Nébuleuse · Stage » pour le stage.
    expect(p.roles.map((r) => [r.title, r.company, r.start, r.end, r.contract])).toEqual([
      ["Data engineer", "Brumes", "2023-01", null, "full_time"],
      ["Data analyst", "Brumes", "2021-09", "2022-12", "full_time"],
      ["Stagiaire data", "Nébuleuse", "2021-01", "2021-01", "internship"],
    ]);
    expect(p.roles[0]!.description).toBe("Migration des pipelines vers Airflow.");
    expect(p.education).toEqual([{ school: "Université de Nantes", degree: "Master, Statistique", field: "", start: 2019, end: 2021 }]);
    expect(p.skills).toEqual(["Python", "Apache Spark"]);
  });

  it("sans type de contrat lisible : pas de clé", () => {
    const p = profileFromApifyItem(URL_, { fullName: "X", experience: [{ position: "Dev", companyName: "Acme · 2 ans", employmentType: "Seasonal" }] })!;
    expect(p.roles[0]).toEqual({ title: "Dev", company: "Acme", start: null, end: null, description: "" });
    expect("contract" in p.roles[0]!).toBe(false);
  });

  it("vide : null", () => {
    expect(profileFromApifyItem(URL_, {})).toBeNull();
    expect(profileFromApifyItem(URL_, null)).toBeNull();
    expect(profileFromApifyItem(URL_, { skills: [{ name: "Go" }] })).toBeNull();
  });

  it.each([
    ["Mar 2022", "2022-03"],
    ["janv. 2023", "2023-01"],
    ["sept. 2021", "2021-09"],
    ["3-2022", "2022-03"],
    ["2022-03-01T00:00:00Z", "2022-03"],
    ["2019", "2019-01"],
    [{ year: 2020, month: "Dec" }, "2020-12"],
    [{ year: 2020, month: 7 }, "2020-07"],
    [{ text: "Present" }, "present"],
    ["aujourd'hui", "present"],
    ["", null],
    ["bientôt", null],
  ])("whenOf(%j) = %j", (v, out) => {
    expect(whenOf(v)).toBe(out);
  });
});

describe("type de contrat d'un poste", () => {
  it.each([
    ["Internship", "internship"],
    ["Stage", "internship"],
    ["Stagiaire", "internship"],
    ["Apprenticeship", "work_study"],
    ["Alternance", "work_study"],
    ["Contrat d'apprentissage", "work_study"],
    ["Freelance", "freelance"],
    ["Self-employed", "freelance"],
    ["Indépendant", "freelance"],
    ["Full-time", "full_time"],
    ["Temps plein", "full_time"],
    ["CDI", "full_time"],
    ["CDD", "full_time"],
    ["Contract", "full_time"],
    ["Part-time", "part_time"],
    ["Temps partiel", "part_time"],
    ["Seasonal", null],
    ["Bénévolat", null],
    ["4 ans", null],
    ["", null],
    [null, null],
  ])("contractOf(%j) = %j", (v, out) => {
    expect(contractOf(v)).toBe(out);
  });

  it("passe dans le texte lu par l'IA, à côté du poste", () => {
    const t = profileToText(profileFromApifyItem(URL_, harvest[0])!);
    expect(t).toContain("Développement web en alternance — Imprimerie Lumen · Apprenticeship (work-study) (2017-09 – 2018-08)");
    expect(t).toContain("Senior Full-Stack Engineer — Paysolde · Full-time (2022-03 – present)");
  });
});

describe("le GitHub que le profil donne", () => {
  it("un lien de compte dans les sites passe devant un dépôt du résumé, jamais les postes", () => {
    expect(githubFromApifyItem(harvest[0])).toBe("camille-ardent");
    expect(githubFromApifyItem({ ...harvest[0], websites: [] })).toBe("camille-ardent"); // le dépôt du résumé, à défaut
    expect(githubFromApifyItem({ experience: harvest[0]!.experience })).toBeNull();
  });

  it("section contact, chaînes ou objets ; chemins réservés ignorés", () => {
    expect(githubFromApifyItem({ contactInfo: { websites: [{ url: "github.com/sacha-v" }] } })).toBe("sacha-v");
    expect(githubFromApifyItem({ website: "https://github.com/orgs/brumes" })).toBeNull();
    expect(githubFromApifyItem(fusion[0])).toBeNull();
    expect(githubFromApifyItem(null)).toBeNull();
  });
});
