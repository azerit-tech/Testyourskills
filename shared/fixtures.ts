// Cartes fictives pour la maquette, la galerie et les tests de rendu.
import profilesJson from "../data/profiles.json";
import sentencesJson from "../data/sentences.json";
import type { CardData, CardProfile, CardSentence, ComparisonData, Fact, Stat, StatCode, StatusInstance } from "./types";
import { STAT_CODES, tierFor } from "./types";

/** Profil du catalogue (data/profiles.json), choisi à la main pour la maquette. */
function profile(id: string): CardProfile {
  const d = profilesJson.profiles.find((p) => p.id === id)!;
  return { id: d.id, label: d.label, tagline: d.tagline };
}

type Axis = keyof typeof sentencesJson.sentences;

/** Peine de la maquette : axe et n posés à la main, textes de data/sentences.json. */
function sentence(axis: Axis | "acquittal", n = 1, bailId?: keyof typeof sentencesJson.bail): CardSentence {
  if (axis === "acquittal") return { label: sentencesJson.acquittal };
  const tpl: Fact = n === 1 ? sentencesJson.sentences[axis].labelOne : sentencesJson.sentences[axis].label;
  const label = { fr: tpl.fr.replace("{n}", String(n)), en: tpl.en.replace("{n}", String(n)) };
  return bailId ? { label, bail: sentencesJson.bail[bailId] } : { label };
}

/** Faits de la maquette, dans la tournure du barème (server/src/scoring/github.ts),
 *  chiffrés d'après la valeur pour que le dos de la fiche (§18.27) se lise comme en vrai. */
const MOCK_FACTS: Record<StatCode, (v: number) => Fact> = {
  TEC: (v) => ({ fr: `Niveau lu par l'IA : ${(v / 20).toFixed(1).replace(".", ",")}/5 sur 4 repos`, en: `Level read by the AI: ${(v / 20).toFixed(1)}/5 across 4 repos` }),
  SHIP: (v) => ({ fr: `${Math.round((v / 99) * 52)} semaines actives sur 52`, en: `${Math.round((v / 99) * 52)} active weeks out of 52` }),
  ARCH: (v) => ({ fr: `Tests trouvés dans ${Math.max(0, Math.round(v / 14))} repos sur 7`, en: `Tests found in ${Math.max(0, Math.round(v / 14))} of 7 repos` }),
  DOC: (v) => ({ fr: `README de 150 mots ou plus : ${Math.round(v / 14)} repos sur 7`, en: `README of 150+ words: ${Math.round(v / 14)} of 7 repos` }),
  XP: (v) => ({ fr: `Premier vrai commit en ${2026 - Math.round(v / 8)} (il y a ${Math.round(v / 8)} ans)`, en: `First real commit in ${2026 - Math.round(v / 8)} (${Math.round(v / 8)} years ago)` }),
  BUZZ: (v) => ({ fr: `${Math.round(v / 10)} repos tutoriels sur 31`, en: `${Math.round(v / 10)} tutorial repos out of 31` }),
};

function stats(values: Record<StatCode, number>, insufficient: StatCode[] = []): Stat[] {
  return STAT_CODES.map((code) => ({
    code,
    value: values[code],
    sufficient: !insufficient.includes(code),
    facts: [MOCK_FACTS[code](values[code])],
  }));
}

function overallOf(v: Record<StatCode, number>) {
  return Math.round(v.TEC * 0.3 + v.SHIP * 0.2 + v.ARCH * 0.2 + v.DOC * 0.15 + v.XP * 0.15);
}

