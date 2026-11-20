// Le GitHub proposé sous une fiche LinkedIn seule (SPEC §18.100) : un appel, deux
// secondes au plus, un seul compte assez proche, sinon rien. Aucun appel réel :
// les réponses de GitHub sont celles relevées le 20 novembre 2026 pour
// « Jacques Mougeot » (aucun compte à ce nom complet, @jmougeot nommé « Jacques »,
// son site azerit.tech), puis des homonymes inventés.

import { afterEach, describe, expect, it, vi } from "vitest";
import { buildQuery, findGithubFor, loginsFromName, pickGithub, scoreGithub, type GithubAccount, type PersonHints } from "./github";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const JACQUES: PersonHints = { name: "Jacques Mougeot", url: "https://www.linkedin.com/in/jacquesmougeot", companies: ["Azerit", "École polytechnique"] };

const acct = (login: string, extra: Partial<GithubAccount> = {}): GithubAccount => ({
  login,
  name: null,
  avatarUrl: `https://avatars.example/${login}`,
  bio: null,
  company: null,
  websiteUrl: null,
  socialAccounts: [],
  ...extra,
});
const JMOUGEOT = acct("jmougeot", { name: "Jacques", websiteUrl: "https://www.azerit.tech", bio: "" });

type Gql = { query: string; variables: Record<string, string> };

/** Faux GitHub GraphQL : rend `reply(variables)`, compte les appels. */
function github(reply: (v: Record<string, string>) => unknown, opts: { delayMs?: number } = {}) {
  const calls: Gql[] = [];
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname !== "/graphql") return new Response("{}", { status: 404 });
    const body = JSON.parse(String(init?.body)) as Gql;
    calls.push(body);
    if (opts.delayMs) {
      await new Promise<void>((res, rej) => {
        const t = setTimeout(res, opts.delayMs);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          rej(init.signal!.reason);
        });
      });
    }
    return new Response(JSON.stringify(reply(body.variables)), { status: 200, headers: { "x-ratelimit-remaining": "4999", "x-ratelimit-resource": "graphql" } });
  });
  return calls;
}

/** La réponse de GitHub : `named` pour la recherche par nom, et le compte de chaque pseudo lu (null : il n'existe pas). */
function answer(v: Record<string, string>, named: GithubAccount[], byLogin: Record<string, GithubAccount>) {
  const data: Record<string, unknown> = { named: { nodes: named.map((a) => ({ __typename: "User", ...raw(a) })) } };
  const errors: unknown[] = [];
  for (const [k, login] of Object.entries(v)) {
    if (!k.startsWith("l")) continue;
    const a = byLogin[login.toLowerCase()];
    data[k] = a ? raw(a) : null;
    if (!a) errors.push({ type: "NOT_FOUND", path: [k], message: `Could not resolve to a User with the login of '${login}'.` });
  }
  return { data, errors };
}
const raw = (a: GithubAccount) => ({ ...a, socialAccounts: { nodes: a.socialAccounts } });

