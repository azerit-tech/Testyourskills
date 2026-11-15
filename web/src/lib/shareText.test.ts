import { describe, expect, it } from "vitest";
import { DICTS } from "../i18n";
import { flatteringRank, shareLead, shareText, shareTextX, SHARE_RANK_MAX, starsLine, xLength, X_LINK, X_MAX, type CardShare } from "./shareText";

const fr = DICTS.fr.result.share.words;
const en = DICTS.en.result.share.words;
const URL = "https://testyourskills.azerit.tech/c/AbCdEf1234?r=AbCdEf1234";
/** Espace insécable : les mots français du partage en portent avant « : » et dans les guillemets. */
const N = " ";

const card: CardShare = {
  kind: "card",
  stars: 4,
  level: "Pyromane",
  overall: 71,
  profile: "Sous couverture",
  finding: "61 % des derniers commits partent entre 22 h et 5 h.",
  status: "Commits de 3 h du matin",
  secs: 12,
  rank: "7e cette semaine",
  plea: null,
};

/** Ce que X compte : le texte, une espace, le lien à 23. */
const posted = (text: string) => xLength(text) + 1 + X_LINK;

describe("étoiles du texte de partage (§18.27)", () => {
  it("six étoiles, pleines puis vides", () => {
    expect(starsLine(4)).toBe("★★★★☆☆");
    expect(starsLine(1)).toBe("★☆☆☆☆☆");
    expect(starsLine(6)).toBe("★★★★★★");
  });

  it("borne ce qui sort de 0 à 6", () => {
    expect(starsLine(0)).toBe("☆☆☆☆☆☆");
    expect(starsLine(9)).toBe("★★★★★★");
    expect(starsLine(Number.NaN)).toBe("☆☆☆☆☆☆");
  });
});

describe("texte de partage d'une fiche", () => {
  it("sans pari : la fiche d'abord (étoiles, niveau, note sur 100), puis profil, rang, trouvaille, lien", () => {
    expect(shareText(fr, card, URL)).toBe(
      `Ma fiche de dev${N}: ★★★★☆☆ Pyromane, 71/100.\nProfil «${N}Sous couverture${N}», 7e cette semaine. 61 % des derniers commits partent entre 22 h et 5 h. Fiche dressée par Azerit en 12${N}s. Fais la tienne${N}: ${URL}`,
    );
  });

  it("avec pari : il vient en deuxième ligne, avec son mot en bas de casse", () => {
    expect(shareText(fr, { ...card, plea: 3 }, URL)).toBe(
      `Ma fiche de dev${N}: ★★★★☆☆ Pyromane, 71/100.\nJe plaidais ★★★☆☆☆${N}: trop modeste.\nProfil «${N}Sous couverture${N}», 7e cette semaine. 61 % des derniers commits partent entre 22 h et 5 h. Fiche dressée par Azerit en 12${N}s. Fais la tienne${N}: ${URL}`,
    );
    expect(shareLead(fr, { ...card, plea: 5 })).toContain(`Je plaidais ★★★★★☆${N}: excès de confiance.`);
    expect(shareLead(fr, { ...card, plea: 4 })).toContain(`Je plaidais ★★★★☆☆${N}: lucide.`);
  });

  it("sans trouvaille, le chef d'accusation ; sans rien, ni l'un ni l'autre", () => {
    expect(shareLead(fr, { ...card, finding: null, rank: null })).toBe(
      `Ma fiche de dev${N}: ★★★★☆☆ Pyromane, 71/100.\nProfil «${N}Sous couverture${N}». Chef d'accusation${N}: «${N}Commits de 3${N}h du matin${N}». Fiche dressée par Azerit en 12${N}s. Fais la tienne${N}:`,
    );
    expect(shareLead(fr, { ...card, finding: null, status: null, profile: null, rank: null })).toBe(
      `Ma fiche de dev${N}: ★★★★☆☆ Pyromane, 71/100.\nFiche dressée par Azerit en 12${N}s. Fais la tienne${N}:`,
    );
  });

  it("en anglais", () => {
    const x: CardShare = { ...card, level: "Arsonist", plea: 6, profile: "Undercover", rank: "#7 this week", finding: "61% of recent commits go out between 10 p.m. and 5 a.m." };
    expect(shareText(en, x, URL)).toBe(
      `My dev rap sheet: ★★★★☆☆ Arsonist, 71/100.\nI pleaded ★★★★★★: overconfident.\nProfile: “Undercover”, #7 this week. 61% of recent commits go out between 10 p.m. and 5 a.m. Rap sheet drawn up by Azerit in 12s. Get yours: ${URL}`,
    );
    expect(shareLead(en, { ...x, plea: null, finding: null })).toBe(
      "My dev rap sheet: ★★★★☆☆ Arsonist, 71/100.\nProfile: “Undercover”, #7 this week. Charge: “Commits de 3 h du matin”. Rap sheet drawn up by Azerit in 12s. Get yours:",
    );
  });
});

