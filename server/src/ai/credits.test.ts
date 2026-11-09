import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiStatus, resetBudgetForTests } from "./budget";
import { checkOpenRouterCredits } from "./credits";

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
  resetBudgetForTests();
  if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = savedKey;
});

describe("solde OpenRouter au démarrage", () => {
  it("interroge /credits avec la clé en en-tête et avertit sous 2 $", async () => {
    const fetchImpl = creditsFetch(10, 9.74);
    const { lines, log } = logger();
    const left = await checkOpenRouterCredits({ key: KEY, fetchImpl: fetchImpl as typeof fetch, log });
    expect(left).toBeCloseTo(0.26, 9);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/credits");
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${KEY}`);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/crédit OpenRouter bas : 0\.26 \$/);
    expect(lines.join("\n")).not.toContain(KEY);
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
