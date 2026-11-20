// Le bloc de partage et la barre du pouce selon l'appareil (§18.27) : rendus en chaîne, sans navigateur.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../../../shared/fixtures";
import { LangProvider } from "../i18n";
import { markTextCopied } from "../lib/sharing";
import { aimAt, ShareBar } from "./After";
import { ShareDock } from "./ShareDock";

const DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const LINKEDIN_ANDROID =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 LinkedInApp";

interface Env {
  ua: string;
  touch: boolean;
  share: boolean;
  /** Écran de 640 px ou moins. */
  narrow?: boolean;
}

function stub(env: Env, id: string) {
  vi.stubGlobal("window", {
    location: { origin: "https://skills.test", pathname: `/c/${id}`, search: "" },
    matchMedia: (q: string) => ({ matches: q.includes("coarse") ? env.touch : q.includes("max-width") ? !!env.narrow : false }),
  });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("navigator", {
    userAgent: env.ua,
    language: "fr-FR",
    ...(env.share ? { share: async () => undefined, canShare: () => true } : {}),
  });
  return { kind: "card" as const, card: { ...FIXTURES.gold, id } };
}

function render(env: Env, id = "AbCdEf1234"): string {
  const item = stub(env, id);
  return renderToStaticMarkup(createElement(LangProvider, null, createElement(ShareBar, { item, toast: () => undefined })));
}

function renderDock(env: Env, ready: boolean): string {
  const item = stub(env, "AbCdEf1234");
  return renderToStaticMarkup(createElement(LangProvider, null, createElement(ShareDock, { item, ready, toast: () => undefined })));
}

