// Le compte léger côté front (§18.91), rendu en chaîne : la pastille « Ma fiche » de la
// barre, et l'entrée connectée (« Voir ma fiche », « Refaire ma fiche · Se déconnecter »).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

interface World {
  lang?: "fr" | "en";
  /** Ce que la dernière visite a appris de /api/me (l'indice local du compte). */
  account?: { cardId: string | null; sources: string[]; avatarUrl: string | null; initial: string | null; known?: boolean; cardLogin?: string | null; cardLinkedin?: boolean };
  /** L'entrée ouverte par « Faire une autre fiche ». */
  another?: boolean;
  mine?: { id: string; login: string | null; overall: number };
  /** L'adresse de la page (un retour de connexion y porte ?li= ou ?gh=). */
  href?: string;
}

async function render(which: "topbar" | "entry" | "inline", { lang = "fr", account, mine, href = "https://skills.test/", another = false }: World = {}): Promise<string> {
  vi.resetModules();
  const local: Record<string, string> = { tys_lang: lang };
  if (account) local.tys_account = JSON.stringify(account);
  if (mine) local.tys_mine = JSON.stringify(mine);
  vi.stubGlobal("localStorage", { getItem: (k: string) => local[k] ?? null, setItem: () => undefined, removeItem: () => undefined });
  vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  const u = new URL(href);
  vi.stubGlobal("window", { location: { origin: u.origin, pathname: u.pathname, search: u.search, href }, matchMedia: () => ({ matches: false }), addEventListener: () => undefined, removeEventListener: () => undefined });
  vi.stubGlobal("navigator", { language: lang === "fr" ? "fr-FR" : "en-US" });
  const [{ LangProvider }, chrome, entry] = await Promise.all([import("../i18n"), import("./Chrome"), import("./EntryForm")]);
  const el = which === "topbar" ? createElement(chrome.TopBar) : createElement(entry.EntryForm, which === "inline" ? { variant: "inline", another } : { another });
  return renderToStaticMarkup(createElement(LangProvider, null, el));
}

const LI = { cardId: "Ab12345678", sources: ["linkedin"], avatarUrl: "https://skills.test/api/photo/x.jpg", initial: "C" };
const GH = { cardId: "Gh12345678", sources: ["github"], avatarUrl: null, initial: "L" };

afterEach(() => vi.unstubAllGlobals());

describe("la pastille « Ma fiche »", () => {
  it("connecté avec une fiche : la pastille, son visage, et le lien vers la fiche du compte", async () => {
    const html = await render("topbar", { account: LI, mine: { id: "Old0000001", login: null, overall: 40 } });
    expect(html).toMatch(/<a class="topbar-link topbar-mine" href="\/c\/Ab12345678"[^>]*><span class="topbar-face" aria-hidden="true"><img src="https:\/\/skills.test\/api\/photo\/x.jpg"[^>]*\/><\/span>Ma fiche<\/a>/);
    expect(html).not.toContain("Old0000001");
  });

  it("sans photo : l'initiale ; en anglais « My sheet »", async () => {
    const html = await render("topbar", { account: GH, lang: "en" });
    expect(html).toMatch(/<span class="topbar-face" aria-hidden="true">L<\/span>My sheet<\/a>/);
  });

  it("pas connecté, ou connecté sans fiche : pas de pastille", async () => {
    expect(await render("topbar")).not.toContain("topbar-mine");
    expect(await render("topbar", { account: { ...LI, cardId: null } })).not.toContain("topbar-mine");
    // La fiche en mémoire garde son lien texte d'avant.
    expect(await render("topbar", { mine: { id: "Ab12345678", login: null, overall: 40 } })).toMatch(/<a class="topbar-link" href="\/c\/Ab12345678"[^>]*>Ma fiche<\/a>/);
  });
});

