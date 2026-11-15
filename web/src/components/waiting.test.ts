// L'écran d'attente (§18.27, §18.48) : chaque emplacement a sa hauteur réservée,
// pour que rien ne bouge d'une étape à l'autre ; le réseau coupé se dit, et
// « Réessayer » ne fait que relire l'état de la fiche.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("le commissariat ne répond pas, et « Réessayer »", () => {
    expect(DICTS.fr.waiting.offline).toMatch(/^Le commissariat ne répond pas\./);
    expect(DICTS.en.waiting.offline).toMatch(/^The station isn't answering\./);
    expect([DICTS.fr.waiting.retry, DICTS.en.waiting.retry]).toEqual(["Réessayer", "Try again"]);
  });

  it("plus aucune trace de l'ancien bouton « Ouvrir mon dossier »", () => {
    for (const f of ["./Waiting.tsx", "../lib/hold.ts", "../film/unlock.ts", "../../../server/src/events.ts"]) expect(read(f)).not.toMatch(/Ouvrir mon dossier/);
  });
});

describe("la démo hors ligne", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lire l'état d'une fiche échoue comme un vrai fetch, réseau coupé", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const { mockApi } = await import("../lib/mock");
    await expect(mockApi.getJob("m-gold-x")).rejects.toThrow(TypeError);
  });
});

// §18.52 : l'IA lit le code et en donne le niveau ; la note sur 100, c'est la grille qui la calcule.
describe("les lignes de l'attente disent vrai sur la méthode", () => {
  it("aucune ne dit que l'IA ne note pas ; la grille calcule la note", () => {
    for (const lang of ["fr", "en"] as const) {
      const lines = Object.values(DICTS[lang].waiting.progress).map((fn) => fn());
      for (const line of lines) expect(line).not.toMatch(/ne note pas|touche aux chiffres|doesn't score|touches the numbers|30 secondes|30 seconds/);
      expect(DICTS[lang].waiting.progress.code()).toMatch(lang === "fr" ? /niveau, de 1 à 5/ : /level, from 1 to 5/);
      expect(DICTS[lang].waiting.progress.scoring()).toMatch(lang === "fr" ? /c'est la grille qui la calcule/ : /scorecard works out the rating/);
    }
  });
});
