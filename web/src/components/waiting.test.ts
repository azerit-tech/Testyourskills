// L'écran d'attente (§18.27, §18.48) : chaque emplacement a sa hauteur réservée,
// pour que rien ne bouge d'une étape à l'autre.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DICTS } from "../i18n";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const css = read("../styles.css");
/** Le corps d'une règle (la première qui porte exactement ce sélecteur). */
const rule = (sel: string) => new RegExp(`\\n${sel.replace(/\./g, "\\.")} \\{([^}]*)\\}`).exec(css)?.[1] ?? "";

describe("l'attente ne saute pas", () => {
  it("le pari, la pile, la rangée de la barre et la ligne ont une hauteur fixe", () => {
    expect(rule(".load-plea")).toMatch(/height: 72px/);
    expect(rule(".load-dossier")).toMatch(/height: 168px/);
    expect(rule(".load-act")).toMatch(/height: var\(--h-main\)/);
    expect(rule(".load-line")).toMatch(/height: 2\.8em/);
    expect(rule(".load-line")).toMatch(/-webkit-line-clamp: 2/);
  });

  it("une seule voix pour la ligne, quelle que soit l'étape", () => {
    expect(css).not.toMatch(/\.load-line\.is-prev|\.load-foot\.is-quiet/);
    expect(rule(".load-line")).toMatch(/font: var\(--font-small\)/);
  });

  it("la page de l'attente est chargée d'avance par le formulaire", () => {
    expect(read("./EntryForm.tsx")).toMatch(/loadCardPage\(\)/);
    expect(read("../App.tsx")).toMatch(/loadedCardPage/);
  });
});

describe("les textes de l'attente", () => {
  it("un titre, et une première ligne qui ne le répète pas", () => {
    for (const d of [DICTS.fr, DICTS.en]) {
      expect(d.waiting.title.length).toBeGreaterThan(0);
      expect(d.waiting.progress.start()).not.toBe(d.waiting.title);
    }
  });

  it("plus aucune trace de l'ancien bouton « Ouvrir mon dossier »", () => {
    for (const f of ["./Waiting.tsx", "../lib/hold.ts", "../film/unlock.ts", "../../../server/src/events.ts"]) expect(read(f)).not.toMatch(/Ouvrir mon dossier/);
  });
});
