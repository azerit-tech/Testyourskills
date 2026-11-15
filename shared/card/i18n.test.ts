// Les règles des textes du site (§18.48), tenues aussi sur ce qui se dessine :
// le dictionnaire de la fiche, les mots des images et les textes venus des
// données (chefs d'accusation, profils, peines et cautions). Typographie
// française, lexique, aucun tiret cadratin ni point médian dans un mot.
import { describe, expect, it } from "vitest";
import profilesJson from "../../data/profiles.json";
import sentencesJson from "../../data/sentences.json";
import statusesJson from "../../data/statuses.json";
import { IMAGE_WORDS } from "../../server/src/render/compositions";
import { STRINGS } from "./i18n";

/** Des arguments d'essai pour les fonctions du dictionnaire. */
const ARGS: unknown[][] = [[3], [1], [0], [9, 40], ["GitHub"], ["Code", 7, "1,5"], [0.3], ["7,5"]];

/** Toutes les chaînes d'une valeur, avec leur chemin ; les fonctions sont appelées avec les arguments d'essai. */
function texts(value: unknown, path = "", out: [string, string][] = []): [string, string][] {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => texts(v, `${path}[${i}]`, out));
  else if (typeof value === "function") {
    ARGS.forEach((args, i) => {
      try {
        texts((value as (...a: unknown[]) => unknown)(...args), `${path}(#${i})`, out);
      } catch {
        /* cette fonction attend autre chose */
      }
    });
  } else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) texts(v, path ? `${path}.${k}` : k, out);
  return out;
}

/** Les textes montrés d'un fichier de données : les champs `fr` et `en` seulement (pas les `_doc`). */
function shown(value: unknown, lang: "fr" | "en", path = "", out: [string, string][] = []): [string, string][] {
  if (Array.isArray(value)) value.forEach((v, i) => shown(v, lang, `${path}[${i}]`, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === lang && typeof v === "string") out.push([path, v]);
      else shown(v, lang, path ? `${path}.${k}` : k, out);
    }
  }
  return out;
}

const DATA = { profiles: profilesJson, sentences: sentencesJson, statuses: statusesJson };
const FR = [...texts(STRINGS.fr), ...texts(IMAGE_WORDS.fr, "image"), ...Object.entries(DATA).flatMap(([name, d]) => shown(d, "fr", name))];
const EN = [...texts(STRINGS.en), ...texts(IMAGE_WORDS.en, "image"), ...Object.entries(DATA).flatMap(([name, d]) => shown(d, "en", name))];
const bad = (all: [string, string][], re: RegExp) => all.filter(([, s]) => re.test(s)).map(([p, s]) => `${p}: ${s.slice(0, 90)}`);

describe("la fiche et les données se relisent en entier", () => {
  it("assez de textes, fonctions et données comprises", () => {
    expect(FR.length).toBeGreaterThan(150);
    expect(EN.length).toBeGreaterThan(150);
    expect(FR.some(([p]) => p.startsWith("statuses"))).toBe(true);
  });

  it("français : jamais une espace simple avant « : ; ! ? » ni dans les guillemets", () => {
    expect(bad(FR, / [:;!?»]|« /)).toEqual([]);
  });

  it("un nombre ne quitte pas son unité, une variable non plus : « 9 s », « {n} mois », « 71 % »", () => {
    expect(bad(FR, /(\d|\})[ ](s|h|j|min|Mo|%|ans?|mois|jours?|semaines?)(?![\p{L}\d])/u)).toEqual([]);
  });

  it("ni tiret cadratin, ni point médian dans un mot", () => {
    for (const all of [FR, EN]) {
      expect(bad(all, /—/)).toEqual([]);
      expect(bad(all, /\p{L}·\p{L}/u)).toEqual([]);
    }
  });

  it("le lexique du site : une fiche, pas un dossier ; “sheet”, “Get yours”, “unproven”", () => {
    expect(bad(texts(STRINGS.fr), /Dossier scellé|sans objet|\bOps\b/)).toEqual([]);
    expect(bad(texts(STRINGS.en), /Sealed file|yet to prove|Make yours|not applicable|PER THE CV|\bOps\b/i)).toEqual([]);
    expect(bad(EN, /Ship or nothing|cops can read|READMEs of 300/)).toEqual([]);
    expect(bad(FR, /ne lit$|de cinq mots/)).toEqual([]);
  });
});
