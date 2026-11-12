// Les grilles du barème en démo (?mock=1), écrites à la main dans la tournure du
// moteur (server/src/scoring/grid.ts) et finalisées par les mêmes quatre règles
// (docs/bareme-recrutement.md §4) : la note affichée est celle de la grille.
// Chargé à la demande par mock.ts : rien de tout cela n'entre dans le bundle.
// Des personnes inventées seulement : les fiches de personnes réelles (icon) n'ont pas de grille.
//
// Les états couverts, par pseudo de démo :
//   kevin-dev42  GitHub seul, 44 : tout noté, l'open source sous la moyenne
//   camroux      GitHub seul, 68 : l'open source au-dessus, il entre
//   leamd        GitHub seul, 79 : maintient un projet
//   nour-rs      GitHub seul, 64 : école lue sur un dépôt de hackathon, sous la moyenne
//   jplefevre    GitHub seul, 64 : stack arrêtée par la fraîcheur
//   ghost-coder  GitHub seul, 46 : « code non prouvé », plafond 85 (sans effet ici)
//   x            dossier vide, 20
//   linkedin.com/in/sans-github  LinkedIn seul, 75 : déclaré, non prouvé, plafond 85
//   camille-ardent (ou un LinkedIn et un pseudo)  la comparaison et la note du dossier, 83
//   un LinkedIn et le pseudo x  face à un GitHub vide : code non prouvé, dossier 75

import { GRID_WEIGHTS } from "../../../shared/gridText";
import type { CriterionCode, Fact, Grid, GridCriterion, GridSource } from "../../../shared/types";
import { CRITERION_CODES } from "../../../shared/types";

type Draft = Omit<GridCriterion, "counted">;
const f = (fr: string, en: string): Fact => ({ fr, en });

function c(code: CriterionCode, score: number | null, state: GridCriterion["state"], source: GridSource, reached: Fact, more: Partial<Draft> = {}): Draft {
  return { code, score, state, source, reached, flags: [], ...more };
}

/** Les quatre règles du §4, comme le moteur : hors moyenne sans note ; école et open source seulement au-dessus ; plafond 85 sans code ; dossier vide 20. */
export function finalizeMock(drafts: Draft[]): Grid {
  const byCode = new Map(drafts.map((d) => [d.code, d]));
  const ordered = CRITERION_CODES.map((code) => byCode.get(code)!).filter(Boolean);
  const w2 = (code: CriterionCode) => Math.round(GRID_WEIGHTS[code] * 2);
  const total2 = CRITERION_CODES.reduce((s, code) => s + w2(code), 0);
  const scored = ordered.filter((d) => d.score !== null);
  if (scored.reduce((s, d) => s + w2(d.code), 0) < 0.25 * total2)
    return { criteria: ordered.map((d) => ({ ...d, counted: false })), overall: 20, rule: "empty_file" };
  const never = new Set<CriterionCode>(["EDU", "OSS"]);
  const base = scored.filter((d) => !never.has(d.code));
  const n0 = base.reduce((s, d) => s + d.score! * w2(d.code), 0);
  const d0 = base.reduce((s, d) => s + w2(d.code), 0);
  const counted = new Set(base.map((d) => d.code));
  for (const d of scored) if (never.has(d.code) && (d0 === 0 || d.score! * d0 > n0)) counted.add(d.code);
  const inMean = scored.filter((d) => counted.has(d.code));
  const n = inMean.reduce((s, d) => s + d.score! * w2(d.code), 0);
  const den = inMean.reduce((s, d) => s + w2(d.code), 0);
  let overall = den ? Math.floor((20 * n + den) / (2 * den)) : 1;
  const capped = byCode.get("CODE")?.score == null;
  if (capped) overall = Math.min(overall, 85);
  overall = Math.min(99, Math.max(1, overall));
  return { criteria: ordered.map((d) => ({ ...d, counted: counted.has(d.code) })), overall, ...(capped ? { rule: "capped_unproven" as const } : {}) };
}

// --- Les briques de la fiche GitHub ----------------------------------------------------

const gh = (login: string, repo?: string, path = "") => `https://github.com/${login}${repo ? `/${repo}` : ""}${path}`;

const eduNone = () =>
  c("EDU", null, "missing", "github", f("L'école se lit sur LinkedIn ou le CV : sans objet ici.", "School is read on LinkedIn or the CV: not applicable here."));
const empNone = () =>
  c("EMP", null, "missing", "github", f("Le parcours se lit sur LinkedIn ou le CV : sans objet ici.", "Career path is read on LinkedIn or the CV: not applicable here."));

