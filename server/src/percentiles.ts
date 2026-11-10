// La référence du rang (SPEC §18.3, et la calibration du §4.6) : des profils
// GitHub sourcés par Azerit passent dans le vrai moteur, un à la fois, et il
// n'en sort que des agrégats (data/percentiles.json). Lancé par
// scripts/percentiles.ts ; le moteur, GitHub, l'IA, l'horloge et le disque
// arrivent par options pour que les tests tournent sans réseau.
//
// Confidentialité : le fichier de travail (var/percentiles-work.jsonl, ignoré
// par git) ne garde par profil qu'un hachage salé du pseudo et les notes
// calculées ; la sortie ne garde que des centiles et des fréquences. Les
// journaux ne citent jamais un pseudo, seulement un rang dans la file.

import { createHmac, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CodeReadingResult } from "../../shared/readings";
import type { StatCode } from "../../shared/types";
import { parseLogin } from "./github/detect";
import type { TokenPool } from "./github/tokens";
import { CARD_GITHUB_NEED, isAiClosed, type Deps } from "./pipeline";
import { SCORING, STATUSES } from "./scoring/config";
import { centilesOf, MIN_GROUP, type CentileGroup, type PercentileTable } from "./scoring/percentile";

export type Engine = Pick<Deps, "collectGithub" | "pickFilesForReading" | "readCode" | "aiAvailable" | "scoreGithub">;

export const DEFAULT_AI_SAMPLE = 300;
export const DEFAULT_MAX_USD = 3;
/** Échecs « rate_limited » de suite sur un même profil avant d'abandonner ce profil pour ce passage. */
const MAX_GITHUB_RETRIES = 6;
/** GitHub dit « limite » mais le pool ne sait pas quand elle tombe : on attend une minute. */
const BLIND_WAIT_MS = 60_000;

export interface RunOptions {
  /** Lignes brutes du fichier de pseudos (un par ligne ; vides, `#` et invalides ignorés). */
  lines: string[];
  workPath: string;
  outPath: string;
  engine: Engine;
  pool: TokenPool;
  /** Dépense IA cumulée de ce processus, en dollars (aiCostToday().usd en vrai). */
  spentUsd: () => number;
  aiSample?: number;
  maxUsd?: number;
  /** Sel du hachage ; sinon celui du fichier de travail, sinon tiré au hasard. */
  salt?: string;
  /** N'appelle ni GitHub ni l'IA : écrit la sortie depuis le fichier de travail tel quel. */
  aggregateOnly?: boolean;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
  log?: (line: string) => void;
  /** Taille minimale d'un groupe écrit (100, SPEC §18.3) ; abaissée par les tests seulement. */
  minGroup?: number;
}

export interface RunResult {
  /** false : interrompu, la sortie n'a pas été écrite ; relancer reprend. */
  complete: boolean;
  /** Table écrite, ou null (interrompu, ou trop peu de profils). */
  table: PercentileTable | null;
  scored: number;
  skipped: number;
  failed: number;
  aiReads: number;
  spentUsd: number;
}

// --- Fichier de travail -----------------------------------------------------

interface HeaderLine {
  k: "header";
  format: 1;
  salt: string;
  createdAt: string;
}

/** Les notes d'un profil, sans pseudo. */
export interface CardLine {
  k: "card";
  /** Hachage salé du pseudo en minuscules. */
  h: string;
  /** Version du barème qui a noté. */
  v: string;
  overall: number;
  stats: Record<StatCode, number>;
  /** TEC sans lecture IA (repli + bonus PR), pour imputer les profils non lus. */
  tecFallback: number;
  /** La lecture IA a rendu au moins un repo : TEC réel. */
  tecReal: boolean;
  language: string | null;
  position: string;
  statuses: string[];
  /** Dépense IA de ce profil, en dollars. */
  usd: number;
}

/** Pseudo inconnu ou organisation : rien à noter, on ne le redemande pas. */
interface SkipLine {
  k: "skip";
  h: string;
  why: string;
}

