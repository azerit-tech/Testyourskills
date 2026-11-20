// La proposition sous sa fiche (SPEC §18.100) : « C'est ton GitHub ? » sous une fiche
// LinkedIn seule, « C'est ton LinkedIn ? » sous une fiche GitHub seule. Le serveur la
// rend à la personne fichée seulement ; « Non » la range ici aussi, pour qu'elle ne
// revienne pas même si le serveur ne l'a pas encore su.

import type { CardData, Proposal } from "../../../shared/types";
import type { CreateInput } from "./api";

const KEY = "tys_propose_no";

function readNo(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** « Non » à la proposition de cette fiche, déjà dit sur cet appareil. */
export function saidNo(cardId: string): boolean {
  return readNo().includes(cardId);
}

export function rememberNo(cardId: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...readNo().filter((x) => x !== cardId), cardId].slice(-50)));
  } catch {
    /* stockage bloqué : le serveur, lui, s'en souvient */
  }
}

/**
 * La proposition à montrer sous la fiche, ou null : jamais au visiteur, jamais après « Non », et
 * seulement si la fiche n'a toujours que la source qui appelle l'autre.
 */
export function proposalToShow(p: Proposal | null | undefined, card: Pick<CardData, "id" | "login" | "linkedinUrl">, o: { visitor: boolean }): Proposal | null {
  if (!p || o.visitor || saidNo(card.id)) return null;
  if (p.kind === "github") return card.linkedinUrl && !card.login ? p : null;
  return card.login && !card.linkedinUrl ? p : null;
}

/** « Oui » : la fiche que relance « Ajoute ton GitHub » (ou ton LinkedIn), avec ce que la proposition donne. */
export function proposalRequest(p: Proposal, card: Pick<CardData, "id" | "login" | "linkedinUrl">, lang: CreateInput["lang"]): CreateInput | null {
  if (p.kind === "github") return card.linkedinUrl ? { login: p.login, linkedin: card.linkedinUrl, lang, from: card.id } : null;
  return card.login ? { login: card.login, linkedin: p.url, lang, from: card.id } : null;
}
