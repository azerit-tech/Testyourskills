// Le lecteur du film et son chien de garde (docs/cinematique-poursuite.md §5.5),
// branchés sur de fausses balises vidéo, sans navigateur : une erreur, une
// pause non demandée ou une horloge figée finissent en relance puis en flash,
// jamais en image figée.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../../../shared/fixtures";
import { filmPlan, FPS } from "../../../shared/film";

vi.mock("./loader", () => ({
  canPlayFilm: () => true,
  debugFlag: () => null,
  dropFilmFile: () => undefined,
  filmNet: () => ({ bytes: 0, bps: null, firstStart: null }),
  filmVariant: () => "720",
  loadFilmFiles: async () => ({ urls: ["blob:a", "blob:b"], quality: "720" }),
  preloadFilm: () => undefined,
}));

const videos: FakeVideo[] = [];

/** Une balise vidéo réduite à ce que le lecteur touche ; son horloge avance avec les rafraîchissements. */
class FakeVideo extends EventTarget {
  paused = true;
  currentTime = 0;
  duration = 10;
  readyState = 0;
  seeking = false;
  ended = false;
  /** L'horloge ne bouge plus, même en lecture (décodeur bloqué). */
  frozen = false;
  plays = 0;
  className = "";
  style: Record<string, string> = {};
  muted = true;
  defaultMuted = true;
  playsInline = true;
  preload = "auto";
  private attrs = new Map<string, string>();
  constructor() {
    super();
    videos.push(this);
  }
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  set src(v: string) {
    this.attrs.set("src", v);
  }
  get src() {
    return this.attrs.get("src") ?? "";
  }
  load() {
    this.readyState = 0;
    setTimeout(() => {
      this.readyState = 4;
      this.dispatchEvent(new Event("loadeddata"));
    }, 0);
  }
  play() {
    this.plays++;
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    setTimeout(() => this.dispatchEvent(new Event("pause")), 0);
  }
  remove() {}
  canPlayType() {
    return "probably";
  }
  getVideoPlaybackQuality() {
    return { droppedVideoFrames: 0, totalVideoFrames: 0 };
  }
  tick(ms: number) {
    if (!this.paused && !this.frozen) this.currentTime += ms / 1000;
  }
}

const div = () => ({ style: {} as Record<string, string>, prepend: () => undefined });

beforeEach(() => {
  videos.length = 0;
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });
  vi.stubGlobal("document", { hidden: false, createElement: () => new FakeVideo() });
  vi.stubGlobal("window", { setTimeout: (f: () => void, ms: number) => setTimeout(f, ms), clearTimeout: (id: number) => clearTimeout(id) });
  // un rafraîchissement toutes les 16 ms ; les balises en lecture avancent d'autant
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) =>
    setTimeout(() => {
      for (const v of videos) v.tick(16);
      cb(performance.now());
    }, 16),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function started(level = 3) {
  const { createFilmPlayer } = await import("./player");
  const overall = { 1: 12, 3: 50, 6: 93 }[level] ?? 50;
  const plan = filmPlan({ ...FIXTURES.silver, id: "f", overall });
  let last = 0;
  const p = createFilmPlayer({ plan, host: div() as unknown as HTMLElement, cover: div() as unknown as HTMLElement, onTime: (t) => (last = t) });
  const ready = p.prepare();
  await vi.advanceTimersByTimeAsync(200);
  expect(await ready).toBe("ready");
  p.play();
  const [a, b] = videos;
  return { p, plan, a, b, now: () => last };
}

describe("l'arrêt sur image, tiré pendant la préparation", () => {
  it("la balise de fin est montrée sur sa dernière image, puis remise au début", async () => {
    const { createFilmPlayer } = await import("./player");
    const plan = filmPlan({ ...FIXTURES.silver, id: "f", overall: 50 });
    const seen: number[] = [];
    const p = createFilmPlayer({
      plan,
      host: div() as unknown as HTMLElement,
      cover: div() as unknown as HTMLElement,
      onTime: () => undefined,
      onStill: (v) => seen.push(Math.floor(v.currentTime * FPS)),
    });
    const ready = p.prepare();
    await vi.advanceTimersByTimeAsync(200);
    expect(await ready).toBe("ready");
    expect(seen).toEqual([plan.endVideo - 1]);
    expect(Math.floor(videos[1].currentTime * FPS)).toBe(0);
  });
});

describe("le chien de garde, branché sur le lecteur", () => {
  it("une lecture normale va au bout sans relance", async () => {
    const { p, plan, now } = await started();
    await vi.advanceTimersByTimeAsync(plan.duration * 1000 + 500);
    expect(now()).toBe(plan.duration);
    expect(p.stats().retries).toBe(0);
  });

  it("une pause que le lecteur n'a pas demandée : la balise est relancée", async () => {
    const { p, a } = await started();
    await vi.advanceTimersByTimeAsync(300);
    const plays = a.plays;
    a.pause();
    await vi.advanceTimersByTimeAsync(50);
    expect(a.plays).toBe(plays + 1);
    expect(a.paused).toBe(false);
    expect(p.stats().retries).toBe(1);
  });

  it("une pause demandée (onglet caché) n'est pas un incident", async () => {
    const { p, a } = await started();
    await vi.advanceTimersByTimeAsync(300);
    p.pause();
    await vi.advanceTimersByTimeAsync(5000);
    expect(a.paused).toBe(true);
    expect(p.stats().retries).toBe(0);
    p.play();
    await vi.advanceTimersByTimeAsync(300);
    expect(p.stats().retries).toBe(0);
  });

  it("une horloge figée : une relance après 1,5 s, puis le flash et la fiche", async () => {
    const { p, plan, a, now } = await started();
    await vi.advanceTimersByTimeAsync(300);
    a.frozen = true;
    const frozenT = now();
    await vi.advanceTimersByTimeAsync(1600);
    expect(p.stats().retries).toBe(1);
    // toujours figée : le film saute au flash, l'horloge du navigateur prend le relais
    expect(now()).toBeLessThan(plan.flash.from / FPS);
    await vi.advanceTimersByTimeAsync(1600);
    expect(now()).toBeGreaterThanOrEqual(plan.flash.from / FPS);
    expect(frozenT).toBeLessThan(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(now()).toBe(plan.duration);
  });

  it("une erreur de balise en cours de film : flash immédiat", async () => {
    const { plan, a, now } = await started();
    await vi.advanceTimersByTimeAsync(300);
    a.dispatchEvent(new Event("error"));
    await vi.advanceTimersByTimeAsync(32);
    expect(now()).toBeGreaterThanOrEqual(plan.flash.from / FPS);
  });

  it("figée pendant la fin, après la bascule : le chien de garde suit la seconde balise", async () => {
    const { p, plan, b, now } = await started(1);
    await vi.advanceTimersByTimeAsync((plan.cut / FPS) * 1000 + 200);
    expect(now()).toBeGreaterThan(plan.cut / FPS);
    b.frozen = true;
    await vi.advanceTimersByTimeAsync(3300);
    expect(p.stats().retries).toBe(1);
    expect(now()).toBeGreaterThanOrEqual(plan.flash.from / FPS);
  });
});
