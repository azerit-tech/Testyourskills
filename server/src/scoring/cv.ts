// Carte CV (SPEC §4.5) : comptages sur le texte (faits avant de jeter le texte) et barème.

import type { CvReading, CvTextCounts } from "../../../shared/readings";
import type { CardData, Fact, Lang, Position, Stat, StatCode } from "../../../shared/types";
import { tierFor } from "../../../shared/types";
import type { GithubFacts } from "../github/facts";
import { df, fact, initialsOf, nf, orderStats, overallOf, reliabilityOf, specialOf, valuesOf } from "./common";
import { AI_BUZZ_KEY, BUZZWORDS, SCORING } from "./config";
import { deriveGithub } from "./derive";
import { pickProfile, sentenceFor } from "./profiles";
import { currentRole } from "./rules";
import { clampScore, scoreOn } from "./scale";
import { composeStatuses, evaluateRules } from "./statuses";

const C = SCORING.cv;

const strip = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const L = "[\\p{L}\\p{N}]";

function termRegex(term: string, flags: string): RegExp {
  const body = esc(strip(term)).replace(/\s+/g, "\\s+").replace(/['’]/g, "['’]");
  return new RegExp(`(?<!${L})${body}(?!${L})`, flags);
}

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

/** Comptages du code sur le texte du CV : mots, mots creux, « passion ». Le texte n'est pas conservé. */
export function cvTextCounts(text: string, pages: number): CvTextCounts {
  const plain = strip(text);
  const lower = plain.toLowerCase();
  const words = (plain.match(/[\p{L}\p{N}]+(?:['’+#.-][\p{L}\p{N}]+)*/gu) ?? []).length;

  const buzzwords: Record<string, number> = {};
  const seen = new Set<string>();
  for (const term of [...BUZZWORDS.words.fr, ...BUZZWORDS.words.en]) {
    const key = strip(term).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const n = countMatches(lower, termRegex(key, "gu"));
    if (n) buzzwords[term] = n;
  }
  let ai = 0;
  for (const t of BUZZWORDS.ai.caseSensitive) ai += countMatches(plain, termRegex(t, "gu"));
  for (const t of BUZZWORDS.ai.caseInsensitive) ai += countMatches(lower, termRegex(t.toLowerCase(), "gu"));
  if (ai) buzzwords[AI_BUZZ_KEY] = ai;

  let passionCount = 0;
  for (const stem of BUZZWORDS.passionStems) passionCount += countMatches(lower, new RegExp(`(?<!${L})${esc(stem)}\\p{L}*`, "gu"));

  const total = Object.values(buzzwords).reduce((a, b) => a + b, 0);
  return {
    words,
    pages,
    buzzwords,
    buzzwordsPer100: words ? Math.round((total / words) * 10000) / 100 : 0,
    passionCount,
  };
}

/** Mots creux pour 100 mots, sans les mentions d'IA si un projet IA est décrit. */
export function buzzPer100(reading: CvReading, counts: CvTextCounts): number {
  if (!counts.words) return 0;
  const total = Object.entries(counts.buzzwords)
    .filter(([k]) => !(k === AI_BUZZ_KEY && reading.describes_ai_project))
    .reduce((s, [, n]) => s + n, 0);
  return (total / counts.words) * 100;
}

const SENIORITY_FR: Record<string, string> = { junior: "junior", mid: "intermédiaire", senior: "senior", lead: "lead", staff: "staff" };

const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim().toLowerCase()).filter(Boolean))];

export function cvPosition(r: CvReading): Position {
  const role = currentRole(r);
  if (role && new RegExp(C.cto.titlePattern, "i").test(role.title)) {
    const company = strip(role.company ?? "").trim().toLowerCase();
    if (new RegExp(C.cto.unknownCompanyPattern, "i").test(company)) return "CTO";
  }
  if (!r.is_dev_profile && r.position !== "PM" && r.position !== "DESIGN") return "PM";
  return r.position;
}

function cvMainLanguage(r: CvReading): string | undefined {
  const known = new Set(C.languages);
  for (const t of [...r.technos_described, ...r.technos_listed]) {
    const k = t.trim().toLowerCase();
    if (known.has(k)) return k;
  }
  return undefined;
}

export function scoreCv(
  reading: CvReading,
  counts: CvTextCounts,
  opts: { lang: Lang; judgedInSeconds: number; github?: GithubFacts },
): Omit<CardData, "id" | "createdAt"> {
  const r = reading;
  const described = uniq(r.technos_described);
  const listed = uniq(r.technos_listed);
  const enoughText = counts.words >= C.sufficiency.minWords;
  const datedRoles = r.roles.filter((x) => x.start).map((x) => x.start!).sort();

  // TEC
  const seniorityBase = C.TEC.seniority[r.seniority_claimed] ?? C.TEC.seniority.mid;
  const tecBonus = C.TEC.perDescribedTechno * described.length;
  const TEC: Stat = {
    code: "TEC",
    value: clampScore(seniorityBase + tecBonus),
    sufficient: r.roles.length > 0 || described.length > 0,
    facts: [
      fact(`Séniorité déclarée : ${SENIORITY_FR[r.seniority_claimed] ?? r.seniority_claimed} (${seniorityBase})`, `Claimed seniority: ${r.seniority_claimed} (${seniorityBase})`),
      fact(
        `${described.length} techno${described.length > 1 ? "s" : ""} rattachée${described.length > 1 ? "s" : ""} à une responsabilité (+${tecBonus})`,
        `${described.length} technolog${described.length === 1 ? "y" : "ies"} tied to a responsibility (+${tecBonus})`,
      ),
      fact(`${listed.length} technos listées, non comptées`, `${listed.length} technologies listed, not counted`),
    ],
  };

  // SHIP
  const p = r.projects_with_dated_outcome;
  const SHIP: Stat = {
    code: "SHIP",
    value: scoreOn(C.SHIP.scale, p),
    sufficient: r.roles.length > 0,
    facts: [
      fact(`${p} projet${p > 1 ? "s" : ""} avec un résultat daté`, `${p} project${p === 1 ? "" : "s"} with a dated outcome`),
      fact(`${r.roles.length} expérience${r.roles.length > 1 ? "s" : ""} décrite${r.roles.length > 1 ? "s" : ""}`, `${r.roles.length} role${r.roles.length === 1 ? "" : "s"} described`),
    ],
  };

  // ARCH
  const mentions = r.tests_ci_review_mentions.filter((x) => x.quote.trim());
  const archFacts: Fact[] = [
    fact(
      `${mentions.length} mention${mentions.length > 1 ? "s" : ""} concrète${mentions.length > 1 ? "s" : ""} de tests, CI ou revue de code`,
      `${mentions.length} concrete mention${mentions.length === 1 ? "" : "s"} of tests, CI or code review`,
    ),
  ];
  if (mentions[0]) {
    const q = mentions[0].quote.trim().slice(0, 90);
    archFacts.push(fact(`Par exemple : « ${q} »`, `For example: "${q}"`));
  }
  const ARCH: Stat = { code: "ARCH", value: scoreOn(C.ARCH.scale, mentions.length), sufficient: enoughText, facts: archFacts };

  // DOC
  const long = counts.words > C.DOC.longCvWords;
  const DOC: Stat = {
    code: "DOC",
    value: clampScore(scoreOn(C.DOC.scale, r.writing_quality) - (long ? C.DOC.longCvPenalty : 0)),
    sufficient: enoughText,
    facts: [
      fact(`Structure et clarté du CV : ${r.writing_quality}/5`, `CV structure and clarity: ${r.writing_quality}/5`),
      fact(
        `${nf(counts.words, "fr")} mots sur ${counts.pages} page${counts.pages > 1 ? "s" : ""}${long ? ` (−${C.DOC.longCvPenalty}, plus de ${nf(C.DOC.longCvWords, "fr")} mots)` : ""}`,
        `${nf(counts.words, "en")} words over ${counts.pages} page${counts.pages === 1 ? "" : "s"}${long ? ` (−${C.DOC.longCvPenalty}, over ${nf(C.DOC.longCvWords, "en")} words)` : ""}`,
      ),
    ],
  };

  // XP
  const y = r.years_declared;
  const XP: Stat = {
    code: "XP",
    value: scoreOn(SCORING.github.XP.scale, y),
    sufficient: y > 0 || datedRoles.length > 0,
    facts: [
      fact(`${df(y, "fr")} an${y >= 2 ? "s" : ""} d'expérience déclarée${y >= 2 ? "s" : ""}`, `${df(y, "en")} year${y === 1 ? "" : "s"} of experience claimed`),
      datedRoles.length
        ? fact(`Premier poste daté : ${datedRoles[0].slice(0, 4)}`, `First dated role: ${datedRoles[0].slice(0, 4)}`)
        : fact("Aucun poste daté", "No dated role"),
    ],
  };

  // BUZZ
  const per100 = buzzPer100(r, counts);
  const top = Object.entries(counts.buzzwords)
    .filter(([k]) => !(k === AI_BUZZ_KEY && r.describes_ai_project))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3);
  const BUZZ: Stat = {
    code: "BUZZ",
    value: scoreOn(C.BUZZ.scale, per100),
    sufficient: enoughText,
    facts: [
      fact(`${df(per100, "fr")} mots creux pour 100 mots`, `${df(per100, "en")} buzzwords per 100 words`),
      top.length
        ? fact(
            `Les plus fréquents : ${top.map(([k, n]) => `« ${k} » ×${n}`).join(", ")}`,
            `Most frequent: ${top.map(([k, n]) => `"${k}" ×${n}`).join(", ")}`,
          )
        : fact("Aucun mot creux repéré", "No buzzword spotted"),
    ],
  };

  const stats = orderStats({ TEC, SHIP, ARCH, DOC, XP, BUZZ } as Record<StatCode, Stat>);
  const values = valuesOf(stats);
  const overall = overallOf(values);
  const gh = opts.github ? { facts: opts.github, m: deriveGithub(opts.github) } : undefined;
  const cvCtx = { reading: r, counts, buzzPer100: per100 };
  const candidates = evaluateRules(["cv"], { stats: values, github: gh, cv: cvCtx });
  const statuses = composeStatuses(candidates);

  const name =
    r.full_name?.trim() || opts.github?.profile.name?.trim() || opts.github?.login || (opts.lang === "fr" ? "CV anonyme" : "Anonymous CV");
  const special = specialOf(values, false);
  const club = currentRole(r)?.company?.trim() || null;
  return {
    source: "cv",
    scoringVersion: SCORING.version,
    name,
    ...(opts.github ? { login: opts.github.login } : {}),
    initials: initialsOf(name),
    overall,
    tier: tierFor(overall),
    ...(special ? { special } : {}),
    position: cvPosition(r),
    mainLanguage: cvMainLanguage(r),
    club,
    stats,
    statuses,
    // Le profil de la fiche CV ne lit que le CV : les faits GitHub d'une
    // comparaison font le profil de la fiche GitHub (compare.ts ajoute l'écart).
    profile: pickProfile({ stats: values, cv: cvCtx }),
    sentence: sentenceFor(values, statuses),
    reliability: reliabilityOf(stats),
    judgedInSeconds: opts.judgedInSeconds,
    lang: opts.lang,
  };
}
