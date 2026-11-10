// Barème de recrutement (docs/bareme-recrutement.md §3 et §4, SPEC §18.37) :
// huit critères, chacun une note entière sur 10 lue dans sa table de niveaux
// (data/grid.json) — le niveau le plus haut dont toute la ligne est remplie,
// sans base, sans ajout, sans retrait — et la note générale, moyenne pondérée
// des critères comptés, avec les quatre règles du §4 et rien d'autre.
//
// Pur et déterministe, sans réseau : « maintenant » est donné par l'appelant.
// Les données ajoutées au §18.37
// (destination des PR, type de contrat, nature et type d'employeur d'un poste,
// signaux de sélection, fait d'encadrement, fichiers d'agent, site d'un dépôt)
// sont lues sous leurs noms typés, et facultatives : les faits et lectures
// d'avant ne les ont pas, leur niveau reste alors fermé.
// Les chefs d'accusation (`flags`) ne touchent jamais une note.

import type { CodeReadingResult, CvReading, EmployerType, RoleKind as CvRoleKind, SelectionKind } from "../../../shared/readings";
import { CRITERION_CODES, type CriterionCode, type Fact, type Grid, type GridCriterion, type GridSource } from "../../../shared/types";
import type { ExternalMergedPR, GithubFacts, GithubRepo } from "../github/facts";
import type { LinkedinRole } from "../linkedinProfile/profile";
import { df, nf } from "./common";
import { GRID, type GridRoleKind } from "./config";
import { isTutorialRepo, type GithubMetrics } from "./derive";
import { normSchool, schoolListNames, schoolTier } from "./school";

const DAY = 86_400_000;
const YEAR = 365.25 * DAY;
const MONTH = YEAR / 12;

const f = (fr: string, en: string): Fact => ({ fr, en });
/** Minuscules, sans accents, espaces réduites ; la ponctuation reste. */
const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const rx = (p: string) => new RegExp(p, "iu");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordIn = (needle: string, hay: string) => new RegExp(`(?<![\\p{L}\\p{N}])${esc(needle)}(?![\\p{L}\\p{N}])`, "u").test(hay);

const INTERN_RE = rx(GRID.XP.internshipPattern);
const ASSOC_RE = rx(GRID.XP.associationPattern);
const SCHOOL_ROLE_EXCEPT_RE = rx(GRID.XP.schoolRoleExceptPattern);
const SENIOR_RE = rx(GRID.XP.seniorTitlePattern);
const FOUNDER_RE = rx(GRID.EMP.founderPattern);
const RANKS = GRID.EMP.rankPatterns.map((r) => ({ rank: r.rank, re: rx(r.pattern) }));
const EDU_GITHUB_RE = rx(GRID.EDU.githubPattern);
const IGNORED_LANGS = new Set(GRID.STK.ignoredLanguages);
const FAMILY_OF = new Map<string, string>();
for (const [family, langs] of Object.entries(GRID.STK.families)) if (!family.startsWith("_")) for (const l of langs) FAMILY_OF.set(l, family);

// --- Mois et durées ----------------------------------------------------------

const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "AAAA-MM" → index de mois (année × 12 + mois − 1), sinon null. */
export function monthIndex(s: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})/.exec(s ?? "");
  if (!m) return null;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? Number(m[1]) * 12 + month - 1 : null;
}
const nowMonth = (now: number) => {
  const d = new Date(now);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};
const monthName = (i: number): Fact => f(`${MONTHS_FR[i % 12]} ${Math.floor(i / 12)}`, `${MONTHS_EN[i % 12]} ${Math.floor(i / 12)}`);
const isoMonth = (iso: string): number => {
  const d = new Date(Date.parse(iso));
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};

function years(y: number): Fact {
  const v = Math.round(y * 10) / 10;
  return f(`${df(v, "fr")} an${v >= 2 ? "s" : ""}`, `${df(v, "en")} year${v === 1 ? "" : "s"}`);
}
function months(n: number): Fact {
  return f(`${n} mois`, `${n} month${n === 1 ? "" : "s"}`);
}
/** Moins de deux ans en mois, au-delà en années. */
const duration = (n: number): Fact => (n < 24 ? months(n) : years(n / 12));
/** Depuis quand, en jours de calendrier (UTC) : un push de la veille au soir est « hier ». */
const ago = (now: number, then: number): Fact => {
  const ms = now - then;
  const d = Math.max(0, Math.floor(now / DAY) - Math.floor(then / DAY));
  if (d === 0) return f("aujourd'hui", "today");
  if (d === 1) return f("hier", "yesterday");
  if (d < 60) return f(`il y a ${d} jours`, `${d} days ago`);
  const mo = Math.floor(ms / MONTH);
  return f(`il y a ${mo} mois`, `${mo} month${mo === 1 ? "" : "s"} ago`);
};
/** « de Sejo », « d'Azerit ». */
const de = (name: string) => (/^[aeiouyàâäéèêëîïôöûüœæ]/i.test(name) ? `d'${name}` : `de ${name}`);
/** « 1,1 an compté », « 2 ans comptés ». */
const counted = (y: number) => (Math.round(y * 10) / 10 >= 2 ? "comptés" : "compté");
const join = (parts: Fact[], sep = " "): Fact => f(parts.map((p) => p.fr).join(sep), parts.map((p) => p.en).join(sep));

// --- Entrées -------------------------------------------------------------------

/**
 * Un poste daté, tel que le profil LinkedIn le range ou tel que la lecture du CV
 * le relève. Les champs du profil sont ceux de `LinkedinRole`, sous les mêmes
 * noms : un champ renommé côté collecte ne compile plus ici.
 */
export type DatedRole = Pick<LinkedinRole, "title" | "company" | "start" | "end" | "contract"> & {
  description?: string;
  /** Nature du poste lue par l'IA (`CvRole.kind`), rattachée au poste du profil par l'entreprise et la date de début. */
  kind?: CvRoleKind;
  /** Type d'employeur lu par l'IA (`CvRole.employer_type`). */
  employerType?: EmployerType;
};

/** Ce qui déclare : la lecture du CV ou du LinkedIn, et les champs rangés du profil. */
export interface DeclaredInput {
  reading: CvReading;
  /** Postes datés : ceux du profil LinkedIn quand il y en a, sinon ceux relevés dans le CV. */
  roles: DatedRole[];
  skills: string[];
  /** Le nom de la source dans les textes. */
  label: "LinkedIn" | "CV";
  /** Page publique du profil (la pièce), si elle existe. */
  url?: string;
  /** « Maintenant », en ms : la fin d'un poste en cours. */
  now: number;
  /** Employeurs à forte barre d'embauche (liste hors dépôt, tâche 1). Vide : les niveaux 8 et 10 du parcours ne s'ouvrent que par les startups. */
  highBar?: string[];
}

/** Les champs rangés d'un profil LinkedIn qui servent au barème (ni lieu, ni photo, ni contact). */
export interface DeclaredProfile {
  roles?: DatedRole[];
  education?: { school: string }[];
  skills?: string[];
  /** Adresse publique du profil. */
  url?: string;
}

/**
 * Les postes du profil, avec ce que la lecture IA en dit : la nature du poste
 * (`kind`) quand un poste lu a la même entreprise et la même date de début ; le
 * type d'employeur sur la même règle, sinon celui d'un poste lu chez le même
 * employeur (c'est un trait de l'employeur, pas du poste).
 */
function withReading(roles: DatedRole[], reading: CvReading): DatedRole[] {
  const read = reading.roles.filter((r) => r.company);
  return roles.map((role) => {
    if (!role) return role;
    const c = norm(role.company);
    const same = read.find((r) => norm(r.company) === c && r.start === role.start && role.start !== null);
    const kind = role.kind ?? same?.kind;
    const employerType = role.employerType ?? same?.employer_type ?? read.find((r) => norm(r.company) === c && r.employer_type)?.employer_type;
    return { ...role, ...(kind ? { kind } : {}), ...(employerType ? { employerType } : {}) };
  });
}

/**
 * L'entrée déclarative : les postes datés du profil LinkedIn quand il y en a
 * (ils arrivent rangés, sans passer par l'IA), sinon ceux relevés dans le CV.
 */
export function declaredInput(reading: CvReading, opts: { profile?: DeclaredProfile; now: number; highBar?: string[] }): DeclaredInput {
  const p = opts.profile;
  const roles: DatedRole[] = p?.roles?.length
    ? withReading(p.roles, reading)
    : reading.roles.map((r) => ({
        title: r.title,
        company: r.company,
        start: r.start,
        end: r.end,
        description: r.responsibilities.join(" "),
        ...(r.kind ? { kind: r.kind } : {}),
        ...(r.employer_type ? { employerType: r.employer_type } : {}),
      }));
  return {
    reading,
    roles,
    skills: p?.skills ?? [],
    label: p ? "LinkedIn" : "CV",
    ...(p?.url ? { url: p.url } : {}),
    now: opts.now,
    ...(opts.highBar ? { highBar: opts.highBar } : {}),
  };
}

/** Ce qui prouve : les faits GitHub, leurs mesures et la lecture du code. */
export interface GithubInput {
  facts: GithubFacts;
  m: GithubMetrics;
  ai: CodeReadingResult | null;
}

// --- Briques -------------------------------------------------------------------

type Draft = Omit<GridCriterion, "counted">;

function crit(code: CriterionCode, p: Omit<Draft, "code" | "flags"> & { flags?: Fact[] }): Draft {
  return { code, ...p, flags: p.flags ?? [] };
}
const unproven = (code: CriterionCode, source: GridSource, reached: Fact, flags: Fact[] = []): Draft => crit(code, { score: null, state: "unproven", source, reached, flags });
const missing = (code: CriterionCode, source: GridSource, reached: Fact, next?: Fact): Draft =>
  crit(code, { score: null, state: "missing", source, reached, ...(next ? { next } : {}) });