const S = {
  lazy: { id: "gh_lazy_commits", tone: "negative", label: { fr: "Commits : fix, fix2, final fix", en: "Commits: fix, fix2, final fix" }, rule: { fr: "42 % de commits paresseux (seuil 40 %).", en: "42% lazy commits (threshold 40%)." } },
  noTests: { id: "gh_no_tests", tone: "negative", label: { fr: "Tests : bientôt", en: "Tests: coming soon" }, rule: { fr: "Aucun test sur les 5 repos actifs.", en: "No tests across the 5 active repos." } },
  friday: { id: "gh_friday_push", tone: "negative", label: { fr: "Push sur main le vendredi soir", en: "Pushes to main on Friday night" }, rule: { fr: "31 % des commits le vendredi après 18 h.", en: "31% of commits on Friday after 6pm." } },
  ship: { id: "gh_ship_or_nothing", tone: "positive", label: { fr: "Ship ou rien", en: "Ship or nothing" }, rule: { fr: "SHIP ≥ 85.", en: "SHIP ≥ 85." } },
  maintainer: { id: "gh_maintainer", tone: "positive", label: { fr: "Maintient des projets", en: "Maintainer" }, rule: { fr: "Un repo avec 10 contributeurs externes ou plus.", en: "A repo with 10+ outside contributors." } },
  stars: { id: "gh_read_by_others", tone: "positive", label: { fr: "Code lu par d'autres", en: "Read by others" }, rule: { fr: "100 stars cumulées ou plus.", en: "100+ total stars." } },
  tutorial: { id: "gh_finished_tutorial", tone: "negative", label: { fr: "A fini le tutoriel", en: "Finished the tutorial" }, rule: { fr: "3 repos tutoriels ou plus.", en: "3+ tutorial repos." } },
  archeo: { id: "gh_archaeologist", tone: "special", label: { fr: "Archéologue", en: "Archaeologist" }, rule: { fr: "64 % de l'activité a plus de 5 ans.", en: "64% of activity is over 5 years old." } },
  typed: { id: "ai_typed", tone: "positive", byAI: true, label: { fr: "Typage jusqu'au bout", en: "Typed all the way down" }, rule: { fr: "Choisi par l'IA après lecture du code.", en: "Picked by the AI after reading the code." } },
  senior: { id: "cv_senior_from_cv", tone: "gap", label: { fr: "Senior depuis le CV", en: "Senior since the CV" }, rule: { fr: "8 ans déclarés, 3 ans sur GitHub.", en: "8 years claimed, 3 on GitHub." } },
  passion: { id: "cv_passion", tone: "negative", label: { fr: "Passion citée 4 fois", en: "Passionate (mentioned 4 times)" }, rule: { fr: "« passionné » apparaît 4 fois.", en: "\"passionate\" appears 4 times." } },
  buzz: { id: "cv_buzzwords", tone: "negative", label: { fr: "Agile, synergie, disruptif", en: "Agile, synergy, disruptive" }, rule: { fr: "3,4 mots creux pour 100 mots.", en: "3.4 buzzwords per 100 words." } },
  privateTalent: { id: "gh_private_talent", tone: "special", label: { fr: "Repo privé, talent privé", en: "Private repos, private talent" }, rule: { fr: "Moins de 3 repos publics.", en: "Fewer than 3 public repos." } },
} satisfies Record<string, StatusInstance>;

function card(p: Partial<CardData> & { v: Record<StatCode, number>; insufficient?: StatCode[] }): CardData {
  const overall = overallOf(p.v);
  const insufficient = p.insufficient ?? [];
  return {
    id: p.id ?? "demo",
    source: p.source ?? "github",
    createdAt: "2026-10-14T12:00:00Z",
    scoringVersion: "0.1.0",
    name: p.name ?? "Demo",
    login: p.login,
    avatarUrl: p.avatarUrl,
    initials: p.initials ?? "DM",
    overall,
    tier: tierFor(overall),
    special: p.special,
    position: p.position ?? "FS",
    mainLanguage: p.mainLanguage,
    club: p.club ?? null,
    stats: stats(p.v, insufficient),
    statuses: p.statuses ?? [],
    profile: p.profile,
    sentence: p.sentence,
    reliability: Math.min(95, (5 - insufficient.filter((c) => c !== "BUZZ").length) * 19),
    judgedInSeconds: p.judgedInSeconds ?? 9,
    lang: p.lang ?? "fr",
  };
}

