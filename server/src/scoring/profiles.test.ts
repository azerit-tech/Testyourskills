import { describe, expect, it } from "vitest";
import type { CardData, StatCode, StatusInstance } from "../../../shared/types";
import { cvCounts, cvReading, daysAgo, facts, repo } from "./__fixtures__/make";
import { PROFILES, SENTENCES, STATUSES } from "./config";
import { deriveGithub } from "./derive";
import { compareCards, scoreCv, scoreGithub } from "./index";
import { PROFILE_RULES, pickProfile, profileWithComparison, sentenceFor, type ProfileCtx } from "./profiles";
import { RULES } from "./rules";

/** Stats neutres : aucune règle de stat ne se déclenche. */
const N: Record<StatCode, number> = { TEC: 50, SHIP: 50, ARCH: 50, DOC: 50, XP: 60, BUZZ: 20 };
const gh = (f = facts()) => ({ facts: f, m: deriveGithub(f) });
const pick = (ctx: Partial<ProfileCtx> = {}) => pickProfile({ stats: N, github: gh(), ...ctx }).id;
const commitsAt = (date: string, message?: string) =>
  facts().commits.map((c) => ({ ...c, date, ...(message ? { message } : {}) }));
const opts = { lang: "fr" as const, judgedInSeconds: 5 };
/** Fiche GitHub de nuit, sans SHIP à 85 (20 semaines actives) : Oiseau de nuit. */
const nightFacts = () => facts({ commits: commitsAt("2026-10-07T02:30:00Z"), calendar: { available: true, weeksActive: 20, weeks: 52, totalContributions: 300 } });

describe("catalogue data/profiles.json", () => {
  it("13 profils, ids uniques, règles implémentées, repli en dernier", () => {
    const defs = PROFILES.profiles;
    expect(defs.map((d) => d.id)).toEqual([
      "forger", "kingpin", "mastermind", "delivery_machine", "night_owl", "arsonist", "repeat_offender",
      "hoarder", "chameleon", "fresh_blood", "old_school", "ghost", "sleeper_agent",
    ]);
    expect(defs.filter((d) => d.fallback).map((d) => d.id)).toEqual(["sleeper_agent"]);
    for (const d of defs) {
      for (const c of [...(d.any ?? []), ...(d.all ?? [])]) expect(PROFILE_RULES[c.rule] ?? RULES[c.rule], `${d.id} ${c.rule}`).toBeTypeOf("function");
      if (!d.fallback) expect((d.any?.length ?? 0) + (d.all?.length ?? 0), d.id).toBeGreaterThan(0);
    }
  });

  it("nom et accroche en fr et en, accroche de 60 signes au plus, sans placeholder", () => {
    for (const d of PROFILES.profiles) {
      for (const lang of ["fr", "en"] as const) {
        expect(d.label[lang].trim(), `${d.id} ${lang}`).toBeTruthy();
        expect([...d.tagline[lang]].length, `${d.id} ${lang} : ${d.tagline[lang]}`).toBeLessThanOrEqual(60);
        expect(`${d.label[lang]} ${d.tagline[lang]}`).not.toMatch(/[{}]/);
      }
    }
  });
});

// Principe 4 jusque dans la grammaire (§18.2) : aucun mot qui suppose un genre.
const GENDERED_FR = [
  "il", "ils", "elle", "elles", "lui", "celui", "celle", "ceux", "celles", "seul", "seule", "seuls", "seules",
  "condamné", "condamnée", "recherché", "recherchée", "relaxé", "relaxée", "arrêté", "arrêtée", "accusé", "accusée",
  "inculpé", "inculpée", "acquitté", "acquittée", "fiché", "fichée", "doué", "douée", "né", "née",
  "beau", "belle", "nouveau", "nouvelle", "ancien", "ancienne", "parrain", "marraine", "patron", "patronne",
  "roi", "reine", "prince", "princesse", "homme", "femme", "gars", "fille", "mec", "meuf", "monsieur", "madame",
  "collectionneur", "collectionneuse", "voleur", "voleuse", "receleur", "receleuse", "tueur", "tueuse", "parleur", "parleuse",
  "agent", "agente", "dormant", "lui-même", "elle-même",
];
const GENDERED_EN = [
  "he", "she", "his", "her", "hers", "him", "himself", "herself", "he's", "she's",
  "man", "men", "woman", "women", "guy", "guys", "girl", "boy", "king", "kingpin", "queen", "godfather", "godmother",
  "mr", "mrs", "ms", "lady", "gentleman", "sir", "madam", "brother", "sister", "bro",
];