const repoUrl = (r: Pick<GithubRepo, "fullName">) => `https://github.com/${r.fullName}`;
const profileUrl = (login: string) => `https://github.com/${login}`;

/** GitHub trop mince pour juger : moins de 3 dépôts publics et aucun de 10 commits. */
export function thinGithub(m: GithubMetrics): boolean {
  return m.repoCount < GRID.thinGithub.minRepos && (m.maxRepoCommits ?? 0) < GRID.thinGithub.repoCommits;
}

// --- Les postes ------------------------------------------------------------------

/** Comment un poste compte (§3.2) : en plein, à moitié (stage, alternance), pour rien (association, bénévolat, projet personnel). */
export type RoleKind = GridRoleKind;

export interface RoleInfo {
  role: DatedRole;
  kind: RoleKind;
  founder: boolean;
  /** Index de mois, null si non daté. */
  start: number | null;
  end: number | null;
  /** Mois tenus (fin − début), 0 si non daté. */
  months: number;
  companyKey: string;
  employerType?: EmployerType;
}

/**
 * Une association d'école : l'employeur porte le nom d'une école de la liste et
 * un mot d'association (« Centrale Méditerranée Finance », « Junior ISEP »), sauf
 * un poste de recherche ou d'enseignement. La liste, pas la formation du profil :
 * ajouter ou retirer une école ne change jamais l'expérience.
 */
const SCHOOL_KEYS = schoolListNames()
  .filter((n) => !n.includes("("))
  .map(normSchool)
  .filter((k) => k.replace(/\s/g, "").length >= 4);
const SCHOOL_ASSOC_WORDS_RE = rx(GRID.XP.schoolAssociationWords);

/**
 * Stage, association, projet personnel ou vrai poste, dans cet ordre de preuve :
 * 1. l'IA dit association étudiante ou bénévolat : rien, quel que soit le contrat ;
 * 2. le contrat du fournisseur dit stage ou alternance : à moitié ;
 * 3. le code reconnaît une association (mot d'association, ou nom d'une école de la liste) ;
 * 4. l'intitulé dit stage ou alternance ;
 * 5. le contrat dit salarié, temps partiel ou freelance : un vrai poste, même si l'IA dit autre chose ;
 * 6. sinon, la nature lue par l'IA (stage, projet personnel, poste) ; sans elle, un vrai poste.
 */
export function roleKind(role: DatedRole): RoleKind {
  const ai: RoleKind | undefined = role.kind ? GRID.XP.byAiKind[role.kind] : undefined;
  if (ai === "association") return "association";
  const contract: RoleKind | undefined = role.contract ? GRID.XP.byContract[role.contract] : undefined;
  if (contract === "internship") return "internship";
  const title = norm(role.title);
  const company = norm(role.company);
  if (ASSOC_RE.test(title) || ASSOC_RE.test(company)) return "association";
  const companyKey = normSchool(role.company);
  if (companyKey && SCHOOL_ASSOC_WORDS_RE.test(companyKey) && !SCHOOL_ROLE_EXCEPT_RE.test(title) && SCHOOL_KEYS.some((k) => wordIn(k, companyKey)))
    return "association";
  if (INTERN_RE.test(title)) return "internship";
  return contract ?? ai ?? "full";
}

export function analyzeRoles(roles: DatedRole[], now: number): RoleInfo[] {
  const nowIdx = nowMonth(now);
  const seen = new Set<string>();
  const out: RoleInfo[] = [];
  for (const role of roles) {
    if (!role || !(role.title || role.company)) continue;
    const key = `${norm(role.title)}|${norm(role.company)}|${role.start ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const start = monthIndex(role.start);
    let end = role.end ? monthIndex(role.end) : start === null ? null : nowIdx;
    if (end !== null && end > nowIdx) end = nowIdx;
    const dated = start !== null && end !== null && start <= nowIdx;
    const companyKey = norm(role.company);
    out.push({
      role,
      kind: roleKind(role),
      founder: FOUNDER_RE.test(norm(role.title)),
      start: dated ? start : null,
      end: dated ? end : null,
      months: dated && end! > start! ? end! - start! : 0,
      companyKey,
      ...(role.employerType ? { employerType: role.employerType } : {}),
    });
  }
  return out;
}

/** Mois comptés : chaque mois une fois, au taux du poste le plus fort ce mois-là (stage 50 %, association 0 %). */
export function countedMonths(infos: RoleInfo[]): number {
  const share = GRID.XP.share;
  const best = new Map<number, number>();
  for (const r of infos) {
    if (r.start === null || r.end === null) continue;
    const w = share[r.kind];
    if (w <= 0) continue;
    for (let i = r.start; i < r.end; i++) best.set(i, Math.max(best.get(i) ?? 0, w));
  }
  let total = 0;
  for (const w of best.values()) total += w;
  return total;
}

/** Mois couverts par ces postes, chacun une fois. */
function unionMonths(infos: RoleInfo[]): number {
  const s = new Set<number>();
  for (const r of infos) if (r.start !== null && r.end !== null) for (let i = r.start; i < r.end; i++) s.add(i);
  return s.size;
}

const levelFor = (y: number) => GRID.XP.levels.find((l) => y >= l.years) ?? GRID.XP.levels[GRID.XP.levels.length - 1];

// --- EDU : école et sélection ------------------------------------------------------

interface Signal {
  kind: SelectionKind;
  quote: string;
}

/** Signaux de sélection lus avec leur extrait (`CvReading.selection_signals`) : sans extrait, rien. */
function selectionSignals(reading: CvReading): Signal[] {
  return (reading.selection_signals ?? [])
    .map((s) => ({ kind: s.kind, quote: (s.quote ?? "").trim() }))
    .filter((s) => s.quote && GRID.EDU.selection[s.kind] !== undefined);
}

const SELECTION_TEXT: Record<SelectionKind, Fact> = {
  international_medal: f("médaille internationale", "international medal"),
  ranked_contest: f("classement dans un concours", "ranking in a competition"),
  hackathon_prize: f("prix de hackathon", "hackathon prize"),
  selective_programme: f("programme sélectif", "selective programme"),
  contest_entry: f("hackathon ou concours, sans classement", "hackathon or competition, unranked"),
};

const EDU_NEXT: Record<number, Fact> = {
  4: f("Pour 6 : une école de rang B.", "For 6: a tier B school."),
  6: f(
    "Pour 8 : une école de rang A, ou une sélection prouvée hors école (classement dans un concours, prix de hackathon, programme sélectif).",
    "For 8: a tier A school, or a proven selection outside school (competition ranking, hackathon prize, selective programme).",
  ),
  8: f(
    "Pour 10 : une école de rang S, ou une médaille internationale (olympiade, finale mondiale d'un concours de programmation).",
    "For 10: a tier S school, or an international medal (olympiad, world final of a programming contest).",
  ),
};

export function eduDeclared(d: DeclaredInput): Draft {
  const r = d.reading;
  const school = schoolTier(r.school_name, r.school_tier);
  const schoolScore = school.tier === "none" ? null : GRID.EDU.tiers[school.tier];
  const signals = selectionSignals(r);
  const best = signals.reduce<Signal | null>((b, s) => (!b || GRID.EDU.selection[s.kind] > GRID.EDU.selection[b.kind] ? s : b), null);
  const signalScore = best ? GRID.EDU.selection[best.kind] : null;
  if (schoolScore === null && signalScore === null)
    return missing(
      "EDU",
      "linkedin",
      f("Ni école de tech, ni sélection citée : sans objet, hors moyenne.", "No tech school, no selection on file: not applicable, left out of the average."),
    );
  const name = r.school_name.trim();
  const schoolFact = schoolScore !== null ? f(`${name}, rang ${school.tier}.`, `${name}, tier ${school.tier}.`) : null;
  const signalFact = best ? f(`Sélection : ${SELECTION_TEXT[best.kind].fr}.`, `Selection: ${SELECTION_TEXT[best.kind].en}.`) : null;
  const useSchool = schoolScore !== null && (signalScore === null || schoolScore >= signalScore);
  const score = useSchool ? schoolScore! : signalScore!;
  const reached = useSchool ? schoolFact! : signalFact!;
  const evidence = useSchool
    ? { text: schoolFact!, source: "linkedin" as const, ...(d.url ? { proof: d.url } : {}) }
    : { text: f(`« ${best!.quote.slice(0, 120)} »`, `"${best!.quote.slice(0, 120)}"`), source: "linkedin" as const, ...(d.url ? { proof: d.url } : {}) };
  return crit("EDU", { score, state: "scored", source: "linkedin", reached, ...(EDU_NEXT[score] ? { next: EDU_NEXT[score] } : {}), evidence });
}

/** Un dépôt qui dit hackathon ou concours : une participation sans classement. */
export function eduGithub(g: GithubInput): Draft {
  const hit = g.facts.repos.find((r) => EDU_GITHUB_RE.test(norm([r.name.replace(/[-_]/g, " "), r.description ?? "", ...r.topics].join(" "))));
  if (!hit)
    return missing("EDU", "github", f("L'école se lit sur LinkedIn ou le CV : sans objet ici.", "School is read on LinkedIn or the CV: not applicable here."));
  return crit("EDU", {
    score: GRID.EDU.githubScore,
    state: "scored",
    source: "github",
    reached: f("Un hackathon ou un concours, sans classement cité.", "A hackathon or a competition, no ranking on file."),
    next: f("Pour 6 : une école de rang B, sur LinkedIn.", "For 6: a tier B school, on LinkedIn."),
    evidence: { text: f(`Dépôt ${hit.name} : hackathon ou concours.`, `Repo ${hit.name}: hackathon or competition.`), source: "github", proof: repoUrl(hit) },
  });
}

// --- XP : expérience ----------------------------------------------------------------

/** « Atelier perso est un projet personnel : non compté. » */
const projectFact = (r: RoleInfo): Fact => {
  const name = r.role.company || r.role.title;
  return f(`${name} est un projet personnel : non compté.`, `${name} is a personal project: not counted.`);
};

export function xpDeclared(d: DeclaredInput): Draft {
  const infos = analyzeRoles(d.roles, d.now);
  const dated = infos.filter((r) => r.start !== null);
  const total = countedMonths(infos);
  const proof = d.url ? { proof: d.url } : {};
  const src = d.label;

  // Senior sur parole : l'intitulé d'un poste en cours (ou du plus récent) dit senior, lead, staff ou head, avec moins de 4 ans comptés.
  const flagsFor = (y: number): Fact[] => {
    const current = infos.filter((r) => r.kind === "full" && r.role.end === null);
    const latest = [...infos].filter((r) => r.kind === "full").sort((a, b) => (b.start ?? -1) - (a.start ?? -1))[0];
    const titled = [...current, ...(latest ? [latest] : [])].find((r) => SENIOR_RE.test(norm(r.role.title)));
    return titled && y < GRID.XP.seniorOnPaperBelowYears
      ? [f(`Senior sur parole : « ${titled.role.title} », ${years(y).fr} ${counted(y)}.`, `Senior on paper: "${titled.role.title}", ${years(y).en} counted.`)]
      : [];
  };

  if (!dated.length) {
    const claimed = d.reading.years_declared;
    if (claimed > 0) {
      const lvl = levelFor(claimed);
      const score = Math.min(lvl.score, GRID.XP.claimedCap);
      return crit("XP", {
        score,
        state: "declared",
        source: "linkedin",
        reached: f(`${years(claimed).fr} affirmés, sans aucun poste daté : table arrêtée à ${GRID.XP.claimedCap}.`, `${years(claimed).en} claimed, no dated role: table stops at ${GRID.XP.claimedCap}.`),
        next: f(`Pour aller plus haut : des postes datés sur ${src}.`, `To go higher: dated roles on ${src}.`),
        flags: flagsFor(claimed),
        evidence: { text: f(`${src}, années affirmées.`, `${src}, years claimed.`), source: "linkedin", ...proof },
      });
    }
    return missing("XP", "linkedin", f("Aucun poste daté.", "No dated role."), f(`Pour 2 : un premier poste daté sur ${src}.`, `For 2: a first dated role on ${src}.`));
  }
  if (total <= 0) {
    const a = infos.find((r) => r.kind === "association");
    const p = infos.find((r) => r.kind === "project");
    return missing(
      "XP",
      "linkedin",
      a
        ? f(`Aucun mois compté : ${a.role.company} est une association, l'association et le bénévolat ne comptent pas.`, `No month counted: ${a.role.company} is an association; associations and volunteering do not count.`)
        : p
          ? f(`Aucun mois compté : ${projectFact(p).fr}`, `No month counted: ${projectFact(p).en}`)
          : f("Aucun mois compté sur les postes datés.", "No month counted on the dated roles."),
      f("Pour 2 : un premier poste ou un stage daté.", "For 2: a first dated job or internship."),
    );
  }

  const y = total / 12;
  const lvl = levelFor(y);
  const nextLvl = [...GRID.XP.levels].reverse().find((l) => l.score > lvl.score);
  // La pièce : stages à moitié, postes, associations non comptées, total.
  const parts: Fact[] = [];
  const interns = infos.filter((r) => r.kind === "internship");
  const im = unionMonths(interns);
  if (im) parts.push(f(`${im} mois de stage ou d'alternance comptés pour moitié.`, `${im} month${im === 1 ? "" : "s"} of internship or work-study counted at half.`));
  const fulls = infos.filter((r) => r.kind === "full" && r.months > 0).sort((a, b) => (b.start ?? 0) - (a.start ?? 0));
  for (const r of fulls.slice(0, 2))
    parts.push(
      r.founder
        ? f(`${r.months} mois à la tête ${de(r.role.company)}.`, `${r.months} month${r.months === 1 ? "" : "s"} running ${r.role.company}.`)
        : f(`${r.months} mois chez ${r.role.company}.`, `${r.months} month${r.months === 1 ? "" : "s"} at ${r.role.company}.`),
    );
  if (fulls.length > 2) parts.push(f(`${fulls.length - 2} autre${fulls.length > 3 ? "s" : ""} poste${fulls.length > 3 ? "s" : ""}.`, `${fulls.length - 2} more role${fulls.length > 3 ? "s" : ""}.`));
  const assoc = infos.find((r) => r.kind === "association");
  if (assoc) parts.push(f(`${assoc.role.company} est une association : non compté.`, `${assoc.role.company} is an association: not counted.`));
  const project = infos.find((r) => r.kind === "project");
  if (project) parts.push(projectFact(project));
  parts.push(f(`Total : ${years(y).fr}.`, `Total: ${years(y).en}.`));

  return crit("XP", {
    score: lvl.score,
    state: "scored",
    source: "linkedin",
    reached: f(`${years(y).fr} ${counted(y)} sur les postes datés : le palier « ${lvl.years ? years(lvl.years).fr : "moins d'un an"} ».`, `${years(y).en} counted on the dated roles: the "${lvl.years ? years(lvl.years).en : "under a year"}" step.`),
    ...(nextLvl
      ? { next: f(`Pour ${nextLvl.score} : ${years(nextLvl.years).fr} ${counted(nextLvl.years)}. Tu en as ${df(y, "fr")}.`, `For ${nextLvl.score}: ${years(nextLvl.years).en} counted. You have ${df(y, "en")}.`) }
      : {}),
    flags: flagsFor(y),
    evidence: { text: join(parts), source: "linkedin", ...proof },
  });
}