function xpGh(login: string, active: number, score: number, next: Fact): Draft {
  const yfr = `${active} année${active > 1 ? "s" : ""} active${active > 1 ? "s" : ""}`;
  const yen = `${active} active year${active > 1 ? "s" : ""}`;
  return c("XP", score, "scored", "github", f(`Estimée : ${yfr} sur GitHub (50 contributions ou plus sur douze mois), table arrêtée à 8.`, `Estimated: ${yen} on GitHub (50+ contributions over twelve months), table stops at 8.`), {
    next,
    evidence: { text: f(`${yfr} sur les contributions par année.`, `${yen} in the contributions per year.`), source: "github", proof: gh(login) },
  });
}
const xpMore = (score: number, years: number, active: number) =>
  f(`Pour ${score} : ${years} années actives. Tu en as ${active}. Ou des postes datés sur LinkedIn.`, `For ${score}: ${years} active years. You have ${active}. Or dated roles on LinkedIn.`);
const xpTop = () => f("Pour aller plus haut : des postes datés sur LinkedIn.", "To go higher: dated roles on LinkedIn.");

function code(login: string, repo: string, file: string, level: number, avg: string, avgEn: string, score: number, quote: string, next?: Fact): Draft {
  return c("CODE", score, "scored", "github", f(`Niveau moyen lu ${avg} sur 5, sur 3 dépôts.`, `Average level read ${avgEn} out of 5, across 3 repos.`), {
    ...(next ? { next } : {}),
    evidence: {
      text: f(`${repo}, \`${file}\` : niveau ${level} sur 5. « ${quote} »`, `${repo}, \`${file}\`: level ${level} out of 5. "${quote}"`),
      source: "github",
      proof: gh(login, repo, `/blob/main/${file}`),
    },
  });
}

function act(login: string, weeks: number, contributions: string, contributionsEn: string, score: number, next?: Fact, flags: Fact[] = []): Draft {
  return c("ACT", score, "scored", "github", f(`${weeks} semaines actives sur 52.`, `${weeks} active weeks out of 52.`), {
    ...(next ? { next } : {}),
    flags,
    evidence: { text: f(`${weeks} semaines actives sur 52, ${contributions} contributions.`, `${weeks} active weeks out of 52, ${contributionsEn} contributions.`), source: "github", proof: gh(login) },
  });
}
const actNext = (target: number, weeks: number) =>
  f(`Pour ${target} : ${target === 10 ? 48 : target === 8 ? 40 : target === 6 ? 26 : 13} semaines actives (tu en as ${weeks}).`, `For ${target}: ${target === 10 ? 48 : target === 8 ? 40 : target === 6 ? 26 : 13} active weeks (you have ${weeks}).`);

const OWN_REACHED: Record<number, Fact> = {
  10: f("Un projet dont beaucoup se servent, avec trois releases dans l'année.", "A project many people use, with three releases this year."),
  8: f("Un projet porté plus d'un an, publié, et utilisé par d'autres.", "A project carried for over a year, published, and used by others."),
  4: f("Un projet porté 6 mois ou plus.", "A project carried for 6 months or more."),
  2: f("Des dépôts, aucun porté dans la durée.", "Repos, none carried over time."),
};
const OWN_NEXT: Record<number, Fact> = {
  4: f("Pour 6 : de quoi mettre en production dans un dépôt actif (Dockerfile, CI ou release).", "For 6: what it takes to ship in an active repo (Dockerfile, CI or release)."),
  6: f(
    "Pour 8 : un projet de plus d'un an et 100 commits, publié, utilisé par d'autres (100 étoiles ou 3 contributeurs externes).",
    "For 8: a project over a year old with 100 commits, published, used by others (100 stars or 3 outside contributors).",
  ),
  8: f("Pour 10 : 1 000 étoiles ou 10 contributeurs externes, et 3 releases dans l'année.", "For 10: 1,000 stars or 10 outside contributors, and 3 releases this year."),
};

