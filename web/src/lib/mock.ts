// Mode démo : simule l'API avec les fixtures et une progression réaliste.
// Pseudos spéciaux : "unknown" (inconnu), "org" (organisation), "ratelimit" (429),
// "slow" (attente longue puis timeout). Les pseudos des fixtures donnent leur carte.
import type { CardData, ComparisonData, Finding, JobState, ProgressEvent, Stat, StatCode } from "../../../shared/types";
import { FIXTURES, FIXTURE_COMPARISON } from "../../../shared/fixtures";
import type { CaseInfo, CreateInput, CreateResult } from "./api";
import { ApiError } from "./errors";

type FixtureKey = keyof typeof FIXTURES;
type Kind = FixtureKey | "cmp" | "unknown" | "org" | "slow";

interface MockJob {
  kind: Kind;
  start: number;
  login?: string;
  lang: "fr" | "en";
  timeline: ProgressEvent[];
  doneAt: number;
  denouncedBy?: string;
}

/** Complices suggérés en démo (§18.6) : des pseudos qui ont leur fixture. */
const MOCK_ACCOMPLICES = ["camroux", "nour-rs", "jplefevre"].map((login) => ({ login, avatarUrl: `https://github.com/${login}.png?size=80` }));

const jobs = new Map<string, MockJob>();
/** Cartes dont la photo vient de LinkedIn (simulé). */
const photos = new Set<string>();
const MOCK_PHOTO = "/mock-linkedin.svg";

const BY_LOGIN: Record<string, FixtureKey> = {
  "kevin-dev42": "bronze",
  camroux: "silver",
  leamd: "gold",
  sindresorhus: "icon",
  torvalds: "icon",
  "nour-rs": "wonderkid",
  jplefevre: "flashback",
  "ghost-coder": "lowReliability",
  bronze: "bronze",
  silver: "silver",
  gold: "gold",
  icon: "icon",
  wonderkid: "wonderkid",
  flashback: "flashback",
};

const ROTATION: FixtureKey[] = ["gold", "silver", "bronze", "wonderkid", "icon", "flashback", "lowReliability"];

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

const rand = () => Math.random().toString(36).slice(2, 8);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const GH_TIMELINE: [string, number, number?][] = [
  ["profile", 300],
  ["repos", 1000, 34],
  ["calendar", 1700],
  ["lazy_commits", 2500, 37],
  ["tests", 3400],
  ["readme", 4300],
  ["code", 5200],
  ["recruiter", 6100],
  ["compare", 7000, 12480],
  ["scoring", 7700],
];
const CV_TIMELINE: [string, number, number?][] = [
  ["pdf", 300],
  ["cv", 1000],
  ["buzzwords", 1800, 3],
  ["buzzwords", 2700, 8],
  ["buzzwords", 3500, 13],
  ["recruiter", 4400],
  ["compare", 5300, 12480],
  ["scoring", 6000],
];

/** ?wait=<secondes> : l'attente simulée ramenée à cette durée, pour voir vite
 * l'ouverture du pack. Jamais à zéro : la scène 3D a besoin de quelques
 * secondes pour se télécharger et se préparer, comme en vrai. */
function waitScale(doneAt: number): number {
  const s = Number(new URLSearchParams(window.location.search).get("wait"));
  return s > 0 ? Math.max(2, s) * 1000 / doneAt : 1;
}

function timelineFor(kind: Kind): { timeline: ProgressEvent[]; doneAt: number } {
  const { timeline, doneAt } = baseTimeline(kind);
  const k = kind === "slow" ? 1 : waitScale(doneAt);
  return { timeline: timeline.map((e) => ({ ...e, at: e.at * k })), doneAt: doneAt * k };
}

function baseTimeline(kind: Kind): { timeline: ProgressEvent[]; doneAt: number } {
  const mk = (t: [string, number, number?][], offset = 0) => t.map(([key, at, n]) => ({ key, at: at + offset, n }));
  if (kind === "cmp") {
    const tl = [...mk(CV_TIMELINE.slice(0, 4)), ...mk(GH_TIMELINE.slice(1), 2800)].sort((a, b) => a.at - b.at);
    return { timeline: tl, doneAt: 10800 };
  }
  if (kind === "cv") return { timeline: mk(CV_TIMELINE), doneAt: 6700 };
  if (kind === "unknown") return { timeline: mk(GH_TIMELINE.slice(0, 1)), doneAt: 1400 };
  if (kind === "org") return { timeline: mk(GH_TIMELINE.slice(0, 1)), doneAt: 1200 };
  if (kind === "slow") return { timeline: mk(GH_TIMELINE), doneAt: 60000 };
  return { timeline: mk(GH_TIMELINE), doneAt: 8400 };
}

