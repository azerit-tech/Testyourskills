// Les primes (SPEC §18.4, §18.5) : une entreprise partenaire offre des
// entretiens au haut de son classement. Tout est piloté par data/season.json :
// sans prime, aucune route ne répond autre chose qu'avant (pas de page, pas de
// collecte), et /primes ramène à l'accueil.
//
// Éligibilité : la fiche est revendiquée (« C'est moi », auth.ts), son poste est
// parmi ceux de la prime ; le contrat de la prime est la ligue. Aucun filtre sur
// l'âge, l'école, le genre, l'origine ; le lieu n'est qu'une question posée.
//
// Classement : la note globale de la dernière fiche du login (shared/primes.ts),
// sans bonus ; à égalité la fiabilité, puis la date d'inscription. Les fiches
// faites après la clôture ne comptent pas : le classement se fige de lui-même.
//
// Données (table `entries`) : l'email et les preuves ne sortent jamais par une
// route publique ni dans les journaux. Se retirer efface l'inscription ;
// supprimer ou masquer sa fiche aussi. Sans victoire, effacée 30 jours après la
// fin de la saison (purgeEntries, appelée par la purge horaire).

import type Database from "better-sqlite3";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { fileOf } from "../../shared/caseFile";
import {
  BOARD_SIZE,
  cleanProof,
  compareEntries,
  ENTRY_RETENTION_DAYS,
  isLeague,
  MAX_PROOFS,
  primeView,
  wouldRank,
  type BoardRow,
  type EntryState,
  type JoinGate,
  type MyEntry,
  type PrimeMe,
  type PrimePageData,
  type PrimeView,
  type Race,
  type RaceLine,
} from "../../shared/primes";
import { dayStart, primePhase, primeWindow, PRIME_ID_RE, type Prime, type Season } from "../../shared/season";
import type { CardData, ComparisonData, Fact, Position } from "../../shared/types";
import { starsFor } from "../../shared/types";
import type { CardRow, Store } from "./db";
import { clientIp, type RateLimiter } from "./ratelimit";

const ID_RE = /^[A-Za-z0-9]{6,32}$/;
const DAY_MS = 24 * 3600 * 1000;
/** Inscriptions (ou mises à jour) par jour et par IP. */
export const JOINS_PER_DAY = 10;
/** Durée pendant laquelle le classement d'une prime est gardé en mémoire. */
export const PRIMES_CACHE_MS = 30_000;

const f = (fr: string, en: string): Fact => ({ fr, en });

export const PRIME_MESSAGES = {
  notFound: f("Cette prime n'existe pas, ou plus.", "This bounty doesn't exist, or no longer does."),
  claim: f("Revendique d'abord ta fiche avec GitHub (« C'est moi »).", "Claim your sheet with GitHub first (“That's me”)."),
  closed: f("Cette prime n'accepte plus d'inscription.", "This bounty no longer takes entries."),
  soon: f("Cette prime n'est pas encore ouverte.", "This bounty isn't open yet."),
  nocard: f("Aucune fiche à ton pseudo. Fais-la d'abord.", "No sheet under your username. Make it first."),
  degraded: f("Ta dernière fiche est sortie sans lecture. Refais-la pour concourir.", "Your last sheet came out unread. Make it again to enter."),
  position: f("Ta fiche ne vise aucun poste de cette prime.", "Your sheet doesn't match any position of this bounty."),
  email: f("Cet email n'a pas l'air valide.", "That email doesn't look valid."),
  consent: f("Coche l'accord de transmission pour concourir.", "Tick the sharing agreement to enter."),
  adult: f("Il faut avoir 18 ans ou plus pour concourir.", "You must be 18 or older to enter."),
  place: f("Réponds à la question du lieu.", "Answer the location question."),
  proofs: f("Un lien de preuve n'a pas l'air d'une adresse web.", "A proof link doesn't look like a web address."),
  limited: f("Trop d'inscriptions aujourd'hui depuis cette adresse. Reviens demain.", "Too many entries from this address today. Come back tomorrow."),
  forbidden: f("Requête refusée.", "Request refused."),
} as const;

// --- Table --------------------------------------------------------------------

