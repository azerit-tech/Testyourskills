// Régénère shared/card/glyph-widths.ts depuis les TTF de server/fonts :
// avances des glyphes (millièmes d'em) pour chaque police proportionnelle de la
// fiche. Lecteur TTF minimal (cmap format 4, hmtx), sans dépendance.
// Usage : npx tsx scripts/glyph-widths.ts
// Imprime aussi les noms de famille (name 1 et 16) : resvg ne retrouve une
// police que par le nom exact que shared/card/fonts.ts lui donne.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const FONTS: Record<string, string> = {
  "display-600": "barlow-condensed-600.ttf",
  "display-700": "barlow-condensed-700.ttf",
  "display-800": "barlow-condensed-800.ttf",
  "sans-400": "outfit-400.ttf",
  "sans-500": "outfit-500.ttf",
  "sans-600": "outfit-600.ttf",
  "sans-700": "outfit-700.ttf",
};

/** Les glyphes mesurés : ASCII, Latin-1, Latin étendu A, et quelques signes. */
function glyphSet(): string {
  let s = "";
  for (let c = 0x20; c <= 0x7e; c++) s += String.fromCharCode(c);
  for (let c = 0xa0; c <= 0x17f; c++) s += String.fromCharCode(c);
  return s + "–—‘’“”…•€™→←≠≥≤−  ‑";
}

interface Ttf {
  advance(ch: string): number | undefined;
  names: Record<number, string>;
}

function readTtf(path: string): Ttf {
  const b = readFileSync(path);
  const u16 = (o: number) => b.readUInt16BE(o);
  const i16 = (o: number) => b.readInt16BE(o);
  const u32 = (o: number) => b.readUInt32BE(o);
  const tables: Record<string, number> = {};
  const n = u16(4);
  for (let i = 0; i < n; i++) {
    const r = 12 + i * 16;
    tables[b.toString("latin1", r, r + 4)] = u32(r + 8);
  }
  const upem = u16(tables.head + 18);
  const numH = u16(tables.hhea + 34);
  const hmtx = tables.hmtx;
  const adv = (gid: number) => u16(hmtx + 4 * Math.min(gid, numH - 1));

  // cmap : sous-table Unicode BMP au format 4
  const cmap = tables.cmap;
  let sub = -1;
  for (let i = 0; i < u16(cmap + 2); i++) {
    const r = cmap + 4 + i * 8;
    const pid = u16(r), eid = u16(r + 2), off = u32(r + 4);
    if (u16(cmap + off) === 4 && (pid === 0 || (pid === 3 && eid === 1))) sub = cmap + off;
  }
  if (sub < 0) throw new Error(`${path} : pas de cmap format 4`);
  const segX2 = u16(sub + 6);
  const ends = sub + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
  const gidOf = (cp: number): number => {
    for (let i = 0; i < segX2 / 2; i++) {
      if (u16(ends + 2 * i) < cp) continue;
      const start = u16(starts + 2 * i);
      if (start > cp) return 0;
      const ro = u16(ranges + 2 * i);
      if (ro === 0) return (cp + i16(deltas + 2 * i)) & 0xffff;
      const g = u16(ranges + 2 * i + ro + 2 * (cp - start));
      return g === 0 ? 0 : (g + i16(deltas + 2 * i)) & 0xffff;
    }
    return 0;
  };

  // name : familles (1) et familles typographiques (16), en UTF-16 Windows
  const names: Record<number, string> = {};
  const nt = tables.name;
  const strOff = nt + u16(nt + 4);
  for (let i = 0; i < u16(nt + 2); i++) {
    const r = nt + 6 + i * 12;
    const pid = u16(r), nid = u16(r + 6), len = u16(r + 8), off = u16(r + 10);
    if (pid !== 3 || (nid !== 1 && nid !== 2 && nid !== 16 && nid !== 17)) continue;
    let s = "";
    for (let k = 0; k < len; k += 2) s += String.fromCharCode(u16(strOff + off + k));
    names[nid] = s;
  }

  return {
    names,
    advance(ch) {
      const g = gidOf(ch.codePointAt(0)!);
      return g === 0 ? undefined : Math.round((adv(g) * 1000) / upem);
    },
  };
}

const GLYPHS = glyphSet();
const advances: Record<string, number[]> = {};
const fallback: Record<string, number> = {};
for (const [key, file] of Object.entries(FONTS)) {
  const f = readTtf(resolve(ROOT, "server/fonts", file));
  fallback[key] = f.advance("n")!;
  advances[key] = [...GLYPHS].map((ch) => f.advance(ch) ?? fallback[key]);
  console.log(`${key.padEnd(12)} ${file.padEnd(26)} famille « ${f.names[1]} » / « ${f.names[2]} »${f.names[16] ? `, typographique « ${f.names[16]} »` : ""}`);
}

const out = `// Fichier généré par scripts/glyph-widths.ts depuis les TTF de server/fonts
// (avances, en millièmes d'em). Ne pas éditer à la main : relancer le script.
// Le crénage est ignoré : les mesures sont approximatives.

export const GLYPHS = ${JSON.stringify(GLYPHS)};

export const ADVANCES: Record<string, number[]> = {
${Object.entries(advances).map(([k, v]) => `  "${k}": [${v.join(",")}],`).join("\n")}
};

/** Largeur de repli (lettre « n ») par police, pour les glyphes absents de la table. */
export const FALLBACK: Record<string, number> = {
${Object.entries(fallback).map(([k, v]) => `  "${k}": ${v},`).join("\n")}
};
`;
writeFileSync(resolve(ROOT, "shared/card/glyph-widths.ts"), out);
console.log("→ shared/card/glyph-widths.ts");
