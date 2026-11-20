// La phrase de la fiche dans les deux lectures (§18.107) : un champ de plus dans le
// schéma, contrôlé ; une phrase rejetée ou absente ne fait jamais tomber la lecture.
import { describe, expect, it } from "vitest";
import { CARD_LINE_EXAMPLES } from "./prompts/cardLine";
import { CODE_SYSTEM_PROMPT } from "./prompts/code";
import { CV_SYSTEM_PROMPT } from "./prompts/cv";
import { CODE_OUTPUT_SCHEMA, prepareRepos, validateCodeOutput } from "./readCode";
import { CV_OUTPUT_SCHEMA, validateCvOutput } from "./readCv";
import type { CardData } from "../../../shared/types";
import { withLine } from "../pipeline";

const CV = `Sam Okafor
Développeur Python junior chez Qonto
Expérience
Développeur Python — Qonto, février 2025 – aujourd'hui
- Rapprochement automatique des paiements carte en Python et Django
Auditeur — KPMG, 2017 – 2023
- Audit de comptes
Formation : Université Paris-Dauphine, 2012 – 2017`;

const CV_OUT = {
  language: "fr",
  position: "BE",
  full_name: "Sam Okafor",
  years_declared: 2,
  seniority_claimed: "junior",
  roles: [
    { title: "Développeur Python", company: "Qonto", start: "2025-02", end: null, responsibilities: ["Rapprochement automatique des paiements carte en Python et Django"], employer_type: "scaleup", kind: "job" },
    { title: "Auditeur", company: "KPMG", start: "2017", end: "2023", responsibilities: ["Audit de comptes"], employer_type: "large_group", kind: "job" },
  ],
  technos_listed: ["Python", "Django"],
  technos_described: ["Python", "Django"],
  tests_ci_review_mentions: [],
  projects_with_dated_outcome: 0,
  writing_quality: 3,
  is_dev_profile: true,
  title_mentions_ai: false,
  describes_ai_project: false,
  school_name: "Université Paris-Dauphine",
  school_tier: "C",
  selection_signals: [],
  management_quote: "",
};

const cv = (card_line?: { fr: string; en: string }) => validateCvOutput({ ...CV_OUT, ...(card_line ? { card_line } : {}) }, CV);

describe("lecture du parcours", () => {
  it("le schéma demande la phrase, en dernier, et les consignes l'expliquent", () => {
    const props = Object.keys((CV_OUTPUT_SCHEMA as { properties: object }).properties);
    expect(props.at(-1)).toBe("card_line");
    expect(CV_SYSTEM_PROMPT).toContain("card_line");
  });

  it("garde une bonne phrase, sur l'employeur du jour", () => {
    const r = cv({ fr: "Ex-audit, tu rapproches les paiements de Qonto en Django", en: "Ex-auditor, now reconciling Qonto payments in Django" });
    expect(r.ok && r.value.card_line?.en).toBe("Ex-auditor, now reconciling Qonto payments in Django");
  });

  it("rejette l'ancien employeur, l'école, un exemple des consignes : la lecture tient, sans phrase", () => {
    for (const line of [
      { fr: "De l'audit chez KPMG à Django : le grand livre tourne seul", en: "From KPMG audits to Django: the ledger runs itself" },
      { fr: "Sorti de Dauphine, tu planques du Django chez Qonto", en: "Out of Dauphine, now stashing Django at Qonto" },
      CARD_LINE_EXAMPLES.cv[0]!,
    ]) {
      const r = cv(line);
      expect(r.ok).toBe(true);
      expect(r.ok && r.value.card_line).toBeUndefined();
      expect(r.ok && r.value.position).toBe("BE");
    }
  });

  it("une phrase vide ou absente (lecture d'avant) : pas de phrase, la lecture tient", () => {
    for (const r of [cv({ fr: "", en: "" }), cv()]) {
      expect(r.ok).toBe(true);
      expect(r.ok && r.value.card_line).toBeUndefined();
    }
  });
});

describe("lecture du code", () => {
  const prepared = prepareRepos([{ repo: "sam/ledger", activity: 1, files: [{ path: "ledger.py", content: "def reconcile(rows):\n    return [r for r in rows if r.ok]\n" }] }]);
  const out = (card_line?: unknown) => ({
    readings: [{ repo: "sam/ledger", observations: "Court.", evidence_file: "ledger.py", evidence_quote: "def reconcile(rows):", observed_traits: [], level: 2 }],
    ai_status: null,
    ...(card_line ? { card_line } : {}),
  });

  it("le schéma demande la phrase, et les consignes l'expliquent", () => {
    expect(Object.keys((CODE_OUTPUT_SCHEMA as { properties: object }).properties).at(-1)).toBe("card_line");
    expect(CODE_SYSTEM_PROMPT).toContain("card_line");
  });

  it("garde une bonne phrase ; rejette une insulte sans faire tomber la lecture", () => {
    const good = validateCodeOutput(out({ fr: "Un rapprochement en une ligne dans ledger.py : du travail propre", en: "Reconciliation in one line of ledger.py: clean work" }), prepared);
    expect(good.ok && good.value.card_line?.fr).toMatch(/^Un rapprochement/);
    const bad = validateCodeOutput(out({ fr: "Ton ledger.py est nul, mais il tourne", en: "Your ledger.py is garbage, but it runs" }), prepared);
    expect(bad.ok).toBe(true);
    expect(bad.ok && bad.value.card_line).toBeUndefined();
    const none = validateCodeOutput(out(), prepared);
    expect(none.ok && none.value.card_line).toBeUndefined();
  });
});

describe("la fiche range la phrase avec son profil", () => {
  const line = { fr: "Tu planques du Django chez Qonto", en: "Stashing Django at Qonto" };
  it("posée sur le profil ; sans phrase ou sans profil, la fiche telle quelle", () => {
    const card: Pick<CardData, "profile"> = { profile: { id: "sleeper_agent", label: { fr: "a", en: "a" }, tagline: { fr: "b", en: "b" } } };
    expect(withLine(card, line).profile?.line).toEqual(line);
    expect(withLine(card, undefined)).toBe(card);
    const bare = { profile: undefined };
    expect(withLine(bare, line)).toBe(bare);
  });
});