describe("le texte qu'on signe de son nom (§18.48)", () => {
  const graded: CardShare = { ...card, graded: true, strong: `Point fort${N}: niveau du code, 8/10.`, exhibits: "LinkedIn" };
  const cases: CardShare[] = [card, { ...card, plea: 5 }, graded, { ...graded, plea: 2 }, { ...card, sealed: true }, { ...card, profile: null, rank: null, finding: null, status: null }];

  it("la note porte toujours son échelle : « 71/100 », jamais « 71 » seul", () => {
    for (const w of [fr, en]) {
      for (const x of cases.filter((c) => !c.sealed)) {
        expect(shareLead(w, x)).toContain("71/100");
        expect(shareTextX(w, x)).toContain("71/100");
      }
    }
  });

  it("une phrase, des virgules : aucun point médian, dans aucune coupe pour X", () => {
    const long = "x".repeat(170);
    for (const w of [fr, en]) {
      for (const x of [...cases, { ...card, finding: long }, { ...card, finding: long, status: long }, { ...graded, finding: long, profile: long }]) {
        expect(shareLead(w, x)).not.toContain("·");
        expect(shareTextX(w, x)).not.toContain("·");
      }
    }
  });

  it("« Fais la tienne » répond à un mot féminin : « fiche », jamais « dossier » en tête", () => {
    for (const x of cases) {
      const text = shareLead(fr, x);
      expect(text).toMatch(/fiche/i);
      expect(text).not.toMatch(/Mon dossier|Un dossier ouvert|Dossier lu/);
    }
    for (const x of cases) expect(shareLead(en, x)).not.toMatch(/Make yours|\bMy file\b|hiring grid|yet to prove/);
  });

  it("le rang ne part que s'il flatte : le top 10 de la semaine", () => {
    expect(SHARE_RANK_MAX).toBe(10);
    expect([1, 4, 10].every(flatteringRank)).toBe(true);
    expect([0, 11, 37, 412].some(flatteringRank)).toBe(false);
    // Sans rang, la phrase s'arrête au profil.
    expect(shareLead(fr, { ...card, rank: null })).toContain(`Profil «${N}Sous couverture${N}». `);
  });
});

