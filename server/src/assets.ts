// Le front découpé (web/src/App.tsx charge chaque page à la demande) : le serveur
// annonce dans le HTML les morceaux de la page demandée, pour qu'ils partent en
// même temps que le paquet de départ au lieu de l'attendre. La liste vient du
// manifeste de Vite (dist/web/.vite/manifest.json).

import { readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants as zc, gzip } from "node:zlib";
import { getMimeType } from "hono/utils/mime";

interface ManifestChunk {
  file: string;
  imports?: string[];
  css?: string[];
  isEntry?: boolean;
}
export type Manifest = Record<string, ManifestChunk>;

/** Le manifeste du front construit ; null sans lui (dev, tests) : rien n'est ajouté. */
export function readManifest(staticRoot: string): Manifest | null {
  try {
    return JSON.parse(readFileSync(join(staticRoot, ".vite", "manifest.json"), "utf8")) as Manifest;
  } catch {
    return null;
  }
}

/** Le module de page (clé du manifeste) qu'affiche une adresse : le même choix que le routeur du front. */
export function pageModule(path: string, status: number): string | null {
  const p = path.toLowerCase();
  if (p === "/" || p === "") return "src/pages/Home.tsx";
  if (/^\/c\//.test(p)) return "src/pages/CardPage.tsx";
  if (/^\/bandes(\/|$)/.test(p)) return "src/pages/Bands.tsx";
  if (/^\/primes(\/|$)/.test(p)) return "src/pages/Primes.tsx";
  if (/^\/reglement\/?$/.test(p)) return "src/pages/Rules.tsx";
  if (/^\/(confidentialite|privacy)\/?$/.test(p)) return "src/pages/Privacy.tsx";
  // La page introuvable (components/ErrorPage.tsx) est dans le paquet de départ : rien à précharger.
  if (status === 404) return null;
  // /{pseudo} : le formulaire de l'accueil, prérempli.
  return "src/pages/Home.tsx";
}

/** Les balises de préchargement d'un module et de ce qu'il importe, hors paquet de départ (déjà dans le HTML). */
export function preloadTags(manifest: Manifest, key: string): string {
  const files: string[] = [];
  const css: string[] = [];
  const seen = new Set<string>();
  const walk = (k: string) => {
    const chunk = manifest[k];
    if (!chunk || chunk.isEntry || seen.has(k)) return;
    seen.add(k);
    files.push(chunk.file);
    for (const c of chunk.css ?? []) css.push(c);
    for (const i of chunk.imports ?? []) walk(i);
  };
  walk(key);
  return [
    ...css.map((f) => `<link rel="stylesheet" crossorigin href="/${f}">`),
    ...files.map((f) => `<link rel="modulepreload" crossorigin href="/${f}">`),
  ].join("\n    ");
}

/** Ajoute les préchargements de la page avant </head>. */
export function withPreloads(html: string, manifest: Manifest, path: string, status: number): string {
  const key = pageModule(path, status);
  const tags = key ? preloadTags(manifest, key) : "";
  if (!tags || !/<\/head>/i.test(html)) return html;
  return html.replace(/<\/head>/i, `    ${tags}\n  </head>`);
}

// --- La compression ----------------------------------------------------------
// Les fichiers texte du front (JS, CSS, SVG, polices, manifeste) partent en
// brotli ou en gzip. Ceux de /assets portent leur empreinte et ne changent
// jamais : leurs versions compressées sont faites une fois et gardées en
// mémoire. Le HTML, petit et propre à chaque page, est compressé à la volée.

export type Encoding = "br" | "gzip";

const brotli = promisify(brotliCompress);
const gz = promisify(gzip);

/** L'encodage préféré que le navigateur accepte : brotli d'abord, puis gzip. */
export function pickEncoding(acceptEncoding: string | null | undefined): Encoding | null {
  const accepted = new Map<string, number>();
  for (const part of (acceptEncoding ?? "").toLowerCase().split(",")) {
    const [name, ...params] = part.trim().split(";");
    if (!name) continue;
    const q = params.map((p) => /^\s*q=([\d.]+)/.exec(p)?.[1]).find(Boolean);
    accepted.set(name.trim(), q === undefined ? 1 : Number(q));
  }
  const ok = (name: string) => (accepted.get(name) ?? accepted.get("*") ?? 0) > 0;
  if (ok("br")) return "br";
  if (ok("gzip")) return "gzip";
  return null;
}

/** Un fichier qui gagne à être compressé (images, vidéos et WOFF2 le sont déjà). */
export function isCompressible(path: string): boolean {
  return /\.(js|mjs|css|svg|json|webmanifest|txt|xml|ttf|otf|ico|map)$/i.test(path);
}

/** Compresse un contenu ; `heavy` : le meilleur taux (fichiers immuables, faits une fois). */
export async function compress(data: Uint8Array, encoding: Encoding, heavy = false): Promise<Buffer> {
  if (encoding === "br") {
    return brotli(data, { params: { [zc.BROTLI_PARAM_QUALITY]: heavy ? 11 : 5, [zc.BROTLI_PARAM_SIZE_HINT]: data.byteLength } });
  }
  return gz(data, { level: heavy ? 9 : 6 });
}

interface Packed {
  type: string;
  size: number;
  mtimeMs: number;
  raw: Buffer;
  encoded: Partial<Record<Encoding, Promise<Buffer>>>;
}

/**
 * Les fichiers statiques compressibles du front, servis compressés depuis la
 * mémoire. `serve` rend null pour ce qu'il ne prend pas (le statique de Hono
 * s'en charge alors) : autre méthode, fichier absent ou trop petit, type non
 * compressible, navigateur sans brotli ni gzip.
 */
export class StaticCompressor {
  private readonly cache = new Map<string, Packed>();
  constructor(private readonly root: string) {}

  /** Le fichier sous la racine, ou null s'il en sort. */
  private fileOf(urlPath: string): string | null {
    let p: string;
    try {
      p = decodeURIComponent(urlPath);
    } catch {
      return null;
    }
    if (p.includes("\0")) return null;
    const root = normalize(this.root);
    const file = normalize(join(root, p));
    return file.startsWith(root.endsWith(sep) ? root : root + sep) ? file : null;
  }

  private async packed(file: string): Promise<Packed | null> {
    const st = await stat(file).catch(() => null);
    if (!st?.isFile()) return null;
    const hit = this.cache.get(file);
    if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs) return hit;
    const raw = await readFile(file).catch(() => null);
    if (!raw) return null;
    const entry: Packed = { type: getMimeType(file) ?? "application/octet-stream", size: st.size, mtimeMs: st.mtimeMs, raw, encoded: {} };
    this.cache.set(file, entry);
    return entry;
  }

  /** Prépare d'avance les versions compressées (au démarrage, sans bloquer les requêtes). */
  async warm(urlPaths: string[]): Promise<void> {
    for (const u of urlPaths) {
      const file = isCompressible(u) ? this.fileOf(u) : null;
      const entry = file ? await this.packed(file) : null;
      if (!entry || entry.raw.byteLength < 1024) continue;
      for (const enc of ["br", "gzip"] as const) await (entry.encoded[enc] ??= compress(entry.raw, enc, true));
    }
  }

  async serve(method: string, urlPath: string, acceptEncoding: string | null | undefined): Promise<Response | null> {
    if ((method !== "GET" && method !== "HEAD") || !isCompressible(urlPath)) return null;
    const encoding = pickEncoding(acceptEncoding);
    if (!encoding) return null;
    const file = this.fileOf(urlPath);
    const entry = file ? await this.packed(file) : null;
    if (!entry || entry.raw.byteLength < 1024) return null;
    const body = await (entry.encoded[encoding] ??= compress(entry.raw, encoding, true));
    return new Response(method === "HEAD" ? null : new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": entry.type,
        "Content-Encoding": encoding,
        "Content-Length": String(body.byteLength),
        Vary: "Accept-Encoding",
      },
    });
  }
}

/** Le HTML d'une page, compressé si le navigateur l'accepte (à la volée, compression rapide). */
export async function compressHtml(res: Response, acceptEncoding: string | null | undefined): Promise<Response> {
  const encoding = pickEncoding(acceptEncoding);
  if (!encoding || res.headers.has("content-encoding")) return res;
  const raw = new Uint8Array(await res.arrayBuffer());
  const headers = new Headers(res.headers);
  headers.append("Vary", "Accept-Encoding");
  if (raw.byteLength < 1024) {
    headers.delete("content-length");
    return new Response(raw, { status: res.status, headers });
  }
  const body = await compress(raw, encoding);
  headers.set("Content-Encoding", encoding);
  headers.set("Content-Length", String(body.byteLength));
  return new Response(new Uint8Array(body), { status: res.status, headers });
}
