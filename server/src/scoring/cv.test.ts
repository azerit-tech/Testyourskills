import { describe, expect, it } from "vitest";
import type { CvReading } from "../../../shared/readings";
import { NOW, cvCounts, cvReading, daysAgo, facts, repo } from "./__fixtures__/make";
import { AI_BUZZ_KEY } from "./config";
import { compareCards, cvTextCounts, scoreCv, scoreGithub } from "./index";

// `now` figé : l'expérience se compte sur les postes datés, jusqu'à aujourd'hui.
const opts = { lang: "fr" as const, judgedInSeconds: 6, now: NOW };
const stat = (card: ReturnType<typeof scoreCv>, code: string) => card.stats.find((s) => s.code === code)!;
const ids = (card: ReturnType<typeof scoreCv>) => card.statuses.map((s) => s.id);

describe("cvTextCounts", () => {
  it("compte mots, mots creux (sans casse ni accents), passion", () => {
    const text =
      "Développeuse PASSIONNÉE et dynamique. Passionnée par le code, force de proposition, AGILE. " +
      "J'ai travaillé en équipe agile. Ma passion : les synergies.";
    const c = cvTextCounts(text, 1);
    expect(c.pages).toBe(1);
    expect(c.words).toBe(21);
    expect(c.buzzwords["passionné"]).toBeUndefined();
    expect(c.buzzwords["passionnée"]).toBe(2);
    expect(c.buzzwords["dynamique"]).toBe(1);
    expect(c.buzzwords["force de proposition"]).toBe(1);
    expect(c.buzzwords["agile"]).toBe(2);
    expect(c.buzzwords["synergies"]).toBe(1);
    expect(c.passionCount).toBe(3);
    expect(c.buzzwordsPer100).toBeCloseTo((7 / 21) * 100, 1);
  });

  it("IA/AI en majuscules seulement : « j'ai » ne compte pas", () => {
    const c = cvTextCounts("J'ai intégré de l'IA générative et de l'AI. Je n'ai pas d'avis sur l'intelligence artificielle.", 1);
    expect(c.buzzwords[AI_BUZZ_KEY]).toBe(3);
  });

  it("texte vide", () => {
    const c = cvTextCounts("", 0);
    expect(c.words).toBe(0);
    expect(c.buzzwordsPer100).toBe(0);
  });
});

