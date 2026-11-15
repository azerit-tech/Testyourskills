// L'image de partage d'une bande : l'accroche au premier rang, chaque nombre
// avec son mot, jamais de « 0 » pour une bande vide, et l'appel de la bande.

import { describe, expect, it } from "vitest";
import type { BandStanding } from "../../../shared/bands";
import { bandHook, bandRankLine } from "./band";
import { IMAGE_WORDS } from "./compositions";
import { renderImage, renderSvg } from "./index";

const band = (o: Partial<BandStanding>): BandStanding => ({ type: "ecole", id: "ecole-demo", label: "École Démo", score: 88, members: 23, rank: 1, missing: 0, gap: null, ahead: null, hasPage: true, ...o });
const second = band({ type: "boite", label: "Boîte Démo", score: 47, members: 10, rank: 2, gap: 5, ahead: { id: "x", label: "X", rank: 1 } });
const forming = band({ score: 5, members: 1, rank: null, missing: 2 });
const empty = band({ score: 0, members: 0, rank: null, missing: 3 });

/** Le corps et l'ordonnée d'un texte de l'image. */
function textOf(svg: string, text: string) {
  const m = new RegExp(`<text x="[\\d.]+" y="([\\d.]+)"[^>]*font-size="([\\d.]+)"[^>]*>${text}</text>`).exec(svg);
  return m ? { y: Number(m[1]), size: Number(m[2]) } : null;
}

describe("l'accroche d'une bande", () => {
  it("le rang, puis ce qui sépare de la bande de devant ; les mots de bandRankLine", () => {
    expect(bandHook(band({}), "fr")).toEqual({ head: expect.stringMatching(/^N°\s1 des écoles$/), sub: null });
    expect(bandHook(second, "fr")).toEqual({ head: "2e des boîtes", sub: "À 5 étoiles de la tête" });
    expect(bandHook(band({ rank: 3, gap: 1, ahead: { id: "x", label: "X", rank: 2 } }), "fr")).toEqual({ head: "3e des écoles", sub: "À 1 étoile de la 2e" });
    expect(bandHook(band({ rank: 14, gap: 0, ahead: { id: "x", label: "X", rank: 13 } }), "fr").sub).toBe("À égalité avec la 13e");
    expect(bandHook(forming, "fr")).toEqual({ head: "Bande en formation", sub: "Il manque 2 complices" });
    expect(bandHook(second, "en")).toEqual({ head: "#2 among companies", sub: "5 stars behind #1" });
    expect(bandHook(forming, "en")).toEqual({ head: "Crew forming", sub: "2 more accomplices needed" });
    // Les deux temps disent la même chose que la ligne des balises.
    for (const b of [second, band({ rank: 3, gap: 1, ahead: { id: "x", label: "X", rank: 2 } })]) {
      const h = bandHook(b, "fr");
      expect(`${h.head}, ${h.sub}`.toLowerCase()).toBe(bandRankLine(b, "fr").toLowerCase());
    }
  });
});

describe("l'image d'une bande", () => {
  it("au tableau : le nom, puis l'accroche en pêche au premier rang, et chaque nombre avec son mot", async () => {
    const svg = await renderSvg({ format: "band", band: second, lang: "fr" });
    expect(svg).toMatch(/^<svg[^>]*viewBox="0 0 1200 630"/);
    const name = textOf(svg, "BOÎTE DÉMO")!;
    const hook = textOf(svg, "2E DES BOÎTES")!;
    const sub = textOf(svg, "À 5 étoiles de la tête")!;
    // L'accroche : juste sous le nom, 80 px au moins (24 px dans une vignette de 360 px de large).
    expect(hook.y).toBeGreaterThan(name.y);
    expect(hook.size).toBeGreaterThanOrEqual(80);
    expect(svg).toMatch(/fill="#ffd3a5">2E DES BOÎTES</);
    expect(sub.y).toBeGreaterThan(hook.y);
    expect(sub.size).toBeGreaterThanOrEqual(36);
    // Plus de nombre nu : « 47 étoiles », « 10 fiches ».
    expect(svg).toMatch(/>47<\/text><text[^>]*>ÉTOILES</);
    expect(svg).toMatch(/>10<\/text><text[^>]*>FICHES</);
    expect(svg).not.toMatch(/dossier/i);
    // Plus de tuiles d'étoiles qui meublent : aucune étoile dessinée.
    expect(svg).not.toContain('<path d="M12 2.6');
  });

  it("l'appel est celui d'une bande, avec ce que la personne y gagne", async () => {
    const fr = await renderSvg({ format: "band", band: second, lang: "fr" });
    expect(fr).toContain(`>${IMAGE_WORDS.fr.band} :</text>`);
    expect(fr).toContain(">skills.azerit.tech</text>");
    expect(fr).toContain(">Tes étoiles comptent pour Boîte Démo.</text>");
    expect(fr).not.toContain("Fais la tienne");
    const en = await renderSvg({ format: "band", band: second, lang: "en" });
    expect(en).toContain(`>${IMAGE_WORDS.en.band}:</text>`);
    expect(en).toContain(">#2 AMONG COMPANIES</text>");
    expect(en).toMatch(/>47<\/text><text[^>]*>STARS</);
    expect(en).toMatch(/>10<\/text><text[^>]*>SHEETS</);
  });

  it("en formation : trois places, pleines ou libres, et ce qui manque", async () => {
    const svg = await renderSvg({ format: "band", band: forming, lang: "fr" });
    expect(svg).toContain(">BANDE EN FORMATION</text>");
    expect(svg).toContain(">Il manque 2 complices</text>");
    // Une fiche présente porte son étoile crème, deux places libres en pointillé.
    expect(svg.match(/<path d="M12 2\.6[^"]*" fill="#fff9cb"/g)).toHaveLength(1);
    expect(svg.match(/stroke-dasharray="8 8"/g)).toHaveLength(2);
    expect(svg).toContain(">3 fiches pour entrer au tableau</text>");
  });

  it("une bande sans fiche prend la composition « en formation » : trois places libres, jamais un « 0 »", async () => {
    for (const lang of ["fr", "en"] as const) {
      const svg = await renderSvg({ format: "band", band: empty, lang });
      expect(svg.match(/stroke-dasharray="8 8"/g)).toHaveLength(3);
      expect(svg).not.toContain('<path d="M12 2.6');
      expect(svg).not.toMatch(/>0[ <]/);
    }
    expect(await renderSvg({ format: "band", band: empty, lang: "fr" })).toContain(">Il manque 3 complices</text>");
  });

  it("un nom long passe sur deux lignes, entier", async () => {
    const svg = await renderSvg({ format: "band", band: band({ label: "Université de technologie de Démoville", rank: 14, gap: 0, ahead: { id: "x", label: "X", rank: 13 } }), lang: "fr" });
    expect(svg).toContain(">UNIVERSITÉ DE</text>");
    expect(svg).toContain(">TECHNOLOGIE DE DÉMOVILLE</text>");
    expect(svg).not.toContain("…</text>");
  });

  it("sort un PNG opaque de 1200 × 630", async () => {
    const png = await renderImage({ format: "band", band: forming, lang: "fr" });
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
    expect(png[25]).toBe(2);
  }, 30_000);
});
