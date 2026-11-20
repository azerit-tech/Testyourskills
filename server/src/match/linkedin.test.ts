// Le LinkedIn proposé sous une fiche GitHub seule (SPEC §18.100) : la base de l'App
// d'abord, l'index web ensuite, un seul profil au même nom, sinon rien. Noms inventés.

import { describe, expect, it, vi } from "vitest";
import type { LinkedinCandidate, SearchResult } from "../linkedinProfile/search";
import type { Namesake } from "../registry/index";
import { findLinkedinFor, pickLinkedin, type GithubHints } from "./linkedin";

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

  it("rien chez l'App : l'index web, avec le nom exact et l'entreprise, et la limite de l'IP", async () => {
    const spend = () => true;
    const byName = vi.fn(async (): Promise<SearchResult> => ({ status: "ok", results: [li("camille-ardent", "Camille Ardent", "Backend")] }));
    const p = await findLinkedinFor({ namesakes: async () => [namesake("camille-ardent-x", null)], byName }, CAMILLE, { spend });
    expect(p?.url).toBe("https://www.linkedin.com/in/camille-ardent");
    expect(byName).toHaveBeenCalledWith("Camille Ardent", expect.objectContaining({ strict: true, company: "paysolde", spend }));
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
