import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiStatus, creditsBelowMin, lastCreditBalance, noteCreditsExhausted, resetBudgetForTests } from "./budget";
import { ChatHttpError } from "./client";
import {
  checkOpenRouterCredits,
  CREDITS_CHECK_MS,
  CREDITS_RECHECK_MIN_MS,
  refreshCredits,
  startCreditsWatch,
  stopCreditsWatch,
} from "./credits";
import { readCode } from "./readCode";
import { fakeClient } from "./testing";

const KEY = "sk-or-v1-secret-key";
const savedKey = process.env.OPENROUTER_API_KEY;

function logger() {
  const lines: string[] = [];
  return {
    lines,
    log: { log: (...a: unknown[]) => lines.push(a.join(" ")), warn: (...a: unknown[]) => lines.push(a.join(" ")) },
  };
}

function creditsFetch(total: number, usage: number) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(JSON.stringify({ data: { total_credits: total, total_usage: usage } }), { status: 200 }),
  );
}

beforeEach(() => resetBudgetForTests());
afterEach(() => {
  stopCreditsWatch();
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetBudgetForTests();
  if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = savedKey;
});

describe("solde OpenRouter au démarrage", () => {
  it("interroge /credits avec la clé en en-tête ; sous 0,50 $, commissariat fermé", async () => {
    process.env.OPENROUTER_API_KEY = KEY;
    const fetchImpl = creditsFetch(10, 9.74);
    const { lines, log } = logger();
    const left = await checkOpenRouterCredits({ key: KEY, fetchImpl: fetchImpl as typeof fetch, log });
    expect(left).toBeCloseTo(0.26, 9);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/credits");
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${KEY}`);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(lines).toHaveLength(1);
    // Le cas de la production du 9 novembre : 0,26 $, sous le seuil, l'IA est fermée.
    expect(lines[0]).toMatch(/presque épuisé : 0\.26 \$ restants, sous le seuil de 0\.5 \$/);
    expect(lines.join("\n")).not.toContain(KEY);
    expect(creditsBelowMin()).toBe(true);
    expect(aiStatus()).toBe("credits");
  });

  it("entre le seuil de fermeture et 2 $ : simple avertissement, l'IA reste ouverte", async () => {
    process.env.OPENROUTER_API_KEY = KEY;
    const { lines, log } = logger();
    await checkOpenRouterCredits({ key: KEY, fetchImpl: creditsFetch(10, 8.8) as typeof fetch, log });
    expect(lines[0]).toMatch(/crédit OpenRouter bas : 1\.20 \$/);
    expect(aiStatus()).toBe("ok");
  });

  it("AI_MIN_CREDIT_USD règle le seuil de fermeture", async () => {
    process.env.OPENROUTER_API_KEY = KEY;
    process.env.AI_MIN_CREDIT_USD = "0.1";
    try {
      await checkOpenRouterCredits({ key: KEY, fetchImpl: creditsFetch(10, 9.74) as typeof fetch, log: logger().log });
      expect(aiStatus()).toBe("ok");
      process.env.AI_MIN_CREDIT_USD = "1";
      expect(aiStatus()).toBe("credits");
    } finally {
      delete process.env.AI_MIN_CREDIT_USD;
    }
  });

  it("n'avertit pas au-dessus du seuil", async () => {
    const { lines, log } = logger();
    const warn = vi.spyOn(log, "warn");
    expect(await checkOpenRouterCredits({ key: KEY, fetchImpl: creditsFetch(20, 3) as typeof fetch, log })).toBe(17);
    expect(warn).not.toHaveBeenCalled();
    expect(lines[0]).toContain("17.00 $");
  });

  it("solde nul : avertit et /api/health passe en credits", async () => {
    process.env.OPENROUTER_API_KEY = KEY;
    const { lines, log } = logger();
    await checkOpenRouterCredits({ key: KEY, fetchImpl: creditsFetch(5, 5) as typeof fetch, log });
    expect(lines[0]).toMatch(/épuisé/);
    expect(aiStatus()).toBe("credits");
  });

  it("sans clé, ne fait aucun appel", async () => {
    const fetchImpl = creditsFetch(1, 0);
    expect(await checkOpenRouterCredits({ key: "", fetchImpl: fetchImpl as typeof fetch, log: logger().log })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("avale les erreurs sans jamais logger la clé", async () => {
    const { lines, log } = logger();
    const boom = vi.fn(async () => {
      throw new TypeError(`fetch failed for Bearer ${KEY}`);
    });
    await expect(checkOpenRouterCredits({ key: KEY, fetchImpl: boom as typeof fetch, log })).resolves.toBeNull();
    const http = vi.fn(async () => new Response("{}", { status: 401 }));
    await expect(checkOpenRouterCredits({ key: KEY, fetchImpl: http as typeof fetch, log })).resolves.toBeNull();
    const junk = vi.fn(async () => new Response("pas du json", { status: 200 }));
    await expect(checkOpenRouterCredits({ key: KEY, fetchImpl: junk as typeof fetch, log })).resolves.toBeNull();
    expect(lines).toHaveLength(3);
    expect(lines.join("\n")).not.toContain(KEY);
    expect(lines[0]).toContain("***");
  });

  it("abandonne passé le délai, sans bloquer", async () => {
    const { lines, log } = logger();
    // Un serveur qui ne répond jamais, mais respecte le signal d'annulation.
    const hang = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
        }),
    );
    const t0 = Date.now();
    await expect(checkOpenRouterCredits({ key: KEY, fetchImpl: hang as typeof fetch, timeoutMs: 30, log })).resolves.toBeNull();
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(lines[0]).toMatch(/injoignable : TimeoutError/);
  });
});

/** Solde servi par un faux /credits, modifiable en cours de test ; ou une erreur. */
function balanceFetch(state: { left: number | Error }) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    if (state.left instanceof Error) throw state.left;
    return new Response(JSON.stringify({ data: { total_credits: 100, total_usage: 100 - state.left } }), { status: 200 });
  });
}

const REPOS = [{ repo: "r", activity: 1, files: [{ path: "a.ts", content: "export {}" }] }];

describe("vérification périodique du solde", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = KEY;
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(new Date("2026-11-09T12:00:00Z"));
  });

  /** Lance la surveillance et attend la première lecture, puis avance au-delà des 15 s de répit. */
  async function watchWith(fetchImpl: ReturnType<typeof balanceFetch>, log = logger().log) {
    startCreditsWatch({ key: KEY, fetchImpl: fetchImpl as typeof fetch, log });
    await vi.advanceTimersByTimeAsync(0);
    vi.setSystemTime(Date.now() + CREDITS_RECHECK_MIN_MS + 1);
  }

  it("lit au démarrage puis toutes les 5 minutes, et ne loggue qu'un changement d'état", async () => {
    const state = { left: 5 as number | Error };
    const fetchImpl = balanceFetch(state);
    const { lines, log } = logger();
    startCreditsWatch({ key: KEY, fetchImpl: fetchImpl as typeof fetch, log });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(lines).toEqual(["[ai] crédit OpenRouter : 5.00 $ restants."]);

    await vi.advanceTimersByTimeAsync(CREDITS_CHECK_MS);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(lines).toHaveLength(1); // même état : rien de plus dans les logs

    // Le crédit fond sous le seuil : la lecture suivante ferme le commissariat.
    state.left = 0.3;
    await vi.advanceTimersByTimeAsync(CREDITS_CHECK_MS);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(aiStatus()).toBe("credits");
    expect(lines[1]).toMatch(/presque épuisé : 0\.30 \$/);

    // Recharge : rouvert à la lecture suivante, sans redémarrer.
    state.left = 20;
    await vi.advanceTimersByTimeAsync(CREDITS_CHECK_MS);
    expect(aiStatus()).toBe("ok");
    expect(lines).toHaveLength(3);
    expect(lines.join("\n")).not.toContain(KEY);
  });

  it("ne bloque rien et avale ses erreurs, sans jamais logger la clé", async () => {
    const state = { left: 5 as number | Error };
    const fetchImpl = balanceFetch(state);
    const { lines, log } = logger();
    const stop = startCreditsWatch({ key: KEY, fetchImpl: fetchImpl as typeof fetch, log });
    expect(typeof stop).toBe("function"); // rendu tout de suite, sans attendre la lecture
    await vi.advanceTimersByTimeAsync(0);

    state.left = new TypeError(`fetch failed for Bearer ${KEY}`);
    await vi.advanceTimersByTimeAsync(CREDITS_CHECK_MS);
    await vi.advanceTimersByTimeAsync(CREDITS_CHECK_MS);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    // Une seule ligne pour la panne, masquée ; le dernier solde connu tient.
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/injoignable : TypeError: fetch failed for Bearer \*\*\*/);
    expect(lines.join("\n")).not.toContain(KEY);
    expect(lastCreditBalance()).toBe(5);
    expect(aiStatus()).toBe("ok");
    await expect(refreshCredits()).resolves.toBeNull(); // lu il y a moins de 15 s : la dernière valeur (illisible)
  });

  it("sans surveillance lancée (tests, scripts), refreshCredits ne fait aucun appel", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    try {
      await expect(refreshCredits()).resolves.toBeNull();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("solde sous le seuil : aucune lecture ne part, la fiche échoue en closed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await watchWith(balanceFetch({ left: 0.26 }));
    const { client, calls } = fakeClient([{}]);
    await expect(readCode(REPOS, { client })).rejects.toMatchObject({ code: "closed", reason: "credits" });
    expect(calls).toHaveLength(0);
  });

  it("réponse tronquée (finish_reason length), solde relu sous le seuil : closed sans relance", async () => {
    const warns: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => void warns.push(a.join(" ")));
    const state = { left: 5 as number | Error };
    const fetchImpl = balanceFetch(state);
    await watchWith(fetchImpl);

    // Ce que fait OpenRouter avec un crédit bas : max_tokens raboté, réponse coupée, pas de 402.
    state.left = 0.3;
    const { client, calls } = fakeClient([{ stop: "length", body: { readings: [] } }]);
    await expect(readCode(REPOS, { client })).rejects.toMatchObject({ code: "closed", reason: "credits" });
    expect(calls).toHaveLength(1); // pas de relance qui brûlerait le reste du crédit
    expect(fetchImpl).toHaveBeenCalledTimes(2); // le solde est relu avant de décider
    expect(aiStatus()).toBe("credits");
    expect(lastCreditBalance()).toBeCloseTo(0.3, 9);
    expect(aiStatus()).toBe("credits");
    expect(warns.some((w) => /réponse tronquée/.test(w))).toBe(true);
    expect(warns.join("\n")).not.toContain(KEY);
  });

  it("réponse tronquée avec un solde suffisant : sortie invalide ordinaire, le commissariat ne ferme pas un instant", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = balanceFetch({ left: 5 });
    await watchWith(fetchImpl);
    const { client, calls } = fakeClient([{ stop: "length", body: {} }]);
    const statuses: string[] = [];
    const spy = { ...client, complete: (...a: Parameters<typeof client.complete>) => (statuses.push(aiStatus()), client.complete(...a)) };
    await expect(readCode(REPOS, { client: spy })).resolves.toBeNull();
    expect(calls).toHaveLength(2); // une relance, puis null : la fiche sortira sans TEC, dégradée
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(statuses).toEqual(["ok", "ok"]);
    expect(aiStatus()).toBe("ok");
  });

  it("réponse tronquée, solde illisible : rien ne confirme un crédit bas, le commissariat reste ouvert", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const state = { left: 5 as number | Error };
    await watchWith(balanceFetch(state));
    state.left = new TypeError("fetch failed");
    const { client, calls } = fakeClient([{ stop: "length", body: {} }]);
    await expect(readCode(REPOS, { client })).resolves.toBeNull();
    expect(calls).toHaveLength(2);
    expect(aiStatus()).toBe("ok");
  });

  it("sortie illisible : le solde est relu ; sous le seuil, closed au lieu d'une fiche sans lecture", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const state = { left: 5 as number | Error };
    const fetchImpl = balanceFetch(state);
    await watchWith(fetchImpl);
    state.left = 0.2;
    const { client, calls } = fakeClient([{ raw: '{"readings": [' }]);
    await expect(readCode(REPOS, { client })).rejects.toMatchObject({ code: "closed", reason: "credits" });
    expect(calls).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("sortie illisible avec un solde suffisant : panne ordinaire, relance puis null", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = balanceFetch({ left: 5 });
    await watchWith(fetchImpl);
    const { client, calls } = fakeClient([{ raw: "{" }, { raw: "{" }]);
    await expect(readCode(REPOS, { client })).resolves.toBeNull();
    expect(calls).toHaveLength(2);
    // Deux sorties invalides, une seule relecture : la seconde tombe dans les 15 s.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(aiStatus()).toBe("ok");
  });

  it("un 402 demande aussi une relecture, et un solde suffisant le dément", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = balanceFetch({ left: 5 });
    await watchWith(fetchImpl);
    const { client } = fakeClient([{ error: new ChatHttpError(402, "Insufficient credits") }]);
    await expect(readCode(REPOS, { client })).rejects.toMatchObject({ code: "closed" });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(aiStatus()).toBe("ok");
    // Sans relecture possible, le 402 garde le commissariat fermé 10 minutes.
    noteCreditsExhausted();
    expect(aiStatus()).toBe("credits");
  });
});
