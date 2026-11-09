// Accès HTTP à GitHub : REST, GraphQL, fichiers bruts. Détection du rate limit,
// délais par requête, limiteur de concurrence. Les appels à l'API passent par
// un TokenPool (tokens.ts) : jeton le moins entamé, bascule sur limite secondaire.

import { resourceOfPath, TokenPool, type Lease, type Resource } from "./tokens";

export type EngineErrorCode = "unknown_user" | "organization" | "rate_limited" | "internal";

export class EngineError extends Error {
  constructor(
    public code: EngineErrorCode,
    msg?: string,
  ) {
    super(msg ?? code);
    this.name = "EngineError";
  }
}

const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";
const UA = "testyourskills (azerit.tech)";

/** Un jeton seul (scripts, tests) ou le pool partagé du serveur. */
export type GithubAuth = string | TokenPool;

export interface Ctx {
  pool: TokenPool;
  signal?: AbortSignal;
  /** Délai par requête, en ms. */
  timeoutMs: number;
  limit: <T>(fn: () => Promise<T>) => Promise<T>;
  /** Compteurs de requêtes, pour le diagnostic. */
  calls: { rest: number; graphql: number; raw: number };
}

export function makeLimiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((r) => queue.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

export function makeCtx(auth: GithubAuth, signal?: AbortSignal, timeoutMs = 8000): Ctx {
  const pool = typeof auth === "string" ? new TokenPool(auth ? [auth] : []) : auth;
  return { pool, signal, timeoutMs, limit: makeLimiter(16), calls: { rest: 0, graphql: 0, raw: 0 } };
}

function signalFor(ctx: Ctx, timeoutMs?: number): AbortSignal {
  const t = AbortSignal.timeout(timeoutMs ?? ctx.timeoutMs);
  return ctx.signal ? AbortSignal.any([ctx.signal, t]) : t;
}

/** Attente plus longue qu'un appel ne peut se permettre : on remonte rate_limited. */
const MAX_INLINE_WAIT_MS = 5000;
/** Limite secondaire sans retry-after : GitHub demande d'attendre au moins une minute. */
const SECONDARY_DEFAULT_MS = 60_000;
/** Jeton refusé (401) quand d'autres restent : écarté ce temps-là. */
const BAD_TOKEN_MS = 15 * 60_000;

/** Limite primaire (compteur à zéro) ou secondaire (retry-after, « secondary rate limit »). */
export function limitOf(res: Response, body: string): "primary" | "secondary" | null {
  if (res.status !== 403 && res.status !== 429) return null;
  const retryAfter = res.headers.get("retry-after");
  if (!retryAfter && res.headers.get("x-ratelimit-remaining") === "0") return "primary";
  if (retryAfter || res.status === 429 || /rate limit|abuse/i.test(body)) return "secondary";
  return null;
}

function retryAfterMs(res: Response): number {
  const s = Number(res.headers.get("retry-after"));
  if (Number.isFinite(s) && s > 0) return s * 1000;
  return SECONDARY_DEFAULT_MS;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal!.reason);
    };
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Envoie un appel avec le jeton qui a le plus de marge sur `resource`. Sur une
 * limite (primaire ou secondaire), le jeton est mis de côté et l'appel repart
 * sur un autre ; si aucun ne se libère dans les 5 s, EngineError rate_limited.
 * Les journaux ne désignent les jetons que par leur numéro.
 */
async function withToken(
  ctx: Ctx,
  resource: Resource,
  send: (token: string) => Promise<Response>,
  opts: { graphql?: boolean } = {},
): Promise<{ res: Response; body: string; lease: Lease }> {
  const attempts = Math.max(2, ctx.pool.size * 2 + 1);
  for (let i = 0; i < attempts; i++) {
    const got = ctx.pool.acquire(resource);
    if (!got.lease) {
      if (got.waitMs > MAX_INLINE_WAIT_MS) break;
      await sleep(got.waitMs + 50, ctx.signal);
      continue;
    }
    const lease = got.lease;
    const res = await send(lease.token);
    const body = await res.text();
    ctx.pool.record(lease, res.headers);
    const limit = limitOf(res, body);
    if (limit === "primary") {
      ctx.pool.exhaust(lease);
      continue;
    }
    if (limit === "secondary") {
      const ms = retryAfterMs(res);
      ctx.pool.block(lease, ms);
      console.warn(`[github] limite secondaire sur le jeton n°${lease.slot + 1} (${resource}), écarté ${Math.round(ms / 1000)} s`);
      continue;
    }
    // GraphQL répond 200 avec une erreur RATE_LIMITED quand ses points sont épuisés.
    if (opts.graphql && res.ok && /"type"\s*:\s*"RATE_LIMITED"/.test(body)) {
      ctx.pool.exhaust(lease);
      continue;
    }
    if (res.status === 401 && ctx.pool.size > 1) {
      ctx.pool.block(lease, BAD_TOKEN_MS);
      console.warn(`[github] jeton n°${lease.slot + 1} refusé (401), écarté 15 min`);
      continue;
    }
    return { res, body, lease };
  }
  throw new EngineError("rate_limited", "GitHub rate limit");
}