/** La table des inscriptions, ajoutée par migrate() (db.ts). Une ligne par login et par prime. */
export function ensurePrimeTables(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS entries (
    login        TEXT NOT NULL,              -- pseudo GitHub revendiqué, en minuscules
    prime_id     TEXT NOT NULL,              -- data/season.json
    card_id      TEXT NOT NULL,              -- la fiche qui concourt (la dernière du login)
    contract     TEXT NOT NULL,              -- stage | alternance | cdi : la ligue
    email        TEXT NOT NULL,              -- jamais renvoyé par une route publique ni loggué
    proofs_json  TEXT,                       -- jusqu'à trois liens, jamais publics
    consent_at   INTEGER NOT NULL,           -- ms epoch : « J'accepte que mon profil soit transmis… »
    adult        INTEGER NOT NULL,           -- 1 : « J'ai 18 ans ou plus », déclaré
    place_ok     INTEGER,                    -- réponse à « Tu peux travailler à … ? » ; NULL si la prime n'a pas de lieu
    score        INTEGER NOT NULL,           -- note globale de la fiche qui concourt
    reliability  INTEGER NOT NULL,           -- départage les égalités
    state        TEXT NOT NULL DEFAULT 'racing' CHECK (state IN ('racing', 'finalist', 'winner', 'withdrawn')),
    joined_at    INTEGER NOT NULL,           -- ms epoch ; départage après la fiabilité
    PRIMARY KEY (login, prime_id)
  );
  CREATE INDEX IF NOT EXISTS entries_prime ON entries(prime_id);
  CREATE INDEX IF NOT EXISTS entries_card ON entries(card_id);`);
}

const cache = new WeakMap<Database.Database, Map<string, { at: number; data: Standing[] }>>();

/** Oublie les classements gardés : une inscription, un retrait, une fiche supprimée ou masquée. */
export function forgetPrimes(db: Database.Database): void {
  cache.delete(db);
}

/** Supprimer une fiche retire les inscriptions qu'elle portait. */
export function removeEntriesForCards(db: Database.Database, cardIds: string[]): void {
  if (!cardIds.length) return;
  const stmt = db.prepare(`DELETE FROM entries WHERE card_id = ?`);
  for (const id of cardIds) stmt.run(id);
  forgetPrimes(db);
}

/** Masquer ses fiches retire toutes ses inscriptions. */
export function removeEntriesForLogin(db: Database.Database, login: string): void {
  db.prepare(`DELETE FROM entries WHERE login = ?`).run(login.toLowerCase());
  forgetPrimes(db);
}

/** Purge : sans victoire, une inscription est effacée 30 jours après la fin de la saison. */
export function purgeEntries(db: Database.Database, season: Season | null, now = Date.now()): number {
  if (!season) return 0;
  const limit = dayStart(season.end) + DAY_MS + ENTRY_RETENTION_DAYS * DAY_MS;
  if (now < limit) return 0;
  const r = db.prepare(`DELETE FROM entries WHERE state <> 'winner'`).run();
  if (r.changes) forgetPrimes(db);
  return r.changes;
}

// --- Classement, calculé à la lecture ------------------------------------------

/** Une inscription classée. */
export interface Standing {
  login: string;
  cardId: string;
  overall: number;
  reliability: number;
  joinedAt: number;
  state: EntryState;
  rank: number;
}

/** La fiche telle qu'elle se montre : celle du dossier pour deux pièces (§18.36). */
export function mainCard(row: CardRow): CardData {
  return row.kind === "comparison" ? fileOf(row.data as ComparisonData) : (row.data as CardData);
}

/**
 * La dernière fiche d'un login qui concourt : racine, jugée avec lecture IA, non
 * expirée, faite avant `before` (la clôture). Null s'il n'y en a pas.
 */
export function latestCard(store: Store, login: string, before: number, now = Date.now()): CardRow | null {
  const r = store.db
    .prepare(
      `SELECT id FROM cards WHERE parent_id IS NULL AND login = ? AND degraded = 0 AND created_at < ?
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(login.toLowerCase(), before, now) as { id: string } | undefined;
  return r ? store.getCard(r.id) : null;
}

interface EntryRow {
  login: string;
  card_id: string;
  score: number;
  reliability: number;
  joined_at: number;
  state: EntryState;
}

