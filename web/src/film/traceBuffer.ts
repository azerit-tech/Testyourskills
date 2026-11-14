// Le tampon de la trace du film (trace.ts, traceRecorder.ts) : pur, sans DOM,
// testé par traceBuffer.test.ts. Il garde les lignes à envoyer, limite les
// `timeupdate` (les trois premiers de chaque balise, puis un par seconde),
// découpe l'envoi en lots assez petits pour `fetch` keepalive et `sendBeacon`
// (64 Ko au plus côté navigateur), et retient les dernières lignes marquantes
// pour le calque à l'écran.

/** Une ligne de la trace : `t` en ms depuis le début de la trace, `k` son genre. */
export interface TraceLine {
  t: number;
  k: string;
  [field: string]: unknown;
}

/** Les `timeupdate` gardés d'emblée pour chaque balise, avant la limite d'un par seconde. */
export const TIMEUPDATE_FIRST = 3;
export const TIMEUPDATE_EVERY_MS = 1000;
/** Un lot : sous la limite de 64 Ko de keepalive et de sendBeacon, et sous les 128 Ko du serveur. */
export const BATCH_MAX_BYTES = 48 * 1024;
export const BATCH_MAX_LINES = 400;
/** Au-delà (serveur injoignable), les plus anciennes lignes sont oubliées. */
export const QUEUE_MAX_LINES = 5000;
/** Les lignes marquantes montrées à l'écran. */
export const SHOWN_LINES = 8;

/** Une ligne marquante (événement, étape, action) : ni instantané, ni `timeupdate`. */
export function notable(line: TraceLine): boolean {
  return line.k !== "snap" && !(line.k === "ev" && line.e === "timeupdate");
}

export class TraceBuffer {
  private queue: TraceLine[] = [];
  private tu = new Map<string, { n: number; lastAt: number }>();
  private recent: TraceLine[] = [];
  /** Lignes oubliées faute d'envoi. */
  lost = 0;

  /** Un `timeupdate` de la balise `tag` à l'instant `now` (ms) : à garder ? */
  keepTimeupdate(tag: string, now: number): boolean {
    const s = this.tu.get(tag) ?? { n: 0, lastAt: -Infinity };
    this.tu.set(tag, s);
    if (s.n < TIMEUPDATE_FIRST || now - s.lastAt >= TIMEUPDATE_EVERY_MS) {
      s.n++;
      s.lastAt = now;
      return true;
    }
    return false;
  }

  push(line: TraceLine): void {
    this.queue.push(line);
    if (this.queue.length > QUEUE_MAX_LINES) {
      const over = this.queue.length - QUEUE_MAX_LINES;
      this.queue.splice(0, over);
      this.lost += over;
    }
    if (notable(line)) {
      this.recent.push(line);
      if (this.recent.length > SHOWN_LINES) this.recent.shift();
    }
  }

  get size(): number {
    return this.queue.length;
  }

  /** Les dernières lignes marquantes, la plus ancienne d'abord. */
  shown(): TraceLine[] {
    return this.recent.slice();
  }

  /** Vide la file en lots ; une ligne seule trop grosse part seule (le serveur la refusera). */
  takeBatches(maxBytes = BATCH_MAX_BYTES, maxLines = BATCH_MAX_LINES): TraceLine[][] {
    const out: TraceLine[][] = [];
    let cur: TraceLine[] = [];
    let bytes = 0;
    for (const line of this.queue) {
      const n = byteLength(JSON.stringify(line)) + 1;
      if (cur.length && (bytes + n > maxBytes || cur.length >= maxLines)) {
        out.push(cur);
        cur = [];
        bytes = 0;
      }
      cur.push(line);
      bytes += n;
    }
    if (cur.length) out.push(cur);
    this.queue = [];
    return out;
  }

  /** Un lot qui n'est pas parti : il repasse en tête de la file. */
  requeue(lines: TraceLine[]): void {
    this.queue = lines.concat(this.queue);
    if (this.queue.length > QUEUE_MAX_LINES) {
      const over = this.queue.length - QUEUE_MAX_LINES;
      this.queue.splice(0, over);
      this.lost += over;
    }
  }
}

/** Taille UTF-8 d'une chaîne, sans TextEncoder (tests, vieux navigateurs). */
export function byteLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}
