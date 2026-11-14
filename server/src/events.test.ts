// La page Confidentialité dit ce qu'on mesure (§11, §13) : autant d'événements que la liste fermée du serveur.
import { describe, expect, it } from "vitest";
import { DICTS } from "../../web/src/i18n";
import { EVENT_NAMES } from "./events";

describe("la Mesure de la page Confidentialité", () => {
  it("nomme autant d'événements, en toutes lettres, que le serveur en enregistre", () => {
    const words: Record<number, { fr: string; en: string }> = { 15: { fr: "Quinze", en: "Fifteen" } };
    for (const lang of ["fr", "en"] as const) {
      const section = DICTS[lang].privacy.sections.at(-1)!.p;
      expect(section.startsWith(words[EVENT_NAMES.length]?.[lang] ?? "?"), lang).toBe(true);
      // La liste, entre les deux-points et la première phrase qui suit : une virgule entre chaque événement.
      const list = section.slice(section.indexOf(":") + 1, section.indexOf(". ")).split(",");
      expect(list, lang).toHaveLength(EVENT_NAMES.length);
    }
  });
});
