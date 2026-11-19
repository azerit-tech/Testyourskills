// Qui est là (SPEC §18.90, §18.91) : un seul appel, /api/me ; le compte d'abord, le
// repli sans droit de `tys_who` ensuite. Sa fiche devient « Ma fiche ». Sans navigateur ni serveur.
import { afterEach, describe, expect, it, vi } from "vitest";

const CARD = { id: "abc123", login: "leamd", overall: 76 };
/** Ce que /api/me rend pour un compte LinkedIn qui a cette fiche. */
const ACCOUNT = { login: null, hidden: false, cardId: CARD.id, cardLogin: CARD.login, overall: CARD.overall, avatarUrl: null, initial: "L", sources: ["linkedin"] };
/** Le repli de `tys_who` : pas de compte, la fiche seulement. */
const KNOWN = { ...ACCOUNT, sources: [], known: true };

async function page(o: { mine?: object | null; answer?: unknown; search?: string; status?: number }) {
  vi.resetModules();
  const kept = new Map<string, string>();
  if (o.mine) kept.set("tys_mine", JSON.stringify(o.mine));
  const asked: string[] = [];
  let told = 0;
  vi.stubGlobal("localStorage", { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) });
  vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  vi.stubGlobal("document", { cookie: "" });
  vi.stubGlobal("window", {
    location: { href: `https://skills.test/${o.search ?? ""}`, search: o.search ?? "", origin: "https://skills.test" },
    history: { state: null, replaceState: () => undefined },
    dispatchEvent: (e: Event) => (e.type === "tys:mine" && told++, true),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      asked.push(url);
      return new Response(JSON.stringify(o.answer ?? null), { status: o.status ?? 200 });
    }),
  );
  const api = await import("./entryApi");
  const session = await import("./session");
  return { api, session, asked, told: () => told };
}

afterEach(() => vi.unstubAllGlobals());

describe("qui est là", () => {
  it("personne : une demande, /api/me, et rien ne change", async () => {
    const p = await page({ answer: null });
    await p.api.syncMine();
    expect(p.asked).toEqual(["/api/me"]);
    expect(p.session.myCard()).toBeNull();
  });

  it("un compte avec sa fiche : elle devient « Ma fiche », la page en est prévenue, une seule demande", async () => {
    const p = await page({ answer: ACCOUNT });
    await Promise.all([p.api.syncMine(), p.api.syncMine()]);
    expect(p.asked).toEqual(["/api/me"]);
    expect(p.session.myCard()).toEqual(CARD);
    expect(p.told()).toBeGreaterThan(0);
  });

  it("le compte passe devant la fiche que le navigateur retient (faite ailleurs, ou plus vieille)", async () => {
    const p = await page({ mine: { id: "zzz999", login: null, overall: 50 }, answer: ACCOUNT });
    await p.api.syncMine();
    expect(p.session.myCard()).toEqual(CARD);
  });

  it("le repli sans compte : la fiche que le navigateur retient passe devant ; la même y gagne son pseudo", async () => {
    const other = await page({ mine: { id: "zzz999", login: null, overall: 50 }, answer: KNOWN });
    await other.api.syncMine();
    expect(other.session.myCard()).toEqual({ id: "zzz999", login: null, overall: 50 });
    const same = await page({ mine: { id: CARD.id, login: null, overall: 70 }, answer: KNOWN });
    await same.api.syncMine();
    expect(same.session.myCard()).toEqual(CARD);
    const none = await page({ answer: KNOWN });
    await none.api.syncMine();
    expect(none.session.myCard()).toEqual(CARD);
  });

  it("compte sans fiche, réponse illisible, serveur en panne : rien ne change", async () => {
    for (const o of [{ answer: { ...ACCOUNT, cardId: null } }, { answer: { cardId: 3, sources: [] } }, { answer: "non", status: 500 }]) {
      const p = await page(o);
      await p.api.syncMine();
      expect(p.session.myCard()).toBeNull();
      expect(p.told()).toBe(0);
    }
  });

  it("en démo : rien n'est demandé", async () => {
    const p = await page({ search: "?mock=1", answer: ACCOUNT });
    await p.api.syncMine();
    expect(p.asked).toEqual([]);
  });
});
