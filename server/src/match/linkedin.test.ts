// Le LinkedIn proposé sous une fiche GitHub seule (SPEC §18.100) : la base de l'App
// d'abord, l'index web ensuite, un seul profil au même nom, sinon rien. Noms inventés.

import { describe, expect, it, vi } from "vitest";
import type { LinkedinCandidate, SearchResult } from "../linkedinProfile/search";
import type { Namesake } from "../registry/index";
import { candidateFromHit } from "../linkedinProfile/webSearch";
import { asLinkedinMatch, findLinkedinFor, judgeLinkedin, orgTerms, pickLinkedin, placeWords, profileNamesOrg, type GithubHints } from "./linkedin";

const CAMILLE: GithubHints = { login: "camille-dev", name: "Camille Ardent", company: "@paysolde" };
const li = (slug: string, name: string, headline = "", score?: number): LinkedinCandidate => ({ url: `https://www.linkedin.com/in/${slug}`, name, headline, ...(score !== undefined ? { score } : {}) });

describe("pickLinkedin", () => {
  it("le seul profil au même nom complet", () => {
    expect(pickLinkedin(CAMILLE, [li("camille-ardent", "Camille Ardent", "Backend · Paysolde"), li("autre", "Camille Martin")])).toEqual({
      kind: "linkedin",
      url: "https://www.linkedin.com/in/camille-ardent",
      name: "Camille Ardent",
      headline: "Backend · Paysolde",
      sure: false,
    });
  });

  it("des homonymes : celui dont le titre nomme l'entreprise du GitHub, sinon le seul sûr pour l'index, sinon rien", () => {
    const two = [li("camille-ardent-1", "Camille Ardent", "Data · Banque"), li("camille-ardent-2", "Camille Ardent", "Backend chez Paysolde")];
    expect(pickLinkedin(CAMILLE, two)?.url).toBe("https://www.linkedin.com/in/camille-ardent-2");
    const scored = [li("a1", "Camille Ardent", "", 0.62), li("a2", "Camille Ardent", "", 0.85)];
    expect(pickLinkedin({ ...CAMILLE, company: null }, scored)?.url).toBe("https://www.linkedin.com/in/a2");
    expect(pickLinkedin({ ...CAMILLE, company: null }, [li("a1", "Camille Ardent"), li("a2", "Camille Ardent")])).toBeNull();
  });

  it("sans nom complet sur GitHub, ou personne au même nom : rien", () => {
    expect(pickLinkedin({ ...CAMILLE, name: "Camille" }, [li("c", "Camille Ardent")])).toBeNull();
    expect(pickLinkedin(CAMILLE, [li("c", "Camille Martin")])).toBeNull();
    expect(pickLinkedin(CAMILLE, [])).toBeNull();
  });
});