// Faits plausibles pour la démo, à la place des « faits fictifs » des fixtures.
const GH_FACTS: Record<StatCode, { fr: string; en: string }[]> = {
  TEC: [
    { fr: "3 repos lus par l'IA, niveau moyen pondéré 3,6 sur 5.", en: "3 repos read by the AI, weighted average level 3.6/5." },
    { fr: "Preuve : src/api/router.ts, gestion d'erreurs typée.", en: "Evidence: src/api/router.ts, typed error handling." },
    { fr: "7 PR fusionnées chez les autres (bonus +4).", en: "7 PRs merged in other people's repos (+4 bonus)." },
  ],
  SHIP: [
    { fr: "44 semaines actives sur 52.", en: "44 active weeks out of 52." },
    { fr: "5 releases ou tags publiés cette année (bonus +5).", en: "5 releases or tags this year (+5 bonus)." },
  ],
  ARCH: [
    { fr: "Tests présents sur 4 des 5 repos actifs.", en: "Tests in 4 of 5 active repos." },
    { fr: "CI sur 3 repos, outillage (eslint, tsconfig strict) sur 4.", en: "CI on 3 repos, tooling (eslint, strict tsconfig) on 4." },
  ],
  DOC: [
    { fr: "2 README sur 5 dépassent 300 mots.", en: "2 of 5 READMEs exceed 300 words." },
    { fr: "42 % de commits paresseux sur les 100 derniers.", en: "42% lazy commits among the last 100." },
  ],
  XP: [
    { fr: "Premier vrai commit : mars 2019, soit 7 ans.", en: "First real commit: March 2019, 7 years ago." },
    { fr: "5 langages avec 10 Ko ou plus (bonus +4).", en: "5 languages with 10 KB or more (+4 bonus)." },
  ],
  BUZZ: [
    { fr: "1 repo tutoriel sur 18.", en: "1 tutorial repo out of 18." },
    { fr: "Messages comme « fix », « wip », « final » : 42 %.", en: "Messages like “fix”, “wip”, “final”: 42%." },
  ],
};
const CV_FACTS: Record<StatCode, { fr: string; en: string }[]> = {
  TEC: [
    { fr: "Séniorité déclarée : lead (88).", en: "Claimed seniority: lead (88)." },
    { fr: "2 technos décrites avec une responsabilité concrète, 17 seulement listées.", en: "2 technologies described with a concrete responsibility, 17 merely listed." },
  ],
  SHIP: [{ fr: "3 projets avec un résultat daté.", en: "3 projects with a dated outcome." }],
  ARCH: [{ fr: "1 mention concrète de tests, CI ou revue de code.", en: "1 concrete mention of tests, CI or code review." }],
  DOC: [
    { fr: "Qualité d'écriture jugée 3 sur 5.", en: "Writing quality rated 3/5." },
    { fr: "CV de 1 340 mots : au-delà de 1 200, moins 10.", en: "1,340-word CV: over 1,200, minus 10." },
  ],
  XP: [{ fr: "11 ans d'expérience déclarés.", en: "11 years of experience claimed." }],
  BUZZ: [
    { fr: "4,2 mots creux pour 100 mots.", en: "4.2 buzzwords per 100 words." },
    { fr: "« passionné » ×4, « synergie » ×2, « disruptif » ×1.", en: "“passionate” ×4, “synergy” ×2, “disruptive” ×1." },
  ],
};

