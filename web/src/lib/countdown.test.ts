// « J'ai trouvé ton GitHub » (SPEC §18.113) : validé seul au bout de 3 s d'onglet
// visible, « Ce n'est pas moi » l'arrête, l'onglet caché le met en pause.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTO_CONFIRM_MS, startCountdown, type CountdownEnv } from "./countdown";

let hidden = false;
const listeners = new Set<() => void>();
const env: CountdownEnv = {
  now: () => Date.now(),
  hidden: () => hidden,
  onVisibility(cb) {
    listeners.add(cb);
    return () => void listeners.delete(cb);
  },
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};
const setHidden = (h: boolean) => {
  hidden = h;
  for (const cb of [...listeners]) cb();
};

beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  listeners.clear();
});
afterEach(() => vi.useRealTimers());

describe("le compte à rebours de la validation", () => {
  it("valide seul au bout de 3 secondes, une fois, puis se désabonne", () => {
    const done = vi.fn();
    startCountdown(AUTO_CONFIRM_MS, done, undefined, env);
    vi.advanceTimersByTime(2999);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(done).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(done).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
  });

  it("« Ce n'est pas moi » l'arrête : rien n'est validé", () => {
    const done = vi.fn();
    const c = startCountdown(AUTO_CONFIRM_MS, done, undefined, env);
    vi.advanceTimersByTime(2000);
    c.cancel();
    vi.advanceTimersByTime(10_000);
    setHidden(true);
    setHidden(false);
    vi.advanceTimersByTime(10_000);
    expect(done).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });

  it("l'onglet caché le met en pause ; il reprend où il en était", () => {
    const done = vi.fn();
    const pause = vi.fn();
    startCountdown(AUTO_CONFIRM_MS, done, pause, env);
    vi.advanceTimersByTime(1000);
    setHidden(true);
    expect(pause).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(60_000);
    expect(done).not.toHaveBeenCalled();
    setHidden(false);
    expect(pause).toHaveBeenLastCalledWith(false);
    vi.advanceTimersByTime(1999);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("lancé onglet caché : il attend que l'onglet se montre", () => {
    hidden = true;
    const done = vi.fn();
    startCountdown(AUTO_CONFIRM_MS, done, undefined, env);
    vi.advanceTimersByTime(60_000);
    expect(done).not.toHaveBeenCalled();
    setHidden(false);
    vi.advanceTimersByTime(AUTO_CONFIRM_MS);
    expect(done).toHaveBeenCalledTimes(1);
  });
});
