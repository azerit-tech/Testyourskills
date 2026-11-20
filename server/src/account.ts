// Le compte léger (SPEC §18.91) : se connecter avec LinkedIn ou GitHub suffit,
// sans inscription, sans mot de passe, sans page de profil. La personne retrouve
// sa fiche sur n'importe quel appareil.
//
// Ce qui est gardé (table `accounts`) : un identifiant tiré au hasard, l'empreinte
// du `sub` OpenID de LinkedIn (HMAC-SHA256 avec SESSION_SECRET, sous son propre
// préfixe : jamais le `sub` en clair), l'identifiant numérique GitHub prouvé par
// OAuth, la fiche liée au lancement, deux dates. Depuis le §18.105, ce qu'il faut
// pour ne plus renvoyer chez LinkedIn une personne déjà connectée (`linkedin_json`) :
// son nom, l'adresse du profil lancé par l'entrée connectée, une copie de sa photo,
// le GitHub que sa connexion avait retrouvé. Jamais l'email, jamais le `sub` en
// clair, jamais un jeton LinkedIn ou GitHub.
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
// Le compte suit le dossier (§18.106) : quand un dossier remplace la fiche liée,
// `card_id` passe au dossier dans la même transaction (Store.followAccounts), un
// compte resté sur une fiche remplacée y passe à sa première lecture, et la purge
// fait passer les comptes avant d'effacer une fiche remplacée.
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
  /** Ce que la connexion LinkedIn a laissé (§18.105) ; null sans identité LinkedIn, ou avant. */
  linkedin: LinkedinMemo | null;
}

/**
 * Ce que le compte retient de la connexion LinkedIn (§18.105), pour agir sans y
 * renvoyer la personne : « Refaire ma fiche », sa fiche supprimée, « Mets ta photo
 * LinkedIn ». Ni email, ni `sub`, ni jeton.
 */
export interface LinkedinMemo {
  /** Le nom que LinkedIn a rendu. */
  name?: string;
  /** Le profil lancé par l'entrée connectée : le profil sûr, ou celui choisi dans « C'est toi ? ». */
  url?: string;
  /** Comment ce profil est le sien (`picked` : choisi parmi des homonymes). */
  how?: "email" | "photo" | "employer" | "picked";
  /** Notre copie de la photo de la connexion (`{baseUrl}/avatar/{fichier}?v=`), jamais l'adresse signée de LinkedIn. */
  photo?: string;
  /** Le fichier de cette copie, sans extension : toujours le même pour un compte. */
  photoId?: string;
  /** Le GitHub que la connexion avait retrouvé (l'email : une preuve ; le nom : un indice). */
  github?: { login: string; how: "email" | "name" };
  /** « Je n'en ai pas » à la question d'avant le jugement (§18.111) : son GitHub ne lui est plus demandé. */
  noGithub?: true;
}

const HOW = new Set(["email", "photo", "employer", "picked"]);
const PHOTO_ID_RE = /^[A-Za-z0-9]{6,32}$/;
const GH_LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

/** Le mémo relu en base : tout champ douteux est laissé de côté. */
function parseMemo(raw: string | null): LinkedinMemo | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const m = v as Record<string, unknown>;
  const str = (x: unknown, max: number) => (typeof x === "string" && x.length > 0 && x.length <= max ? x : undefined);
  const gh = m.github as { login?: unknown; how?: unknown } | undefined;
  const out: LinkedinMemo = {
    ...(str(m.name, 120) ? { name: str(m.name, 120) } : {}),
    ...(str(m.url, 200)?.startsWith("https://www.linkedin.com/in/") ? { url: str(m.url, 200) } : {}),
    ...(typeof m.how === "string" && HOW.has(m.how) ? { how: m.how as LinkedinMemo["how"] } : {}),
    ...(str(m.photo, 400) ? { photo: str(m.photo, 400) } : {}),
    ...(typeof m.photoId === "string" && PHOTO_ID_RE.test(m.photoId) ? { photoId: m.photoId } : {}),
    ...(gh && typeof gh.login === "string" && GH_LOGIN_RE.test(gh.login) && (gh.how === "email" || gh.how === "name") ? { github: { login: gh.login, how: gh.how } } : {}),
    ...(m.noGithub === true ? { noGithub: true as const } : {}),
  };
  return Object.keys(out).length ? out : null;
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
  linkedin_json?: string | null;
}

