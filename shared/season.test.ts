import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSeason, primesOpen, seasonPhase } from "./season";

const FILE = JSON.parse(readFileSync(resolve(import.meta.dirname, "../data/season.json"), "utf8"));
const at = (iso: string) => Date.parse(iso);

describe("data/season.json", () => {
  it("la saison 1 du 19 novembre au 31 décembre 2026, aucune prime", () => {
    expect(parseSeason(FILE)).toEqual({ number: 1, start: "2026-11-19", end: "2026-12-31", primes: [] });
  });

  it("aucune prime ouverte, à aucun moment", () => {
    const s = parseSeason(FILE);
    for (const t of ["2026-11-14T12:00:00Z", "2026-11-19T00:00:00Z", "2026-12-31T23:59:59Z", "2027-01-05T00:00:00Z"]) expect(primesOpen(s, at(t))).toBe(false);
  });
});

describe("parseSeason", () => {
  it("refuse un fichier mal formé", () => {
    for (const bad of [null, {}, { number: 1, start: "2026-11-19", end: "2026-11-01", primes: [] }, { number: 1, start: "19/11/2026", end: "2026-12-31", primes: [] }, { number: 0, start: "2026-11-19", end: "2026-12-31", primes: [] }, { number: 1, start: "2026-11-19", end: "2026-12-31" }, { number: 1, start: "2026-11-19", end: "2026-12-31", primes: [{ id: "" }] }]) {
      expect(parseSeason(bad)).toBeNull();
    }
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
    const s = parseSeason({ number: 1, start: "2026-11-19", end: "2026-12-31", primes: [{ id: "a" }, { id: "b", from: "2027-01-10", to: "2027-01-12" }] });
    expect(primesOpen(s, at("2026-11-18T12:00:00Z"))).toBe(false);
    expect(primesOpen(s, at("2026-11-20T12:00:00Z"))).toBe(true);
    expect(primesOpen(s, at("2027-01-02T12:00:00Z"))).toBe(false);
    expect(primesOpen(s, at("2027-01-12T22:00:00Z"))).toBe(true);
    expect(primesOpen(null, at("2026-11-20T12:00:00Z"))).toBe(false);
  });
});
