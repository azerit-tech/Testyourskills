import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Store } from "../db";
import { aiAvailable, aiCostToday, costOf, recordUsage, resetBudgetForTests, useBudgetDb, withinBudget } from "./budget";
import { readCode } from "./readCode";
import { fakeClient } from "./testing";

const saved = { key: process.env.OPENROUTER_API_KEY, budget: process.env.AI_DAILY_BUDGET_USD };

beforeEach(() => resetBudgetForTests());
afterEach(() => {
  if (saved.key === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = saved.key;
  if (saved.budget === undefined) delete process.env.AI_DAILY_BUDGET_USD;
  else process.env.AI_DAILY_BUDGET_USD = saved.budget;
});

describe("budget", () => {
  it("calcule le coût Haiku 4.5 avec le cache", () => {
    // 1 M en entrée à 1 $, 1 M en lecture de cache à 0,1 $, 1 M en sortie à 5 $.
    // prompt_tokens inclut les tokens lus en cache.
    const usd = costOf("anthropic/claude-haiku-4.5", {
      prompt_tokens: 2e6,
      completion_tokens: 1e6,
      prompt_tokens_details: { cached_tokens: 1e6, cache_write_tokens: 0 },
    });
    expect(usd).toBeCloseTo(6.1, 6);
  });

  it("prend le coût d'OpenRouter tel quel quand il est donné", () => {
    expect(costOf("anthropic/claude-haiku-4.5", { prompt_tokens: 1e6, completion_tokens: 1e6, cost: 0.0123 })).toBe(0.0123);
  });

  it("cumule la consommation du jour", () => {
    recordUsage("anthropic/claude-haiku-4.5", { prompt_tokens: 1100, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 1000 } });
    recordUsage("anthropic/claude-haiku-4.5", { prompt_tokens: 100, completion_tokens: 50 });
    const t = aiCostToday();
    expect(t.calls).toBe(2);
    expect(t.inputTokens).toBe(1200);
    expect(t.outputTokens).toBe(100);
    expect(t.usd).toBeGreaterThan(0);
  });

  it("aiAvailable exige la clé et un budget restant", () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(aiAvailable()).toBe(false);
    process.env.OPENROUTER_API_KEY = "test";
    process.env.AI_DAILY_BUDGET_USD = "0.01";
    expect(aiAvailable()).toBe(true);
    recordUsage("anthropic/claude-haiku-4.5", { prompt_tokens: 0, completion_tokens: 10_000 }); // 0,05 $
    expect(aiAvailable()).toBe(false);
  });

  it("persiste la dépense du jour : fermer et rouvrir la base ne remet pas le compteur à zéro", () => {
    const dir = mkdtempSync(join(tmpdir(), "tys-budget-"));
    const path = join(dir, "cards.db");
    process.env.AI_DAILY_BUDGET_USD = "0.05";
    const a = new Store(path);
    useBudgetDb(a.db);
    recordUsage("anthropic/claude-haiku-4.5", { prompt_tokens: 1000, completion_tokens: 0, cost: 0.03 });
    recordUsage("anthropic/claude-haiku-4.5", { prompt_tokens: 500, completion_tokens: 20, cost: 0.01 });
    useBudgetDb(null);
    a.close();

    // « Redémarrage » : mémoire vide, nouvelle connexion sur le même fichier.
    resetBudgetForTests();
    expect(aiCostToday().usd).toBe(0);
    const b = new Store(path);
    useBudgetDb(b.db);
    const t = aiCostToday();
    expect(t.usd).toBeCloseTo(0.04, 9);
    expect(t).toMatchObject({ inputTokens: 1500, outputTokens: 20, calls: 2 });
    expect(withinBudget()).toBe(true);
    // Le cumul repart de la valeur persistée, et le plafond tient après le redémarrage.
    recordUsage("anthropic/claude-haiku-4.5", { prompt_tokens: 100, completion_tokens: 0, cost: 0.02 });
    expect(withinBudget()).toBe(false);
    const day = new Date().toISOString().slice(0, 10);
    expect(b.db.prepare(`SELECT * FROM ai_spend`).all()).toEqual([
      { day, usd: expect.closeTo(0.06, 9), input_tokens: 1600, output_tokens: 20, calls: 3 },
    ]);
    useBudgetDb(null);
    b.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("refuse l'IA au-delà du plafond persisté, même après un redémarrage", async () => {
    const store = new Store(":memory:");
    process.env.AI_DAILY_BUDGET_USD = "1";
    const day = new Date().toISOString().slice(0, 10);
    // Dépense laissée par un processus précédent.
    store.db.prepare(`INSERT INTO ai_spend (day, usd, input_tokens, output_tokens, calls) VALUES (?, 1.2, 0, 0, 40)`).run(day);
    // Hier ne compte pas : le jour reste le jour UTC.
    store.db.prepare(`INSERT INTO ai_spend (day, usd) VALUES ('2000-01-01', 99)`).run();
    useBudgetDb(store.db);
    expect(withinBudget()).toBe(false);
    const { client, calls } = fakeClient([{}]);
    const res = await readCode([{ repo: "r", activity: 1, files: [{ path: "a.ts", content: "export {}" }] }], { client });
    expect(res).toBeNull();
    expect(calls).toHaveLength(0);
    useBudgetDb(null);
    store.close();
  });

  it("garde le total en mémoire si la base devient illisible", () => {
    const store = new Store(":memory:");
    useBudgetDb(store.db);
    store.close();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    recordUsage("anthropic/claude-haiku-4.5", { prompt_tokens: 0, completion_tokens: 0, cost: 0.5 });
    expect(aiCostToday().usd).toBe(0.5);
    vi.restoreAllMocks();
  });

  it("n'appelle plus l'IA une fois le budget du jour dépassé", async () => {
    process.env.AI_DAILY_BUDGET_USD = "0";
    const { client, calls } = fakeClient([{}]);
    const res = await readCode([{ repo: "r", activity: 1, files: [{ path: "a.ts", content: "export {}" }] }], { client });
    expect(res).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
