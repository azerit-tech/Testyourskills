// Les règles des textes du site (§18.48), tenues sur les deux dictionnaires entiers :
// typographie française, lexique, épicène, aucun nom de produit autre qu'« Azerit ».
import { describe, expect, it } from "vitest";
import { LEVEL_LABELS } from "../../shared/types";
import { DICTS } from "./i18n";

/** Des arguments d'essai pour les fonctions des dictionnaires : tout ce qui sort en texte est relu. */
const ARGS: unknown[][] = [
  [3, 40, 2, 1],
  [1, 1, 1, 1],
  [0, 0, 0, 0],
  ["Léa", "CV", "GitHub", "x", "y"],
  ["Léa", 79, "x", 4, "y"],
  [7, "Léa", 79, 4],
  ["★★★★☆☆", 71],
  [null, 71],
  [{ type: "ecole", id: "x", label: "X", score: 6, members: 3, rank: 3, missing: 0, gap: 6, ahead: { id: "y", label: "Y", rank: 2 } }],
  [{ type: "boite", id: "x", label: "X", score: 1, members: 1, rank: null, missing: 2, gap: null, ahead: null }],
];

/** Toutes les chaînes d'un dictionnaire, avec leur chemin ; les fonctions sont appelées avec les arguments d'essai. */
function texts(value: unknown, path = "", out: [string, string][] = [], depth = 0): [string, string][] {
  if (depth > 12) return out;
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => texts(v, `${path}[${i}]`, out, depth + 1));
  else if (typeof value === "function") {
    ARGS.forEach((args, i) => {
      try {
        texts((value as (...a: unknown[]) => unknown)(...args), `${path}(#${i})`, out, depth + 1);
      } catch {
        /* cette fonction attend autre chose : un autre jeu d'arguments la couvre */
      }
    });
  } else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) texts(v, path ? `${path}.${k}` : k, out, depth + 1);
  return out;
}

const FR = texts(DICTS.fr);
const EN = texts(DICTS.en);
const bad = (all: [string, string][], re: RegExp, skip?: RegExp) => all.filter(([p, s]) => re.test(s) && !(skip && skip.test(p))).map(([p, s]) => `${p}: ${s.slice(0, 90)}`);

describe("les dictionnaires se relisent en entier", () => {
  it("assez de textes, fonctions comprises", () => {
    expect(FR.length).toBeGreaterThan(900);
    expect(EN.length).toBeGreaterThan(900);
    expect(FR.some(([p]) => p.includes("(#"))).toBe(true);
  });
});

describe("typographie française (shared/typo.ts)", () => {
  it("jamais une espace simple avant « : ; ! ? » ni à l'intérieur des guillemets", () => {
    expect(bad(FR, / [:;!?»]|« /)).toEqual([]);
  });

  it("un nombre ne quitte pas son unité : « 9 s », « 5 Mo », « 90 jours », « 71 % »", () => {
    expect(bad(FR, /\d (s|h|j|min|Mo|%|ans?|jours?)(?![\p{L}\d])/u)).toEqual([]);
  });

  it("ni tiret cadratin, ni point médian dans un mot", () => {
    for (const all of [FR, EN]) {
      expect(bad(all, /—/)).toEqual([]);
      expect(bad(all, /\p{L}·\p{L}/u)).toEqual([]);
    }
  });
});

