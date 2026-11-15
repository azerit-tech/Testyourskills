// La page des crédits (/credits) : le même contenu que web/public/credits.txt, servi
// à côté. Tout modèle du fichier y a sa ligne, avec son auteur en lien ; rien de plus.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DICTS } from "../i18n";

const TXT = readFileSync(join(__dirname, "../../public/credits.txt"), "utf8");
const modelUrls = (txt: string) => new Set(txt.match(/https:\/\/sketchfab\.com\/3d-models\/[\w-]+/g) ?? []);

describe("la page des crédits", () => {
  for (const lang of ["fr", "en"] as const) {
    it(`${lang} : chaque modèle de credits.txt a sa ligne, et chaque ligne un modèle du fichier`, () => {
      const c = DICTS[lang].pages.credits;
      const links = c.groups.flatMap((g) => g.lines.flatMap((l) => l.by.map((b) => b.href)));
      expect(new Set(links)).toEqual(modelUrls(TXT));
      expect(links.length).toBe(new Set(links).size);
      for (const g of c.groups) for (const l of g.lines) expect(l.what.length, l.what).toBeGreaterThan(1);
    });
  }

  it("les deux langues ont les mêmes groupes et les mêmes auteurs", () => {
    const names = (lang: "fr" | "en") => DICTS[lang].pages.credits.groups.map((g) => g.lines.map((l) => l.by.map((b) => b.name)));
    expect(names("en")).toEqual(names("fr"));
    expect(DICTS.en.pages.credits.groups.length).toBe(6);
  });
});
