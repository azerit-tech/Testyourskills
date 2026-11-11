// Le titre et les écarts d'une comparaison (§6.5), face à un GitHub « dossier vide » :
// un GitHub vide n'est pas un mauvais code (§18.37), donc ni écart chiffré, ni perte.

import { describe, expect, it } from "vitest";
import { asLinkedinComparison } from "../../../shared/linkedinText";
import type { CardData } from "../../../shared/types";
import { STAT_CODES } from "../../../shared/types";
import { cvCounts, cvReading } from "./__fixtures__/make";
import { FOUNDERS_NOW, JACQUES_AI, jacquesFacts, jacquesProfile, jacquesReading, lumineFacts, lumineProfile, lumineReading } from "./__fixtures__/founders";
import { compareCards, scoreCv, scoreGithub } from "./index";

const opts = { lang: "fr" as const, judgedInSeconds: 6 };
const card = <T extends object>(c: T, id: string) => ({ ...c, id, createdAt: FOUNDERS_NOW }) as unknown as CardData;

function lumine() {
  const github = card(scoreGithub(lumineFacts(), null, opts), "gh");
  const linkedin = card(scoreCv(lumineReading(), cvCounts(), { ...opts, linkedin: lumineProfile(), now: FOUNDERS_NOW, github: lumineFacts() }), "li");
  return { github, linkedin };
}

function jacques() {
  const github = card(scoreGithub(jacquesFacts(), JACQUES_AI, opts), "gh");
  const linkedin = card(scoreCv(jacquesReading(), cvCounts(), { ...opts, linkedin: jacquesProfile(), now: FOUNDERS_NOW, github: jacquesFacts() }), "li");
  return { github, linkedin };
}

describe("comparaison face à un GitHub vide", () => {
  it("le titre dit que le code n'est pas prouvé : pas de chiffre, pas de vol", () => {
    const { github, linkedin } = lumine();
    expect(github.grid!.rule).toBe("empty_file");
    expect(linkedin.overall - github.overall).toBeGreaterThanOrEqual(15);
    const cmp = asLinkedinComparison(compareCards(linkedin, github));
    for (const s of [cmp.headline.fr, cmp.headline.en]) {
      expect(s).not.toMatch(/\d/);
      expect(s).not.toMatch(/\bvol|\b(stole|ment|mens|menti|lies?|lying|faussaire|forger)\b/i);
    }
    expect(cmp.headline.fr).toBe("Code non prouvé : ton LinkedIn parle seul. Publie un vrai projet sur GitHub et on compare.");
    expect(cmp.headline.en).toBe("Code not proven: your LinkedIn does all the talking. Publish one real project on GitHub and we'll compare.");
    // Sur un CV en PDF, le même titre parle du CV.
    expect(compareCards(linkedin, github).headline.fr).toMatch(/^Code non prouvé : ton CV parle seul\./);
  });

  it("aucun écart ne se lit comme une perte : toutes les barres à zéro", () => {
    const { github, linkedin } = lumine();
    const cmp = compareCards(linkedin, github);
    for (const c of STAT_CODES) expect(cmp.deltas[c]).toBe(0);
    // La note du dossier, elle, reste celle de la grille : 45, code non prouvé.
    expect(cmp.grid!.rule).toBe("capped_unproven");
  });

  it("déterministe : même entrée, même titre et mêmes écarts", () => {
    const { github, linkedin } = lumine();
    const a = compareCards(linkedin, github);
    const b = compareCards(structuredClone(linkedin), structuredClone(github));
    expect(b.headline).toEqual(a.headline);
    expect(b.deltas).toEqual(a.deltas);
  });
});

describe("comparaison avec un GitHub qui prouve quelque chose", () => {
  it("un vrai écart de 15 points garde son titre chiffré et ses écarts", () => {
    const { github, linkedin } = jacques();
    expect(github.grid!.rule).not.toBe("empty_file");
    const cmp = compareCards({ ...linkedin, overall: github.overall + 15 }, github);
    expect(cmp.headline).toEqual({ fr: "Ton CV annonce 15 points que ton code public ne montre pas encore.", en: "Your CV claims 15 points your public code doesn't show yet." });
    expect(asLinkedinComparison(cmp).headline.fr).toBe("Ton LinkedIn annonce 15 points que ton code public ne montre pas encore.");
    expect(asLinkedinComparison(cmp).headline.en).toBe("Your LinkedIn claims 15 points your public code doesn't show yet.");
    const xp = (c: CardData) => c.stats.find((s) => s.code === "XP")!.value;
    expect(cmp.deltas.XP).toBe(xp(github) - xp(linkedin));
  });

  it("le code devant : le parcours sous-vend, le code le prouve", () => {
    const { github, linkedin } = jacques();
    const n = github.overall - linkedin.overall;
    expect(n).toBeGreaterThanOrEqual(15);
    const cmp = compareCards(linkedin, github);
    expect(cmp.headline.fr).toBe(`Ton CV te sous-vend de ${n} points. Ton code le prouve.`);
    expect(asLinkedinComparison(cmp).headline.fr).toBe(`Ton LinkedIn te sous-vend de ${n} points. Ton code le prouve.`);
    expect(asLinkedinComparison(cmp).headline.en).toBe(`Your LinkedIn undersells you by ${n} points. Your code proves it.`);
  });

  it("un seul point : au singulier ; à égalité, les deux pièces d'accord", () => {
    const { github, linkedin } = jacques();
    expect(compareCards({ ...linkedin, overall: github.overall + 1 }, github).headline.fr).toBe("Ton CV annonce 1 point que ton code public ne montre pas encore.");
    expect(compareCards({ ...linkedin, overall: github.overall - 1 }, github).headline.en).toBe("Your CV undersells you by 1 point. Your code proves it.");
    expect(asLinkedinComparison(compareCards({ ...linkedin, overall: github.overall }, github)).headline).toEqual({ fr: "LinkedIn et code d'accord. Dossier solide.", en: "LinkedIn and code agree. Solid file." });
  });

  it("cas symétrique, aujourd'hui : un CV sans rien de lisible face à un GitHub plein garde le titre chiffré", () => {
    const { github } = jacques();
    const empty = card(scoreCv(cvReading({ roles: [], technos_listed: [], technos_described: [], tests_ci_review_mentions: [], projects_with_dated_outcome: 0, years_declared: null as never }), cvCounts({ words: 0, pages: 1 }), opts), "cv");
    expect(empty.grid!.rule).toBe("empty_file");
    const cmp = compareCards(empty, github);
    expect(cmp.headline.fr).toMatch(/^Ton CV te sous-vend de \d+ points\. Ton code le prouve\.$/);
    expect(STAT_CODES.some((c) => cmp.deltas[c] !== 0)).toBe(true);
  });
});
