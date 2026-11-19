// Qui s'est connecté ici (SPEC §18.85) : le serveur rend sa fiche, le navigateur la
// retient comme « Ma fiche ». Sans navigateur ni serveur.
import { afterEach, describe, expect, it, vi } from "vitest";

const CARD = { id: "abc123", login: "leamd", overall: 76 };

async function page(o: { cookie?: string; mine?: object | null; answer?: unknown; search?: string; status?: number }) {
  vi.resetModules();
  const kept = new Map<string, string>();
  if (o.mine) kept.set("tys_mine", JSON.stringify(o.mine));
  const asked: string[] = [];
  let told = 0;
  vi.stubGlobal("localStorage", { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) });
  vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  vi.stubGlobal("document", { cookie: o.cookie ?? "" });
  vi.stubGlobal("window", {
    location: { href: `https://skills.test/${o.search ?? ""}`, search: o.search ?? "", origin: "https://skills.test" },
    history: { state: null, replaceState: () => undefined },
    dispatchEvent: () => (told++, true),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      asked.push(url);
      return new Response(JSON.stringify(o.answer ?? { card: null }), { status: o.status ?? 200 });
    }),
  );
  const api = await import("./entryApi");
  const session = await import("./session");
  return { api, session, asked, told: () => told };
}

afterEach(() => vi.unstubAllGlobals());

describe("la fiche de qui s'est connecté", () => {
  it("sans le témoin tys_known : aucune demande", async () => {
    const p = await page({ cookie: "tys_bid=x; autre=tys_known" });
    await p.api.syncMine();
    expect(p.asked).toEqual([]);
    expect(p.session.myCard()).toBeNull();
  });

  it("le témoin est là : la fiche rendue devient « Ma fiche », la page en est prévenue, une seule demande", async () => {
    const p = await page({ cookie: "tys_bid=x; tys_known=1", answer: { card: CARD } });
    await Promise.all([p.api.syncMine(), p.api.syncMine()]);
    expect(p.asked).toEqual(["/api/entry/me"]);
    expect(p.session.myCard()).toEqual(CARD);
    expect(p.told()).toBeGreaterThan(0);
  });

  it("la fiche que le navigateur retient déjà passe devant ; la même y gagne son pseudo", async () => {
    const other = await page({ cookie: "tys_known=1", mine: { id: "zzz999", login: null, overall: 50 }, answer: { card: CARD } });
    await other.api.syncMine();
    expect(other.session.myCard()).toEqual({ id: "zzz999", login: null, overall: 50 });
    const same = await page({ cookie: "tys_known=1", mine: { id: CARD.id, login: null, overall: 70 }, answer: { card: CARD } });
    await same.api.syncMine();
    expect(same.session.myCard()).toEqual(CARD);
  });

  it("aucune fiche, réponse illisible, serveur en panne : rien ne change", async () => {
    for (const o of [{ answer: { card: null } }, { answer: { card: { id: 3 } } }, { answer: "non", status: 500 }]) {
      const p = await page({ cookie: "tys_known=1", ...o });
      await p.api.syncMine();
      expect(p.session.myCard()).toBeNull();
      expect(p.told()).toBe(0);
    }
  });

  it("en démo : rien n'est demandé", async () => {
    const p = await page({ cookie: "tys_known=1", search: "?mock=1", answer: { card: CARD } });
    await p.api.syncMine();
    expect(p.asked).toEqual([]);
  });
});
