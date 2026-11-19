// Retrouver un profil par un index web (SPEC §18.90), sans un seul appel réel :
// les réponses rejouées ont la forme de celles de Brave, de Serper et de l'acteur
// Apify de Google (relevées le 19 novembre 2026), les personnes sont inventées.

import { describe, expect, it } from "vitest";
import { parsePersonName } from "../names";
import apifyFixture from "./__fixtures__/web-apify-google.json";
import braveFixture from "./__fixtures__/web-brave.json";
import serperFixture from "./__fixtures__/web-serper.json";
import {
  ApifyGoogleSearch,
  BraveSearch,
  GOOGLE_ACTOR,
  MIN_SEARCH_SCORE,
  SerperSearch,
  WebPeopleSearch,
  buildQueries,
  candidateFromHit,
  companyTerm,
  confidenceFor,
  linkedinUrlsInText,
  nameInUrl,
  plain,
  scoreHit,
  typedMatches,
  type SearchHit,
  type WebSearchProvider,
} from "./webSearch";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const CAMILLE = parsePersonName("Camille Ardent")!;

interface Call {
  url: URL;
  method: string;
  headers: Headers;
  body: unknown;
}

/** Un faux réseau : chaque index répond par sa réponse rejouée, ou par la panne demandée. */
function network(over: { brave?: () => Response; serper?: () => Response; apify?: () => Response } = {}) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, method: init?.method ?? "GET", headers: new Headers(init?.headers), body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.hostname === "api.search.brave.com") return (over.brave ?? (() => json(braveFixture)))();
    if (url.hostname === "google.serper.dev") return (over.serper ?? (() => json(serperFixture)))();
    if (url.hostname === "api.apify.com") return (over.apify ?? (() => json(apifyFixture, 201)))();
    throw new Error(`appel inattendu : ${url.hostname}`);
  }) as typeof fetch;
  const providers: WebSearchProvider[] = [new BraveSearch({ apiKey: "brave-secret", fetchImpl: impl }), new SerperSearch({ apiKey: "serper-secret", fetchImpl: impl }), new ApifyGoogleSearch({ token: "apify-secret", fetchImpl: impl })];
  return { calls, impl, providers, hosts: () => calls.map((c) => c.url.hostname) };
}

const hit = (over: Partial<SearchHit>): SearchHit => ({ url: "https://www.linkedin.com/in/camille-ardent", title: "Camille Ardent - Paysolde | LinkedIn", description: "", rank: 1, ...over });

