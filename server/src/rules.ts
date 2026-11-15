// Le règlement de la saison (/reglement). Le fichier docs/reglement-saison-1.md
// commence par les points à relire, réservés à l'équipe : seul ce qui suit le
// repère RULES_MARK est servi, et seulement quand data/season.json dit
// rulesPublished. Fichier absent, sans repère, ou avec un champ encore entre
// crochets (« [raison sociale] ») : pas de règlement, 404, et les primes restent
// éteintes (app.ts, gateSeason). Une saison posée ailleurs par SEASON_FILE (la
// démonstration) porte son règlement à côté d'elle : season-demo.json lit
// season-demo.reglement.md, sauf si RULES_FILE en désigne un autre.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RULES_MARK = "<!-- règlement -->";

export const DEFAULT_RULES_FILE = join(dirname(fileURLToPath(import.meta.url)), "../../docs/reglement-saison-1.md");

/** Le règlement posé à côté d'un fichier de saison (« x.json » → « x.reglement.md »), s'il existe. */
export function rulesBeside(seasonFile: string | undefined): string | null {
  if (!seasonFile?.trim()) return null;
  const beside = `${resolve(seasonFile.trim()).replace(/\.json$/i, "")}.reglement.md`;
  return existsSync(beside) ? beside : null;
}

export const RULES_FILE = process.env.RULES_FILE?.trim() ? resolve(process.env.RULES_FILE.trim()) : (rulesBeside(process.env.SEASON_FILE) ?? DEFAULT_RULES_FILE);

/** Le texte public : tout ce qui suit le repère, sans rien de ce qui le précède. Null sans repère. */
export function publicRules(raw: string): string | null {
  const at = raw.indexOf(RULES_MARK);
  if (at < 0) return null;
  const text = raw.slice(at + RULES_MARK.length).trim();
  return text || null;
}

/**
 * Un champ resté à remplir : « [raison sociale] », « [SIREN] », « [date d'annonce] ».
 * Un lien Markdown (« [texte](adresse) ») n'en est pas un.
 */
const BLANK_RE = /\[[^\]\n]*\p{L}[^\]\n]*\](?!\()/gu;

/** Les champs à remplir du texte public, sans doublon, dans l'ordre du texte. */
export function rulesBlanks(text: string): string[] {
  return [...new Set(text.match(BLANK_RE) ?? [])];
}

/**
 * Le texte servi sur /reglement, ou null : un règlement à trous ne se publie
 * pas (SPEC §18.48). Le journal du serveur dit pourquoi, au démarrage.
 */
export function servableRules(text: string | null): string | null {
  if (!text) return null;
  const blanks = rulesBlanks(text);
  if (!blanks.length) return text;
  const shown = blanks.slice(0, 8).join(", ");
  console.warn(`[règlement] ${blanks.length} champ(s) entre crochets à remplir (${shown}${blanks.length > 8 ? ", …" : ""}) : /reglement reste fermé.`);
  return null;
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
  return servableRules(text);
}