describe("texte de partage avec la grille de recrutement (§18.37)", () => {
  const graded: CardShare = { ...card, overall: 61, profile: "Oiseau de nuit", rank: null, finding: null, status: null, graded: true, strong: `Point fort${N}: niveau du code, 8/10.` };

  it("une fiche : la grille d'Azerit dès la première ligne, puis le profil et le point fort", () => {
    expect(shareLead(fr, { ...graded, level: "Menace publique" })).toBe(
      `Ma fiche de dev selon la grille de recrutement d'Azerit${N}: ★★★★☆☆ Menace publique, 61/100.\nProfil «${N}Oiseau de nuit${N}». Point fort${N}: niveau du code, 8/10. Fais la tienne${N}:`,
    );
    expect(shareLead(en, { ...graded, level: "Public menace", profile: "Night owl", strong: "Top strength: code level, 8/10." })).toBe(
      "My dev rap sheet, scored on Azerit's hiring scorecard: ★★★★☆☆ Public menace, 61/100.\nProfile: “Night owl”. Top strength: code level, 8/10. Get yours:",
    );
    // L'exemple du rapport : la fiche, le pari en chute, le profil et son rang, le point fort.
    expect(shareLead(fr, { ...graded, stars: 5, level: "Menace publique", overall: 79, plea: 3, profile: "Machine à livrer", rank: "4e cette semaine", strong: `Point fort${N}: open source, 10/10.` })).toBe(
      `Ma fiche de dev selon la grille de recrutement d'Azerit${N}: ★★★★★☆ Menace publique, 79/100.\nJe plaidais ★★★☆☆☆${N}: trop modeste.\nProfil «${N}Machine à livrer${N}», 4e cette semaine. Point fort${N}: open source, 10/10. Fais la tienne${N}:`,
    );
  });

  it("aucun mot qui accuse ni « une IA » dans les mots du partage", () => {
    for (const w of [fr, en]) {
      const all = [w.file("★", "x", 1), w.ai(9), w.exhibits("LinkedIn")].join(" ");
      expect(all).not.toMatch(/\bvol|stole|suspect|une IA|an AI|contre|against/i);
    }
  });
});

describe("un dossier à deux sources se partage comme une fiche (§18.36)", () => {
  const dossier: CardShare = { ...card, overall: 57, stars: 3, profile: "Oiseau de nuit", rank: null, finding: null, status: null, graded: true, strong: `Point fort${N}: niveau du code, 8/10.`, exhibits: "LinkedIn" };

  it("une note, le point fort, puis ses deux sources ; jamais l'une contre l'autre", () => {
    expect(shareLead(fr, dossier)).toBe(
      `Ma fiche de dev selon la grille de recrutement d'Azerit${N}: ★★★☆☆☆ Pyromane, 57/100.\nProfil «${N}Oiseau de nuit${N}». Point fort${N}: niveau du code, 8/10. Deux sources au dossier${N}: LinkedIn et GitHub. Fais la tienne${N}:`,
    );
    expect(shareLead(en, { ...dossier, level: "Arsonist", profile: "Night owl", strong: "Top strength: code level, 8/10.", exhibits: "résumé" })).toBe(
      "My dev rap sheet, scored on Azerit's hiring scorecard: ★★★☆☆☆ Arsonist, 57/100.\nProfile: “Night owl”. Top strength: code level, 8/10. Two sources on file: résumé and GitHub. Get yours:",
    );
    for (const w of [fr, en]) expect(shareLead(w, dossier)).not.toMatch(/sous-vend|annonce \d|en montre plus|undersell|claims \d|shows more/i);
  });

  it("une fiche seule ne dit pas de sources ; pour X, les sources partent en premier", () => {
    expect(shareLead(fr, { ...dossier, exhibits: undefined })).not.toMatch(/sources|pièces/);
    const long: CardShare = { ...dossier, profile: "Sous couverture", rank: "n° 1 cette semaine", finding: "x".repeat(150) };
    expect(posted(shareTextX(fr, long))).toBeLessThanOrEqual(X_MAX);
    expect(shareTextX(fr, long)).not.toContain("Deux sources");
  });
});

describe("dossier vide fait par un tiers, non revendiqué : le partage ne dit pas la note", () => {
  it("ni note, ni étoiles, ni pari, pour une fiche comme pour un dossier à deux sources", () => {
    const sealedCard: CardShare = { ...card, overall: 20, stars: 1, plea: 3, sealed: true };
    expect(shareLead(fr, sealedCard)).toBe(`Une fiche ouverte chez Azerit, le code reste à prouver. Profil «${N}Sous couverture${N}». Fais la tienne${N}:`);
    expect(shareLead(en, sealedCard)).toBe("A rap sheet opened at Azerit, code still unproven. Profile: “Sous couverture”. Get yours:");
    const sealedCmp: CardShare = { ...sealedCard, graded: true, exhibits: "LinkedIn" };
    for (const w of [fr, en]) {
      for (const x of [sealedCard, sealedCmp]) {
        expect(shareLead(w, x)).not.toMatch(/\b20\b|★|☆/);
        expect(shareTextX(w, x)).not.toMatch(/\b20\b|★|☆/);
      }
    }
  });
});

