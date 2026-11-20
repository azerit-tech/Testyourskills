// « J'ai trouvé ton LinkedIn » (SPEC §18.113) : au retour de GitHub, son LinkedIn se
// cherche par la recherche des propositions (§18.100) ; l'échange du pseudo le rend,
// la fiche lancée avec lui va au compte et le lien au registre.

import { afterEach, describe, expect, it, vi } from "vitest";
import { closeAll, githubIn, rows, setupAccount, type AccountSetup } from "../accountTesting";
import type { RegistryPort } from "../registry/index";
import { cookiesOf, postCard } from "./testing";

afterEach(closeAll);

const URL_LI = "https://www.linkedin.com/in/camille-ardent";
const FOUND = { kind: "linkedin" as const, url: URL_LI, name: "Camille Ardent", headline: "Dev chez Ardent", sure: false };

function setup(o: AccountSetup & { known?: boolean } = {}) {
  const finder = vi.fn(async () => FOUND);
  const registry = {
    linkedinOf: vi.fn(async () => (o.known ? { url: URL_LI, strength: 2 } : null)),
    githubOf: vi.fn(async () => null),
    profileOf: vi.fn(async () => null),
    photoOf: vi.fn(async () => null),
    namesakes: vi.fn(async () => []),
    linkedinOfEmail: vi.fn(async () => null),
    recordLink: vi.fn(),
    recordAccounts: vi.fn(),
    recordProfile: vi.fn(),
  } satisfies RegistryPort;
  const ctx = setupAccount({ ghUser: { login: "camille-dev", id: 4242, name: "Camille Ardent" }, ...o, app: { propose: { linkedin: finder }, registry } });
  return { ctx, finder, registry };
}

async function exchange(ctx: ReturnType<typeof setupAccount>, jar: string) {
  const r = await ctx.app.request("/api/entry/github", { headers: { cookie: jar } });
  return { body: (await r.json()) as { login: string; found?: { url: string; name: string; headline: string } }, jar: cookiesOf(r, jar) };
}

describe("son LinkedIn trouvé avant le jugement", () => {
  it("trouvé : rendu à l'échange du pseudo ; la fiche lancée avec lui va au compte, le lien au registre", async () => {
    const { ctx, finder, registry } = setup();
    const gh = await githubIn(ctx);
    const { body, jar } = await exchange(ctx, gh.jar);
    expect(body).toEqual({ signedIn: true, login: "camille-dev", found: { url: URL_LI, name: "Camille Ardent", headline: "Dev chez Ardent" } });
    expect(finder).toHaveBeenCalledWith({ login: "camille-dev", name: "Camille Ardent", company: null, location: null, blog: null, bio: null }, expect.anything());
    const card = await postCard(ctx, { login: body.login, linkedin: URL_LI }, jar);
    expect(rows(ctx)[0]!.card_id).toBe(card.json.id);
    expect(registry.recordLink).toHaveBeenCalledWith({ login: "camille-dev", url: URL_LI, strength: 1, step: "proposition_oui" });
  });

  it("« Ce n'est pas moi » : la fiche GitHub seule, au compte, sans LinkedIn cherché de nouveau dessous", async () => {
    const { ctx, finder, registry } = setup();
    const gh = await githubIn(ctx);
    const { body, jar } = await exchange(ctx, gh.jar);
    const card = await postCard(ctx, { login: body.login, noLinkedin: true }, jar);
    expect(rows(ctx)[0]!.card_id).toBe(card.json.id);
    expect(finder).toHaveBeenCalledTimes(1);
    expect(registry.recordLink).not.toHaveBeenCalled();
  });

  it("un autre LinkedIn que celui montré : la fiche n'est pas liée, rien au registre", async () => {
    const { ctx, registry } = setup();
    const gh = await githubIn(ctx);
    const { body, jar } = await exchange(ctx, gh.jar);
    await postCard(ctx, { login: body.login, linkedin: "https://www.linkedin.com/in/quelqu-un-d-autre" }, jar);
    expect(rows(ctx)[0]!.card_id).toBeNull();
    expect(registry.recordLink).not.toHaveBeenCalled();
  });

  it("déjà connu : affiché sur son GitHub, ou au registre de l'App, rien n'est proposé", async () => {
    const shown = setup({ ghSocial: [{ provider: "linkedin", url: URL_LI }] });
    const a = await exchange(shown.ctx, (await githubIn(shown.ctx)).jar);
    expect(a.body.found).toBeUndefined();
    expect(shown.finder).not.toHaveBeenCalled();
    const known = setup({ known: true });
    const b = await exchange(known.ctx, (await githubIn(known.ctx)).jar);
    expect(b.body.found).toBeUndefined();
  });

  it("sans nom sur GitHub : rien n'est cherché", async () => {
    const { ctx, finder } = setup({ ghUser: { login: "camille-dev", id: 4242 } });
    const { body } = await exchange(ctx, (await githubIn(ctx)).jar);
    expect(body.found).toBeUndefined();
    expect(finder).not.toHaveBeenCalled();
  });
});
