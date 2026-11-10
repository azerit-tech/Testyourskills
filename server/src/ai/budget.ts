// Suivi du coût IA par jour (SPEC §12, §18.0), alimenté par le `usage`
// d'OpenRouter. Le total du jour UTC est persisté dans SQLite (table `ai_spend`)
// dès que index.ts branche la base : un redémarrage ne remet pas le compteur à
// zéro, donc AI_DAILY_BUDGET_USD ne se contourne pas en relançant le serveur.
// Sans base branchée (tests, scripts), le total vit en mémoire.

import type Database from "better-sqlite3";

/** Champ `usage` d'une réponse OpenRouter (toujours présent). */
export interface UsageLike {
  prompt_tokens: number;
  completion_tokens: number;
  /** Coût réel facturé, en dollars (crédits OpenRouter). */
  cost?: number | null;
  prompt_tokens_details?: {
    /** Tokens lus depuis le cache (inclus dans prompt_tokens). */
    cached_tokens?: number | null;
    /** Tokens écrits en cache (inclus dans prompt_tokens). */
    cache_write_tokens?: number | null;
  } | null;
}

/** Prix en dollars par million de tokens. */
interface Price {
  input: number;
  output: number;
}

// Repli si OpenRouter ne renvoie pas `cost` : tarifs publics par modèle.
const PRICES: { match: RegExp; price: Price }[] = [
  { match: /haiku-5[.-]5/, price: { input: 0.1, output: 0.5 } },
  { match: /haiku-4[.-]5/, price: { input: 1, output: 5 } },
  { match: /sonnet-5/, price: { input: 2, output: 10 } },
  { match: /sonnet-4/, price: { input: 3, output: 15 } },
  { match: /opus-5[.-]5/, price: { input: 4, output: 20 } },
  { match: /opus/, price: { input: 5, output: 25 } },
  { match: /glm-5\.3-flash(?!x)/, price: { input: 0.04, output: 0.078 } },
];
// Modèle inconnu : on compte au prix le plus cher pour rester prudent.
const FALLBACK_PRICE: Price = { input: 10, output: 50 };

// Écriture en cache 5 min : 1,25 × l'entrée ; lecture : 0,1 ×.
const CACHE_WRITE = 1.25;
const CACHE_READ = 0.1;