function genderedWords(text: string, words: string[]): string[] {
  const tokens = new Set(text.toLowerCase().split(/[^\p{L}'’-]+/u).flatMap((t) => [t, ...t.split(/['’-]/)]));
  const hits = [...tokens].filter((t) => words.includes(t));
  // Écriture inclusive ou accord entre parenthèses : signe qu'on a accordé à la personne.
  if (/[·•.]e\b|\(e\)|·es?\b/u.test(text)) hits.push("accord inclusif");
  return hits;
}

describe("aucun mot genré dans les noms, accroches, peines et cautions", () => {
  const texts: [string, string, "fr" | "en"][] = [];
  for (const d of PROFILES.profiles) for (const l of ["fr", "en"] as const) texts.push([`${d.id}.label.${l}`, d.label[l], l], [`${d.id}.tagline.${l}`, d.tagline[l], l]);
  for (const [axis, s] of Object.entries(SENTENCES.sentences))
    for (const l of ["fr", "en"] as const) texts.push([`${axis}.label.${l}`, s.label[l], l], [`${axis}.labelOne.${l}`, s.labelOne[l], l]);
  for (const [id, f] of Object.entries(SENTENCES.bail)) for (const l of ["fr", "en"] as const) texts.push([`bail.${id}.${l}`, f[l], l]);
  for (const l of ["fr", "en"] as const) texts.push([`acquittal.${l}`, SENTENCES.acquittal[l], l]);

  it.each(texts)("%s", (_key, text, lang) => {
    expect(genderedWords(text, lang === "fr" ? GENDERED_FR : GENDERED_EN)).toEqual([]);
  });

  it("le test attrape bien les mots interdits", () => {
    expect(genderedWords("Il livre, elle teste", GENDERED_FR)).toEqual(["il", "elle"]);
    expect(genderedWords("Condamné·e à relire", GENDERED_FR)).toContain("accord inclusif");
    expect(genderedWords("Ships before his coffee", GENDERED_EN)).toEqual(["his"]);
    expect(genderedWords("Le Parrain du code", GENDERED_FR)).toEqual(["parrain"]);
  });
});