describe("findLinkedinFor", () => {
  const namesake = (slug: string, name: string | null, headline = ""): Namesake => ({ url: `https://www.linkedin.com/in/${slug}`, name, headline, hasPhoto: false });

  it("l'App trouve : le web n'est pas payé", async () => {
    const byName = vi.fn(async (): Promise<SearchResult> => ({ status: "ok", results: [] }));
    const p = await findLinkedinFor({ namesakes: async () => [namesake("camille-ardent", "Camille Ardent", "Backend")], byName }, CAMILLE);
    expect(p?.url).toBe("https://www.linkedin.com/in/camille-ardent");
    expect(byName).not.toHaveBeenCalled();
  });

  it("rien chez l'App : l'index web, une requête au nom seul, et la limite de l'IP", async () => {
    const spend = () => true;
    const byName = vi.fn(async (): Promise<SearchResult> => ({ status: "ok", results: [li("camille-ardent", "Camille Ardent", "Backend")] }));
    const p = await findLinkedinFor({ namesakes: async () => [namesake("camille-ardent-x", null)], byName }, CAMILLE, { spend });
    expect(p?.url).toBe("https://www.linkedin.com/in/camille-ardent");
    expect(byName).toHaveBeenCalledWith("Camille Ardent", expect.objectContaining({ strict: true, nameOnly: true, company: null, spend }));
  });

  it("l'index lent : rien, au bout du délai", async () => {
    const byName = () => new Promise<SearchResult>(() => {});
    const t0 = Date.now();
    expect(await findLinkedinFor({ byName }, CAMILLE, { budgetMs: 120 })).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("l'index en panne, ou pas de nom complet : rien, sans erreur", async () => {
    expect(await findLinkedinFor({ byName: async () => ({ status: "off" }) }, CAMILLE)).toBeNull();
    expect(await findLinkedinFor({ byName: async () => Promise.reject(new Error("x")) }, CAMILLE)).toBeNull();
    const byName = vi.fn();
    expect(await findLinkedinFor({ byName }, { ...CAMILLE, name: "camille" })).toBeNull();
    expect(byName).not.toHaveBeenCalled();
  });
});

// --- Le jugement (§18.125) : nom exact, puis école ou employeur, ville, pseudo, nom rare -------

describe("judgeLinkedin", () => {
  /** Ce que Brave rendait le 20 novembre 2026 pour `site:linkedin.com/in "Enzo Le Van"` (le titre, l'extrait coupé). */
  const enzoHit = { url: "https://www.linkedin.com/in/enzo-le-van/", title: "Enzo Le Van - Gif-sur-Yvette, Île-de-France, France | Professional Profile | LinkedIn", description: "“I had the pleasure of working with Enzo Le Van during his internship at our company.", rank: 1 };
  const HENNZAU: GithubHints = { login: "Hennzau", name: "Enzo Le Van", company: "CentraleSupélec / Linköping University", location: "Gif-sur-Yvette - France", blog: "git.enzolevan.fr", bio: "I'm an engineering student in France" };
  const at = (slug: string, name: string, extra: Partial<LinkedinCandidate> = {}): LinkedinCandidate => ({ url: `https://www.linkedin.com/in/${slug}`, name, headline: "", ...extra });

  it("Hennzau : le titre de l'index ne dit que le lieu, sa ville est celle du GitHub : fort", () => {
    const c = candidateFromHit(enzoHit)!;
    expect(c).toMatchObject({ name: "Enzo Le Van", headline: "Gif-sur-Yvette, Île-de-France, France", location: "Gif-sur-Yvette, Île-de-France, France", placeOnly: true });
    const m = judgeLinkedin(HENNZAU, [c]);
    expect(m).toMatchObject({ strength: "strong", why: ["city"], proposal: { url: "https://www.linkedin.com/in/enzo-le-van", name: "Enzo Le Van" } });
  });

  it("deux homonymes : la ville tranche ; un nom voisin ne compte pas comme homonyme", () => {
    const list = [at("enzo-le-van-1", "Enzo Le Van", { location: "Rennes, Bretagne" }), at("enzo-le-van", "Enzo Le Van", { location: "Gif-sur-Yvette, Île-de-France" }), at("enzo-van", "Enzo Van", { location: "Gif-sur-Yvette" })];
    expect(judgeLinkedin(HENNZAU, list)).toMatchObject({ strength: "strong", why: ["city"], proposal: { url: "https://www.linkedin.com/in/enzo-le-van" } });
  });

  it("un nom courant dans d'autres villes : rien ; seul à ce nom mais ailleurs : proposé, jamais attaché", () => {
    const tom: GithubHints = { login: "tmartin", name: "Thomas Martin", company: null, location: "Lyon, France" };
    const others = [at("thomas-martin-1", "Thomas Martin", { location: "Bordeaux" }), at("thomas-martin-2", "Thomas Martin", { location: "Nantes" }), at("thomas-martin-3", "Thomas MARTIN", { headline: "Comptable", location: "Lille" })];
    expect(judgeLinkedin(tom, others)).toBeNull();
    expect(judgeLinkedin(tom, [others[0]!])).toMatchObject({ strength: "medium", why: ["rare", "other_city"] });
    // « France » ne désigne aucune ville : il ne contredit pas Paris.
    expect(judgeLinkedin({ ...tom, location: "Paris" }, [at("tm", "Thomas Martin", { location: "France" })])).toMatchObject({ strength: "strong", why: ["rare"] });
  });

  it("l'école du GitHub dans le titre ou l'extrait : fort, même parmi des homonymes de la même ville", () => {
    const list = [at("enzo-le-van-paris", "Enzo Le Van", { headline: "Data · BNP", location: "Paris" }), at("enzo-le-van-cs", "Enzo Le Van", { headline: "Élève ingénieur - Centrale Supélec", location: "Paris" })];
    expect(judgeLinkedin({ ...HENNZAU, location: "Paris" }, list)).toMatchObject({ strength: "strong", why: ["org"], proposal: { url: "https://www.linkedin.com/in/enzo-le-van-cs" } });
    const snippet = [at("a", "Enzo Le Van", { snippet: "Experience: Saab · Education: Linköping University · Location: Linköping" }), at("b", "Enzo Le Van", { headline: "Chef de projet" })];
    expect(judgeLinkedin({ ...HENNZAU, location: null }, snippet)).toMatchObject({ strength: "strong", why: ["org"], proposal: { url: "https://www.linkedin.com/in/a" } });
  });

  it("des homonymes que rien ne départage : le premier sans poste est à vérifier, s'il y a une école ou un employeur à comparer", () => {
    const list = [at("x1", "Enzo Le Van", { headline: "Comptable" }), at("x2", "Enzo Le Van", { headline: "Lyon", location: "Lyon", placeOnly: true }), at("x3", "Enzo Le Van")];
    const gh = { ...HENNZAU, location: null };
    expect(judgeLinkedin(gh, list)).toMatchObject({ strength: "verify", proposal: { url: "https://www.linkedin.com/in/x2" } });
    expect(judgeLinkedin({ ...gh, company: null }, list)).toBeNull();
    expect(profileNamesOrg(gh, { roles: [{ company: "Saab" }], education: [{ school: "CentraleSupélec" }] })).toBe(true);
    expect(profileNamesOrg(gh, { roles: [{ company: "Saab" }], education: [{ school: "INSA Lyon" }] })).toBe(false);
  });

  it("le pseudo ou le site dans l'adresse ; les mots de l'entreprise et du lieu qui ne désignent rien", () => {
    const list = [at("enzo-le-van-123", "Enzo Le Van"), at("hennzau", "Enzo Le Van"), at("enzolevan", "Enzo Le Van")];
    expect(judgeLinkedin({ ...HENNZAU, company: null, location: null }, list)).toMatchObject({ strength: "strong", why: ["handle"], proposal: { url: "https://www.linkedin.com/in/hennzau" } });
    expect(orgTerms({ company: "CentraleSupélec / Linköping University", bio: "Rust at @datadog", name: "Enzo Le Van" })).toEqual(["centralesupelec", "linkoping", "datadog"]);
    expect(placeWords("Paris region, France")).toEqual(["paris"]);
    expect(placeWords("France")).toEqual([]);
  });

  it("une proposition nue (d'avant) garde l'ancienne règle", () => {
    const p = { kind: "linkedin" as const, url: "https://www.linkedin.com/in/c", name: "Camille Ardent", headline: "Backend · Paysolde", sure: false };
    expect(asLinkedinMatch({ login: "camille-ardent", name: "Camille Ardent", company: "@paysolde" }, p)?.strength).toBe("strong");
    expect(asLinkedinMatch({ login: "camille-ardent", name: "Camille Ardent", company: null }, p)?.strength).toBe("medium");
  });
});
