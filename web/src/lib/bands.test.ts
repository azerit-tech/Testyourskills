// Les bandes côté front (§18.38) : les adresses, la ligne du rang, les pastilles
// proposées, et des textes sans tiret long ni point médian ni rang d'école.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BandStanding, MyBands } from "../../../shared/bands";
import { DICTS } from "../i18n";
import { BAND_HINT_MS, bandHint, filledStars, rememberBandHint, rememberBandJoin, suggestedPills, takeBandJoin } from "./bands";
import { routeOf } from "./router";

const { fr, en } = DICTS;

const b = (o: Partial<BandStanding>): BandStanding => ({
  type: "ecole",
  id: "centralesupelec",
  label: "CentraleSupélec",
  score: 74,
  members: 31,
  rank: 3,
  missing: 0,
  gap: 6,
  ahead: { id: "epitech", label: "Epitech", rank: 2 },
  hasPage: true,
  ...o,
});

describe("adresses des bandes", () => {
  it("/bandes et la page d'une bande, jamais un pseudo ni une page à venir", () => {
    expect(routeOf("/bandes")).toEqual({ kind: "bands" });
    expect(routeOf("/bandes/")).toEqual({ kind: "bands" });
    expect(routeOf("/bandes/ecole/centralesupelec")).toEqual({ kind: "band", type: "ecole", id: "centralesupelec" });
    expect(routeOf("/bandes/boite/back-market/")).toEqual({ kind: "band", type: "boite", id: "back-market" });
    for (const p of ["/bandes/ville/paris", "/bandes/ecole/", "/bandes/ecole/Epi_tech", "/bandes/x"]) expect(routeOf(p).kind, p).toBe("notFound");
  });
});

describe("la ligne du rang", () => {
  it("en français : rang, écart, égalité, tête, formation", () => {
    expect(fr.bands.rank(b({}))).toBe("3e des écoles, à 6 étoiles de la 2e.");
    expect(fr.bands.rank(b({ gap: 1 }))).toBe("3e des écoles, à 1 étoile de la 2e.");
    expect(fr.bands.rank(b({ rank: 2, gap: 0, ahead: { id: "x", label: "X", rank: 1 } }))).toBe("2e des écoles, à égalité avec la tête.");
    expect(fr.bands.rank(b({ type: "boite", rank: 1, gap: null, ahead: null }))).toBe("N°\u00a01 des boîtes.");
    expect(fr.bands.rank(b({ rank: null, missing: 2, gap: null, ahead: null }))).toBe("Bande en formation\u00a0: il manque 2\u00a0complices.");
  });

  it("en anglais", () => {
    expect(en.bands.rank(b({}))).toBe("#3 among schools, 6 stars behind #2.");
    expect(en.bands.rank(b({ rank: null, missing: 1, gap: null, ahead: null }))).toBe("Crew forming: 1 more accomplice needed.");
  });

  it("les étoiles pleines seulement", () => {
    expect(filledStars(4)).toBe("★★★★");
    expect(filledStars(9)).toBe("★★★★★★");
  });
});

describe("les pastilles proposées", () => {
  const mb: MyBands = {
    stars: 4,
    ecole: null,
    boite: null,
    suggest: { ecole: { type: "ecole", id: "insa-lyon", label: "INSA Lyon" }, boite: null },
  };

  it("la bande d'où l'on vient d'abord, puis celle lue sur la fiche, sans doublon", () => {
    expect(suggestedPills("ecole", mb, { type: "ecole", id: "epitech", label: "Epitech" }).map((r) => r.id)).toEqual(["epitech", "insa-lyon"]);
    expect(suggestedPills("ecole", mb, { type: "ecole", id: "insa-lyon", label: "INSA Lyon" }).map((r) => r.id)).toEqual(["insa-lyon"]);
    expect(suggestedPills("boite", mb, { type: "ecole", id: "epitech", label: "Epitech" })).toEqual([]);
  });
});