function own(login: string, score: number, repo: string, commits: number, months: number, extra: Fact = f("", ""), deploy?: string): Draft {
  const reached = score === 6 ? f(`Un projet porté 6 mois ou plus, et de quoi mettre en production (${deploy ?? repo}).`, `A project carried for 6 months or more, and what it takes to ship (${deploy ?? repo}).`) : OWN_REACHED[score];
  const next =
    score === 2
      ? f(`Pour 4 : un projet porté 6 mois avec 50 commits. Le plus gros : ${repo} : ${commits} commits sur ${months} mois.`, `For 4: a project carried for 6 months with 50 commits. The biggest: ${repo}: ${commits} commits over ${months} months.`)
      : OWN_NEXT[score];
  return c("OWN", score, "scored", "github", reached, {
    ...(next ? { next } : {}),
    evidence: { text: f(`${repo} : ${commits} commits sur ${months} mois.${extra.fr}`, `${repo}: ${commits} commits over ${months} months.${extra.en}`), source: "github", proof: gh(login, repo) },
  });
}

function oss(login: string, score: number, prs: number, reached?: Fact, next?: Fact): Draft {
  const text = prs
    ? f(`${prs} PR fusionnée${prs > 1 ? "s" : ""} chez les autres.`, `${prs} PR${prs === 1 ? "" : "s"} merged into other people's repos.`)
    : f("Aucune PR fusionnée chez les autres.", "No PR merged into other people's repos.");
  return c("OSS", score, "scored", "github", reached ?? text, {
    ...(next ? { next } : {}),
    evidence: { text, source: "github", proof: `https://github.com/search?q=type%3Apr+author%3A${login}+is%3Amerged+-user%3A${login}&type=pullrequests` },
  });
}
const ossNext = (target: number, need: number, prs: number) =>
  f(`Pour ${target} : ${need} PR fusionnées chez les autres (tu en as ${prs}).`, `For ${target}: ${need} PRs merged into other people's repos (you have ${prs}).`);
const oss10 = () =>
  f("Pour 10 : maintenir un projet de 1 000 étoiles, ou 20 PR fusionnées dans de tels projets.", "For 10: maintain a project with 1,000 stars, or 20 PRs merged into such projects.");

function stk(login: string, score: number, reached: Fact, evidence: Fact, lastRepo: string, next?: Fact, flags: Fact[] = []): Draft {
  return c("STK", score, "scored", "github", reached, { ...(next ? { next } : {}), flags, evidence: { text: evidence, source: "github", proof: gh(login, lastRepo) } });
}

// --- Les fiches GitHub de la démo --------------------------------------------------------

