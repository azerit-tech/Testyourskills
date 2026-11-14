// La bande-son en direct (§18.39), sur un faux contexte audio : elle suit
// l'horloge de la vidéo (se tait quand l'image cale, se recale quand elle
// repart ou saute), ne crée rien si le son est coupé, joue le film sans son et
// sans erreur si le contexte reste suspendu, et ne laisse aucune source tourner
// à la fin.
import { describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../../../shared/fixtures";
import { filmPlan, FPS } from "../../../shared/film";
import type { CardData, Stars } from "../../../shared/types";

vi.mock("./audio", () => ({ readMuted: () => false, sharedAudio: () => null }));
const { createFilmSound } = await import("./filmSound");

const OVERALL: Record<Stars, number> = { 1: 12, 2: 33, 3: 50, 4: 66, 5: 80, 6: 93 };
const planAt = (n: Stars) => filmPlan({ ...FIXTURES.silver, id: `t${n}`, overall: OVERALL[n] } as CardData);

/** Un paramètre qui refuse ce qu'un navigateur refuserait : valeur ou heure non finie, rampe exponentielle vers zéro. */
class FakeParam {
  value: number;
  calls = 0;
  constructor(v = 0) {
    this.value = v;
  }
  private check(v: number, t: number) {
    if (!Number.isFinite(v) || !Number.isFinite(t) || t < 0) throw new RangeError(`valeur ${v} à ${t}`);
    this.calls++;
    return this;
  }
  setValueAtTime(v: number, t: number) {
    return this.check(v, t);
  }
  linearRampToValueAtTime(v: number, t: number) {
    return this.check(v, t);
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    if (v <= 0) throw new RangeError("rampe exponentielle vers zéro");
    return this.check(v, t);
  }
  setTargetAtTime(v: number, t: number, k: number) {
    if (!(k > 0)) throw new RangeError("constante de temps");
    return this.check(v, t);
  }
  cancelScheduledValues(t: number) {
    return this.check(0, t);
  }
  cancelAndHoldAtTime(t: number) {
    return this.check(0, t);
  }
}

class FakeNode {
  connected = 0;
  disconnected = false;
  connect(n: unknown) {
    this.connected++;
    return n;
  }
  disconnect() {
    this.disconnected = true;
  }
}
class FakeSource extends FakeNode {
  started = false;
  stoppedAt: number | null = null;
  frequency = new FakeParam(440);
  detune = new FakeParam(0);
  type = "sine";
  buffer: unknown = null;
  loop = false;
  start() {
    this.started = true;
  }
  stop(t = 0) {
    this.stoppedAt = t;
  }
}

class FakeContext {
  state: "running" | "suspended" = "running";
  currentTime = 0;
  sampleRate = 8000;
  destination = new FakeNode();
  nodes: FakeNode[] = [];
  sources: FakeSource[] = [];
  private add<T extends FakeNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }
  createGain() {
    return this.add(Object.assign(new FakeNode(), { gain: new FakeParam(1) }));
  }
  createBiquadFilter() {
    return this.add(Object.assign(new FakeNode(), { type: "lowpass", frequency: new FakeParam(350), Q: new FakeParam(1) }));
  }
  createWaveShaper() {
    return this.add(Object.assign(new FakeNode(), { curve: null }));
  }
  createDynamicsCompressor() {
    const p = () => new FakeParam(0);
    return this.add(Object.assign(new FakeNode(), { threshold: p(), knee: p(), ratio: p(), attack: p(), release: p() }));
  }
  createOscillator() {
    const s = this.add(new FakeSource());
    this.sources.push(s);
    return s;
  }
  createBufferSource() {
    const s = this.add(new FakeSource());
    this.sources.push(s);
    return s;
  }
  createBuffer(channels: number, length: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { getChannelData: (c: number) => data[c] };
  }
}

/** Une lecture : l'horloge du contexte et celle du film avancent ensemble, rafraîchissement par rafraîchissement. */
function harness(n: Stars, ctx: FakeContext | null = new FakeContext(), muted = false) {
  const timers: { at: number; fn: () => void }[] = [];
  let ms = 0;
  const getCtx = vi.fn(() => ctx as unknown as BaseAudioContext);
  const sound = createFilmSound(planAt(n), {
    context: getCtx,
    muted,
    now: () => ms,
    setTimer: (fn, delay) => timers.push({ at: ms + delay, fn }),
    clearTimer: () => undefined,
  });
  const advance = (dt: number) => {
    ms += dt * 1000;
    if (ctx) ctx.currentTime += dt;
    for (const t of timers.splice(0)) {
      if (t.at <= ms) t.fn();
      else timers.push(t);
    }
  };
  /** Joue de `from` à `to` (secondes du film), à 60 rafraîchissements par seconde ; l'image avance par pas de 1/24 s. */
  const play = (from: number, to: number) => {
    for (let t = from; t < to; t += 1 / 60) {
      sound.tick(Math.floor(t * FPS) / FPS);
      advance(1 / 60);
    }
  };
  return { sound, ctx, getCtx, advance, play, timers };
}

