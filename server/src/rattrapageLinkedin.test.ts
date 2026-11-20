// Rattrapage du §18.124 : les fiches GitHub seules du top cherchent leur LinkedIn ; un lien fort
// fait le dossier, qui remplace la fiche. Pipeline factice : le dossier qu'il rendrait.

import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../../shared/fixtures";
import type { CardData, ComparisonData } from "../../shared/types";
import { Store } from "./db";
import type { LinkedinMatch } from "./match/linkedin";
import type { JobInput } from "./pipeline";
import { backfillLinkedin, topGithubOnly } from "./rattrapageLinkedin";

const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
});
const NOW = Date.now();
const ENZO = "https://www.linkedin.com/in/enzo-le-van";

function githubCard(store: Store, id: string, login: string, overall: number) {
  const data = { ...FIXTURES.gold, id, login, overall, createdAt: new Date(NOW - 60_000).toISOString() } as CardData;
  store.insertCards([{ id, createdAt: NOW - 60_000, source: "github", login, kind: "card", data, facts: { login, profile: { login, name: null, followers: 3 } }, deleteToken: "t" }]);
}

describe("rattrapage du LinkedIn des fiches GitHub du top (§18.124)", () => {
  it("une recherche par fiche ; le lien fort fait le dossier qui remplace la fiche ; relancé, plus rien", async () => {
    const store = new Store(":memory:");
    stores.push(store);
    githubCard(store, "ghHennzau1", "hennzau", 76);
    githubCard(store, "ghTommy001", "tmartin", 70);
    const match = vi.fn(async (gh: { login: string }): Promise<LinkedinMatch | null> =>
      gh.login === "hennzau" ? { proposal: { kind: "linkedin", url: ENZO, name: "Enzo Le Van", headline: "Gif-sur-Yvette", sure: false }, strength: "strong", why: ["city"] } : null,
    );
    const started: JobInput[] = [];
    const pipeline = {
      start(input: JobInput) {
        started.push(input);
        const at = new Date().toISOString();
        const github = { ...FIXTURES.gold, id: "pieceGh01", login: input.login, overall: 80, createdAt: at } as CardData;
        const cv = { ...FIXTURES.cv, id: "pieceCv01", createdAt: at, overall: 80 } as CardData;
        const data = { id: "dossier01", createdAt: at, declaredSource: "linkedin", cv, github, grid: { criteria: [], overall: 80 } } as ComparisonData;
        store.insertCards([
          { id: "dossier01", createdAt: Date.now(), source: "linkedin", login: input.login!, kind: "comparison", data, facts: { linkedinUrl: ENZO, linkedinProven: true, linkedinProof: "match" }, deleteToken: "t" },
          { id: "pieceCv01", parentId: "dossier01", createdAt: Date.now(), source: "linkedin", login: null, kind: "card", data: cv, deleteToken: "t" },
          { id: "pieceGh01", parentId: "dossier01", createdAt: Date.now(), source: "github", login: input.login!, kind: "card", data: github, deleteToken: "t" },
        ]);
        return { id: "dossier01" };
      },
      wait: async () => {},
    };
    const hints = async (login: string) => ({ login, name: login === "hennzau" ? "Enzo Le Van" : "Thomas Martin", company: null });

    const cards = topGithubOnly(store, 50, NOW);
    expect(cards.map((c) => c.login)).toEqual(["hennzau", "tmartin"]);
    // À blanc : des recherches, rien d'écrit.
    const dry = await backfillLinkedin({ store, hints, match }, cards);
    expect(dry.map((l) => l.match?.strength ?? null)).toEqual(["strong", null]);
    expect(store.getCard("ghHennzau1")!.supersededBy).toBeNull();

    await backfillLinkedin({ store, hints, match, pipeline }, cards);
    expect(started).toEqual([expect.objectContaining({ login: "hennzau", linkedinUrl: ENZO, linkedinMatch: true })]);
    expect(store.getCard("ghHennzau1")!.supersededBy).toBe("dossier01");
    expect(match).toHaveBeenCalledTimes(4);
    expect(topGithubOnly(store, 50, Date.now()).map((c) => c.login)).toEqual(["tmartin"]);
  });
});
