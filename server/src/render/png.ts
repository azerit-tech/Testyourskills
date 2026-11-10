// PNG opaque, plus léger que celui de resvg : les images de partage n'ont pas de
// transparence (fond d'encre), on écrit donc du RVB sans canal alpha, filtre Paeth
// sur chaque ligne, deflate de Node (niveau 6, dans le pool de threads). Sur les
// fonds peints des lieux du crime, environ 30 % de moins qu'`asPng()`, ce qui
// garde l'aperçu de lien et la story sous les plafonds des réseaux.
// Aucune dépendance : node:zlib a deflate et crc32.
import { promisify } from "node:util";
import { crc32, deflate } from "node:zlib";

const deflateAsync = promisify(deflate);
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(data, crc32(head.subarray(4))) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/** Lignes filtrées (Paeth) d'une image RVBA opaque, sans son alpha. */
export function paethRows(rgba: Uint8Array, width: number, height: number): Buffer {
  const stride = width * 3;
  const out = Buffer.alloc((stride + 1) * height);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    for (let x = 0, i = y * width * 4; x < stride; x += 3, i += 4) {
      cur[x] = rgba[i]!;
      cur[x + 1] = rgba[i + 1]!;
      cur[x + 2] = rgba[i + 2]!;
    }
    const row = y * (stride + 1);
    out[row] = 4;
    for (let x = 0; x < stride; x++) {
      const a = x >= 3 ? cur[x - 3]! : 0;
      const b = prev[x]!;
      const c = x >= 3 ? prev[x - 3]! : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      out[row + 1 + x] = (cur[x]! - pred) & 0xff;
    }
    prev.set(cur);
  }
  return out;
}

/** Encode des pixels RVBA (alpha ignoré : l'image doit être opaque) en PNG RVB 8 bits. */
export async function encodeOpaquePng(rgba: Uint8Array, width: number, height: number): Promise<Buffer> {
  if (rgba.length !== width * height * 4) throw new Error("encodeOpaquePng : taille de pixels inattendue");
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bits par canal
  ihdr[9] = 2; // RVB
  const idat = await deflateAsync(paethRows(rgba, width, height), { level: 6, memLevel: 9 });
  return Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}