/** L'enquête en direct en démo (§18.26) : huit trouvailles, de la plus banale à la plus folle. */
const NB = " ";
function mockFindings(login: string): Finding[] {
  const gh = `https://github.com/${login}`;
  const f = (kind: string, score: number, fr: string, en: string, key: [string, string], proof = gh): Finding => ({
    kind,
    source: "github",
    score,
    text: { fr, en },
    key: { fr: key[0], en: key[1] },
    proof,
  });
  return [
    f("account_age", 14, `Compte GitHub ouvert en avril${NB}2016\u00a0: 10${NB}ans de maison.`, `GitHub account opened in April${NB}2016: 10${NB}years on the books.`, [`10${NB}ans`, `10${NB}years`]),
    f("top_starred", 44, `Repo le plus étoilé\u00a0: dotfiles, 312${NB}étoiles.`, `Most-starred repo: dotfiles, 312${NB}stars.`, [`312${NB}étoiles`, `312${NB}stars`], `${gh}/dotfiles`),
    f("longest_streak", 47, `Plus longue série de l'année\u00a0: 43${NB}jours de contributions d'affilée.`, `Longest streak of the year: 43${NB}days of contributions in a row.`, [`43${NB}jours`, `43${NB}days`]),
    f("abandoned_repo", 50, "Repo abandonné le plus ancien\u00a0: todo-app-v3, dernier push en 2018.", "Oldest abandoned repo: todo-app-v3, last push in 2018.", ["2018", "2018"], `${gh}/todo-app-v3`),
    f("accomplice", 57, "Complice principal\u00a0: @camroux, 214 commits sur les mêmes repos.", "Main accomplice: @camroux, 214 commits on the same repos.", ["@camroux", "@camroux"], "https://github.com/camroux"),
    f("lazy_message", 58, `Message de commit préféré\u00a0: «\u00a0fix\u00a0», 37${NB}fois.`, `Favourite commit message: “fix”, 37${NB}times.`, [`37${NB}fois`, `37${NB}times`]),
    f("night_share", 70, `61${NB}% des derniers commits partent entre 22${NB}h et 5${NB}h.`, `61% of recent commits go out between 10${NB}p.m. and 5${NB}a.m.`, [`61${NB}%`, "61%"]),
    f("first_commit", 74, `Plus vieux commit retrouvé\u00a0: 14${NB}mars 2016, à 2${NB}h${NB}47 du matin.`, `Oldest commit on record: March${NB}14, 2016, at 2:47${NB}a.m.`, [`14${NB}mars 2016`, `March${NB}14, 2016`]),
  ];
}
/** Les trouvailles tombent après la collecte simulée (un quart de l'attente) : la fiche est prête avant la fin, comme souvent en vrai. */
const FINDINGS_AT = 0.25;
const strongest3 = (list: Finding[]) => [...list].sort((a, b) => b.score - a.score).slice(0, 3);

function withFacts(card: CardData): CardData {
  const bank = card.source === "cv" ? CV_FACTS : GH_FACTS;
  const stats: Stat[] = card.stats.map((s) => ({ ...s, facts: bank[s.code] }));
  return { ...card, stats };
}

function initialsOf(login: string) {
  const parts = login.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(" ");
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase() || "??";
}

function buildCard(key: FixtureKey, id: string, job: MockJob | null): CardData {
  const base = withFacts(FIXTURES[key]);
  const card: CardData = { ...base, id, lang: job?.lang ?? base.lang };
  const login = job?.login;
  if (login && !BY_LOGIN[login.toLowerCase()]) {
    card.name = login;
    card.login = login;
    card.initials = initialsOf(login);
    card.avatarUrl = `https://github.com/${login}.png?size=256`;
  }
  if (photos.has(id)) card.avatarUrl = MOCK_PHOTO;
  if (card.source === "github") card.findings = strongest3(mockFindings(card.login ?? "dev"));
  return card;
}

function buildComparison(id: string, job: MockJob | null): ComparisonData {
  const c = FIXTURE_COMPARISON;
  const cmp: ComparisonData = { ...c, id, cv: withFacts(c.cv), github: withFacts(c.github) };
  const login = job?.login;
  if (login && !BY_LOGIN[login.toLowerCase()]) {
    cmp.github = { ...cmp.github, name: login, login, initials: initialsOf(login), avatarUrl: `https://github.com/${login}.png?size=256` };
    cmp.cv = { ...cmp.cv, name: login, initials: initialsOf(login) };
  }
  cmp.github = { ...cmp.github, findings: strongest3(mockFindings(cmp.github.login ?? "dev")) };
  if (photos.has(id)) {
    cmp.cv = { ...cmp.cv, avatarUrl: MOCK_PHOTO };
    cmp.github = { ...cmp.github, avatarUrl: MOCK_PHOTO };
  }
  return cmp;
}

function kindFromId(id: string): Kind | null {
  const m = /^m-([a-zA-Z]+)-/.exec(id);
  if (!m) return null;
  const k = m[1] as Kind;
  if (k === "cmp" || k in FIXTURES) return k;
  return null;
}

