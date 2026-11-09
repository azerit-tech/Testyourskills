// Solde OpenRouter lu au démarrage du serveur (SPEC §18.0) : un avertissement
// dans les logs si le reste passe sous 2 $. Ne bloque jamais le démarrage :
// délai borné, erreurs avalées et loggées. La clé n'apparaît dans aucun log.

import { noteCreditsExhausted } from "./budget";

const CREDITS_URL = "https://openrouter.ai/api/v1/credits";
export const LOW_CREDITS_USD = 2;

export interface CreditsCheckOptions {
  key?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Seuil d'alerte en dollars. */
  warnBelowUsd?: number;
  log?: Pick<Console, "log" | "warn">;
}

/** Reste en dollars sur le compte OpenRouter, ou null si inconnu. Ne lève jamais. */
export async function checkOpenRouterCredits(opts: CreditsCheckOptions = {}): Promise<number | null> {
  const key = opts.key ?? process.env.OPENROUTER_API_KEY ?? "";
  const log = opts.log ?? console;
  const threshold = opts.warnBelowUsd ?? LOW_CREDITS_USD;
  if (!key) return null;
  // Toute chaîne loggée passe par ici : la clé ne doit jamais en sortir.
  const scrub = (s: string) => s.split(key).join("***");
  try {
    const res = await (opts.fetchImpl ?? fetch)(CREDITS_URL, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
    });
    if (!res.ok) {
      log.warn(`[ai] solde OpenRouter illisible (HTTP ${res.status})`);
      return null;
    }
    const body = (await res.json()) as { data?: { total_credits?: unknown; total_usage?: unknown } } | null;
    const total = Number(body?.data?.total_credits);
    const usage = Number(body?.data?.total_usage);
    if (!Number.isFinite(total) || !Number.isFinite(usage)) {
      log.warn("[ai] solde OpenRouter illisible (réponse inattendue)");
      return null;
    }
    const remaining = total - usage;
    const shown = remaining.toFixed(2);
    if (remaining <= 0) {
      // Les appels répondront 402 : /api/health le dit sans attendre la première fiche.
      noteCreditsExhausted();
      log.warn(`[ai] crédit OpenRouter épuisé (${shown} $) : aucune fiche ne sortira avant la recharge.`);
    } else if (remaining < threshold) {
      log.warn(`[ai] crédit OpenRouter bas : ${shown} $ restants, sous le seuil de ${threshold} $. Recharge le compte.`);
    } else {
      log.log(`[ai] crédit OpenRouter : ${shown} $ restants.`);
    }
    return remaining;
  } catch (err) {
    const e = err as Error;
    log.warn(`[ai] solde OpenRouter injoignable : ${scrub(`${e?.name ?? "Error"}: ${e?.message ?? String(err)}`)}`);
    return null;
  }
}
