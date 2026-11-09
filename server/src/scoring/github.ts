// Barème de la carte GitHub (SPEC §4.4) : faits → six stats, globale, tier, statuts.

import type { CodeReadingResult } from "../../../shared/readings";
import type { CardData, Fact, Lang, Stat, StatCode } from "../../../shared/types";
import { tierFor } from "../../../shared/types";
import type { GithubFacts } from "../github/facts";
import {
  cleanCompany,
  df,
  fact,
  initialsOf,
  nf,
  orderStats,
  overallOf,
  pct,
  reliabilityOf,
  specialOf,
  valuesOf,
} from "./common";
import { SCORING } from "./config";
import { deriveGithub, type GithubMetrics } from "./derive";
import { githubPosition } from "./position";
import { pickProfile, sentenceFor } from "./profiles";
import { clampScore, interpolate, scoreOn, stepBonus } from "./scale";
import { aiStatus, composeStatuses, evaluateRules } from "./statuses";

const G = SCORING.github;

function ratioFact(n: number, total: number, fr: string, en: string): Fact {
  return fact(`${fr} dans ${n} repo${n > 1 ? "s" : ""} sur ${total}`, `${en} in ${n} of ${total} repo${total > 1 ? "s" : ""}`);
}

export function shipStat(m: GithubMetrics): Stat {
  const bonus = m.releasesLastYear >= G.SHIP.releasesAtLeast ? G.SHIP.releaseBonus : 0;
  const weeks = Math.min(52, m.weeksActive);
  const facts: Fact[] = [
    fact(`${weeks} semaines actives sur 52`, `${weeks} active weeks out of 52`),
    fact(`${nf(m.totalContributions, "fr")} contributions sur 12 mois`, `${nf(m.totalContributions, "en")} contributions over 12 months`),
    bonus
      ? fact(`${m.releasesLastYear} releases dans l'année (+${bonus})`, `${m.releasesLastYear} releases this year (+${bonus})`)
      : fact(
          `${m.releasesLastYear} release${m.releasesLastYear > 1 ? "s" : ""} dans l'année (bonus à partir de ${G.SHIP.releasesAtLeast})`,
          `${m.releasesLastYear} release${m.releasesLastYear === 1 ? "" : "s"} this year (bonus from ${G.SHIP.releasesAtLeast})`,
        ),
  ];
  if (!m.calendarAvailable) facts.unshift(fact("Calendrier de contributions indisponible", "Contribution calendar unavailable"));
  return { code: "SHIP", value: scoreOn(G.SHIP.scale, weeks, bonus), sufficient: m.calendarAvailable, facts };
}

export function archStat(m: GithubMetrics): Stat {
  const n = m.treesAnalyzed;
  const w = G.ARCH.weights;
  const raw = n ? (w.tests * m.testsRepos + w.ci * m.ciRepos + w.tooling * m.toolingRepos) / n : 0;
  const facts: Fact[] = n
    ? [
        ratioFact(m.testsRepos, n, "Tests trouvés", "Tests found"),
        ratioFact(m.ciRepos, n, "CI", "CI"),
        m.toolingNames.length
          ? fact(
              `Outillage dans ${m.toolingRepos} repo${m.toolingRepos > 1 ? "s" : ""} sur ${n} (${m.toolingNames.slice(0, 3).join(", ")})`,
              `Tooling in ${m.toolingRepos} of ${n} repos (${m.toolingNames.slice(0, 3).join(", ")})`,
            )
          : fact(`Aucun outillage (lint, format, typage strict) sur ${n} repos`, `No tooling (lint, format, strict typing) across ${n} repos`),
      ]
    : [fact("Aucune arborescence de repo actif lisible", "No readable tree for active repos")];
  if (m.activeWithinArchWindow < G.ARCH.sufficientActiveRepos)
    facts.push(
      fact(
        `${m.activeWithinArchWindow} repo(s) actif(s) sur 2 ans : base mince`,
        `${m.activeWithinArchWindow} repo(s) active in 2 years: thin evidence`,
      ),
    );
  return {
    code: "ARCH",
    value: scoreOn(G.ARCH.scale, raw),
    sufficient: m.activeWithinArchWindow >= G.ARCH.sufficientActiveRepos,
    facts,
  };
}

