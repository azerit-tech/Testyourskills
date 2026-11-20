// La proposition sous sa fiche (SPEC §18.100), de bout en bout : cherchée pendant la
// lecture, rangée avec la fiche, rendue à sa personne seule, « Non » qui la retire,
// « Oui » qui relance la fiche et verse le lien au registre de l'App. Faux GitHub,
// faux LinkedIn : aucun appel réel.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { JobState, Proposal } from "../../shared/types";
import { CAMILLE_URL, postCard, setupEntry, type EntryCtx } from "./entry/testing";
import type { PersonHints } from "./match/github";
import type { GithubHints } from "./match/linkedin";
import { PROPOSE_WAIT_MS } from "./pipeline";
import type { RegistryPort } from "./registry/index";

const GH: Proposal = { kind: "github", login: "camille-dev", name: "Camille", avatarUrl: "https://avatars.example/camille-dev", sure: false };
const LI: Proposal = { kind: "linkedin", url: CAMILLE_URL, name: "Camille Ardent", headline: "Backend · Paysolde", sure: false };

const ctxs: EntryCtx[] = [];
afterEach(() => {
  while (ctxs.length) ctxs.pop()!.store.close();
  vi.restoreAllMocks();
});

interface Opts {
  github?: (p: PersonHints) => Promise<Proposal | null>;
  linkedin?: (gh: GithubHints) => Promise<Proposal | null>;
}

function setup(o: Opts = {}) {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const asked = { github: [] as PersonHints[], linkedin: [] as GithubHints[] };
  const links: unknown[] = [];
  const registry = { recordLink: (l: unknown) => void links.push(l), recordAccounts: () => {} } as unknown as RegistryPort;
  const ctx = setupEntry({
    people: null,
    app: {
      registry,
      propose: {
        github: async (p) => (asked.github.push(p), o.github ? o.github(p) : GH),
        linkedin: async (gh) => (asked.linkedin.push(gh), o.linkedin ? o.linkedin(gh) : LI),
      },
    },
  });
  ctxs.push(ctx);
  return { ctx, asked, links };
}

async function state(ctx: EntryCtx, id: string, token?: string) {
  const res = await ctx.app.request(`/api/card/${id}`, { headers: token ? { "x-card-token": token } : {} });
  return (await res.json()) as JobState;
}
const proposeOf = (s: JobState) => (s.state === "done" && s.kind === "card" ? (s.propose ?? null) : null);

function say(ctx: EntryCtx, id: string, body: unknown, token?: string, origin = "https://skills.test") {
  return ctx.app.request(`/api/card/${id}/propose`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, ...(token ? { "x-card-token": token } : {}) },
    body: JSON.stringify(body),
  });
}

