// La page d'une prime (SPEC §18.48) : les trois étapes de la porte d'entrée,
// le formulaire, les textes des états de fin.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DICTS } from "../i18n";
import { withSup } from "../components/Primes";
import { checkJoin, stepStates } from "./Primes";

const { fr, en } = DICTS;

describe("la porte d'entrée d'une prime : trois étapes cochées selon l'état", () => {
  it("sans fiche : l'étape 1 est en cours, les deux autres à venir", () => {
    expect(stepStates(null, false)).toEqual(["now", "todo", "todo"]);
    expect(stepStates({ login: null, gate: "claim" }, false)).toEqual(["now", "todo", "todo"]);
  });

  it("une fiche dans ce navigateur, pas encore prouvée : l'étape 2 est en cours", () => {
    expect(stepStates({ login: null, gate: "claim" }, true)).toEqual(["done", "now", "todo"]);
  });

  it("prouvée par GitHub : le formulaire, ou le refus du poste, à l'étape 3", () => {
    expect(stepStates({ login: "leamd", gate: "ok" }, false)).toEqual(["done", "done", "now"]);
    expect(stepStates({ login: "leamd", gate: "position" }, true)).toEqual(["done", "done", "now"]);
  });

  it("prouvée, mais sans fiche lisible à son pseudo : retour à l'étape 1, la preuve reste acquise", () => {
    expect(stepStates({ login: "leamd", gate: "nocard" }, true)).toEqual(["now", "done", "todo"]);
    expect(stepStates({ login: "leamd", gate: "degraded" }, false)).toEqual(["now", "done", "todo"]);
  });

  it("les trois intitulés, et la raison de GitHub : l'expérience d'abord, le code comme preuve", () => {
    expect([fr.primes.steps.card, fr.primes.steps.proof, fr.primes.steps.enter]).toEqual(["Ta fiche", "Prouver que c'est toi (GitHub)", "Entrer dans la course"]);
    expect(fr.primes.steps.why).toMatch(/parcours compte d'abord/);
    expect(en.primes.steps.why).toMatch(/track record comes first/);
    for (const d of [fr, en]) expect(d.primes.steps.why).not.toMatch(/remplace|replaces/i);
  });
});

describe("le formulaire d'une prime", () => {
  const ok = { email: "moi@exemple.dev", consent: true, adult: true, placeOk: true, proofs: [] };

  it("une preuve est facultative : aucun lien, aucune erreur", () => {
    expect(checkJoin(ok, true)).toEqual([]);
    expect(checkJoin({ ...ok, proofs: ["https://exemple.dev/projet"] }, true)).toEqual([]);
  });

  it("les erreurs, dans l'ordre des champs", () => {
    expect(checkJoin({ email: "pasunemail", consent: false, adult: false, placeOk: null, proofs: ["pas une adresse"] }, true)).toEqual(["email", "place", "proofs", "consent", "adult"]);
    expect(checkJoin({ ...ok, placeOk: null }, false)).toEqual([]);
  });
});

describe("les états de fin d'une prime", () => {
  it("terminée : ni présent, ni « la première place est libre »", () => {
    const m = fr.primes.mine;
    const over = [m.over, m.final, m.finalText, m.finalistText(2, 57, "Entreprise Démo"), m.winner, m.winnerText("Entreprise Démo"), fr.primes.boardFinal, fr.primes.page.boardEmptyClosed];
    for (const s of over) {
      expect(s, s).not.toMatch(/place est libre/);
      expect(s, s).not.toMatch(/\bTu es (n°|\d)/);
    }
    expect(fr.primes.page.boardEmptyClosed).toBe("Prime terminée sans inscription.");
  });

  it("la place se dit sans accord avec la personne, et se partage", () => {
    expect(fr.primes.mine.place(1, 144)).toBe("n° 1 sur 144");
    expect(fr.primes.mine.place(4, 144)).toBe("4e sur 144");
    expect(en.primes.mine.place(4, 144)).toBe("#4 of 144");
    expect(fr.primes.mine.sharePlaceText(4, 144, "le stage Backend", "Entreprise Démo").replace(/[\u00a0\u202f]/g, " ")).toBe("Je suis 4e sur 144 pour le stage Backend chez Entreprise Démo. Fais ta fiche et entre dans la course :");
  });

  it("les clés neuves : ni tiret long, ni point médian dans un mot", () => {
    const flat = (v: unknown, out: string[] = []): string[] => {
      if (typeof v === "string") out.push(v);
      else if (typeof v === "function") flat((v as (...a: unknown[]) => unknown)(2, 9, "x", "y"), out);
      else if (v && typeof v === "object") for (const x of Object.values(v)) flat(x, out);
      return out;
    };
    for (const d of [fr, en]) {
      for (const s of flat([d.primes.steps, d.primes.mine, d.primes.boardFinal, d.primes.addProof, d.primes.rulesPage])) {
        expect(s, s).not.toMatch(/[—–]/);
        expect(s, s).not.toMatch(/\p{L}·\p{L}/u);
      }
    }
  });
});

describe("« 1er » en exposant", () => {
  it("la date du premier du mois, et rien d'autre", () => {
    const html = (s: string) => renderToStaticMarkup(createElement("p", null, withSup(s)));
    expect(html("Du 1er novembre au 26 novembre")).toBe("<p>Du <span>1<sup>er</sup></span> novembre au 26 novembre</p>");
    expect(html("Du 21 novembre au 31 décembre")).toBe("<p>Du 21 novembre au 31 décembre</p>");
  });
});
