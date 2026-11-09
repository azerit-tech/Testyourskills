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

/** Message d'une erreur d'API : celui du serveur, sinon un repli selon le code. */
export function errorFact(err: unknown, closed: string, fallback: string): Fact | string {
  if (err instanceof ApiError && err.fact) return err.fact;
  if (err instanceof ApiError && isClosed(err.code)) return closed;
  return fallback;
}
