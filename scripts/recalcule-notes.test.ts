// Le recalcul des notes (SPEC §18.106) : une note ne se refait que si tout ce qu'elle lit est gardé.
import { describe, expect, it } from "vitest";
import type { CardData } from "../shared/types";
import { scoreGithub } from "../server/src/scoring/github";
import { JACQUES_AI, jacquesFacts } from "../server/src/scoring/__fixtures__/founders";
import { jitterCard } from "../shared/jitter";
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

  it("une fiche LinkedIn, un dossier : à relire, jamais réécrits sans leur lecture", () => {
    expect(verdictOf(row({ source: "linkedin", facts_json: JSON.stringify({ linkedinUrl: "x" }), ai_json: null }))).toMatchObject({ kind: "reread", before: 77 });
    expect(verdictOf(row({ kind: "comparison", source: "linkedin" }))).toMatchObject({ kind: "reread" });
    // Une fiche GitHub dont la lecture du code n'a pas été gardée : la refaire sans elle la changerait.
    expect(verdictOf(row({ ai_json: null }))).toMatchObject({ kind: "reread", why: "lecture du code non gardée" });
  });

  it("l'historique et les pièces ne bougent pas ; une fiche déjà à jour non plus", () => {
    expect(verdictOf(row({ superseded_by: "d" }))).toMatchObject({ kind: "kept" });
    expect(verdictOf(row({ parent_id: "d" }))).toMatchObject({ kind: "kept" });
    expect(verdictOf(row({ json: JSON.stringify({ ...old, scoringVersion: now.scoringVersion }) }))).toMatchObject({ kind: "current" });
  });

  it("le résumé compte les notes qui bougent, les étoiles et les égalités", () => {
    const s = summary([verdictOf(row()), verdictOf(row({ id: "li", source: "linkedin" })), verdictOf(row({ id: "x", superseded_by: "d" }))]);
    expect(s).toMatchObject({ live: 2, recomputed: 1, reread: 1, kept: 1, tiesBefore: 2 });
    expect(s.moved).toBe(now.overall === 77 ? 0 : 1);
    expect(s.tiesAfter).toBe(now.overall === 77 ? 2 : 0);
  });
});