export function docStat(m: GithubMetrics): Stat {
  const n = m.active.length;
  const readmeShare = n ? m.readmeLongRepos / n : 0;
  const lazy = m.lazyShare ?? G.DOC.lazyShareWhenUnknown;
  const raw = G.DOC.weights.readme * readmeShare + G.DOC.weights.commits * (1 - lazy);
  const facts: Fact[] = [
    fact(
      `README de ${G.DOC.readmeWordsAtLeast} mots ou plus : ${m.readmeLongRepos} repo${m.readmeLongRepos > 1 ? "s" : ""} sur ${n}`,
      `README of ${G.DOC.readmeWordsAtLeast}+ words: ${m.readmeLongRepos} of ${n} repos`,
    ),
    m.lazyShare === null
      ? fact("Aucun message de commit lisible", "No readable commit messages")
      : fact(
          `${pct(m.lazyShare)} % de commits paresseux sur ${m.commitsSample} lus`,
          `${pct(m.lazyShare)}% lazy commits out of ${m.commitsSample} read`,
        ),
  ];
  if (m.lazyExamples.length)
    facts.push(
      fact(`Exemples : ${m.lazyExamples.map((e) => `« ${e} »`).join(", ")}`, `Examples: ${m.lazyExamples.map((e) => `"${e}"`).join(", ")}`),
    );
  return { code: "DOC", value: scoreOn(G.DOC.scale, raw), sufficient: m.readableRepos >= G.DOC.sufficientRepos, facts };
}

export function xpStat(m: GithubMetrics): Stat {
  const years = m.firstCommitYears ?? 0;
  const langs = m.languagesOverMin.length;
  const bonus = stepBonus(G.XP.breadthBonus, langs);
  const facts: Fact[] = [
    m.firstCommitDate
      ? fact(
          `Premier vrai commit en ${m.firstCommitDate.slice(0, 4)} (il y a ${df(years, "fr")} an${years >= 2 ? "s" : ""})`,
          `First real commit in ${m.firstCommitDate.slice(0, 4)} (${df(years, "en")} year${years >= 2 ? "s" : ""} ago)`,
        )
      : fact(`Aucun repo avec ${G.XP.sufficientRepoCommits} commits ou plus`, `No repo with ${G.XP.sufficientRepoCommits}+ commits`),
    fact(
      `${langs} langage${langs > 1 ? "s" : ""} avec 10 Ko de code ou plus${bonus ? ` (+${bonus})` : ""}`,
      `${langs} language${langs === 1 ? "" : "s"} with 10 KB of code or more${bonus ? ` (+${bonus})` : ""}`,
    ),
    fact(`Compte GitHub depuis ${Math.floor(m.accountYears)} ans`, `On GitHub for ${Math.floor(m.accountYears)} years`),
  ];
  return {
    code: "XP",
    value: scoreOn(G.XP.scale, years, bonus),
    sufficient: (m.maxRepoCommits ?? 0) >= G.XP.sufficientRepoCommits,
    facts,
  };
}