describe("la bande-son en direct", () => {
  it("contexte suspendu : le film joue sans son, sans erreur, sans rien construire", () => {
    const ctx = new FakeContext();
    ctx.state = "suspended";
    const h = harness(3, ctx);
    expect(() => h.play(0, 3)).not.toThrow();
    expect(h.sound.state().built).toBe(false);
    expect(ctx.nodes).toHaveLength(0);
    // le contexte n'est pas réclamé à chaque image
    expect(h.getCtx.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("pas de Web Audio du tout : rien ne lève", () => {
    const h = harness(2, null);
    expect(() => h.play(0, 1)).not.toThrow();
    expect(h.sound.state().built).toBe(false);
  });

  it("son coupé : aucun contexte réclamé, aucun nœud", () => {
    const h = harness(4, new FakeContext(), true);
    h.play(0, 2);
    expect(h.getCtx).not.toHaveBeenCalled();
    expect(h.ctx!.nodes).toHaveLength(0);
  });

  it("le contexte se réveille en cours de route : le son part, calé sur l'image", () => {
    const ctx = new FakeContext();
    ctx.state = "suspended";
    const h = harness(2, ctx);
    h.play(0, 1);
    ctx.state = "running";
    h.play(1, 3);
    const s = h.sound.state();
    expect(s.built).toBe(true);
    expect(s.scheduledTo).toBeGreaterThan(2.9);
    expect(s.scheduledTo).toBeLessThanOrEqual(3 + 0.2 + 1e-9);
  });

  it("pose les sons par petites fenêtres, jamais au-delà de 200 ms d'avance", () => {
    const h = harness(6);
    h.play(0, 4);
    const s = h.sound.state();
    expect(s.built).toBe(true);
    expect(s.resyncs).toBe(1);
    expect(s.scheduledTo).toBeGreaterThan(3.9);
    expect(s.scheduledTo).toBeLessThanOrEqual(4.2 + 1e-9);
    // un graphe fixe et sobre : pas de nœud par note
    const n = h.ctx!.nodes.length;
    h.play(4, 8);
    expect(h.ctx!.nodes.length).toBe(n);
    expect(n).toBeLessThan(110);
  });

  it("l'image cale : le son se tait ; elle repart : il se recale", () => {
    const h = harness(3);
    h.play(0, 2);
    const t = 2;
    for (let i = 0; i < 20; i++) {
      h.sound.tick(t);
      h.advance(1 / 60);
    }
    expect(h.sound.state().stalled).toBe(true);
    const posed = h.sound.state().scheduledTo;
    h.sound.tick(t); // toujours figée : rien de plus n'est posé
    expect(h.sound.state().scheduledTo).toBe(posed);
    h.play(t + 1 / FPS, 3);
    expect(h.sound.state().stalled).toBe(false);
    expect(h.sound.state().resyncs).toBe(2);
    expect(h.sound.state().scheduledTo).toBeGreaterThan(2.9);
  });

  it("un saut de l'image (seek) recale le son", () => {
    const h = harness(5);
    h.play(0, 1);
    h.play(6, 7);
    expect(h.sound.state().resyncs).toBe(2);
    expect(h.sound.state().scheduledTo).toBeGreaterThan(6.9);
  });

  it("pause (onglet caché) : le son se tait, et repart à la reprise", () => {
    const h = harness(2);
    h.play(0, 1);
    h.sound.pause();
    expect(h.sound.state().stalled).toBe(true);
    h.advance(5);
    h.play(1, 2);
    expect(h.sound.state().stalled).toBe(false);
  });

  it.each([1, 6] as Stars[])("%i étoile(s) : à la fin du film, toutes les sources sont arrêtées et débranchées", (n) => {
    const h = harness(n);
    const plan = planAt(n);
    h.play(0, plan.duration + 0.05);
    h.sound.tick(plan.duration);
    expect(h.sound.state().scheduledTo).toBeCloseTo(plan.duration, 9);
    h.advance(2);
    h.advance(1);
    const ctx = h.ctx!;
    expect(ctx.sources.length).toBeGreaterThan(0);
    expect(ctx.sources.every((s) => s.started && s.stoppedAt !== null)).toBe(true);
    expect(ctx.nodes.every((x) => x.disconnected)).toBe(true);
    expect(h.sound.state().built).toBe(false);
    // et rien ne repart après la fin
    h.sound.tick(plan.duration);
    expect(h.sound.state().built).toBe(false);
  });

  it("couper le son en cours de route libère tout ; le rétablir reconstruit", () => {
    const h = harness(4);
    h.play(0, 2);
    const first = h.ctx!.sources.slice();
    h.sound.setMuted(true);
    h.advance(0.5);
    expect(first.every((s) => s.stoppedAt !== null)).toBe(true);
    expect(h.sound.state().built).toBe(false);
    h.sound.setMuted(false);
    h.play(2.5, 3.5);
    expect(h.sound.state().built).toBe(true);
  });

  it("le démontage arrête tout", () => {
    const h = harness(6);
    h.play(0, 1);
    h.sound.dispose();
    h.advance(1);
    expect(h.ctx!.sources.every((s) => s.stoppedAt !== null)).toBe(true);
    h.sound.tick(2);
    expect(h.sound.state().built).toBe(false);
  });
});
