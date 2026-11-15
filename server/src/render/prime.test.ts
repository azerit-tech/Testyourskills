// L'image de partage d'une prime : le lot au premier rang, l'échéance en grand
// dans sa tuile, plus de trou au milieu, et l'appel de la course.

import { describe, expect, it } from "vitest";
import type { PrimeView } from "../../../shared/primes";
import { IMAGE_WORDS } from "./compositions";
import { renderImage, renderSvg } from "./index";
import { primeWhen } from "./prime";

const prime = (o: Partial<PrimeView>): PrimeView => ({
  id: "demo-stage",
  company: "Entreprise Démo",
  contract: "stage",
  positions: ["BE", "FS"],
  languages: [],
  interviews: 3,
  place: "Ville Démo",
  remote: false,
  pitch: { fr: "", en: "" },
  from: "2026-11-01",
  to: "2026-11-26",
  phase: "open",
  daysLeft: 12,
  entrants: 4,
  ...o,
});

/** Tous les textes de l'image, dans l'ordre du dessin : leur ordonnée, leur corps, leur contenu. */
const texts = (svg: string) => [...svg.matchAll(/<text x="[\d.]+" y="([\d.]+)"[^>]*font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)].map((m) => ({ y: Number(m[1]), size: Number(m[2]), text: m[3]! }));

describe("l'image d'une prime", () => {
  it("le lot au premier rang, puis l'entreprise, les postes et le lieu, sans trou", async () => {
    const svg = await renderSvg({ format: "prime", prime: prime({}), logo: null, lang: "fr" });
    expect(svg).toMatch(/^<svg[^>]*viewBox="0 0 1200 630"/);
    const all = texts(svg);
    const at = (text: string) => all.find((t) => t.text === text)!;
    const lot = [at("3 ENTRETIENS"), at("À LA CLÉ")];
    // Le lot : les plus grandes lettres de l'image, 100 px au moins (30 px dans une vignette de 360 px de large).
    expect(lot[0]!.size).toBeGreaterThanOrEqual(100);
    expect(lot[1]!.size).toBe(lot[0]!.size);
    expect(Math.max(...all.filter((t) => t.text !== "J-12").map((t) => t.size))).toBe(lot[0]!.size);
    // La colonne de gauche, de haut en bas, sans écart de plus de 90 px entre deux lignes.
    const column = [at("PRIME, STAGE"), ...lot, at("ENTREPRISE DÉMO"), at("Backend, Full-stack"), at("À Ville Démo")];
    for (let i = 1; i < column.length; i++) {
      expect(column[i]!.y).toBeGreaterThan(column[i - 1]!.y);
      expect(column[i]!.y - column[i]!.size * 0.72 - column[i - 1]!.y).toBeLessThan(90);
    }
    // Sous le lieu, l'appel : la pilule finit au bas de l'image utile, et le lieu ne la touche pas.
    const pill = /<g data-cta=""><rect x="64" y="(\d+)" width="[\d.]+" height="(\d+)"/.exec(svg)!;
    expect(Number(pill[1]) + Number(pill[2])).toBe(598);
    expect(Number(pill[1]) - at("À Ville Démo").y).toBeGreaterThanOrEqual(24);
    expect(Number(pill[1]) - at("À Ville Démo").y).toBeLessThan(110);
  });

  it("l'échéance en grand dans sa tuile pêche, avec ce qu'elle compte", async () => {
    const fr = await renderSvg({ format: "prime", prime: prime({}), logo: null, lang: "fr" });
    expect(fr).toMatch(/<rect x="760" y="382" width="408" height="216" rx="14" fill="#ffd3a5">/);
    expect(fr).toMatch(/fill="#0c0d1b">J-12<\/text>/);
    expect(fr).toContain(">pour entrer dans la course</text>");
    const last = await renderSvg({ format: "prime", prime: prime({ daysLeft: 0 }), logo: null, lang: "fr" });
    expect(last).toContain(">DERNIER JOUR</text>");
    const en = await renderSvg({ format: "prime", prime: prime({}), logo: null, lang: "en" });
    expect(en).toContain(">12 DAYS</text>");
    expect(en).toContain(">left to enter the race</text>");
    expect(en).toContain(">3 INTERVIEWS</text>");
    expect(en).toContain(">UP FOR GRABS</text>");
    const soon = await renderSvg({ format: "prime", prime: prime({ phase: "soon", from: "2026-12-01", daysLeft: null }), logo: null, lang: "fr" });
    expect(soon).toContain(">1ER DÉCEMBRE</text>");
    expect(soon).toContain(">Ouverture de la course</text>");
  });

  it("l'appel est celui de la course ; une prime close parle au passé et mène au classement", async () => {
    const open = await renderSvg({ format: "prime", prime: prime({}), logo: null, lang: "fr" });
    expect(open).toContain(`>${IMAGE_WORDS.fr.prime} :</text>`);
    expect(open).toContain(">skills.azerit.tech</text>");
    expect(open).not.toContain("Fais la tienne");
    expect(await renderSvg({ format: "prime", prime: prime({}), logo: null, lang: "en" })).toContain(`>${IMAGE_WORDS.en.prime}:</text>`);
    const closed = await renderSvg({ format: "prime", prime: prime({ phase: "closed", daysLeft: null, interviews: 1 }), logo: null, lang: "fr" });
    expect(closed).toContain(`>${IMAGE_WORDS.fr.primeClosed} :</text>`);
    expect(closed).toContain(">1 ENTRETIEN</text>");
    expect(closed).toContain(">ÉTAIT EN JEU</text>");
    expect(closed).toContain(">CLOSE</text>");
    // Close : la tuile n'est plus pleine, elle est en contour.
    expect(closed).not.toMatch(/rx="14" fill="#ffd3a5"/);
  });

  it("un logo prend la place du nom ; une longue liste de postes tient au-dessus de l'appel", async () => {
    const logo = { href: `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 80"><rect width="300" height="80" fill="#ffd3a5"/></svg>`).toString("base64")}`, width: 300, height: 80 };
    const svg = await renderSvg({ format: "prime", prime: prime({ positions: ["BE", "FS", "OPS", "SEC", "DATA", "ML"], remote: true }), logo, lang: "fr" });
    expect(svg).toContain('<image href="data:image/svg+xml;base64,');
    expect(svg).not.toContain(">ENTREPRISE DÉMO</text>");
    const pillTop = Number(/<g data-cta=""><rect x="64" y="(\d+)"/.exec(svg)![1]);
    const left = texts(svg).filter((t) => t.y < pillTop + 10 && !["J-12", "pour entrer dans la course"].includes(t.text));
    expect(Math.max(...left.map((t) => t.y))).toBeLessThanOrEqual(pillTop - 16);
  });

  it("la date d'ouverture en anglais américain", () => {
    expect(primeWhen({ phase: "soon", from: "2026-12-02", daysLeft: null }, "en")).toBe("Opens December 2");
    expect(primeWhen({ phase: "soon", from: "2026-12-01", daysLeft: null }, "fr")).toBe("Ouvre le 1er décembre");
    expect(primeWhen({ phase: "open", from: "2026-11-01", daysLeft: 1 }, "en")).toBe("1 day left");
  });

  it("sort un PNG opaque de 1200 × 630", async () => {
    const png = await renderImage({ format: "prime", prime: prime({ phase: "closed", daysLeft: null }), logo: null, lang: "en" });
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
    expect(png[25]).toBe(2);
  }, 30_000);
});