export function tecStat(f: GithubFacts, m: GithubMetrics, ai: CodeReadingResult | null): Stat {
  const bonus = m.externalPRs >= G.TEC.externalPrsAtLeast ? G.TEC.externalPrBonus : 0;
  const prFact = fact(
    `${nf(m.externalPRs, "fr")} PR fusionnées chez les autres${bonus ? ` (+${bonus})` : ""}`,
    `${nf(m.externalPRs, "en")} PRs merged into other people's repos${bonus ? ` (+${bonus})` : ""}`,
  );
  const enoughCommits = (m.maxRepoCommits ?? 0) >= G.TEC.sufficientRepoCommits;
  const readings = ai?.readings ?? [];
  if (!readings.length) {
    return {
      code: "TEC",
      value: clampScore(G.TEC.fallback + bonus),
      sufficient: false,
      facts: [
        fact(`Lecture du code indisponible : note de repli ${G.TEC.fallback}`, `Code reading unavailable: fallback score ${G.TEC.fallback}`),
        prFact,
      ],
    };
  }
  const weight = (repo: string) => Math.max(1, f.repos.find((r) => r.name === repo)?.activity ?? 1);
  let sw = 0;
  let sl = 0;
  for (const r of readings) {
    sw += weight(r.repo);
    sl += weight(r.repo) * r.level;
  }
  const level = sl / sw;
  const best = [...readings].sort((a, b) => b.level - a.level || weight(b.repo) - weight(a.repo))[0];
  const facts: Fact[] = [
    fact(
      `Niveau lu par l'IA : ${df(level, "fr")}/5 sur ${readings.length} repo${readings.length > 1 ? "s" : ""}`,
      `Level read by the AI: ${df(level, "en")}/5 across ${readings.length} repo${readings.length > 1 ? "s" : ""}`,
    ),
    fact(`Meilleur : ${best.repo}, niveau ${best.level} (${best.evidence_file})`, `Best: ${best.repo}, level ${best.level} (${best.evidence_file})`),
    prFact,
  ];
  if (!enoughCommits)
    facts.push(fact(`Aucun repo avec ${G.TEC.sufficientRepoCommits} commits ou plus`, `No repo with ${G.TEC.sufficientRepoCommits}+ commits`));
  return { code: "TEC", value: clampScore(interpolate(G.TEC.levelScale, level) + bonus), sufficient: enoughCommits, facts };
}

export function buzzStat(m: GithubMetrics): Stat {
  const lazy = m.lazyShare ?? 0;
  const raw = G.BUZZ.weights.tutorials * m.tutorialShare + G.BUZZ.weights.lazy * lazy;
  return {
    code: "BUZZ",
    value: scoreOn(G.BUZZ.scale, raw),
    sufficient: m.listedRepos > 0,
    facts: [
      fact(
        `${m.tutorialRepos.length} repo${m.tutorialRepos.length > 1 ? "s" : ""} tutoriel${m.tutorialRepos.length > 1 ? "s" : ""} sur ${m.listedRepos}`,
        `${m.tutorialRepos.length} tutorial repo${m.tutorialRepos.length === 1 ? "" : "s"} out of ${m.listedRepos}`,
      ),
      fact(`${pct(lazy)} % de commits paresseux`, `${pct(lazy)}% lazy commits`),
    ],
  };
}

export function scoreGithub(
  facts: GithubFacts,
  ai: CodeReadingResult | null,
  opts: { lang: Lang; judgedInSeconds: number },
): Omit<CardData, "id" | "createdAt"> {
  const m = deriveGithub(facts);
  const byCode: Record<StatCode, Stat> = {
    TEC: tecStat(facts, m, ai),
    SHIP: shipStat(m),
    ARCH: archStat(m),
    DOC: docStat(m),
    XP: xpStat(m),
    BUZZ: buzzStat(m),
  };
  const stats = orderStats(byCode);
  const values = valuesOf(stats);
  const overall = overallOf(values);

  const candidates = evaluateRules(["github"], { stats: values, github: { facts, m } });
  const fromAI = aiStatus(ai?.ai_status);
  if (fromAI) candidates.push(fromAI);

  const statuses = composeStatuses(candidates);
  const name = facts.profile.name?.trim() || facts.login;
  const special = specialOf(values, m.flashback);
  return {
    source: "github",
    scoringVersion: SCORING.version,
    name,
    login: facts.login,
    avatarUrl: facts.profile.avatarUrl || undefined,
    initials: initialsOf(name),
    overall,
    tier: tierFor(overall),
    ...(special ? { special } : {}),
    position: githubPosition(facts, m),
    mainLanguage: m.mainLanguage?.toLowerCase() ?? undefined,
    club: cleanCompany(facts.profile.company),
    stats,
    statuses,
    profile: pickProfile({ stats: values, github: { facts, m } }),
    sentence: sentenceFor(values, statuses),
    reliability: reliabilityOf(stats),
    judgedInSeconds: opts.judgedInSeconds,
    lang: opts.lang,
  };
}
