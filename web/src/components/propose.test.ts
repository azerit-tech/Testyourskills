// « C'est ton GitHub ? » sous sa fiche (§18.100) : à qui la montrer, ce que « Oui »
// relance, ce que « Non » retient, et la ligne elle-même, en français et en anglais.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Proposal } from "../../../shared/types";
import { LangProvider } from "../i18n";
import { proposalRequest, proposalToShow, rememberNo, saidNo } from "../lib/propose";
import { Propose } from "./Propose";

const GH: Proposal = { kind: "github", login: "jmougeot", name: "Jacques", avatarUrl: "https://avatars.example/jmougeot", sure: false };
const LI: Proposal = { kind: "linkedin", url: "https://www.linkedin.com/in/camille-ardent", name: "Camille Ardent", headline: "Backend · Paysolde", sure: false };
const LI_CARD = { id: "abc123", login: undefined, linkedinUrl: "https://www.linkedin.com/in/jacquesmougeot" };
const GH_CARD = { id: "def456", login: "camille-dev", linkedinUrl: undefined };

let store: Record<string, string> = {};
beforeEach(() => {
  store = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => void (store[k] = v),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("à qui la montrer", () => {
  it("à la personne fichée, sous la fiche à une source qui appelle l'autre", () => {
    expect(proposalToShow(GH, LI_CARD, { visitor: false })).toBe(GH);
    expect(proposalToShow(LI, GH_CARD, { visitor: false })).toBe(LI);
  });

  it("jamais au visiteur, jamais sans proposition, jamais sous une fiche qui a déjà l'autre source", () => {
    expect(proposalToShow(GH, LI_CARD, { visitor: true })).toBeNull();
    expect(proposalToShow(null, LI_CARD, { visitor: false })).toBeNull();
    expect(proposalToShow(GH, { ...LI_CARD, login: "jmougeot" }, { visitor: false })).toBeNull();
    expect(proposalToShow(LI, { ...GH_CARD, linkedinUrl: "https://www.linkedin.com/in/x" }, { visitor: false })).toBeNull();
    expect(proposalToShow(GH, GH_CARD, { visitor: false })).toBeNull();
  });

  it("« Non » : elle ne revient plus sur cet appareil, pour cette fiche seulement", () => {
    rememberNo("abc123");
    expect(saidNo("abc123")).toBe(true);
    expect(proposalToShow(GH, LI_CARD, { visitor: false })).toBeNull();
    expect(proposalToShow(LI, GH_CARD, { visitor: false })).toBe(LI);
  });

  it("stockage bloqué : la proposition se montre, rien ne casse", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("bloqué");
      },
      setItem: () => {
        throw new Error("bloqué");
      },
    });
    expect(() => rememberNo("abc123")).not.toThrow();
    expect(proposalToShow(GH, LI_CARD, { visitor: false })).toBe(GH);
  });
});

describe("« Oui »", () => {
  it("relance la fiche comme « Ajoute ton GitHub », avec le pseudo proposé et la fiche complétée", () => {
    expect(proposalRequest(GH, LI_CARD, "fr")).toEqual({ login: "jmougeot", linkedin: LI_CARD.linkedinUrl, lang: "fr", from: "abc123" });
  });

  it("en miroir, comme « Ajoute ton LinkedIn »", () => {
    expect(proposalRequest(LI, GH_CARD, "en")).toEqual({ login: "camille-dev", linkedin: LI.kind === "linkedin" ? LI.url : "", lang: "en", from: "def456" });
  });
});

function render(proposal: Proposal, lang = "fr-FR"): string {
  vi.stubGlobal("window", { location: { origin: "https://skills.test", pathname: "/c/x", search: "" }, matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }) });
  vi.stubGlobal("navigator", { userAgent: "test", language: lang });
  return renderToStaticMarkup(createElement(LangProvider, null, createElement(Propose, { proposal, card: proposal.kind === "github" ? LI_CARD : GH_CARD, onNo: () => undefined })));
}

describe("la ligne", () => {
  it("le pseudo, la question, un bouton rose, « Non » en lien ; jamais d'email", () => {
    const html = render(GH);
    expect(html).toContain('class="after-block propose"');
    expect(html).toContain("@jmougeot");
    expect(html).toContain("C&#x27;est ton GitHub");
    expect(html).toMatch(/<button type="button" class="pill pill-big propose-yes"[^>]*>Oui, ajoute-le<\/button>/);
    expect(html).toMatch(/<button type="button" class="link-quiet propose-no">Non<\/button>/);
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).not.toContain("@" + "gmail");
  });

  it("en anglais, et pour un LinkedIn : le nom et le titre", () => {
    expect(render(GH, "en-US")).toContain("Is this your GitHub?");
    const li = render(LI, "en-US");
    expect(li).toContain("Camille Ardent");
    expect(li).toContain("Backend · Paysolde");
    expect(li).toContain("Is this your LinkedIn?");
    expect(li).toContain(">Yes, add it</button>");
  });

  it("la barre du pouce s'efface devant son bouton rose", () => {
    const dock = readFileSync(join(__dirname, "ShareDock.tsx"), "utf8");
    expect(dock.match(/\.after-block\.propose \.propose-yes/g)).toHaveLength(2);
  });
});
