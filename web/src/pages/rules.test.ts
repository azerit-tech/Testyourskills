// Le règlement (SPEC §18.48) : le titre sorti du corps, un sommaire d'ancres,
// un résumé en trois lignes dans les deux langues.
import { describe, expect, it } from "vitest";
import { DICTS } from "../i18n";
import { ruleAnchor, rulesDoc } from "./Rules";

const { fr, en } = DICTS;

describe("le règlement : un sommaire d'ancres", () => {
  const md = ["# Règlement de la saison", "", "Version du jour.", "", "## Article 1. **Qui** organise", "", "Texte.", "", "### 1.1 Détail", "", "## Article 2. Les dates", "", "- un point"].join("\n");

  it("le titre sort du corps, chaque article reçoit son ancre, dans l'ordre", () => {
    const doc = rulesDoc(md);
    expect(doc.title).toBe("Règlement de la saison");
    expect(doc.toc).toEqual([
      { id: ruleAnchor(1), text: "Article 1. Qui organise" },
      { id: ruleAnchor(2), text: "Article 2. Les dates" },
    ]);
    expect(doc.body.filter((x) => x.id).map((x) => x.id)).toEqual(["article-1", "article-2"]);
    // le titre n'est pas répété, le reste est intact (intertitres de niveau 3 compris)
    expect(doc.body.some((x) => x.b.kind === "h" && x.b.level === 1)).toBe(false);
    expect(doc.body).toHaveLength(6);
  });

  it("sans titre de niveau 1 : la page garde le sien", () => {
    expect(rulesDoc("## Article 1. Seul\n\nTexte.").title).toBeNull();
  });

  it("le résumé en tête : trois lignes, dans les deux langues ; l'anglais dit que le français fait foi", () => {
    expect(fr.primes.rulesPage.summary).toHaveLength(3);
    expect(en.primes.rulesPage.summary).toHaveLength(3);
    expect(en.primes.rulesPage.binding).toMatch(/French text below is binding/);
  });
});
