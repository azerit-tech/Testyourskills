import { describe, expect, it } from "vitest";
import { routeOf } from "./router";

describe("routeOf (§18.27)", () => {
  it("une page à venir n'est jamais un pseudo, quelle que soit la casse", () => {
    for (const p of ["/primes", "/PRIMES", "/reglement/", "/vs", "/badge", "/u", "/u/octocat", "/vs/a/b"]) {
      expect(routeOf(p), p).toEqual({ kind: "upcoming" });
    }
  });

  it("les routes du site ne lancent pas de fiche", () => {
    for (const p of ["/api", "/og", "/c", "/auth", "/avatar", "/assets", "/Assets"]) expect(routeOf(p).kind, p).toBe("notFound");
    expect(routeOf("/privacy")).toEqual({ kind: "privacy" });
    expect(routeOf("/c/abc_12")).toEqual({ kind: "card", id: "abc_12" });
    expect(routeOf("/")).toEqual({ kind: "home" });
  });

  it("un vrai pseudo qui commence par un mot réservé passe", () => {
    expect(routeOf("/usain")).toEqual({ kind: "direct", login: "usain" });
    expect(routeOf("/badger/")).toEqual({ kind: "direct", login: "badger" });
    expect(routeOf("/%40octocat")).toEqual({ kind: "direct", login: "octocat" });
  });
});
