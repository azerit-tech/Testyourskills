// Garde-fou (SPEC §18.36, un dossier, une fiche, une note) : aucun texte montré
// ne met deux pièces d'un même dossier en écart. Il parcourt les textes du front
// (web/src/i18n.ts), ceux de la fiche (shared/**/i18n.ts) et les catalogues
// (data/*.json). Exemptés, et seulement eux : les entrées `retired` des
// catalogues (gardées pour les fiches rangées, plus produites) et le `versus`
// entre deux personnes (deux dossiers qui se mesurent, pas deux sources).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STRINGS } from "./card/i18n";
import { DICTS } from "../web/src/i18n";

/** Les tournures d'écart entre deux sources, en français et en anglais. */
const GAP =
  /sous-vend|en montre (plus|moins)|en dessous de la vérité|contre (GitHub|LinkedIn|(le |ton |son )?CV)|points? d'écart|écart entre|undersell|shows (more|less)|against (GitHub|LinkedIn|(the |your |their )?CV)|points? between|gap between/i;

/** Les clés exemptées : deux personnes qui se mesurent (lib/versus.ts, la dénonciation). */
const EXEMPT_KEYS = new Set(["versus"]);

/** Tous les textes d'un objet, avec leur chemin ; une fonction est appelée avec des valeurs d'exemple. */
function texts(x: unknown, path: string, out: [string, string][] = []): [string, string][] {
  if (typeof x === "string") out.push([path, x]);
  else if (typeof x === "function") {
    const sample = ["LinkedIn", 3, "GitHub", 4, "x"].slice(0, Math.max(x.length, 1));
    let r: unknown;
    try {
      r = (x as (...a: unknown[]) => unknown)(...sample);
    } catch {
      // Des arguments d'un autre type (une liste…) : le gabarit se lit dans la source de la fonction.
      r = String(x);
    }
    if (typeof r === "string") out.push([path, r]);
  } else if (Array.isArray(x)) x.forEach((v, i) => texts(v, `${path}[${i}]`, out));
  else if (x && typeof x === "object") {
    // Une entrée de catalogue retirée : gardée pour les fiches rangées, plus produite.
    if ((x as { retired?: unknown }).retired === true) return out;
    for (const [k, v] of Object.entries(x)) if (!EXEMPT_KEYS.has(k)) texts(v, path ? `${path}.${k}` : k, out);
  }
  return out;
}

const hits = (all: [string, string][]) => all.filter(([, s]) => GAP.test(s)).map(([p, s]) => `${p} : ${s}`);

describe("aucune tournure d'écart entre les pièces d'un dossier (§18.36)", () => {
  it("le motif reconnaît les tournures d'avant", () => {
    for (const s of ["Ton LinkedIn te sous-vend de 20 points.", "le code en montre plus", "Your CV undersells you", "code shows more", "Ton code contre GitHub", "17 points d'écart entre le profil et le code"])
      expect(s).toMatch(GAP);
  });

  it("les textes du front", () => {
    for (const [lang, dict] of Object.entries(DICTS)) {
      const all = texts(dict, lang);
      expect(all.length, lang).toBeGreaterThan(500);
      expect(hits(all)).toEqual([]);
    }
  });

  it("les textes de la fiche", () => {
    expect(hits(texts(STRINGS, "card"))).toEqual([]);
  });

  it("les catalogues de data/", () => {
    const dir = join(__dirname, "..", "data");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")))
      expect(hits(texts(JSON.parse(readFileSync(join(dir, file), "utf8")), file))).toEqual([]);
  });

  it("les exemptions sont bien prises : une entrée retirée, le versus entre deux personnes", () => {
    expect(texts({ a: { retired: true, label: "Ton CV te sous-vend" } }, "x")).toEqual([]);
    expect(texts({ versus: "Toi 80 contre GitHub 70" }, "x")).toEqual([]);
    expect(hits(texts({ label: "Ton CV te sous-vend" }, "x"))).toHaveLength(1);
  });
});
