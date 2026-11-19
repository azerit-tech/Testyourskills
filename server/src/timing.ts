// Le chronométrage d'une fiche (SPEC §18.89) : où passent ses secondes, phase par
// phase, et une ligne compacte au journal quand elle sort. Le pipeline ouvre une
// trace par fiche ; les modules du moteur (collecte GitHub, lecture du profil,
// appels IA) y versent leurs temps sans rien recevoir en paramètre : la trace
// suit le fil asynchrone de la fiche (AsyncLocalStorage). Hors d'une fiche
// (scripts, tests), tout est sans effet. Jamais de contenu : des noms de phase,
// des durées, des comptes de tokens et d'appels.

import { AsyncLocalStorage } from "node:async_hooks";

export interface Phase {
  name: string;
  /** Début, en ms depuis le début du traitement de la fiche. */
  at: number;
  ms: number;
  ok: boolean;
}

export interface AiTiming {
  /** La lecture qui a fait l'appel (`readCode`, `readCv`). */
  label: string;
  model: string;
  at: number;
  ms: number;
  inputTokens: number;
  outputTokens: number;
  /** Tokens d'entrée lus dans le cache de prompt. */
  cachedTokens: number;
  /** Tokens de sortie dépensés à raisonner avant de répondre (compris dans `outputTokens`). */
  reasoningTokens: number;
  /** `stop`, `length`…, ou `error` si l'appel a échoué. */
  finish: string;
}

export class Trace {
  readonly phases: Phase[] = [];
  readonly ai: AiTiming[] = [];
  readonly counts: Record<string, number> = {};
  private readonly t0: number;

  constructor(private readonly clock: () => number = () => performance.now()) {
    this.t0 = clock();
  }

  /** Ms écoulées depuis le début du traitement. */
  elapsed(): number {
    return this.clock() - this.t0;
  }

  async phase<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const at = this.elapsed();
    let ok = false;
    try {
      const v = await fn();
      ok = true;
      return v;
    } finally {
      this.phases.push({ name, at, ms: this.elapsed() - at, ok });
    }
  }

  phaseSync<T>(name: string, fn: () => T): T {
    const at = this.elapsed();
    let ok = false;
    try {
      const v = fn();
      ok = true;
      return v;
    } finally {
      this.phases.push({ name, at, ms: this.elapsed() - at, ok });
    }
  }

  count(name: string, n = 1): void {
    this.counts[name] = (this.counts[name] ?? 0) + n;
  }

  /** Un appel IA qui a commencé il y a `ms`. */
  noteAi(call: Omit<AiTiming, "at">): void {
    this.ai.push({ ...call, at: Math.max(0, this.elapsed() - call.ms) });
  }

  /**
   * La ligne du journal. Chaque phase : `nom@début+durée`, en secondes depuis le
   * début du traitement (une phase qui a échoué porte un `!`). Les étapes de la
   * collecte GitHub (`gh.*`) ne sont pas listées : la collecte dit seulement
   * laquelle a fini la dernière, et ses comptes d'appels. Une lecture IA dit son
   * modèle, ses tokens d'entrée → de sortie, et la part d'entrée lue en cache.
   */
  line(head: string): string {
    const s = (ms: number) => (ms / 1000).toFixed(1);
    const subs = this.phases.filter((p) => p.name.startsWith("gh."));
    const last = subs.reduce<Phase | null>((a, p) => (!a || p.at + p.ms > a.at + a.ms ? p : a), null);
    const calls = ["rest", "graphql", "raw"].filter((k) => this.counts[k]).map((k) => `${k} ${this.counts[k]}`);
    const parts = this.phases
      .filter((p) => !p.name.startsWith("gh."))
      .sort((a, b) => a.at - b.at)
      .map((p) => {
        let out = `${p.name}@${s(p.at)}+${s(p.ms)}${p.ok ? "" : "!"}`;
        const notes: string[] = [];
        if (p.name === "faits") {
          if (last) notes.push(`fin ${last.name.slice(3)}`);
          notes.push(...calls);
        }
        // Les appels IA de la phase : ceux qui ont commencé pendant elle, sous son nom de lecture.
        for (const a of this.ai.filter((a) => AI_PHASE[a.label] === p.name && a.at >= p.at - 1 && a.at <= p.at + p.ms)) {
          const detail = [a.reasoningTokens ? `raisonnement ${a.reasoningTokens}` : "", a.cachedTokens ? `cache ${a.cachedTokens}` : ""].filter(Boolean).join(" ");
          notes.push(`${shortModel(a.model)} ${a.inputTokens}→${a.outputTokens}${detail ? ` ${detail}` : ""} ${s(a.ms)}s${a.finish === "stop" ? "" : ` ${a.finish}`}`);
        }
        if (notes.length) out += ` (${notes.join(", ")})`;
        return out;
      });
    const extra = Object.entries(this.counts)
      .filter(([k]) => !["rest", "graphql", "raw"].includes(k))
      .map(([k, n]) => `${k} ${n}`);
    return [head, ...parts, ...extra].join(" · ");
  }
}

/** La phase du pipeline où tombe chaque lecture IA. */
const AI_PHASE: Record<string, string> = { readCode: "code", readCv: "parcours" };

const shortModel = (m: string) => m.split("/").pop() ?? m;

const storage = new AsyncLocalStorage<Trace>();

/** Exécute `fn` avec `trace` pour trace courante, pour tout ce qu'elle lance. */
export function withTrace<T>(trace: Trace, fn: () => T): T {
  return storage.run(trace, fn);
}

export function currentTrace(): Trace | undefined {
  return storage.getStore();
}

/** Chronomètre `fn` dans la trace de la fiche en cours ; sans trace, l'appelle simplement. */
export function phase<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t = storage.getStore();
  return t ? t.phase(name, fn) : fn();
}

export function phaseSync<T>(name: string, fn: () => T): T {
  const t = storage.getStore();
  return t ? t.phaseSync(name, fn) : fn();
}

export function count(name: string, n = 1): void {
  storage.getStore()?.count(name, n);
}

export function noteAi(call: Omit<AiTiming, "at">): void {
  storage.getStore()?.noteAi(call);
}