const GITHUB: Record<string, (login: string) => Grid> = {
  bronze: (l) =>
    finalizeMock([
      eduNone(),
      xpGh(l, 2, 4, xpMore(5, 3, 2)),
      empNone(),
      stk(
        l,
        6,
        f("JavaScript : 231 commits dans 9 dépôts, pratiqué depuis 1,4 an.", "JavaScript: 231 commits in 9 repos, practised for 1.4 years."),
        f("JavaScript : 231 commits dans 9 dépôts depuis juin 2025, dernier push il y a 3 jours (todo-app-v4).", "JavaScript: 231 commits in 9 repos since June 2025, last push 3 days ago (todo-app-v4)."),
        "todo-app-v4",
        f(
          "Pour 8 : 500 commits dans ton langage principal (tu en as 231), pratiqué depuis 2 ans (1,4 an aujourd'hui), une autre famille de langages, avec un dépôt de 10 commits.",
          "For 8: 500 commits in your main language (you have 231), practised for 2 years (1.4 years today), another language family, with a 10-commit repo.",
        ),
      ),
      code(l, "todo-app-v4", "src/App.js", 2, "2,2", "2.2", 4, "fetch(url).then(r => r.json()).then(setTodos) // TODO erreurs", f("Pour 5 : un niveau moyen de 2,3 sur 5 (tu as 2,2).", "For 5: an average level of 2.3 out of 5 (you have 2.2).")),
      act(l, 19, "212", "212", 4, actNext(6, 19)),
      own(l, 4, "todo-app-v4", 64, 7),
      oss(l, 2, 3, undefined, ossNext(4, 5, 3)),
    ]),
  silver: (l) =>
    finalizeMock([
      eduNone(),
      xpGh(l, 6, 8, xpTop()),
      empNone(),
      stk(
        l,
        6,
        f("Python : 412 commits dans 11 dépôts, pratiqué depuis 4,2 ans, 1 autre famille de langages.", "Python: 412 commits in 11 repos, practised for 4.2 years, 1 other language family."),
        f("Python : 412 commits dans 11 dépôts depuis septembre 2022, dernier push hier (rdv-sync). Go aussi dans le code.", "Python: 412 commits in 11 repos since September 2022, last push yesterday (rdv-sync). Go in the code too."),
        "rdv-sync",
        f("Pour 8 : 500 commits dans ton langage principal (tu en as 412).", "For 8: 500 commits in your main language (you have 412)."),
      ),
      code(l, "rdv-sync", "rdv_sync/slots.py", 3, "3,1", "3.1", 6, "def free_slots(calendar: Calendar, day: date) -> list[Slot]:", f("Pour 7 : un niveau moyen de 3,3 sur 5 (tu as 3,1).", "For 7: an average level of 3.3 out of 5 (you have 3.1).")),
      act(l, 41, "734", "734", 8, actNext(10, 41)),
      own(l, 6, "rdv-sync", 188, 19, f(" Dockerfile, CI, 38 étoiles.", " Dockerfile, CI, 38 stars.")),
      oss(l, 8, 9, f("142 étoiles sur ses dépôts.", "142 stars on own repos."), oss10()),
    ]),
  gold: (l) =>
    finalizeMock([
      eduNone(),
      xpGh(l, 5, 7, xpMore(8, 6, 5)),
      empNone(),
      stk(
        l,
        8,
        f("TypeScript : 734 commits dans 14 dépôts, pratiqué depuis 3,4 ans, 1 autre famille de langages.", "TypeScript: 734 commits in 14 repos, practised for 3.4 years, 1 other language family."),
        f("TypeScript : 734 commits dans 14 dépôts depuis juin 2023, dernier push aujourd'hui (typed-env). Rust aussi dans le code.", "TypeScript: 734 commits in 14 repos since June 2023, last push today (typed-env). Rust in the code too."),
        "typed-env",
        f(
          "Pour 10 : 1 000 commits dans ton langage principal (tu en as 734), 2 autres familles de langages (tu en as 1).",
          "For 10: 1,000 commits in your main language (you have 734), 2 other language families (you have 1).",
        ),
      ),
      code(l, "typed-env", "src/parse.test.ts", 5, "4,1", "4.1", 8, "it.each(cases)('rejects %s with a typed error', …", f("Pour 9 : un niveau moyen de 4,3 sur 5 (tu as 4,1).", "For 9: an average level of 4.3 out of 5 (you have 4.1).")),
      act(l, 46, "1 284", "1,284", 8, actNext(10, 46)),
      own(l, 8, "typed-env", 412, 31, f(" Publié sur npm, 6 contributeurs externes.", " Published on npm, 6 outside contributors.")),
      oss(l, 10, 27, f("Maintient typed-env, 1 240 étoiles.", "Maintainer of typed-env, 1,240 stars.")),
    ]),
  wonderkid: (l) =>
    finalizeMock([
      c("EDU", 4, "scored", "github", f("Un hackathon ou un concours, sans classement cité.", "A hackathon or a competition, no ranking on file."), {
        next: f("Pour 6 : une école de rang B, sur LinkedIn.", "For 6: a tier B school, on LinkedIn."),
        evidence: { text: f("Dépôt hackathon-drone-2025 : hackathon ou concours.", "Repo hackathon-drone-2025: hackathon or competition."), source: "github", proof: gh(l, "hackathon-drone-2025") },
      }),
      xpGh(l, 2, 4, xpMore(5, 3, 2)),
      empNone(),
      stk(
        l,
        6,
        f("Rust : 268 commits dans 6 dépôts, pratiqué depuis 1,6 an, 1 autre famille de langages.", "Rust: 268 commits in 6 repos, practised for 1.6 years, 1 other language family."),
        f("Rust : 268 commits dans 6 dépôts depuis avril 2025, dernier push il y a 2 jours (stm32-flight). C aussi dans le code.", "Rust: 268 commits in 6 repos since April 2025, last push 2 days ago (stm32-flight). C in the code too."),
        "stm32-flight",
        f("Pour 8 : 500 commits dans ton langage principal (tu en as 268), pratiqué depuis 2 ans (1,6 an aujourd'hui).", "For 8: 500 commits in your main language (you have 268), practised for 2 years (1.6 years today)."),
        [f("IA dans l'atelier : des fichiers d'agent dans stm32-flight.", "AI in the workshop: agent files in stm32-flight.")],
      ),
      code(l, "stm32-flight", "src/pid.rs", 4, "3,9", "3.9", 8, "#[test] fn saturates_output_at_limits()", f("Pour 9 : un niveau moyen de 4,3 sur 5 (tu as 3,9), des tests dans la moitié des dépôts actifs.", "For 9: an average level of 4.3 out of 5 (you have 3.9), tests in half of the active repos.")),
      act(l, 42, "903", "903", 8, actNext(10, 42)),
      own(l, 6, "stm32-flight", 141, 11, f(" CI, 12 étoiles.", " CI, 12 stars.")),
      oss(l, 4, 7, undefined, ossNext(6, 20, 7)),
    ]),
  flashback: (l) =>
    finalizeMock([
      eduNone(),
      xpGh(l, 11, 8, xpTop()),
      empNone(),
      stk(
        l,
        4,
        f("C : 1 840 commits dans 23 dépôts, pratiqué depuis 14,2 ans, 2 autres familles de langages.", "C: 1,840 commits in 23 repos, practised for 14.2 years, 2 other language families."),
        f("C : 1 840 commits dans 23 dépôts depuis mars 2012, dernier push il y a 14 mois (ringbuf). Perl, Fortran aussi dans le code.", "C: 1,840 commits in 23 repos since March 2012, last push 14 months ago (ringbuf). Perl, Fortran in the code too."),
        "ringbuf",
        f("Pour 6 : du code poussé depuis moins de 12 mois.", "For 6: code pushed within 12 months."),
      ),
      code(l, "ringbuf", "ringbuf.c", 4, "4", "4", 8, "assert(rb->head < rb->cap);", f("Pour 9 : un niveau moyen de 4,3 sur 5 (tu as 4), des tests dans la moitié des dépôts actifs.", "For 9: an average level of 4.3 out of 5 (you have 4), tests in half of the active repos.")),
      act(l, 6, "41", "41", 2, actNext(4, 6)),
      own(l, 8, "ringbuf", 612, 96, f(" 14 contributeurs externes.", " 14 outside contributors.")),
      oss(l, 8, 31, f("Un dépôt avec 14 contributeurs externes (ringbuf).", "A repo with 14 outside contributors (ringbuf)."), oss10()),
    ]),
  lowReliability: (l) =>
    finalizeMock([
      eduNone(),
      xpGh(l, 6, 8, xpTop()),
      empNone(),
      stk(
        l,
        2,
        f("Go : 31 commits dans 2 dépôts, pratiqué depuis 3,1 ans.", "Go: 31 commits in 2 repos, practised for 3.1 years."),
        f("Go : 31 commits dans 2 dépôts depuis octobre 2023, dernier push il y a 5 mois (dotfiles-go).", "Go: 31 commits in 2 repos since October 2023, last push 5 months ago (dotfiles-go)."),
        "dotfiles-go",
        f("Pour 4 : 50 commits dans ton langage principal (tu en as 31).", "For 4: 50 commits in your main language (you have 31)."),
      ),
      c("CODE", null, "unproven", "github", f("Aucun dépôt lisible : deux dépôts publics, des dotfiles. Le code est dans des dépôts privés.", "No readable repo: two public repos, dotfiles. The code is in private repos."), {
        next: f("Pour s'ouvrir : un dépôt public avec du code à lire.", "To open up: a public repo with code to read."),
      }),
      act(l, 44, "1 106", "1,106", 6, f("Pour 8 : un dépôt public de 20 commits.", "For 8: a public repo with 20 commits."), [
        f("Activité sans code visible : on voit que ça code, pas ce que ça code.", "Activity, no visible code: it shows coding, not what is coded."),
      ]),
      own(l, 2, "dotfiles-go", 17, 9),
      oss(l, 0, 0, undefined, f("Pour 2 : une PR fusionnée chez les autres.", "For 2: one PR merged into other people's repos.")),
    ]),
  unknownLang: (l) =>
    finalizeMock([
      eduNone(),
      c("XP", null, "unproven", "github", f("Aucune année avec 50 contributions ou plus : rien à estimer.", "No year with 50 contributions or more: nothing to estimate.")),
      empNone(),
      stk(
        l,
        2,
        f("Brainfuck : 3 commits dans 1 dépôt, pratiqué depuis 0,2 an.", "Brainfuck: 3 commits in 1 repo, practised for 0.2 years."),
        f("Brainfuck : 3 commits dans 1 dépôt depuis septembre 2026, dernier push il y a 41 jours (hello-bf).", "Brainfuck: 3 commits in 1 repo since September 2026, last push 41 days ago (hello-bf)."),
        "hello-bf",
        f("Pour 4 : 50 commits dans ton langage principal (tu en as 3).", "For 4: 50 commits in your main language (you have 3)."),
      ),
      c("CODE", null, "unproven", "github", f("Aucun dépôt lu : rien de lisible.", "No repo read: nothing readable.")),
      c("ACT", null, "unproven", "github", f("2 semaines actives sur 52 : GitHub trop mince pour juger.", "2 active weeks out of 52: GitHub too thin to judge.")),
      c("OWN", null, "unproven", "github", f("GitHub trop mince pour juger.", "GitHub too thin to judge.")),
      c("OSS", null, "unproven", "github", f("GitHub trop mince pour juger.", "GitHub too thin to judge.")),
    ]),
};