describe("un seul nom, un seul lexique", () => {
  it("le produit s'appelle « Azerit » : « Testyourskills » ne sort nulle part", () => {
    for (const all of [FR, EN]) expect(bad(all, /testyourskills/i)).toEqual([]);
    expect(DICTS.fr.meta.titleCard("@leamd", 79)).toBe("@leamd ★★★★★☆ · Azerit");
    expect(DICTS.en.meta.titlePage("Privacy")).toBe("Privacy · Azerit");
  });

  it("français : « grille », « repo », jamais « barème » ni « dépôt » ; on compte des fiches, pas des dossiers", () => {
    expect(bad(FR, /barème|\bdépôts?\b/i)).toEqual([]);
    expect(bad(FR, /\d+[  ]dossiers?\b|Trois dossiers|Les dossiers\b/)).toEqual([]);
    expect(bad(FR, /gonfler la bande|\bconcours\b(?! de| sans|,)|Prime close|\bClose\b/)).toEqual([]);
  });

  it("anglais américain : « crew », « scorecard », « Get yours », « unproven »", () => {
    expect(bad(EN, /\bgangs?\b|hiring grid|\brubric\b|\bthe grid\b|Make yours|Make your file|yet to prove|It's me\b|case file/i, /reveal\.open/)).toEqual([]);
    expect(bad(EN, /practised|favourable|\bmaths\b|\bprogramme\b|\borganisation\b/i)).toEqual([]);
  });

  it("la lettre du rang d'une école ne s'affiche nulle part (§18.48)", () => {
    const letter = /\b(rang|tier) [SABC]\b|s'arrête à [SABC]\b|stops at [SABC]\b/i;
    expect(bad(FR, letter)).toEqual([]);
    expect(bad(EN, letter)).toEqual([]);
    expect(bad(EN, /\d+ files?\b|three files|The files\b/i)).toEqual([]);
  });

  it("la note porte son échelle dans les phrases qui la disent", () => {
    expect(DICTS.fr.home.top.rowLabel(2, "leamd", 79)).toContain("79/100");
    expect(DICTS.en.home.top.rowLabel(2, "leamd", 79)).toContain("79/100");
    expect(DICTS.fr.result.share.words.sheet("★★★★★☆", "Menace publique", 79).replace(/ /g, " ")).toBe("Ma fiche de dev : ★★★★★☆ Menace publique, 79/100.");
    expect(DICTS.en.result.share.words.file("★★★★★☆", "Public menace", 79)).toBe("My dev rap sheet, scored on Azerit's hiring scorecard: ★★★★★☆ Public menace, 79/100.");
  });
});

describe("les libellés qui tranchent (§18.48)", () => {
  it("l'entrée : « Faire ma fiche », « On ouvre ton dossier… »", () => {
    expect(DICTS.fr.home.submit).toBe("Faire ma fiche");
    expect(DICTS.en.home.submit).toBe("Get my rap sheet");
    expect(DICTS.fr.home.submitting).toBe("On ouvre ton dossier…");
    expect(DICTS.en.home.submitting).toBe("Opening your file…");
    expect(DICTS.fr.home.hookPlay).toBe("De une à six étoiles, en une minute. Sans compte.");
    expect(DICTS.fr.bands.home.hook).toBe("Fais ta fiche. Fais gagner ta bande.");
  });

  it("« C'est moi » réclame, « Faire appel » conteste, dans les deux langues", () => {
    expect(DICTS.fr.result.claim.kicker).toBe("Verrouille ta fiche");
    expect(DICTS.en.result.claim.kicker).toBe("Lock your sheet");
    expect(DICTS.fr.result.claim.btnLawyer).toMatch(/^C'est moi/);
    expect(DICTS.en.result.claim.btnLawyer).toMatch(/^That's me/);
    expect(DICTS.fr.result.contest.button).toBe("Faire appel");
    expect(DICTS.en.result.contest.button).toBe("Appeal");
    expect(DICTS.en.result.contest.again).toBe("Appeal again");
    expect(DICTS.en.result.contest.title).toBe("The defense replies");
    const lawyer = [...FR, ...EN].filter(([, s]) => /Appeler mon avocat|Call my lawyer/i.test(s));
    expect(lawyer).toEqual([]);
  });

  it("les plis parlent à l'impératif tutoyé (§18.48)", () => {
    const r = DICTS.fr.result;
    expect([r.dossier.title, r.rest.photo, r.rest.email, r.rest.contest, r.claim.kicker].map((s) => s.replace(/\u00a0/g, " "))).toEqual([
      "Vois les autres pièces",
      "Mets ta photo LinkedIn",
      "Garde ta fiche au-delà de 90 jours",
      "Fais appel",
      "Verrouille ta fiche",
    ]);
    expect(DICTS.en.result.rest.email).toBe("Keep your sheet past 90 days");
    // L'email : rien ne part, aucun mot d'envoi.
    expect(Object.values(DICTS.fr.result.email).join(" ")).not.toMatch(/envoi|recevoir/i);
    expect(Object.values(DICTS.en.result.email).join(" ")).not.toMatch(/send|sending/i);
  });

  it("un seul libellé pour LinkedIn, et la ligne qui dit, après l'appui, où est parti le texte (§18.76)", () => {
    expect(DICTS.fr.result.share.linkedin).toBe("Partager sur LinkedIn");
    expect(DICTS.en.result.share.linkedin).toBe("Share on LinkedIn");
    expect(DICTS.fr.result.share.copiedShort.replace(/[\u00a0\u202f]/g, " ")).toBe("Texte copié : colle-le dans ton post LinkedIn.");
  });

  it("la 404 ne nomme aucune marque", () => {
    // La page : components/ErrorPage.tsx, textes sous `pages.error` ; l'onglet garde `notFound.title`.
    for (const lang of ["fr", "en"] as const) expect(JSON.stringify([DICTS[lang].notFound, DICTS[lang].pages.error])).not.toMatch(/GTA|FIFA|Rockstar|Vice|404 étoiles/i);
    expect(DICTS.fr.pages.error.page.text).toBe("Cette adresse n'est dans aucun dossier.");
    expect(DICTS.en.pages.error.page.text).toBe("This address isn't in any file.");
  });

  it("les niveaux : « Avis de recherche » reste le titre de l'affiche, plus celui d'un niveau", () => {
    expect([1, 2, 3, 4, 5, 6].map((s) => LEVEL_LABELS[s as 1].fr)).toEqual(["Petit délit", "Délit", "Mandat d'arrêt", "Haute surveillance", "Menace publique", "Priorité absolue"]);
    expect([1, 2, 3, 4, 5, 6].map((s) => LEVEL_LABELS[s as 1].en)).toEqual(["Petty crime", "Misdemeanor", "Warrant out", "Under surveillance", "Public menace", "Top priority"]);
    expect(DICTS.fr.result.wanted).toBe("Avis de recherche");
  });
});

describe("pluriels et comptes à zéro", () => {
  const { fr, en } = DICTS;
  it("en anglais, tout sauf un est pluriel ; en français, le pluriel commence à deux", () => {
    expect([0, 1, 2].map((k) => en.bands.dossiers(k))).toEqual(["0 sheets", "1 sheet", "2 sheets"]);
    expect([0, 1, 2].map((k) => fr.bands.dossiers(k))).toEqual(["0 fiche", "1 fiche", "2 fiches"]);
    expect([0, 1, 2].map((k) => en.primes.page.total(k))).toEqual(["0 sheets in the race", "1 sheet in the race", "2 sheets in the race"]);
    expect([0, 1, 2].map((k) => fr.primes.page.total(k))).toEqual(["0 fiche en course", "1 fiche en course", "2 fiches en course"]);
    expect(en.bands.board.rowLabel(1, "X", 0, 1)).toBe("#1, X, 0 stars, 1 sheet");
    expect(fr.bands.board.rowLabel(1, "X", 1, 3)).toBe("n° 1, X, 1 étoile, 3 fiches");
  });

  it("le compte à rebours d'une prime : « 1 day left », « Terminée »", () => {
    expect([0, 1, 12].map((k) => en.primes.days(k))).toEqual(["Last day", "1 day left", "12 days left"]);
    expect([0, 1, 12].map((k) => fr.primes.days(k))).toEqual(["Dernier jour", "J-1", "J-12"]);
    expect(fr.primes.closed).toBe("Terminée");
    expect(en.primes.closed).toBe("Closed");
    expect(fr.primes.race.join).toBe("Entrer dans la course");
    expect(en.primes.race.join).toBe("Enter the race");
  });
});
