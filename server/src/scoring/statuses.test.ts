import { describe, expect, it } from "vitest";
import { AI_STATUS_IDS } from "../../../shared/readings";
import type { StatCode, StatusInstance, StatusTone } from "../../../shared/types";
import { daysAgo, facts, repo, tree } from "./__fixtures__/make";
import { STATUSES } from "./config";
import { scoreGithub } from "./index";
import { RULES } from "./rules";
import { deriveGithub } from "./derive";
import { composeStatuses, evaluateRules, fillTemplate, instantiate } from "./statuses";

const s = (id: string, tone: StatusTone, byAI = false): StatusInstance => ({
  id,
  tone,
  label: { fr: id, en: id },
  rule: { fr: "r", en: "r" },
  ...(byAI ? { byAI: true } : {}),
});

describe("catalogue data/statuses.json", () => {
  it("ids uniques, règles implémentées, libellés fr/en", () => {
    const ids = STATUSES.statuses.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of STATUSES.statuses) {
      expect(RULES[d.rule], d.id).toBeTypeOf("function");
      expect(d.label.fr && d.label.en && d.ruleText.fr && d.ruleText.en, d.id).toBeTruthy();
      expect(["negative", "positive", "special", "gap"]).toContain(d.tone);
    }
  });

  it("la liste fermée IA (§5.3) est au catalogue, source ai", () => {
    for (const id of AI_STATUS_IDS) expect(STATUSES.statuses.find((d) => d.id === id)?.source, id).toBe("ai");
  });

  it("aucun statut sur la sécurité", () => {
    for (const d of STATUSES.statuses) expect(`${d.id} ${d.label.fr} ${d.label.en}`).not.toMatch(/secret|vuln|cve|security|sécurité|leak|fuite/i);
  });
});

describe("gabarits", () => {
  it("remplit {n}, {m}, {year} et formate les décimales", () => {
    expect(fillTemplate("{n} repos, {m} vivants", { n: 12, m: 2 }, "fr")).toBe("12 repos, 2 vivants");
    expect(fillTemplate("{n} mots creux", { n: 3.4 }, "fr")).toBe("3,4 mots creux");
    expect(fillTemplate("{n} buzzwords", { n: 3.4 }, "en")).toBe("3.4 buzzwords");
    expect(fillTemplate("{a}", { a: { fr: "vivant", en: "alive" } }, "fr")).toBe("vivant");
    expect(fillTemplate("depuis {year}", {}, "fr")).toBeNull();
  });

  it("A ajouté IA à son titre : année si connue, sinon libellé de repli", () => {
    const def = STATUSES.statuses.find((d) => d.id === "cv_ai_title")!;
    expect(instantiate(def, { year: 2024 })!.label.fr).toBe("A ajouté IA à son titre en 2024");
    expect(instantiate(def, {})!.label.fr).toBe("A ajouté IA à son titre");
    expect(instantiate(def, {})!.label.en).toBe("Added AI to their title");
  });
});