// --- La fiche déclarative (LinkedIn ou CV) ---------------------------------------------------

/** Ce que déclare le profil de démo : 8,4 ans comptés, une entreprise fondée tenue 3,4 ans, une école de rang A. */
function declaredDrafts(src: "LinkedIn" | "CV", proof?: string, ghRepos?: number): Draft[] {
  const p = proof ? { proof } : {};
  const fr = (s: string) => s.replaceAll("{src}", src);
  return [
    c("EDU", 8, "scored", "linkedin", f("École Halbrune, rang A.", "École Halbrune, tier A."), {
      next: f(
        "Pour 10 : une école de rang S, ou une médaille internationale (olympiade, finale mondiale d'un concours de programmation).",
        "For 10: a tier S school, or an international medal (olympiad, world final of a programming contest).",
      ),
      evidence: { text: f("École Halbrune, rang A.", "École Halbrune, tier A."), publicText: f("École de rang A.", "Tier A school."), source: "linkedin", ...p },
    }),
    c("XP", 9, "scored", "linkedin", f("8,4 ans comptés sur les postes datés : le palier « 8 ans ».", `8.4 years counted on the dated roles: the "8 years" step.`), {
      next: f("Pour 10 : 10 ans comptés. Tu en as 8,4.", "For 10: 10 years counted. You have 8.4."),
      evidence: {
        text: f(
          "14 mois de stage ou d'alternance comptés pour moitié. 41 mois à la tête de Stealth Startup. 55 mois chez Banque Orsay. Junior Halbrune est une association : non compté. Total : 8,4 ans.",
          "14 months of internship or work-study counted at half. 41 months running Stealth Startup. 55 months at Banque Orsay. Junior Halbrune is an association: not counted. Total: 8.4 years.",
        ),
        publicText: f(
          "14 mois de stage ou d'alternance comptés pour moitié. 41 mois à la tête d'une entreprise fondée. 55 mois dans un poste. Un poste d'association : non compté. Total : 8,4 ans.",
          "14 months of internship or work-study counted at half. 41 months running a company they founded. 55 months in a role. An association role: not counted. Total: 8.4 years.",
        ),
        source: "linkedin",
        ...p,
      },
    }),
    c("EMP", 8, "scored", "linkedin", f("Stealth Startup fondée et tenue 3,4 ans.", "Stealth Startup founded and run for 3.4 years."), {
      next: f("Pour 10 : deux ans chez un employeur à forte barre d'embauche, et une trajectoire qui monte ou une équipe encadrée.", "For 10: two years at a high-bar employer, and a rising path or a team led."),
      flags: [f("Équipe encadrée : « recrutement et encadrement d'une équipe de six personnes chez Banque Orsay »", `Team led: "hired and led a team of six at Banque Orsay"`)],
      evidence: {
        text: f(
          "CTO et cofondation, Stealth Startup : depuis juin 2023, 41 mois. Lead developer, Banque Orsay : janvier 2019 – août 2023, 4,6 ans.",
          "CTO and co-founder, Stealth Startup: since June 2023, 41 months. Lead developer, Banque Orsay: January 2019 – August 2023, 4.6 years.",
        ),
        publicText: f("Entreprise fondée : depuis juin 2023, 41 mois. Poste : janvier 2019 – août 2023, 4,6 ans.", "Company founded: since June 2023, 41 months. Role: January 2019 – August 2023, 4.6 years."),
        source: "linkedin",
        ...p,
      },
    }),
    c("STK", 6, "declared", "linkedin", f("6 technos rattachées à une réalisation concrète, dont 3 dans un poste de moins de 2 ans.", "6 technologies tied to a concrete achievement, 3 of them in a role from the last 2 years."), {
      next: f("Au-delà de 6 : la stack se prouve sur GitHub.", "Beyond 6: the stack is proven on GitHub."),
      flags: ghRepos
        ? [
            f(`Stack déclarée, sans trace publique : Kubernetes, Kafka, aucune trace dans ${ghRepos} dépôts.`, `Declared stack, no public trace: Kubernetes, Kafka, no trace in ${ghRepos} repos.`),
            f(fr("{src} en dessous de la vérité : Rust prouvé par le code, absent ") + (src === "CV" ? "du CV." : "de LinkedIn."), `${src} undersells the code: Rust proven by the code, missing from ${src === "CV" ? "the CV" : "LinkedIn"}.`),
          ]
        : [],
      evidence: { text: f("Kubernetes, Kafka, React, Node.js.", "Kubernetes, Kafka, React, Node.js."), publicText: f("Kubernetes, Kafka, React, Node.js.", "Kubernetes, Kafka, React, Node.js."), source: "linkedin", ...p },
    }),
    c("CODE", null, "unproven", "linkedin", f(fr("Le code ne se prouve pas sur {src}."), `Code cannot be proven on ${src}.`)),
    c("ACT", null, "unproven", "linkedin", f(fr("L'activité ne se lit pas sur {src}."), `Activity cannot be read on ${src}.`)),
    c("OWN", 6, "declared", "linkedin", f("4 résultats datés et chiffrés.", "4 dated and quantified outcomes."), {
      next: f("Au-delà de 6 : un projet porté et utilisé, sur GitHub.", "Beyond 6: a project carried and used, on GitHub."),
      evidence: { text: f("4 résultats datés et chiffrés.", "4 dated and quantified outcomes."), publicText: f("4 résultats datés et chiffrés.", "4 dated and quantified outcomes."), source: "linkedin", ...p },
    }),
    c("OSS", null, "unproven", "linkedin", f(fr("Une mention « open source » sur {src} ne donne rien sans trace."), `An "open source" mention on ${src} gives nothing without a trace.`)),
  ];
}

