// Le bloc de partage et la barre du pouce selon l'appareil (§18.27) : rendus en chaîne, sans navigateur.
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
const main = (html: string) => /<(a|button)[^>]*class="pill pill-big out-main[^"]*"[^>]*>.*?<\/\1>/.exec(html)?.[0] ?? "";

afterEach(() => vi.unstubAllGlobals());

describe("bloc de partage selon l'appareil (§18.27)", () => {
  it("ordinateur : LinkedIn en vrai lien, puis X, le lien, l'image à télécharger", () => {
    const html = render({ ua: DESKTOP, touch: false, share: false });
    expect(main(html)).toMatch(/^<a /);
    // L'adresse de LinkedIn n'est jamais dans la page : un bloqueur de contenu masquerait le bouton.
    expect(main(html)).toContain('href="https://skills.test/c/AbCdEf1234?r=AbCdEf1234"');
    expect(html).not.toContain("linkedin.com");
    expect(main(html)).toContain('target="_blank"');
    expect(main(html)).toContain('rel="noopener"');
    expect(ghosts(html)).toHaveLength(3);
    expect(html).toMatch(/>X<\/button>.*Copier le lien.*<a[^>]*download="testyourskills-[^"]+\.png"/);
    // Le dessin en cours dans l'adresse : le cache d'un an ne ressert pas l'ancienne image.
    expect(html).toContain('href="/og/AbCdEf1234-portrait.png?v=6"');
  });

  it("« Format story » : un lien d'appoint après l'image, téléchargé comme elle", () => {
    const html = render({ ua: DESKTOP, touch: false, share: false });
    expect(html).toMatch(/Télécharger l&#x27;image<\/a><\/div><a class="link-quiet out-story" href="\/og\/AbCdEf1234-story\.png\?v=6" download="testyourskills-[^"]+-story\.png">Format story<\/a>/);
    // Discret : pas une quatrième pilule.
    expect(ghosts(html)).toHaveLength(3);
  });

  it("« Format story » sur téléphone et dans un navigateur intégré, comme l'image", () => {
    const phone = render({ ua: IPHONE, touch: true, share: true });
    expect(phone).toContain(">Format story</a>");
    const inApp = render({ ua: LINKEDIN_ANDROID, touch: true, share: false });
    expect(inApp).toMatch(/<button type="button" class="link-quiet out-story" aria-haspopup="dialog">Format story<\/button>/);
  });

  it("en anglais : « Story format »", () => {
    const item = stub({ ua: DESKTOP, touch: false, share: false }, "AbCdEf1234");
    vi.stubGlobal("navigator", { userAgent: DESKTOP, language: "en-US" });
    const html = renderToStaticMarkup(createElement(LangProvider, null, createElement(ShareBar, { item, toast: () => undefined })));
    expect(html).toContain(">Story format</a>");
  });

  it("téléphone : « Partager » devant, LinkedIn, le lien et l'image derrière, sans X", () => {
    const html = render({ ua: IPHONE, touch: true, share: true });
    expect(main(html)).toMatch(/^<button /);
    expect(main(html)).toContain("Partager");
    expect(ghosts(html)).toHaveLength(3);
    expect(html).toMatch(/<a class="pill pill-ghost out-second" href="https:\/\/skills\.test\/c\//);
    expect(html).not.toContain(">X</button>");
    expect(html).toMatch(/LinkedIn.*Copier le lien.*Télécharger l&#x27;image/);
  });

  it("navigateur intégré sans feuille de partage : LinkedIn devant, l'image s'ouvre en panneau", () => {
    const html = render({ ua: LINKEDIN_ANDROID, touch: true, share: false });
    expect(main(html)).toMatch(/^<a /);
    expect(ghosts(html)).toHaveLength(3);
    expect(html).not.toContain("download=");
    expect(html).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>.*Télécharger l&#x27;image/);
  });

  it("après la copie, le bouton LinkedIn garde « Texte copié »", () => {
    markTextCopied("CopiedCard1");
    const html = render({ ua: DESKTOP, touch: false, share: false }, "CopiedCard1");
    expect(main(html)).toContain("is-copied");
    expect(main(html)).toContain("Texte copié · colle-le dans ton post");
  });
});

describe("barre du pouce (§18.27)", () => {
  const phone: Env = { ua: IPHONE, touch: true, share: true, narrow: true };

  it("écran étroit, fiche posée : « Partager » et « Dénoncer », cachée tant qu'on ne sait pas où est le bloc de partage", () => {
    const html = renderDock(phone, true);
    expect(html).toMatch(/^<div class="dock"[^>]* inert=""/);
    expect(html).toMatch(/<button[^>]*class="pill pill-big dock-main"[^>]*>.*Partager<\/button><button[^>]*>Dénoncer<\/button>/);
  });

  it("sans feuille de partage : le même lien LinkedIn que le bouton principal", () => {
    const html = renderDock({ ua: LINKEDIN_ANDROID, touch: true, share: false, narrow: true }, true);
    expect(html).toMatch(/<a class="pill pill-big dock-main" href="https:\/\/skills\.test\/c\//);
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
