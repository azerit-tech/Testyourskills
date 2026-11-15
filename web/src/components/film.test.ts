// Le composant du film monté pour de vrai (react-dom/client), sur un DOM réduit
// à ce que React touche, le lecteur simulé : un parent qui repasse une fiche
// neuve au contenu identique (la fiche d'un dossier, recalculée à chaque rendu)
// ne recrée jamais le lecteur ; un lecteur recréé pendant la lecture repart dès
// qu'il est prêt ; une révélation ne rapporte qu'une issue.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../../shared/types";
import { FIXTURES } from "../../../shared/fixtures";
import type { Phase } from "./Reveal";

interface FakePlayer {
  plays: number;
  disposed: boolean;
  ready(how?: "ready" | "gesture"): void;
}

const h = vi.hoisted(() => ({ players: [] as FakePlayer[], sounds: 0, tracked: [] as string[] }));

vi.mock("../film/player", () => ({
  canPlayFilm: () => true,
  preloadFilm: () => undefined,
  createFilmPlayer: () => {
    let ready: (how: "ready" | "gesture") => void = () => undefined;
    const prepared = new Promise<"ready" | "gesture">((r) => (ready = r));
    const fake: FakePlayer = { plays: 0, disposed: false, ready: (how = "ready") => ready(how) };
    h.players.push(fake);
    return {
      prepare: () => prepared,
      play: () => {
        if (!fake.disposed) fake.plays++;
      },
      pause: () => undefined,
      seek: () => undefined,
      hold: () => undefined,
      time: () => 0,
      stats: () => ({ dropped: 0, decoded: 0, skipped: 0, leaked: 0, switchMs: null, startMs: null, bytes: 0, quality: "720", frameCallbacks: true, retries: 0, aborted: false, t: 0 }),
      dispose: () => {
        fake.disposed = true;
      },
    };
  },
}));
vi.mock("../lib/filmSound", () => ({
  createFilmSound: () => {
    h.sounds++;
    return { tick: () => undefined, pause: () => undefined, setMuted: () => undefined, dispose: () => undefined };
  },
}));
vi.mock("../lib/api", () => ({ isMock: () => false, api: { track: (event: string) => void h.tracked.push(event) } }));
vi.mock("../film/loader", () => ({ filmLoadMs: () => null, filmNet: () => ({ bytes: 0, bps: null, firstStart: null }), filmRemaining: () => 0 }));
vi.mock("../film/freeze", () => ({ ensureStill: () => undefined, paintStill: () => undefined }));
vi.mock("../film/FilmHud", () => ({ FilmHud: () => null, FilmRadio: () => null }));
vi.mock("../i18n", async (orig) => {
  const m = await orig<typeof import("../i18n")>();
  return { ...m, useT: () => ({ lang: "fr", t: m.DICTS.fr, setLang: () => undefined }) };
});

/** Un nœud du DOM réduit à ce que React pose : balises, attributs, style, enfants, écouteurs. */
class FakeNode {
  childNodes: FakeNode[] = [];
  parentNode: FakeNode | null = null;
  attrs = new Map<string, string>();
  style: Record<string, unknown> & { setProperty(k: string, v: string): void; removeProperty(k: string): void };
  nodeValue: string | null = null;
  constructor(
    readonly nodeType: number,
    readonly nodeName: string,
    readonly namespaceURI: string | null,
    readonly ownerDocument: unknown,
  ) {
    const style: Record<string, unknown> = {};
    this.style = Object.assign(style, {
      setProperty: (k: string, v: string) => void (style[k] = v),
      removeProperty: (k: string) => void delete style[k],
    });
  }
  get tagName() {
    return this.nodeName;
  }
  get firstChild() {
    return this.childNodes[0] ?? null;
  }
  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }
  set textContent(v: string) {
    this.childNodes = [];
    this.nodeValue = v;
  }
  setAttribute(k: string, v: string) {
    this.attrs.set(k, String(v));
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  hasAttribute(k: string) {
    return this.attrs.has(k);
  }
  appendChild(c: FakeNode) {
    this.removeIfChild(c);
    this.childNodes.push(c);
    c.parentNode = this;
    return c;
  }
  insertBefore(c: FakeNode, before: FakeNode | null) {
    this.removeIfChild(c);
    const i = before ? this.childNodes.indexOf(before) : -1;
    if (i < 0) this.childNodes.push(c);
    else this.childNodes.splice(i, 0, c);
    c.parentNode = this;
    return c;
  }
  removeChild(c: FakeNode) {
    this.removeIfChild(c);
    c.parentNode = null;
    return c;
  }
  prepend(...cs: FakeNode[]) {
    for (const c of cs.reverse()) this.insertBefore(c, this.firstChild);
  }
  contains(n: FakeNode | null): boolean {
    for (let x = n; x; x = x.parentNode) if (x === this) return true;
    return false;
  }
  addEventListener() {}
  removeEventListener() {}
  private removeIfChild(c: FakeNode) {
    const i = this.childNodes.indexOf(c);
    if (i >= 0) this.childNodes.splice(i, 1);
  }
}