describe("les pseudos faits du nom", () => {
  it("complets d'abord, puis à l'initiale, sans accents", () => {
    expect(loginsFromName("Jacques Mougeot")).toEqual({
      full: ["jacquesmougeot", "jacques-mougeot", "mougeotjacques", "mougeot-jacques"],
      initial: ["jmougeot", "mougeotj", "j-mougeot"],
    });
    expect(loginsFromName("Éloïse Le Bihan").full).toContain("eloiselebihan");
    expect(loginsFromName("Jacques").full).toEqual([]);
  });

  it("une requête : la recherche par nom et sept pseudos au plus, le nom sans ce qui le suit", () => {
    const q = buildQuery("Jacques Mougeot, PhD | Azerit")!;
    expect(q.variables.q).toBe('"Jacques Mougeot" in:name type:user');
    expect(q.logins).toHaveLength(7);
    expect(q.logins).toContain("jmougeot");
    expect(q.query.match(/user\(login:/g)).toHaveLength(7);
  });
});

describe("la note d'un compte", () => {
  it("Jacques Mougeot → @jmougeot : l'initiale et le nom, son prénom, son employeur sur son site", () => {
    const s = scoreGithub(JACQUES, JMOUGEOT);
    expect(s.score).toBe(35 + 25 + 20);
    expect(s.sure).toBe(false);
    expect(pickGithub(JACQUES, [JMOUGEOT])).toEqual({ kind: "github", login: "jmougeot", name: "Jacques", avatarUrl: "https://avatars.example/jmougeot", sure: false });
  });

  it("ce LinkedIn sur son GitHub : sûr, quel que soit le nom", () => {
    const a = acct("zz-top", { name: "ZZ", socialAccounts: [{ provider: "LINKEDIN", url: "https://linkedin.com/in/jacquesmougeot/" }] });
    expect(scoreGithub(JACQUES, a)).toMatchObject({ sure: true });
    expect(pickGithub(JACQUES, [a, JMOUGEOT])).toMatchObject({ login: "zz-top", sure: true });
  });

  it("un autre LinkedIn sur son GitHub, ou un autre nom complet : écarté", () => {
    expect(scoreGithub(JACQUES, acct("jmougeot", { name: "Jacques", bio: "linkedin.com/in/someone-else" })).score).toBe(0);
    expect(scoreGithub(JACQUES, acct("jmougeot", { name: "Julien Mougeot" })).score).toBe(0);
  });

  it("le nom complet seul : proposé s'il est seul à le porter", () => {
    const a = acct("random-handle", { name: "Jacques Mougeot" });
    expect(pickGithub(JACQUES, [a])).toMatchObject({ login: "random-handle", sure: false });
  });

  it("un pseudo fait du nom sans nom ni employeur : trop peu", () => {
    expect(pickGithub(JACQUES, [acct("jmougeot")])).toBeNull();
    expect(pickGithub(JACQUES, [acct("jacquesmougeot")])).toBeNull();
  });

  it("des homonymes au même nom complet : aucun", () => {
    const camille = { name: "Camille Martin", url: "https://www.linkedin.com/in/camille-martin-42", companies: ["Paysolde"] };
    expect(pickGithub(camille, [acct("cmartin-dev", { name: "Camille Martin" }), acct("camimart", { name: "Camille Martin" })])).toBeNull();
    // L'employeur départage.
    expect(pickGithub(camille, [acct("cmartin-dev", { name: "Camille Martin", company: "@paysolde" }), acct("camimart", { name: "Camille Martin" })])).toMatchObject({ login: "cmartin-dev" });
  });

  it("un nom courant : le nom et le pseudo ne suffisent plus, il faut l'employeur", () => {
    const thomas = { name: "Thomas Martin", url: "https://www.linkedin.com/in/thomas-martin-x", companies: ["Qonto"] };
    const same = acct("martinthomas", { name: "Thomas Martin" });
    expect(pickGithub(thomas, [same], 1)).toMatchObject({ login: "martinthomas" });
    expect(pickGithub(thomas, [same], 95)).toBeNull();
    expect(pickGithub(thomas, [same, acct("applinh", { name: "Thomas Martin", company: "@qonto" })], 95)).toMatchObject({ login: "applinh" });
  });

  it("aucun candidat : rien", () => {
    expect(pickGithub(JACQUES, [])).toBeNull();
  });
});

describe("findGithubFor", () => {
  it("Jacques Mougeot : un appel GraphQL, @jmougeot proposé", async () => {
    const calls = github((v) => answer(v, [], { jmougeot: JMOUGEOT }));
    expect(await findGithubFor("ghp_t", JACQUES)).toMatchObject({ kind: "github", login: "jmougeot" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.variables.q).toBe('"Jacques Mougeot" in:name type:user');
  });

  it("des homonymes trouvés par le nom : rien", async () => {
    github((v) => answer(v, [acct("jm1", { name: "Jacques Mougeot" }), acct("jm2", { name: "Jacques Mougeot" })], {}));
    expect(await findGithubFor("ghp_t", JACQUES)).toBeNull();
  });

  it("rien à ce nom : rien", async () => {
    github((v) => answer(v, [], {}));
    expect(await findGithubFor("ghp_t", JACQUES)).toBeNull();
  });

  it("GitHub plus lent que deux secondes : rien, à deux secondes", async () => {
    github((v) => answer(v, [], { jmougeot: JMOUGEOT }), { delayMs: 5000 });
    const t0 = Date.now();
    expect(await findGithubFor("ghp_t", JACQUES, { budgetMs: 150 })).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("sans jeton, ou sans nom complet : aucun appel", async () => {
    const calls = github(() => ({ data: null }));
    expect(await findGithubFor("", JACQUES)).toBeNull();
    expect(await findGithubFor("ghp_t", { ...JACQUES, name: "Jacques" })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("GitHub en panne : rien, sans erreur", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await findGithubFor("ghp_t", JACQUES)).toBeNull();
  });
});
