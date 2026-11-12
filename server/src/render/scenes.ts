// Les lieux du crime (SPEC §18.28) pour les images de partage : le JPEG du
// profil lu sur disque une fois, gardé en data URI (resvg décode le jpeg, pas le
// webp). Dev et image Docker ont tous deux web/public/ (le Dockerfile copie le
// dépôt entier) ; dist/web/ (le front buildé) sert de second chemin.
// Fichier absent : null, et la composition retombe sur son décor dessiné.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SCENE, sceneOf, skyTone, type SkyTone } from "../../../shared/scenes";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DIRS = [resolve(root, "web/public/profiles"), resolve(root, "dist/web/profiles")];

/** `large` : 1152 × 768, pour le portrait et la story ; `small` : 576 × 384, pour le panneau de l'aperçu de lien. */
export type SceneSize = "large" | "small";

export interface SceneImage {
  id: string;
  href: string;
  tone: SkyTone;
}

const memo = new Map<string, string | null>();

function load(id: string, size: SceneSize): string | null {
  const key = `${id}:${size}`;
  if (memo.has(key)) return memo.get(key)!;
  const file = `${id}${size === "small" ? "-s" : ""}.jpg`;
  let href: string | null = null;
  for (const dir of DIRS) {
    try {
      href = `data:image/jpeg;base64,${readFileSync(resolve(dir, file)).toString("base64")}`;
      break;
    } catch {
      /* chemin suivant */
    }
  }
  memo.set(key, href);
  return href;
}

/** Le décor d'une fiche : celui de son profil (sceneOf), `default` sans profil ou si le fichier manque, null si rien n'est lisible. */
export function sceneFor(profileId: string | undefined, size: SceneSize): SceneImage | null {
  for (const id of new Set([sceneOf(profileId), DEFAULT_SCENE])) {
    const href = load(id, size);
    if (href) return { id, href, tone: skyTone(id) };
  }
  return null;
}
