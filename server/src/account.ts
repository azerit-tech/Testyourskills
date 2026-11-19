// Le compte léger (SPEC §18.91) : se connecter avec LinkedIn ou GitHub suffit,
// sans inscription, sans mot de passe, sans page de profil. La personne retrouve
// sa fiche sur n'importe quel appareil.
//
// Ce qui est gardé (table `accounts`) : un identifiant tiré au hasard, l'empreinte
// du `sub` OpenID de LinkedIn (HMAC-SHA256 avec SESSION_SECRET, sous son propre
// préfixe : jamais le `sub` en clair), l'identifiant numérique GitHub prouvé par
// OAuth, la fiche liée au lancement, deux dates. Jamais le nom, la photo, l'email
// ni un jeton LinkedIn ou GitHub.
//
// Le cookie `tys_acct` : httpOnly, SameSite=Lax, Secure en production, 180 jours,
// signé comme la session de « C'est moi » avec le préfixe "account" (signing.ts) :
// l'un ne passe pas pour l'autre. Renouvelé quand il a passé la moitié de sa vie.
//
// « Ma fiche » (`cardOf`) : pour un compte au GitHub prouvé, la dernière fiche
// racine vivante de ce pseudo (dossier compris) ; sinon la fiche liée au
// lancement, celle que l'entrée connectée a lancée. Toujours au bout de
// `superseded_by` (Store.fileRow). Une fiche lancée par un lien collé, un nom
// tapé ou une dénonciation n'est jamais liée : elle peut être celle d'un autre.
//
// Sans SESSION_SECRET : pas de compte (createAccounts rend null), tout marche
// comme avant.

import { randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import type { Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { CardRow, Store } from "./db";
import { keyed, sign, unsign } from "./signing";

export const ACCOUNT_COOKIE = "tys_acct";
export const ACCOUNT_TTL_MS = 180 * 24 * 3600 * 1000;
const COOKIE_PURPOSE = "account";
const LINKEDIN_PURPOSE = "account-linkedin-sub";
/** La fiche échangée contre un pseudo GitHub (/api/entry/github) attend sa demande dix minutes. */
const GITHUB_LINK_TTL_MS = 10 * 60_000;
/** `seen_at` se réécrit au plus une fois par jour. */
const SEEN_EVERY_MS = 24 * 3600 * 1000;
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

export interface Account {
  id: string;
  linkedinKey: string | null;
  githubId: number | null;
  cardId: string | null;
  createdAt: number;
  seenAt: number;
}

/** Une identité prouvée par une connexion. */
export type Identity = { linkedinKey: string } | { githubId: number };

interface RawAccount {
  id: string;
  linkedin_key: string | null;
  github_id: number | null;
  card_id: string | null;
  created_at: number;
  seen_at: number;
}

const toAccount = (r: RawAccount): Account => ({
  id: r.id,
  linkedinKey: r.linkedin_key,
  githubId: r.github_id,
  cardId: r.card_id,
  createdAt: r.created_at,
  seenAt: r.seen_at,
});

/** Une table neuve : CREATE TABLE IF NOT EXISTS suffit sur la base déjà en service. */
export function ensureAccountTables(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS accounts (
    id           TEXT PRIMARY KEY,         -- tiré au hasard
    linkedin_key TEXT UNIQUE,              -- HMAC du sub OpenID de LinkedIn, jamais le sub
    github_id    INTEGER UNIQUE,           -- identifiant numérique GitHub, prouvé par OAuth
    card_id      TEXT,                     -- la fiche lancée par l'entrée connectée
    created_at   INTEGER NOT NULL,         -- ms epoch
    seen_at      INTEGER NOT NULL          -- ms epoch, dernière connexion ou visite (au jour près)
  )`);
}

/** L'empreinte du `sub` LinkedIn : c'est elle qu'on range, jamais le `sub`. */
export function linkedinKey(secret: string, sub: string): string {
  return keyed(secret, LINKEDIN_PURPOSE, sub);
}

export function signAccount(secret: string, id: string, now = Date.now()): string {
  return sign(secret, COOKIE_PURPOSE, { a: id, e: now + ACCOUNT_TTL_MS });
}

/** Le contenu d'un cookie de compte valide (signature, forme, expiration), sinon null. */
export function verifyAccount(secret: string, value: string | undefined, now = Date.now()): { id: string; exp: number } | null {
  const p = unsign(secret, COOKIE_PURPOSE, value);
  if (!p) return null;
  const { a, e } = p;
  if (typeof a !== "string" || !ID_RE.test(a)) return null;
  if (typeof e !== "number" || e <= now || e > now + ACCOUNT_TTL_MS) return null;
  return { id: a, exp: e };
}

/** Les comptes en base. Aucun de ses champs ne dit qui est la personne. */
export class Accounts {
  constructor(
    readonly db: Database.Database,
    private now: () => number = Date.now,
  ) {}

  get(id: string): Account | null {
    const r = this.db.prepare(`SELECT * FROM accounts WHERE id = ?`).get(id) as RawAccount | undefined;
    return r ? toAccount(r) : null;
  }

  find(who: Identity): Account | null {
    const r = (
      "linkedinKey" in who
        ? this.db.prepare(`SELECT * FROM accounts WHERE linkedin_key = ?`).get(who.linkedinKey)
        : this.db.prepare(`SELECT * FROM accounts WHERE github_id = ?`).get(who.githubId)
    ) as RawAccount | undefined;
    return r ? toAccount(r) : null;
  }

  private create(who: Identity): Account {
    const id = randomBytes(18).toString("base64url");
    const at = this.now();
    this.db
      .prepare(`INSERT INTO accounts (id, linkedin_key, github_id, card_id, created_at, seen_at) VALUES (?, ?, ?, NULL, ?, ?)`)
      .run(id, "linkedinKey" in who ? who.linkedinKey : null, "githubId" in who ? who.githubId : null, at, at);
    return this.get(id)!;
  }

  /** Une fiche encore en ligne (pas purgée, pas expirée) : sa date de création, sinon null. */
  private liveAt(cardId: string | null): number | null {
    if (!cardId) return null;
    const r = this.db.prepare(`SELECT created_at FROM cards WHERE id = ? AND (expires_at IS NULL OR expires_at > ?)`).get(cardId, this.now()) as { created_at: number } | undefined;
    return r?.created_at ?? null;
  }

  /**
   * Une connexion réussie. `current` : le compte que ce navigateur porte déjà.
   * - Pas de compte ici : celui de cette identité, sinon un neuf.
   * - Le compte d'ici a déjà une autre identité de la même source (une autre
   *   personne sur ce navigateur) : on passe au compte de cette identité.
   * - Sinon les deux identités vont sur le même compte ; si l'autre identité en a
   *   déjà un, les deux fusionnent : on garde celui qui a une fiche, sinon le plus ancien.
   */
  signIn(current: Account | null, who: Identity): Account {
    return this.db.transaction((): Account => {
      const found = this.find(who);
      const here = current ? this.get(current.id) : null;
      const pick = (a: Account) => this.touch(a, true);
      if (!here) return pick(found ?? this.create(who));
      if (found?.id === here.id) return pick(here);
      const taken = "linkedinKey" in who ? here.linkedinKey !== null : here.githubId !== null;
      if (taken) return pick(found ?? this.create(who));
      if (!found) {
        if ("linkedinKey" in who) this.db.prepare(`UPDATE accounts SET linkedin_key = ? WHERE id = ?`).run(who.linkedinKey, here.id);
        else this.db.prepare(`UPDATE accounts SET github_id = ? WHERE id = ?`).run(who.githubId, here.id);
        return pick(this.get(here.id)!);
      }
      // L'autre compte porte déjà une identité de la source qu'on a ici : deux personnes, pas de fusion.
      const clash = (found.linkedinKey && here.linkedinKey) || (found.githubId !== null && here.githubId !== null);
      if (clash) return pick(found);
      return pick(this.merge(here, found));
    })();
  }

  /** Deux comptes d'une même personne n'en font plus qu'un. */
  private merge(a: Account, b: Account): Account {
    const aCard = this.liveAt(a.cardId);
    const bCard = this.liveAt(b.cardId);
    const older = a.createdAt <= b.createdAt ? a : b;
    const keep = aCard !== null && bCard === null ? a : bCard !== null && aCard === null ? b : older;
    const other = keep === a ? b : a;
    // Deux fiches liées : la plus récente.
    const cardId = aCard !== null && bCard !== null ? (aCard >= bCard ? a.cardId : b.cardId) : (this.liveAt(keep.cardId) !== null ? keep.cardId : other.cardId);
    this.db.prepare(`DELETE FROM accounts WHERE id = ?`).run(other.id);
    this.db
      .prepare(`UPDATE accounts SET linkedin_key = ?, github_id = ?, card_id = ?, created_at = ? WHERE id = ?`)
      .run(keep.linkedinKey ?? other.linkedinKey, keep.githubId ?? other.githubId, cardId, Math.min(a.createdAt, b.createdAt), keep.id);
    return this.get(keep.id)!;
  }

  /** `seen_at` : au plus une fois par jour, sauf à une connexion. */
  touch(a: Account, force = false): Account {
    const at = this.now();
    if (!force && at - a.seenAt < SEEN_EVERY_MS) return a;
    this.db.prepare(`UPDATE accounts SET seen_at = ? WHERE id = ?`).run(at, a.id);
    return { ...a, seenAt: at };
  }

  linkCard(id: string, cardId: string) {
    this.db.prepare(`UPDATE accounts SET card_id = ? WHERE id = ?`).run(cardId, id);
  }

  remove(id: string) {
    this.db.prepare(`DELETE FROM accounts WHERE id = ?`).run(id);
  }
}

// --- Dans les routes ---------------------------------------------------------

export interface AccountKit {
  accounts: Accounts;
  secret: string;
  /** Le compte de ce navigateur (cookie valide, ligne en base), sinon null. */
  fromRequest(c: Context): Account | null;
  /** Une connexion réussie : le compte trouvé, créé ou fusionné, et son cookie posé. */
  signIn(c: Context, who: Identity): Account;
  /** « Ma fiche » : la fiche du compte, au bout de `superseded_by`, si elle est en ligne. */
  cardOf(a: Account): CardRow | null;
  /** La dernière fiche racine en ligne d'un pseudo, au bout de `superseded_by`. */
  cardOfLogin(login: string): CardRow | null;
  /** Le compte de ce navigateur a cette fiche pour « Ma fiche » (la même, une pièce ou une fiche qu'elle remplace). */
  owns(c: Context, row: CardRow): boolean;
  /** Lie la fiche au compte, dès qu'elle existe. */
  link(accountId: string, cardId: string): void;
  /** Le pseudo GitHub échangé par l'entrée connectée : la fiche qu'on lance pour lui sera liée. */
  expectGithub(accountId: string, login: string): void;
  /** La fiche lancée pour ce pseudo est celle de l'entrée connectée de ce compte (usage unique). */
  takeGithub(accountId: string, login: string): boolean;
  /** Efface le cookie du compte. */
  clear(c: Context): void;
  /** Renouvelle le cookie qui a passé la moitié de sa vie, si son compte existe encore. */
  refresh(c: Context): void;
}

declare module "hono" {
  interface ContextVariableMap {
    /** Posé par mountAccount quand SESSION_SECRET est là. */
    accountKit?: AccountKit;
  }
}

/** Le compte de ce navigateur, sinon null (pas de secret, pas de cookie, cookie faux ou expiré, compte supprimé). */
export function accountFromRequest(c: Context): Account | null {
  return c.get("accountKit")?.fromRequest(c) ?? null;
}

export interface AccountOptions {
  store: Store;
  /** SESSION_SECRET ; absent : pas de compte. */
  secret?: string;
  secure: boolean;
  now?: () => number;
}

export function createAccounts(o: AccountOptions): AccountKit | null {
  if (!o.secret) return null;
  const secret = o.secret;
  const now = o.now ?? Date.now;
  const store = o.store;
  const accounts = new Accounts(store.db, now);
  const cookieBase = { httpOnly: true, secure: o.secure, sameSite: "Lax" as const, path: "/" };
  const expected = new Map<string, { login: string; exp: number }>();

  const put = (c: Context, id: string) => setCookie(c, ACCOUNT_COOKIE, signAccount(secret, id, now()), { ...cookieBase, maxAge: ACCOUNT_TTL_MS / 1000 });

  const alive = (row: CardRow | null): CardRow | null => (row && (row.expiresAt === null || row.expiresAt > now()) ? row : null);

  const cardOfLogin = (login: string): CardRow | null => {
    const r = store.db
      .prepare(`SELECT id FROM cards WHERE parent_id IS NULL AND login = ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT 1`)
      .get(login.toLowerCase(), now()) as { id: string } | undefined;
    return r ? alive(store.fileRow(r.id)) : null;
  };

  const cardOf = (a: Account): CardRow | null => {
    const owner = a.githubId !== null ? store.getOwnerById(a.githubId) : null;
    const byLogin = owner ? cardOfLogin(owner.login) : null;
    if (byLogin) return byLogin;
    return a.cardId ? alive(store.fileRow(a.cardId)) : null;
  };

  const fromRequest = (c: Context): Account | null => {
    const v = verifyAccount(secret, getCookie(c, ACCOUNT_COOKIE), now());
    return v ? accounts.get(v.id) : null;
  };

  const kit: AccountKit = {
    accounts,
    secret,
    fromRequest,
    signIn(c, who) {
      const a = accounts.signIn(fromRequest(c), who);
      put(c, a.id);
      return a;
    },
    cardOf,
    cardOfLogin,
    owns(c, row) {
      const a = fromRequest(c);
      const mine = a ? cardOf(a) : null;
      if (!mine) return false;
      return row.id === mine.id || store.fileRow(row.id)?.id === mine.id;
    },
    link(accountId, cardId) {
      accounts.linkCard(accountId, cardId);
    },
    expectGithub(accountId, login) {
      for (const [k, v] of expected) if (v.exp < now()) expected.delete(k);
      expected.set(accountId, { login: login.toLowerCase(), exp: now() + GITHUB_LINK_TTL_MS });
    },
    takeGithub(accountId, login) {
      const v = expected.get(accountId);
      if (!v || v.exp < now() || v.login !== login.toLowerCase()) return false;
      expected.delete(accountId);
      return true;
    },
    clear(c) {
      deleteCookie(c, ACCOUNT_COOKIE, cookieBase);
    },
    refresh(c) {
      const raw = getCookie(c, ACCOUNT_COOKIE);
      const v = raw ? verifyAccount(secret, raw, now()) : null;
      if (!v || v.exp - now() >= ACCOUNT_TTL_MS / 2) return;
      const a = accounts.get(v.id);
      if (!a) return;
      put(c, a.id);
      accounts.touch(a);
    },
  };
  return kit;
}

/**
 * En tête de l'application : rend le compte lisible dans toutes les routes, et
 * renouvelle le cookie quand il a passé la moitié de sa vie (pour un compte qui existe encore).
 */
export function mountAccount(app: Hono, kit: AccountKit | null) {
  if (!kit) return;
  app.use("*", async (c, next) => {
    c.set("accountKit", kit);
    kit.refresh(c);
    await next();
  });
}