describe("les trois index, réponses rejouées", () => {
  it("Brave : GET, la clé en X-Subscription-Token, les résultats de web.results sans balises ni entités", async () => {
    const net = network();
    const hits = await net.providers[0]!.search('site:linkedin.com/in "Camille Ardent"', { count: 5 });
    expect(net.calls).toHaveLength(1);
    const call = net.calls[0]!;
    expect(call.method).toBe("GET");
    expect(call.url.origin + call.url.pathname).toBe("https://api.search.brave.com/res/v1/web/search");
    expect(Object.fromEntries(call.url.searchParams)).toEqual({ q: 'site:linkedin.com/in "Camille Ardent"', count: "5", country: "FR", search_lang: "fr", safesearch: "moderate" });
    expect(call.headers.get("x-subscription-token")).toBe("brave-secret");
    expect(hits).toHaveLength(5);
    expect(hits[0]).toMatchObject({ url: "https://www.linkedin.com/in/camille-ardent/", title: "Camille Ardent - Paysolde | LinkedIn", rank: 1 });
    expect(hits[0]!.description).toContain("chez Paysolde · Experience: Paysolde");
    expect(hits[1]!.title).toBe("Camille Ardent - Cheffe de projet & formatrice | LinkedIn");
  });

  it("Serper : POST, la clé en X-API-KEY, les résultats de organic (link, snippet, position)", async () => {
    const net = network();
    const hits = await net.providers[1]!.search('site:linkedin.com/in "Camille Ardent"');
    const call = net.calls[0]!;
    expect(call.method).toBe("POST");
    expect(call.url.href).toBe("https://google.serper.dev/search");
    expect(call.headers.get("x-api-key")).toBe("serper-secret");
    expect(call.body).toEqual({ q: 'site:linkedin.com/in "Camille Ardent"', num: 10, gl: "fr", hl: "fr" });
    expect(hits.map((h) => [h.url, h.rank])).toEqual([
      ["https://www.linkedin.com/in/camille-ardent", 1],
      ["https://fr.linkedin.com/in/camille-ardent-2", 2],
      ["https://www.google.com/goto?url=CAESbwHEIkXXexemple&gsessionid=exemple", 3],
    ]);
  });

  it("l'acteur Apify de Google : une page, le jeton en Bearer, les résultats de organicResults", async () => {
    const net = network();
    const hits = await net.providers[2]!.search('site:linkedin.com/in "Camille Ardent"');
    const call = net.calls[0]!;
    expect(call.url.pathname).toBe(`/v2/acts/${GOOGLE_ACTOR}/run-sync-get-dataset-items`);
    expect(call.url.searchParams.get("timeout")).toBe("90");
    expect(call.headers.get("authorization")).toBe("Bearer apify-secret");
    expect(call.body).toEqual({ queries: 'site:linkedin.com/in "Camille Ardent"', maxPagesPerQuery: 1, resultsPerPage: 10, countryCode: "fr", languageCode: "fr" });
    expect(hits.map((h) => h.title)).toEqual(["Camille Ardent - Senior Full-Stack Engineer @Paysolde", "Camille Ardent – Cheffe de projet – Mairie de Nantes"]);
  });

  it("une panne HTTP lève une erreur qui porte le statut, jamais la clé", async () => {
    const net = network({ brave: () => json({ error: "quota" }, 429), serper: () => json({}, 403), apify: () => json({ error: { type: "run-failed" } }, 400) });
    for (const p of net.providers) {
      const err = await p.search("x").catch((e: Error & { status?: number }) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as { status: number }).status).toBeGreaterThanOrEqual(400);
      expect((err as Error).message).not.toMatch(/secret/);
    }
  });

  it("une réponse sans la forme attendue : aucun résultat, pas d'erreur", async () => {
    const net = network({ brave: () => json({ type: "search" }), serper: () => json({ organic: "non" }), apify: () => json([{ "#error": true }]) });
    for (const p of net.providers) expect(await p.search("x")).toEqual([]);
  });
});

