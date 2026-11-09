// Jetons GitHub en rotation (SPEC §18.0). Chaque jeton a ses propres compteurs,
// un par ressource de l'API (`core` pour REST, `graphql`, `search`…), tenus à jour
// par les en-têtes x-ratelimit-* de chaque réponse. À chaque appel, on prend le
// jeton qui a le plus de marge sur la ressource visée.
//
// Les jetons ne sortent jamais d'ici autrement que pour l'en-tête authorization :
// les journaux et les erreurs ne parlent que de leur numéro (« jeton n°2 »).

/** Ressource GitHub telle que la nomme x-ratelimit-resource. */
export type Resource = "core" | "graphql" | "search" | "code_search" | (string & {});

/** Plafonds horaires (ou par minute pour la recherche) supposés tant qu'aucune réponse ne les a donnés. */
const DEFAULT_LIMITS: Record<string, number> = { core: 5000, graphql: 5000, search: 30, code_search: 10 };
const ANONYMOUS_LIMITS: Record<string, number> = { core: 60, graphql: 0, search: 10, code_search: 0 };

interface Counter {
  limit: number;
  remaining: number;
  /** Remise à zéro du compteur, en ms epoch. 0 : inconnue. */
  resetAt: number;
}

interface Slot {
  token: string;
  counters: Map<string, Counter>;
  /** Limite secondaire ou jeton refusé : inutilisable jusqu'à cette date, toutes ressources confondues. */
  blockedUntil: number;
  /** Ordre du dernier tirage, pour départager les ex aequo à tour de rôle. */
  lastPick: number;
}

/** Jeton prêté pour un appel. `slot` sert à rendre compte de la réponse. */
export interface Lease {
  slot: number;
  token: string;
  resource: Resource;
}

export type Readiness = { ok: true } | { ok: false; waitMs: number };

/** Ressource de l'appel REST d'après son chemin (corrigée ensuite par x-ratelimit-resource). */
export function resourceOfPath(path: string): Resource {
  const p = path.replace(/^https?:\/\/[^/]+/, "");
  if (p.startsWith("/graphql")) return "graphql";
  if (p.startsWith("/search/code")) return "code_search";
  if (p.startsWith("/search/")) return "search";
  return "core";
}

