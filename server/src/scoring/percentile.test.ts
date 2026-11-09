import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CardData, StatusInstance } from "../../../shared/types";
import type { GithubFacts } from "../github/facts";
import gaearonJson from "./__fixtures__/gaearon.facts.json";
import { SCORING } from "./config";
import { scoreGithub as scoreGithubBare } from "./github";
import { loadPercentileTable, PERCENTILES_PATH, referenceTable, scoreGithub } from "./index";
import {
  centilesOf,
  MIN_GROUP,
  parsePercentileTable,
  percentIn,
  rankFor,
  rarityFor,
  withReference,
  type CentileGroup,
  type PercentileTable,
} from "./percentile";

const V = SCORING.version;
const gaearon = gaearonJson as unknown as GithubFacts;

/** Groupe de n notes : la note i (0..n−1) vaut `f(i)`. */
function group(n: number, f: (i: number) => number = (i) => 1 + Math.floor((i * 99) / n)): CentileGroup {
  const values = Array.from({ length: n }, (_, i) => f(i));
  return { n, centiles: centilesOf(values) };
}

function table(over: Partial<PercentileTable> = {}): PercentileTable {
  return {
    scoringVersion: V,
    source: "github",
    generatedAt: "2026-11-09",
    profiles: 1000,
    tec: { real: 300, imputedDelta: 5 },
    minGroup: MIN_GROUP,
    overall: { all: group(1000), language: {}, position: {} },
    statuses: {},
    ...over,
  };
}

type Card = Pick<CardData, "overall" | "scoringVersion" | "source" | "mainLanguage" | "position" | "statuses">;
const card = (over: Partial<Card> = {}): Card => ({
  overall: 70,
  scoringVersion: V,
  source: "github",
  mainLanguage: "python",
  position: "BE",
  statuses: [],
  ...over,
});

const status = (id: string): StatusInstance => ({
  id,
  tone: "negative",
  label: { fr: id, en: id },
  rule: { fr: "r", en: "r" },
});

describe("centilesOf et percentIn : le rang est la part strictement en dessous, arrondie", () => {
  it("retrouve exactement round(100 · B / n), borné de 1 à 99, sur des listes au hasard", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (const n of [1, 2, 3, 7, 99, 100, 101, 137, 1000, 1234]) {
      const values = Array.from({ length: n }, () => 1 + Math.floor(rnd() * 99));
      // Beaucoup d'égalités, comme les vraies notes entières.
      const g = { n, centiles: centilesOf(values) };
      expect(g.centiles).toHaveLength(99);
      for (let s = 1; s <= 99; s++) {
        const below = values.filter((v) => v < s).length;
        const expected = Math.min(99, Math.max(1, Math.round((100 * below) / n)));
        expect(percentIn(g, s)).toBe(expected);
      }
    }
  });

  it("centiles croissants, entre la plus petite et la plus grande note", () => {
    const c = centilesOf([50, 10, 90, 30, 70]);
    expect([...c].sort((a, b) => a - b)).toEqual(c);
    expect(Math.min(...c)).toBe(10);
    expect(Math.max(...c)).toBe(90);
  });

  it("bornes : personne en dessous → 1, tout le monde en dessous → 99", () => {
    const g = group(200, () => 60);
    expect(percentIn(g, 60)).toBe(1); // 0 % strictement en dessous, borné à 1
    expect(percentIn(g, 1)).toBe(1);
    expect(percentIn(g, 61)).toBe(99); // 100 % en dessous, borné à 99
    expect(percentIn(g, 99)).toBe(99);
  });

  it("refuse une liste vide", () => {
    expect(() => centilesOf([])).toThrow();
  });
});

describe("rankFor", () => {
  it("table absente : null", () => {
    expect(rankFor(card(), null)).toBeNull();
    expect(rankFor(card(), undefined)).toBeNull();
  });

  it("version du barème différente : null, même avec des groupes pleins", () => {
    const t = table({ scoringVersion: "0.0.1", overall: { all: group(1000), language: { python: group(500) }, position: { BE: group(500) } } });
    expect(rankFor(card(), t)).toBeNull();
  });

  it("autre source (carte CV) : null", () => {
    expect(rankFor(card({ source: "cv" }), table())).toBeNull();
  });

  it("groupes trop petits : le rang global", () => {
    const t = table({ overall: { all: group(1000), language: { python: group(99) }, position: { BE: group(MIN_GROUP - 1) } } });
    expect(rankFor(card(), t)).toEqual({ percent: percentIn(t.overall.all!, 70), group: { kind: "all" } });
  });

  it("moins de 100 profils en tout : null", () => {
    const t = table({ profiles: 50, overall: { all: group(50), language: {}, position: {} } });
    expect(rankFor(card(), t)).toBeNull();
  });

  it("le meilleur des deux groupes assez grands", () => {
    // Python : notes hautes (rang bas pour 70) ; BE : notes basses (rang haut pour 70).
    const python = group(200, (i) => 60 + (i % 40));
    const be = group(300, (i) => 1 + (i % 70));
    const t = table({ overall: { all: group(1000), language: { python }, position: { BE: be } } });
    const r = rankFor(card(), t)!;
    expect(r.group).toEqual({ kind: "position", key: "BE" });
    expect(r.percent).toBe(percentIn(be, 70));
    expect(r.percent).toBeGreaterThan(percentIn(python, 70));

    // Et dans l'autre sens.
    const t2 = table({ overall: { all: group(1000), language: { python: be }, position: { BE: python } } });
    expect(rankFor(card(), t2)!.group).toEqual({ kind: "language", key: "python" });
  });

  it("à égalité de rang entre les deux groupes : le langage", () => {
    const g = group(150);
    const t = table({ overall: { all: group(1000), language: { python: g }, position: { BE: { ...g } } } });
    expect(rankFor(card(), t)).toEqual({ percent: percentIn(g, 70), group: { kind: "language", key: "python" } });
  });

  it("un seul groupe assez grand : celui-là, même si le global ferait mieux", () => {
    const low = group(120, (i) => 70 + (i % 29)); // 70 est en bas de ce groupe
    const t = table({ overall: { all: group(1000), language: {}, position: { BE: low } } });
    expect(rankFor(card(), t)).toEqual({ percent: 1, group: { kind: "position", key: "BE" } });
  });

  it("sans langage principal : poste ou global", () => {
    const t = table({ overall: { all: group(1000), language: { python: group(500) }, position: {} } });
    expect(rankFor(card({ mainLanguage: undefined }), t)!.group).toEqual({ kind: "all" });
  });
});