describe("longueur comptée par X", () => {
  it("une étoile, une espace fine insécable ou des points de suspension valent deux", () => {
    expect(xLength("abc é « » ·")).toBe(11);
    expect(xLength("★★★★☆☆")).toBe(12);
    expect(xLength("5\u202fh")).toBe(4);
    expect(xLength("…")).toBe(2);
  });

  it("un mot en forme de domaine compte comme un lien", () => {
    expect(xLength("socket.io")).toBe(X_LINK);
    expect(xLength("repo socket.io, 312 étoiles")).toBe(18 + X_LINK);
    // Une heure ou une abréviation n'en est pas un.
    expect(xLength("10 p.m. et 5 a.m.")).toBe(17);
  });
});

describe("texte pour X : jamais plus de 280 avec le lien", () => {
  const long = (n: number) => `${"Trouvaille très longue. ".repeat(Math.ceil(n / 24)).slice(0, n - 1)}.`;

  it("un texte normal passe entier", () => {
    const x: CardShare = { ...card, plea: 5 };
    expect(shareTextX(fr, x)).toBe(shareLead(fr, x));
    expect(posted(shareTextX(fr, x))).toBeLessThanOrEqual(X_MAX);
  });

  it("trop long : la trouvaille laisse la place au chef d'accusation", () => {
    const text = shareTextX(fr, { ...card, plea: 5, finding: long(200) });
    expect(text).toBe(
      `Ma fiche de dev${N}: ★★★★☆☆ Pyromane, 71/100.\nJe plaidais ★★★★★☆${N}: excès de confiance.\nProfil «${N}Sous couverture${N}», 7e cette semaine. Chef d'accusation${N}: «${N}Commits de 3${N}h du matin${N}». Fiche dressée par Azerit en 12${N}s. Fais la tienne${N}:`,
    );
  });

  it("toujours trop long : la trouvaille part, puis le reste dans l'ordre", () => {
    const base: CardShare = { ...card, plea: 5, finding: long(200), status: long(190) };
    expect(shareTextX(fr, base)).toBe(
      `Ma fiche de dev${N}: ★★★★☆☆ Pyromane, 71/100.\nJe plaidais ★★★★★☆${N}: excès de confiance.\nProfil «${N}Sous couverture${N}», 7e cette semaine. Fiche dressée par Azerit en 12${N}s. Fais la tienne${N}:`,
    );
    const noAi = shareTextX(fr, { ...base, profile: long(100) });
    expect(noAi).not.toContain("Fiche dressée par Azerit");
    expect(noAi).toContain("7e cette semaine");
    const bare = shareTextX(fr, { ...base, profile: long(240) });
    expect(bare).toBe(`Ma fiche de dev${N}: ★★★★☆☆ Pyromane, 71/100.\nJe plaidais ★★★★★☆${N}: excès de confiance.\nFais la tienne${N}:`);
  });

  it("ne dépasse jamais, quelles que soient les longueurs, dans les deux langues", () => {
    for (const w of [fr, en]) {
      for (const plea of [null, 1, 6]) {
        for (const n of [0, 40, 120, 190, 230, 400]) {
          const c: CardShare = { ...card, plea, finding: n ? long(n) : null, status: n ? long(Math.max(8, n - 60)) : null, profile: n > 200 ? long(n) : card.profile };
          expect(posted(shareTextX(w, c))).toBeLessThanOrEqual(X_MAX);
        }
      }
    }
  });
});