function compute(store: Store, season: Season, prime: Prime, now: number): Standing[] {
  const { closes } = primeWindow(season, prime);
  const rows = store.db
    .prepare(`SELECT login, card_id, score, reliability, joined_at, state FROM entries WHERE prime_id = ? AND state <> 'withdrawn'`)
    .all(prime.id) as EntryRow[];
  const sync = store.db.prepare(`UPDATE entries SET card_id = ?, score = ?, reliability = ? WHERE login = ? AND prime_id = ?`);
  const list = rows
    .filter((r) => !store.isHidden(r.login))
    .map((r) => {
      // La dernière fiche faite avant la clôture : se refaire juger compte, après la clôture non.
      const row = latestCard(store, r.login, closes, now);
      const card = row ? mainCard(row) : null;
      const s = { login: r.login, cardId: row?.id ?? r.card_id, overall: card?.overall ?? r.score, reliability: card?.reliability ?? r.reliability, joinedAt: r.joined_at, state: r.state };
      if (row && (row.id !== r.card_id || s.overall !== r.score || s.reliability !== r.reliability)) sync.run(row.id, s.overall, s.reliability, r.login, prime.id);
      return s;
    })
    .sort(compareEntries);
  return list.map((s, i) => ({ ...s, rank: i + 1 }));
}

/** Le classement d'une prime, gardé 30 s en mémoire. */
export function standings(store: Store, season: Season, prime: Prime, now = Date.now()): Standing[] {
  let byPrime = cache.get(store.db);
  const hit = byPrime?.get(prime.id);
  if (hit && Math.abs(now - hit.at) < PRIMES_CACHE_MS) return hit.data;
  if (!byPrime) cache.set(store.db, (byPrime = new Map()));
  const data = compute(store, season, prime, now);
  byPrime.set(prime.id, { at: now, data });
  return data;
}

/** Les vingt premiers, par pseudo GitHub (ils ont revendiqué et consenti). */
function boardOf(store: Store, list: Standing[]): BoardRow[] {
  return list.slice(0, BOARD_SIZE).map((s) => {
    const row = store.getCard(s.cardId);
    const card = row ? mainCard(row) : null;
    return {
      rank: s.rank,
      login: card?.login ?? s.login,
      cardId: s.cardId,
      overall: s.overall,
      stars: starsFor(s.overall),
      ...(card?.profile ? { profile: card.profile.label } : {}),
    };
  });
}

// --- API ------------------------------------------------------------------------

const joinSchema = z.object({
  email: z.string().max(254),
  consent: z.boolean().optional(),
  adult: z.boolean().optional(),
  proofs: z.array(z.string().max(400)).max(MAX_PROOFS).optional(),
  placeOk: z.boolean().nullable().optional(),
});