type WorkLine = HeaderLine | CardLine | SkipLine;

export function hashLogin(salt: string, login: string): string {
  return createHmac("sha256", salt).update(login.toLowerCase()).digest("hex").slice(0, 32);
}

/** Lit le fichier de travail ; une dernière ligne coupée (interruption pendant l'écriture) est ignorée. */
export function readWork(path: string): { header: HeaderLine | null; lines: (CardLine | SkipLine)[] } {
  if (!existsSync(path)) return { header: null, lines: [] };
  let header: HeaderLine | null = null;
  const lines: (CardLine | SkipLine)[] = [];
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    if (!raw.trim()) continue;
    let l: WorkLine;
    try {
      l = JSON.parse(raw) as WorkLine;
    } catch {
      continue;
    }
    if (l.k === "header") header ??= l;
    else if (l.k === "card" || l.k === "skip") lines.push(l);
  }
  return { header, lines };
}

function append(path: string, line: WorkLine): void {
  appendFileSync(path, JSON.stringify(line) + "\n");
}

/** Pseudos valides, en minuscules, sans doublon, dans l'ordre du fichier ; et le nombre de lignes rejetées. */
export function parseLogins(lines: string[]): { logins: string[]; invalid: number } {
  const seen = new Set<string>();
  let invalid = 0;
  for (const raw of lines) {
    const s = raw.trim();
    if (!s || s.startsWith("#")) continue;
    const login = parseLogin(s)?.toLowerCase();
    if (!login) {
      invalid++;
      continue;
    }
    seen.add(login);
  }
  return { logins: [...seen], invalid };
}

// --- Agrégats ---------------------------------------------------------------

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const v = [...xs].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Note globale de référence d'un profil : celle de sa fiche, la note de la grille
 * (barème 0.4.0). Un profil sans lecture IA y a déjà son sort, « code non prouvé »
 * (critère Code hors moyenne, plafond 85) : lui imputer un TEC, qui n'entre plus
 * dans la note, la fausserait.
 */
export function referenceOverall(l: CardLine): number {
  return l.overall;
}

/** La table de data/percentiles.json, ou null s'il y a moins de `minGroup` profils notés sur ce barème. */
export function aggregate(lines: CardLine[], opts: { minGroup?: number; now?: () => number } = {}): PercentileTable | null {
  const minGroup = opts.minGroup ?? MIN_GROUP;
  const cards = lines.filter((l) => l.v === SCORING.version);
  if (cards.length < minGroup || !cards.length) return null;

  const read = cards.filter((l) => l.tecReal);
  // Mesuré pour la barre TEC, plus pour la note : voir referenceOverall.
  const imputedDelta = median(read.map((l) => l.stats.TEC - l.tecFallback));
  const scored = cards.map((l) => ({ l, overall: referenceOverall(l) }));

  const groupOf = (xs: number[]): CentileGroup | undefined =>
    xs.length >= minGroup && xs.length ? { n: xs.length, centiles: centilesOf(xs) } : undefined;
  const byKey = (key: (l: CardLine) => string | null) => {
    const m = new Map<string, number[]>();
    for (const { l, overall } of scored) {
      const k = key(l);
      if (k) m.set(k, [...(m.get(k) ?? []), overall]);
    }
    const out: Record<string, CentileGroup> = {};
    for (const [k, xs] of [...m].sort(([a], [b]) => a.localeCompare(b))) {
      const g = groupOf(xs);
      if (g) out[k] = g;
    }
    return out;
  };

  // Fréquence des statuts : tout le catalogue GitHub (0 si jamais vu). Les
  // statuts de l'IA ne se comptent que sur les profils lus, et seulement s'ils sont assez nombreux.
  const counts = new Map<string, number>();
  for (const l of cards) for (const id of new Set(l.statuses)) counts.set(id, (counts.get(id) ?? 0) + 1);
  const defs = STATUSES.statuses.filter((d) => d.source !== "cv");
  const aiIds = new Set(defs.filter((d) => d.source === "ai").map((d) => d.id));
  const ids = [...new Set([...defs.map((d) => d.id), ...counts.keys()])].sort();
  const statuses: Record<string, number> = {};
  for (const id of ids) {
    const base = aiIds.has(id) ? read.length : cards.length;
    if (base < minGroup || !base) continue;
    statuses[id] = round1((100 * (counts.get(id) ?? 0)) / base);
  }

  const all = groupOf(scored.map((s) => s.overall));
  return {
    scoringVersion: SCORING.version,
    source: "github",
    generatedAt: new Date((opts.now ?? Date.now)()).toISOString().slice(0, 10),
    profiles: cards.length,
    tec: { real: read.length, imputedDelta },
    minGroup,
    overall: {
      ...(all ? { all } : {}),
      language: byKey((l) => l.language),
      position: byKey((l) => l.position),
    },
    statuses,
  };
}

