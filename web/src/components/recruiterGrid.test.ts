// Le bloc « Voici comment un recruteur d'Azerit te lit » (§18.37) nourri par la
// sortie réelle du moteur (server/src/scoring), rendu en chaîne sans navigateur :
// la vue de la personne fichée et la page partagée, vue par quelqu'un d'autre.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../../shared/types";
import { cvCounts, cvReading } from "../../../server/src/scoring/__fixtures__/make";
import {
  FOUNDERS_NOW,
  JACQUES_AI,
  jacquesFacts,
  jacquesProfile,
  jacquesReading,
  lumineFacts,
  lumineProfile,
  lumineReading,
} from "../../../server/src/scoring/__fixtures__/founders";
import { compareCards, scoreCv, scoreGithub } from "../../../server/src/scoring/index";
import lectureUn from "../../../server/src/ai/__fixtures__/reading-exemple-un.json";
import lectureDeux from "../../../server/src/ai/__fixtures__/reading-exemple-deux.json";
import { validateCvOutput } from "../../../server/src/ai/readCv";
import exempleUn from "../../../server/src/linkedinProfile/__fixtures__/apify-exemple-un.json";
import exempleDeux from "../../../server/src/linkedinProfile/__fixtures__/apify-exemple-deux.json";
import { profileFromApifyItem } from "../../../server/src/linkedinProfile/apify";
import { profileToText } from "../../../server/src/linkedinProfile/text";
import type { GithubFacts } from "../../../server/src/github/facts";
import type { CodeReadingResult } from "../../../shared/readings";
import { GRID_CAP_UNPROVEN, GRID_EMPTY_SCORE } from "../../../shared/gridText";
import { asLinkedinCard, asLinkedinComparison } from "../../../shared/linkedinText";
import { DICTS, LangProvider } from "../i18n";
import { comparisonGridsMock } from "../lib/mockGrid";
import type { Shareable } from "./After";
import { ComparisonStage, Deltas } from "./Comparison";
import { RecruiterGrid } from "./RecruiterGrid";