/** Sans LinkedIn : les années actives sur GitHub (douze mois avec 50 contributions ou plus), arrêtées à 8, « estimée ». */
export function xpGithub(g: GithubInput): Draft {
  const { facts, m } = g;
  const byYear = facts.activityByYear;
  if (!byYear) return unproven("XP", "github", f("Contributions par année indisponibles : rien à estimer.", "Contributions per year unavailable: nothing to estimate."));
  const min = GRID.XP.githubActiveYearContributions;
  const active = byYear.filter((y) => y.contributions >= min).length;
  if (thinGithub(m) || active === 0)
    return unproven(
      "XP",
      "github",
      f(`Aucune année avec ${min} contributions ou plus : rien à estimer.`, `No year with ${min} contributions or more: nothing to estimate.`),
    );
  const lvl = levelFor(active);
  const score = Math.min(lvl.score, GRID.XP.githubCap);
  const nextLvl = score < GRID.XP.githubCap ? [...GRID.XP.levels].reverse().find((l) => l.score > score) : undefined;
  const yrs = f(`${active} année${active > 1 ? "s" : ""} active${active > 1 ? "s" : ""}`, `${active} active year${active > 1 ? "s" : ""}`);
  return crit("XP", {
    score,
    state: "scored",
    source: "github",
    reached: f(
      `Estimée : ${yrs.fr} sur GitHub (${min} contributions ou plus sur douze mois), table arrêtée à ${GRID.XP.githubCap}.`,
      `Estimated: ${yrs.en} on GitHub (${min}+ contributions over twelve months), table stops at ${GRID.XP.githubCap}.`,
    ),
    next: nextLvl
      ? f(`Pour ${nextLvl.score} : ${nextLvl.years} années actives. Tu en as ${active}. Ou des postes datés sur LinkedIn.`, `For ${nextLvl.score}: ${nextLvl.years} active years. You have ${active}. Or dated roles on LinkedIn.`)
      : f("Pour aller plus haut : des postes datés sur LinkedIn.", "To go higher: dated roles on LinkedIn."),
    evidence: { text: f(`${yrs.fr} sur les contributions par année.`, `${yrs.en} in the contributions per year.`), source: "github", proof: profileUrl(facts.login) },
  });
}

// --- EMP : parcours et employeurs ---------------------------------------------------

function titleRank(title: string): number {
  const t = norm(title);
  return RANKS.find((r) => r.re.test(t))?.rank ?? GRID.EMP.defaultRank;
}

function isHighBar(company: string, list: string[]): boolean {
  const c = norm(company);
  return !!c && list.some((e) => {
    const k = norm(e);
    return k.length >= 2 && wordIn(k, c);
  });
}

/** Le fait d'encadrement lu avec son extrait (`CvReading.management_fact`), "" sans fait. */
function managementQuote(r: CvReading): string {
  return (r.management_fact?.quote ?? "").trim();
}

