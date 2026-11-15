import type { Fact } from "../../../shared/types";

/** Erreur lisible renvoyée par l'API, avec son message bilingue. */
export class ApiError extends Error {
  code: string;
  fact: Fact | null;
  status: number;
  constructor(status: number, code: string, fact: Fact | null) {
    super(fact?.en ?? code);
    this.status = status;
    this.code = code;
    this.fact = fact;
  }
}

/**
 * Commissariat fermé (plafond IA du jour atteint ou crédit épuisé) : pas
 * d'écran d'erreur, retour à l'entrée avec le pseudo prérempli et le message.
 */
export function isClosed(code: string | undefined | null): boolean {
  return code === "closed";
}

/**
 * Faute de saisie (pseudo inconnu, organisation) : pas d'écran d'erreur non plus,
 * retour à l'entrée, le message sous le champ, là où on corrige (§18.48).
 */
export function isInputError(code: string | undefined | null): boolean {
  return code === "unknown_user" || code === "organization";
}

/** Message d'une erreur d'API : celui du serveur, sinon un repli selon le code. */
export function errorFact(err: unknown, closed: string, fallback: string): Fact | string {
  if (err instanceof ApiError && err.fact) return err.fact;
  if (err instanceof ApiError && isClosed(err.code)) return closed;
  return fallback;
}
