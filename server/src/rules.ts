// Le règlement de la saison (/reglement). Le fichier docs/reglement-saison-1.md
// commence par les points à relire, réservés à l'équipe : seul ce qui suit le
// repère RULES_MARK est servi, et seulement quand data/season.json dit
// rulesPublished. Fichier absent ou sans repère : pas de règlement, 404.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RULES_MARK = "<!-- règlement -->";

export const DEFAULT_RULES_FILE = join(dirname(fileURLToPath(import.meta.url)), "../../docs/reglement-saison-1.md");
export const RULES_FILE = process.env.RULES_FILE?.trim() ? resolve(process.env.RULES_FILE.trim()) : DEFAULT_RULES_FILE;

/** Le texte public : tout ce qui suit le repère, sans rien de ce qui le précède. Null sans repère. */
export function publicRules(raw: string): string | null {
  const at = raw.indexOf(RULES_MARK);
  if (at < 0) return null;
  const text = raw.slice(at + RULES_MARK.length).trim();
  return text || null;
}

export function loadRules(path = RULES_FILE): string | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    console.warn(`[règlement] ${path} introuvable : /reglement reste fermé.`);
    return null;
  }
  const text = publicRules(raw);
  if (!text) console.warn(`[règlement] ${path} sans le repère ${RULES_MARK} : /reglement reste fermé.`);
  return text;
}
