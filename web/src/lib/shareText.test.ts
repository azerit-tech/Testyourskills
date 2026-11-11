import { describe, expect, it } from "vitest";
import { DICTS } from "../i18n";
import { shareLead, shareText, shareTextX, starsLine, xLength, X_LINK, X_MAX, type CardShare, type ComparisonShare } from "./shareText";

const fr = DICTS.fr.result.share.words;
const en = DICTS.en.result.share.words;
const URL = "https://testyourskills.azerit.tech/c/AbCdEf1234?r=AbCdEf1234";

const card: CardShare = {
  kind: "card",
  stars: 4,
  overall: 71,
  profile: "Faussaire",
  finding: "61 % des derniers commits partent entre 22 h et 5 h.",
  status: "Commits de 3 h du matin",
  secs: 12,
  rank: "7e cette semaine",
  plea: null,
};

const cmp: ComparisonShare = {
  kind: "comparison",
  stars: 4,
  src: "LinkedIn",
  declared: 88,
  github: 71,
  profile: "Faussaire",
  headline: "17 points d'écart entre le profil et le code",
  rank: null,
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
  it("sans pari : étoiles, note, profil, rang, trouvaille, lien", () => {
    expect(shareText(fr, card, URL)).toBe(
      `Fiche ★★★★☆☆, 71 · Faussaire · 7e cette semaine. 61 % des derniers commits partent entre 22 h et 5 h. Dossier lu par Azerit en 12 s. Fais la tienne : ${URL}`,
    );
  });

  it("avec pari : une ligne courte d'abord, et les étoiles ne se répètent pas", () => {
    expect(shareText(fr, { ...card, plea: 5 }, URL)).toBe(
      `Je plaidais ★★★★★☆. Verdict : ★★★★☆☆.\nNote 71 · Faussaire · 7e cette semaine. 61 % des derniers commits partent entre 22 h et 5 h. Dossier lu par Azerit en 12 s. Fais la tienne : ${URL}`,
    );
  });

  it("sans trouvaille, le chef d'accusation ; sans rien, ni l'un ni l'autre", () => {
    expect(shareLead(fr, { ...card, finding: null, rank: null })).toBe(
      "Fiche ★★★★☆☆, 71 · Faussaire. Chef d'accusation : « Commits de 3 h du matin ». Dossier lu par Azerit en 12 s. Fais la tienne :",
    );
    expect(shareLead(fr, { ...card, finding: null, status: null, profile: null, rank: null })).toBe(
      "Fiche ★★★★☆☆, 71. Dossier lu par Azerit en 12 s. Fais la tienne :",
    );
  });

  it("en anglais", () => {
    const x: CardShare = { ...card, plea: 6, profile: "Forger", rank: "#7 this week", finding: "61% of recent commits go out between 10 p.m. and 5 a.m." };
    expect(shareText(en, x, URL)).toBe(
      `I pleaded ★★★★★★. Verdict: ★★★★☆☆.\nScore 71 · Forger · #7 this week. 61% of recent commits go out between 10 p.m. and 5 a.m. File read by Azerit in 12s. Make yours: ${URL}`,
    );
    expect(shareLead(en, { ...x, plea: null, finding: null })).toBe(
      "★★★★☆☆ sheet, 71 · Forger · #7 this week. Charge: “Commits de 3 h du matin”. File read by Azerit in 12s. Make yours:",
    );
  });
});

describe("texte de partage d'une comparaison", () => {
  it("sans pari : les étoiles devant la note GitHub", () => {
    expect(shareText(fr, cmp, URL)).toBe(
      `Mon LinkedIn : 88. Mon GitHub : ★★★★☆☆, 71 · Faussaire. 17 points d'écart entre le profil et le code. Fais la tienne : ${URL}`,
    );
  });

  it("avec pari et rang", () => {
    expect(shareLead(fr, { ...cmp, src: "CV", plea: 6, rank: "n° 1 cette semaine" })).toBe(
      "Je plaidais ★★★★★★. Verdict : ★★★★☆☆.\nMon CV : 88. Mon GitHub : 71 · Faussaire · n° 1 cette semaine. 17 points d'écart entre le profil et le code. Fais la tienne :",
    );
  });

  it("en anglais", () => {
    expect(shareLead(en, { ...cmp, profile: "Forger", headline: "17 points between the profile and the code" })).toBe(
      "My LinkedIn: 88. My GitHub: ★★★★☆☆, 71 · Forger. 17 points between the profile and the code. Make yours:",
    );
  });
});

