// Le front découpé (web/src/App.tsx charge chaque page à la demande) : le serveur
// annonce dans le HTML les morceaux de la page demandée, pour qu'ils partent en
// même temps que le paquet de départ au lieu de l'attendre. La liste vient du
// manifeste de Vite (dist/web/.vite/manifest.json).

import { readFileSync } from "node:fs";
import { join } from "node:path";

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
  // La page introuvable vit avec la vie privée (pages/Privacy.tsx).
  if (/^\/(confidentialite|privacy)\/?$/.test(p) || status === 404) return "src/pages/Privacy.tsx";
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
