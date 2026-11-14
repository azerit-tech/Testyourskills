import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSeason, parseSeasonReason, primePhase, primesOpen, seasonPhase } from "./season";

const FILE = JSON.parse(readFileSync(resolve(import.meta.dirname, "../data/season.json"), "utf8"));
const DEMO = JSON.parse(readFileSync(resolve(import.meta.dirname, "../scripts/demo/season-demo.json"), "utf8"));
const at = (iso: string) => Date.parse(iso);

/** Une prime complète, au nom inventé. */
const prime = (over: Record<string, unknown> = {}) => ({
  id: "demo",
  company: "Entreprise Démo",
  contract: "stage",
  positions: ["BE"],
  interviews: 2,
  pitch: { fr: "Une prime de démonstration.", en: "A demo bounty." },
  ...over,
});
const season = (primes: unknown[], extra: Record<string, unknown> = {}) => ({ number: 1, start: "2026-11-19", end: "2026-12-31", primes, ...extra });

describe("data/season.json", () => {
  it("la saison 1 du 19 novembre au 31 décembre 2026, aucune prime, règlement non publié", () => {
    expect(parseSeason(FILE)).toEqual({ number: 1, start: "2026-11-19", end: "2026-12-31", primes: [], rulesPublished: false });
  });

  it("aucune prime ouverte, à aucun moment", () => {
    const s = parseSeason(FILE);
    for (const t of ["2026-11-14T12:00:00Z", "2026-11-19T00:00:00Z", "2026-12-31T23:59:59Z", "2027-01-05T00:00:00Z"]) expect(primesOpen(s, at(t))).toBe(false);
  });

  it("le fichier de démonstration (scripts/demo) se lit, hors de data/", () => {
    const s = parseSeasonReason(DEMO);
    expect(typeof s).not.toBe("string");
    expect((s as { primes: unknown[] }).primes.length).toBeGreaterThan(0);
  });
});

describe("parseSeason", () => {
  it("refuse un fichier mal formé", () => {
    for (const bad of [null, {}, { number: 1, start: "2026-11-19", end: "2026-11-01", primes: [] }, { number: 1, start: "19/11/2026", end: "2026-12-31", primes: [] }, { number: 0, start: "2026-11-19", end: "2026-12-31", primes: [] }, { number: 1, start: "2026-11-19", end: "2026-12-31" }, season([{ id: "" }]), season([], { rulesPublished: "oui" })]) {
      expect(parseSeason(bad)).toBeNull();
    }
  });

  it("une prime complète se lit, ses champs facultatifs posés par défaut", () => {
    const s = parseSeason(season([prime({ languages: [" Go "], place: "Ville Démo", positions: ["BE", "BE", "FS"] })], { rulesPublished: true }))!;
    expect(s.rulesPublished).toBe(true);
    expect(s.primes[0]).toEqual({
      id: "demo",
      company: "Entreprise Démo",
      contract: "stage",
      positions: ["BE", "FS"],
      languages: ["Go"],
      interviews: 2,
      place: "Ville Démo",
      remote: false,
      pitch: { fr: "Une prime de démonstration.", en: "A demo bounty." },
    });
  });

  it("refuse une prime incomplète ou fausse, et dit pourquoi", () => {
    const bads: [Record<string, unknown>, RegExp][] = [
      [{ id: "Demo" }, /id/],
      [{ company: "" }, /company/],
      [{ contract: "freelance" }, /contract/],
      [{ positions: [] }, /positions/],
      [{ positions: ["CEO"] }, /positions/],
      [{ interviews: 0 }, /interviews/],
      [{ logo: "../x.png" }, /logo/],
      [{ pitch: { fr: "x" } }, /pitch/],
      [{ from: "2026-12-10", to: "2026-12-01" }, /to avant from/],
      [{ remote: "oui" }, /remote/],
    ];
    for (const [over, why] of bads) {
      const r = parseSeasonReason(season([prime(over)]));
      expect(r).toMatch(why);
      expect(parseSeason(season([prime(over)]))).toBeNull();
    }
    expect(parseSeasonReason(season([prime(), prime()]))).toMatch(/deux primes/);
  });
});

describe("seasonPhase", () => {
  const s = { number: 1, start: "2026-11-19", end: "2026-12-31" };
  it("avant, pendant (dernier jour compris), après", () => {
    expect(seasonPhase(s, at("2026-11-18T23:59:59Z"))).toBe("soon");
    expect(seasonPhase(s, at("2026-11-19T00:00:00Z"))).toBe("on");
    expect(seasonPhase(s, at("2026-12-31T23:59:59Z"))).toBe("on");
    expect(seasonPhase(s, at("2027-01-01T00:00:00Z"))).toBe("over");
  });
});

describe("primesOpen", () => {
  it("une prime est ouverte de ses dates, sinon de celles de la saison", () => {
    const s = parseSeason(season([prime({ id: "a" }), prime({ id: "b", from: "2027-01-10", to: "2027-01-12" })]));
    expect(primesOpen(s, at("2026-11-18T12:00:00Z"))).toBe(false);
    expect(primesOpen(s, at("2026-11-20T12:00:00Z"))).toBe(true);
    expect(primesOpen(s, at("2027-01-02T12:00:00Z"))).toBe(false);
    expect(primesOpen(s, at("2027-01-12T22:00:00Z"))).toBe(true);
    expect(primesOpen(null, at("2026-11-20T12:00:00Z"))).toBe(false);
  });

  it("phase d'une prime : pas encore, ouverte, close", () => {
    const s = parseSeason(season([prime({ to: "2026-12-01" })]))!;
    const p = s.primes[0]!;
    expect(primePhase(s, p, at("2026-11-18T23:00:00Z"))).toBe("soon");
    expect(primePhase(s, p, at("2026-12-01T23:59:59Z"))).toBe("open");
    expect(primePhase(s, p, at("2026-12-02T00:00:00Z"))).toBe("closed");
  });
});