/** Les pilules à contour : les boutons secondaires. */
const ghosts = (html: string) => html.match(/class="pill pill-ghost[^"]*"/g) ?? [];
/** Les boutons roses pleins : un seul par bloc. */
const pinks = (html: string) => (html.match(/class="pill pill-big[^"]*"/g) ?? []).filter((c) => !c.includes("pill-ghost"));
/** Les liens du bas du bloc, dans l'ordre. */
const links = (html: string) => {
  const more = /<div class="out-more">(.*?)<\/div>/.exec(html)?.[1] ?? "";
  return [...more.matchAll(/<(a|button)[^>]*class="link-alt"[^>]*>([^<]+)<\/\1>/g)].map((m) => m[2].replace(/&#x27;/g, "'"));
};
const main = (html: string) => /<(a|button)[^>]*class="pill pill-big out-main[^"]*"[^>]*>.*?<\/\1>/.exec(html)?.[0] ?? "";

afterEach(() => vi.unstubAllGlobals());

describe("bloc de partage selon l'appareil (§18.27)", () => {
  it("ordinateur : LinkedIn en vrai lien, seul bouton rose ; le lien et les images en liens, plus de X (§18.48)", () => {
    const html = render({ ua: DESKTOP, touch: false, share: false });
    expect(main(html)).toMatch(/^<a /);
    // L'adresse de LinkedIn n'est jamais dans la page : un bloqueur de contenu masquerait le bouton.
    expect(main(html)).toContain('href="https://skills.test/c/AbCdEf1234?r=AbCdEf1234"');
    expect(html).not.toContain("linkedin.com");
    expect(main(html)).toContain('target="_blank"');
    expect(main(html)).toContain('rel="noopener"');
    expect(pinks(html)).toHaveLength(1);
    expect(ghosts(html)).toHaveLength(0);
    // Trois libellés courts, sur une ligne à 390 px ; le libellé entier reste lu.
    expect(links(html)).toEqual(["Copier le lien", "Image", "Story"]);
    expect(html).toContain('aria-label="Télécharger l&#x27;image"');
    expect(html).not.toMatch(/>X<|x\.com/);
    expect(html).toMatch(/<a class="link-alt"[^>]*download="azerit-[^"]+\.png"/);
    // Épuré (§18.76) : ni la durée de vie du lien (le pli « Garde ta fiche au-delà de 90 jours » la dit), ni « Voir le top de la semaine ».
    expect(html).toMatch(/<\/div><\/section>$/);
    expect(html).not.toContain("out-keep");
    expect(html).not.toContain("out-board");
    // Le fichier porte le seul nom visible du produit.
    expect(html).not.toMatch(/testyourskills/i);
    // Le dessin en cours dans l'adresse : le cache d'un an ne ressert pas l'ancienne image.
    expect(html).toContain('href="/og/AbCdEf1234-portrait.png?v=10"');
  });

  it("« Image pour story » : un lien après l'image, téléchargé comme elle", () => {
    const html = render({ ua: DESKTOP, touch: false, share: false });
    expect(html).toMatch(/>Image<\/a><a class="link-alt" aria-label="Image pour story" href="\/og\/AbCdEf1234-story\.png\?v=10" download="azerit-[^"]+-story\.png">Story<\/a><\/div>/);
  });

  it("« Image pour story » sur téléphone et dans un navigateur intégré, comme l'image", () => {
    const phone = render({ ua: IPHONE, touch: true, share: true });
    expect(phone).toContain('aria-label="Image pour story"');
    expect(phone).toContain(">Story</a>");
    const inApp = render({ ua: LINKEDIN_ANDROID, touch: true, share: false });
    expect(inApp).toMatch(/<button type="button" class="link-alt" aria-label="Image pour story" aria-haspopup="dialog">Story<\/button>/);
  });

  it("en anglais : les trois liens", () => {
    const item = stub({ ua: DESKTOP, touch: false, share: false }, "AbCdEf1234");
    vi.stubGlobal("navigator", { userAgent: DESKTOP, language: "en-US" });
    const html = renderToStaticMarkup(createElement(LangProvider, null, createElement(ShareBar, { item, toast: () => undefined })));
    expect(html).not.toContain("90 days");
    expect(links(html)).toEqual(["Copy link", "Image", "Story"]);
  });

  it("en anglais : « Story image », « Share on LinkedIn »", () => {
    const item = stub({ ua: DESKTOP, touch: false, share: false }, "AbCdEf1234");
    vi.stubGlobal("navigator", { userAgent: DESKTOP, language: "en-US" });
    const html = renderToStaticMarkup(createElement(LangProvider, null, createElement(ShareBar, { item, toast: () => undefined })));
    expect(html).toContain('aria-label="Story image"');
    expect(main(html)).toContain("Share on LinkedIn");
    expect(html).not.toContain("clipboard");
  });

  it("téléphone : « Partager » devant, LinkedIn, le lien et l'image derrière, sans X", () => {
    const html = render({ ua: IPHONE, touch: true, share: true });
    expect(main(html)).toMatch(/^<button /);
    expect(main(html)).toContain("Partager");
    // Un bouton rose, LinkedIn seul en contour, le reste en liens (l'ajout au profil aussi, §18.75).
    expect(pinks(html)).toHaveLength(1);
    expect(ghosts(html)).toHaveLength(1);
    expect(html).toMatch(/<a class="pill pill-ghost out-second" href="https:\/\/skills\.test\/c\//);
    expect(html).not.toContain(">X</button>");
    expect(html).toMatch(/LinkedIn.*Copier le lien.*>Image</);
    expect(links(html)).toEqual(["Copier le lien", "Image", "Story"]);
  });

  it("navigateur intégré sans feuille de partage : LinkedIn devant, l'image s'ouvre en panneau", () => {
    const html = render({ ua: LINKEDIN_ANDROID, touch: true, share: false });
    expect(main(html)).toMatch(/^<a /);
    expect(ghosts(html)).toHaveLength(0);
    expect(html).not.toContain("download=");
    // Rien à copier à la main tant qu'aucune copie n'a échoué.
    expect(html).not.toContain("out-manual");
    expect(html).toMatch(/<button[^>]*aria-label="Télécharger l&#x27;image" aria-haspopup="dialog"[^>]*>Image</);
  });

  it("le bouton dit « Partager sur LinkedIn » avant comme après l'appui ; la ligne d'aide ne se remplit qu'après (§18.76)", () => {
    const hint = 'aria-live="polite">Texte copié\u00a0: colle-le dans ton post LinkedIn.</p>';
    const before = render({ ua: DESKTOP, touch: false, share: false });
    expect(main(before)).toContain("<span>Partager sur LinkedIn</span>");
    expect(main(before)).not.toContain("is-copied");
    // Avant l'appui : la ligne est montée (lue quand elle se remplit), vide.
    expect(before).toContain('<p class="out-hint" aria-live="polite"></p>');
    markTextCopied("CopiedCard1");
    const html = render({ ua: DESKTOP, touch: false, share: false }, "CopiedCard1");
    expect(main(html)).toContain("is-copied");
    expect(main(html)).toContain("<span>Partager sur LinkedIn</span>");
    expect(main(html)).not.toMatch(/Texte copié|·/);
    expect(html).toContain(`<p class="out-hint is-copied" ${hint}`);
    // Sur téléphone, LinkedIn passe en second : même libellé entier, même ligne dessous.
    const phone = render({ ua: IPHONE, touch: true, share: true });
    expect(phone).toMatch(/class="pill pill-ghost out-second[^"]*"[^>]*>.*?<span>Partager sur LinkedIn<\/span><\/a><p class="out-hint/);
  });
});

describe("barre du pouce (§18.27)", () => {
  const phone: Env = { ua: IPHONE, touch: true, share: true, narrow: true };

  it("écran étroit, fiche posée : « Dénonce un complice » en tête, « Partager » dessous, cachée tant qu'on ne sait pas où est le bloc de partage (§18.83)", () => {
    const html = renderDock(phone, true);
    expect(html).toMatch(/^<div class="dock"[^>]* inert=""/);
    // Deux rangs : le champ à toucher, puis le seul rose de la barre. Plus de bouton « Dénoncer ».
    expect(html).toMatch(/<button type="button" class="dock-who"><span>Dénonce un complice<\/span><svg.*?<\/svg><\/button><button[^>]*class="pill pill-big dock-main"[^>]*>.*Partager<\/button><\/div>$/);
    expect(pinks(html)).toEqual(['class="pill pill-big dock-main"']);
    expect(html).not.toContain(">Dénoncer<");
    // Un toucher mène au champ du bloc, monté au haut de l'écran, dans le geste (le clavier s'ouvre).
    const src = readFileSync(join(__dirname, "ShareDock.tsx"), "utf8");
    expect(src).toContain('onClick={() => toField(".after-block.denounce", true)}');
    expect(src).toContain("input?.focus({ preventScroll: true })");
  });

  it("sans feuille de partage : le même lien LinkedIn que le bouton principal", () => {
    const html = renderDock({ ua: LINKEDIN_ANDROID, touch: true, share: false, narrow: true }, true);
    expect(html).toMatch(/<a class="pill pill-big dock-main" href="https:\/\/skills\.test\/c\//);
  });

  it("le champ du bloc « Dénonce un complice » à l'écran, au-dessus de la barre : son rang la quitte, jamais deux fois le même geste", () => {
    const src = readFileSync(join(__dirname, "ShareDock.tsx"), "utf8");
    // Le champ (ou l'attente) du bloc, pas son titre : derrière la barre, il ne compte pas.
    expect(src).toContain('const DENOUNCE_MARKS = ".after-block.denounce .denounce-form .field, .after-block.denounce.is-pending";');
    expect(src).toContain("{ rootMargin: `0px 0px -${DOCK_PX}px 0px` }");
    expect(src).toContain("setDenounceSeen(above.size > 0)");
    expect(src).toMatch(/const who = !denounceSeen && \(\s*<button type="button" className="dock-who"/);
  });

  it("sous trois étoiles, une source à ajouter : « Ajouter mon LinkedIn » en rose, « Partager » en contour, « Dénonce un complice » au-dessus (§18.52, §18.83)", () => {
    for (const [add, label] of [["linkedin", "Ajouter mon LinkedIn"], ["github", "Ajouter mon GitHub"]] as const) {
      const item = stub(phone, "AbCdEf1234");
      const html = renderToStaticMarkup(createElement(LangProvider, null, createElement(ShareDock, { item, ready: true, toast: () => undefined, add })));
      expect(pinks(html)).toEqual(['class="pill pill-big dock-main"']);
      expect(html).toContain(`>${label}</button>`);
      expect(html.match(/class="pill pill-big pill-ghost"/g)).toHaveLength(1);
      expect(html).toContain("Partager");
      expect(html).not.toContain(">Dénoncer<");
      expect(html).toMatch(/^<div class="dock is-add"[^>]*><button type="button" class="dock-who">/);
    }
    // La barre s'efface aussi devant le bloc de la source, dont le bouton est le rose.
    // Et devant « Oui, ajoute-le » de la proposition sous la fiche (§18.100).
    expect(readFileSync(join(__dirname, "ShareDock.tsx"), "utf8")).toContain('".after-block.out .out-main, .after-block.denounce.is-done, .after-block.propose .propose-yes, .after-block.add-source .entry-submit"');
  });

  it("pas pendant la révélation, pas sur ordinateur", () => {
    expect(renderDock(phone, false)).toBe("");
    expect(renderDock({ ua: DESKTOP, touch: false, share: false, narrow: false }, true)).toBe("");
  });
});

describe("lien LinkedIn sous un bloqueur de contenu", () => {
  it("vise LinkedIn le temps du clic, puis reprend l'adresse de la fiche", () => {
    vi.useFakeTimers();
    const a = { href: "https://skills.test/c/x" } as HTMLAnchorElement;
    vi.stubGlobal("window", { setTimeout });
    aimAt(a, "https://www.linkedin.com/sharing/share-offsite/?url=x", "https://skills.test/c/x");
    expect(a.href).toContain("linkedin.com/sharing");
    vi.runAllTimers();
    expect(a.href).toBe("https://skills.test/c/x");
    vi.useRealTimers();
  });
});