const toAccount = (r: RawAccount): Account => ({
  id: r.id,
  linkedinKey: r.linkedin_key,
  githubId: r.github_id,
  cardId: r.card_id,
  createdAt: r.created_at,
  seenAt: r.seen_at,
  linkedin: r.linkedin_key ? parseMemo(r.linkedin_json ?? null) : null,
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
  // §18.105 : ce que la connexion LinkedIn laisse (nom, profil, copie de la photo, GitHub retrouvé). Jamais l'email.
  const cols = new Set((db.prepare(`PRAGMA table_info(accounts)`).all() as { name: string }[]).map((c) => c.name));
  if (!cols.has("linkedin_json")) db.exec(`ALTER TABLE accounts ADD COLUMN linkedin_json TEXT`);
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
    /** La fiche qui se montre à l'adresse d'une fiche (Store.fileRow) : le compte suit le dossier (§18.106). */
    private resolve: (cardId: string) => string | null = (id) => id,
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
    cardId = this.resolve(cardId) ?? cardId;
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
    const picked = aCard !== null && bCard !== null ? (aCard >= bCard ? a.cardId : b.cardId) : (this.liveAt(keep.cardId) !== null ? keep.cardId : other.cardId);
    const cardId = picked ? (this.resolve(picked) ?? picked) : null;
    // Le mémo LinkedIn (§18.105) suit l'identité LinkedIn : celui du compte qui la portait.
    const memo = keep.linkedinKey ? keep.linkedin : other.linkedin;
    this.db.prepare(`DELETE FROM accounts WHERE id = ?`).run(other.id);
    this.db
      .prepare(`UPDATE accounts SET linkedin_key = ?, github_id = ?, card_id = ?, created_at = ?, linkedin_json = ? WHERE id = ?`)
      .run(keep.linkedinKey ?? other.linkedinKey, keep.githubId ?? other.githubId, cardId, Math.min(a.createdAt, b.createdAt), memo ? JSON.stringify(memo) : null, keep.id);
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

  /** Complète le mémo LinkedIn (§18.105) d'un compte qui a une identité LinkedIn ; `undefined` laisse un champ tel quel, `null` l'efface. */
  remember(id: string, patch: { [K in keyof LinkedinMemo]?: LinkedinMemo[K] | null }): LinkedinMemo | null {
    const a = this.get(id);
    if (!a?.linkedinKey) return null;
    const next: Record<string, unknown> = { ...(a.linkedin ?? {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete next[k];
      else if (v !== undefined) next[k] = v;
    }
    const clean = parseMemo(JSON.stringify(next));
    this.db.prepare(`UPDATE accounts SET linkedin_json = ? WHERE id = ?`).run(clean ? JSON.stringify(clean) : null, id);
    return clean;
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
  /** Un compte reconnu sans repasser chez LinkedIn (§18.105) : son cookie repart pour 180 jours. */
  renew(c: Context, a: Account): void;
  /**
   * Retour de LinkedIn (§18.105) : le nom, et une copie de la photo (l'adresse de LinkedIn
   * expire). Une photo qui ne se télécharge pas laisse la copie d'avant.
   */
  rememberSignIn(accountId: string, who: { name?: string; picture?: string }): Promise<void>;
  /** La fiche que l'entrée connectée lance (§18.105) : son profil, et le GitHub que la connexion a retrouvé. */
  rememberProfile(accountId: string, p: { url: string; how: NonNullable<LinkedinMemo["how"]>; github: LinkedinMemo["github"] | null; noGithub?: boolean }): void;
  /**
   * Ce que le compte sait de son LinkedIn (§18.105) : le mémo, et à défaut d'adresse retenue
   * (compte d'avant), celle de « Ma fiche » si elle porte un LinkedIn. Null sans identité LinkedIn.
   */
  linkedinOf(a: Account): LinkedinMemo | null;
  /** Supprime le compte, et la copie de sa photo. */
  remove(id: string): Promise<void>;
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
  /** Copie une photo LinkedIn (media.licdn.com) sous ce nom de fichier : son adresse chez nous (§18.105). Absent : pas de copie. */
  keepPhoto?: (url: string, fileId: string) => Promise<string>;
  /** Efface la copie de ce fichier. */
  dropPhoto?: (fileId: string) => Promise<void>;
}

export function createAccounts(o: AccountOptions): AccountKit | null {
  if (!o.secret) return null;
  const secret = o.secret;
  const now = o.now ?? Date.now;
  const store = o.store;
  const accounts = new Accounts(store.db, now, (id) => store.fileRow(id)?.id ?? null);
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
    // Un compte resté sur une fiche remplacée depuis passe au dossier, à la première lecture (§18.106).
    const linked = a.cardId ? store.fileRow(a.cardId) : null;
    if (linked && linked.id !== a.cardId) {
      accounts.linkCard(a.id, linked.id);
      a.cardId = linked.id;
    }
    const owner = a.githubId !== null ? store.getOwnerById(a.githubId) : null;
    const byLogin = owner ? cardOfLogin(owner.login) : null;
    if (byLogin) return byLogin;
    return alive(linked);
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
    renew(c, a) {
      put(c, a.id);
      accounts.touch(a, true);
    },
    async rememberSignIn(accountId, who) {
      const before = accounts.get(accountId);
      if (!before?.linkedinKey) return;
      accounts.remember(accountId, { name: who.name });
      if (!who.picture || !o.keepPhoto) return;
      const photoId = before.linkedin?.photoId ?? `a${randomBytes(12).toString("hex")}`;
      try {
        const photo = await o.keepPhoto(who.picture, photoId);
        // Le compte a pu partir pendant le téléchargement : sa copie aussi.
        if (!accounts.remember(accountId, { photo, photoId })) await o.dropPhoto?.(photoId);
      } catch (err) {
        console.warn(`[compte] photo de connexion non copiée :`, (err as Error).message);
      }
    },
    rememberProfile(accountId, p) {
      // Un GitHub choisi efface « Je n'en ai pas », et l'inverse (§18.111).
      accounts.remember(accountId, { url: p.url, how: p.how, github: p.noGithub ? null : (p.github ?? undefined), noGithub: p.noGithub ? true : p.github ? null : undefined });
    },
    linkedinOf(a) {
      if (!a.linkedinKey) return null;
      const memo = a.linkedin ?? {};
      if (memo.url) return memo;
      const row = cardOf(a);
      const root = row ? (store.getCard(row.parentId ?? row.id) ?? row) : null;
      const url = (root?.facts as { linkedinUrl?: unknown } | null | undefined)?.linkedinUrl;
      return typeof url === "string" && url.startsWith("https://www.linkedin.com/in/") ? { ...memo, url, how: memo.how ?? "picked" } : Object.keys(memo).length ? memo : null;
    },
    async remove(id) {
      const photoId = accounts.get(id)?.linkedin?.photoId;
      accounts.remove(id);
      if (photoId) await o.dropPhoto?.(photoId).catch(() => undefined);
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