export interface RestResult<T> {
  status: number;
  data: T | null;
  headers: Headers;
}

/** GET REST. 404/409/422 rendent data=null sans lever ; rate limit lève EngineError. */
export async function rest<T>(
  ctx: Ctx,
  path: string,
  opts: { accept?: string; timeoutMs?: number; raw?: boolean } = {},
): Promise<RestResult<T>> {
  return ctx.limit(async () => {
    const url = path.startsWith("http") ? path : API + path;
    const { res, body } = await withToken(ctx, resourceOfPath(url), (token) => {
      ctx.calls.rest++;
      return fetch(url, {
        headers: {
          // Sans jeton, pas d'en-tête : un « bearer » vide vaut 401, l'anonyme passe (60 requêtes par heure).
          ...(token ? { authorization: `bearer ${token}` } : {}),
          accept: opts.accept ?? "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
          "user-agent": UA,
        },
        signal: signalFor(ctx, opts.timeoutMs),
      });
    });
    if (!res.ok) return { status: res.status, data: null, headers: res.headers };
    if (opts.raw) return { status: res.status, data: body as T, headers: res.headers };
    return { status: res.status, data: body ? (JSON.parse(body) as T) : null, headers: res.headers };
  });
}

/** Requête GraphQL. Les erreurs partielles sont tolérées (data partielle renvoyée). */
export async function graphql<T>(
  ctx: Ctx,
  query: string,
  variables: Record<string, unknown> = {},
  opts: { timeoutMs?: number } = {},
): Promise<{ data: T | null; errors: { type?: string; message: string }[] }> {
  // GraphQL refuse l'anonyme : sans jeton (dev), les champs qui en dépendent restent vides.
  if (ctx.pool.anonymous) return { data: null, errors: [{ message: "GraphQL indisponible sans jeton GitHub" }] };
  return ctx.limit(async () => {
    const payload = JSON.stringify({ query, variables });
    const { res, body } = await withToken(
      ctx,
      "graphql",
      (token) => {
        ctx.calls.graphql++;
        return fetch(API + "/graphql", {
          method: "POST",
          headers: { authorization: `bearer ${token}`, "content-type": "application/json", "user-agent": UA },
          body: payload,
          signal: signalFor(ctx, opts.timeoutMs),
        });
      },
      { graphql: true },
    );
    if (res.status === 401) throw new EngineError("internal", "GitHub token invalide");
    let json: { data?: T; errors?: { type?: string; message: string }[] };
    try {
      json = JSON.parse(body);
    } catch {
      throw new Error(`GraphQL ${res.status} non JSON`);
    }
    const errors = json.errors ?? [];
    if (errors.some((e) => e.type === "RATE_LIMITED")) throw new EngineError("rate_limited", "GitHub rate limit");
    return { data: json.data ?? null, errors };
  });
}

/** Fichier brut d'un repo public (raw.githubusercontent.com, hors quota API). */
export async function rawFile(ctx: Ctx, fullName: string, ref: string, path: string, maxBytes = 200_000): Promise<string | null> {
  return ctx.limit(async () => {
    ctx.calls.raw++;
    const url = `${RAW}/${fullName}/${encodeURIComponent(ref)}/${path.split("/").map(encodeURIComponent).join("/")}`;
    const res = await fetch(url, { headers: { "user-agent": UA }, signal: signalFor(ctx) });
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > maxBytes) {
      await res.body?.cancel();
      return null;
    }
    const text = await res.text();
    return text.length > maxBytes ? null : text;
  });
}

/** Lit le début d'une ressource texte et coupe dès que `stop` est trouvé. */
export async function headOf(ctx: Ctx, url: string, stop: RegExp, maxBytes = 8192): Promise<string | null> {
  return ctx.limit(async () => {
    ctx.calls.raw++;
    const ac = new AbortController();
    const signal = AbortSignal.any([signalFor(ctx, 5000), ac.signal]);
    const res = await fetch(url, { headers: { "user-agent": UA }, signal });
    if (!res.ok || !res.body) {
      await res.body?.cancel();
      return null;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let text = "";
    try {
      while (text.length < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        if (stop.test(text)) break;
      }
    } finally {
      ac.abort();
    }
    return text;
  });
}

/** Exécute un appel non critique : erreurs et délais dépassés → null. Le rate limit et l'annulation remontent. */
export async function soft<T>(ctx: Ctx, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof EngineError) throw e;
    if (ctx.signal?.aborted) throw e;
    return null;
  }
}

/** Numéro de la dernière page dans un en-tête Link (pagination REST). */
export function lastPageOf(link: string | null): number | null {
  if (!link) return null;
  const m = link.match(/[?&]page=(\d+)>;\s*rel="last"/);
  return m ? Number(m[1]) : null;
}
