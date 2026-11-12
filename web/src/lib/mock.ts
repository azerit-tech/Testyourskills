// Mode démo : simule l'API avec les fixtures et une progression réaliste.
// Pseudos spéciaux : "unknown" (inconnu), "org" (organisation), "ratelimit" (429),
// "slow" (attente longue puis timeout). Les pseudos des fixtures donnent leur carte.
// LinkedIn contre GitHub (§18.24) : le pseudo "camille-ardent", ou n'importe quel
// lien linkedin.com/in/… ; linkedin.com/in/sans-github donne la fiche LinkedIn seule ;
// un lien LinkedIn avec le pseudo "x" : face à un GitHub vide, code non prouvé (§18.37).
import type { CardData, ComparisonData, Finding, Grid, JobState, ProgressEvent, Stat, StatCode } from "../../../shared/types";
import { tierFor } from "../../../shared/types";
import { FIXTURES, FIXTURE_COMPARISON } from "../../../shared/fixtures";
import { asLinkedinCard, asLinkedinComparison } from "../../../shared/linkedinText";
import { publicView } from "../../../shared/publicView";
import type { CaseInfo, CreateInput, CreateResult, Jury, Showcase, Verdict } from "./api";
import { ApiError } from "./errors";

type FixtureKey = keyof typeof FIXTURES;
/** licmp : LinkedIn contre GitHub ; liempty : LinkedIn contre un GitHub vide (code non prouvé) ; li : fiche LinkedIn seule. */
type Kind = FixtureKey | "cmp" | "licmp" | "liempty" | "li" | "unknown" | "org" | "slow";

interface MockJob {
  kind: Kind;
  start: number;
  login?: string;
  linkedin?: string;
  lang: "fr" | "en";
  timeline: ProgressEvent[];
  doneAt: number;
  denouncedBy?: string;
}

/** Complices suggérés en démo (§18.6) : des pseudos qui ont leur fixture. */
const MOCK_ACCOMPLICES = ["camroux", "nour-rs", "jplefevre"].map((login) => ({ login, avatarUrl: `https://github.com/${login}.png?size=80` }));

const jobs = new Map<string, MockJob>();
/** Le jury en démo (§18.27) : les votes de la session, par fiche, gardés en mémoire. */
const juries = new Map<string, Jury>();
/** Cartes dont la photo vient de LinkedIn (simulé). */
const photos = new Set<string>();
const MOCK_PHOTO = "/mock-linkedin.svg";
/** La comparaison de la vitrine en démo : un id « licmp », LinkedIn contre GitHub. */
export const MOCK_SHOWCASE_ID = "m-licmp-vitrine";