function renderNode(node: ReturnType<typeof createElement>, lang = "fr-FR"): string {
  vi.stubGlobal("window", {
    location: { origin: "https://skills.test", pathname: "/c/x", search: "" },
    matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("navigator", { userAgent: "test", language: lang });
  vi.stubGlobal("document", { documentElement: { dataset: {}, classList: { add: () => undefined, remove: () => undefined } }, querySelector: () => null, getElementById: () => null });
  return renderToStaticMarkup(createElement(LangProvider, null, node));
}
const render = (item: Shareable, shared: boolean, lang = "fr-FR") => renderNode(createElement(RecruiterGrid, { item, shared, who: "@dev" }), lang);

afterEach(() => vi.unstubAllGlobals());

const opts = { lang: "fr" as const, judgedInSeconds: 6 };
const asCard = (body: object, id: string): CardData => ({ ...body, id, createdAt: FOUNDERS_NOW }) as CardData;
const NAMES = /Orsay|Banque|Centrale|Méditerranée|Software Engineer|Co-founder|Trésorier/;
const count = (s: string, needle: string) => s.split(needle).length - 1;
/** Le texte rendu, sans balises, apostrophes et guillemets rendus. */
const textOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

describe("la page partagée : aucun nom d'école ni d'ancien employeur, au mot près", () => {
  // Deux postes chez Banque Orsay et l'association de l'école : la pièce de l'expérience nomme l'employeur deux fois, et l'école.
  const profile = {
    url: "https://www.linkedin.com/in/exemple",
    roles: [
      { title: "Co-founder", company: "Banque Orsay", start: "2026-04", end: null, description: "" },
      { title: "Software Engineer", company: "Banque Orsay", start: "2024-01", end: "2026-03", description: "" },
      { title: "Trésorier", company: "Centrale Méditerranée Finance", start: "2023-09", end: "2024-01", description: "" },
    ],
    education: [{ school: "Centrale Méditerranée" }],
    skills: [],
  };
  const reading = cvReading({ school_name: "Centrale Méditerranée", school_tier: "B", years_declared: 3, roles: [] });
  const card = asCard(asLinkedinCard(scoreCv(reading, cvCounts(), { ...opts, linkedin: profile, now: FOUNDERS_NOW })), "li");
  const item: Shareable = { kind: "card", card };
  const xp = card.grid!.criteria.find((c) => c.code === "XP")!;

  it("le moteur écrit la pièce avec les noms, et sa version publique sans aucun", () => {
    expect(count(xp.evidence!.text.fr, "Banque Orsay")).toBe(2);
    expect(xp.evidence!.text.fr).toContain("Centrale Méditerranée");
    for (const c of card.grid!.criteria) {
      if (!c.evidence || c.evidence.source === "github") continue;
      expect(c.evidence.publicText, c.code).toBeDefined();
      for (const lang of ["fr", "en"] as const) expect(c.evidence.publicText![lang], `${c.code} ${lang}`).not.toMatch(NAMES);
    }
    expect(xp.evidence!.publicText!.fr).toContain("à la tête d'une entreprise fondée");
  });

  it("la personne fichée lit la pièce entière", () => {
    const html = textOf(render(item, false));
    expect(count(html, "Banque Orsay")).toBeGreaterThanOrEqual(2);
    expect(html).toContain("Centrale Méditerranée");
  });

  for (const lang of ["fr-FR", "en-US"]) {
    it(`un visiteur ne lit ni l'employeur ni l'école, nulle part dans le bloc (${lang})`, () => {
      const html = render(item, true, lang);
      expect(html).not.toMatch(NAMES);
      expect(html).not.toContain("linkedin.com");
      // Mais la pièce est là, en comptes et en dates.
      expect(textOf(html)).toContain(lang === "fr-FR" ? "Un poste d'association : non compté." : "An association role: not counted.");
    });
  }
});

/** Les lignes du bloc, par nom de critère. */
function rowsOf(html: string): Map<string, string> {
  const rows = new Map<string, string>();
  for (const chunk of html.split('<li class="rg-row').slice(1)) {
    const name = /<span class="rg-name">([^<]+)<\/span>/.exec(chunk)?.[1];
    if (name) rows.set(name.replace(/&#x27;/g, "'"), chunk);
  }
  return rows;
}

describe("« recoupé » : de la sortie du moteur à l'étiquette affichée", () => {
  const github = asCard(scoreGithub(jacquesFacts(), JACQUES_AI, opts), "gh");
  const linkedin = asCard(asLinkedinCard(scoreCv(jacquesReading(), cvCounts(), { ...opts, linkedin: jacquesProfile(), now: FOUNDERS_NOW, github: jacquesFacts() })), "li");
  const comparison = { ...compareCards(linkedin, github), id: "cmp", createdAt: FOUNDERS_NOW, declaredSource: "linkedin" as const };
  const item: Shareable = { kind: "comparison", comparison };

  it("le moteur pose la source « both » sur la pièce de l'expérience, du parcours, de la stack et de l'ownership", () => {
    const crossed = comparison.grid!.criteria.filter((c) => c.evidence?.source === "both").map((c) => c.code);
    expect(crossed).toEqual(["XP", "EMP", "STK", "OWN"]);
  });

  for (const [lang, dict] of [["fr-FR", DICTS.fr.grid], ["en-US", DICTS.en.grid]] as const) {
    for (const shared of [false, true]) {
      it(`ces quatre lignes portent l'étiquette « ${dict.source.both} », les autres leur source (${lang}${shared ? ", page partagée" : ""})`, () => {
        const rows = rowsOf(render(item, shared, lang));
        // Une étiquette, ou un lien quand la pièce mène à une page publique.
        const label = new RegExp(`class="rg-src is-both"[^>]*>${dict.source.both}<`);
        for (const code of ["XP", "EMP", "STK", "OWN"] as const) expect(rows.get(dict.names[code]), code).toMatch(label);
        for (const code of ["EDU", "CODE", "ACT", "OSS"] as const) expect(rows.get(dict.names[code]), code).not.toContain("is-both");
      });
    }
  }

  it("un dossier, une note (§18.36) : ni colonnes « LinkedIn · GitHub · Retenu », ni bloc « Les recoupements »", () => {
    for (const [lang, dict] of [["fr-FR", DICTS.fr.grid], ["en-US", DICTS.en.grid]] as const)
      for (const shared of [false, true]) {
        const html = render(item, shared, lang);
        expect(html).toContain('<ol class="rg-list"');
        expect(html).not.toContain("has-cols");
        expect(html).not.toContain("rg-cross");
        expect(html).not.toContain(dict.compare.crossTitle);
        expect(html).not.toContain(`>${dict.compare.cols.kept}<`);
      }
  });

  it("la page partagée montre le recoupement sans nommer le poste", () => {
    const emp = textOf(rowsOf(render(item, true)).get("Parcours et employeurs")!);
    expect(emp).toContain("LinkedIn : stage ou alternance, février 2025 – novembre 2025. GitHub : un dépôt public de 25 commits, actif sur les mêmes mois. Poste confirmé par le code.");
    expect(emp).not.toMatch(/McMaster|Research Intern|agda-notes/);
    const own = textOf(rowsOf(render(item, false)).get("Parcours et employeurs")!);
    expect(own).toContain("Research Intern, McMaster University");
  });
});

describe("face à un GitHub vide : le code n'est pas prouvé, rien ne se compare", () => {
  // Lumine (§7) : LinkedIn 45, GitHub « dossier vide » 20, dossier 45. Le serveur envoie un titre neutre et six écarts à zéro.
  const github = asCard(scoreGithub(lumineFacts(), null, opts), "gh");
  const linkedin = asCard(scoreCv(lumineReading(), cvCounts(), { ...opts, linkedin: lumineProfile(), now: FOUNDERS_NOW, github: lumineFacts() }), "li");
  const comparison = { ...asLinkedinComparison(compareCards(linkedin, github)), id: "cmp", createdAt: FOUNDERS_NOW };
  const item: Shareable = { kind: "comparison", comparison };
  /** La dernière ligne du bloc de la note finale. */
  const lastFinalLine = (html: string) => {
    const start = html.indexOf('<div class="rg-final">');
    const div = html.slice(start, html.indexOf("</div>", start));
    return div.slice(div.lastIndexOf("<p"));
  };
  const lastRule = (html: string) => [...html.matchAll(/<p class="rg-rule[^"]*">([^<]+)<\/p>/g)].map((m) => m[1].replace(/&#x27;/g, "'")).pop();

  it("le serveur : GitHub en dossier vide, titre neutre, écarts à zéro", () => {
    expect(comparison.github.grid!.rule).toBe("empty_file");
    expect(comparison.headline.fr).toMatch(/^Code non prouvé\u00a0: ton LinkedIn parle seul\./);
    expect(Object.values(comparison.deltas).every((d) => d === 0)).toBe(true);
  });

  it("les barres lisent « n/c », avec leur texte entier ; ni écart global, ni ±0, ni légende gain / perte", () => {
    const html = renderNode(createElement(Deltas, { cmp: comparison }));
    expect(count(html, '<span aria-hidden="true">n/c</span>')).toBe(6);
    expect(count(html, '<span class="sr-only">non comparable : le code n&#x27;est pas prouvé</span>')).toBe(6);
    expect(html).not.toContain("delta-overall");
    expect(html).not.toMatch(/±0|−\d|\+\d/);
    expect(html).not.toContain("delta-down");
    expect(html).not.toContain("lg-down");
    expect(textOf(html)).toContain("Code non prouvé : LinkedIn parle seul, rien ne se compare barre par barre.");
    const en = renderNode(createElement(Deltas, { cmp: comparison }), "en-US");
    expect(count(en, '<span class="sr-only">not comparable: the code is not proven</span>')).toBe(6);
  });

  it("une comparaison où le code est prouvé garde ses écarts chiffrés", () => {
    const proven = { ...comparison, github: { ...comparison.github, grid: undefined }, deltas: { ...comparison.deltas, TEC: 12 } };
    const html = renderNode(createElement(Deltas, { cmp: proven }));
    expect(html).toContain("delta-overall");
    expect(html).toContain("+12");
    expect(html).not.toContain("n/c");
  });

  for (const who of [null, "@LumBuilds0"]) {
    it(`le titre est neutre, ni gain ni perte, et la note du dossier dit « code non prouvé » (${who ?? "la personne fichée"})`, () => {
      const html = renderNode(createElement(ComparisonStage, { cmp: comparison, phase: "done", who }));
      expect(html).toMatch(/class="cmp-headline tone-neutral is-sub"/);
      // La note du dossier en tête, au-dessus de la phrase (§18.37).
      expect(html.indexOf('class="cmp-case"')).toBeLessThan(html.indexOf('class="cmp-headline'));
      expect(html).not.toMatch(/tone-(down|up)/);
      expect(textOf(html)).toContain("Code non prouvé : rien n'est comparé");
      expect(html).not.toContain("delta-overall");
    });
  }

  it("la dernière ligne de la note du dossier : code non prouvé, et ce qui changerait la note", () => {
    const html = render(item, false);
    expect(lastRule(html)).toBe(
      "Code non prouvé : ton GitHub public ne montre encore rien de jugeable. La note du dossier se fait sur ton LinkedIn, sans dépasser 85. Ce qui la changerait : un vrai projet public sur GitHub, qui ouvre niveau du code, stack technique, activité et open source.",
    );
    expect(lastFinalLine(html)).toMatch(/^<p class="rg-rule is-unproven">Code non prouvé/);
    // Une seule règle : pas le plafond générique en plus.
    expect(count(html, 'class="rg-rule')).toBe(1);
    expect(lastRule(render(item, true))).toMatch(/^Code non prouvé : son GitHub public .* La note du dossier se fait sur son LinkedIn/);
    expect(lastRule(render(item, false, "en-US"))).toMatch(/^Code not proven: your public GitHub shows nothing to judge yet\. .* which opens code level, tech stack, activity and open source\.$/);
    expect(lastRule(render(item, true, "en-US"))).toMatch(/^Code not proven: their public GitHub/);
  });

  it("une comparaison où le code est prouvé garde la ligne du plafond générique, s'il joue", () => {
    const cmp = { ...comparison, github: { ...comparison.github, grid: { ...comparison.github.grid!, rule: undefined } } };
    expect(lastRule(render({ kind: "comparison", comparison: cmp }, false))).toBe(DICTS.fr.grid.final.capped);
  });

  it("la démo a son cas : un LinkedIn face au GitHub vide de x", () => {
    const g = comparisonGridsMock("LinkedIn", "x", undefined, true);
    expect(g.github.rule).toBe("empty_file");
    expect(g.grid.rule).toBe("capped_unproven");
    expect(g.grid.criteria.filter((c) => c.evidence?.source === "both")).toEqual([]);
  });
});

describe("une vraie grille du serveur, à travers le bloc : les deux profils d'exemple, du fournisseur à l'écran", () => {
  // Le chemin du pipeline, sans aucun appel : sortie Apify → profil gardé → texte → lecture IA vérifiée par le code → scoreurs → comparaison.
  type Raw = Record<string, unknown>;
  function pipeline(item: Raw, rawReading: unknown, facts: GithubFacts, ai: CodeReadingResult | null) {
    const profile = profileFromApifyItem(String(item.linkedinUrl), item)!;
    const v = validateCvOutput(structuredClone(rawReading), profileToText(profile));
    if (!v.ok) throw new Error(v.issues.join("; "));
    const linkedin = { roles: profile.roles, education: profile.education, skills: profile.skills, url: profile.url };
    const li = asCard(asLinkedinCard(scoreCv(v.value, cvCounts(), { ...opts, linkedin, now: FOUNDERS_NOW, github: facts })), "li");
    const gh = asCard(scoreGithub(facts, ai, opts), "gh");
    const cmp = { ...asLinkedinComparison(compareCards(li, gh)), id: "cmp", createdAt: FOUNDERS_NOW };
    const names = [...profile.roles.map((r) => r.company), ...profile.education.map((e) => e.school)].filter((n) => n && n !== "Azerit");
    return { li, gh, cmp, names };
  }
  const exemples = [
    ["exemple un, face au GitHub de Jacques", pipeline(structuredClone(exempleUn[0]) as Raw, lectureUn, jacquesFacts(), JACQUES_AI)],
    ["exemple deux, face au GitHub vide de Lumine", pipeline(structuredClone(exempleDeux[0]) as Raw, lectureDeux, lumineFacts(), null)],
  ] as const;

  /** Recalcule la note depuis le texte rendu : les termes « score × coef », le diviseur, l'arrondi à ,5 au supérieur, le plafond. */
  function checkFinal(html: string, grid: NonNullable<CardData["grid"]>) {
    const final = textOf(html.slice(html.indexOf('class="rg-final"')));
    const big = Number(/class="rg-big"><b>(\d+)<\/b>/.exec(html)?.[1]);
    expect(big).toBe(grid.overall);
    if (grid.rule === "empty_file") {
      expect(big).toBe(GRID_EMPTY_SCORE);
      expect(html).not.toContain('class="rg-formula"');
      return;
    }
    const formula = textOf(/<p class="rg-formula">([^<]+)<\/p>/.exec(html)![1]);
    const num = (s: string) => Number(s.replace(",", "."));
    const terms = [...formula.matchAll(/(\d+)\s×\s(\d+(?:[,.]\d+)?)/g)].map((m) => [Number(m[1]), num(m[2])] as const);
    expect(terms.length).toBe(grid.criteria.filter((c) => c.counted && c.score !== null).length);
    const den2 = terms.reduce((s, [, w]) => s + Math.round(w * 2), 0);
    expect(num(/÷\s(\d+(?:[,.]\d+)?)/.exec(formula)![1]) * 2).toBe(den2);
    const num2 = terms.reduce((s, [x, w]) => s + x * Math.round(w * 2), 0);
    const mean = /=\s(\d+(?:[,.]\d+)?)\s(?:sur|out of)\s10/.exec(final)![1];
    expect(num(mean)).toBeCloseTo(num2 / den2, 2);
    const raw = Math.floor((20 * num2 + den2) / (2 * den2));
    expect(grid.rule === "capped_unproven" ? Math.min(raw, GRID_CAP_UNPROVEN) : raw).toBe(grid.overall);
  }

  for (const [label, { li, gh, cmp, names }] of exemples) {
    const items: [string, Shareable, CardData["grid"]][] = [
      ["la fiche LinkedIn", { kind: "card", card: li }, li.grid],
      ["la fiche GitHub", { kind: "card", card: gh }, gh.grid],
      ["la comparaison", { kind: "comparison", comparison: cmp }, cmp.grid],
    ];
    for (const [what, item, grid] of items) {
      for (const lang of ["fr-FR", "en-US"]) {
        for (const shared of [false, true]) {
          it(`${label} : ${what}, ${lang}${shared ? ", page partagée" : ""}`, () => {
            expect(grid).toBeDefined();
            const html = render(item, shared, lang);
            const dict = lang === "fr-FR" ? DICTS.fr.grid : DICTS.en.grid;
            const rows = rowsOf(html);
            // Chaque critère a sa ligne, nommée.
            expect([...rows.keys()].sort()).toEqual(grid!.criteria.map((c) => dict.names[c.code]).sort());
            expect(rows.size).toBe(8);
            expect(textOf(html)).not.toMatch(/undefined|null|NaN|\[object/);
            for (const c of grid!.criteria) {
              const row = rows.get(dict.names[c.code])!;
              // Jamais de bonus ni de malus en points sur un critère.
              expect(textOf(row), c.code).not.toMatch(/(^|[\s(])[+−]\s?\d/);
              if (c.state === "scored" && c.score !== null) {
                const piece = /<p class="rg-piece">([\s\S]*?)<\/p>/.exec(row)?.[1];
                expect(piece && textOf(piece).trim(), `${c.code} sans pièce`).toBeTruthy();
              }
            }
            checkFinal(html, grid!);
            // La page partagée ne nomme ni employeur ni école de la personne.
            if (shared) for (const n of names) expect(textOf(html), n).not.toContain(n);
          });
        }
      }
    }
  }

  it("l'expérience lue sur GitHub porte « estimée » sur la fiche GitHub, pas sur LinkedIn", () => {
    const [, { li, gh }] = exemples[0];
    const ghXp = gh.grid!.criteria.find((c) => c.code === "XP")!;
    expect(ghXp.source).toBe("github");
    expect(ghXp.state).toBe("scored");
    for (const lang of ["fr-FR", "en-US"]) {
      const dict = lang === "fr-FR" ? DICTS.fr.grid : DICTS.en.grid;
      const ghRow = rowsOf(render({ kind: "card", card: gh }, false, lang)).get(dict.names.XP)!;
      expect(ghRow).toContain(`class="rg-tag tag-estimated">${dict.tags.estimated}<`);
      const liRow = rowsOf(render({ kind: "card", card: li }, false, lang)).get(dict.names.XP)!;
      expect(liRow).not.toContain("tag-estimated");
    }
  });

  it("la personne fichée lit les noms que la page partagée tait", () => {
    const [, { li, names }] = exemples[0];
    const own = textOf(render({ kind: "card", card: li }, false));
    expect(names.some((n) => own.includes(n))).toBe(true);
  });
});