describe("un profil par règle, dans l'ordre de priorité", () => {
  it("Sous couverture : le CV vaut 15 points de plus que le code", () => {
    expect(pick({ comparison: { cvOverall: 75, githubOverall: 60, cvBuzz: 20 } })).toBe("forger");
    expect(pick({ comparison: { cvOverall: 74, githubOverall: 60, cvBuzz: 20 } })).toBe("sleeper_agent");
    // Face à un GitHub vide (« dossier vide »), l'écart ne prouve rien.
    expect(pick({ comparison: { cvOverall: 75, githubOverall: 20, cvBuzz: 20, githubEmpty: true } })).toBe("sleeper_agent");
  });

  it("Sous couverture : BUZZ du CV à 85 ou plus, jamais le BUZZ d'une fiche GitHub", () => {
    const cv = { reading: cvReading(), counts: cvCounts(), buzzPer100: 6 };
    expect(pickProfile({ stats: { ...N, BUZZ: 85 }, cv }).id).toBe("forger");
    expect(pickProfile({ stats: { ...N, BUZZ: 84 }, cv }).id).toBe("sleeper_agent");
    expect(pick({ stats: { ...N, BUZZ: 95 } })).toBe("sleeper_agent");
  });

  it("Légende du milieu : dix PR fusionnées chez les autres, ou dix contributeurs externes", () => {
    expect(pick({ github: gh(facts({ externalMergedPRs: 10 })) })).toBe("kingpin");
    expect(pick({ github: gh(facts({ externalMergedPRs: 9 })) })).toBe("sleeper_agent");
    const repos = [repo("a", { externalContributors: 10 }), repo("b"), repo("c"), repo("d"), repo("e")];
    expect(pick({ github: gh(facts({ repos })) })).toBe("kingpin");
  });

  it("Cerveau : ARCH à 80 et TEC à 75", () => {
    expect(pick({ stats: { ...N, ARCH: 80, TEC: 75 } })).toBe("mastermind");
    expect(pick({ stats: { ...N, ARCH: 80, TEC: 74 } })).toBe("sleeper_agent");
    expect(pick({ stats: { ...N, ARCH: 79, TEC: 99 } })).toBe("sleeper_agent");
  });

  it("Machine à livrer : SHIP à 85", () => {
    expect(pick({ stats: { ...N, SHIP: 85 } })).toBe("delivery_machine");
    expect(pick({ stats: { ...N, SHIP: 84 } })).toBe("sleeper_agent");
  });

  it("Oiseau de nuit : 15 % des commits entre 1 h et 5 h", () => {
    expect(pick({ github: gh(facts({ commits: commitsAt("2026-10-07T02:30:00Z") })) })).toBe("night_owl");
  });

  it("Pyromane : 30 % des commits le vendredi après 18 h", () => {
    expect(pick({ github: gh(facts({ commits: commitsAt("2026-10-09T19:30:00Z") })) })).toBe("arsonist");
  });

  it("Récidiviste : 40 % de commits paresseux", () => {
    expect(pick({ github: gh(facts({ commits: commitsAt("2026-10-07T10:00:00Z", "fix") })) })).toBe("repeat_offender");
  });

  it("Écureuil : dix repos ou plus, 20 % vivants au plus", () => {
    const repos = Array.from({ length: 12 }, (_, i) => repo(`r${i}`, { pushedAt: i < 2 ? daysAgo(10) : daysAgo(800) }));
    expect(pick({ github: gh(facts({ repos, activeRepos: ["r0", "r1", "r2", "r3", "r4"] })) })).toBe("hoarder");
  });

  it("Caméléon : six langages ou plus", () => {
    const languages = { A: 20_000, B: 20_000, C: 20_000, D: 20_000, E: 20_000, F: 20_000 };
    const repos = [repo("a", { languages }), repo("b"), repo("c"), repo("d"), repo("e")];
    expect(pick({ github: gh(facts({ repos })) })).toBe("chameleon");
  });

  it("Jeune pousse : la règle de la carte Débarque en ville", () => {
    expect(pick({ stats: { ...N, XP: 44, TEC: 70 } })).toBe("fresh_blood");
    expect(pick({ stats: { ...N, XP: 45, TEC: 70 } })).toBe("sleeper_agent");
  });

  it("Vieille école : la règle d'Affaire classée", () => {
    const g = gh();
    expect(pick({ github: { ...g, m: { ...g.m, flashback: true, oldActivityShare: 0.7 } } })).toBe("old_school");
  });

  it("Fantôme : moins de trois repos publics", () => {
    const repos = [repo("a"), repo("b")];
    expect(pick({ github: gh(facts({ repos, activeRepos: ["a", "b"] })) })).toBe("ghost");
  });

  it("Cellule dormante : repli quand rien ne s'applique", () => {
    expect(pick()).toBe("sleeper_agent");
    expect(pickProfile({ stats: N }).id).toBe("sleeper_agent");
  });

  it("la première règle vraie gagne", () => {
    const night = facts({ commits: commitsAt("2026-10-07T02:30:00Z", "fix"), externalMergedPRs: 12 });
    expect(pick({ github: gh(night), stats: { ...N, SHIP: 90 } })).toBe("kingpin");
    expect(pick({ github: gh({ ...night, externalMergedPRs: 0 }), stats: { ...N, SHIP: 90 } })).toBe("delivery_machine");
    expect(pick({ github: gh({ ...night, externalMergedPRs: 0 }) })).toBe("night_owl");
  });

  it("même entrée, même profil", () => {
    const f = facts({ commits: commitsAt("2026-10-09T19:30:00Z") });
    expect(pick({ github: gh(f) })).toBe(pick({ github: gh(f) }));
  });
});

describe("la fiche porte son profil et sa peine", () => {
  it("fiche GitHub", () => {
    const card = scoreGithub(nightFacts(), null, opts);
    expect(card.profile?.id).toBe("night_owl");
    expect(card.profile?.label).toEqual({ fr: "Oiseau de nuit", en: "Night owl" });
    expect(card.sentence?.label.fr).toMatch(/^Peine : |^Relaxe/);
  });

  it("fiche CV : le profil ne lit que le CV", () => {
    const card = scoreCv(cvReading(), cvCounts(), { ...opts, github: nightFacts() });
    expect(card.profile?.id).not.toBe("night_owl");
    expect(card.sentence).toBeDefined();
  });

  it("comparaison : l'écart de 15 points range les deux fiches « Sous couverture »", () => {
    const gcard = { ...scoreGithub(nightFacts(), null, opts), id: "g", createdAt: "" } as CardData;
    const ccard = { ...scoreCv(cvReading(), cvCounts(), opts), id: "c", createdAt: "" } as CardData;
    const even = compareCards({ ...ccard, overall: gcard.overall + 14 }, gcard);
    expect(even.github.profile?.id).toBe("night_owl");
    expect(even.cv.profile?.id).toBe(ccard.profile?.id);
    const forged = compareCards({ ...ccard, overall: gcard.overall + 15 }, gcard);
    expect(forged.github.profile?.id).toBe("forger");
    expect(forged.cv.profile?.id).toBe("forger");
  });

  it("comparaison : une fiche sans profil (avant 0.2.0) reste sans profil", () => {
    expect(profileWithComparison(undefined, { stats: N, comparison: { cvOverall: 90, githubOverall: 40, cvBuzz: 90 } })).toBeUndefined();
  });
});