/** La fiche LinkedIn seule, ou CV seul : 75, déclarée, plafond 85 sans code prouvé. */
export function declaredGridMock(src: "LinkedIn" | "CV", proof?: string): Grid {
  return finalizeMock(declaredDrafts(src, proof));
}

/**
 * Les recoupements de la fiche déclarative d'une comparaison, comme le moteur
 * (xpCrossCheck, empCrossCheck, stkCrossCheck) : les années face aux années
 * actives de GitHub, le même employeur sur le profil GitHub, les technos
 * déclarées retrouvées ou sans trace. Les notes ne bougent pas.
 */
function crossChecked(drafts: Draft[], src: "LinkedIn" | "CV", login: string): Draft[] {
  const add = (d: Draft, more: Fact, morePublic: Fact = more, proof?: string): Draft => {
    const ev = d.evidence!;
    const pub = ev.publicText ?? ev.text;
    return {
      ...d,
      evidence: {
        text: f(`${ev.text.fr} ${more.fr}`, `${ev.text.en} ${more.en}`),
        publicText: f(`${pub.fr} ${morePublic.fr}`, `${pub.en} ${morePublic.en}`),
        source: "both",
        ...(proof ? { proof } : ev.proof ? { proof: ev.proof } : {}),
      },
    };
  };
  return drafts.map((d): Draft => {
    if (d.code === "XP")
      return add(
        d,
        f(
          "GitHub : 5 années actives (50 contributions ou plus sur douze mois). Moins d'années de code public que de métier compté.",
          "GitHub: 5 active years (50+ contributions over twelve months). Fewer years of public code than counted work.",
        ),
        undefined,
        gh(login),
      );
    if (d.code === "EMP")
      return {
        ...d,
        evidence: {
          text: f(
            `${src} : CTO et cofondation, Stealth Startup, depuis juin 2023. Profil GitHub, société : Stealth Startup. Même employeur des deux côtés.`,
            `${src}: CTO and co-founder, Stealth Startup, since June 2023. GitHub profile, company: Stealth Startup. Same employer on both sides.`,
          ),
          publicText: f(
            `${src} : entreprise fondée, depuis juin 2023. Profil GitHub : le même employeur, en société. Identité recoupée.`,
            `${src}: company founded, since June 2023. GitHub profile: the same employer, as company. Identity cross-checked.`,
          ),
          source: "both",
          ...(d.evidence?.proof ? { proof: d.evidence.proof } : {}),
        },
      };
    if (d.code === "STK") {
      const text = f(
        `${src} : Kubernetes, React, Node.js, Rust. Dans le code : React, Node.js. Sans trace publique : Kubernetes.`,
        `${src}: Kubernetes, React, Node.js, Rust. In the code: React, Node.js. No public trace: Kubernetes.`,
      );
      return { ...d, evidence: { text, publicText: text, source: "both", proof: gh(login) } };
    }
    return d;
  });
}

