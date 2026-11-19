// Le compte léger côté front (§18.85), rendu en chaîne : la pastille « Ma fiche » de la
// barre, et l'entrée connectée (« Voir ma fiche », « Refaire ma fiche · Se déconnecter »).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

interface World {
  lang?: "fr" | "en";
  /** Ce que la dernière visite a appris de /api/me (l'indice local du compte). */
  account?: { cardId: string | null; sources: string[]; avatarUrl: string | null; initial: string | null };
  mine?: { id: string; login: string | null; overall: number };
  /** L'adresse de la page (un retour de connexion y porte ?li= ou ?gh=). */
  href?: string;
}

async function render(which: "topbar" | "entry" | "inline", { lang = "fr", account, mine, href = "https://skills.test/" }: World = {}): Promise<string> {
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
  const el = which === "topbar" ? createElement(chrome.TopBar) : createElement(entry.EntryForm, which === "inline" ? { variant: "inline" } : {});
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

  it("connecté sans fiche : les boutons d'aujourd'hui", async () => {
    const html = await render("entry", { account: { ...LI, cardId: null } });
    expect(html).not.toContain("entry-mine");
    expect(html).toContain("Se connecter avec LinkedIn");
    expect(html).toContain("ou colle un lien");
  });

  it("un retour de connexion dans l'adresse : ce parcours-là d'abord, pas « Voir ma fiche »", async () => {
    const html = await render("entry", { account: LI, href: "https://skills.test/?li=1" });
    expect(html).not.toContain("entry-mine");
  });
});