describe("l'entrée connectée", () => {
  it("une fiche au compte : le rose « Voir ma fiche », dessous « Refaire ma fiche · Se déconnecter », plus les boutons de connexion", async () => {
    for (const which of ["entry", "inline"] as const) {
      const html = await render(which, { account: LI });
      expect(html).toMatch(/<a class="pill pill-big entry-mine" href="\/c\/Ab12345678">Voir ma fiche<\/a>/);
      expect(html).toMatch(/entry-or[^>]*><button[^>]*>Refaire ma fiche<\/button><span aria-hidden="true">·<\/span><button[^>]*>Se déconnecter<\/button><\/div>/);
      expect(html).not.toContain("Se connecter avec LinkedIn");
      expect(html).not.toContain("ou colle un lien");
    }
    const en = await render("entry", { account: GH, lang: "en" });
    expect(en).toContain(">See my sheet</a>");
    expect(en).toMatch(/Redo my sheet<\/button>.*Sign out<\/button>/);
  });

  it("connecté par LinkedIn, sa fiche partie (§18.105) : « Refaire ma fiche » en rose, « Se déconnecter », jamais « Se connecter avec LinkedIn »", async () => {
    for (const which of ["entry", "inline"] as const) {
      const html = await render(which, { account: { ...LI, cardId: null } });
      expect(html).toMatch(/<button type="button" class="pill pill-big entry-mine entry-redo">Refaire ma fiche<\/button>/);
      expect(html).toMatch(/entry-or[^>]*><button[^>]*>Se déconnecter<\/button><\/div>/);
      expect(html).not.toContain("Se connecter avec LinkedIn");
      expect(html).not.toContain("Voir ma fiche");
    }
  });

  it("connecté par GitHub seul, sans fiche : les boutons d'aujourd'hui, LinkedIn compris (il n'est pas encore au compte)", async () => {
    const html = await render("entry", { account: { ...GH, cardId: null } });
    expect(html).not.toContain("entry-mine");
    expect(html).toContain("Se connecter avec LinkedIn");
    expect(html).toContain("ou colle un lien");
  });

  it("ouverte par « Faire une autre fiche » : jamais un second « Voir ma fiche » ; LinkedIn déjà au compte, son bouton n'y est plus et GitHub prend le rose", async () => {
    for (const which of ["entry", "inline"] as const) {
      const html = await render(which, { account: LI, another: true });
      expect(html).not.toContain("entry-mine");
      expect(html).not.toContain("Se connecter avec LinkedIn");
      expect(html).toMatch(/class="pill pill-big entry-login"[^>]*>.*Se connecter avec GitHub/);
      expect(html).toContain("ou colle un lien");
      // Connecté par GitHub seul : le bouton LinkedIn reste, il ajoute LinkedIn au compte.
      expect(await render(which, { account: GH, another: true })).toContain("Se connecter avec LinkedIn");
    }
  });

  describe("une source déjà sur sa fiche n'est jamais reproposée (§18.110)", () => {
    /** Connecté par LinkedIn, son dossier porte déjà son GitHub. */
    const BOTH = { ...LI, cardLogin: "camroux", cardLinkedin: true };

    it("l'accueil et « À ton tour » sous une fiche : « Voir ma fiche », aucune connexion", async () => {
      for (const which of ["entry", "inline"] as const) {
        const html = await render(which, { account: BOTH });
        expect(html).toContain("Voir ma fiche");
        expect(html).not.toContain("Se connecter avec");
      }
    });

    it("« Faire une autre fiche » : ni LinkedIn ni GitHub, le champ d'emblée, sans « ← Se connecter »", async () => {
      for (const which of ["entry", "inline"] as const) {
        const html = await render(which, { account: BOTH, another: true });
        expect(html).not.toContain("Se connecter avec");
        expect(html).not.toContain("← Se connecter");
        expect(html).not.toContain("entry-mine");
        expect(html).toContain('placeholder="Lien LinkedIn, GitHub ou pseudo"');
      }
    });

    it("connecté par GitHub, son LinkedIn déjà au dossier : « Se connecter avec LinkedIn » n'y est plus", async () => {
      const html = await render("entry", { account: { ...GH, cardLogin: "leamd", cardLinkedin: true }, another: true });
      expect(html).not.toContain("Se connecter avec");
      // Sa fiche n'a que GitHub : LinkedIn reste proposé, il manque à son dossier.
      expect(await render("entry", { account: { ...GH, cardLogin: "leamd" }, another: true })).toContain("Se connecter avec LinkedIn");
      expect(await render("entry", { account: { ...GH, cardLogin: "leamd" }, another: true })).not.toContain("Se connecter avec GitHub");
    });

    it("la barre du haut : jamais un bouton de connexion", async () => {
      expect(await render("topbar", { account: BOTH })).not.toContain("Se connecter avec");
    });
  });

  it("pas connecté : « Se connecter avec LinkedIn » d'abord, en rose", async () => {
    const html = await render("entry");
    expect(html).toMatch(/class="pill pill-big entry-login"[^>]*>.*Se connecter avec LinkedIn/);
  });

  it("le repli sans compte (§18.90) : « Voir ma fiche », pas de pastille", async () => {
    const known = { ...LI, sources: [], known: true };
    expect(await render("entry", { account: known })).toMatch(/<a class="pill pill-big entry-mine" href="\/c\/Ab12345678">Voir ma fiche<\/a>/);
    const bar = await render("topbar", { account: known });
    expect(bar).not.toContain("topbar-mine");
    expect(bar).toMatch(/<a class="topbar-link" href="\/c\/Ab12345678"[^>]*>Ma fiche<\/a>/);
  });

  it("un retour de connexion en cours (l'attente, « C'est toi ? ») passe d'abord : le store du retour ferme l'entrée connectée", async () => {
    // Le retour vit dans entryApi.ts (§18.90) et ne se lit pas dans un rendu en chaîne : la règle se lit dans le code.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./EntryForm.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/const returned = useSyncExternalStore\(subscribeReturn, getReturn/);
    expect(src).toMatch(/const connected = buttonsOn && \(!!acct\?\.cardId \|\| liMine\) && !another && !working && !picking && !returned;/);
  });
});
