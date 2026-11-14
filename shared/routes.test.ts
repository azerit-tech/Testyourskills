import { describe, expect, it } from "vitest";
import { isReservedSegment, isUpcomingPath, UPCOMING_PAGES } from "./routes";

describe("routes réservées (§18.27)", () => {
  it("les pages à venir et les routes du site, quelle que soit la casse", () => {
    for (const w of [...UPCOMING_PAGES, "c", "api", "og", "privacy", "confidentialite", "auth", "avatar", "assets", "primes", "reglement"]) {
      expect(isReservedSegment(w)).toBe(true);
      expect(isReservedSegment(w.toUpperCase())).toBe(true);
    }
  });

  it("un vrai pseudo qui commence par un mot réservé passe", () => {
    for (const login of ["usain", "badger", "primesco", "vsc", "octocat", "apiary", "cat"]) expect(isReservedSegment(login)).toBe(false);
  });

  it("une page à venir et ses sous-chemins ramènent à l'accueil, pas les routes existantes", () => {
    for (const p of ["/vs/a/b", "/BADGE/octocat", "/u", "/u/octocat"]) expect(isUpcomingPath(p)).toBe(true);
    // Les primes et le règlement ont leurs pages : la saison décide de les montrer (server/src/primes.ts).
    for (const p of ["/", "/usain", "/badger", "/c/abc", "/privacy", "/api/top", "/octocat", "/primes", "/primes/x", "/reglement"]) expect(isUpcomingPath(p)).toBe(false);
  });
});
