// La personne d'une ligne de classement (SPEC §18.88) : la page d'une bande et le
// top de la semaine montrent la vraie personne, comme sa fiche. Pur.
//
// - Son nom : celui de la fiche. Une fiche GitHub sans nom (le bandeau y répète le
//   pseudo) se lit « @pseudo ».
// - Son visage : la photo de la fiche (celle de LinkedIn si elle en a une, sinon
//   l'avatar GitHub), sinon les initiales de la fiche, jamais une lettre de remplacement.
// - Sa fiche : la ligne y mène.
// Qui n'est pas montré se décide côté serveur (bands.ts, top.ts) : une fiche née
// d'une dénonciation et pas encore revendiquée, un pseudo masqué.

import type { BoardPerson, CardData } from "./types";

/** Les initiales d'un nom, pour une fiche qui n'a pas rangé les siennes : deux parties, sinon deux lettres. */
function initialsOf(label: string): string {
  const parts = label
    .split(/[\s\-_.]+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  const two = parts.length >= 2 ? [...parts[0]!][0]! + [...parts[1]!][0]! : [...(parts[0] ?? "")].slice(0, 2).join("");
  return two || "?";
}

/** La personne d'une fiche, pour une ligne de classement. `login` : celui de la ligne en base, si la fiche n'en porte pas. */
export function boardPerson(card: Partial<Pick<CardData, "name" | "login" | "avatarUrl" | "initials">>, cardId: string, login?: string | null): BoardPerson {
  const handle = card.login || login || undefined;
  const name = card.name?.trim();
  const named = !!name && name.toLowerCase() !== handle?.toLowerCase();
  return {
    cardId,
    ...(named ? { name } : {}),
    ...(handle ? { login: handle } : {}),
    ...(card.avatarUrl ? { avatarUrl: card.avatarUrl } : {}),
    initials: (card.initials?.trim() || initialsOf(named ? name : (handle ?? ""))).toUpperCase(),
  };
}

/** Ce que la ligne écrit : le nom, sinon « @pseudo ». Vide : la fiche n'a ni l'un ni l'autre. */
export function personLabel(p: Pick<BoardPerson, "name" | "login">): string {
  return p.name ?? (p.login ? `@${p.login}` : "");
}
