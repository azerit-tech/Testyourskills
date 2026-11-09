// Limites par IP et par jour (SPEC §12). Compteurs en SQLite pour survivre à
// un redémarrage ; l'IP n'est jamais stockée en clair, seulement son hash.

import { createHash } from "node:crypto";
import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Store } from "./db";

export const CARDS_PER_DAY = 20;

/**
 * IP du client. Derrière ruby-caddy, X-Forwarded-For porte l'IP réelle ; on
 * prend la dernière entrée, celle ajoutée par le proxy le plus proche, que le
 * client ne peut pas forger. Sinon l'adresse de la socket.
 */
export function clientIp(c: Context): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1]!;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown"; // app.request() dans les tests : pas de socket
  }
}

export function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export class RateLimiter {
  constructor(
    private store: Store,
    private salt: string,
  ) {}

  /** Hash salé de l'IP : la seule forme sous laquelle elle est gardée (compteurs, votes du jury). */
  hash(ip: string): string {
    return createHash("sha256").update(this.salt + ip).digest("hex").slice(0, 32);
  }

  private key(scope: string, ip: string) {
    return scope + ":" + this.hash(ip);
  }

  /** true si l'IP peut encore consommer une unité sur cette portée aujourd'hui (sans consommer). */
  allowed(scope: string, ip: string, limit: number, now = Date.now()): boolean {
    return this.store.count(this.key(scope, ip), utcDay(now)) < limit;
  }

  /** Consomme une unité. Renvoie false si la limite est dépassée. */
  take(scope: string, ip: string, limit: number, now = Date.now()): boolean {
    return this.store.bump(this.key(scope, ip), utcDay(now)) <= limit;
  }
}