export function empDeclared(d: DeclaredInput): Draft {
  const src = d.label;
  const proof = d.url ? { proof: d.url } : {};
  // Une association, un bénévolat ou un projet personnel ne sont pas des postes.
  const infos = analyzeRoles(d.roles, d.now).filter((r) => r.kind === "full" || r.kind === "internship");
  if (!infos.length) return missing("EMP", "linkedin", f("Aucun poste.", "No role."), f("Pour 2 : un premier poste ou un stage.", "For 2: a first job or internship."));
  const L = GRID.EMP.levels;
  const lv = (s: number) => L.find((x) => x.score === s)!;
  const highBar = d.highBar ?? [];
  const product = new Set(GRID.EMP.productTypes);

  // Mois par employeur, postes hors stage réunis.
  interface Emp {
    name: string;
    months: number;
    founder: boolean;
    /** Un poste de l'employeur est en cours. */
    current: boolean;
    product: boolean;
    startup: boolean;
    highBar: boolean;
  }
  const fullRoles = infos.filter((r) => r.kind === "full");
  const byKey = new Map<string, RoleInfo[]>();
  for (const r of fullRoles) byKey.set(r.companyKey, [...(byKey.get(r.companyKey) ?? []), r]);
  const emps: Emp[] = [...byKey.values()].map((rs) => {
    const type = rs.find((r) => r.employerType)?.employerType ?? "";
    const hb = isHighBar(rs[0].role.company, highBar);
    return {
      name: rs[0].role.company || rs[0].role.title,
      months: unionMonths(rs),
      founder: rs.some((r) => r.founder),
      current: rs.some((r) => r.role.end === null && r.start !== null),
      startup: product.has(type),
      product: product.has(type) || hb,
      highBar: hb,
    };
  });
  const top = (xs: Emp[]) => xs.reduce<Emp | null>((b, e) => (!b || e.months > b.months ? e : b), null);
  const founded = emps.filter((e) => e.founder);
  const bestFounded = top(founded);
  const currentFounded = top(founded.filter((e) => e.current));
  const bestFull = top(emps);
  const bestHigh = top(emps.filter((e) => e.highBar));
  const bestProduct = top(emps.filter((e) => e.product));
  const bestStartup = top(emps.filter((e) => e.startup));
  const interns = infos.filter((r) => r.kind === "internship");
  const datedFull = fullRoles.filter((r) => r.start !== null).sort((a, b) => a.start! - b.start!);
  const rise = datedFull.some((a, i) => datedFull.slice(i + 1).some((b) => b.start! > a.start! && titleRank(b.role.title) > titleRank(a.role.title)));
  const team = managementQuote(d.reading);

  let score: number;
  let reached: Fact;
  if (bestHigh && bestHigh.months >= lv(10).highBarMonths! && (rise || team)) {
    score = 10;
    reached = f(
      `${duration(bestHigh.months).fr} chez ${bestHigh.name}, employeur à forte barre d'embauche, et ${rise ? "une trajectoire qui monte" : "une équipe encadrée"}.`,
      `${duration(bestHigh.months).en} at ${bestHigh.name}, a high-bar employer, and ${rise ? "a rising path" : "a team led"}.`,
    );
  } else if (bestProduct && bestProduct.months >= lv(8).productMonths!) {
    score = 8;
    reached = f(`${duration(bestProduct.months).fr} dans une équipe produit exigeante : ${bestProduct.name}.`, `${duration(bestProduct.months).en} in a demanding product team: ${bestProduct.name}.`);
  } else if (bestFounded && bestFounded.months >= lv(8).foundedMonths!) {
    score = 8;
    reached = f(`${bestFounded.name} fondée et tenue ${duration(bestFounded.months).fr}.`, `${bestFounded.name} founded and run for ${duration(bestFounded.months).en}.`);
  } else if (bestFull && bestFull.months >= lv(6).roleMonths!) {
    score = 6;
    reached = f(`Un poste tenu ${duration(bestFull.months).fr} : ${bestFull.name}.`, `A role held for ${duration(bestFull.months).en}: ${bestFull.name}.`);
  } else if (bestStartup && bestStartup.months >= lv(6).productStartupMonths!) {
    score = 6;
    reached = f(`${duration(bestStartup.months).fr} dans une startup de produit : ${bestStartup.name}.`, `${duration(bestStartup.months).en} in a product startup: ${bestStartup.name}.`);
  } else if (bestFounded && bestFounded.months >= lv(6).foundedMonths!) {
    score = 6;
    reached = f(`${bestFounded.name} fondée et tenue ${duration(bestFounded.months).fr}.`, `${bestFounded.name} founded and run for ${duration(bestFounded.months).en}.`);
  } else if (founded.length) {
    score = 4;
    reached =
      founded.length === 1
        ? f(`Une entreprise fondée, tenue ${duration(bestFounded!.months).fr}.`, `One company founded, run for ${duration(bestFounded!.months).en}.`)
        : f(`${founded.length} entreprises fondées, la plus longue tenue ${duration(bestFounded!.months).fr}.`, `${founded.length} companies founded, the longest run for ${duration(bestFounded!.months).en}.`);
  } else if (fullRoles.length) {
    score = 4;
    reached = f(`Un vrai poste, hors stage : ${bestFull!.name}, ${duration(bestFull!.months).fr}.`, `A real role, not an internship: ${bestFull!.name}, ${duration(bestFull!.months).en}.`);
  } else if (interns.length >= lv(4).internships!) {
    score = 4;
    reached = f(`${interns.length} stages.`, `${interns.length} internships.`);
  } else {
    score = 2;
    reached = f("Un seul stage.", "A single internship.");
  }

  let next: Fact | undefined;
  if (score === 2) next = f("Pour 4 : un vrai poste hors stage, une entreprise fondée, ou un deuxième stage.", "For 4: a real role outside internships, a company founded, or a second internship.");
  else if (score === 4)
    next = currentFounded
      ? f(`Pour 6 : tenir ${currentFounded.name} un an (${months(currentFounded.months).fr} aujourd'hui), ou un poste tenu deux ans.`, `For 6: run ${currentFounded.name} for a year (${months(currentFounded.months).en} today), or hold a role for two years.`)
      : bestFounded
        ? f(`Pour 6 : une entreprise fondée tenue un an (la plus longue : ${months(bestFounded.months).fr}), ou un poste tenu deux ans.`, `For 6: a company founded and run for a year (the longest: ${months(bestFounded.months).en}), or a role held for two years.`)
        : f(
          `Pour 6 : un poste tenu deux ans, ou un an dans une startup de produit. Le plus long : ${months(bestFull?.months ?? 0).fr}.`,
          `For 6: a role held for two years, or a year in a product startup. The longest: ${months(bestFull?.months ?? 0).en}.`,
        );
  else if (score === 6)
    next = f(
      "Pour 8 : deux ans dans une équipe produit exigeante (startup, scale-up), ou une entreprise fondée tenue trois ans.",
      "For 8: two years in a demanding product team (startup, scale-up), or a company founded and run for three years.",
    );
  else if (score === 8)
    next = f(
      "Pour 10 : deux ans chez un employeur à forte barre d'embauche, et une trajectoire qui monte ou une équipe encadrée.",
      "For 10: two years at a high-bar employer, and a rising path or a team led.",
    );

  // La pièce : les deux postes les plus récents, datés.
  const recent = infos.filter((r) => r.start !== null).sort((a, b) => b.start! - a.start!).slice(0, 2);
  const line = (r: RoleInfo): Fact => {
    const head = [r.role.title, r.role.company].filter(Boolean).join(", ");
    const when =
      r.role.end === null
        ? f(`depuis ${monthName(r.start!).fr}`, `since ${monthName(r.start!).en}`)
        : f(`${monthName(r.start!).fr} – ${monthName(r.end!).fr}`, `${monthName(r.start!).en} – ${monthName(r.end!).en}`);
    return f(`${head} : ${when.fr}, ${duration(r.months).fr}.`, `${head}: ${when.en}, ${duration(r.months).en}.`);
  };
  const evidenceText = recent.length ? join(recent.map(line)) : f(`${src}, postes sans dates.`, `${src}, undated roles.`);
  return crit("EMP", {
    score,
    state: "scored",
    source: "linkedin",
    reached,
    ...(next ? { next } : {}),
    flags: team ? [f(`Équipe encadrée : « ${team.slice(0, 100)} »`, `Team led: "${team.slice(0, 100)}"`)] : [],
    evidence: { text: evidenceText, source: "linkedin", ...proof },
  });
}

// --- STK : stack technique --------------------------------------------------------

const familyOf = (lang: string | null): string | null => {
  if (!lang || IGNORED_LANGS.has(lang)) return null;
  return FAMILY_OF.get(lang) ?? lang;
};

/** Ne comptent pas : les dépôts tutoriels et les dépôts déposés d'un bloc (moins de 5 commits pour plus d'un Mo). */
function countedRepo(r: GithubRepo): boolean {
  if (isTutorialRepo(r)) return false;
  const D = GRID.STK.dumped;
  if (r.commitCount !== null && r.commitCount < D.maxCommits && r.sizeKb > D.minSizeKb) return false;
  return true;
}

interface Family {
  family: string;
  commits: number;
  repos: GithubRepo[];
  /** Le langage de la famille qui pèse le plus de commits. */
  lead: string;
  firstCreated: number;
  lastPushed: number;
  lastRepo: GithubRepo;
}