describe("composition §5.1", () => {
  it("au plus 3, priorité spéciaux > écart > négatifs > positifs", () => {
    const out = composeStatuses([s("p1", "positive"), s("n1", "negative"), s("g1", "gap"), s("x1", "special"), s("n2", "negative")]);
    expect(out.map((x) => x.id)).toEqual(["x1", "g1", "p1"]); // le 3e est remplacé par un positif
  });

  it("garantit un positif s'il en existe un", () => {
    const out = composeStatuses([s("n1", "negative"), s("n2", "negative"), s("n3", "negative"), s("n4", "negative"), s("p1", "positive")]);
    expect(out.map((x) => x.id)).toEqual(["n1", "n2", "p1"]);
  });

  it("sans positif applicable, garde l'ordre de priorité", () => {
    const out = composeStatuses([s("n1", "negative"), s("n2", "negative"), s("n3", "negative"), s("n4", "negative")]);
    expect(out.map((x) => x.id)).toEqual(["n1", "n2", "n3"]);
  });

  it("au plus un statut IA, prioritaire dans son ton", () => {
    const out = composeStatuses([s("n1", "negative"), s("ai_a", "negative", true), s("ai_b", "negative", true), s("p1", "positive")]);
    expect(out.map((x) => x.id)).toEqual(["ai_a", "n1", "p1"]);
  });

  it("rien ne s'applique : statut de repli, jamais de carte sans statut", () => {
    const out = composeStatuses([]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("fallback_clean_record");
  });

  it("moins de 3 candidats : tous gardés", () => {
    expect(composeStatuses([s("p1", "positive"), s("n1", "negative")]).map((x) => x.id)).toEqual(["n1", "p1"]);
  });
});

describe("règles GitHub", () => {
  const opts = { lang: "fr" as const, judgedInSeconds: 5 };
  // Toutes les règles déclenchées, sans la limite de 3.
  const all = (f: ReturnType<typeof facts>) => {
    const stats = Object.fromEntries(scoreGithub(f, null, opts).stats.map((x) => [x.code, x.value])) as Record<StatCode, number>;
    return evaluateRules(["github"], { stats, github: { facts: f, m: deriveGithub(f) } }).map((x) => x.id);
  };

  it("horaires : 3 h du matin et vendredi soir, avec décalage UTC", () => {
    const base = facts();
    const night = facts({ commits: base.commits.map((c) => ({ ...c, date: "2026-10-07T01:30:00Z" })), utcOffsetMinutes: 120 });
    expect(all(night)).toContain("gh_3am_commit"); // 3 h 30 locale
    const friday = facts({ commits: base.commits.map((c) => ({ ...c, date: "2026-10-09T17:30:00Z" })), utcOffsetMinutes: 60 });
    expect(all(friday)).toContain("gh_friday_push"); // vendredi 18 h 30 locale
    const fridayUtc = facts({ commits: base.commits.map((c) => ({ ...c, date: "2026-10-09T17:30:00Z" })), utcOffsetMinutes: 0 });
    expect(all(fridayUtc)).not.toContain("gh_friday_push");
  });

  it("{n} repos, {m} vivants", () => {
    const repos = Array.from({ length: 12 }, (_, i) => repo(`r${i}`, { pushedAt: i < 2 ? daysAgo(10) : daysAgo(800) }));
    const card = scoreGithub(facts({ repos, activeRepos: ["r0", "r1", "r2", "r3", "r4"] }), null, opts);
    const st = card.statuses.find((x) => x.id === "gh_repos_alive");
    expect(st?.label.fr).toBe("12 repos, 2 vivants");
    expect(st?.label.en).toBe("12 repos, 2 alive");
  });

  it("README en construction depuis {year}", () => {
    const repos = [repo("a", { readmeWords: 12, createdAt: "2021-05-01T00:00:00Z" }), repo("b"), repo("c"), repo("d"), repo("e")];
    const st = scoreGithub(facts({ repos }), null, opts).statuses.find((x) => x.id === "gh_readme_wip");
    expect(st?.label.fr).toBe("README en construction depuis 2021");
  });

  it("node_modules, tests absents, polyglotte, mainteneur, stars", () => {
    const f = facts({
      trees: ["a", "b", "c", "d", "e"].map((n) => tree(n, { hasTests: false, nodeModules: n === "a" })),
      repos: [
        repo("a", { stars: 150, externalContributors: 12, languages: { A: 20_000, B: 20_000, C: 20_000, D: 20_000, E: 20_000, F: 20_000 } }),
        repo("b"),
        repo("c"),
        repo("d"),
        repo("e"),
      ],
    });
    const card = scoreGithub(f, null, opts);
    // Négatifs d'abord, un positif garanti.
    expect(card.statuses).toHaveLength(3);
    expect(card.statuses.filter((x) => x.tone === "positive")).toHaveLength(1);
    expect(card.statuses.map((x) => x.id).slice(0, 2)).toEqual(["gh_no_tests", "gh_polyglot"]);
  });

  it("tutoriels, stars, frameworks front", () => {
    const repos = [
      repo("a", { deps: ["react"] }),
      repo("b", { deps: ["vue"] }),
      repo("c", { deps: ["svelte"] }),
      repo("d", { deps: ["@angular/core"] }),
      repo("e"),
      repo("todo-app", { commitCount: 2 }),
      repo("learn-react", { commitCount: 3 }),
      repo("hello-world", { commitCount: 1 }),
    ];
    const ids = all(facts({ repos, activeRepos: ["a", "b", "c", "d", "e"] }));
    expect(ids).toContain("gh_finished_tutorial");
    expect(ids).toContain("gh_stars_mom");
    expect(ids).toContain("gh_framework_hopper");
  });

  it("contributions fantômes : aucune PR externe, compte de 3 ans ou plus", () => {
    expect(all(facts({ externalMergedPRs: 0 }))).toContain("gh_ghost_contributor");
    const young = facts({ externalMergedPRs: 0 });
    young.profile.createdAt = daysAgo(365);
    expect(all(young)).not.toContain("gh_ghost_contributor");
  });
});