describe("le rapprochement, repris de l'application Azerit", () => {
  it("les requêtes : le nom entre guillemets, l'employeur sans, deux au plus", () => {
    expect(buildQueries({ name: "Camille Ardent" })).toEqual(['site:linkedin.com/in "Camille Ardent"']);
    expect(buildQueries({ name: "Camille Ardent", company: "@paysolde" })).toEqual(['site:linkedin.com/in "Camille Ardent" paysolde', 'site:linkedin.com/in "Camille Ardent"']);
    expect(buildQueries({ name: 'Camille "la" Ardent', company: "Paysolde", location: "Lyon" })).toEqual(['site:linkedin.com/in "Camille  la  Ardent" Paysolde'.replace(/ {2}/g, " "), 'site:linkedin.com/in "Camille la Ardent" "Lyon"']);
    expect(buildQueries({ name: "", login: "camille-dev", location: "Lyon" })).toEqual(['site:linkedin.com/in "camille-dev" "Lyon"', 'site:linkedin.com/in "camille-dev"']);
    expect(buildQueries({ name: "" })).toEqual([]);
    expect(companyTerm("@datadoghq")).toBe("datadoghq");
  });

  it("le score : le nom exact, puis l'employeur, le lieu, le pseudo dans l'adresse et le rang", () => {
    const who = { name: "Camille Ardent", company: "Paysolde", location: "Lyon, Auvergne-Rhône-Alpes", login: "camille-ardent" };
    const full = scoreHit(who, hit({ description: "Experience: Paysolde · Location: Lyon" }));
    expect(full).toEqual({ score: 1, matched: ["name_exact", "company", "location", "github_login"] });
    expect(scoreHit({ name: "Camille Ardent" }, hit({ rank: 1 }))).toEqual({ score: 0.67, matched: ["name_exact"] });
    expect(scoreHit({ name: "Camille Ardent" }, hit({ rank: 4 }))).toEqual({ score: 0.64, matched: ["name_exact"] });
    // Les mots du nom dans le désordre, puis une partie seulement.
    expect(scoreHit({ name: "Camille Ardent" }, hit({ url: "https://www.linkedin.com/in/x1", title: "Ardent, Camille | LinkedIn", rank: 9 }))).toEqual({ score: 0.5, matched: ["name_tokens"] });
    expect(scoreHit({ name: "Camille Marie Ardent" }, hit({ url: "https://www.linkedin.com/in/x1", rank: 9 })).matched).toEqual(["name_partial"]);
    // « Ardenne » n'est pas « Ardent » : le nom se lit par mots entiers.
    expect(scoreHit({ name: "Camille Ardent" }, hit({ url: "https://www.linkedin.com/in/x1", title: "Camille Ardenne - Paysolde | LinkedIn" })).matched).toEqual([]);
  });

  it("sans le nom, l'employeur et le lieu ne suffisent jamais : plafonné sous le seuil", () => {
    const { score, matched } = scoreHit({ name: "Camille Ardent", company: "Paysolde", location: "Lyon" }, hit({ url: "https://www.linkedin.com/in/x1", title: "Sacha Valdor - Paysolde | LinkedIn", description: "Location: Lyon" }));
    expect(matched).toEqual(["company", "location"]);
    expect(score).toBe(0.25);
    expect(score).toBeLessThan(MIN_SEARCH_SCORE);
  });

  it("l'échelle de confiance : haute à 0,80, moyenne à 0,55", () => {
    expect([0.9, 0.8, 0.79, 0.55, 0.54, 0.3].map(confidenceFor)).toEqual(["high", "high", "medium", "medium", "low", "low"]);
  });

  it("le nom dans l'adresse départage une page d'équipe", () => {
    expect(nameInUrl("Camille Ardent", "https://www.linkedin.com/in/camille-ardent-51a852208")).toBe(true);
    expect(nameInUrl("Camille Ardent", "https://www.linkedin.com/in/sacha-valdor")).toBe(false);
    expect(nameInUrl("", "https://www.linkedin.com/in/camille-ardent")).toBe(false);
  });

  it("les adresses /in/ d'un texte : lien markdown, badge, texte brut, une fois chacune", () => {
    const readme = "[![LinkedIn](https://img.shields.io/badge/LinkedIn-blue)](https://www.linkedin.com/in/Camille-Ardent/) et aussi fr.linkedin.com/in/camille-ardent. Voir linkedin.com/company/paysolde, linkedin.com/in/sacha-valdor?trk=x";
    expect(linkedinUrlsInText(readme)).toEqual(["https://www.linkedin.com/in/camille-ardent", "https://www.linkedin.com/in/sacha-valdor"]);
    expect(linkedinUrlsInText(null)).toEqual([]);
  });
});

