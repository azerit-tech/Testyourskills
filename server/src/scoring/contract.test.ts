// Test de contrat hors ligne : faits GitHub réels figés (collectés le 14/10/2026)
// → carte complète et conforme à CardData. Si le barème change, mettre à jour les
// valeurs attendues et la version de data/scoring.json.

import { describe, expect, it } from "vitest";
import type { CodeReadingResult } from "../../../shared/readings";
import { STAT_CODES, tierFor, type CardData } from "../../../shared/types";
import type { GithubFacts } from "../github/facts";
import gaearonJson from "./__fixtures__/gaearon.facts.json";
import qwertyJson from "./__fixtures__/qwerty.facts.json";
import { SCORING } from "./config";
import { scoreGithub } from "./index";

const gaearon = gaearonJson as unknown as GithubFacts;
const qwerty = qwertyJson as unknown as GithubFacts;
const opts = { lang: "en" as const, judgedInSeconds: 5 };
const values = (c: Omit<CardData, "id" | "createdAt">) => Object.fromEntries(c.stats.map((s) => [s.code, s.value]));

function checkShape(card: Omit<CardData, "id" | "createdAt">) {
  expect(card.source).toBe("github");
  expect(card.scoringVersion).toBe(SCORING.version);
  expect(card.stats.map((s) => s.code)).toEqual(STAT_CODES);
  for (const s of card.stats) {
    expect(Number.isInteger(s.value)).toBe(true);
    expect(s.value).toBeGreaterThanOrEqual(1);
    expect(s.value).toBeLessThanOrEqual(99);
    expect(s.facts.length).toBeGreaterThanOrEqual(2);
    expect(s.facts.length).toBeLessThanOrEqual(4);
  }
  expect(card.overall).toBeGreaterThanOrEqual(1);
  expect(card.overall).toBeLessThanOrEqual(99);
  expect(card.tier).toBe(tierFor(card.overall));
  expect(card.statuses.length).toBeGreaterThanOrEqual(1);
  expect(card.statuses.length).toBeLessThanOrEqual(3);
  expect(card.reliability).toBeLessThanOrEqual(95);
  expect(card.reliability % 19).toBe(0);
  expect(card.initials).toMatch(/^[A-Z0-9?]{1,2}$/);
  // Profil et peine (§18.2), depuis le barème 0.2.0.
  expect(card.profile?.id).toBeTruthy();
  expect(card.profile?.label.fr && card.profile.label.en && card.profile.tagline.fr && card.profile.tagline.en).toBeTruthy();
  expect(card.sentence?.label.fr).toMatch(/^(Peine : |Relaxe)/);
  // Sérialisable tel quel.
  expect(JSON.parse(JSON.stringify(card))).toEqual(card);
}

describe("contrat sur faits réels figés", () => {
  it("gaearon sans lecture IA", () => {
    const card = scoreGithub(gaearon, null, opts);
    checkShape(card);
    // XP = critère Expérience × 10 ; la note est celle de la grille (barème 0.4.0).
    expect(values(card)).toEqual({ TEC: 54, SHIP: 80, ARCH: 72, DOC: 47, XP: 80, BUZZ: 37 });
    expect(card.overall).toBe(78);
    expect(card.tier).toBe("gold");
    expect(card.reliability).toBe(76);
    expect(card.position).toBe("FE");
    expect(card.mainLanguage).toBe("javascript"); // pas « lean », son plus gros repo
    expect(card.name).toBe("dan");
    expect(card.login).toBe("gaearon");
    expect(card.avatarUrl).toMatch(/^https:\/\/avatars\.githubusercontent\.com\//);
    expect(card.statuses.map((s) => s.id)).toEqual(["gh_lazy_commits", "gh_finished_tutorial", "gh_accepted_elsewhere"]);
    expect(card.stats.find((s) => s.code === "SHIP")!.facts[0]).toEqual({ fr: "35 semaines actives sur 52", en: "35 active weeks out of 52" });
    expect(card.profile?.id).toBe("kingpin"); // dix PR fusionnées chez les autres ou plus
    expect(card.sentence).toEqual({
      label: { fr: "Peine : 7 README de 300 mots", en: "Sentence: 7 READMEs of 300 words" }, // DOC 47
      bail: { fr: "Caution : un message de commit de cinq mots", en: "Bail: one five-word commit message" },
    });
  });

  it("gaearon avec lecture IA niveau 4 et statut IA", () => {
    const ai: CodeReadingResult = {
      readings: gaearon.activeRepos.slice(0, 3).map((repo) => ({ repo, level: 4, evidence_file: "src/index.ts", evidence_quote: "", observed_traits: [] })),
      ai_status: "ai_clean_arch",
    };
    const card = scoreGithub(gaearon, ai, opts);
    checkShape(card);
    expect(values(card).TEC).toBe(84);
    expect(card.overall).toBe(79);
    expect(card.tier).toBe("gold");
    expect(card.reliability).toBe(95);
    expect(card.statuses.find((s) => s.byAI)?.id).toBe("ai_clean_arch");
  });

  it("compte vide : bronze, « Repo privé, talent privé », fiabilité basse", () => {
    const card = scoreGithub(qwerty, null, opts);
    checkShape(card);
    expect(card.tier).toBe("bronze");
    expect(card.statuses[0].id).toBe("gh_private_talent");
    expect(card.reliability).toBe(19);
    expect(card.profile?.id).toBe("ghost");
    expect(card.sentence?.label.fr).toBe("Peine : 12 semaines de commits"); // SHIP 20
    expect(card.sentence?.bail?.fr).toBe("Caution : un repo public");
  });
});
