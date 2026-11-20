// La personne d'une ligne de classement (SPEC §18.88) : les fiches d'une bande et le
// top de la semaine montrent la vraie personne, comme sa fiche. Pur.
//
// - Son nom : celui de la fiche, court, le prénom et l'initiale du nom (« Enzo L. »,
//   §18.127, shared/shortName.ts) : le nom complet ne quitte pas le serveur pour un
//   classement. Une fiche GitHub sans nom (le bandeau y répète le pseudo) se lit « @pseudo ».
// - Ni lien ni adresse de profil (§18.127) : les recruteurs passent par Azerit.
// - Son niveau d'expérience (« Junior »), lu sur la grille de la fiche ou du dossier.
// - Son visage : la photo de la fiche (celle de LinkedIn si elle en a une, sinon
//   l'avatar GitHub), sinon les initiales de la fiche, jamais une lettre de remplacement.
// - Sa fiche : la ligne y mène.
// Qui n'est pas montré se décide côté serveur (bands.ts, top.ts) : une fiche née
// d'une dénonciation et pas encore revendiquée, un pseudo masqué.

import { shortName } from "./shortName";
import type { BoardPerson, CardData, ComparisonData, SeniorityCode } from "./types";

/** Les initiales d'un nom, pour une fiche qui n'a pas rangé les siennes : deux parties, sinon deux lettres. */
function initialsOf(label: string): string {
  const parts = label
    .split(/[\s\-_.]+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  const two = parts.length >= 2 ? [...parts[0]!][0]! + [...parts[1]!][0]! : [...(parts[0] ?? "")].slice(0, 2).join("");
  return two || "?";
}

/** Le niveau d'expérience d'une fiche ou d'un dossier, lu sur sa grille (barème 0.5.0) ; absent sur une grille d'avant. */
export function seniorityOf(data: Partial<Pick<CardData | ComparisonData, "grid">> | null | undefined): SeniorityCode | undefined {
  return data?.grid?.seniority?.code;
}

/**
 * La personne d'une fiche, pour une ligne de classement. `login` : celui de la ligne en base, si la fiche n'en porte pas.
 * `seniority` : son niveau d'expérience (seniorityOf), s'il est connu.
 */
export function boardPerson(
  card: Partial<Pick<CardData, "name" | "login" | "avatarUrl" | "initials">>,
  cardId: string,
  login?: string | null,
  seniority?: SeniorityCode | null,
): BoardPerson {
  const handle = card.login || login || undefined;
  const name = card.name?.trim();
  const named = !!name && name.toLowerCase() !== handle?.toLowerCase();
  return {
    cardId,
    ...(named ? { name: shortName(name) } : {}),
    ...(handle ? { login: handle } : {}),
    ...(seniority ? { seniority } : {}),
    ...(card.avatarUrl ? { avatarUrl: card.avatarUrl } : {}),
    initials: (card.initials?.trim() || initialsOf(named ? name : (handle ?? ""))).toUpperCase(),
  };
}

/** Ce que la ligne écrit : le nom, sinon « @pseudo ». Vide : la fiche n'a ni l'un ni l'autre. */
export function personLabel(p: Pick<BoardPerson, "name" | "login">): string {
  return p.name ?? (p.login ? `@${p.login}` : "");
}