describe("du résultat au candidat", () => {
  it("« Nom - Entreprise | LinkedIn » : l'adresse normalisée, le nom, ce qui départage", () => {
    expect(candidateFromHit(hit({ url: "https://fr.linkedin.com/in/Camille-Ardent/?trk=x" }))).toEqual({ url: "https://www.linkedin.com/in/camille-ardent", name: "Camille Ardent", headline: "Paysolde" });
    expect(candidateFromHit(hit({ title: "Camille Ardent – Cheffe de projet – Mairie de Nantes" }))?.headline).toBe("Cheffe de projet – Mairie de Nantes");
    expect(candidateFromHit(hit({ title: "Camille Ardent - Senior Advanced support ..." }))?.headline).toBe("Senior Advanced support");
    expect(candidateFromHit(hit({ title: "Anne-Camille Ardent | LinkedIn" }))).toMatchObject({ name: "Anne-Camille Ardent", headline: "" });
  });

  it("un titre sans rien après le nom : l'employeur et le lieu de l'extrait", () => {
    expect(candidateFromHit(hit({ title: "Camille Ardent - -- | LinkedIn", description: "-- · Location: Chile · 15 connections on LinkedIn." }))?.headline).toBe("Chile");
    expect(candidateFromHit(hit({ title: "Camille Ardent | LinkedIn", description: "CTO · Experience: Paysolde · Location: Lyon · 500+ connections" }))?.headline).toBe("Paysolde · Lyon");
  });

  it("ce qui n'est pas un profil est écarté : publication, entreprise, redirection de Google, titre vide", () => {
    for (const url of ["https://www.linkedin.com/posts/paysolde_x-activity-1", "https://www.linkedin.com/company/paysolde", "https://www.google.com/goto?url=x", "https://exemple.fr/in/camille"]) expect(candidateFromHit(hit({ url }))).toBeNull();
    expect(candidateFromHit(hit({ title: " | LinkedIn" }))).toBeNull();
  });

  it("une saisie en cours : chaque mot tapé commence un mot du nom ou de l'adresse", () => {
    const c = { url: "https://www.linkedin.com/in/camille-ardent", name: "Camille Ardent", headline: "" };
    expect(typedMatches("cam ard", c)).toBe(true);
    expect(typedMatches("Camille Ardént", c)).toBe(true);
    expect(typedMatches("camille arden", { ...c, name: "Camille Ardenne" })).toBe(true);
    expect(typedMatches("camille roa", c)).toBe(false);
    expect(typedMatches("   ", c)).toBe(false);
    expect(plain("A &amp; B <strong>C</strong>&#39;s &eacute;")).toBe("A & B C's &eacute;");
  });
});