export const mockApi = {
  /** En démo, l'accueil garde la maquette de la carte vitrine. */
  async getShowcase(): Promise<CardData | null> {
    return null;
  },
  async createCard(input: CreateInput): Promise<CreateResult> {
    await sleep(350);
    const login = input.login?.trim();
    const lower = login?.toLowerCase() ?? "";
    if (lower === "ratelimit") {
      throw new ApiError(429, "rate_limited", {
        fr: "Vingt cartes aujourd'hui depuis cette adresse. Reviens demain, ton code n'aura pas bougé.",
        en: "Twenty cards today from this address. Come back tomorrow, your code won't have moved.",
      });
    }
    if (lower === "busy") {
      throw new ApiError(503, "busy", {
        fr: "Le commissariat déborde : trop de dossiers d'un coup, GitHub nous fait souffler. Reviens dans 12 minutes.",
        en: "The station is overflowing: too many suspects at once, GitHub is making us take a breather. Come back in 12 minutes.",
      });
    }
    // « queue » : trois fiches avant, une toutes les 1,5 s, puis la fiche normale.
    const queueMs = lower === "queue" ? 4500 : 0;
    let kind: Kind;
    if (input.cv && login) kind = "cmp";
    else if (input.cv) kind = "cv";
    else if (lower === "unknown") kind = "unknown";
    else if (lower === "org") kind = "org";
    else if (lower === "slow") kind = "slow";
    else kind = BY_LOGIN[lower] ?? ROTATION[hash(lower) % ROTATION.length];
    // Fiche dénoncée : « D » après le type (rand() est en minuscules), pour la reconnaître après un rechargement.
    const id = `m-${kind}-${input.denouncedBy ? "D" : ""}${rand()}`;
    const { timeline, doneAt } = timelineFor(kind);
    jobs.set(id, { kind, start: Date.now() + queueMs, login, lang: input.lang, timeline, doneAt, denouncedBy: input.denouncedBy });
    return { id, deleteToken: `tok-${rand()}`, cached: false };
  },

  async getJob(id: string): Promise<JobState> {
    await sleep(60);
    const job = jobs.get(id) ?? null;
    const kind = job?.kind ?? kindFromId(id);
    if (!kind) throw new ApiError(404, "not_found", null);
    const elapsed = job ? Date.now() - job.start : Infinity;
    if (job && elapsed < 0) return { state: "pending", progress: [], queue: Math.ceil(-elapsed / 1500) };
    if (job && elapsed < job.doneAt) {
      const progress = job.timeline.filter((e) => e.at <= elapsed);
      const github = job.kind !== "cv" && job.kind !== "unknown" && job.kind !== "org";
      if (!github || elapsed < job.doneAt * FINDINGS_AT) return { state: "pending", progress };
      return { state: "pending", progress, findings: mockFindings(job.login || "dev") };
    }
    if (kind === "unknown")
      return {
        state: "error",
        code: "unknown_user",
        message: { fr: "Aucun compte GitHub à ce nom. Vérifie l'orthographe.", en: "No GitHub account by that name. Check the spelling." },
      };
    if (kind === "org")
      return {
        state: "error",
        code: "organization",
        message: { fr: "C'est une organisation. On juge les gens, pas les entreprises.", en: "That's an organization. We judge people, not companies." },
      };
    if (kind === "slow")
      return { state: "error", code: "timeout", message: { fr: "Trop long, on arrête là.", en: "Too long, stopping here." } };
    if (kind === "cmp") return { state: "done", kind: "comparison", comparison: buildComparison(id, job) };
    return { state: "done", kind: "card", card: buildCard(kind as FixtureKey, id, job) };
  },

  /**
   * Dénonciation en démo : /c/m-silver-Dxxxx est une fiche dénoncée anonymement,
   * /c/m-silver-Nxxxx une fiche dénoncée par @leamd (revendiquée). @nour-rs a un compte X.
   */
  async getCase(id: string): Promise<CaseInfo> {
    await sleep(80);
    const job = jobs.get(id) ?? null;
    const marker = /^m-[a-zA-Z]+-([DN])/.exec(id)?.[1];
    const kind = job?.kind ?? kindFromId(id);
    const login = (job?.login ?? (kind && kind in FIXTURES ? FIXTURES[kind as FixtureKey].login : undefined))?.toLowerCase();
    return {
      denounced: !!marker,
      by: marker === "N" ? "leamd" : null,
      x: login === "nour-rs" ? "nour_codes" : null,
      accomplices: MOCK_ACCOMPLICES.filter((a) => a.login !== login),
    };
  },

  async sendEmail(cardId: string, email: string) {
    await sleep(500);
    console.debug("[mock] email", cardId, email);
  },

  setPhoto(id: string) {
    photos.add(id);
  },

  async deleteCard(id: string, token: string) {
    await sleep(400);
    jobs.delete(id);
    console.debug("[mock] delete", id, token);
  },
};
