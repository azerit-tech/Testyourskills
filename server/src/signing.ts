// Valeurs signées des cookies (HMAC-SHA256, SESSION_SECRET) : la session de
// « C'est moi » (auth.ts), le compte (account.ts), les états OAuth. Chaque usage
// a son préfixe (`purpose`) : une valeur signée pour l'un ne passe jamais pour l'autre.

import { createHmac, timingSafeEqual } from "node:crypto";

function mac(secret: string, purpose: string, body: string): string {
  return createHmac("sha256", secret).update(`${purpose}.${body}`).digest("base64url");
}

/** Deux chaînes égales, comparées en temps constant. */
export function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Valeur signée `{charge}.{signature}` ; `purpose` empêche qu'une valeur passe pour une autre. */
export function sign(secret: string, purpose: string, payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(secret, purpose, body)}`;
}

/** Charge d'une valeur signée, ou null si la signature ne correspond pas. Comparaison en temps constant. */
export function unsign(secret: string, purpose: string, value: string | undefined): Record<string, unknown> | null {
  if (!value || value.length > 2048) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  if (!sameString(value.slice(dot + 1), mac(secret, purpose, body))) return null;
  try {
    const v: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Empreinte d'usage : HMAC-SHA256 d'une valeur avec le secret, sous un préfixe à elle. Jamais la valeur en clair. */
export function keyed(secret: string, purpose: string, value: string): string {
  return mac(secret, purpose, value);
}
