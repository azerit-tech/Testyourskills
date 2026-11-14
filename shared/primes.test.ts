import { describe, expect, it } from "vitest";
import { cleanProof, compareEntries, primeView, wouldRank, type Ranked } from "./primes";
import type { Prime } from "./season";

const e = (login: string, overall: number, reliability = 80, joinedAt = 0): Ranked => ({ login, overall, reliability, joinedAt });

describe("le classement d'une prime", () => {
  it("la note globale seule, sans bonus ; puis la fiabilité, puis l'inscription la plus ancienne", () => {
    const sorted = [e("c", 70, 90, 3), e("a", 72, 10, 9), e("b", 70, 90, 1), e("d", 70, 95, 5)].sort(compareEntries).map((x) => x.login);
    expect(sorted).toEqual(["a", "d", "b", "c"]);
  });

  it("le rang qu'aurait une fiche : derrière les égales de fiabilité au moins égale, total compris", () => {
    const list = [e("a", 80), e("b", 70, 80), e("c", 70, 60), e("d", 50)];
    expect(wouldRank(list, 70, 70)).toEqual({ rank: 3, total: 5 });
    expect(wouldRank(list, 90, 0)).toEqual({ rank: 1, total: 5 });
    expect(wouldRank([], 40, 40)).toEqual({ rank: 1, total: 1 });
  });
});

describe("primeView", () => {
  const season = { number: 1, start: "2026-11-19", end: "2026-12-31" };
  const p: Prime = { id: "x", company: "Entreprise Démo", contract: "cdi", positions: ["BE"], languages: [], interviews: 1, remote: true, to: "2026-12-01", pitch: { fr: "a", en: "b" } };
  it("les dates de la saison par défaut, les jours qui restent, 0 le dernier jour", () => {
    expect(primeView(season, p, 4, Date.parse("2026-11-19T10:00:00Z"))).toMatchObject({ from: "2026-11-19", to: "2026-12-01", phase: "open", daysLeft: 12, entrants: 4 });
    expect(primeView(season, p, 0, Date.parse("2026-12-01T22:00:00Z")).daysLeft).toBe(0);
    expect(primeView(season, p, 0, Date.parse("2026-12-02T00:00:00Z"))).toMatchObject({ phase: "closed", daysLeft: null });
  });
});

describe("cleanProof", () => {
  it("garde une adresse web, refuse le reste", () => {
    expect(cleanProof("huggingface.co/demo")).toBe("https://huggingface.co/demo");
    expect(cleanProof(" https://exemple.dev/projet ")).toBe("https://exemple.dev/projet");
    for (const bad of ["", "javascript:alert(1)", "pas une adresse", "localhost", 3, `https://a.dev/${"x".repeat(300)}`]) expect(cleanProof(bad)).toBeNull();
  });
});