describe("rarityFor", () => {
  const t = table({ statuses: { gh_rare: 1.8, gh_common: 42, gh_never: 0 } });

  it("rend la part en %, ou null", () => {
    expect(rarityFor("gh_rare", t)).toBe(1.8);
    expect(rarityFor("gh_common", t)).toBe(42);
    expect(rarityFor("gh_never", t)).toBe(0);
    expect(rarityFor("gh_inconnu", t)).toBeNull();
    expect(rarityFor("gh_rare", null)).toBeNull();
  });

  it("table de moins de 100 profils : null", () => {
    expect(rarityFor("gh_rare", { ...t, profiles: 99 })).toBeNull();
  });
});

describe("withReference", () => {
  const t = table({
    overall: { all: group(1000), language: { python: group(400) }, position: {} },
    statuses: { gh_rare: 1.8, gh_common: 42, gh_never: 0, gh_edge: 5 },
  });

  it("ajoute le rang et la rareté des seuls statuts rares (sous 5 %)", () => {
    const out = withReference(card({ statuses: [status("gh_rare"), status("gh_common"), status("gh_edge")] }), t);
    expect(out.rank).toEqual({ percent: percentIn(t.overall.language.python!, 70), group: { kind: "language", key: "python" } });
    expect(out.statuses.map((s) => s.rarity)).toEqual([1.8, undefined, undefined]);
    expect("rarity" in out.statuses[1]!).toBe(false);
  });

  it("un statut jamais vu dans la référence s'affiche à 0,1 %, pas à 0 %", () => {
    expect(withReference(card({ statuses: [status("gh_never")] }), t).statuses[0]!.rarity).toBe(0.1);
  });

  it("sans table ou sur un autre barème : la carte inchangée, sans champ ajouté", () => {
    const c = card({ statuses: [status("gh_rare")] });
    expect(withReference(c, null)).toBe(c);
    const other = withReference(c, { ...t, scoringVersion: "9.9.9" });
    expect(other).toBe(c);
    expect("rank" in other).toBe(false);
  });
});

describe("chargement de data/percentiles.json", () => {
  it("sans table, la carte GitHub est exactement celle du barème seul", () => {
    const opts = { lang: "fr" as const, judgedInSeconds: 3 };
    const bare = scoreGithubBare(gaearon, null, opts);
    const full = scoreGithub(gaearon, null, opts);
    if (referenceTable()) {
      // data/percentiles.json existe : seuls le rang et les raretés s'ajoutent.
      expect({ ...full, rank: undefined, statuses: full.statuses.map(({ rarity: _r, ...s }) => s) }).toEqual({ ...bare, rank: undefined });
    } else {
      expect(loadPercentileTable(PERCENTILES_PATH)).toBeNull();
      expect(full).toEqual(bare);
      expect("rank" in full).toBe(false);
    }
  });

  it("lit une table valable, ignore un fichier absent, cassé ou d'une autre forme", () => {
    const dir = mkdtempSync(join(tmpdir(), "tys-pct-"));
    try {
      const good = join(dir, "good.json");
      writeFileSync(good, JSON.stringify(table()));
      expect(loadPercentileTable(good)?.scoringVersion).toBe(V);
      const broken = join(dir, "broken.json");
      writeFileSync(broken, "{ pas du json");
      expect(loadPercentileTable(broken)).toBeNull();
      const odd = join(dir, "odd.json");
      writeFileSync(odd, JSON.stringify({ ...table(), overall: { all: { n: 3, centiles: [1, 2] }, language: {}, position: {} } }));
      expect(loadPercentileTable(odd)).toBeNull();
      expect(loadPercentileTable(join(dir, "absent.json"))).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("parsePercentileTable refuse ce qui n'est pas une table", () => {
    expect(parsePercentileTable(null)).toBeNull();
    expect(parsePercentileTable({ scoringVersion: V })).toBeNull();
    expect(parsePercentileTable(table())).not.toBeNull();
  });
});
