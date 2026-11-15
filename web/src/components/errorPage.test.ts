// La page d'erreur du site (SPEC §18.48) : une seule mise en page, une sortie utile
// à chaque fois, et « injoignable » jamais confondu avec « introuvable ».
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LangProvider } from "../i18n";
import { ApiError } from "../lib/errors";
import { failureOf } from "../lib/remote";
import { PAGES_TEXT } from "../pagesText";
import { BandNotFound, CardNotFound, NotFound, PrimeNotFound, Unreachable } from "./ErrorPage";

function render(el: ReactElement, lang: "fr" | "en" = "fr"): string {
  vi.stubGlobal("localStorage", { getItem: () => lang, setItem: () => undefined });
  return renderToStaticMarkup(createElement(LangProvider, null, el));
}

afterEach(() => vi.unstubAllGlobals());

const PRESETS: [string, () => ReactElement][] = [
  ["page inconnue", () => createElement(NotFound)],
  ["fiche", () => createElement(CardNotFound)],
  ["bande", () => createElement(BandNotFound)],
  ["prime", () => createElement(PrimeNotFound, { listed: true })],
  ["serveur muet", () => createElement(Unreachable)],
];

describe("la mise en page d'erreur", () => {
  it("le même gabarit partout : la toise, un tampon, un titre de bloc, un bouton principal", () => {
    for (const [name, make] of PRESETS) {
      for (const lang of ["fr", "en"] as const) {
        const html = render(make(), lang);
        expect(html, name).toContain('<main class="page page-error" id="main">');
        expect(html, name).toContain('class="err-frame"');
        expect(html, name).toContain('class="cover-face-mark">?</span>');
        expect(html.match(/class="err-stamp is-(none|down)"/g), name).toHaveLength(1);
        expect(html.match(/<h1 class="t-block">/g), name).toHaveLength(1);
        // une sortie utile, et une seule en bouton principal
        expect(html.match(/class="btn-primary err-action"/g), name).toHaveLength(1);
      }
    }
  });

  it("introuvable : « Faire ma fiche » partout ; une bande offre le tableau, une prime les primes", () => {
    expect(render(createElement(CardNotFound))).toContain('<a class="btn-primary err-action" href="/">Faire ma fiche</a>');
    const band = render(createElement(BandNotFound));
    expect(band).toContain("Introuvable");
    expect(band).toContain('<a class="link-alt" href="/bandes">Toutes les bandes</a>');
    const prime = render(createElement(PrimeNotFound, { listed: true }));
    expect(prime).toContain("Cette prime n&#x27;existe pas");
    expect(prime).toContain('<a class="btn-primary err-action" href="/">Faire ma fiche</a>');
    expect(prime).toContain('<a class="link-alt" href="/primes">Voir les primes</a>');
    // une saison sans prime : pas de lien vers une page qui ramène à l'accueil
    expect(render(createElement(PrimeNotFound, { listed: false }))).not.toContain('href="/primes"');
  });

  it("serveur muet : « le commissariat ne répond pas », « Réessayer », jamais « introuvable »", () => {
    const fr = render(createElement(Unreachable));
    expect(fr).toContain("Le commissariat ne répond pas");
    expect(fr).toContain('class="err-stamp is-down">Injoignable</span>');
    expect(fr).toContain('<button type="button" class="btn-primary err-action">Réessayer</button>');
    expect(fr).toContain('role="alert"');
    expect(fr.toLowerCase()).not.toContain("introuvable");
    expect(fr).not.toContain("n&#x27;existe pas");
    const en = render(createElement(Unreachable), "en");
    expect(en).toContain('class="btn-primary err-action">Try again</button>');
    expect(en.toLowerCase()).not.toContain("not found");
  });

  it("le panneau seul (bare) : sans <main>, pour une page qui a le sien", () => {
    const html = render(createElement(CardNotFound, { bare: true }));
    expect(html.startsWith('<div class="err"')).toBe(true);
    expect(html).not.toContain("<main");
  });
});

describe("absent ou en panne", () => {
  it("404 et 410 : absent ; réseau coupé, 5xx, quota, erreur inconnue : en panne", () => {
    expect(failureOf(new ApiError(404, "not_found", null))).toBe("none");
    expect(failureOf(new ApiError(410, "gone", null))).toBe("none");
    for (const status of [0, 429, 500, 502, 503]) expect(failureOf(new ApiError(status, "internal", null)), String(status)).toBe("down");
    expect(failureOf(new TypeError("Failed to fetch"))).toBe("down");
    expect(failureOf(undefined)).toBe("down");
  });
});

/** Toutes les chaînes d'un dictionnaire, fonctions appelées avec des valeurs d'exemple. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (typeof v === "function") strings((v as (...a: unknown[]) => unknown)("contact@exemple.test", 2, 3, 4), out);
  else if (v && typeof v === "object") for (const x of Object.values(v)) strings(x, out);
  return out;
}

describe("les textes des pages autour de la fiche", () => {
  it("ni tiret long, ni point médian dans un mot, ni nom du site d'avant", () => {
    for (const lang of ["fr", "en"] as const) {
      for (const s of strings(PAGES_TEXT[lang])) {
        expect(s, s).not.toMatch(/[—–]/);
        expect(s, s).not.toMatch(/\p{L}·\p{L}/u);
        expect(s, s).not.toMatch(/GitHub (remplace|replaces)/i);
      }
    }
  });

  it("vie privée : l'identifiant du navigateur est dit, mot pour mot, dans les deux langues", () => {
    // les espaces insécables de la typographie française ne changent pas les mots
    const fr = strings(PAGES_TEXT.fr.privacy).join("\n").replace(/[\u00a0\u202f]/g, " ");
    expect(fr).toContain(
      "Ton navigateur garde un identifiant tiré au hasard. Il ne dit rien de toi : il sert seulement à compter les fiches faites depuis ce navigateur dans la journée. Notre serveur n'en garde qu'une empreinte, avec le compteur du jour, comme pour ton adresse IP.",
    );
    const en = strings(PAGES_TEXT.en.privacy).join("\n");
    expect(en).toContain(
      "Your browser keeps a randomly drawn identifier. It says nothing about you: it only counts the sheets made from this browser during the day. Our server keeps only a hash of it, with the day's counter, as it does for your IP address.",
    );
  });

  it("vie privée : aucune promesse d'un email qui porterait un lien de suppression", () => {
    for (const lang of ["fr", "en"] as const) {
      for (const s of strings(PAGES_TEXT[lang].privacy)) {
        expect(s, s).not.toMatch(/lien de suppression|deletion link|delete link/i);
      }
    }
  });

  it("vie privée : les sources dans l'ordre LinkedIn, GitHub, CV ; les mêmes sections en anglais", () => {
    const fr = PAGES_TEXT.fr.privacy.sections("x@y.z");
    const en = PAGES_TEXT.en.privacy.sections("x@y.z");
    expect(en).toHaveLength(fr.length);
    const read = fr[0]!.blocks.flat().join(" ");
    expect(read.indexOf("LinkedIn")).toBeGreaterThan(-1);
    expect(read.indexOf("LinkedIn")).toBeLessThan(read.indexOf("GitHub"));
    expect(read.indexOf("GitHub")).toBeLessThan(read.indexOf("CV"));
  });
});
