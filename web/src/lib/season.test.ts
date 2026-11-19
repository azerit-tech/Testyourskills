import { describe, expect, it } from "vitest";
import { DICTS } from "../i18n";
import { parseConfig } from "./api";
import { dayLabel, homeHook, seasonLine } from "./season";

const S1 = { number: 1, start: "2026-11-19", end: "2026-12-31" };

describe("la ligne de l'accueil", () => {
  it("sans prime ouverte (ou config inconnue), aucune promesse d'entretien", () => {
    for (const lang of ["fr", "en"] as const) {
      const h = DICTS[lang].home;
      for (const cfg of [null, { primesOpen: false }]) expect(homeHook(h, cfg)).not.toMatch(/entretien|interview/i);
    }
    // La promesse sous le titre : ce qu'on obtient, en combien de temps, sans compte (§18.48).
    expect(homeHook(DICTS.fr.home, null)).toBe("De une à six étoiles, en une minute. Sans compte.");
    expect(homeHook(DICTS.en.home, null)).toBe("One to six stars, in one minute. No account.");
  });

  it("une prime ouverte : la même promesse, l'entretien reste au bandeau de saison", () => {
    expect(homeHook(DICTS.fr.home, { primesOpen: true })).toBe("De une à six étoiles, en une minute. Sans compte.");
    expect(homeHook(DICTS.en.home, { primesOpen: true })).toBe("One to six stars, in one minute. No account.");
  });

  it("la config du serveur : primesOpen et les dates, tout champ douteux vaut « non »", () => {
    expect(parseConfig({ linkedin: true, primesOpen: true, season: S1 })).toEqual({ linkedin: true, claim: false, linkedinEntry: false, linkedinSearch: false, linkedinLogin: false, githubLogin: false, primesOpen: true, primesListed: false, rulesPublished: false, season: S1, interviews: 0 });
    expect(parseConfig({ interviews: 6 })).toMatchObject({ interviews: 6 });
    expect(parseConfig({ interviews: -1 })).toMatchObject({ interviews: 0 });
    expect(parseConfig({ primesOpen: "yes", season: { number: 1, start: "x", end: "y" } })).toMatchObject({ primesOpen: false, season: null });
    expect(parseConfig(null)).toMatchObject({ primesOpen: false, season: null });
  });
});

describe("le bandeau de saison", () => {
  const fr = DICTS.fr.home.season;
  const en = DICTS.en.home.season;
  it("lit ses dates : avant, pendant (ce qu'on gagne, puis jusqu'à quand), après", () => {
    expect(seasonLine(fr, S1, "fr", Date.parse("2026-11-14T12:00:00Z"))).toEqual({ text: "Saison 1\u00a0: dès le 19 novembre", tail: null });
    expect(seasonLine(fr, S1, "fr", Date.parse("2026-11-20T12:00:00Z"), 6)).toEqual({ text: "Saison 1\u00a0: 6 entretiens à gagner", tail: "jusqu'au 31 décembre" });
    expect(seasonLine(fr, S1, "fr", Date.parse("2026-11-20T12:00:00Z"), 1)?.text).toBe("Saison 1\u00a0: 1 entretien à gagner");
    expect(seasonLine(fr, S1, "fr", Date.parse("2027-01-01T12:00:00Z"))).toEqual({ text: "Saison 1 terminée", tail: null });
    // En anglais américain : le mois avant le jour.
    expect(seasonLine(en, S1, "en", Date.parse("2026-11-14T12:00:00Z"))?.text).toBe("Season 1 starts November 19");
    expect(seasonLine(en, S1, "en", Date.parse("2026-12-31T20:00:00Z"), 3)).toEqual({ text: "Season 1: 3 interviews to win", tail: "until December 31" });
  });

  it("sans réponse du serveur : les dates du fichier pris au build, des entretiens sans nombre", () => {
    expect(seasonLine(fr, null, "fr", Date.parse("2026-11-20T12:00:00Z"))?.text).toBe("Saison 1\u00a0: des entretiens à gagner");
  });

  it("le premier du mois en français ; en anglais, le mois d'abord", () => {
    expect(dayLabel("2026-12-01", "fr")).toBe("1er décembre");
    expect(dayLabel("2026-12-01", "en")).toBe("December 1");
  });
});