const BY_LOGIN: Record<string, FixtureKey> = {
  "kevin-dev42": "bronze",
  camroux: "silver",
  leamd: "gold",
  svaaland: "icon",
  otessier: "icon",
  "nour-rs": "wonderkid",
  jplefevre: "flashback",
  "ghost-coder": "lowReliability",
  // une étoile (26), pour la démo du film (§18.36) : 1, 3 (ghost-coder) et 6 étoiles (svaaland)
  x: "unknownLang",
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

/** Décompte de départ plausible, stable pour une même fiche : 18 à 57 votes, 55 à 84 % coupable. */
function juryOf(id: string): Jury {
  let j = juries.get(id);
  if (!j) {
    const h = hash(id);
    const total = 18 + (h % 40);
    const guilty = Math.round((total * (55 + ((h >>> 8) % 30))) / 100);
    j = { guilty, cleared: total - guilty, mine: null };
    juries.set(id, j);
  }
  return j;
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
  if (kind === "licmp" || kind === "liempty") {
    const tl = [...mk(GH_TIMELINE), ...mk([["linkedin_wait", 1300], ["linkedin", 3000]])].sort((a, b) => a.at - b.at);
    return { timeline: tl, doneAt: 9200 };
  }
  if (kind === "li") return { timeline: mk([["linkedin_wait", 300], ["linkedin", 2600], ["recruiter", 3800], ["scoring", 5000]]), doneAt: 5800 };
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
    { fr: "7 PR fusionnées chez les autres.", en: "7 PRs merged in other people's repos." },
  ],
  SHIP: [
    { fr: "44 semaines actives sur 52.", en: "44 active weeks out of 52." },
    { fr: "5 releases ou tags publiés cette année.", en: "5 releases or tags this year." },
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
    { fr: "5 langages avec 10 Ko ou plus.", en: "5 languages with 10 KB or more." },
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
    { fr: "CV de 1 340 mots, au-delà des 1 200 qui se lisent.", en: "1,340-word CV, past the 1,200 that get read." },
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
/** « LinkedIn retrouvé » (§18.24), versé au même dossier. */
const MOCK_LINKEDIN = "https://www.linkedin.com/in/camille-ardent";
function mockLinkedinFinding(url = MOCK_LINKEDIN): Finding {
  return {
    kind: "linkedin_found",
    source: "linkedin",
    score: 32,
    text: { fr: "LinkedIn retrouvé : « Lead developer · Expert React ».", en: "LinkedIn found: “Lead developer · React expert”." },
    key: { fr: "Lead developer · Expert React", en: "Lead developer · React expert" },
    proof: url,
  };
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

/** Les grilles du barème en démo (§18.37), chargées à la demande : hors du bundle de l'accueil. */
type MockGrids = typeof import("./mockGrid");
const loadGrids = (): Promise<MockGrids> => import("./mockGrid");

/** La note de la fiche devient celle de sa grille (§18.37, version (a)) ; les étoiles des fixtures ne bougent pas. */
function graded(card: CardData, grid: Grid | undefined): CardData {
  return grid ? { ...card, grid, overall: grid.overall, tier: tierFor(grid.overall) } : card;
}

function buildCard(key: FixtureKey, id: string, job: MockJob | null, mg: MockGrids): CardData {
  const base = withFacts(FIXTURES[key]);
  let card: CardData = { ...base, id, lang: job?.lang ?? base.lang };
  const login = job?.login;
  if (login && !BY_LOGIN[login.toLowerCase()]) {
    card.name = login;
    card.login = login;
    card.initials = initialsOf(login);
    card.avatarUrl = `https://github.com/${login}.png?size=256`;
  }
  if (photos.has(id)) card.avatarUrl = MOCK_PHOTO;
  if (card.source === "github") card.findings = strongest3(mockFindings(card.login ?? "dev"));
  card = graded(card, card.source === "github" ? mg.githubGridMock(key, card.login ?? "dev") : mg.declaredGridMock("CV"));
  return card;
}

/** Fiche LinkedIn seule : la fiche déclarative, réécrite comme le serveur le fait. */
function buildLinkedinCard(id: string, job: MockJob | null, mg: MockGrids): CardData {
  const base = withFacts(FIXTURES.cv);
  const url = job?.linkedin ?? "https://www.linkedin.com/in/sans-github";
  return graded(asLinkedinCard({ ...base, id, lang: job?.lang ?? base.lang, linkedinUrl: url, findings: [mockLinkedinFinding(url)] }), mg.declaredGridMock("LinkedIn", url));
}

function buildComparison(id: string, job: MockJob | null, mg: MockGrids, linkedin = false, emptyGithub = false): ComparisonData {
  const c = FIXTURE_COMPARISON;
  let cmp: ComparisonData = { ...c, id, cv: withFacts(c.cv), github: withFacts(c.github) };
  // Face à un GitHub vide : la fiche de x.
  if (emptyGithub)
    cmp = {
      ...cmp,
      cv: { ...cmp.cv, name: FIXTURES.unknownLang.name, initials: FIXTURES.unknownLang.initials },
      github: withFacts(FIXTURES.unknownLang),
    };
  const login = job?.login;
  if (login && !BY_LOGIN[login.toLowerCase()]) {
    cmp.github = { ...cmp.github, name: login, login, initials: initialsOf(login), avatarUrl: `https://github.com/${login}.png?size=256` };
    cmp.cv = { ...cmp.cv, name: login, initials: initialsOf(login) };
  }
  const found = mockFindings(cmp.github.login ?? "dev");
  cmp.github = { ...cmp.github, findings: strongest3(linkedin ? [...found, mockLinkedinFinding(job?.linkedin)] : found) };
  // Les notes des deux fiches sont déjà celles de leur grille (75 et 79) : le titre de l'écart ne change pas.
  const grids = mg.comparisonGridsMock(linkedin ? "LinkedIn" : "CV", cmp.github.login ?? "dev", linkedin ? (job?.linkedin ?? MOCK_LINKEDIN) : undefined, emptyGithub);
  cmp = { ...cmp, cv: graded(cmp.cv, grids.cv), github: graded(cmp.github, grids.github), grid: grids.grid };
  if (linkedin) cmp = asLinkedinComparison(cmp);
  // Un login tapé en démo, inconnu des fixtures : rien ne relie ce GitHub au LinkedIn (§18.24), comme le serveur le dirait.
  if (linkedin && login && !BY_LOGIN[login.toLowerCase()]) cmp = { ...cmp, linkUnproven: true };
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
  if (k === "cmp" || k === "licmp" || k === "liempty" || k === "li" || k in FIXTURES) return k;
  return null;
}

export const mockApi = {
  /**
   * En démo, la maquette de la carte vitrine, jugée avec son LinkedIn (§18.35) :
   * ses deux pièces sous la carte (§18.36), le lien vers un dossier LinkedIn de démo.
   */
  async getShowcase(): Promise<Showcase> {
    return { card: FIXTURES.jmougeot, href: `/c/${MOCK_SHOWCASE_ID}`, pieces: ["linkedin", "github"] };
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
    if (input.linkedin && lower === "x") kind = "liempty";
    else if (input.linkedin) kind = login || !/\/in\/sans-github$/.test(input.linkedin) ? "licmp" : "li";
    else if (lower === "camille-ardent") kind = "licmp";
    else if (input.cv && login) kind = "cmp";
    else if (input.cv) kind = "cv";
    else if (lower === "unknown") kind = "unknown";
    else if (lower === "org") kind = "org";
    else if (lower === "slow") kind = "slow";
    else kind = BY_LOGIN[lower] ?? ROTATION[hash(lower) % ROTATION.length];
    // Fiche dénoncée : « D » après le type (rand() est en minuscules), pour la reconnaître après un rechargement.
    const id = `m-${kind}-${input.denouncedBy ? "D" : ""}${rand()}`;
    const { timeline, doneAt } = timelineFor(kind);
    jobs.set(id, { kind, start: Date.now() + queueMs, login, linkedin: input.linkedin, lang: input.lang, timeline, doneAt, denouncedBy: input.denouncedBy });
    return { id, deleteToken: `tok-${rand()}`, cached: false };
  },

  /**
   * `me` : le login connecté en démo (« C'est moi »). Comme le serveur (shared/publicView.ts),
   * une fiche dénoncée (/c/m-…-D…, /c/m-…-N…, ou faite ici avec un dénonciateur) part sans
   * grille tant que la personne fichée ne l'a pas revendiquée ; /c/m-…-C… est dénoncée et revendiquée.
   */
  async getJob(id: string, me: string | null = null): Promise<JobState> {
    const state = await mockApi.engineJob(id);
    if (state.state !== "done") return state;
    const main = state.kind === "card" ? state.card : state.comparison.github;
    const marker = /^m-[a-zA-Z]+-([DNC])/.exec(id)?.[1];
    const denounced = !!jobs.get(id)?.denouncedBy || !!marker;
    const claimed = marker === "C" || (!!me && me === main.login?.toLowerCase());
    if (!denounced || claimed) return state;
    return state.kind === "card"
      ? { ...state, card: publicView(state.card, { thirdParty: true }) }
      : { ...state, comparison: publicView(state.comparison, { thirdParty: true }) };
  },

  /** La fiche de démo telle que le moteur la sort, avant la vue publique. */
  async engineJob(id: string): Promise<JobState> {
    await sleep(60);
    const job = jobs.get(id) ?? null;
    const kind = job?.kind ?? kindFromId(id);
    if (!kind) throw new ApiError(404, "not_found", null);
    const elapsed = job ? Date.now() - job.start : Infinity;
    if (job && elapsed < 0) return { state: "pending", progress: [], queue: Math.ceil(-elapsed / 1500) };
    if (job && elapsed < job.doneAt) {
      const progress = job.timeline.filter((e) => e.at <= elapsed);
      const github = job.kind !== "cv" && job.kind !== "li" && job.kind !== "unknown" && job.kind !== "org";
      const li = progress.some((e) => e.key === "linkedin") ? [mockLinkedinFinding(job.linkedin)] : [];
      if (!github || elapsed < job.doneAt * FINDINGS_AT) return { state: "pending", progress, ...(li.length ? { findings: li } : {}) };
      return { state: "pending", progress, findings: [...mockFindings(job.login || "dev"), ...li] };
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
    const mg = await loadGrids();
    if (kind === "cmp" || kind === "licmp" || kind === "liempty")
      return { state: "done", kind: "comparison", comparison: buildComparison(id, job, mg, kind !== "cmp", kind === "liempty") };
    if (kind === "li") return { state: "done", kind: "card", card: buildLinkedinCard(id, job, mg) };
    return { state: "done", kind: "card", card: buildCard(kind as FixtureKey, id, job, mg) };
  },

  /**
   * Dénonciation en démo : /c/m-silver-Dxxxx est une fiche dénoncée anonymement,
   * /c/m-silver-Nxxxx une fiche dénoncée par @leamd (le dénonciateur nommé), /c/m-silver-Cxxxx
   * une fiche dénoncée que la personne fichée a revendiquée. @nour-rs a un compte X.
   */
  async getCase(id: string): Promise<CaseInfo> {
    await sleep(80);
    const job = jobs.get(id) ?? null;
    const marker = /^m-[a-zA-Z]+-([DNC])/.exec(id)?.[1];
    const kind = job?.kind ?? kindFromId(id);
    const login = (job?.login ?? (kind && kind in FIXTURES ? FIXTURES[kind as FixtureKey].login : undefined))?.toLowerCase();
    return {
      denounced: !!marker || !!job?.denouncedBy,
      by: marker === "N" ? "leamd" : null,
      x: login === "nour-rs" ? "nour_codes" : null,
      accomplices: MOCK_ACCOMPLICES.filter((a) => a.login !== login),
      jury: { ...juryOf(id) },
    };
  },

  /** Un vote par fiche, comme le serveur : le premier reste. */
  async vote(id: string, verdict: Verdict): Promise<Jury> {
    await sleep(250);
    const j = juryOf(id);
    if (!j.mine) juries.set(id, { ...j, [verdict]: j[verdict] + 1, mine: verdict });
    return { ...juryOf(id) };
  },

  async sendEmail(cardId: string, email: string) {
    await sleep(500);
    console.debug("[mock] email", cardId, email);
  },

  setPhoto(id: string) {
    photos.add(id);
  },

  /**
   * Les images de partage en démo : le serveur ne les rend pas. Un carton à leur taille
   * (portrait 1080 × 1350, story 1080 × 1920) suffit pour essayer le partage de fichier sur un téléphone.
   */
  async portrait(kind: "portrait" | "story" = "portrait"): Promise<Blob | null> {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = kind === "story" ? 1920 : 1350;
      const g = canvas.getContext("2d");
      if (!g) return null;
      const mid = canvas.height / 2;
      g.fillStyle = "#0c0d1b";
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.textAlign = "center";
      g.fillStyle = "#fff9cb";
      g.font = "700 104px 'Barlow Condensed', 'Arial Narrow', sans-serif";
      g.fillText("TESTYOURSKILLS", 540, mid - 15);
      g.fillStyle = "#ffb2c6";
      g.font = "500 44px Outfit, system-ui, sans-serif";
      g.fillText("Mode démo · image fictive", 540, mid + 65);
      return await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
    } catch {
      return null;
    }
  },

  async deleteCard(id: string, token: string) {
    await sleep(400);
    jobs.delete(id);
    console.debug("[mock] delete", id, token);
  },
};
