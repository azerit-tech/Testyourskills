// Les images de partage posées sur le lieu du crime du profil (§18.28), et leur PNG opaque.

import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Resvg } from "@resvg/resvg-js";
import { describe, expect, it } from "vitest";
import { fileOf } from "../../../shared/caseFile";
import { FIXTURES } from "../../../shared/fixtures";
import { SKY_TEXT, skyTone } from "../../../shared/scenes";
import { pruneStaleImages } from "../app";
import { OgImage, PortraitImage, STORY_SAFE } from "./compositions";
import { renderImage, renderSvg } from "./index";
import { encodeOpaquePng } from "./png";
import { sceneFor } from "./scenes";

// Sans photo : le rendu ne touche pas au réseau.
const light = { ...FIXTURES.gold, avatarUrl: undefined }; // delivery_machine, heure rose
const blue = { ...FIXTURES.english, avatarUrl: undefined }; // mastermind, heure bleue

describe("lieux du crime des images de partage", () => {
  it("le décor du profil, `default` sans profil ou pour un identifiant inconnu", () => {
    expect(sceneFor("delivery_machine", "large")?.id).toBe("delivery_machine");
    expect(sceneFor(undefined, "small")?.id).toBe("default");
    expect(sceneFor("../../etc/passwd", "small")?.id).toBe("default");
    expect(sceneFor("pas_un_profil", "large")?.id).toBe("default");
    expect(sceneFor("night_owl", "small")?.href.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("l'heure du ciel : quatre ciels sombres, texte crème ; les autres, texte d'encre", () => {
    expect(["mastermind", "night_owl", "ghost", "default"].map(skyTone)).toEqual(["dark", "dark", "dark", "dark"]);
    expect(["kingpin", "forger", "fresh_blood"].map(skyTone)).toEqual(["light", "light", "light"]);
    expect(SKY_TEXT).toEqual({ dark: "#fff9cb", light: "#0c0d1b" });
  });

  it("aperçu de lien : l'encre, le décor en panneau centré sur son sujet, le surtitre sur l'encre", async () => {
    const svg = await renderSvg({ format: "og", card: light, lang: "fr" });
    expect(svg).toMatch(/^<svg[^>]*viewBox="0 0 1200 630"/);
    expect(svg).toContain('fill="#0c0d1b"');
    expect(svg).toMatch(/<image href="data:image\/jpeg;base64,[^"]+" x="560" y="66" width="576" height="290" preserveAspectRatio="xMidYMid slice"/);
    expect(svg).toMatch(/<rect x="560" y="66" width="576" height="290" rx="8"/);
    expect(svg).toContain("AVIS DE RECHERCHE");
    expect(svg).toContain("LÉA MARTIN-DUBOIS");
  });

  it("un nom trop long passe sur deux lignes, sans couper ce qui tenait", async () => {
    const svg = await renderSvg({ format: "og", card: { ...FIXTURES.longName, avatarUrl: undefined }, lang: "fr" });
    expect(svg).toContain(">MARIE-CHARLOTTE<");
    expect(svg).toContain(">VANDENBERGHE-LEFEBVRE");
    const short = await renderSvg({ format: "og", card: light, lang: "fr" });
    expect(short).not.toContain("…</text>");
  });

  it("portrait : le décor de bord à bord, calé sur son ciel, le surtitre dans la couleur de son heure", async () => {
    const pink = await renderSvg({ format: "portrait", card: light, lang: "fr" });
    expect(pink).toMatch(/<image href="data:image\/jpeg;base64,[^"]+" x="0" y="0" width="1080" height="620" preserveAspectRatio="xMidYMin slice"/);
    expect(pink).toMatch(/fill="#0c0d1b" fill-opacity="1">AVIS DE RECHERCHE</);
    const night = await renderSvg({ format: "portrait", card: blue, lang: "en" });
    expect(night).toMatch(/fill="#fff9cb" fill-opacity="1">WANTED</);
  });

  it("sans fichier de décor, le front de mer dessiné, jamais une image cassée", () => {
    for (const C of [OgImage, PortraitImage]) {
      const svg = renderToStaticMarkup(createElement(C, { card: light, lang: "fr", avatars: {}, scene: null }));
      expect(svg).not.toContain("<image href=\"data:image/jpeg");
      expect(svg).toContain("#2d2a66"); // le ciel dessiné
    }
  });

  it("un dossier à deux pièces prend les compositions d'une fiche, celle du dossier : une note, son décor (§18.36)", async () => {
    const { FIXTURE_COMPARISON } = await import("../../../shared/fixtures");
    const base = { ...FIXTURE_COMPARISON, cv: { ...FIXTURE_COMPARISON.cv, avatarUrl: undefined }, github: { ...FIXTURE_COMPARISON.github, avatarUrl: undefined } };
    const graded = { ...base, grid: { criteria: [{ code: "CODE" as const, score: 6, state: "scored" as const, counted: true, source: "github" as const, reached: { fr: "", en: "" }, flags: [] }], overall: 57 } };
    for (const format of ["og", "portrait", "story", "card"] as const) {
      const svg = await renderSvg({ format, comparison: graded, lang: "fr" });
      expect(svg).toBe(await renderSvg({ format, card: fileOf(graded), lang: "fr" }));
      expect(svg).toContain(">57<");
      // Ni la note d'une pièce, ni la composition à deux fiches.
      expect(svg).not.toContain(`>${base.cv.overall}<`);
      expect(svg).not.toContain("LE DOSSIER");
      expect(svg).not.toMatch(/>[+−]\d+</);
    }
    // Le lieu du crime du profil, comme une fiche seule.
    expect(await renderSvg({ format: "og", comparison: base, lang: "fr" })).toContain("data:image/jpeg");
  });

  it("sort des PNG opaques aux bonnes tailles", async () => {
    for (const [format, w, h] of [["og", 1200, 630], ["portrait", 1080, 1350]] as const) {
      const png = await renderImage({ format, card: light, lang: "fr" });
      expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([w, h]);
      expect(png[25]).toBe(2); // RVB, sans alpha
    }
  }, 30_000);
});

describe("story 1080 × 1920", () => {
  const yOf = (svg: string, text: string) => Number(new RegExp(`<text[^>]* y="([\\d.]+)"[^>]*>${text}`).exec(svg)?.[1]);

  it("le décor en haut, le surtitre sur sa plaque, la peine et l'adresse hors des zones des applis", async () => {
    const svg = await renderSvg({ format: "story", card: light, lang: "fr" });
    expect(svg).toMatch(/^<svg[^>]*viewBox="0 0 1080 1920"/);
    expect(svg).toMatch(/<image href="data:image\/jpeg;base64,[^"]+" x="0" y="0" width="1080" height="860" preserveAspectRatio="xMidYMin slice"/);
    const poster = yOf(svg, "AVIS DE RECHERCHE");
    expect(poster - 36).toBeGreaterThanOrEqual(STORY_SAFE.top);
    expect(svg).toContain(light.sentence!.label.fr.toLocaleUpperCase("fr-FR"));
    expect(svg).toContain(light.sentence!.bail!.fr);
    expect(yOf(svg, "Fais la tienne")).toBeLessThanOrEqual(1920 - STORY_SAFE.bottom);
  });

  it("sans peine, l'adresse remonte ; un dossier à deux pièces donne la story de sa fiche", async () => {
    const { sentence: _s, ...free } = light;
    const bare = await renderSvg({ format: "story", card: free, lang: "fr" });
    expect(bare).not.toContain("PEINE");
    const { FIXTURE_COMPARISON } = await import("../../../shared/fixtures");
    const cmp = { ...FIXTURE_COMPARISON, cv: { ...FIXTURE_COMPARISON.cv, avatarUrl: undefined }, github: { ...FIXTURE_COMPARISON.github, avatarUrl: undefined } };
    const svg = await renderSvg({ format: "story", comparison: cmp, lang: "fr" });
    expect(svg).toMatch(/viewBox="0 0 1080 1920"/);
    expect(svg).toContain(cmp.github.profile!.label.fr.toLocaleUpperCase("fr-FR"));
  });

  it("sort un PNG opaque de 1080 × 1920", async () => {
    const png = await renderImage({ format: "story", card: blue, lang: "en" });
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1920]);
  }, 30_000);
});

describe("PNG opaque", () => {
  it("se relit à l'identique", async () => {
    const w = 37;
    const h = 11;
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = (i * 7) & 255;
      rgba[i + 1] = (i * 13 + 5) & 255;
      rgba[i + 2] = (i >> 3) & 255;
      rgba[i + 3] = 255;
    }
    const png = await encodeOpaquePng(rgba, w, h);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><image href="data:image/png;base64,${png.toString("base64")}" width="${w}" height="${h}"/></svg>`;
    const back = new Resvg(svg).render().pixels;
    expect(Buffer.from(back).equals(Buffer.from(rgba))).toBe(true);
  });
});

describe("cache disque d'un ancien dessin", () => {
  it("efface les PNG de la racine et les dossiers d'autres versions, garde le dossier en cours", async () => {
    const root = mkdtempSync(join(tmpdir(), "tys-prune-"));
    mkdirSync(join(root, "v1"));
    mkdirSync(join(root, "v2"));
    writeFileSync(join(root, "AbCdEf1234.png"), "old");
    writeFileSync(join(root, "AbCdEf1234-portrait.png.9.tmp"), "old");
    writeFileSync(join(root, "v1", "x.png"), "old");
    writeFileSync(join(root, "v2", "AbCdEf1234.png"), "new");
    expect(await pruneStaleImages(root, "v2")).toBe(3);
    expect(existsSync(join(root, "AbCdEf1234.png"))).toBe(false);
    expect(existsSync(join(root, "v1"))).toBe(false);
    expect(existsSync(join(root, "v2", "AbCdEf1234.png"))).toBe(true);
    expect(await pruneStaleImages(join(root, "absent"), "v2")).toBe(0);
  });
});