interface DayTotals {
  day: string;
  usd: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

let totals: DayTotals = empty(today());

/** Base où persister la dépense, avec ses requêtes préparées. */
let ledger: { add: Database.Statement; get: Database.Statement } | null = null;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function empty(day: string): DayTotals {
  return { day, usd: 0, inputTokens: 0, outputTokens: 0, calls: 0 };
}

/** Total en mémoire du jour UTC courant. */
function memory(): DayTotals {
  const d = today();
  if (totals.day !== d) totals = empty(d);
  return totals;
}

/**
 * Branche la base SQLite du serveur (table `ai_spend`, créée par db.ts).
 * null débranche. Le total déjà en mémoire n'est pas recopié dans la base.
 */
export function useBudgetDb(db: Database.Database | null): void {
  ledger = db
    ? {
        add: db.prepare(
          `INSERT INTO ai_spend (day, usd, input_tokens, output_tokens, calls) VALUES (?, ?, ?, ?, 1)
           ON CONFLICT(day) DO UPDATE SET
             usd = usd + excluded.usd,
             input_tokens = COALESCE(input_tokens, 0) + excluded.input_tokens,
             output_tokens = COALESCE(output_tokens, 0) + excluded.output_tokens,
             calls = COALESCE(calls, 0) + 1`,
        ),
        get: db.prepare(`SELECT usd, input_tokens, output_tokens, calls FROM ai_spend WHERE day = ?`),
      }
    : null;
}

/** Total du jour : la base fait foi si elle est branchée et lisible, sinon la mémoire. */
function current(): DayTotals {
  const mem = memory();
  if (!ledger) return mem;
  try {
    const r = ledger.get.get(mem.day) as
      | { usd: number; input_tokens: number | null; output_tokens: number | null; calls: number | null }
      | undefined;
    if (!r) return empty(mem.day);
    return { day: mem.day, usd: r.usd, inputTokens: r.input_tokens ?? 0, outputTokens: r.output_tokens ?? 0, calls: r.calls ?? 0 };
  } catch (err) {
    // Base fermée ou verrouillée : on garde au moins ce que ce processus a dépensé.
    console.warn("[ai] budget : lecture de ai_spend impossible :", (err as Error).message);
    return mem;
  }
}

function priceFor(model: string): Price {
  return PRICES.find((p) => p.match.test(model))?.price ?? FALLBACK_PRICE;
}

/** Coût en dollars d'une réponse : `cost` d'OpenRouter s'il est donné, sinon estimé. */
export function costOf(model: string, usage: UsageLike): number {
  if (typeof usage.cost === "number" && Number.isFinite(usage.cost)) return usage.cost;
  const p = priceFor(model);
  const read = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const write = usage.prompt_tokens_details?.cache_write_tokens ?? 0;
  const plain = Math.max(0, usage.prompt_tokens - read - write);
  const inputUsd = (plain * p.input + write * p.input * CACHE_WRITE + read * p.input * CACHE_READ) / 1e6;
  return inputUsd + (usage.completion_tokens * p.output) / 1e6;
}

/** Enregistre la consommation d'un appel. */
export function recordUsage(model: string, usage: UsageLike): void {
  const usd = costOf(model, usage);
  // La mémoire est toujours tenue : c'est le repli si la base devient illisible.
  const t = memory();
  t.usd += usd;
  t.inputTokens += usage.prompt_tokens;
  t.outputTokens += usage.completion_tokens;
  t.calls += 1;
  if (!ledger) return;
  try {
    ledger.add.run(t.day, usd, usage.prompt_tokens, usage.completion_tokens);
  } catch (err) {
    console.warn("[ai] budget : écriture dans ai_spend impossible :", (err as Error).message);
  }
}

export function dailyBudgetUsd(): number {
  const raw = Number(process.env.AI_DAILY_BUDGET_USD);
  return Number.isFinite(raw) && raw >= 0 && process.env.AI_DAILY_BUDGET_USD !== "" ? raw : 5;
}

export function aiCostToday(): { usd: number; inputTokens: number; outputTokens: number; calls: number } {
  const { usd, inputTokens, outputTokens, calls } = current();
  return { usd, inputTokens, outputTokens, calls };
}

/** Budget du jour non dépassé (indépendamment de la clé). */
export function withinBudget(): boolean {
  return current().usd < dailyBudgetUsd();
}

/** OPENROUTER_API_KEY présent : l'IA est configurée (le budget est vérifié à chaque appel). */
export function aiConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

// ---------------------------------------------------------------------------
// Commissariat fermé : plafond du jour atteint ou crédit OpenRouter épuisé

/**
 * L'IA est coupée pour la journée. La fiche échoue avec le code public `closed`
 * plutôt que de sortir sans lecture : une même entrée donne toujours la même
 * fiche (SPEC §2.3). Reconnue par le pipeline à son champ `code`.
 */
export class AiClosedError extends Error {
  readonly code = "closed" as const;
  constructor(readonly reason: "budget" | "credits") {
    super(reason === "budget" ? "plafond IA du jour atteint" : "crédit OpenRouter épuisé");
    this.name = "AiClosedError";
  }
}

/** Durée pendant laquelle un 402 vu ferme le commissariat. */
export const CREDITS_WINDOW_MS = 10 * 60 * 1000;

let creditsExhaustedAt: number | null = null;

/**
 * Dernier solde OpenRouter lu (credits.ts), en dollars. null : jamais lu, ou
 * illisible depuis le démarrage. Le solde fait foi : sous AI_MIN_CREDIT_USD,
 * OpenRouter ne renvoie pas de 402 mais rabote `max_tokens` à ce que le crédit
 * permet, et la lecture sort tronquée. On ferme donc avant d'appeler.
 */
let creditBalanceUsd: number | null = null;

/** Seuil de solde sous lequel l'IA est fermée (AI_MIN_CREDIT_USD, défaut 0,50 $).
 * Une fiche coûte 0,001 à 0,003 $ : 0,05 $ suffit à couvrir le `max_tokens` d'un appel (.env.example). */
export function minCreditUsd(): number {
  const raw = process.env.AI_MIN_CREDIT_USD;
  const n = Number(raw);
  return raw !== undefined && raw !== "" && Number.isFinite(n) && n >= 0 ? n : 0.5;
}

/** OpenRouter a répondu 402 (crédit insuffisant). Une réponse tronquée ne passe pas par ici : le solde relu tranche. */
export function noteCreditsExhausted(now = Date.now()): void {
  creditsExhaustedAt = now;
}

/** Un appel est passé : le crédit est revenu, inutile d'attendre 10 minutes pour le dire. */
export function noteCreditsOk(): void {
  creditsExhaustedAt = null;
}

/**
 * Solde lu sur OpenRouter. Au-dessus du seuil, il lève aussi un 402 vu
 * auparavant : le solde fait foi, la recharge rouvre tout de suite.
 */
export function noteCreditBalance(usd: number): void {
  creditBalanceUsd = usd;
  if (usd >= minCreditUsd()) creditsExhaustedAt = null;
}

/** Dernier solde connu (diagnostic, tests), jamais exposé au public. */
export function lastCreditBalance(): number | null {
  return creditBalanceUsd;
}

/** Solde connu et sous le seuil : aucun appel ne part, la fiche échoue en `closed`. */
export function creditsBelowMin(): boolean {
  return creditBalanceUsd !== null && creditBalanceUsd < minCreditUsd();
}

/**
 * État public de l'IA, sans montant : `off` sans clé ; `credits` si le solde
 * est sous le seuil, ou si un 402 a été vu dans les 10 dernières minutes sans
 * qu'un solde suffisant l'ait démenti depuis ;
 * `budget` si le plafond du jour est atteint.
 */
export type AiStatus = "ok" | "budget" | "credits" | "off";

export function aiStatus(now = Date.now()): AiStatus {
  if (!aiConfigured()) return "off";
  if (creditsBelowMin()) return "credits";
  if (creditsExhaustedAt !== null && now - creditsExhaustedAt < CREDITS_WINDOW_MS) return "credits";
  if (!withinBudget()) return "budget";
  return "ok";
}

/** Pour les tests uniquement : remet la mémoire à zéro et débranche la base. */
export function resetBudgetForTests(): void {
  totals = empty(today());
  ledger = null;
  creditsExhaustedAt = null;
  creditBalanceUsd = null;
}