describe("barème CV §4.5", () => {
  it("calcule chaque axe", () => {
    const card = scoreCv(cvReading(), cvCounts(), opts);
    expect(card.source).toBe("cv");
    expect(stat(card, "TEC").value).toBe(80 + 2 * 3);
    expect(stat(card, "SHIP").value).toBe(60); // 2 projets : entre 1 → 50 et 3 → 70
    expect(stat(card, "ARCH").value).toBe(60);
    expect(stat(card, "DOC").value).toBe(80);
    // La barre XP est le critère Expérience × 10 : 2019-01 → 2026-10, 7,8 ans comptés, niveau 8.
    expect(stat(card, "XP").value).toBe(80);
    expect(card.grid?.criteria.find((c) => c.code === "XP")?.score).toBe(8);
    expect(card.overall).toBe(card.grid?.overall);
    expect(stat(card, "BUZZ").value).toBe(10);
    expect(card.reliability).toBe(95);
    expect(card.club).toBe("Doctolib");
    expect(card.name).toBe("Camille Roux");
    expect(card.initials).toBe("CR");
    expect(card.mainLanguage).toBe("typescript");
    expect(card.position).toBe("FS");
  });

  it("TEC plafonné à 99, DOC −10 au-delà de 1 200 mots", () => {
    const many = Array.from({ length: 20 }, (_, i) => `t${i}`);
    expect(stat(scoreCv(cvReading({ seniority_claimed: "lead", technos_described: many }), cvCounts(), opts), "TEC").value).toBe(99);
    expect(stat(scoreCv(cvReading(), cvCounts({ words: 1500 }), opts), "DOC").value).toBe(70);
  });

  it("école : plus de bonus TEC, elle se lit dans le critère Formation de la grille", () => {
    const base = cvReading({ seniority_claimed: "mid" });
    const none = scoreCv(base, cvCounts(), opts);
    const a = scoreCv({ ...base, school_name: "CentraleSupélec", school_tier: "A" }, cvCounts(), opts);
    // TEC ne dépend plus de l'école, ni en valeur ni en faits.
    expect(stat(a, "TEC").value).toBe(stat(none, "TEC").value);
    expect(stat(a, "TEC").facts).toEqual(stat(none, "TEC").facts);
    expect(stat(a, "TEC").facts.map((f) => f.fr).join()).not.toMatch(/École|CentraleSupélec/);
    // L'école ne baisse jamais la note (§4, règle 2).
    expect(a.overall).toBeGreaterThanOrEqual(none.overall);
    const edu = (c: ReturnType<typeof scoreCv>) => c.grid!.criteria.find((x) => x.code === "EDU")!;
    expect(edu(a).score).toBe(8);
    expect(edu(a).reached.fr).toBe("CentraleSupélec, rang A.");
    expect(edu(none).state).toBe("missing");
    expect(edu(none).counted).toBe(false);

    const eduOf = (school_name: string, school_tier: CvReading["school_tier"]) => edu(scoreCv({ ...base, school_name, school_tier }, cvCounts(), opts)).score;
    expect(eduOf("École polytechnique", "S")).toBe(10);
    expect(eduOf("Centrale Méditerranée", "B")).toBe(6);
    expect(eduOf("IUT de Lannion", "C")).toBe(4);
    // La liste prime sur l'IA ; hors liste, l'IA ne donne pas plus que B.
    expect(eduOf("Centrale Marseille", "S")).toBe(6);
    expect(eduOf("Université de Nulle Part", "S")).toBe(6);
    // Sans école de tech : sans objet, jamais une pénalité.
    expect(eduOf("Le Wagon", "none")).toBeNull();
    expect(eduOf("", "none")).toBeNull();
  });

  it("lecture d'avant l'école (champs absents) : pas de plantage, pas de bonus", () => {
    const { school_name: _n, school_tier: _t, ...old } = cvReading();
    const card = scoreCv(old as CvReading, cvCounts(), opts);
    expect(stat(card, "TEC").value).toBe(stat(scoreCv(cvReading(), cvCounts(), opts), "TEC").value);
    expect(stat(card, "TEC").facts).toHaveLength(3);
  });

  it("BUZZ : mots creux pour 100 mots, IA retirée si un projet IA est décrit", () => {
    const counts = cvCounts({ words: 100, buzzwords: { agile: 2, [AI_BUZZ_KEY]: 2 }, buzzwordsPer100: 4 });
    expect(stat(scoreCv(cvReading(), counts, opts), "BUZZ").value).toBe(99);
    expect(stat(scoreCv(cvReading({ describes_ai_project: true }), counts, opts), "BUZZ").value).toBe(65);
  });

  it("CTO sur parole : titre CTO et entreprise non identifiable", () => {
    const role = (company: string) => [{ title: "CTO & co-founder", company, start: "2024-01", end: null, responsibilities: [] }];
    expect(scoreCv(cvReading({ roles: role("Stealth Startup") }), cvCounts(), opts).position).toBe("CTO");
    expect(scoreCv(cvReading({ roles: role("") }), cvCounts(), opts).position).toBe("CTO");
    expect(scoreCv(cvReading({ roles: role("Doctolib") }), cvCounts(), opts).position).toBe("FS");
  });

  it("profil non dev : PM par défaut", () => {
    expect(scoreCv(cvReading({ is_dev_profile: false, position: "BE" }), cvCounts(), opts).position).toBe("PM");
    expect(scoreCv(cvReading({ is_dev_profile: false, position: "DESIGN" }), cvCounts(), opts).position).toBe("DESIGN");
  });

  it("statuts CV : passion, buzzwords, technos, IA dans le titre", () => {
    const r = cvReading({
      title_mentions_ai: true,
      technos_listed: Array.from({ length: 14 }, (_, i) => `t${i}`),
      technos_described: ["a", "b", "c", "d", "e"],
    });
    const c = cvCounts({ words: 100, passionCount: 4, buzzwords: { agile: 4 }, buzzwordsPer100: 4 });
    const card = scoreCv(r, c, opts);
    expect(card.statuses).toHaveLength(3);
    expect(ids(card)).toContain("cv_says_what"); // positif garanti
    expect(card.statuses.map((x) => x.label.fr)).toContain("Agile, synergie, disruptif");
    const all = scoreCv(r, c, opts);
    expect(all.statuses.filter((x) => x.tone === "negative")).toHaveLength(2);
    const ai = scoreCv(cvReading({ title_mentions_ai: true }), cvCounts(), opts).statuses.find((x) => x.id === "cv_ai_title");
    expect(ai?.label.fr).toBe("A ajouté IA à son titre en 2022");
    const noYear = cvReading({ title_mentions_ai: true, roles: [{ title: "AI engineer", company: "X", start: null, end: null, responsibilities: [] }] });
    expect(scoreCv(noYear, cvCounts(), opts).statuses.find((x) => x.id === "cv_ai_title")?.label.fr).toBe("A ajouté IA à son titre");
    expect(ids(scoreCv(cvReading({ title_mentions_ai: true, describes_ai_project: true }), cvCounts(), opts))).not.toContain("cv_ai_title");
    const passion = scoreCv(cvReading(), cvCounts({ passionCount: 3 }), opts).statuses.find((x) => x.id === "cv_passion");
    expect(passion?.label.fr).toBe("Passion citée 3 fois");
  });

  it("écarts avec GitHub : Senior depuis le CV, CV plus long que ses README", () => {
    const gh = facts({
      firstRealCommit: { repo: "a", date: daysAgo(365.25 * 2) },
      repos: ["a", "b", "c", "d", "e"].map((n) => repo(n, { readmeWords: 40 })),
    });
    const card = scoreCv(cvReading({ years_declared: 8 }), cvCounts({ words: 700 }), { ...opts, github: gh });
    expect(card.statuses.slice(0, 2).map((x) => x.id)).toEqual(["cv_senior_from_cv", "cv_longer_than_readmes"]);
    expect(card.statuses[0].rule.fr).toBe("8 ans déclarés, 2 sur GitHub (écart de 3 ans ou plus).");
    expect(card.login).toBe("dev");
    // Sans GitHub, pas d'écart.
    expect(ids(scoreCv(cvReading({ years_declared: 8 }), cvCounts({ words: 700 }), opts))).not.toContain("cv_senior_from_cv");
  });

  it("faits 2 à 4 par stat, sans placeholder résiduel", () => {
    const card = scoreCv(cvReading(), cvCounts({ buzzwords: { agile: 1 } }), opts);
    for (const s of card.stats) {
      expect(s.facts.length).toBeGreaterThanOrEqual(2);
      expect(s.facts.length).toBeLessThanOrEqual(4);
      for (const f of s.facts) expect(`${f.fr} ${f.en}`).not.toMatch(/\{|undefined|NaN/);
    }
  });
});

describe("compareCards §6.5", () => {
  it("deltas github − cv et titre selon le signe", () => {
    const cv = { ...scoreCv(cvReading({ seniority_claimed: "lead" }), cvCounts(), opts), id: "cv1", createdAt: "x" };
    const gh = { ...scoreGithub(facts(), null, opts), id: "gh1", createdAt: "x" };
    const cmp = compareCards(cv, gh);
    for (const s of gh.stats) expect(cmp.deltas[s.code]).toBe(s.value - cv.stats.find((x) => x.code === s.code)!.value);
    const n = cv.overall - gh.overall;
    const pts = (k: number) => `${k}\u00a0${k > 1 ? "points" : "point"}`;
    if (n > 0) expect(cmp.headline.fr).toBe(`Ton CV annonce ${pts(n)} que ton code public ne montre pas encore.`);
    else if (n < 0) expect(cmp.headline.fr).toBe(`Ton CV te sous-vend de ${pts(-n)}. Ton code le prouve.`);
    expect(cmp.cv).toBe(cv);
    expect(cmp.github).toBe(gh);
  });

  it("les trois cas de titre", () => {
    const gh = { ...scoreGithub(facts(), null, opts), id: "gh1", createdAt: "x" };
    const up = compareCards({ ...gh, overall: gh.overall + 7 }, gh);
    expect(up.headline.fr).toBe("Ton CV annonce 7\u00a0points que ton code public ne montre pas encore.");
    const down = compareCards({ ...gh, overall: gh.overall - 4 }, gh);
    expect(down.headline.en).toBe("Your CV undersells you by 4 points. Your code proves it.");
    expect(compareCards(gh, gh).headline.fr).toBe("CV et code d'accord. Dossier solide.");
    // Jamais un mot qui accuse (rapport « jugé comme par un recruteur ») : pas encore prouvé, jamais volé.
    for (const c of [up, down, compareCards(gh, gh)]) for (const s of [c.headline.fr, c.headline.en]) expect(s).not.toMatch(/\bvol|stole|suspect|contre|against/i);
  });
});