describe("texte de partage avec la grille de recrutement (§18.37)", () => {
  const graded: CardShare = { ...card, overall: 61, profile: "Oiseau de nuit", rank: null, finding: null, status: null, graded: true, strong: "Point fort\u00a0: niveau du code, 8/10." };

  it("une fiche : la grille d'Azerit dès la première ligne, puis le point fort", () => {
    expect(shareLead(fr, graded)).toBe(
      "Mon dossier, passé à la grille de recrutement d'Azerit\u00a0: ★★★★☆☆, 61 · Oiseau de nuit. Point fort\u00a0: niveau du code, 8/10. Fais la tienne :",
    );
    expect(shareLead(en, { ...graded, profile: "Night owl", strong: "Strong point: code level, 8/10." })).toBe(
      "My file, run through Azerit's hiring grid: ★★★★☆☆, 61 · Night owl. Strong point: code level, 8/10. Make yours:",
    );
    // Avec le pari, les étoiles ne se répètent pas.
    expect(shareLead(fr, { ...graded, plea: 3 })).toBe(
      "Je plaidais ★★★☆☆☆. Verdict : ★★★★☆☆.\nMon dossier, passé à la grille de recrutement d'Azerit\u00a0: 61 · Oiseau de nuit. Point fort\u00a0: niveau du code, 8/10. Fais la tienne :",
    );
  });

  it("une comparaison : la note du dossier en tête, ses deux pièces, le verdict à la première personne", () => {
    const x: ComparisonShare = { ...cmp, stars: 3, declared: 41, github: 61, case: 57, profile: null, headline: "Mon LinkedIn me sous-vend de 20 points." };
    expect(shareLead(fr, x)).toBe(
      "Mon dossier, passé à la grille de recrutement d'Azerit\u00a0: ★★★☆☆☆, 57. LinkedIn 41, GitHub 61. Mon LinkedIn me sous-vend de 20 points. Fais la tienne :",
    );
    expect(shareLead(en, { ...x, headline: "My LinkedIn undersells me by 20 points." })).toBe(
      "My file, run through Azerit's hiring grid: ★★★☆☆☆, 57. LinkedIn 41, GitHub 61. My LinkedIn undersells me by 20 points. Make yours:",
    );
  });

  it("aucun mot qui accuse ni « une IA » dans les mots du partage", () => {
    for (const w of [fr, en]) {
      const all = [w.file("★", 1), w.ai(9), w.pieces("LinkedIn", 1, 2), w.compare("LinkedIn", 1, 2, null)].join(" ");
      expect(all).not.toMatch(/\bvol|stole|suspect|une IA|an AI|contre|against/i);
    }
  });
});

describe("dossier vide fait par un tiers, non revendiqué : le partage ne dit pas la note", () => {
  it("ni note, ni étoiles, ni pari, pour une fiche comme pour une comparaison", () => {
    const sealedCard: CardShare = { ...card, overall: 20, stars: 1, plea: 3, sealed: true };
    expect(shareLead(fr, sealedCard)).toBe("Un dossier ouvert chez Azerit, le code reste à prouver · Faussaire. Fais la tienne :");
    expect(shareLead(en, sealedCard)).toBe("A file opened at Azerit, the code yet to prove · Faussaire. Make yours:");
    const sealedCmp: ComparisonShare = { ...cmp, github: 20, stars: 1, sealed: true };
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
    expect(xLength("5 h")).toBe(4);
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
      "Je plaidais ★★★★★☆. Verdict : ★★★★☆☆.\nNote 71 · Faussaire · 7e cette semaine. Chef d'accusation : « Commits de 3 h du matin ». Dossier lu par Azerit en 12 s. Fais la tienne :",
    );
  });

  it("toujours trop long : la trouvaille part, puis le reste dans l'ordre", () => {
    const base: CardShare = { ...card, plea: 5, finding: long(200), status: long(190) };
    expect(shareTextX(fr, base)).toBe(
      "Je plaidais ★★★★★☆. Verdict : ★★★★☆☆.\nNote 71 · Faussaire · 7e cette semaine. Dossier lu par Azerit en 12 s. Fais la tienne :",
    );
    const noAi = shareTextX(fr, { ...base, profile: long(140) });
    expect(noAi).not.toContain("Dossier lu par Azerit");
    expect(noAi).toContain("7e cette semaine");
    const bare = shareTextX(fr, { ...base, profile: long(240) });
    expect(bare).toBe("Je plaidais ★★★★★☆. Verdict : ★★★★☆☆.\nNote 71. Fais la tienne :");
  });

  it("ne dépasse jamais, quelles que soient les longueurs, dans les deux langues", () => {
    for (const w of [fr, en]) {
      for (const plea of [null, 1, 6]) {
        for (const n of [0, 40, 120, 190, 230, 400]) {
          const c: CardShare = { ...card, plea, finding: n ? long(n) : null, status: n ? long(Math.max(8, n - 60)) : null, profile: n > 200 ? long(n) : card.profile };
          expect(posted(shareTextX(w, c))).toBeLessThanOrEqual(X_MAX);
          const k: ComparisonShare = { ...cmp, plea, rank: "7e cette semaine", headline: n ? long(n) : cmp.headline, profile: n > 200 ? long(n) : cmp.profile };
          expect(posted(shareTextX(w, k))).toBeLessThanOrEqual(X_MAX);
        }
      }
    }
  });

  it("une comparaison trop longue perd le rang, puis le profil, puis le titre", () => {
    const k: ComparisonShare = { ...cmp, rank: "7e cette semaine", headline: long(170) };
    expect(shareTextX(fr, k)).not.toContain("7e cette semaine");
    expect(shareTextX(fr, k)).toContain("Faussaire");
    expect(shareTextX(fr, { ...k, headline: long(400) })).toBe("Mon LinkedIn : 88. Mon GitHub : ★★★★☆☆, 71. Fais la tienne :");
  });
});