const st = (id: string, tone: StatusInstance["tone"] = "negative"): StatusInstance => ({ id, tone, label: { fr: id, en: id }, rule: { fr: "", en: "" } });

describe("la peine et la caution §18.2", () => {
  it("l'axe le plus faible parmi TEC, SHIP, ARCH, DOC ; n = ⌈(80 − v) / 5⌉", () => {
    const s = sentenceFor({ ...N, TEC: 70, SHIP: 75, ARCH: 60, DOC: 66, XP: 1 }, [st("gh_no_tests")]);
    expect(s.label).toEqual({ fr: "Peine : 4 mois de tests unitaires", en: "Sentence: 4 months of unit tests" });
    expect(s.bail).toEqual({ fr: "Caution : un dossier de tests", en: "Bail: one test folder" });
    expect(sentenceFor({ ...N, TEC: 61, SHIP: 90, ARCH: 90, DOC: 90 }, []).label.fr).toBe("Peine : relire 4 PR de mainteneurs");
    expect(sentenceFor({ ...N, TEC: 90, SHIP: 41, ARCH: 90, DOC: 90 }, []).label.fr).toBe("Peine : 8 semaines de commits");
    expect(sentenceFor({ ...N, TEC: 90, SHIP: 90, ARCH: 90, DOC: 1 }, []).label.en).toBe("Sentence: 16 READMEs of 300 words");
  });

  it("au moins 1, au singulier", () => {
    const s = sentenceFor({ ...N, TEC: 79, SHIP: 80, ARCH: 80, DOC: 80 }, []);
    expect(s.label).toEqual({ fr: "Peine : relire 1 PR de mainteneur", en: "Sentence: review 1 maintainer PR" });
    expect(sentenceFor({ ...N, TEC: 80, SHIP: 79, ARCH: 80, DOC: 80 }, []).label.en).toBe("Sentence: 1 week of commits");
  });

  it("à égalité, le premier de la liste TEC, SHIP, ARCH, DOC", () => {
    expect(sentenceFor({ ...N, TEC: 60, SHIP: 60, ARCH: 60, DOC: 60 }, []).label.fr).toBe("Peine : relire 4 PR de mainteneurs");
    expect(sentenceFor({ ...N, TEC: 70, SHIP: 70, ARCH: 60, DOC: 60 }, []).label.fr).toBe("Peine : 4 mois de tests unitaires");
  });

  it("tous à 80 ou plus : relaxe, sans caution, même avec des chefs d'accusation", () => {
    const s = sentenceFor({ ...N, TEC: 80, SHIP: 99, ARCH: 80, DOC: 81, XP: 1, BUZZ: 99 }, [st("gh_no_tests")]);
    expect(s).toEqual({ label: { fr: "Relaxe. Le tribunal s'excuse.", en: "Case dismissed. The court apologizes." } });
  });

  it("la caution du premier chef d'accusation qui en a une ; aucune pour des positifs", () => {
    expect(sentenceFor(N, [st("gh_ship_or_nothing", "positive"), st("gh_node_modules"), st("gh_no_tests")]).bail?.fr).toBe("Caution : un .gitignore");
    expect(sentenceFor(N, [st("gh_ship_or_nothing", "positive"), st("fallback_clean_record", "positive")]).bail).toBeUndefined();
  });

  it("chaque caution vise un statut du catalogue qui n'est pas positif", () => {
    for (const id of Object.keys(SENTENCES.bail)) {
      const def = STATUSES.statuses.find((d) => d.id === id);
      expect(def, id).toBeDefined();
      expect(def!.tone, id).not.toBe("positive");
    }
  });

  it("chaque chef d'accusation négatif ou d'écart a sa caution", () => {
    for (const d of STATUSES.statuses) if (d.tone === "negative" || d.tone === "gap") expect(SENTENCES.bail[d.id], d.id).toBeDefined();
  });
});