describe("une fiche LinkedIn seule : « C'est ton GitHub ? »", () => {
  it("cherché avec le nom, l'adresse et les employeurs du profil ; rendu à sa personne seule", async () => {
    const { ctx, asked } = setup();
    const { json } = await postCard(ctx, { linkedin: CAMILLE_URL });
    expect(ctx.store.getCard(json.id)!.source).toBe("linkedin");
    expect(asked.github).toHaveLength(1);
    expect(asked.github[0]).toMatchObject({ name: "Camille Ardent", url: CAMILLE_URL });
    expect(asked.github[0]!.companies.length).toBeGreaterThan(0);
    expect(proposeOf(await state(ctx, json.id, json.deleteToken))).toEqual(GH);
    // Le visiteur, le lien partagé : rien.
    expect(proposeOf(await state(ctx, json.id))).toBeNull();
    expect(proposeOf(await state(ctx, json.id, "faux-jeton"))).toBeNull();
  });

  it("« Non » : elle ne revient plus ; seul qui tient la fiche, depuis le site, peut le dire", async () => {
    const { ctx } = setup();
    const { json } = await postCard(ctx, { linkedin: CAMILLE_URL });
    expect((await say(ctx, json.id, { answer: "no" })).status).toBe(403);
    expect((await say(ctx, json.id, { answer: "no" }, json.deleteToken, "https://ailleurs.test")).status).toBe(403);
    expect((await say(ctx, json.id, { answer: "yes" }, json.deleteToken)).status).toBe(400);
    expect(proposeOf(await state(ctx, json.id, json.deleteToken))).toEqual(GH);
    expect((await say(ctx, json.id, { answer: "no" }, json.deleteToken)).status).toBe(200);
    expect(proposeOf(await state(ctx, json.id, json.deleteToken))).toBeNull();
  });

  it("« Oui » : la fiche repart avec ce GitHub, le dossier la remplace, le lien va au registre (trouvé, force 1)", async () => {
    const { ctx, links } = setup();
    const first = await postCard(ctx, { linkedin: CAMILLE_URL });
    const res = await ctx.app.request("/api/card", {
      method: "POST",
      headers: { "content-type": "application/json", "x-card-token": first.json.deleteToken!, origin: "https://skills.test" },
      body: JSON.stringify({ lang: "fr", login: "camille-dev", linkedin: CAMILLE_URL, from: first.json.id }),
    });
    expect(res.status).toBe(202);
    const { id } = (await res.json()) as { id: string };
    await ctx.pipeline.wait(id);
    // Ce faux LinkedIn ne relit pas le profil d'un GitHub : la fiche qui repart porte le pseudo, comme « Ajoute ton GitHub ».
    expect(ctx.store.loginOf(ctx.store.getCard(id)!)).toBe("camille-dev");
    expect(links).toContainEqual({ login: "camille-dev", url: CAMILLE_URL, strength: 1, step: "proposition_oui" });
    expect(ctx.store.listEvents("proposal_yes")).toHaveLength(1);
    // L'ancienne adresse montre le dossier : plus rien à proposer.
    expect(proposeOf(await state(ctx, first.json.id, first.json.deleteToken))).toBeNull();
  });

  it("un autre GitHub que celui proposé : rien au registre", async () => {
    const { ctx, links } = setup();
    const first = await postCard(ctx, { linkedin: CAMILLE_URL });
    const res = await ctx.app.request("/api/card", {
      method: "POST",
      headers: { "content-type": "application/json", "x-card-token": first.json.deleteToken!, origin: "https://skills.test" },
      body: JSON.stringify({ lang: "fr", login: "quelqu-un", linkedin: CAMILLE_URL, from: first.json.id }),
    });
    await ctx.pipeline.wait(((await res.json()) as { id: string }).id);
    expect(links).toEqual([]);
  });

  it("une recherche qui traîne : la fiche sort sans elle, à une seconde au plus", async () => {
    const { ctx } = setup({ github: () => new Promise(() => {}) });
    const t0 = Date.now();
    const { json } = await postCard(ctx, { linkedin: CAMILLE_URL });
    expect(Date.now() - t0).toBeLessThan(PROPOSE_WAIT_MS + 800);
    expect(ctx.store.getCard(json.id)).not.toBeNull();
    expect(proposeOf(await state(ctx, json.id, json.deleteToken))).toBeNull();
  });

  it("un compte masqué par son propriétaire n'est jamais proposé", async () => {
    const { ctx } = setup();
    ctx.store.claimOwner("camille-dev", 77);
    ctx.store.setOwnerHidden("camille-dev", true);
    const { json } = await postCard(ctx, { linkedin: CAMILLE_URL });
    expect(proposeOf(await state(ctx, json.id, json.deleteToken))).toBeNull();
  });

  it("une dénonciation ne cherche rien", async () => {
    const { ctx, asked } = setup();
    const mine = await postCard(ctx, { login: "gold-dev" });
    await postCard(ctx, { linkedin: CAMILLE_URL, denouncedBy: mine.json.id });
    expect(asked.github).toHaveLength(0);
  });

  it("supprimée avec la fiche", async () => {
    const { ctx } = setup();
    const { json } = await postCard(ctx, { linkedin: CAMILLE_URL });
    ctx.store.deleteGroup(json.id);
    expect(ctx.store.db.prepare(`SELECT COUNT(*) AS n FROM proposals`).get()).toEqual({ n: 0 });
  });
});

describe("une fiche GitHub seule : « C'est ton LinkedIn ? »", () => {
  it("cherché quand rien n'a donné le LinkedIn, rendu à sa personne", async () => {
    const { ctx, asked } = setup();
    const { json } = await postCard(ctx, { login: "camille-dev" });
    expect(asked.linkedin).toEqual([{ login: "camille-dev", name: null, company: null, location: null, blog: null, bio: null }]);
    expect(proposeOf(await state(ctx, json.id, json.deleteToken))).toEqual(LI);
    expect(proposeOf(await state(ctx, json.id))).toBeNull();
  });

  it("« Ajoute ton LinkedIn » avec un lien : rien à chercher", async () => {
    const { ctx, asked } = setup();
    await postCard(ctx, { login: "camille-dev", linkedin: CAMILLE_URL });
    expect(asked.linkedin).toHaveLength(0);
  });
});