const HTML = "http://www.w3.org/1999/xhtml";

function fakeDom() {
  const doc = {
    nodeType: 9,
    nodeName: "#document",
    hidden: false,
    activeElement: null as FakeNode | null,
    body: null as unknown as FakeNode,
    documentElement: null as unknown as FakeNode,
    createElement: (tag: string) => new FakeNode(1, tag.toUpperCase(), HTML, doc),
    createElementNS: (ns: string, tag: string) => new FakeNode(1, tag, ns, doc),
    createTextNode: (text: string) => Object.assign(new FakeNode(3, "#text", null, doc), { nodeValue: text }),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  doc.documentElement = doc.createElement("html");
  doc.body = doc.documentElement.appendChild(doc.createElement("body"));
  doc.activeElement = doc.body;
  class HTMLIFrameElement {}
  const win = {
    document: doc,
    HTMLIFrameElement,
    navigator: { userAgent: "test", language: "fr-FR" },
    localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    setInterval: (f: () => void, ms: number) => setInterval(f, ms),
    clearInterval: (id: ReturnType<typeof setInterval>) => clearInterval(id),
    setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  };
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("navigator", win.navigator);
  vi.stubGlobal("localStorage", win.localStorage);
  vi.stubGlobal("HTMLIFrameElement", HTMLIFrameElement);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  return doc;
}

/** Le film monté dans une racine React, rejouable avec d'autres propriétés. */
async function mountFilm(opts: { replay?: boolean } = {}) {
  const doc = fakeDom();
  const [{ act }, { createRoot }, { Film }] = await Promise.all([import("react"), import("react-dom/client"), import("./Film")]);
  const host = doc.body.appendChild(doc.createElement("div"));
  const root = createRoot(host as unknown as HTMLElement);
  const render = (card: CardData, phase: Phase) =>
    act(() => root.render(createElement(Film, { card, lang: "fr", phase, onHandoff: () => undefined, onDone: () => undefined, replay: opts.replay })));
  return { act, render, unmount: () => act(() => root.unmount()) };
}

const sameContent = (): CardData => ({ ...FIXTURES.gold, statuses: FIXTURES.gold.statuses.map((s) => ({ ...s })) });

beforeEach(() => {
  h.players.length = 0;
  h.sounds = 0;
  h.tracked.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("le film et l'identité de la fiche", () => {
  it("une fiche neuve au contenu identique à chaque rendu : un seul lecteur, une seule bande-son, et il joue", async () => {
    const { act, render, unmount } = await mountFilm();
    await render(sameContent(), "ready");
    for (let i = 0; i < 6; i++) await render(sameContent(), "ready");
    expect(h.players).toHaveLength(1);
    expect(h.sounds).toBe(1);
    await act(async () => h.players[0].ready());
    await render(sameContent(), "playing");
    for (let i = 0; i < 3; i++) await render(sameContent(), "playing");
    expect(h.players).toHaveLength(1);
    expect(h.players[0].plays).toBeGreaterThan(0);
    expect(h.tracked).toEqual([]);
    await unmount();
    expect(h.tracked).toEqual(["film"]);
  });

  it("un lecteur recréé pendant la lecture (le plan a vraiment changé) repart dès qu'il est prêt, sans issue rapportée en route", async () => {
    const { act, render, unmount } = await mountFilm();
    await render(FIXTURES.gold, "ready");
    await act(async () => h.players[0].ready());
    await render(FIXTURES.gold, "playing");
    expect(h.players[0].plays).toBe(1);
    // une autre note : un autre niveau, donc un autre plan
    await render({ ...FIXTURES.gold, overall: 95 }, "playing");
    expect(h.players).toHaveLength(2);
    expect(h.players[0].disposed).toBe(true);
    expect(h.players[1].plays).toBe(0);
    await act(async () => h.players[1].ready());
    expect(h.players[1].plays).toBe(1);
    expect(h.tracked).toEqual([]);
    await unmount();
    expect(h.tracked).toEqual(["film"]);
  });

  it("rejoué depuis la fiche (§18.48) : lancé en « playing » avant d'être prêt, il part dès qu'il l'est, sans événement de révélation", async () => {
    const { act, render, unmount } = await mountFilm({ replay: true });
    await render(FIXTURES.gold, "playing");
    expect(h.players).toHaveLength(1);
    expect(h.players[0].plays).toBe(0);
    await act(async () => h.players[0].ready());
    expect(h.players[0].plays).toBe(1);
    await unmount();
    expect(h.tracked).toEqual([]);
  });
});
