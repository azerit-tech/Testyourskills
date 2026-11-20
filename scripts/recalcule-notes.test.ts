// Le recalcul des notes (SPEC §18.106) : une note ne se refait que si tout ce qu'elle lit est gardé.
import { describe, expect, it } from "vitest";
import type { CardData } from "../shared/types";
import { scoreGithub } from "../server/src/scoring/github";
import { JACQUES_AI, jacquesFacts } from "../server/src/scoring/__fixtures__/founders";
import { jitterCard, jitterOf } from "../shared/jitter";
import { JITTER_BOUNDS } from "../server/src/pipeline";
import { summary, verdictOf, type RawRow } from "./recalcule-notes";

const opts = { lang: "fr" as const, judgedInSeconds: 6 };
/** La fiche telle que le pipeline la rangerait aujourd'hui, aléa de son id compris. */
const now = jitterCard(scoreGithub(jacquesFacts(), JACQUES_AI, opts) as CardData, "gh", JITTER_BOUNDS);
/** La même fiche GitHub, rangée sous 0.5.0 avec une autre note. */
const old: CardData = { ...(now as CardData), id: "gh", createdAt: "2026-11-10T12:00:00Z", scoringVersion: "0.5.0", overall: 77 };
const row = (p: Partial<RawRow> = {}): RawRow => ({
  id: "gh",
  parent_id: null,
  kind: "card",
  source: "github",
  superseded_by: null,
  json: JSON.stringify(old),
  facts_json: JSON.stringify(jacquesFacts()),
  ai_json: JSON.stringify(JACQUES_AI),
  ...p,
});

describe("recalcule-notes", () => {
  it("une fiche GitHub seule se refait à l'identique du pipeline, version et aléa de la fiche compris", () => {
    const v = verdictOf(row());
    expect(v.kind).toBe("recomputed");
    if (v.kind !== "recomputed") return;
    expect([v.before, v.after]).toEqual([77, now.overall]);
    expect(v.data.grid).toEqual(now.grid);
    expect(v.data.scoringVersion).toBe(now.scoringVersion);
    expect(v.data.id).toBe("gh");
  });

  it("une fiche LinkedIn, un dossier : la note refaite depuis les critères rangés (0.7.0), les critères inchangés", () => {
    const li = verdictOf(row({ source: "linkedin", facts_json: JSON.stringify({ linkedinUrl: "x" }), ai_json: null }));
    expect(li).toMatchObject({ kind: "recomputed", before: 77 });
    if (li.kind === "recomputed") {
      expect(li.data.grid!.criteria.map((c) => c.score)).toEqual(old.grid!.criteria.map((c) => c.score));
      expect(li.data.overall).toBe(li.data.grid!.overall);
      expect(li.data.scoringVersion).toBe(now.scoringVersion);
    }
    // Une fiche GitHub dont la lecture du code n'a pas été gardée : la note se refait depuis ses critères.
    expect(verdictOf(row({ ai_json: null }))).toMatchObject({ kind: "recomputed" });
    // Sans niveau rangé, pas de plancher à lire : à relire.
    const bare = { ...old, grid: { ...old.grid!, seniority: undefined } };
    expect(verdictOf(row({ source: "linkedin", json: JSON.stringify(bare) }))).toMatchObject({ kind: "reread" });
  });

  it("un dossier : sa note, son niveau et ceux de ses deux pièces, refaits depuis sa grille ; l'aléa de la fiche", () => {
    // Un dossier de production tel qu'il a été rangé sous 0.6.0 (critères 8, 5, 3, 7, 3, 6, junior) : 50.
    const crit = (code: string, score: number | null, state = "scored") => ({ code, score, state, source: "linkedin", reached: { fr: "x", en: "x" }, flags: [], counted: true });
    const grid = {
      criteria: [crit("EDU", 8), crit("XP", 3), crit("EMP", 5), crit("STK", 3), crit("CODE", 7), crit("ACT", 3), crit("OWN", 6, "declared"), crit("OSS", 0)],
      overall: 50,
      weights: {},
      seniority: { code: "junior", months: 12, source: "linkedin" },
    };
    const piece = { ...(old as CardData), overall: 50, tier: "bronze", scoringVersion: "0.6.0" };
    const dossier = { id: "dossier-1", createdAt: old.createdAt, cv: piece, github: piece, grid };
    const v = verdictOf(row({ id: "dossier-1", kind: "comparison", source: "linkedin", json: JSON.stringify(dossier) }));
    expect(v).toMatchObject({ kind: "recomputed", before: 50 });
    if (v.kind !== "recomputed") return;
    // Moyenne 53,2 → courbe 64, puis l'aléa de la fiche. La table du junior qui lit les stages attend une relecture.
    const after = 64 + jitterOf("dossier-1");
    expect(v.after).toBe(after);
    const d = v.data as unknown as { cv: CardData; github: CardData; grid: { overall: number } };
    expect([d.grid.overall, d.cv.overall, d.github.overall]).toEqual([after, after, after]);
    expect(d.cv.tier).toBe("silver");
    expect(d.cv.scoringVersion).toBe(now.scoringVersion);
    // Refait une deuxième fois : déjà à jour.
    expect(verdictOf(row({ id: "dossier-1", kind: "comparison", source: "linkedin", json: JSON.stringify(v.data) }))).toMatchObject({ kind: "current" });
  });

  it("l'historique et les pièces ne bougent pas ; une fiche déjà à jour non plus", () => {
    expect(verdictOf(row({ superseded_by: "d" }))).toMatchObject({ kind: "kept" });
    expect(verdictOf(row({ parent_id: "d" }))).toMatchObject({ kind: "kept" });
    expect(verdictOf(row({ json: JSON.stringify({ ...old, scoringVersion: now.scoringVersion }) }))).toMatchObject({ kind: "current" });
  });

  it("le résumé compte les notes qui bougent, les étoiles et les égalités", () => {
    const bare = JSON.stringify({ ...old, grid: { ...old.grid!, seniority: undefined } });
    const s = summary([verdictOf(row()), verdictOf(row({ id: "li", source: "linkedin", json: bare })), verdictOf(row({ id: "x", superseded_by: "d" }))]);
    expect(s).toMatchObject({ live: 2, recomputed: 1, reread: 1, kept: 1, tiesBefore: 2 });
    expect(s.moved).toBe(now.overall === 77 ? 0 : 1);
    expect(s.tiesAfter).toBe(now.overall === 77 ? 2 : 0);
  });
});
