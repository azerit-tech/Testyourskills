// Solde OpenRouter (SPEC §12, §18.0). Le solde fait foi : sous
// AI_MIN_CREDIT_USD, OpenRouter ne répond pas 402, il rabote `max_tokens` à ce
// que le crédit permet et la lecture sort tronquée. On lit donc le solde au
// démarrage, toutes les 5 minutes, et après chaque sortie invalide ou tronquée ;
// sous le seuil, l'IA est fermée (budget.ts, `creditsBelowMin`).
// Rien ne bloque : délai borné, erreurs avalées et loggées. La clé n'apparaît
// dans aucun log.

import { minCreditUsd, noteCreditBalance } from "./budget";

const CREDITS_URL = "https://openrouter.ai/api/v1/credits";
/** Sous ce reste, un avertissement dans les logs : il est temps de recharger. */
export const LOW_CREDITS_USD = 2;
/** Période de la vérification du solde. */
export const CREDITS_CHECK_MS = 5 * 60 * 1000;
/** Écart minimal entre deux vérifications demandées après une sortie suspecte. */
export const CREDITS_RECHECK_MIN_MS = 15 * 1000;

export interface CreditsCheckOptions {
  key?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Seuil d'alerte en dollars. */
  warnBelowUsd?: number;
  log?: Pick<Console, "log" | "warn">;
}

type Level = "closed" | "low" | "ok" | "unknown";

interface Reading {
  remaining: number | null;
  level: Level;
  line: string;
  warn: boolean;
}

/** Lit le solde, sans logger ni lever. */
async function readCredits(opts: CreditsCheckOptions): Promise<Reading | null> {
  const key = opts.key ?? process.env.OPENROUTER_API_KEY ?? "";
  if (!key) return null;
  const threshold = opts.warnBelowUsd ?? LOW_CREDITS_USD;
  // Toute chaîne loggée passe par ici : la clé ne doit jamais en sortir.
  const scrub = (s: string) => s.split(key).join("***");
  const unknown = (line: string): Reading => ({ remaining: null, level: "unknown", line, warn: true });
  try {
    const res = await (opts.fetchImpl ?? fetch)(CREDITS_URL, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
    });
    if (!res.ok) return unknown(`[ai] solde OpenRouter illisible (HTTP ${res.status})`);
    const body = (await res.json()) as { data?: { total_credits?: unknown; total_usage?: unknown } } | null;
    const total = Number(body?.data?.total_credits);
    const usage = Number(body?.data?.total_usage);
    if (!Number.isFinite(total) || !Number.isFinite(usage)) {
      return unknown("[ai] solde OpenRouter illisible (réponse inattendue)");
    }
    const remaining = total - usage;
    // Le solde est noté avant tout log : c'est lui qui ferme ou rouvre l'IA.
    noteCreditBalance(remaining);
    const shown = remaining.toFixed(2);
    const min = minCreditUsd();
    if (remaining <= 0) {
      return { remaining, level: "closed", warn: true, line: `[ai] crédit OpenRouter épuisé (${shown} $) : commissariat fermé jusqu'à la recharge.` };
    }
    if (remaining < min) {
      return {
        remaining,
        level: "closed",
        warn: true,
        line: `[ai] crédit OpenRouter presque épuisé : ${shown} $ restants, sous le seuil de ${min} $ (AI_MIN_CREDIT_USD) : commissariat fermé jusqu'à la recharge.`,
      };
    }
    if (remaining < threshold) {
      return {
        remaining,
        level: "low",
        warn: true,
        line: `[ai] crédit OpenRouter bas : ${shown} $ restants, sous le seuil de ${threshold} $. Recharge le compte.`,
      };
    }
    return { remaining, level: "ok", warn: false, line: `[ai] crédit OpenRouter : ${shown} $ restants.` };
  } catch (err) {
    const e = err as Error;
    return unknown(`[ai] solde OpenRouter injoignable : ${scrub(`${e?.name ?? "Error"}: ${e?.message ?? String(err)}`)}`);
  }
}

function emit(log: Pick<Console, "log" | "warn">, r: Reading): void {
  if (r.warn) log.warn(r.line);
  else log.log(r.line);
}

/** Reste en dollars sur le compte OpenRouter, ou null si inconnu. Loggue toujours. Ne lève jamais. */
export async function checkOpenRouterCredits(opts: CreditsCheckOptions = {}): Promise<number | null> {
  const r = await readCredits(opts);
  if (!r) return null;
  emit(opts.log ?? console, r);
  return r.remaining;
}

// ---------------------------------------------------------------------------
// Vérification périodique

interface Watch {
  opts: CreditsCheckOptions;
  timer: ReturnType<typeof setInterval>;
  inflight: Promise<number | null> | null;
  lastAt: number;
  lastRemaining: number | null;
  lastLevel: Level | null;
}

/** Une seule surveillance par processus (index.ts). Sans elle, `refreshCredits` ne fait rien. */
let watch: Watch | null = null;

async function tick(w: Watch): Promise<number | null> {
  try {
    const r = await readCredits(w.opts);
    if (!r) return null;
    w.lastAt = Date.now();
    w.lastRemaining = r.remaining;
    // Toutes les 5 minutes : on ne loggue qu'un changement d'état, pas chaque lecture.
    if (r.level !== w.lastLevel) emit(w.opts.log ?? console, r);
    w.lastLevel = r.level;
    return r.remaining;
  } catch {
    // readCredits n'est pas censé lever ; la surveillance ne doit rien casser.
    return null;
  }
}

/**
 * Lance la lecture du solde tout de suite, puis toutes les `intervalMs`
 * (5 minutes). Le minuteur ne retient pas le processus. Rend la fonction d'arrêt.
 */
export function startCreditsWatch(opts: CreditsCheckOptions & { intervalMs?: number } = {}): () => void {
  stopCreditsWatch();
  const { intervalMs = CREDITS_CHECK_MS, ...rest } = opts;
  const w: Watch = {
    opts: rest,
    timer: setInterval(() => void run(w), intervalMs),
    inflight: null,
    lastAt: 0,
    lastRemaining: null,
    lastLevel: null,
  };
  w.timer.unref?.();
  watch = w;
  void run(w);
  return stopCreditsWatch;
}

export function stopCreditsWatch(): void {
  if (watch) clearInterval(watch.timer);
  watch = null;
}

/** Une lecture à la fois : les demandes simultanées partagent la même. */
function run(w: Watch): Promise<number | null> {
  w.inflight ??= tick(w).finally(() => (w.inflight = null));
  return w.inflight;
}

/**
 * Relit le solde après une sortie invalide ou tronquée, sans attendre la
 * prochaine période. Lu il y a moins de 15 s : rend la dernière valeur. Sans
 * surveillance lancée (tests, scripts) : ne fait aucun appel. Ne lève jamais.
 */
export function refreshCredits(): Promise<number | null> {
  const w = watch;
  if (!w) return Promise.resolve(null);
  if (!w.inflight && Date.now() - w.lastAt < CREDITS_RECHECK_MIN_MS) return Promise.resolve(w.lastRemaining);
  return run(w);
}