export interface PrimesOptions {
  store: Store;
  season: Season | null;
  /** Le texte public du règlement (rules.ts) ; null : /reglement répond 404. */
  rules: string | null;
  limiter: RateLimiter;
  baseUrl: string;
  /** Propriétaire connecté (auth.ts), sinon null. */
  owner: (c: Context) => { login: string } | null;
  sameOrigin: (c: Context) => boolean;
  /** Login masqué, vu par quelqu'un d'autre que son propriétaire. */
  hiddenFrom: (c: Context, login: string | null | undefined) => boolean;
  notFound: Fact;
  withdrawn: Fact;
  now?: () => number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Une prime de la saison par son id, ou null. */
export function primeById(season: Season | null, id: string): Prime | null {
  if (!season || !PRIME_ID_RE.test(id)) return null;
  return season.primes.find((p) => p.id === id) ?? null;
}

const refuse = (c: Context, status: 400 | 401 | 403 | 404 | 409 | 410 | 429, code: string, message: Fact) => c.json({ state: "error", code, message }, status);

export function mountPrimes(app: Hono, o: PrimesOptions): void {
  const { store, season } = o;
  const now = () => (o.now ? o.now() : Date.now());
  const listed = !!season && season.primes.length > 0;

  const view = (p: Prime, t: number): PrimeView => primeView(season!, p, standings(store, season!, p, t).length, t);

  /** La personne connectée, sa dernière fiche et ce qui l'empêche de concourir. */
  const gateOf = (login: string | null, prime: Prime, t: number): { gate: JoinGate; row: CardRow | null } => {
    if (primePhase(season!, prime, t) !== "open") return { gate: "closed", row: null };
    if (!login) return { gate: "claim", row: null };
    const row = latestCard(store, login, primeWindow(season!, prime).closes, t);
    if (!row) {
      const any = store.db.prepare(`SELECT 1 FROM cards WHERE parent_id IS NULL AND login = ? LIMIT 1`).get(login);
      return { gate: any ? "degraded" : "nocard", row: null };
    }
    if (!prime.positions.includes(mainCard(row).position)) return { gate: "position", row };
    return { gate: "ok", row };
  };

  const meOf = (login: string | null, prime: Prime, t: number): PrimeMe => {
    const list = standings(store, season!, prime, t);
    const mine = login ? list.find((s) => s.login === login) : undefined;
    const entry: MyEntry | null = mine ? { rank: mine.rank, total: list.length, state: mine.state, cardId: mine.cardId, overall: mine.overall } : null;
    const { gate, row } = gateOf(login, prime, t);
    const card = row ? mainCard(row) : null;
    return {
      login,
      entry,
      gate,
      card: row && card ? { id: row.id, overall: card.overall, position: card.position as Position } : null,
      wouldBe: card && !mine ? wouldRank(list, card.overall, card.reliability) : null,
    };
  };

  // GET /api/primes : toutes les primes de la saison, ouvertes d'abord.
  app.get("/api/primes", (c) => {
    c.header("Cache-Control", "public, max-age=60");
    if (!listed) return c.json({ primes: [] });
    const t = now();
    const order = { open: 0, soon: 1, closed: 2 } as const;
    const primes = season!.primes.map((p) => view(p, t)).sort((a, b) => order[a.phase] - order[b.phase]);
    return c.json({ primes });
  });

  // GET /api/primes/:id : la prime, ses vingt premiers et le nombre d'inscrits. Rien de privé.
  app.get("/api/primes/:id", (c) => {
    const prime = primeById(season, c.req.param("id"));
    if (!prime) return refuse(c, 404, "internal", PRIME_MESSAGES.notFound);
    const t = now();
    const list = standings(store, season!, prime, t);
    c.header("Cache-Control", "public, max-age=30");
    return c.json({ prime: primeView(season!, prime, list.length, t), board: boardOf(store, list), total: list.length } satisfies PrimePageData);
  });

  // GET /api/primes/:id/me : la personne connectée, son rang, et si elle peut concourir. Jamais son email.
  app.get("/api/primes/:id/me", (c) => {
    c.header("Cache-Control", "no-store");
    const prime = primeById(season, c.req.param("id"));
    if (!prime) return refuse(c, 404, "internal", PRIME_MESSAGES.notFound);
    return c.json(meOf(o.owner(c)?.login ?? null, prime, now()));
  });

  // POST /api/primes/:id/join : concourir. Fiche revendiquée, email, accord, 18 ans, lieu si la prime en a un.
  app.post("/api/primes/:id/join", async (c) => {
    c.header("Cache-Control", "no-store");
    if (!o.sameOrigin(c)) return refuse(c, 403, "forbidden", PRIME_MESSAGES.forbidden);
    const prime = primeById(season, c.req.param("id"));
    if (!prime) return refuse(c, 404, "internal", PRIME_MESSAGES.notFound);
    const login = o.owner(c)?.login ?? null;
    if (!login) return refuse(c, 401, "claim", PRIME_MESSAGES.claim);
    const t = now();
    const phase = primePhase(season!, prime, t);
    if (phase !== "open") return refuse(c, 409, "closed", phase === "soon" ? PRIME_MESSAGES.soon : PRIME_MESSAGES.closed);

    const parsed = joinSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return refuse(c, 400, "email", PRIME_MESSAGES.email);
    const b = parsed.data;
    const email = b.email.trim();
    if (!EMAIL_RE.test(email)) return refuse(c, 400, "email", PRIME_MESSAGES.email);
    if (b.consent !== true) return refuse(c, 400, "consent", PRIME_MESSAGES.consent);
    if (b.adult !== true) return refuse(c, 400, "adult", PRIME_MESSAGES.adult);
    if (prime.place && typeof b.placeOk !== "boolean") return refuse(c, 400, "place", PRIME_MESSAGES.place);
    const proofs: string[] = [];
    for (const raw of b.proofs ?? []) {
      if (!raw.trim()) continue;
      const p = cleanProof(raw);
      if (!p) return refuse(c, 400, "proofs", PRIME_MESSAGES.proofs);
      proofs.push(p);
    }

    const { gate, row } = gateOf(login, prime, t);
    if (gate !== "ok" || !row) {
      const msg = gate === "position" ? PRIME_MESSAGES.position : gate === "degraded" ? PRIME_MESSAGES.degraded : PRIME_MESSAGES.nocard;
      return refuse(c, 409, gate, msg);
    }
    if (!o.limiter.take("prime", clientIp(c), JOINS_PER_DAY)) return refuse(c, 429, "rate_limited", PRIME_MESSAGES.limited);

    const card = mainCard(row);
    // Une candidature par prime : se réinscrire met à jour l'email, les preuves et la fiche, la date d'inscription reste.
    store.db
      .prepare(
        `INSERT INTO entries (login, prime_id, card_id, contract, email, proofs_json, consent_at, adult, place_ok, score, reliability, state, joined_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 'racing', ?)
         ON CONFLICT(login, prime_id) DO UPDATE SET card_id = excluded.card_id, email = excluded.email, proofs_json = excluded.proofs_json,
           consent_at = excluded.consent_at, adult = 1, place_ok = excluded.place_ok, score = excluded.score, reliability = excluded.reliability`,
      )
      .run(login, prime.id, row.id, prime.contract, email, proofs.length ? JSON.stringify(proofs) : null, t, prime.place ? (b.placeOk ? 1 : 0) : null, card.overall, card.reliability, t);
    forgetPrimes(store.db);
    store.recordEvent("prime_join", row.id, { prime: prime.id });
    return c.json(meOf(login, prime, t));
  });

  // POST /api/primes/:id/withdraw : un toucher, l'inscription est effacée.
  app.post("/api/primes/:id/withdraw", (c) => {
    c.header("Cache-Control", "no-store");
    if (!o.sameOrigin(c)) return refuse(c, 403, "forbidden", PRIME_MESSAGES.forbidden);
    const prime = primeById(season, c.req.param("id"));
    if (!prime) return refuse(c, 404, "internal", PRIME_MESSAGES.notFound);
    const login = o.owner(c)?.login ?? null;
    if (!login) return refuse(c, 401, "claim", PRIME_MESSAGES.claim);
    const r = store.db.prepare(`DELETE FROM entries WHERE login = ? AND prime_id = ?`).run(login, prime.id);
    if (r.changes) {
      forgetPrimes(store.db);
      store.recordEvent("prime_withdraw", null, { prime: prime.id });
    }
    return c.json(meOf(login, prime, now()));
  });

  // GET /api/card/:id/race?league=stage : « Tu es en course » sous une fiche (§18.5).
  app.get("/api/card/:id/race", (c) => {
    c.header("Cache-Control", "no-store");
    const id = c.req.param("id");
    const league = c.req.query("league");
    const empty: Race = { needsGithub: false, degraded: false, lines: [] };
    if (!listed || !ID_RE.test(id) || !isLeague(league) || league === "fun") return c.json(empty);
    const row = store.getCard(id);
    const root = row?.parentId ? store.getCard(row.parentId) : row;
    if (!root) return refuse(c, 404, "internal", o.notFound);
    const cardLogin = store.loginOf(root);
    if (o.hiddenFrom(c, cardLogin)) return refuse(c, 410, "gone", o.withdrawn);
    const t = now();
    const card = mainCard(root);
    const open = season!.primes.filter((p) => p.contract === league && primePhase(season!, p, t) === "open" && p.positions.includes(card.position));
    if (!cardLogin) return c.json({ ...empty, needsGithub: open.length > 0 } satisfies Race);
    if (root.degraded) return c.json({ ...empty, degraded: true } satisfies Race);
    const login = cardLogin.toLowerCase();
    const mine = o.owner(c)?.login === login;
    const lines: RaceLine[] = open.map((p) => {
      const list = standings(store, season!, p, t);
      const entered = list.find((s) => s.login === login);
      const r = entered ? { rank: entered.rank, total: list.length } : wouldRank(list, card.overall, card.reliability);
      return { prime: primeView(season!, p, list.length, t), ...r, entered: !!entered, gate: mine ? "ok" : "claim" };
    });
    return c.json({ needsGithub: false, degraded: false, lines } satisfies Race);
  });

  // GET /api/rules : le texte public du règlement, en français (il fait foi).
  // Jamais les points à relire qui le précèdent dans le fichier (rules.ts).
  app.get("/api/rules", (c) => {
    if (!o.rules) return refuse(c, 404, "not_found", o.notFound);
    c.header("Cache-Control", "public, max-age=300");
    return c.json({ lang: "fr", text: o.rules });
  });

  // Les pages. Sans prime dans la saison, /primes ramène à l'accueil comme avant ;
  // le règlement n'existe pas tant que rulesPublished est faux.
  const home = (c: Context) => {
    c.header("Cache-Control", "no-store");
    return c.redirect(`/${new URL(c.req.url).search}`, 302);
  };
  // Toute casse, barre finale comprise (« /Primes/ », « /Reglement/ »).
  app.get("*", async (c, next) => {
    const path = c.req.path;
    if (/^\/primes(?:\/|$)/i.test(path)) return listed ? next() : home(c);
    if (/^\/reglement\/?$/i.test(path)) return o.rules ? next() : c.text("Not found", 404);
    return next();
  });
}