/** « Déclaré : une entreprise fondée. » : la pièce du côté déclaratif, après celle de GitHub (comme le moteur). */
const declaredSide = (x: Fact): Fact => f(`Déclaré : ${x.fr.charAt(0).toLowerCase()}${x.fr.slice(1)}`, `Declared: ${x.en.charAt(0).toLowerCase()}${x.en.slice(1)}`);

/** La pièce retenue au dossier, comme caseEvidence : la stack prouvée puis le recoupement déclaré ; l'ownership noté des deux côtés, face à face. */
function caseEvidence(code: CriterionCode, tookProven: boolean, d: GridCriterion, p: GridCriterion): GridCriterion["evidence"] {
  const de = d.evidence;
  const pe = p.evidence;
  const chosen = tookProven ? pe : de;
  if (!pe || !de) return chosen;
  const pair = (second: Fact, secondPublic?: Fact): GridCriterion["evidence"] => ({
    text: f(`${pe.text.fr} ${second.fr}`, `${pe.text.en} ${second.en}`),
    ...(secondPublic ? { publicText: f(`${pe.text.fr} ${secondPublic.fr}`, `${pe.text.en} ${secondPublic.en}`) } : {}),
    source: "both",
    ...(pe.proof ? { proof: pe.proof } : {}),
  });
  if (code === "STK" && tookProven && p.score !== null && de.source === "both") return pair(de.text, de.publicText);
  if (code === "OWN" && p.score !== null && d.score !== null) return pair(declaredSide(de.text), de.publicText ? declaredSide(de.publicText) : undefined);
  return chosen;
}