export function familiesOf(facts: GithubFacts): Family[] {
  type Acc = { repos: GithubRepo[]; byLang: Map<string, number> };
  const map = new Map<string, Acc>();
  for (const r of facts.repos) {
    const fam = familyOf(r.language);
    if (!fam || !countedRepo(r)) continue;
    const e: Acc = map.get(fam) ?? { repos: [], byLang: new Map() };
    e.repos.push(r);
    e.byLang.set(r.language!, (e.byLang.get(r.language!) ?? 0) + (r.commitCount ?? 0));
    map.set(fam, e);
  }
  return [...map.entries()]
    .map(([family, e]) => {
      const last = e.repos.reduce((b, r) => (Date.parse(r.pushedAt) > Date.parse(b.pushedAt) ? r : b));
      return {
        family,
        commits: e.repos.reduce((s, r) => s + (r.commitCount ?? 0), 0),
        repos: e.repos,
        lead: [...e.byLang.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
        firstCreated: Math.min(...e.repos.map((r) => Date.parse(r.createdAt))),
        lastPushed: Date.parse(last.pushedAt),
        lastRepo: last,
      };
    })
    .sort((a, b) => b.commits - a.commits || b.repos.length - a.repos.length || a.family.localeCompare(b.family));
}

export function stkGithub(g: GithubInput): Draft {
  const { facts, m } = g;
  const fams = familiesOf(facts);
  const main = fams[0];
  const flags: Fact[] = [];
  // IA dans l'atelier : des fichiers d'agent (`RepoTree.agentFiles`) dans un dépôt actif.
  const agent = facts.trees.find((t) => facts.activeRepos.includes(t.repo) && (t.agentFiles?.length ?? 0) > 0);
  if (agent) flags.push(f(`IA dans l'atelier : des fichiers d'agent dans ${agent.repo}.`, `AI in the workshop: agent files in ${agent.repo}.`));
  if (!main || main.commits <= 0)
    return unproven("STK", "github", f("Aucun dépôt public avec du code à compter.", "No public repo with code to count."), flags);
  const now = m.now;
  const yrs = (now - main.firstCreated) / YEAR;
  const fresh = (now - main.lastPushed) / MONTH;
  const others = fams.filter((x) => x !== main && x.repos.some((r) => (r.commitCount ?? 0) >= GRID.STK.familyRepoCommits));
  const holds = (l: (typeof GRID.STK.levels)[number]) =>
    main.commits >= l.commits && yrs >= l.years && others.length >= l.otherFamilies && (l.freshMonths === null || fresh < l.freshMonths);
  const lvl = GRID.STK.levels.find(holds)!;
  const nextLvl = [...GRID.STK.levels].reverse().find((l) => l.score > lvl.score);
  const lang = main.lead;
  const n = main.repos.length;

  const reached = f(
    `${lang} : ${nf(main.commits, "fr")} commits dans ${n} dépôt${n > 1 ? "s" : ""}, pratiqué depuis ${years(yrs).fr}${others.length ? `, ${others.length} autre${others.length > 1 ? "s" : ""} famille${others.length > 1 ? "s" : ""} de langages` : ""}.`,
    `${lang}: ${nf(main.commits, "en")} commits in ${n} repo${n > 1 ? "s" : ""}, practised for ${years(yrs).en}${others.length ? `, ${others.length} other language famil${others.length > 1 ? "ies" : "y"}` : ""}.`,
  );
  let next: Fact | undefined;
  if (nextLvl) {
    const missingParts: Fact[] = [];
    if (main.commits < nextLvl.commits)
      missingParts.push(f(`${nf(nextLvl.commits, "fr")} commits dans ton langage principal (tu en as ${nf(main.commits, "fr")})`, `${nf(nextLvl.commits, "en")} commits in your main language (you have ${nf(main.commits, "en")})`));
    if (yrs < nextLvl.years) missingParts.push(f(`pratiqué depuis ${years(nextLvl.years).fr} (${years(yrs).fr} aujourd'hui)`, `practised for ${years(nextLvl.years).en} (${years(yrs).en} today)`));
    if (others.length < nextLvl.otherFamilies)
      missingParts.push(
        nextLvl.otherFamilies === 1
          ? f("une autre famille de langages, avec un dépôt de 10 commits", "another language family, with a 10-commit repo")
          : f(`${nextLvl.otherFamilies} autres familles de langages (tu en as ${others.length})`, `${nextLvl.otherFamilies} other language families (you have ${others.length})`),
      );
    if (nextLvl.freshMonths !== null && fresh >= nextLvl.freshMonths)
      missingParts.push(f(`du code poussé depuis moins de ${nextLvl.freshMonths} mois`, `code pushed within ${nextLvl.freshMonths} months`));
    next = f(`Pour ${nextLvl.score} : ${missingParts.map((p) => p.fr).join(", ")}.`, `For ${nextLvl.score}: ${missingParts.map((p) => p.en).join(", ")}.`);
  }
  const since = monthName(isoMonth(new Date(main.firstCreated).toISOString()));
  const last = ago(now, main.lastPushed);
  const otherNames = others.slice(0, 2).map((o) => o.lead);
  const evidence = {
    text: f(
      `${lang} : ${nf(main.commits, "fr")} commits dans ${n} dépôt${n > 1 ? "s" : ""} depuis ${since.fr}, dernier push ${last.fr} (${main.lastRepo.name}).${otherNames.length ? ` ${otherNames.join(", ")} aussi dans le code.` : ""}`,
      `${lang}: ${nf(main.commits, "en")} commits in ${n} repo${n > 1 ? "s" : ""} since ${since.en}, last push ${last.en} (${main.lastRepo.name}).${otherNames.length ? ` ${otherNames.join(", ")} in the code too.` : ""}`,
    ),
    source: "github" as const,
    proof: repoUrl(main.lastRepo),
  };
  return crit("STK", { score: lvl.score, state: "scored", source: "github", reached, ...(next ? { next } : {}), flags, evidence });
}

const uniqNames = (xs: string[]) => {
  const seen = new Set<string>();
  return xs.map((x) => x.trim()).filter((x) => x && !seen.has(norm(x)) && seen.add(norm(x)));
};

export function stkDeclared(d: DeclaredInput, gh?: Pick<GithubInput, "facts" | "m">): Draft {
  const r = d.reading;
  const src = d.label;
  const described = uniqNames(r.technos_described);
  const nowIdx = nowMonth(d.now);
  // Technos d'un poste de moins de 2 ans : nommées dans un poste en cours ou fini depuis moins de 2 ans.
  const D = GRID.STK.declared;
  const recentMonths = D[0].recentMonths;
  const recentTexts = [
    ...r.roles.map((x) => ({ end: x.end, text: [x.title, ...x.responsibilities].join(" ") })),
    ...d.roles.map((x) => ({ end: x.end, text: `${x.title} ${x.description ?? ""}` })),
  ]
    .filter((x) => x.end === null || (monthIndex(x.end) !== null && nowIdx - monthIndex(x.end)! < recentMonths))
    .map((x) => norm(x.text));
  const recent = described.filter((t) => recentTexts.some((txt) => wordIn(norm(t), txt))).length;
  const flags = gh ? stackFlags(d, gh) : [];
  const lvl = D.find((l) => described.length >= l.described && recent >= l.recent);
  const shown = described.slice(0, 4).join(", ");
  if (!lvl)
    return crit("STK", {
      score: null,
      state: "missing",
      source: "linkedin",
      reached: described.length
        ? f(`Une seule techno rattachée à une réalisation (${shown}) : une liste de compétences seule ne compte pas.`, `A single technology tied to an achievement (${shown}): a skills list alone does not count.`)
        : f("Aucune techno rattachée à une réalisation : une liste de compétences seule ne compte pas.", "No technology tied to an achievement: a skills list alone does not count."),
      next: f(`Pour 4 : deux technos rattachées à une réalisation concrète, sur ${src}. Ou un GitHub pour la prouver.`, `For 4: two technologies tied to a concrete achievement, on ${src}. Or a GitHub to prove it.`),
      flags,
    });
  const nextLvl = [...D].reverse().find((l) => l.score > lvl.score);
  return crit("STK", {
    score: lvl.score,
    state: "declared",
    source: "linkedin",
    reached: f(`${described.length} technos rattachées à une réalisation concrète${recent ? `, dont ${recent} dans un poste de moins de 2 ans` : ""}.`, `${described.length} technologies tied to a concrete achievement${recent ? `, ${recent} of them in a role from the last 2 years` : ""}.`),
    next: nextLvl
      ? f(
          `Pour ${nextLvl.score} : ${nextLvl.described} technos rattachées à une réalisation, dont ${nextLvl.recent} dans un poste de moins de 2 ans (tu en as ${described.length}, dont ${recent}).`,
          `For ${nextLvl.score}: ${nextLvl.described} technologies tied to an achievement, ${nextLvl.recent} of them in a role from the last 2 years (you have ${described.length}, ${recent} recent).`,
        )
      : f("Au-delà de 6 : la stack se prouve sur GitHub.", "Beyond 6: the stack is proven on GitHub."),
    flags,
    evidence: { text: f(`${shown}.`, `${shown}.`), source: "linkedin", ...(d.url ? { proof: d.url } : {}) },
  });
}

// --- Recoupement : techno → trace attendue dans le code ------------------------------

type Trace = (typeof GRID.traces.list)[number];

/** Les entrées de la table nommées par ces technos (alias exact, sans casse ni accents), dans l'ordre où la personne les nomme. */
export function tracesNamed(names: string[]): Trace[] {
  const out: Trace[] = [];
  for (const n of names) {
    const k = norm(n);
    const t = GRID.traces.list.find((x) => norm(x.name) === k || x.aliases.some((a) => norm(a) === k));
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** La techno laisse-t-elle sa trace dans ce code public : langage, dépendance, topic, marqueur d'arbre ? */
export function traceFound(t: Trace, facts: GithubFacts, m: GithubMetrics): boolean {
  const langs = t.languages ?? [];
  if (langs.some((l) => (m.languageBytes[l] ?? 0) > 0 || facts.repos.some((r) => r.language === l))) return true;
  const deps = new Set((t.deps ?? []).map((x) => x.toLowerCase()));
  if (deps.size && facts.repos.some((r) => (r.deps ?? []).some((x) => deps.has(x.toLowerCase())))) return true;
  const topics = new Set((t.topics ?? []).map((x) => x.toLowerCase()));
  if (topics.size && facts.repos.some((r) => r.topics.some((x) => topics.has(x.toLowerCase())))) return true;
  const markers = new Set(t.markers ?? []);
  return markers.size > 0 && facts.trees.some((tr) => tr.markers.some((x) => markers.has(x)));
}

/** « Stack déclarée, sans trace publique » et « LinkedIn en dessous de la vérité » : des chefs d'accusation, jamais une note. */
export function stackFlags(d: DeclaredInput, gh: Pick<GithubInput, "facts" | "m">): Fact[] {
  const { facts, m } = gh;
  const r = d.reading;
  const named = uniqNames([...d.skills, ...r.technos_listed, ...r.technos_described]);
  const verifiable = tracesNamed(named);
  const out: Fact[] = [];
  const S = GRID.STK;
  if (verifiable.length >= S.noTraceAtLeast) {
    const notFound = verifiable.filter((t) => !traceFound(t, facts, m));
    const share = (verifiable.length - notFound.length) / verifiable.length;
    if (share < S.noTraceShareBelow) {
      const list = notFound.slice(0, 3).map((t) => t.name).join(", ");
      const n = facts.repos.length;
      out.push(
        f(
          `Stack déclarée, sans trace publique : ${list}, aucune trace dans ${n} dépôt${n > 1 ? "s" : ""}.`,
          `Declared stack, no public trace: ${list}, no trace in ${n} repo${n === 1 ? "" : "s"}.`,
        ),
      );
    }
  }
  const namedSet = new Set(verifiable.map((t) => t.name));
  const proven = GRID.traces.list.filter((t) => {
    const lead = t.languages?.[0];
    return lead && !namedSet.has(t.name) && (m.languageBytes[lead] ?? 0) >= S.undersellMinBytes && familyOf(lead) !== null;
  });
  if (proven.length) {
    const list = proven.slice(0, 3).map((t) => t.name).join(", ");
    out.push(
      f(
        `${d.label} en dessous de la vérité : ${list} prouvé${proven.length > 1 ? "s" : ""} par le code, absent${proven.length > 1 ? "s" : ""} ${d.label === "CV" ? "du CV" : "de LinkedIn"}.`,
        `${d.label} undersells the code: ${list} proven by the code, missing from ${d.label === "CV" ? "the CV" : "LinkedIn"}.`,
      ),
    );
  }
  return out;
}

// --- CODE : niveau du code -------------------------------------------------------------

const roundHalfUp = (x: number) => Math.floor(x + 0.5 + 1e-9);

export function codeGithub(g: GithubInput): Draft {
  const { facts, m, ai } = g;
  const readings = ai?.readings ?? [];
  if (!readings.length) return unproven("CODE", "github", f("Aucun dépôt lu : lecture du code indisponible.", "No repo read: code reading unavailable."));
  const C = GRID.CODE;
  const weight = (repo: string) => Math.max(1, facts.repos.find((r) => r.name === repo)?.activity ?? 1);
  let sw = 0;
  let sl = 0;
  for (const r of readings) {
    sw += weight(r.repo);
    sl += weight(r.repo) * r.level;
  }
  const level = sl / sw;
  let score = Math.min(10, roundHalfUp(C.multiplier * level));
  const testsShare = m.treesAnalyzed ? m.testsRepos / m.treesAnalyzed : 0;
  const enoughCommits = (m.maxRepoCommits ?? 0) >= C.repoCommits;
  const notes: Fact[] = [];
  if (score >= C.testsFrom && testsShare < C.testsShare) {
    score = C.capWithoutTests;
    notes.push(f(`des tests dans moins de la moitié des dépôts actifs : arrêtée à ${C.capWithoutTests}`, `tests in under half of the active repos: stops at ${C.capWithoutTests}`));
  }
  if (score >= C.commitsFrom && !enoughCommits) {
    score = C.capWithoutCommits;
    notes.push(f(`aucun dépôt de ${C.repoCommits} commits : arrêtée à ${C.capWithoutCommits}`, `no repo with ${C.repoCommits} commits: stops at ${C.capWithoutCommits}`));
  }
  const best = [...readings].sort((a, b) => b.level - a.level || weight(b.repo) - weight(a.repo))[0];
  const n = readings.length;
  const reached = f(
    `Niveau moyen lu ${df(level, "fr")} sur 5, sur ${n} dépôt${n > 1 ? "s" : ""}${notes.length ? ` ; ${notes.map((x) => x.fr).join(" ; ")}` : ""}.`,
    `Average level read ${df(level, "en")} out of 5, across ${n} repo${n > 1 ? "s" : ""}${notes.length ? `; ${notes.map((x) => x.en).join("; ")}` : ""}.`,
  );
  let next: Fact | undefined;
  if (score < 10) {
    const target = score + 1;
    const needLevel = (target - 0.5) / C.multiplier;
    const parts: Fact[] = [];
    if (C.multiplier * level < target - 0.5)
      parts.push(f(`un niveau moyen de ${df(needLevel, "fr")} sur 5 (tu as ${df(level, "fr")})`, `an average level of ${df(needLevel, "en")} out of 5 (you have ${df(level, "en")})`));
    if (target >= C.commitsFrom && !enoughCommits) parts.push(f(`un dépôt de ${C.repoCommits} commits`, `a repo with ${C.repoCommits} commits`));
    if (target >= C.testsFrom && testsShare < C.testsShare) parts.push(f("des tests dans la moitié des dépôts actifs", "tests in half of the active repos"));
    if (parts.length) next = f(`Pour ${target} : ${parts.map((p) => p.fr).join(", ")}.`, `For ${target}: ${parts.map((p) => p.en).join(", ")}.`);
  }
  const repo = facts.repos.find((r) => r.name === best.repo);
  const quote = best.evidence_quote.trim().slice(0, 120);
  const proof = repo ? (best.evidence_file ? `${repoUrl(repo)}/blob/${repo.defaultBranch}/${best.evidence_file}` : repoUrl(repo)) : undefined;
  const file = best.evidence_file ? `, \`${best.evidence_file}\`` : "";
  return crit("CODE", {
    score,
    state: "scored",
    source: "github",
    reached,
    ...(next ? { next } : {}),
    evidence: {
      text: f(`${best.repo}${file} : niveau ${best.level} sur 5.${quote ? ` « ${quote} »` : ""}`, `${best.repo}${file}: level ${best.level} out of 5.${quote ? ` "${quote}"` : ""}`),
      source: "github",
      ...(proof ? { proof } : {}),
    },
  });
}

// --- ACT : activité --------------------------------------------------------------------

export function actGithub(g: GithubInput): Draft {
  const { facts, m } = g;
  if (!m.calendarAvailable) return unproven("ACT", "github", f("Calendrier de contributions indisponible.", "Contribution calendar unavailable."));
  const weeks = Math.min(52, m.weeksActive);
  if (thinGithub(m))
    return unproven(
      "ACT",
      "github",
      f(`${weeks} semaine${weeks > 1 ? "s" : ""} active${weeks > 1 ? "s" : ""} sur 52 : GitHub trop mince pour juger.`, `${weeks} active week${weeks === 1 ? "" : "s"} out of 52: GitHub too thin to judge.`),
    );
  const A = GRID.ACT;
  const lvl = A.levels.find((l) => weeks >= l.weeks)!;
  let score = lvl.score;
  const flags: Fact[] = [];
  const codeVisible = (m.maxRepoCommits ?? 0) >= A.codeRepoCommits;
  if (score >= A.codeFrom && !codeVisible) {
    score = A.capWithoutCode;
    flags.push(f("Activité sans code visible : on voit que ça code, pas ce que ça code.", "Activity, no visible code: it shows coding, not what is coded."));
  }
  const nextLvl = [...A.levels].reverse().find((l) => l.score > score);
  let next: Fact | undefined;
  if (nextLvl) {
    const parts: Fact[] = [];
    if (weeks < nextLvl.weeks) parts.push(f(`${nextLvl.weeks} semaines actives (tu en as ${weeks})`, `${nextLvl.weeks} active weeks (you have ${weeks})`));
    if (nextLvl.score >= A.codeFrom && !codeVisible) parts.push(f(`un dépôt public de ${A.codeRepoCommits} commits`, `a public repo with ${A.codeRepoCommits} commits`));
    next = f(`Pour ${nextLvl.score} : ${parts.map((p) => p.fr).join(", ")}.`, `For ${nextLvl.score}: ${parts.map((p) => p.en).join(", ")}.`);
  }
  return crit("ACT", {
    score,
    state: "scored",
    source: "github",
    reached: f(`${weeks} semaine${weeks > 1 ? "s" : ""} active${weeks > 1 ? "s" : ""} sur 52.`, `${weeks} active week${weeks === 1 ? "" : "s"} out of 52.`),
    ...(next ? { next } : {}),
    flags,
    evidence: {
      text: f(`${weeks} semaines actives sur 52, ${nf(m.totalContributions, "fr")} contributions.`, `${weeks} active weeks out of 52, ${nf(m.totalContributions, "en")} contributions.`),
      source: "github",
      proof: profileUrl(facts.login),
    },
  });
}

// --- OWN : ownership et production ------------------------------------------------------

export function ownGithub(g: GithubInput): Draft {
  const { facts, m } = g;
  if (thinGithub(m) || !facts.repos.length) return unproven("OWN", "github", f("GitHub trop mince pour juger.", "GitHub too thin to judge."));
  const L = GRID.OWN.levels;
  const lv = (s: number) => L.find((x) => x.score === s)!;
  const now = m.now;
  const inYear = (r: GithubRepo) => (r.releaseDates ?? []).filter((d) => now - Date.parse(d) <= 365 * DAY).length;
  const span = (r: GithubRepo) => Math.max(0, (Date.parse(r.pushedAt) - Date.parse(r.createdAt)) / MONTH);
  const commits = (r: GithubRepo) => r.commitCount ?? 0;
  const ext = (r: GithubRepo) => r.externalContributors ?? 0;
  // Publié : une release, ou un site en ligne (`GithubRepo.homepage`).
  const published = (r: GithubRepo) => (r.releaseDates ?? []).length > 0 || !!r.homepage?.trim();
  const repos = facts.repos.filter(countedRepo);
  const carried = (s: number) => repos.filter((r) => span(r) >= lv(s).months! && commits(r) >= lv(s).commits!);

  // De quoi mettre en production dans un dépôt actif : Dockerfile, CI ou release.
  const deployTree = facts.trees.find((t) => t.available && facts.activeRepos.includes(t.repo) && (t.hasCi || t.markers.includes("dockerfile")));
  const releasedActive = m.active.find((r) => (r.releaseDates ?? []).length > 0);
  const deployable = deployTree?.repo ?? releasedActive?.name ?? null;

  const best = (xs: GithubRepo[], by: (r: GithubRepo) => number) => xs.reduce<GithubRepo | null>((b, r) => (!b || by(r) > by(b) ? r : b), null);
  let score: number;
  let repo: GithubRepo | null;
  const t10 = repos.filter((r) => (r.stars >= lv(10).stars! || ext(r) >= lv(10).external!) && inYear(r) >= lv(10).releasesInYear!);
  const t8 = carried(8).filter((r) => published(r) && (r.stars >= lv(8).stars! || ext(r) >= lv(8).external!));
  const t6 = deployable ? carried(6) : [];
  const t4 = carried(4);
  if (t10.length) [score, repo] = [10, best(t10, (r) => r.stars)];
  else if (t8.length) [score, repo] = [8, best(t8, (r) => r.stars)];
  else if (t6.length) [score, repo] = [6, best(t6, commits)];
  else if (t4.length) [score, repo] = [4, best(t4, commits)];
  else [score, repo] = [2, best(repos.length ? repos : facts.repos, commits)];

  const shown = repo ?? facts.repos[0];
  const desc = (r: GithubRepo): Fact => {
    const mo = Math.round(span(r));
    return f(`${r.name} : ${nf(commits(r), "fr")} commits sur ${mo} mois`, `${r.name}: ${nf(commits(r), "en")} commits over ${mo} month${mo === 1 ? "" : "s"}`);
  };
  const reachedText: Record<number, Fact> = {
    10: f("Un projet dont beaucoup se servent, avec trois releases dans l'année.", "A project many people use, with three releases this year."),
    8: f("Un projet porté plus d'un an, publié, et utilisé par d'autres.", "A project carried for over a year, published, and used by others."),
    6: f(`Un projet porté 6 mois ou plus, et de quoi mettre en production (${deployable}).`, `A project carried for 6 months or more, and what it takes to ship (${deployable}).`),
    4: f("Un projet porté 6 mois ou plus.", "A project carried for 6 months or more."),
    2: f("Des dépôts, aucun porté dans la durée.", "Repos, none carried over time."),
  };
  const nextText: Record<number, Fact> = {
    2: f(`Pour 4 : un projet porté 6 mois avec ${lv(4).commits} commits. Le plus gros : ${desc(shown).fr}.`, `For 4: a project carried for 6 months with ${lv(4).commits} commits. The biggest: ${desc(shown).en}.`),
    4: f("Pour 6 : de quoi mettre en production dans un dépôt actif (Dockerfile, CI ou release).", "For 6: what it takes to ship in an active repo (Dockerfile, CI or release)."),
    6: f(
      `Pour 8 : un projet de plus d'un an et ${lv(8).commits} commits, publié, utilisé par d'autres (${lv(8).stars} étoiles ou ${lv(8).external} contributeurs externes).`,
      `For 8: a project over a year old with ${lv(8).commits} commits, published, used by others (${lv(8).stars} stars or ${lv(8).external} outside contributors).`,
    ),
    8: f(
      `Pour 10 : ${nf(lv(10).stars!, "fr")} étoiles ou ${lv(10).external} contributeurs externes, et ${lv(10).releasesInYear} releases dans l'année.`,
      `For 10: ${nf(lv(10).stars!, "en")} stars or ${lv(10).external} outside contributors, and ${lv(10).releasesInYear} releases this year.`,
    ),
  };
  const deployRepo = deployable ? facts.repos.find((r) => r.name === deployable) : undefined;
  const deployTreeOf = deployable ? facts.trees.find((t) => t.repo === deployable) : undefined;
  const deployBits: string[] = [];
  if (deployTreeOf?.markers.includes("dockerfile")) deployBits.push("Dockerfile");
  if (deployTreeOf?.hasCi) deployBits.push("CI");
  if (deployRepo && (deployRepo.releaseDates ?? []).length) deployBits.push("release");
  const extra =
    deployRepo && deployRepo.name !== shown.name && score >= 6
      ? f(` ${deployRepo.name} : ${deployBits.join(", ")}, ${deployRepo.stars} étoile${deployRepo.stars > 1 ? "s" : ""}.`, ` ${deployRepo.name}: ${deployBits.join(", ")}, ${deployRepo.stars} star${deployRepo.stars === 1 ? "" : "s"}.`)
      : f("", "");
  return crit("OWN", {
    score,
    state: "scored",
    source: "github",
    reached: reachedText[score],
    ...(nextText[score] ? { next: nextText[score] } : {}),
    evidence: { text: f(`${desc(shown).fr}.${extra.fr}`, `${desc(shown).en}.${extra.en}`), source: "github", proof: repoUrl(shown) },
  });
}

export function ownDeclared(d: DeclaredInput): Draft {
  const outcomes = d.reading.projects_with_dated_outcome;
  const infos = analyzeRoles(d.roles, d.now);
  const founded = infos.find((r) => r.founder && r.kind === "full");
  const L = GRID.OWN.declared;
  const lvl = L.find((l) => outcomes >= l.outcomes || (l.founded && !!founded));
  if (!lvl)
    return missing(
      "OWN",
      "linkedin",
      f("Ni entreprise fondée, ni résultat daté et chiffré.", "No company founded, no dated and quantified outcome."),
      f("Pour 4 : une entreprise fondée, ou un résultat daté et chiffré (mise en ligne, migration, usage).", "For 4: a company founded, or a dated and quantified outcome (launch, migration, usage)."),
    );
  const reached =
    lvl.score === 6
      ? f(`${outcomes} résultats datés et chiffrés.`, `${outcomes} dated and quantified outcomes.`)
      : founded && outcomes < 1
        ? f(`Une entreprise fondée (${founded.role.company}). Aucun résultat daté et chiffré.`, `A company founded (${founded.role.company}). No dated and quantified outcome.`)
        : f(`${outcomes} résultat${outcomes > 1 ? "s" : ""} daté${outcomes > 1 ? "s" : ""} et chiffré${outcomes > 1 ? "s" : ""}.`, `${outcomes} dated and quantified outcome${outcomes === 1 ? "" : "s"}.`);
  return crit("OWN", {
    score: lvl.score,
    state: "declared",
    source: "linkedin",
    reached,
    next:
      lvl.score < 6
        ? f(`Pour 6 : trois résultats datés et chiffrés (tu en as ${outcomes}). Au-delà, un projet sur GitHub.`, `For 6: three dated and quantified outcomes (you have ${outcomes}). Beyond that, a project on GitHub.`)
        : f("Au-delà de 6 : un projet porté et utilisé, sur GitHub.", "Beyond 6: a project carried and used, on GitHub."),
    evidence: { text: f(`${d.label}, postes et réalisations.`, `${d.label}, roles and achievements.`), source: "linkedin", ...(d.url ? { proof: d.url } : {}) },
  });
}

// --- OSS : open source -------------------------------------------------------------------

type MergedPr = ExternalMergedPR;

/** Destination des PR fusionnées chez les autres (`GithubFacts.externalMergedPRList`) : dépôt « propriétaire/nom », étoiles, date. Null pour des faits d'avant. */
function mergedPrs(facts: GithubFacts): MergedPr[] | null {
  const list = facts.externalMergedPRList;
  if (!list) return null;
  return list.filter((p) => typeof p.repo === "string" && p.repo.includes("/")).map((p) => ({ ...p, stars: Number(p.stars) || 0 }));
}

export function ossGithub(g: GithubInput): Draft {
  const { facts, m } = g;
  const prs = facts.externalMergedPRs;
  const ownStars = m.starsTotal;
  const maxExt = m.maxExternal?.n ?? 0;
  if (thinGithub(m) && prs === 0 && ownStars === 0) return unproven("OSS", "github", f("GitHub trop mince pour juger.", "GitHub too thin to judge."));
  const O = GRID.OSS;
  const dest = mergedPrs(facts);
  const flags: Fact[] = [];
  // PR entre proches : toutes chez un seul propriétaire, qui est aussi le complice principal.
  const owners = new Set((dest ?? []).map((p) => p.repo.split("/")[0].toLowerCase()));
  const mainAccomplice = facts.accomplices?.[0]?.login?.toLowerCase();
  const friends = !!dest?.length && owners.size === 1 && !!mainAccomplice && owners.has(mainAccomplice);
  if (friends) flags.push(f(`PR entre proches : toutes chez ${[...owners][0]}, en tête des complices.`, `PRs among friends: all to ${[...owners][0]}, top of the accomplices.`));
  const bigPrs = friends ? 0 : (dest ?? []).filter((p) => p.stars >= O.bigStars).length;
  const maintainer = facts.repos.reduce<GithubRepo | null>((b, r) => (r.stars >= O.levels[0].maintainerStars! && (!b || r.stars > b.stars) ? r : b), null);

  const holds = (l: (typeof O.levels)[number]): boolean => {
    if (l.maintainerStars !== undefined || l.bigPrs !== undefined || l.ownStars !== undefined || l.external !== undefined)
      return (
        (l.maintainerStars !== undefined && !!maintainer) ||
        (l.bigPrs !== undefined && bigPrs >= l.bigPrs) ||
        (l.ownStars !== undefined && ownStars >= l.ownStars) ||
        (l.external !== undefined && maxExt >= l.external)
      );
    // Des PR entre proches ne comptent que jusqu'au niveau friendsCap.
    return prs >= (l.prs ?? 0) && !(friends && l.score > O.friendsCap);
  };
  const lvl = O.levels.find(holds)!;
  const score = lvl.score;
  const reachedBy: Fact =
    score === 10
      ? maintainer
        ? f(`Maintient ${maintainer.name}, ${nf(maintainer.stars, "fr")} étoiles.`, `Maintainer of ${maintainer.name}, ${nf(maintainer.stars, "en")} stars.`)
        : f(`${bigPrs} PR fusionnées dans des projets de ${nf(O.bigStars, "fr")} étoiles ou plus.`, `${bigPrs} PRs merged into projects with ${nf(O.bigStars, "en")}+ stars.`)
      : score === 8
        ? bigPrs >= 1
          ? f(`Une PR fusionnée dans un projet de ${nf(O.bigStars, "fr")} étoiles ou plus.`, `A PR merged into a project with ${nf(O.bigStars, "en")}+ stars.`)
          : ownStars >= (lvl.ownStars ?? Infinity)
            ? f(`${nf(ownStars, "fr")} étoiles sur ses dépôts.`, `${nf(ownStars, "en")} stars on own repos.`)
            : f(`Un dépôt avec ${maxExt} contributeurs externes (${m.maxExternal?.repo}).`, `A repo with ${maxExt} outside contributors (${m.maxExternal?.repo}).`)
        : prs
          ? f(`${nf(prs, "fr")} PR fusionnée${prs > 1 ? "s" : ""} chez les autres.`, `${nf(prs, "en")} PR${prs === 1 ? "" : "s"} merged into other people's repos.`)
          : f("Aucune PR fusionnée chez les autres.", "No PR merged into other people's repos.");
  let next: Fact | undefined;
  if (score < 10) {
    const nextLvl = [...O.levels].reverse().find((l) => l.score > score)!;
    if (nextLvl.prs !== undefined && nextLvl.ownStars === undefined)
      next = f(`Pour ${nextLvl.score} : ${nextLvl.prs} PR fusionnées chez les autres (tu en as ${nf(prs, "fr")}).`, `For ${nextLvl.score}: ${nextLvl.prs} PRs merged into other people's repos (you have ${nf(prs, "en")}).`);
    else if (nextLvl.score === 8)
      next = f(
        `Pour 8 : une PR fusionnée dans un projet de ${nf(O.bigStars, "fr")} étoiles, ${nextLvl.ownStars} étoiles sur tes dépôts (tu en as ${nf(ownStars, "fr")}), ou un dépôt avec ${nextLvl.external} contributeurs externes.${dest ? "" : " La destination des PR n'est pas encore lue."}`,
        `For 8: a PR merged into a project with ${nf(O.bigStars, "en")} stars, ${nextLvl.ownStars} stars on your repos (you have ${nf(ownStars, "en")}), or a repo with ${nextLvl.external} outside contributors.${dest ? "" : " Where the PRs went is not read yet."}`,
      );
    else
      next = f(
        `Pour 10 : maintenir un projet de ${nf(O.bigStars, "fr")} étoiles, ou ${O.levels[0].bigPrs} PR fusionnées dans de tels projets.`,
        `For 10: maintain a project with ${nf(O.bigStars, "en")} stars, or ${O.levels[0].bigPrs} PRs merged into such projects.`,
      );
  }
  // La pièce : où vont les PR quand on le sait, sinon leur nombre.
  let text: Fact = f(`${nf(prs, "fr")} PR fusionnée${prs > 1 ? "s" : ""} chez les autres.`, `${nf(prs, "en")} PR${prs === 1 ? "" : "s"} merged into other people's repos.`);
  if (dest?.length) {
    const byRepo = new Map<string, MergedPr[]>();
    for (const p of dest) byRepo.set(p.repo, [...(byRepo.get(p.repo) ?? []), p]);
    const [repo, list] = [...byRepo.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0];
    const lastIso = list.map((p) => p.mergedAt).filter(Boolean).sort().pop();
    const last = lastIso && !Number.isNaN(Date.parse(lastIso)) ? monthName(isoMonth(lastIso)) : null;
    text = f(
      `${list.length} PR fusionnée${list.length > 1 ? "s" : ""} dans ${repo}${last ? `, la dernière en ${last.fr}` : ""}.`,
      `${list.length} PR${list.length === 1 ? "" : "s"} merged into ${repo}${last ? `, the latest in ${last.en}` : ""}.`,
    );
  }
  const login = encodeURIComponent(facts.login);
  return crit("OSS", {
    score,
    state: "scored",
    source: "github",
    reached: reachedBy,
    ...(next ? { next } : {}),
    flags,
    evidence: { text, source: "github", proof: `https://github.com/search?q=type%3Apr+author%3A${login}+is%3Amerged+-user%3A${login}&type=pullrequests` },
  });
}

// --- La note générale (§4) ------------------------------------------------------------

/**
 * Les quatre règles, et pas une de plus : (1) un critère sans note sort de la
 * moyenne ; (2) l'école et l'open source n'y entrent que s'ils sont au-dessus de
 * la moyenne des autres ; (3) plafond à 85 sans code prouvé ; (4) moins d'un
 * quart des coefficients noté : 20. Calcul en entiers (coefficients doublés),
 * arrondi au supérieur à ,5, bornes 1 à 99.
 */
export function finalize(drafts: Draft[]): Grid {
  const F = GRID.final;
  const byCode = new Map(drafts.map((d) => [d.code, d]));
  const ordered = CRITERION_CODES.map((c) => byCode.get(c)!).filter(Boolean);
  const w2 = (c: CriterionCode) => Math.round(GRID.weights[c] * 2);
  const total2 = CRITERION_CODES.reduce((s, c) => s + w2(c), 0);
  const scored = ordered.filter((d) => d.score !== null);
  const scored2 = scored.reduce((s, d) => s + w2(d.code), 0);
  const never = new Set(F.neverLower);

  if (scored2 < F.emptyBelowShare * total2) {
    return { criteria: ordered.map((d) => ({ ...d, counted: false })), overall: F.emptyScore, rule: "empty_file" };
  }
  const base = scored.filter((d) => !never.has(d.code));
  const n0 = base.reduce((s, d) => s + d.score! * w2(d.code), 0);
  const d0 = base.reduce((s, d) => s + w2(d.code), 0);
  const counted = new Set<CriterionCode>(base.map((d) => d.code));
  for (const d of scored) if (never.has(d.code) && (d0 === 0 || d.score! * d0 > n0)) counted.add(d.code);
  const inMean = scored.filter((d) => counted.has(d.code));
  const n = inMean.reduce((s, d) => s + d.score! * w2(d.code), 0);
  const den = inMean.reduce((s, d) => s + w2(d.code), 0);
  // 10 × n / den, arrondi au supérieur à ,5, en entiers.
  let overall = den ? Math.floor((20 * n + den) / (2 * den)) : F.bounds.min;
  const codeProven = byCode.get("CODE")?.score != null;
  let rule: Grid["rule"];
  if (!codeProven) {
    rule = "capped_unproven";
    overall = Math.min(overall, F.capUnproven);
  }
  overall = Math.min(F.bounds.max, Math.max(F.bounds.min, overall));
  return { criteria: ordered.map((d) => ({ ...d, counted: counted.has(d.code) })), overall, ...(rule ? { rule } : {}) };
}

// --- Les trois grilles (§4) ----------------------------------------------------------------

/** Fiche GitHub : la note prouvée. École et parcours non renseignés (sauf un hackathon dans un dépôt), expérience estimée. */
export function githubGrid(g: GithubInput): Grid {
  return finalize([
    eduGithub(g),
    xpGithub(g),
    missing("EMP", "github", f("Le parcours se lit sur LinkedIn ou le CV : sans objet ici.", "Career path is read on LinkedIn or the CV: not applicable here.")),
    stkGithub(g),
    codeGithub(g),
    actGithub(g),
    ownGithub(g),
    ossGithub(g),
  ]);
}

/**
 * Fiche LinkedIn ou CV : la note déclarée. Code, activité et open source non
 * prouvés. Avec les faits GitHub d'une comparaison, la stack porte aussi ses
 * chefs d'accusation de recoupement ; sa note, elle, ne bouge pas.
 */
export function declaredGrid(d: DeclaredInput, gh?: Pick<GithubInput, "facts" | "m">): Grid {
  const src = d.label;
  return finalize([
    eduDeclared(d),
    xpDeclared(d),
    empDeclared(d),
    stkDeclared(d, gh),
    unproven("CODE", "linkedin", f(`Le code ne se prouve pas sur ${src}.`, `Code cannot be proven on ${src}.`)),
    unproven("ACT", "linkedin", f(`L'activité ne se lit pas sur ${src}.`, `Activity cannot be read on ${src}.`)),
    ownDeclared(d),
    unproven("OSS", "linkedin", f(`Une mention « open source » sur ${src} ne donne rien sans trace.`, `An "open source" mention on ${src} gives nothing without a trace.`)),
  ]);
}

/** Les flags des deux côtés, sans doublon. */
const mergeFlags = (a: Fact[], b: Fact[]) => {
  const seen = new Set<string>();
  return [...a, ...b].filter((x) => !seen.has(x.fr) && seen.add(x.fr));
};

/**
 * La note du dossier : chaque critère pris sur sa source de preuve. LinkedIn
 * pour l'école, l'expérience et le parcours (GitHub ne sert que si LinkedIn
 * manque) ; GitHub pour la stack (le déclaré seulement sans preuve), le code,
 * l'activité et l'open source ; la plus haute des deux pour l'ownership.
 * Un GitHub trop mince ne tire pas le dossier vers le bas : ses critères sont
 * non prouvés. Chaque critère garde ses deux notes (`declared`, `proven`).
 */
export function caseGrid(declared: Grid, proven: Grid): Grid {
  const pick = (code: CriterionCode) => ({
    d: declared.criteria.find((c) => c.code === code)!,
    p: proven.criteria.find((c) => c.code === code)!,
  });
  const strip = ({ counted: _c, ...rest }: GridCriterion): Draft => rest;
  const drafts = CRITERION_CODES.map((code): Draft => {
    const { d, p } = pick(code);
    const both = { declared: d.score, proven: p.score };
    const has = (c: GridCriterion) => c.score !== null;
    let chosen: GridCriterion;
    let source: GridSource;
    switch (code) {
      case "EDU":
        chosen = has(d) && (!has(p) || d.score! >= p.score!) ? d : has(p) ? p : d;
        source = chosen.source;
        break;
      case "XP":
      case "EMP":
        chosen = has(d) || !has(p) ? d : p;
        source = chosen.source;
        break;
      case "OWN":
        chosen = has(p) && (!has(d) || p.score! >= d.score!) ? p : has(d) ? d : p;
        source = has(p) && has(d) ? "both" : chosen.source;
        break;
      default:
        // STK : le prouvé, le déclaré seulement sans preuve. CODE, ACT, OSS : GitHub.
        chosen = code === "STK" && !has(p) && has(d) ? d : p;
        source = chosen.source;
    }
    const flags = mergeFlags(d.flags, p.flags);
    return { ...strip(chosen), source, ...both, flags };
  });
  return finalize(drafts);
}
