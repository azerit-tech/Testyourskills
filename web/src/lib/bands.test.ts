// Les bandes côté front (§18.38) : les anciennes adresses, la ligne du rang, les
// pastilles proposées, le lien partagé, et des textes sans tiret long ni point
// médian ni rang d'école.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BandStanding, MyBands } from "../../../shared/bands";
import { DICTS } from "../i18n";
import { rankingShareUrl, starLine, suggestedPills } from "./bands";
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

describe("les anciennes adresses des bandes (§18.101)", () => {
  it("/bandes et tout ce qui est dessous : le classement de l'accueil, jamais un pseudo", () => {
    for (const p of ["/bandes", "/bandes/", "/Bandes", "/bandes/ecole/centralesupelec", "/bandes/boite/back-market/", "/bandes/ville/paris", "/bandes/x"]) {
      expect(routeOf(p), p).toEqual({ kind: "ranking" });
    }
    expect(routeOf("/bandesx").kind).toBe("direct");
  });
});

/** Les espaces insécables de la typographie (n(), frTypo) comparées comme des espaces. */
const plain = (s: string) => s.replace(/\s/g, " ");

describe("la ligne du rang", () => {
  it("en français : rang, écart, égalité, tête, hors classement", () => {
    expect(plain(fr.bands.rank(b({})))).toBe(plain("3e des écoles, à 6 étoiles de la 2e."));
    expect(plain(fr.bands.rank(b({ gap: 1 })))).toBe(plain("3e des écoles, à 1 étoile de la 2e."));
    expect(plain(fr.bands.rank(b({ rank: 2, gap: 0, ahead: { id: "x", label: "X", rank: 1 } })))).toBe(plain("2e des écoles, à égalité avec la tête."));
    expect(plain(fr.bands.rank(b({ type: "boite", rank: 1, gap: null, ahead: null })))).toBe(plain("N° 1 des boîtes."));
    expect(plain(fr.bands.rank(b({ rank: null, missing: 1, gap: null, ahead: null })))).toBe(plain("Pas encore au classement : il lui faut 1 fiche."));
  });

  it("en anglais", () => {
    expect(plain(en.bands.rank(b({})))).toBe(plain("#3 among schools, 6 stars behind #2."));
    expect(plain(en.bands.rank(b({ rank: null, missing: 1, gap: null, ahead: null })))).toBe(plain("Not ranked yet: 1 sheet needed."));
  });

  it("les étoiles pleines seulement", () => {
    expect(starLine(4)).toBe("★★★★☆☆");
    expect(starLine(9)).toBe("★★★★★★");
    expect(starLine(0)).toBe("☆☆☆☆☆☆");
  });
});

describe("le lien partagé d'une bande", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("mène au classement de l'accueil, en anglais si on partage depuis l'anglais", () => {
    vi.stubGlobal("window", { location: { origin: "https://skills.test" } });
    expect(rankingShareUrl("fr")).toBe("https://skills.test/#classement");
    expect(rankingShareUrl("en")).toBe("https://skills.test/?lang=en#classement");
  });
});

describe("les pastilles proposées", () => {
  it("celle lue sur la fiche, rien sinon", () => {
    const mb: MyBands = {
      stars: 4,
      ecole: null,
      boite: null,
      suggest: { ecole: { type: "ecole", id: "insa-lyon", label: "INSA Lyon" }, boite: null },
    };
    expect(suggestedPills("ecole", mb).map((r) => r.id)).toEqual(["insa-lyon"]);
    expect(suggestedPills("boite", mb)).toEqual([]);
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
        dict.bands.others(3),
        dict.bands.home.rowLabel(1, "Epitech", 12, 3),
      ];
      for (const s of texts) {
        expect(s, s).not.toMatch(/[—·]/);
        expect(s, s).not.toMatch(/rang [SABC]\b|tier [SABC]\b/i);
      }
    }
  });

  it("sous une bande ouverte : les fiches qu'elle ne nomme pas", () => {
    expect(fr.bands.others(1)).toBe("1 autre fiche");
    expect(fr.bands.others(12)).toBe("12 autres fiches");
    expect(en.bands.others(12)).toBe("12 more sheets");
  });

  it("la confidentialité dit ce qui est gardé, où le nom se montre et comment sortir", () => {
    const sec = fr.pages.privacy.sections("x@y.z").find((s) => s.h === "Les bandes");
    const text = sec?.blocks.flat().join(" ") ?? "";
    expect(text).toMatch(/Sortir/);
    expect(text).toMatch(/classement de l'accueil/);
    expect(text).not.toMatch(/page de la bande|page d'une bande/);
    expect(en.pages.privacy.sections("x@y.z").some((s) => s.h === "Crews")).toBe(true);
  });
});
