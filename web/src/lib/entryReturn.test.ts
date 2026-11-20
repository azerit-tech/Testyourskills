// Le retour d'une connexion LinkedIn ou GitHub (SPEC §18.90) : jamais muet. Sans
// navigateur ni serveur : l'adresse et fetch sont de faux.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReturnPhase } from "./entryApi";

type Api = typeof import("./entryApi");

const LEA = { url: "https://www.linkedin.com/in/lea-martin-dev", name: "Léa Martin", headline: "Développeuse" };

/** Une page chargée à cette adresse, et ce que le serveur répond à chaque demande, dans l'ordre. */
async function page(search: string, answers: (unknown | Error)[] = []) {
  vi.resetModules();
  const replaced: string[] = [];
  const asked: string[] = [];
  vi.stubGlobal("window", {
    location: { href: `https://skills.test/c/abc${search}`, search, origin: "https://skills.test" },
    history: { state: null, replaceState: (_s: unknown, _t: string, url: string) => replaced.push(url) },
  });
  vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      asked.push(url);
      const next = answers.shift();
      if (next === undefined || next instanceof Error) throw next ?? new Error("plus de réponse prévue");
      return new Response(JSON.stringify(next), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
  const api: Api = await import("./entryApi");
  const seen: (ReturnPhase | null)[] = [];
  /** Attend la phase qui suit « finding ». */
  const settled = () =>
    new Promise<ReturnPhase | null>((resolve) => {
      const now = api.getReturn();
      if (now?.s !== "finding") return resolve(now);
      const off = api.subscribeReturn(() => {
        seen.push(api.getReturn());
        if (api.getReturn()?.s !== "finding") {
          off();
          resolve(api.getReturn());
        }
      });
    });
  return { api, replaced, asked, settled };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("le retour d'une connexion", () => {
  it("sans ?li= ni ?gh= : rien, aucune demande", async () => {
    const p = await page("?ref=x");
    expect(p.api.getReturn()).toBeNull();
    expect(p.api.returnPending()).toBe(false);
    expect(p.asked).toEqual([]);
    expect(p.replaced).toEqual([]);
  });

  it("?li=1 : l'attente tout de suite, l'adresse nettoyée, puis la fiche du profil sûr", async () => {
    const p = await page("?ref=x&li=1", [
      { signedIn: true, name: "Léa Martin", candidates: [], pending: true },
      { signedIn: true, name: "Léa Martin", auto: LEA, candidates: [] },
    ]);
    expect(p.api.returnPending()).toBe(true);
    expect(p.api.getReturn()).toMatchObject({ s: "finding", via: "linkedin" });
    expect(p.replaced).toEqual(["/c/abc?ref=x"]);
    // « pending » : le serveur cherche encore, on redemande sans rien montrer d'autre.
    expect(await p.settled()).toEqual({ s: "auto", name: "Léa Martin", url: LEA.url });
    expect(p.asked).toEqual(["/api/entry/linkedin", "/api/entry/linkedin"]);
  });

  it("rien de sûr : « C'est toi ? », trois profils au plus", async () => {
    const four = [1, 2, 3, 4].map((n) => ({ ...LEA, url: `${LEA.url}-${n}` }));
    const p = await page("?li=1", [{ signedIn: true, name: "Léa Martin", candidates: four }]);
    expect(await p.settled()).toEqual({ s: "pick", name: "Léa Martin", candidates: four.slice(0, 3) });
  });

  it("son GitHub à demander avant de juger (§18.111) : la question, avec le compte trouvé ou un champ", async () => {
    const gh = { login: "leamd", name: "Léa Martin", avatarUrl: "https://avatars.test/leamd" };
    const found = await page("?li=1", [{ signedIn: true, name: "Léa Martin", auto: LEA, candidates: [], ask: { candidate: gh } }]);
    expect(await found.settled()).toEqual({ s: "ask", name: "Léa Martin", url: LEA.url, candidate: gh });
    const field = await page("?li=1", [{ signedIn: true, name: "Léa Martin", auto: LEA, candidates: [], ask: { candidate: null } }]);
    expect(await field.settled()).toEqual({ s: "ask", name: "Léa Martin", url: LEA.url, candidate: null });
    // « C'est toi ? » d'abord : la question vient après son choix.
    const pick = await page("?li=1", [{ signedIn: true, name: "Léa Martin", candidates: [LEA], ask: { candidate: gh } }]);
    expect(await pick.settled()).toEqual({ s: "pick", name: "Léa Martin", candidates: [LEA], ask: { candidate: gh } });
    pick.api.askGithub(LEA.name, LEA.url, { candidate: gh });
    expect(pick.api.getReturn()).toEqual({ s: "ask", name: "Léa Martin", url: LEA.url, candidate: gh });
  });

  it("personne à ce nom, ou la recherche en panne : perdu, jamais un bloc revenu tel quel", async () => {
    const none = await page("?li=1", [{ signedIn: true, name: "Léa Martin", candidates: [] }]);
    expect(await none.settled()).toEqual({ s: "lost", via: "linkedin", why: "none" });
    const off = await page("?li=1", [{ signedIn: true, name: "Léa Martin", candidates: [], off: true }]);
    expect(await off.settled()).toEqual({ s: "lost", via: "linkedin", why: "none" });
  });

  it("la session n'est plus là (cookie refusé, quinze minutes passées) : la connexion n'a pas abouti", async () => {
    const p = await page("?li=1", [{ signedIn: false }]);
    expect(await p.settled()).toEqual({ s: "lost", via: "linkedin", why: "error" });
  });

  it("le réseau ne répond pas : deux nouvelles demandes, puis perdu", async () => {
    vi.useFakeTimers();
    const p = await page("?li=1", [new Error("réseau"), new Error("réseau"), new Error("réseau")]);
    const done = p.settled();
    await vi.advanceTimersByTimeAsync(4000);
    expect(await done).toEqual({ s: "lost", via: "linkedin", why: "error" });
    expect(p.asked).toHaveLength(3);
  });

  it("le serveur cherche toujours après 110 s : perdu, la recherche s'arrête", async () => {
    vi.useFakeTimers();
    const pending = { signedIn: true, name: "Léa Martin", candidates: [], pending: true };
    const p = await page("?li=1", []);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 20_000));
        return new Response(JSON.stringify(pending));
      }),
    );
    p.api.getReturn();
    const done = p.settled();
    await vi.advanceTimersByTimeAsync(121_000);
    expect(await done).toEqual({ s: "lost", via: "linkedin", why: "none" });
  });

  it("?li=error : la connexion n'a pas abouti, sans demande ; ?li=cancel : rien, les boutons attendent", async () => {
    const error = await page("?li=error");
    expect(error.api.getReturn()).toEqual({ s: "lost", via: "linkedin", why: "error" });
    expect(error.asked).toEqual([]);
    expect(error.replaced).toEqual(["/c/abc"]);
    const cancel = await page("?li=cancel");
    expect(cancel.api.getReturn()).toBeNull();
    expect(cancel.replaced).toEqual(["/c/abc"]);
    // Une valeur de démonstration n'a aucun effet hors démo.
    expect((await page("?li=auto")).api.getReturn()).toEqual({ s: "lost", via: "linkedin", why: "error" });
  });

  it("?gh=1 : le pseudo rendu une fois par le serveur, sinon la connexion n'a pas abouti", async () => {
    const ok = await page("?gh=1", [{ signedIn: true, login: "leamd" }]);
    expect(ok.api.getReturn()).toMatchObject({ s: "finding", via: "github" });
    expect(await ok.settled()).toEqual({ s: "github", login: "leamd" });
    expect(ok.asked).toEqual(["/api/entry/github"]);
    const ko = await page("?gh=1", [{ signedIn: false }]);
    expect(await ko.settled()).toEqual({ s: "lost", via: "github", why: "error" });
    expect((await page("?gh=error")).api.getReturn()).toEqual({ s: "lost", via: "github", why: "error" });
  });

  it("?gh=1 avec son LinkedIn trouvé (§18.113) : rendu tel quel ; incomplet, ignoré", async () => {
    const found = { url: "https://www.linkedin.com/in/lea-martin-dev", name: "Léa Martin", headline: "Dev" };
    const ok = await page("?gh=1", [{ signedIn: true, login: "leamd", found: { ...found, extra: 1 } }]);
    expect(await ok.settled()).toEqual({ s: "github", login: "leamd", found });
    const bad = await page("?gh=1", [{ signedIn: true, login: "leamd", found: { url: found.url } }]);
    expect(await bad.settled()).toEqual({ s: "github", login: "leamd" });
  });

  it("consommé une fois : la fiche partie ou la phrase affichée, le retour ne se rejoue pas", async () => {
    const p = await page("?li=1", [{ signedIn: true, name: "Léa Martin", auto: LEA, candidates: [] }]);
    await p.settled();
    let told = 0;
    p.api.subscribeReturn(() => told++);
    p.api.doneReturn();
    expect(p.api.getReturn()).toBeNull();
    expect(told).toBe(1);
    p.api.doneReturn();
    expect(told).toBe(1);
    expect(p.asked).toHaveLength(1);
  });

  it("un seul formulaire porte le retour ; démonté, le suivant le reprend où il en est", async () => {
    const p = await page("?li=1", [{ signedIn: true, name: "Léa Martin", candidates: [LEA] }]);
    const first = {};
    const second = {};
    expect(p.api.leadReturn(first)).toBe(true);
    expect(p.api.leadReturn(second)).toBe(false);
    await p.settled();
    let told = 0;
    p.api.subscribeReturn(() => told++);
    // Le second ne rend rien qui ne soit à lui.
    p.api.releaseReturn(second);
    expect(told).toBe(0);
    p.api.releaseReturn(first);
    expect(told).toBe(1);
    expect(p.api.leadReturn(second)).toBe(true);
    expect(p.api.getReturn()).toMatchObject({ s: "pick" });
  });

  it("la barre de l'attente avance, puis ralentit, sans toucher le bout", async () => {
    const { api } = await page("");
    const at = [0, 2000, 8000, 30_000, 110_000].map(api.findPct);
    expect(at[0]).toBe(0);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(at[2]).toBe(80);
    expect(at[4]).toBeLessThan(100);
  });

  it("en démo : ?li=1 propose « C'est toi ? », ?li=none ne trouve personne, sans serveur", async () => {
    vi.useFakeTimers();
    const pick = await page("?mock=1&li=1");
    const a = pick.settled();
    await vi.advanceTimersByTimeAsync(2000);
    expect((await a)?.s).toBe("pick");
    const none = await page("?mock=1&li=none");
    const b = none.settled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(await b).toEqual({ s: "lost", via: "linkedin", why: "none" });
    expect(pick.asked.concat(none.asked)).toEqual([]);
  });
});
