// Limites par jour (SPEC §12, §18.48), par IP et par navigateur. Compteurs en
// SQLite pour survivre à un redémarrage ; ni l'IP ni l'identifiant du navigateur
// ne sont stockés en clair, seulement leur hash salé.

import { createHash } from "node:crypto";
import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Store } from "./db";

/**
 * Fiches calculées par jour et par adresse IP (CARDS_PER_DAY). Large : une école,
 * un open space ou un opérateur mobile partagent une adresse. Le plafond de
 * dépense IA du jour reste le vrai garde-fou.
 */
export const CARDS_PER_DAY = 300;
/** Fiches calculées par jour et par navigateur (CARDS_PER_BROWSER). */
export const CARDS_PER_BROWSER = 6;

/**
 * L'identifiant du navigateur : tiré au hasard par le site, gardé en stockage
 * local, envoyé avec chaque demande de fiche. Il ne dit rien de la personne ;
 * le serveur n'en garde que le hash, comme pour l'IP.
 */
export const BROWSER_HEADER = "x-browser-id";
const BROWSER_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** L'identifiant du navigateur de la requête ; null s'il manque ou n'a pas la forme attendue. */
export function browserId(c: Context): string | null {
  const id = c.req.header(BROWSER_HEADER)?.trim();
  return id && BROWSER_ID_RE.test(id) ? id : null;
}

/** Une limite lue dans l'environnement : un entier positif, sinon la valeur par défaut. */
export function limitFromEnv(raw: string | undefined, fallback: number): number {
  const n = Math.floor(Number(raw));
  return raw?.trim() && Number.isFinite(n) && n > 0 ? n : fallback;
}

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

  /** Hash salé de l'IP (ou de l'identifiant du navigateur) : la seule forme sous laquelle elle est gardée (compteurs, votes du jury). */
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
