// La photo d'identité (§18.48) : une toise aux nombres entiers, une silhouette
// à initiales quand la photo manque, et un seul gabarit de plaque, « @PSEUDO »
// puis « N° · date », pour la fiche, l'attente, la couverture et le film.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../fixtures";
import type { CardData, Lang } from "../types";
import { CardGraphic } from "./Card";
import { MUG_PHOTO, MUG_SIZE, PLACARD, PLATE, Plate, Silhouette, Toise, caseDate, caseLabel, caseNumber, initialsOf, plateName, plateSub, toiseCover } from "./mug";

const face = (card: CardData, lang: Lang, avatarHref?: string) => renderToStaticMarkup(createElement(CardGraphic, { card, lang, avatarHref }));
/** Les graduations dessinées : les nombres à trois chiffres de la toise, en mono 8. */
const ticks = (svg: string) => [...svg.matchAll(/font-size="8"[^>]*>(1\d0)</g)].map((m) => m[1]);

describe("la toise", () => {
  it("un nombre entier ou pas de nombre : rien sous la photo, rien sous la plaque", () => {
    const withPhoto = renderToStaticMarkup(createElement(Toise, { coverTop: toiseCover(MUG_SIZE.h, true) }));
    expect(ticks(withPhoto)).toEqual(["190"]);
    const withoutPhoto = renderToStaticMarkup(createElement(Toise, { coverTop: toiseCover(MUG_SIZE.h, false) }));
    expect(ticks(withoutPhoto)).toEqual(["190", "180", "170"]);
  });

  it("la photo commence sous le premier nombre, la plaque sous le dernier", () => {
    // Un nombre de 8 px posé sur sa ligne de base : il finit 2 px plus bas au plus.
    expect(21 + 2).toBeLessThanOrEqual(MUG_SIZE.h - MUG_PHOTO.h);
    expect(21 + 2 * 53 + 2).toBeLessThanOrEqual(MUG_SIZE.h - PLACARD.bottom - PLACARD.h - 3);
  });

  it("sur la fiche : « 190 » seul avec une photo ; 190, 180, 170 devant la silhouette", () => {
    for (const lang of ["fr", "en"] as Lang[]) {
      expect(ticks(face(FIXTURES.gold, lang, "data:image/png;base64,AAAA"))).toEqual(["190"]);
      expect(ticks(face(FIXTURES.gold, lang, ""))).toEqual(["190", "180", "170"]);
    }
  });
});

describe("sans photo : la silhouette à initiales", () => {
  it("la fiche montre la silhouette et les initiales, jamais une image vide", () => {
    const svg = face(FIXTURES.gold, "fr", "");
    expect(svg).toContain("data-silhouette");
    expect(svg).toContain(`>${FIXTURES.gold.initials}<`);
    expect(svg).not.toContain("<image");
    const withPhoto = face(FIXTURES.gold, "fr", "data:image/png;base64,AAAA");
    expect(withPhoto).not.toContain("data-silhouette");
    expect(withPhoto).toContain("<image");
  });

  it("les initiales tiennent dans la tête, en capitales ; sans initiales, la silhouette seule", () => {
    const svg = renderToStaticMarkup(createElement(Silhouette, { initials: "lm" }));
    expect(svg).toContain(">LM<");
    expect(renderToStaticMarkup(createElement(Silhouette, { initials: "" }))).not.toContain("<text");
  });

  it("initialsOf : d'un pseudo ou d'un nom de lien", () => {
    expect(initialsOf("leamd")).toBe("LE");
    expect(initialsOf("@nour-rs")).toBe("NR");
    expect(initialsOf("camille-ardent-4b2a")).toBe("CA");
    expect(initialsOf("x")).toBe("X");
    expect(initialsOf("")).toBe("");
    expect(initialsOf(null)).toBe("");
  });
});

describe("la plaque d'identité, un seul gabarit", () => {
  it("« @PSEUDO » en capitales ; sans pseudo, le nom ; sinon le nom du lien LinkedIn", () => {
    expect(plateName({ login: "leamd", name: "Léa Martin" }, "fr")).toBe("@LEAMD");
    expect(plateName({ name: "Léa Martin" }, "fr")).toBe("LÉA MARTIN");
    expect(plateName({ slug: "camille-ardent" }, "en")).toBe("CAMILLE-ARDENT");
    expect(plateName({}, "fr")).toBeNull();
  });

  it("seconde ligne : « N° MGOLDB · 14.10.26 », le numéro et le jour de la fiche", () => {
    expect(caseNumber("m-gold-b7k2")).toBe("MGOLDB");
    expect(caseNumber("")).toBe("0000");
    expect(caseDate("2026-10-14T12:00:00Z")).toBe("14.10.26");
    expect(caseDate("n'importe quoi")).toBe("");
    expect(caseLabel("m-gold-b7k2", "fr")).toBe("N° MGOLDB");
    expect(plateSub("m-gold-b7k2", "2026-10-14T12:00:00Z", "fr")).toBe("N° MGOLDB · 14.10.26");
    expect(plateSub("m-gold-b7k2", "2026-10-14T12:00:00Z", "en")).toBe("No. MGOLDB · 14.10.26");
    // Un horodatage (l'attente, avant la fiche) donne le même jour que la date ISO de la fiche.
    expect(plateSub("abc123", Date.UTC(2026, 10, 19, 8), "fr")).toBe(plateSub("abc123", "2026-11-19T23:10:00Z", "fr"));
  });

  it("crème sur #111, inclinée de 1,5°, le nom en Barlow 700 espacé de 0,06 em", () => {
    const svg = renderToStaticMarkup(createElement(Plate, { name: "@LEAMD", sub: "N° MGOLDB · 14.10.26" }));
    expect(PLATE).toMatchObject({ bg: "#111111", ink: "#fff9cb", tilt: -1.5, nameSpacing: 0.06 });
    expect(svg).toContain('rotate(-1.5 ');
    expect(svg).toContain('fill="#111111"');
    expect(svg).toMatch(/font-size="20" letter-spacing="1\.2"[^>]*fill="#fff9cb">@LEAMD</);
    expect(svg).toContain(">N° MGOLDB · 14.10.26<");
  });

  it("un pseudo long rétrécit sans sortir de la plaque ; sans nom, le numéro tient seul", () => {
    const long = renderToStaticMarkup(createElement(Plate, { name: "@UN-PSEUDO-VRAIMENT-TRES-LONG-39", sub: "N° ABCDEF · 14.10.26" }));
    expect(long).toContain("@UN-PSEUDO");
    const alone = renderToStaticMarkup(createElement(Plate, { name: null, sub: "N° ABCDEF · 14.10.26" }));
    // Seul sur la plaque, le numéro est plus grand que sous un nom (8,5).
    expect(Number(/font-size="([\d.]+)"/.exec(alone)![1])).toBeGreaterThan(8.5);
    expect(alone.match(/<text/g)).toHaveLength(1);
  });

  it("la fiche porte « @PSEUDO » et la même seconde ligne, en FR et en EN", () => {
    for (const lang of ["fr", "en"] as Lang[]) {
      const card = FIXTURES.gold;
      const svg = face(card, lang, "");
      expect(svg).toContain(`>@${card.login!.toUpperCase()}<`);
      expect(svg).toContain(`>${plateSub(card.id, card.createdAt, lang)}<`);
      // Le numéro, seul, en haut à droite : la place qu'occupaient les étoiles.
      expect(svg).toContain(`>${caseLabel(card.id, lang)}<`);
    }
  });
});