/** GITHUB_TOKENS (liste séparée par des virgules), sinon GITHUB_TOKEN. Doublons et vides retirés. */
export function tokensFromEnv(env: Record<string, string | undefined>): string[] {
  const list = (env.GITHUB_TOKENS ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const tokens = list.length ? list : [(env.GITHUB_TOKEN ?? "").trim()].filter(Boolean);
  return [...new Set(tokens)];
}

export class TokenPool {
  private slots: Slot[];
  private seq = 0;
  /** Sans jeton (dev) : un seul emplacement anonyme, 60 requêtes REST par heure, pas de GraphQL. */
  readonly anonymous: boolean;

  constructor(
    tokens: string[],
    private readonly now: () => number = Date.now,
  ) {
    const clean = [...new Set(tokens.map((t) => t.trim()).filter(Boolean))];
    this.anonymous = clean.length === 0;
    this.slots = (this.anonymous ? [""] : clean).map((token) => ({ token, counters: new Map(), blockedUntil: 0, lastPick: 0 }));
  }

  get size(): number {
    return this.anonymous ? 0 : this.slots.length;
  }

  private counter(slot: Slot, resource: Resource): Counter {
    let c = slot.counters.get(resource);
    const limits = this.anonymous ? ANONYMOUS_LIMITS : DEFAULT_LIMITS;
    if (!c) {
      const limit = limits[resource] ?? limits.core!;
      c = { limit, remaining: limit, resetAt: 0 };
      slot.counters.set(resource, c);
    }
    // Fenêtre écoulée : le compteur est plein de nouveau.
    if (c.resetAt && c.resetAt <= this.now()) {
      c.remaining = c.limit;
      c.resetAt = 0;
    }
    return c;
  }

  /** Date (ms epoch) à laquelle ce jeton redevient utilisable pour cette ressource. */
  private availableAt(slot: Slot, resource: Resource, need = 1): number {
    const c = this.counter(slot, resource);
    const quota = c.remaining >= need ? 0 : c.resetAt || this.now() + 60_000;
    return Math.max(slot.blockedUntil, quota);
  }

  /**
   * Prête le jeton qui a le plus de marge sur `resource`, et décompte l'appel
   * par avance (les réponses des appels en vol corrigeront). null : aucun jeton
   * disponible, `waitMs` dit dans combien de temps le premier se libère.
   */
  acquire(resource: Resource): { lease: Lease } | { lease: null; waitMs: number } {
    const now = this.now();
    let best: { i: number; slot: Slot; c: Counter } | null = null;
    this.slots.forEach((slot, i) => {
      if (slot.blockedUntil > now) return;
      const c = this.counter(slot, resource);
      if (c.remaining <= 0) return;
      if (!best || c.remaining > best.c.remaining || (c.remaining === best.c.remaining && slot.lastPick < best.slot.lastPick)) {
        best = { i, slot, c };
      }
    });
    if (!best) {
      const at = Math.min(...this.slots.map((s) => this.availableAt(s, resource)));
      return { lease: null, waitMs: Math.max(0, at - now) };
    }
    const { i, slot, c } = best as { i: number; slot: Slot; c: Counter };
    c.remaining--;
    slot.lastPick = ++this.seq;
    return { lease: { slot: i, token: slot.token, resource } };
  }

  /** Met à jour le compteur nommé par x-ratelimit-resource d'après la réponse reçue. */
  record(lease: Lease, headers: Headers): void {
    const slot = this.slots[lease.slot];
    if (!slot) return;
    const remaining = num(headers.get("x-ratelimit-remaining"));
    if (remaining === null) return;
    const resource = headers.get("x-ratelimit-resource") || lease.resource;
    const c = this.counter(slot, resource);
    const limit = num(headers.get("x-ratelimit-limit"));
    const reset = num(headers.get("x-ratelimit-reset"));
    if (limit !== null) c.limit = limit;
    c.remaining = remaining;
    if (reset !== null) c.resetAt = reset * 1000;
  }

  /** Compteur épuisé sans en-tête exploitable (ex. erreur GraphQL RATE_LIMITED). */
  exhaust(lease: Lease, resetAt?: number): void {
    const slot = this.slots[lease.slot];
    if (!slot) return;
    const c = this.counter(slot, lease.resource);
    c.remaining = 0;
    if (!c.resetAt) c.resetAt = resetAt ?? this.now() + 60_000;
  }

  /** Écarte un jeton pour `ms` (limite secondaire, jeton refusé). */
  block(lease: Lease, ms: number): void {
    const slot = this.slots[lease.slot];
    if (!slot) return;
    slot.blockedUntil = Math.max(slot.blockedUntil, this.now() + ms);
  }

  /**
   * Une fiche peut-elle démarrer ? Il faut, pour chaque ressource, un jeton qui
   * ait encore `need[resource]` appels de marge. Sinon, `waitMs` : le temps avant
   * que la plus lente des ressources manquantes se libère.
   */
  readiness(need: Partial<Record<Resource, number>>): Readiness {
    const now = this.now();
    let wait = 0;
    let ok = true;
    for (const [resource, n] of Object.entries(need)) {
      if (!n) continue;
      const at = Math.min(...this.slots.map((s) => this.availableAt(s, resource, n)));
      if (at > now) {
        ok = false;
        wait = Math.max(wait, at - now);
      }
    }
    return ok ? { ok: true } : { ok: false, waitMs: wait };
  }

  /** État des compteurs, sans les jetons (diagnostic, tests). */
  snapshot(): { slot: number; blockedUntil: number; counters: Record<string, Counter> }[] {
    return this.slots.map((s, slot) => ({
      slot,
      blockedUntil: s.blockedUntil,
      counters: Object.fromEntries([...s.counters].map(([k, c]) => [k, { ...c }])),
    }));
  }
}

function num(v: string | null): number | null {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
