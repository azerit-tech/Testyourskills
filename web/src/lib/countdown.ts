// Le compte à rebours honnête de « J'ai trouvé ton GitHub » (SPEC §18.113) : trois
// secondes à l'écran, pas une de moins. Il ne court que l'onglet visible ; caché, il
// s'arrête où il en est et reprend au retour. `cancel` l'arrête pour de bon.

/** Ce que le compte à rebours lit du navigateur ; les tests en donnent un faux. */
export interface CountdownEnv {
  now(): number;
  hidden(): boolean;
  /** Appelle `cb` à chaque changement de visibilité ; rend de quoi se désabonner. */
  onVisibility(cb: () => void): () => void;
  setTimeout(cb: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export const AUTO_CONFIRM_MS = 3000;

export function browserEnv(): CountdownEnv {
  return {
    now: () => performance.now(),
    hidden: () => typeof document !== "undefined" && document.visibilityState === "hidden",
    onVisibility(cb) {
      if (typeof document === "undefined") return () => {};
      document.addEventListener("visibilitychange", cb);
      return () => document.removeEventListener("visibilitychange", cb);
    },
    setTimeout: (cb, ms) => window.setTimeout(cb, ms),
    clearTimeout: (id) => window.clearTimeout(id as number),
  };
}

export interface Countdown {
  /** Arrête le compte à rebours : `onDone` ne viendra plus. */
  cancel(): void;
}

/**
 * Lance le compte à rebours : `onDone` une fois, après `ms` passées onglet visible.
 * `onPause(true)` quand l'onglet se cache, `onPause(false)` quand il revient (la barre suit).
 */
export function startCountdown(ms: number, onDone: () => void, onPause: (paused: boolean) => void = () => {}, env: CountdownEnv = browserEnv()): Countdown {
  let left = ms;
  let since = 0;
  let timer: unknown = null;
  let over = false;
  const run = () => {
    if (over || timer !== null) return;
    since = env.now();
    timer = env.setTimeout(() => {
      timer = null;
      if (over) return;
      over = true;
      off();
      onDone();
    }, left);
    onPause(false);
  };
  const pause = () => {
    if (over || timer === null) return;
    env.clearTimeout(timer);
    timer = null;
    left = Math.max(0, left - (env.now() - since));
    onPause(true);
  };
  const off = env.onVisibility(() => (env.hidden() ? pause() : run()));
  if (env.hidden()) onPause(true);
  else run();
  return {
    cancel() {
      if (over) return;
      over = true;
      if (timer !== null) env.clearTimeout(timer);
      timer = null;
      off();
    },
  };
}
