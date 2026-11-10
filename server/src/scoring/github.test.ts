import { describe, expect, it } from "vitest";
import type { CodeReadingResult } from "../../../shared/readings";
import { STAT_CODES } from "../../../shared/types";
import { daysAgo, facts, repo, tree } from "./__fixtures__/make";
import { scoreGithub } from "./index";

const opts = { lang: "fr" as const, judgedInSeconds: 7 };
const stat = (card: ReturnType<typeof scoreGithub>, code: string) => card.stats.find((s) => s.code === code)!;
const ids = (card: ReturnType<typeof scoreGithub>) => card.statuses.map((s) => s.id);

function ai(level: 1 | 2 | 3 | 4 | 5, status: CodeReadingResult["ai_status"] = null): CodeReadingResult {
  return {
    readings: ["a", "b", "c"].map((repo) => ({ repo, level, evidence_file: "src/index.ts", evidence_quote: "", observed_traits: [] })),
    ai_status: status,
  };
}

describe("barème GitHub sur un profil synthétique", () => {
  it("calcule chaque axe selon §4.4", () => {
    const card = scoreGithub(facts(), null, opts);
    expect(card.stats.map((s) => s.code)).toEqual(STAT_CODES);
    expect(stat(card, "SHIP").value).toBe(85); // 40 semaines
    expect(stat(card, "ARCH").value).toBe(99); // tests, CI, outillage partout
    expect(stat(card, "DOC").value).toBe(99); // README longs, aucun commit paresseux
    // Barre XP = critère Expérience × 10 : estimée sur GitHub, 2 années actives, niveau 4.
    expect(stat(card, "XP").value).toBe(40);
    expect(stat(card, "TEC").value).toBe(50); // repli sans IA
    expect(stat(card, "BUZZ").value).toBe(10);
    // La note globale est celle de la grille ; sans lecture IA, le code n'est pas prouvé (plafond 85).
    expect(card.overall).toBe(card.grid?.overall);
    expect(card.grid?.rule).toBe("capped_unproven");
    expect(card.overall).toBe(58);
    expect(card.tier).toBe("bronze");
  });

  it("sans IA : TEC au repli, non suffisant, fiabilité 76", () => {
    const card = scoreGithub(facts(), null, opts);
    expect(stat(card, "TEC").sufficient).toBe(false);
    expect(card.reliability).toBe(76);
  });

  it("avec IA : TEC = échelle des niveaux, pondérée par l'activité", () => {
    expect(stat(scoreGithub(facts(), ai(4), opts), "TEC").value).toBe(80);
    expect(scoreGithub(facts(), ai(4), opts).reliability).toBe(95);
    const weighted: CodeReadingResult = {
      readings: [
        { repo: "a", level: 5, evidence_file: "x", evidence_quote: "", observed_traits: [] },
        { repo: "b", level: 1, evidence_file: "y", evidence_quote: "", observed_traits: [] },
      ],
      ai_status: null,
    };
    const f = facts({ repos: [repo("a", { activity: 30 }), repo("b", { activity: 10 }), repo("c"), repo("d"), repo("e")] });
    // niveau = (5×30 + 1×10) / 40 = 4 → 80
    expect(stat(scoreGithub(f, weighted, opts), "TEC").value).toBe(80);
  });

  it("bonus : PR externes (TEC), releases (SHIP) ; la largeur ne touche plus XP", () => {
    const f = facts({
      externalMergedPRs: 5,
      calendar: { available: true, weeksActive: 26, weeks: 52, totalContributions: 300 },
      repos: [
        repo("a", { releaseDates: [daysAgo(10), daysAgo(50), daysAgo(100)], languages: { TypeScript: 20_000, Go: 20_000 } }),
        repo("b", { languages: { Rust: 20_000, Python: 20_000, C: 20_000, Shell: 20_000 } }),
        repo("c"),
        repo("d"),
        repo("e"),
      ],
    });
    const card = scoreGithub(f, ai(3), opts);
    expect(stat(card, "TEC").value).toBe(65 + 4);
    expect(stat(card, "SHIP").value).toBe(70 + 5);
    expect(stat(card, "XP").value).toBe(40);
  });

  it("ARCH : 50 tests + 30 CI + 20 outillage, sur les repos actifs lus", () => {
    const trees = [
      tree("a", { hasTests: true, hasCi: false, tooling: [] }),
      tree("b", { hasTests: false, hasCi: false, tooling: [] }),
      tree("c", { hasTests: false, hasCi: false, tooling: [] }),
      tree("d", { hasTests: false, hasCi: false, tooling: [] }),
      tree("e", { hasTests: false, hasCi: false, tooling: [] }),
    ];
    // brut = 50 × 1/5 = 10 → 25 + 0,1 × 74 = 32,4 → 32
    const card = scoreGithub(facts({ trees }), null, opts);
    expect(stat(card, "ARCH").value).toBe(32);
    expect(stat(card, "ARCH").facts[0].fr).toBe("Tests trouvés dans 1 repo sur 5");
  });

  it("DOC et BUZZ : commits paresseux et tutoriels", () => {
    const commits = facts().commits.map((c, i) => ({ ...c, message: i % 2 ? "fix" : "WIP 2" }));
    const repos = [
      repo("a", { readmeWords: 10 }),
      repo("b", { readmeWords: 10 }),
      repo("c", { readmeWords: 10 }),
      repo("d", { readmeWords: 10 }),
      repo("e", { readmeWords: 10 }),
      repo("todo-app", { commitCount: 2 }),
      repo("learn-react", { commitCount: 3 }),
      repo("hello-world", { commitCount: 1 }),
      repo("learn-go", { commitCount: 40 }), // trop de commits pour être un tutoriel
      repo("api"),
    ];
    const card = scoreGithub(facts({ repos, activeRepos: ["a", "b", "c", "d", "e"], commits }), null, opts);
    expect(stat(card, "DOC").value).toBe(25); // brut 0
    // BUZZ brut = 50 × 3/10 + 50 × 1 = 65 → 10 + 0,65 × 89 = 67,85 → 68
    expect(stat(card, "BUZZ").value).toBe(68);
    expect(ids(card)).toContain("gh_lazy_commits");
  });

  it("chaque stat a 2 à 4 faits lisibles en fr et en en", () => {
    for (const card of [scoreGithub(facts(), null, opts), scoreGithub(facts(), ai(5), opts), scoreGithub(facts({ repos: [], activeRepos: [], trees: [], commits: [] }), null, opts)]) {
      for (const s of card.stats) {
        expect(s.facts.length).toBeGreaterThanOrEqual(2);
        expect(s.facts.length).toBeLessThanOrEqual(4);
        for (const f of s.facts) {
          expect(f.fr.length).toBeGreaterThan(3);
          expect(f.en.length).toBeGreaterThan(3);
          expect(f.fr).not.toMatch(/\{|undefined|NaN/);
          expect(f.en).not.toMatch(/\{|undefined|NaN/);
        }
      }
    }
  });

  it("identité : nom, initiales, club, langage principal en minuscules", () => {
    const card = scoreGithub(facts(), null, opts);
    expect(card.name).toBe("Ada Lovelace");
    expect(card.initials).toBe("AL");
    expect(card.club).toBe("acme");
    expect(card.mainLanguage).toBe("typescript");
    expect(card.login).toBe("dev");
    const anon = scoreGithub(facts({ profile: { ...facts().profile, name: null, company: null } }), null, opts);
    expect(anon.name).toBe("dev");
    expect(anon.club).toBeNull();
  });

  it("langage principal : un repo énorme ne domine pas, balisage ignoré", () => {
    const repos = [
      repo("proofs", { language: "Lean", activity: 200, languages: { Lean: 7_000_000 } }),
      repo("a", { language: "TypeScript", activity: 50 }),
      repo("b", { language: "TypeScript", activity: 40 }),
      repo("site", { language: "HTML", activity: 80, languages: { HTML: 90_000 } }),
      repo("c", { language: "JavaScript", activity: 0 }),
    ];
    expect(scoreGithub(facts({ repos }), null, opts).mainLanguage).toBe("typescript");
    const onlyHtml = [repo("site", { language: "HTML" }), repo("x", { language: null })];
    expect(scoreGithub(facts({ repos: onlyHtml, activeRepos: ["site"] }), null, opts).mainLanguage).toBe("html");
  });

  it("wonderkid et flashback", () => {
    const young = facts({ firstRealCommit: { repo: "a", date: daysAgo(200) } });
    expect(scoreGithub(young, ai(5), opts).special).toBe("wonderkid");
    const old = facts({
      calendar: { available: true, weeksActive: 5, weeks: 52, totalContributions: 20 },
      activityByYear: [
        { yearsAgo: 0, contributions: 20 },
        { yearsAgo: 3, contributions: 50 },
        { yearsAgo: 6, contributions: 400 },
        { yearsAgo: 8, contributions: 300 },
      ],
    });
    const card = scoreGithub(old, null, opts);
    expect(card.special).toBe("flashback");
    expect(ids(card)[0]).toBe("gh_archaeologist");
    // Calibration : très actif cette année → pas de flashback même avec un passé chargé.
    const busy = facts({ activityByYear: old.activityByYear });
    expect(scoreGithub(busy, null, opts).special).toBeUndefined();
  });

  it("poste déduit des langages et des dépendances", () => {
    const fe = facts({ repos: ["a", "b", "c", "d", "e"].map((n) => repo(n, { deps: ["react", "vite"], languages: { TypeScript: 50_000, CSS: 5_000 } })) });
    expect(scoreGithub(fe, null, opts).position).toBe("FE");
    const be = facts({ repos: ["a", "b", "c", "d", "e"].map((n) => repo(n, { language: "Go", deps: ["gin"], languages: { Go: 80_000 } })) });
    expect(scoreGithub(be, null, opts).position).toBe("BE");
    const ml = facts({ repos: ["a", "b", "c", "d", "e"].map((n) => repo(n, { language: "Python", deps: ["torch", "transformers", "numpy"], languages: { Python: 80_000 } })) });
    expect(scoreGithub(ml, null, opts).position).toBe("ML");
    const fs = facts({ repos: ["a", "b", "c", "d", "e"].map((n) => repo(n, { deps: ["next", "react", "prisma"] })) });
    expect(scoreGithub(fs, null, opts).position).toBe("FS");
    const mob = facts({ repos: ["a", "b", "c", "d", "e"].map((n) => repo(n, { language: "Swift", deps: [], languages: { Swift: 80_000 } })) });
    expect(scoreGithub(mob, null, opts).position).toBe("MOB");
    const ops = facts({
      repos: ["a", "b", "c", "d", "e"].map((n) => repo(n, { language: "HCL", deps: [], languages: { HCL: 40_000, Shell: 10_000 } })),
      trees: ["a", "b"].map((n) => tree(n, { markers: ["terraform", "k8s"] })),
    });
    expect(scoreGithub(ops, null, opts).position).toBe("OPS");
    const emb = facts({ repos: ["a", "b", "c", "d", "e"].map((n) => repo(n, { language: "C", deps: [], languages: { C: 80_000 } })) });
    expect(scoreGithub(emb, null, opts).position).toBe("EMB");
  });

  it("moins de 3 repos publics : carte générée, statut spécial, fiabilité basse", () => {
    const f = facts({
      repos: [repo("a", { commitCount: 4 })],
      repoCount: 1,
      activeRepos: ["a"],
      trees: [tree("a")],
      commits: [],
      firstRealCommit: null,
    });
    const card = scoreGithub(f, null, opts);
    expect(ids(card)[0]).toBe("gh_private_talent");
    expect(card.reliability).toBeLessThanOrEqual(19);
  });

  it("déterministe : même entrée, même carte", () => {
    expect(scoreGithub(facts(), ai(3, "ai_typed"), opts)).toEqual(scoreGithub(facts(), ai(3, "ai_typed"), opts));
  });

  it("statut IA : un seul, marqué byAI, issu de la liste fermée", () => {
    const card = scoreGithub(facts(), ai(4, "ai_typed"), opts);
    const s = card.statuses.find((x) => x.byAI);
    expect(s?.id).toBe("ai_typed");
    expect(card.statuses.filter((x) => x.byAI)).toHaveLength(1);
    // Un id hors liste est ignoré.
    const bad = scoreGithub(facts(), { ...ai(4), ai_status: "gh_maintainer" as never }, opts);
    expect(bad.statuses.some((x) => x.byAI)).toBe(false);
  });
});
