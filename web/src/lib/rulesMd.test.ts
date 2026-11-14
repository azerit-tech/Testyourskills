import { describe, expect, it } from "vitest";
import { parseRules } from "./rulesMd";

describe("le Markdown du règlement", () => {
  it("titres, paragraphes, listes et sous-listes", () => {
    const md = ["# Règlement", "", "## Article 1. Qui", "", "Une ligne", "qui continue.", "", "1. **Faire** sa fiche.", "2. Remplir :", "   - l'email ;", "   - la case.", "", "- un point", "- un autre"].join("\n");
    expect(parseRules(md)).toEqual([
      { kind: "h", level: 1, text: "Règlement" },
      { kind: "h", level: 2, text: "Article 1. Qui" },
      { kind: "p", text: "Une ligne qui continue." },
      { kind: "ol", items: [{ text: "**Faire** sa fiche.", sub: [] }, { text: "Remplir :", sub: ["l'email ;", "la case."] }] },
      { kind: "ul", items: [{ text: "un point", sub: [] }, { text: "un autre", sub: [] }] },
    ]);
  });

  it("aucun HTML ne passe pour une balise", () => {
    expect(parseRules("<script>x</script>")).toEqual([{ kind: "p", text: "<script>x</script>" }]);
  });
});