describe("les textes des bandes", () => {
  const all = (d: unknown): string[] => {
    if (typeof d === "string") return [d];
    if (typeof d === "function") return [];
    if (d && typeof d === "object") return Object.values(d).flatMap(all);
    return [];
  };

  it("ni tiret long, ni point médian, ni accord en « é·e », ni rang d'école", () => {
    for (const dict of [fr, en]) {
      const texts = [
        ...all(dict.bands),
        dict.bands.rank(b({})),
        dict.bands.pick.shareText("★★★★", "Epitech", dict.bands.rank(b({}))),
        dict.bands.page.recruiter("Doctolib"),
        dict.bands.page.make("Epitech"),
      ];
      for (const s of texts) {
        expect(s, s).not.toMatch(/[—·]/);
        expect(s, s).not.toMatch(/rang [SABC]\b|tier [SABC]\b/i);
      }
    }
  });

  it("la confidentialité dit ce qui est gardé et comment sortir", () => {
    const sec = fr.privacy.sections.find((s) => s.h === "Les bandes");
    expect(sec?.p).toMatch(/Sortir/);
    expect(en.privacy.sections.some((s) => s.h === "Crews")).toBe(true);
  });
});

describe("la bande d'où l'on vient", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("passe en tête sous la fiche faite le même jour, plus après", () => {
    const mem = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) });
    const t = 1_800_000_000_000;
    rememberBandHint({ type: "ecole", id: "epitech", label: "Epitech" }, t);
    expect(bandHint(t + 3600_000)).toEqual({ type: "ecole", id: "epitech", label: "Epitech" });
    expect(bandHint(t + BAND_HINT_MS + 1)).toBeNull();
    // Un souvenir d'avant cette règle, sans date : ignoré.
    mem.set("tys_band_hint", JSON.stringify({ type: "ecole", id: "epitech", label: "Epitech" }));
    expect(bandHint(t)).toBeNull();
  });
});

describe("la bande choisie avant de faire la fiche", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("suit jusqu'à la fiche posée, pour cette fiche seulement, et une seule fois", () => {
    const mem = new Map<string, string>();
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
    rememberBandJoin("fiche00001", { type: "boite", id: "ma-boite", label: "Ma Boîte" });
    // une autre fiche ne l'emporte pas
    expect(takeBandJoin("fiche00002")).toBeNull();
    expect(takeBandJoin("fiche00001")).toEqual({ type: "boite", id: "ma-boite", label: "Ma Boîte" });
    // lue une fois : recharger la fiche ne la fait pas rentrer de nouveau
    expect(takeBandJoin("fiche00001")).toBeNull();
    expect(mem.size).toBe(0);
  });

  it("stockage bloqué : la mémoire de l'onglet suffit", () => {
    const blocked = () => {
      throw new Error("bloqué");
    };
    vi.stubGlobal("sessionStorage", { getItem: blocked, setItem: blocked, removeItem: blocked });
    rememberBandJoin("fiche00003", { type: "ecole", id: "epitech", label: "Epitech" });
    expect(takeBandJoin("fiche00003")).toEqual({ type: "ecole", id: "epitech", label: "Epitech" });
    expect(takeBandJoin("fiche00003")).toBeNull();
  });
});

describe("les trois états de la page d'une bande, en mots", () => {
  it("les fiches anonymes tiennent en une ligne, à la suite des fiches nommées ou seules", () => {
    expect(fr.bands.states.anonymous(12, 3)).toBe("Et 12 fiches anonymes.");
    expect(fr.bands.states.anonymous(1, 2)).toBe("Et 1 fiche anonyme.");
    expect(fr.bands.states.anonymous(4, 0)).toMatch(/^4 fiches anonymes\. /);
    expect(en.bands.states.anonymous(12, 3)).toBe("And 12 anonymous sheets.");
  });

  it("les clés neuves : ni tiret long, ni point médian, et plus de « un toucher dessous »", () => {
    for (const d of [fr, en]) {
      const s = d.bands.states;
      const n = d.bands.none;
      const texts = [s.follow, s.joinTitle, s.joinText, s.join, s.moving("X"), s.lost, s.seeCard, s.pickUnder, s.landed("X"), s.slots(1), s.anonymous(2, 0), s.anonymous(2, 1), n.title, n.note, n.league.ecole, n.league.boite];
      for (const x of texts) expect(x, x).not.toMatch(/[—·]/);
      expect(s.follow).not.toMatch(/toucher dessous|tap below/);
    }
  });
});