/** La note du dossier, comme caseGrid : LinkedIn pour l'école, l'expérience et le parcours ; GitHub pour le reste ; la plus haute pour l'ownership. */
function caseOf(declared: Grid, proven: Grid): Grid {
  const pick = (code: CriterionCode) => ({ d: declared.criteria.find((x) => x.code === code)!, p: proven.criteria.find((x) => x.code === code)! });
  const strip = ({ counted: _c, ...rest }: GridCriterion): Draft => rest;
  return finalizeMock(
    CRITERION_CODES.map((code): Draft => {
      const { d, p } = pick(code);
      const has = (x: GridCriterion) => x.score !== null;
      let chosen: GridCriterion;
      let source: GridSource;
      if (code === "EDU") chosen = has(d) && (!has(p) || d.score! >= p.score!) ? d : has(p) ? p : d;
      else if (code === "XP" || code === "EMP") chosen = has(d) || !has(p) ? d : p;
      else if (code === "OWN") chosen = has(p) && (!has(d) || p.score! >= d.score!) ? p : has(d) ? d : p;
      else chosen = code === "STK" && !has(p) && has(d) ? d : p;
      if (code === "OWN") source = has(p) && has(d) ? "both" : chosen.source;
      else source = chosen.source;
      const seen = new Set<string>();
      const flags = [...d.flags, ...p.flags].filter((x) => !seen.has(x.fr) && seen.add(x.fr));
      const evidence = caseEvidence(code, chosen === p, d, p);
      const { evidence: _e, ...rest } = strip(chosen);
      return { ...rest, source, declared: d.score, proven: p.score, flags, ...(evidence ? { evidence } : {}) };
    }),
  );
}

/**
 * Les trois grilles d'une comparaison de démo : la fiche déclarée, la fiche GitHub
 * (celle de leamd), et la note du dossier. `emptyGithub` : face à un GitHub
 * « dossier vide » (celui de x) — rien à recouper, le code n'est pas prouvé.
 */
export function comparisonGridsMock(src: "LinkedIn" | "CV", login: string, proof?: string, emptyGithub = false): { cv: Grid; github: Grid; grid: Grid } {
  if (emptyGithub) {
    const cv = finalizeMock(declaredDrafts(src, proof));
    const github = GITHUB.unknownLang(login);
    return { cv, github, grid: caseOf(cv, github) };
  }
  const cv = finalizeMock(crossChecked(declaredDrafts(src, proof, 31), src, login));
  const github = GITHUB.gold(login);
  return { cv, github, grid: caseOf(cv, github) };
}

/** La grille d'une fiche GitHub de démo, par clé de fixture ; aucune pour les fiches de personnes réelles. */
export function githubGridMock(key: string, login: string): Grid | undefined {
  return GITHUB[key]?.(login);
}