describe("la recherche de personnes", () => {
  it("nom exact : Brave répond, les profils du nom d'abord par score, rien d'autre n'est appelé", async () => {
    const net = network();
    const found = await new WebPeopleSearch({ providers: net.providers }).searchByName(CAMILLE, { strict: true });
    expect(net.hosts()).toEqual(["api.search.brave.com"]);
    expect(net.calls[0]!.url.searchParams.get("q")).toBe('site:linkedin.com/in "Camille Ardent"');
    expect(found.map((c) => [c.url, c.name, c.headline, c.score])).toEqual([
      ["https://www.linkedin.com/in/camille-ardent", "Camille Ardent", "Paysolde", 0.67],
      ["https://www.linkedin.com/in/camille-ardent-2", "Camille Ardent", "Cheffe de projet & formatrice", 0.66],
      ["https://www.linkedin.com/in/camille-ardent-ab30b2aa", "Camille Ardent", "Chile", 0.65],
    ]);
  });

  it("avec l'employeur : la requête précise suffit dès qu'un profil porte le nom et l'employeur", async () => {
    const net = network();
    const found = await new WebPeopleSearch({ providers: net.providers }).searchByName(CAMILLE, { strict: true, company: "Paysolde" });
    expect(net.calls.map((c) => c.url.searchParams.get("q"))).toEqual(['site:linkedin.com/in "Camille Ardent" Paysolde']);
    expect(found[0]).toMatchObject({ url: "https://www.linkedin.com/in/camille-ardent", score: 0.9 });
    expect(confidenceFor(found[0]!.score!)).toBe("high");
    expect(found.slice(1).every((c) => confidenceFor(c.score!) === "medium")).toBe(true);
  });

  it("un nom cité dans l'extrait d'un autre profil ne fait pas un candidat", async () => {
    const colleague = { title: "Sacha Valdor - Paysolde | LinkedIn", url: "https://www.linkedin.com/in/sacha-valdor", description: "Bravo à <strong>Camille Ardent</strong> pour la refonte du paiement chez Paysolde." };
    const net = network({ brave: () => json({ web: { results: [colleague, ...braveFixture.web.results] } }) });
    const found = await new WebPeopleSearch({ providers: net.providers }).searchByName(CAMILLE, { strict: true, company: "Paysolde" });
    expect(found.map((c) => c.name)).toEqual(["Camille Ardent", "Camille Ardent", "Camille Ardent"]);
  });

  it("l'employeur ne concorde nulle part : la requête large suit", async () => {
    const net = network();
    await new WebPeopleSearch({ providers: net.providers }).searchByName(CAMILLE, { strict: true, company: "Introuvable SA" });
    expect(net.calls.map((c) => c.url.searchParams.get("q"))).toEqual(['site:linkedin.com/in "Camille Ardent" Introuvable SA', 'site:linkedin.com/in "Camille Ardent"']);
  });

  it("Brave en panne ou sans profil : Serper ; Apify seulement si les deux sont en panne", async () => {
    const down = network({ brave: () => json({}, 429) });
    expect((await new WebPeopleSearch({ providers: down.providers }).searchByName(CAMILLE, { strict: true })).map((c) => c.url)).toEqual(["https://www.linkedin.com/in/camille-ardent", "https://www.linkedin.com/in/camille-ardent-2"]);
    expect(down.hosts()).toEqual(["api.search.brave.com", "google.serper.dev"]);

    const empty = network({ brave: () => json({ web: { results: [] } }) });
    expect(await new WebPeopleSearch({ providers: empty.providers }).searchByName(CAMILLE, { strict: true })).toHaveLength(2);
    expect(empty.hosts()).toEqual(["api.search.brave.com", "google.serper.dev"]);

    const both = network({ brave: () => json({}, 500), serper: () => json({}, 500) });
    expect((await new WebPeopleSearch({ providers: both.providers }).searchByName(CAMILLE, { strict: true })).map((c) => c.headline)).toEqual(["Senior Full-Stack Engineer @Paysolde", "Cheffe de projet – Mairie de Nantes"]);
    expect(both.hosts()).toEqual(["api.search.brave.com", "google.serper.dev", "api.apify.com"]);

    // Brave a répondu « personne », Serper est en panne : personne, sans l'index lent.
    const none = network({ brave: () => json({ web: { results: [] } }), serper: () => json({}, 500) });
    expect(await new WebPeopleSearch({ providers: none.providers }).searchByName(CAMILLE, { strict: true })).toEqual([]);
    expect(none.hosts()).toEqual(["api.search.brave.com", "google.serper.dev"]);
  });

  it("tous en panne : l'erreur remonte, le service dira « off »", async () => {
    const net = network({ brave: () => json({}, 500), serper: () => json({}, 500), apify: () => json({}, 400) });
    await expect(new WebPeopleSearch({ providers: net.providers }).searchByName(CAMILLE, { strict: true })).rejects.toMatchObject({ status: 400 });
  });

  it("saisie en cours : une requête sans guillemets, les index rapides seulement, les débuts de mots", async () => {
    const net = network();
    const people = new WebPeopleSearch({ providers: net.providers });
    const found = await people.searchByName(parsePersonName("camille arden")!, { strict: false, company: "Paysolde" });
    expect(net.calls.map((c) => c.url.searchParams.get("q"))).toEqual(["site:linkedin.com/in camille arden"]);
    expect(found.map((c) => c.name)).toEqual(["Camille Ardent", "Camille Ardent", "Camille Ardent", "Camille Ardenne"]);
    expect(found.every((c) => c.score === undefined && c.photoUrl === undefined)).toBe(true);

    const down = network({ brave: () => json({}, 500), serper: () => json({}, 500) });
    await expect(new WebPeopleSearch({ providers: down.providers }).searchByName(CAMILLE, { strict: false })).rejects.toMatchObject({ status: 500 });
    expect(down.hosts()).toEqual(["api.search.brave.com", "google.serper.dev"]);
    expect(people.typing).toBe(true);
    expect(new WebPeopleSearch({ providers: [net.providers[2]!] }).typing).toBe(false);
    expect(people.name).toBe("brave, serper, apify-google");
  });
});