/** JSON lisible, les listes de nombres sur une ligne. */
export function formatTable(t: PercentileTable): string {
  return (
    JSON.stringify(t, null, 2).replace(/\[\s*(-?[\d.]+(?:,\s*-?[\d.]+)*)\s*\]/g, (_, body: string) => `[${body.split(/,\s*/).join(", ")}]`) + "\n"
  );
}

// --- Passage ----------------------------------------------------------------

function errCode(e: unknown): string | undefined {
  const c = (e as { code?: unknown } | null)?.code;
  return typeof c === "string" ? c : undefined;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

function duration(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
}

const usd = (x: number) => `${x.toFixed(2).replace(".", ",")} $`;

export async function runPercentiles(opts: RunOptions): Promise<RunResult> {
  const { engine, pool, signal } = opts;
  const log = opts.log ?? ((s: string) => console.error(s));
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const aiSample = Math.max(0, Math.floor(opts.aiSample ?? DEFAULT_AI_SAMPLE));
  const maxUsd = opts.maxUsd ?? DEFAULT_MAX_USD;
  const minGroup = opts.minGroup ?? MIN_GROUP;

  // Fichier de travail : son sel fait foi, pour retrouver les profils déjà notés.
  mkdirSync(dirname(opts.workPath), { recursive: true });
  const work = readWork(opts.workPath);
  // Arrêt brutal pendant une écriture : la ligne coupée reste seule sur la sienne,
  // sans se coller à la prochaine.
  if (existsSync(opts.workPath)) {
    const text = readFileSync(opts.workPath, "utf8");
    if (text && !text.endsWith("\n")) appendFileSync(opts.workPath, "\n");
  }
  if (work.header && opts.salt && opts.salt !== work.header.salt) {
    throw new Error(`le fichier de travail ${opts.workPath} a un autre sel : retire --salt, ou supprime le fichier pour repartir de zéro`);
  }
  const salt = work.header?.salt ?? opts.salt ?? randomBytes(16).toString("hex");
  if (!work.header) {
    if (work.lines.length) throw new Error(`${opts.workPath} n'a pas d'en-tête : fichier abîmé, supprime-le pour repartir de zéro`);
    append(opts.workPath, { k: "header", format: 1, salt, createdAt: new Date(now()).toISOString() });
  }

  const cards = new Map<string, CardLine>();
  const skips = new Set<string>();
  let stale = 0;
  for (const l of work.lines) {
    if (l.k === "skip") skips.add(l.h);
    else if (l.v === SCORING.version) cards.set(l.h, l);
    else stale++;
  }
  // Le plafond couvre tous les passages, lignes d'un ancien barème comprises : c'est le même argent.
  const paid = work.lines.filter((l): l is CardLine => l.k === "card" && l.usd > 0);
  let spent = paid.reduce((s, l) => s + l.usd, 0);
  const priorReads = paid.length;

  const result = (complete: boolean, table: PercentileTable | null, failed: number, aiReads: number): RunResult => ({
    complete,
    table,
    scored: cards.size,
    skipped: skips.size,
    failed,
    aiReads,
    spentUsd: spent,
  });
  const finish = (failed: number, aiReads: number): RunResult => {
    const table = aggregate([...cards.values()], { minGroup, now });
    if (!table) {
      log(`Seulement ${cards.size} profils notés sur le barème ${SCORING.version} : il en faut au moins ${minGroup}. Rien d'écrit.`);
      return result(true, null, failed, aiReads);
    }
    mkdirSync(dirname(opts.outPath), { recursive: true });
    writeFileSync(opts.outPath, formatTable(table));
    const groups = Object.keys(table.overall.language).length + Object.keys(table.overall.position).length;
    log(
      `Écrit ${opts.outPath} : ${table.profiles} profils, dont ${table.tec.real} avec le TEC réel (lecture IA)` +
        (table.tec.real < table.profiles
          ? `, les autres notés « code non prouvé »` +
            (table.tec.imputedDelta === null ? "" : ` (écart médian du TEC réel au repli : ${table.tec.imputedDelta})`)
          : "") +
        ` · ${groups} groupe(s) langage ou poste d'au moins ${minGroup} profils · dépense IA ${usd(spent)}.`,
    );
    return result(true, table, failed, aiReads);
  };

  if (opts.aggregateOnly) return finish(0, 0);

  const { logins, invalid } = parseLogins(opts.lines);
  // Ordre de passage et échantillon IA : l'ordre des hachages, donc au hasard
  // (le sel) mais stable d'un passage à l'autre, et sans dépendre de l'ordre du
  // fichier (souvent trié par campagne). L'échantillon passe en premier.
  const queue = logins.map((login) => ({ login, h: hashLogin(salt, login) })).sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0));
  const sampled = new Set(queue.slice(0, aiSample).map((x) => x.h));
  const todo = queue.filter((x) => !cards.has(x.h) && !skips.has(x.h));

  log(
    `${logins.length} pseudos${invalid ? ` (${invalid} ligne(s) invalide(s) ignorée(s))` : ""} · ` +
      `${logins.length - todo.length} déjà faits · ${todo.length} à faire` +
      (stale ? ` · ${stale} ligne(s) d'un ancien barème refaites` : "") +
      ` · échantillon IA ${sampled.size} · plafond IA ${usd(maxUsd)} (déjà ${usd(spent)})`,
  );
  if (!engine.aiAvailable()) log("IA non configurée (OPENROUTER_API_KEY) : aucun TEC réel, tout le monde au TEC de repli.");

  // GitHub : on attend la remise à zéro plutôt que d'échouer.
  const waitForGithub = async () => {
    if (pool.anonymous) return;
    for (let r = pool.readiness(CARD_GITHUB_NEED); !r.ok && !signal?.aborted; r = pool.readiness(CARD_GITHUB_NEED)) {
      const ms = r.waitMs + 1000;
      log(`GitHub à sec : pause de ${duration(ms)}, reprise vers ${new Date(now() + ms).toTimeString().slice(0, 5)}.`);
      await sleep(ms, signal);
    }
  };
  const github = async <T>(fn: () => Promise<T>): Promise<T> => {
    for (let attempt = 1; ; attempt++) {
      await waitForGithub();
      if (signal?.aborted) throw signal.reason ?? new Error("interrompu");
      try {
        return await fn();
      } catch (e) {
        if (errCode(e) !== "rate_limited" || attempt >= MAX_GITHUB_RETRIES || signal?.aborted) throw e;
        // Le pool sait d'habitude quand la limite tombe ; sinon, une minute.
        if (pool.anonymous || pool.readiness(CARD_GITHUB_NEED).ok) {
          log(`GitHub demande de ralentir : pause de ${duration(BLIND_WAIT_MS)}.`);
          await sleep(BLIND_WAIT_MS, signal);
        }
      }
    }
  };

  let aiOpen = engine.aiAvailable();
  let aiReads = 0;
  let failed = 0;
  let done = 0;
  const t0 = now();
  const total = queue.length;
  const avgCost = () => (aiReads + priorReads ? spent / (aiReads + priorReads) : 0);

  for (const { login, h } of todo) {
    if (signal?.aborted) break;
    const position = total - todo.length + done + 1;
    let facts: unknown;
    try {
      facts = await github(() => engine.collectGithub(login, { token: pool, signal }));
    } catch (e) {
      if (signal?.aborted) break;
      const code = errCode(e);
      if (code === "unknown_user" || code === "organization") {
        append(opts.workPath, { k: "skip", h, why: code });
        skips.add(h);
      } else {
        failed++;
        log(`[${position}/${total}] collecte en échec (${code ?? "erreur"}) : reprise au prochain passage.`);
      }
      done++;
      continue;
    }

    // Lecture IA : échantillon seulement, sous le plafond de dépense.
    let ai: CodeReadingResult | null = null;
    let cost = 0;
    if (sampled.has(h) && aiOpen) {
      if (spent >= maxUsd || spent + avgCost() > maxUsd) {
        aiOpen = false;
        log(`Plafond IA atteint (${usd(spent)} sur ${usd(maxUsd)}) : la suite passe sans lecture du code.`);
      } else {
        const before = opts.spentUsd();
        try {
          const files = await github(() => engine.pickFilesForReading(facts, { token: pool, signal }));
          if (files.length) ai = await engine.readCode(files, { signal });
        } catch (e) {
          if (signal?.aborted) break;
          if (isAiClosed(e)) {
            aiOpen = false;
            log(`IA fermée (${(e as Error).message}) : la suite passe sans lecture du code.`);
          } else log(`[${position}/${total}] lecture IA en échec (${errCode(e) ?? (e as Error).message}) : TEC de repli.`);
          ai = null;
        }
        // Le compteur du processus repart de zéro à minuit UTC : jamais de coût négatif.
        cost = Math.max(0, opts.spentUsd() - before);
        spent += cost;
        if (cost > 0) aiReads++;
      }
    }

    const card = engine.scoreGithub(facts, ai, { lang: "fr", judgedInSeconds: 1 });
    const bare = ai ? engine.scoreGithub(facts, null, { lang: "fr", judgedInSeconds: 1 }) : card;
    const stats = Object.fromEntries(card.stats.map((s) => [s.code, s.value])) as Record<StatCode, number>;
    const line: CardLine = {
      k: "card",
      h,
      v: card.scoringVersion,
      overall: card.overall,
      stats,
      tecFallback: bare.stats.find((s) => s.code === "TEC")!.value,
      tecReal: (ai?.readings.length ?? 0) > 0,
      language: card.mainLanguage ?? null,
      position: card.position,
      statuses: card.statuses.map((s) => s.id),
      usd: cost,
    };
    append(opts.workPath, line);
    cards.set(h, line);
    done++;

    const elapsed = now() - t0;
    const left = todo.length - done;
    const real = [...cards.values()].filter((l) => l.tecReal).length;
    log(
      `[${position}/${total}] ${((100 * position) / total).toFixed(1).replace(".", ",")} % · ` +
        `${(elapsed / 1000 / done).toFixed(1).replace(".", ",")} s/profil · reste ≈ ${duration((elapsed / done) * left)} · ` +
        `IA ${usd(spent)} / ${usd(maxUsd)} · TEC réel ${real} · ignorés ${skips.size} · échecs ${failed}`,
    );
  }

  if (signal?.aborted) {
    log(`Interrompu : ${cards.size} profils notés gardés dans ${opts.workPath}. Relance la même commande pour reprendre.`);
    return result(false, null, failed, aiReads);
  }
  if (failed) log(`${failed} profil(s) en échec : relancer la commande les retentera.`);
  return finish(failed, aiReads);
}