export const FIXTURES = {
  /** La carte de Jacques (fondateur d'Azerit), exemple de l'accueil (§6.1). Nom, pseudo,
   *  avatar, langage et club sont réels ; les notes sont une maquette, remplacée par la
   *  vraie carte dès que le serveur l'a calculée (GET /api/showcase). */
  jmougeot: card({ id: "jmougeot", profile: profile("delivery_machine"), sentence: sentence("DOC", 2, "gh_friday_push"), name: "Jacques Mougeot", login: "jmougeot", avatarUrl: "/jmougeot-linkedin.jpg", initials: "JM", position: "FS", mainLanguage: "python", club: "Azerit", v: { TEC: 80, SHIP: 88, ARCH: 72, DOC: 70, XP: 60, BUZZ: 24 }, statuses: [S.ship, S.typed, S.friday] }),
  bronze: card({ id: "bronze", profile: profile("repeat_offender"), sentence: sentence("ARCH", 10, "gh_lazy_commits"), name: "kevin-dev42", login: "kevin-dev42", initials: "KD", position: "FE", mainLanguage: "javascript", v: { TEC: 48, SHIP: 41, ARCH: 30, DOC: 44, XP: 52, BUZZ: 81 }, statuses: [S.lazy, S.noTests, S.tutorial], judgedInSeconds: 7 }),
  silver: card({ id: "silver", profile: profile("arsonist"), sentence: sentence("ARCH", 4, "gh_friday_push"), name: "Camille Roux", login: "camroux", initials: "CR", position: "BE", mainLanguage: "python", club: "Pharelune Santé", v: { TEC: 68, SHIP: 72, ARCH: 61, DOC: 66, XP: 70, BUZZ: 34 }, statuses: [S.friday, S.stars] }),
  gold: card({ id: "gold", profile: profile("delivery_machine"), sentence: sentence("DOC", 2, "gh_lazy_commits"), name: "Léa Martin-Dubois", login: "leamd", initials: "LM", position: "FS", mainLanguage: "typescript", club: "Brindavelle", v: { TEC: 82, SHIP: 88, ARCH: 76, DOC: 71, XP: 74, BUZZ: 22 }, statuses: [S.typed, S.lazy, S.ship] }),
  icon: card({ id: "icon", profile: profile("kingpin"), sentence: sentence("acquittal"), name: "Sigrun Vaaland", login: "svaaland", avatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4", initials: "SV", position: "FE", mainLanguage: "typescript", v: { TEC: 94, SHIP: 97, ARCH: 92, DOC: 93, XP: 99, BUZZ: 12 }, statuses: [S.maintainer, S.stars, S.ship] }),
  wonderkid: card({ id: "wonderkid", profile: profile("fresh_blood"), sentence: sentence("DOC", 4), name: "Nour", login: "nour-rs", initials: "NO", position: "EMB", mainLanguage: "rust", special: "wonderkid", v: { TEC: 78, SHIP: 74, ARCH: 70, DOC: 62, XP: 38, BUZZ: 18 }, statuses: [S.typed, S.ship] }),
  flashback: card({ id: "flashback", profile: profile("old_school"), sentence: sentence("SHIP", 10, "gh_archaeologist"), name: "Jean-Pierre Lefèvre", login: "jplefevre", initials: "JL", position: "BE", mainLanguage: "c", club: null, special: "flashback", v: { TEC: 80, SHIP: 32, ARCH: 58, DOC: 69, XP: 95, BUZZ: 14 }, statuses: [S.archeo, S.stars] }),
  cv: card({ id: "cv", profile: profile("forger"), sentence: sentence("ARCH", 4, "cv_buzzwords"), source: "cv", name: "Maxime Bernard", initials: "MB", position: "CTO", club: "Stealth Startup", v: { TEC: 86, SHIP: 70, ARCH: 60, DOC: 65, XP: 88, BUZZ: 92 }, insufficient: [], statuses: [S.buzz, S.passion, S.senior], judgedInSeconds: 6 }),
  lowReliability: card({ id: "low", profile: profile("ghost"), sentence: sentence("DOC", 9, "gh_private_talent"), name: "ghost-coder", login: "ghost-coder", initials: "GC", position: "BE", mainLanguage: "go", v: { TEC: 55, SHIP: 38, ARCH: 40, DOC: 35, XP: 60, BUZZ: 20 }, insufficient: ["TEC", "ARCH", "DOC"], statuses: [S.privateTalent] }),
  // Cas limites ajoutés pour la maquette (galerie et rendus PNG).
  totw: card({ id: "totw", profile: profile("kingpin"), sentence: sentence("DOC", 1, "gh_friday_push"), name: "Octo Cat", login: "octocat", avatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4", initials: "OC", position: "OPS", mainLanguage: "hcl", club: "Octorive", special: "totw", v: { TEC: 84, SHIP: 91, ARCH: 86, DOC: 78, XP: 80, BUZZ: 16 }, statuses: [S.ship, S.maintainer, S.friday] }),
  photo: card({ id: "photo", profile: profile("sleeper_agent"), sentence: sentence("SHIP", 2, "gh_no_tests"), name: "Inès Haddad", login: "ines-h", avatarUrl: "https://randomuser.me/api/portraits/women/44.jpg", initials: "IH", position: "DATA", mainLanguage: "jupyter notebook", club: "Graphéole", v: { TEC: 76, SHIP: 70, ARCH: 72, DOC: 81, XP: 66, BUZZ: 28 }, statuses: [S.noTests, S.stars] }),
  githubPhoto: card({ id: "ghphoto", profile: profile("kingpin"), sentence: sentence("acquittal"), name: "Odile T.", login: "otessier", avatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4", initials: "OT", position: "EMB", mainLanguage: "c", club: "Fondation Noyaubourg", v: { TEC: 92, SHIP: 95, ARCH: 88, DOC: 84, XP: 99, BUZZ: 10 }, statuses: [S.maintainer, S.lazy] }),
  longName: card({ id: "long", profile: profile("hoarder"), sentence: sentence("ARCH", 5, "gh_repos_alive"), name: "Marie-Charlotte Vandenberghe-Lefebvre de Montmorency", login: "mcvl", initials: "MV", position: "MOB", mainLanguage: "kotlin", club: "Compagnie Lagunaire de Logiciels Bancaires & d'Investissement Portuaire", v: { TEC: 63, SHIP: 66, ARCH: 58, DOC: 70, XP: 72, BUZZ: 55 }, statuses: [
    { id: "gh_repos_alive", tone: "negative", label: { fr: "48 repos, 3 vivants (et encore, ça dépend des jours)", en: "48 repos, 3 alive (on a good day, if the CI agrees)" }, rule: { fr: "48 repos, 6 % actifs.", en: "48 repos, 6% active." } },
    { id: "ai_franglais", tone: "negative", byAI: true, label: { fr: "Commentaires en franglais dans tout le code source du projet", en: "Franglais comments all over the source code of every project" }, rule: { fr: "Choisi par l'IA.", en: "Picked by the AI." } },
    S.senior,
  ] }),
  english: card({ id: "english", profile: profile("mastermind"), sentence: sentence("DOC", 1, "gh_friday_push"), name: "Priya Natarajan", login: "priyan", initials: "PN", position: "ML", mainLanguage: "python", club: null, lang: "en", v: { TEC: 88, SHIP: 79, ARCH: 81, DOC: 76, XP: 70, BUZZ: 30 }, insufficient: ["SHIP"], statuses: [S.typed, S.friday, S.stars] }),
  unknownLang: card({ id: "unknown", profile: profile("ghost"), sentence: sentence("DOC", 12, "gh_private_talent"), name: "x", login: "x", initials: "X", position: "SEC", mainLanguage: "brainfuck", v: { TEC: 30, SHIP: 22, ARCH: 25, DOC: 20, XP: 28, BUZZ: 99 }, insufficient: ["TEC", "SHIP", "ARCH", "DOC", "XP"], statuses: [S.privateTalent, S.tutorial], judgedInSeconds: 3 }),
};

/** Un dossier à deux pièces (§18.36) : la pièce déclarative et la pièce GitHub, sans écart. */
export const FIXTURE_COMPARISON: ComparisonData = {
  id: "cmp-demo",
  createdAt: "2026-10-14T12:00:00Z",
  cv: { ...FIXTURES.cv, name: "Léa Martin-Dubois", initials: "LM" },
  github: FIXTURES.gold,
};
