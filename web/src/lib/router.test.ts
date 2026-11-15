import { describe, expect, it } from "vitest";
import { isSitePage } from "../../../shared/routes";
import { routeOf, withQuery } from "./router";

describe("withQuery", () => {
  it("recopie la requête avant l'ancre, jamais après (« /?mock=1#semaine »)", () => {
    expect(withQuery("/#semaine", "?mock=1")).toBe("/?mock=1#semaine");
    expect(withQuery("/c/abc", "?mock=1&lang=fr")).toBe("/c/abc?mock=1&lang=fr");
    expect(withQuery("/?x=1#semaine", "?mock=1")).toBe("/?x=1#semaine");
    expect(withQuery("/#semaine", "")).toBe("/#semaine");
  });
});

describe("routeOf (§18.27)", () => {
  it("une page à venir n'est jamais un pseudo, quelle que soit la casse", () => {
    for (const p of ["/vs", "/badge", "/u", "/u/octocat", "/vs/a/b"]) {
      expect(routeOf(p), p).toEqual({ kind: "upcoming" });
    }
  });

  it("les primes et le règlement ont leurs routes, jamais un pseudo (§18.4)", () => {
    for (const p of ["/primes", "/PRIMES", "/primes/", "/primes/Mauvais_Id"]) expect(routeOf(p), p).toEqual({ kind: "primes" });
    expect(routeOf("/primes/demo-backend-stage")).toEqual({ kind: "prime", id: "demo-backend-stage" });
    for (const p of ["/reglement", "/Reglement/"]) expect(routeOf(p), p).toEqual({ kind: "rules" });
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

  it("le serveur répond 200 aux pages que le front sait afficher, 404 aux autres (shared/routes.ts)", () => {
    const paths = [
      "/", "/c/abc_12", "/c/abc/def", "/privacy", "/confidentialite/", "/bandes", "/Bandes/", "/bandes/ecole/epitech", "/bandes/boite/x-y",
      "/bandes/zzz/zzz", "/bandes/ecole/Mauvais_Id", "/primes", "/primes/demo", "/primes/a/b", "/reglement", "/vs/a/b", "/u",
      "/usain", "/badger/", "/%40octocat", "/kevin-dev42", "/api", "/og", "/assets", "/__devices", "/zzz/zzz", "/un.point", "/-tiret", "/%E0%A4%A",
    ];
    for (const p of paths) expect(isSitePage(p), p).toBe(routeOf(p).kind !== "notFound");
  });
});
