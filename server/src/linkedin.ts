// Photo LinkedIn sur la carte, par « Sign in with LinkedIn using OpenID Connect »
// (scopes openid profile) : la personne consent, LinkedIn rend le claim
// `picture`. Pas de scraping. Le token d'accès n'est ni stocké ni loggué.
//
// Qui peut lancer le flux :
// - fiche d'un pseudo GitHub, revendication active (§18.1) : seulement la
//   personne connectée comme propriétaire de ce pseudo. Le jeton de la fiche ne
//   suffit pas : il est à qui a tapé le pseudo en premier, et sa photo serait
//   vue de tous ceux à qui le cache ressert la fiche, et au top de la semaine ;
// - sinon (fiche sans pseudo, ou revendication non configurée) : le créateur de
//   la fiche, porteur de son jeton de suppression.
//
// L'état OAuth est lié au navigateur qui a lancé le flux par un cookie httpOnly
// signé (`tys_li`, 10 min, chemin /auth/linkedin), comme celui d'auth.ts : un
// lien de retour forgé, ouvert par quelqu'un d'autre, ne pose pas sa photo.

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { fileOf } from "../../shared/caseFile";
import type { CardData, ComparisonData } from "../../shared/types";
import { linkedinKey, type AccountKit, type LinkedinMemo } from "./account";
import { ownerFromRequest, safeReturnPath, sign, unsign } from "./auth";
import type { CardRow, Store } from "./db";
import { ID_RE } from "./pipeline";

export interface LinkedinConfig {
  clientId: string;
  clientSecret: string;
}

export const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
export const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
export const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const PHOTO_HOST = "media.licdn.com";
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const PHOTO_TIMEOUT_MS = 3000;
const API_TIMEOUT_MS = 5000;
const STATE_TTL_MS = 10 * 60 * 1000;
export const LI_STATE_COOKIE = "tys_li";
const STATE_PATH = "/auth/linkedin";

export function linkedinFromEnv(env: NodeJS.ProcessEnv): LinkedinConfig | undefined {
  const clientId = env.LINKEDIN_CLIENT_ID?.trim();
  const clientSecret = env.LINKEDIN_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

// --- Photos sur disque ------------------------------------------------------

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
type Ext = (typeof TYPES)[keyof typeof TYPES];
const MIME: Record<Ext, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
export const AVATAR_FILE_RE = /^([A-Za-z0-9]{6,32})\.(jpg|png|webp)$/;

export async function removeAvatars(avatarDir: string, ids: string[]) {
  await Promise.all(
    ids.flatMap((id) => (Object.keys(MIME) as Ext[]).map((ext) => rm(join(avatarDir, `${id}.${ext}`), { force: true }))),
  );
}

export async function readAvatar(avatarDir: string, file: string): Promise<{ bytes: Buffer; type: string } | null> {
  const m = AVATAR_FILE_RE.exec(file);
  if (!m) return null;
  const bytes = await readFile(join(avatarDir, file)).catch(() => null);
  return bytes ? { bytes, type: MIME[m[2] as Ext] } : null;
}

/**
 * Range une photo sous le nom de la fiche (`{id}.jpg`) et rend son adresse chez nous,
 * qui change à chaque photo (`?v=`). Une photo de LinkedIn est une adresse signée qui
 * expire : la fiche n'en garde jamais que cette copie (§18.99).
 */
export async function savePhoto(avatarDir: string, baseUrl: string, id: string, photo: { bytes: Uint8Array; ext: Ext }): Promise<string> {
  await mkdir(avatarDir, { recursive: true });
  await removeAvatars(avatarDir, [id]);
  const path = join(avatarDir, `${id}.${photo.ext}`);
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, photo.bytes);
  await rename(tmp, path);
  return `${baseUrl}/avatar/${id}.${photo.ext}?v=${Date.now().toString(36)}`;
}

/**
 * Télécharge une photo LinkedIn (media.licdn.com) et la range sous le nom de la fiche : son adresse chez nous.
 * Une photo déjà chez nous (la copie que le compte garde de la connexion, §18.105) est recopiée sur disque.
 */
export async function keepPhoto(url: string, id: string, o: { avatarDir: string; baseUrl: string; fetchImpl: typeof fetch }): Promise<string> {
  const own = await ownPhoto(url, o.baseUrl, o.avatarDir);
  return savePhoto(o.avatarDir, o.baseUrl, id, own ?? (await downloadPhoto(url, o.fetchImpl)));
}

/** La photo servie par nous (`{baseUrl}/avatar/{fichier}`), lue sur disque ; null pour toute autre adresse. */
export async function ownPhoto(avatarUrl: string | undefined, baseUrl: string, avatarDir: string): Promise<{ bytes: Uint8Array; ext: Ext } | null> {
  const prefix = `${baseUrl}/avatar/`;
  if (!avatarUrl?.startsWith(prefix)) return null;
  const file = avatarUrl.slice(prefix.length).split(/[?#]/)[0] ?? "";
  const m = AVATAR_FILE_RE.exec(file);
  const found = m ? await readAvatar(avatarDir, file) : null;
  return found && m ? { bytes: found.bytes, ext: m[2] as Ext } : null;
}

/**
 * Copie de la carte dont l'avatar servi par nous-mêmes est remplacé par un
 * data URI lu sur disque : renderImage n'a pas à refaire un aller-retour HTTP.
 */
export async function inlineAvatar(card: CardData, baseUrl: string, avatarDir: string): Promise<CardData> {
  const prefix = `${baseUrl}/avatar/`;
  if (!card.avatarUrl?.startsWith(prefix)) return card;
  const file = card.avatarUrl.slice(prefix.length).split(/[?#]/)[0] ?? "";
  const found = await readAvatar(avatarDir, file);
  if (!found) return { ...card, avatarUrl: undefined };
  return { ...card, avatarUrl: `data:${found.type};base64,${found.bytes.toString("base64")}` };
}

// --- États OAuth : 10 min, usage unique, liés à une carte --------------------

export class StateStore<T = string> {
  private states = new Map<string, { value: T; exp: number }>();

  create(value: T, now = Date.now()): string {
    for (const [k, v] of this.states) if (v.exp < now) this.states.delete(k);
    const state = randomBytes(24).toString("base64url");
    this.states.set(state, { value, exp: now + STATE_TTL_MS });
    return state;
  }

  /** Consomme l'état : un second appel avec le même state échoue. */
  take(state: string | undefined, now = Date.now()): T | null {
    if (!state) return null;
    const v = this.states.get(state);
    this.states.delete(state);
    return v && v.exp >= now ? v.value : null;
  }
}

// --- Échanges avec LinkedIn -------------------------------------------------

class PhotoError extends Error {}

function magicOk(ext: Ext, b: Uint8Array): boolean {
  if (ext === "jpg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (ext === "png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  return String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP";
}

/** Télécharge la photo : media.licdn.com seulement, 3 s, 2 Mo, jpeg/png/webp. */
export async function downloadPhoto(url: string, fetchImpl: typeof fetch): Promise<{ bytes: Uint8Array; ext: Ext }> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new PhotoError("URL de photo invalide");
  }
  if (u.protocol !== "https:" || u.hostname !== PHOTO_HOST) throw new PhotoError(`domaine refusé : ${u.hostname}`);

  const res = await fetchImpl(u.toString(), { redirect: "error", signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS) });
  if (!res.ok || !res.body) throw new PhotoError(`photo : HTTP ${res.status}`);
  const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const ext = TYPES[type as keyof typeof TYPES];
  if (!ext) throw new PhotoError(`type refusé : ${type}`);
  if (Number(res.headers.get("content-length") ?? 0) > PHOTO_MAX_BYTES) throw new PhotoError("photo trop lourde");

  // Lecture bornée : on coupe dès que la limite est dépassée.
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > PHOTO_MAX_BYTES) {
      await reader.cancel().catch(() => {});
      throw new PhotoError("photo trop lourde");
    }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks);
  if (!magicOk(ext, bytes)) throw new PhotoError("contenu qui n'est pas l'image annoncée");
  return { bytes, ext };
}

/** code → token d'accès → userinfo. Le token ne sort pas de cette fonction. */
export async function fetchProfile(
  code: string,
  cfg: LinkedinConfig,
  redirectUri: string,
  fetchImpl: typeof fetch,
): Promise<OidcProfile> {
  const tokenRes = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }).toString(),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!tokenRes.ok) throw new PhotoError(`échange du code : HTTP ${tokenRes.status}`);
  const { access_token: accessToken } = (await tokenRes.json()) as { access_token?: string };
  if (!accessToken) throw new PhotoError("échange du code : pas de token");

  const infoRes = await fetchImpl(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!infoRes.ok) throw new PhotoError(`userinfo : HTTP ${infoRes.status}`);
  const info = (await infoRes.json()) as { sub?: unknown; picture?: unknown; name?: unknown; given_name?: unknown; family_name?: unknown; email?: unknown; email_verified?: unknown };
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : undefined);
  const email = typeof info.email === "string" && /^[^\s@]{1,64}@[^\s@]{1,190}$/.test(info.email.trim()) ? info.email.trim().toLowerCase() : undefined;
  // L'identifiant OpenID de la personne : seule son empreinte est gardée, pour retrouver son compte (account.ts).
  const sub = typeof info.sub === "string" && info.sub.trim() && info.sub.length <= 200 ? info.sub.trim() : undefined;
  return {
    ...(sub ? { sub } : {}),
    picture: typeof info.picture === "string" ? info.picture : undefined,
    name: text(info.name) ?? text([text(info.given_name), text(info.family_name)].filter(Boolean).join(" ")),
    // L'adresse n'est rendue que si LinkedIn la dit vérifiée (scope email, demandé par l'entrée seulement).
    ...(email && (info.email_verified === true || info.email_verified === "true") ? { email } : {}),
  };
}

/** Ce que « Sign in with LinkedIn » rend de la personne. Jamais l'adresse de son profil. */
export interface OidcProfile {
  /** L'identifiant OpenID, stable pour une personne et cette application. Jamais rangé tel quel. */
  sub?: string;
  picture?: string;
  name?: string;
  /** Adresse vérifiée par LinkedIn. */
  email?: string;
}

/**
 * « Se connecter avec LinkedIn » (§18.80, entry/linkedinLogin.ts) : la même
 * connexion, le même retour, pour entrer au lieu de poser une photo.
 */
export interface LinkedinEnterHook {
  /** Peut-on lancer une connexion depuis cette adresse (limite par IP) ? */
  allow(c: Context): boolean;
  /** Le retour de LinkedIn : ce qu'il rend de la personne, puis la page où revenir. `accountId` : son compte (§18.91). */
  finish(c: Context, returnPath: string, profile: OidcProfile, accountId?: string): Response | Promise<Response>;
  /**
   * Déjà connectée (§18.105) : le profil que son compte retient, sans repasser chez LinkedIn ni
   * rien chercher. Le retour est celui d'une connexion (`?li=1`), le profil déjà sûr.
   */
  resume?(c: Context, returnPath: string, who: Required<Pick<LinkedinMemo, "url">> & LinkedinMemo & { accountId: string }): Response | Promise<Response>;
}

// --- Mise à jour des cartes -------------------------------------------------

function withPhoto(card: CardData, avatarUrl: string, name?: string): CardData {
  // Pas de vrai nom (le bandeau affichait le pseudo) : on prend celui de LinkedIn.
  const useName = name && card.login && card.name === card.login;
  return { ...card, avatarUrl, photoSource: "linkedin", ...(useName ? { name } : {}) };
}

/** La fiche montre-t-elle déjà une photo LinkedIn (§18.99) ? Un dossier : sa fiche. */
export function showsLinkedinPhoto(row: CardRow): boolean {
  const card = row.kind === "comparison" ? fileOf(row.data as ComparisonData) : (row.data as CardData);
  return !!card.avatarUrl && card.photoSource === "linkedin";
}

/**
 * La photo que « Se connecter avec LinkedIn » vient de rendre, posée sur la fiche de la
 * personne qui n'en montre pas encore (§18.99) : sa fiche retrouvée par son compte, ou
 * resservie du cache. Rien ne change si la fiche a déjà la sienne ; une panne ne casse rien.
 */
export async function giveSignInPhoto(
  row: CardRow,
  picture: string | undefined,
  o: { store: Store; avatarDir: string; baseUrl: string; fetchImpl: typeof fetch; removeImages(ids: string[]): Promise<void> },
): Promise<boolean> {
  const file = o.store.fileRow(row.id) ?? row;
  if (!picture || showsLinkedinPhoto(file)) return false;
  try {
    const avatarUrl = await keepPhoto(picture, file.id, o);
    await o.removeImages(applyPhoto(o.store, file, avatarUrl));
    return true;
  } catch (err) {
    console.warn(`[linkedin ${file.id}] photo de connexion non posée :`, (err as Error).message);
    return false;
  }
}

/** Pose la photo sur la carte visée et dans tout son groupe. Renvoie les ids touchés. */
export function applyPhoto(store: Store, row: CardRow, avatarUrl: string, name?: string): string[] {
  // Une comparaison visée : la photo va sur ses deux cartes.
  const targets = new Set<string>(
    row.kind === "comparison" ? [(row.data as ComparisonData).cv.id, (row.data as ComparisonData).github.id] : [row.id],
  );
  const ids = store.groupIds(row.id);
  store.db.transaction(() => {
    for (const id of ids) {
      const r = store.getCard(id);
      if (!r) continue;
      if (r.kind === "card" && targets.has(id)) {
        store.updateData(id, withPhoto(r.data as CardData, avatarUrl, name));
      } else if (r.kind === "comparison") {
        const cmp = r.data as ComparisonData;
        store.updateData(id, {
          ...cmp,
          cv: targets.has(cmp.cv.id) ? withPhoto(cmp.cv, avatarUrl, name) : cmp.cv,
          github: targets.has(cmp.github.id) ? withPhoto(cmp.github, avatarUrl, name) : cmp.github,
        });
      }
    }
  })();
  return ids;
}

// --- Routes -----------------------------------------------------------------

export interface LinkedinRoutesOptions {
  store: Store;
  config?: LinkedinConfig;
  baseUrl: string;
  avatarDir: string;
  fetchImpl: typeof fetch;
  /** Vérifie le jeton de suppression de la carte (comparaison à temps constant). */
  tokenMatches(given: string | undefined, expected: string): boolean;
  /** Invalide les PNG en cache des ids donnés. */
  removeImages(ids: string[]): Promise<void>;
  /** Revendication GitHub active (§18.1) : la photo d'une fiche à pseudo GitHub est à son propriétaire connecté. */
  claim?: boolean;
  /** Cookie d'état en Secure (production, en HTTPS). */
  secure?: boolean;
  /** Secret de signature du cookie d'état (SESSION_SECRET). Absent : tiré au hasard, pour la durée du processus. */
  stateSecret?: string;
  /** « Se connecter avec LinkedIn » (§18.80). Absent : /auth/linkedin/enter n'existe pas. */
  enter?: LinkedinEnterHook;
  /** Le compte léger (§18.91) : la connexion par l'entrée le trouve ou le crée. Absent : pas de compte. */
  account?: AccountKit | null;
}

export function mountLinkedin(app: Hono, o: LinkedinRoutesOptions) {
  const states = new StateStore();
  /** Les états d'une entrée : ce qu'ils gardent est la page où revenir, pas une fiche ; `redo` : « Refaire ma fiche ». */
  const enterStates = new StateStore<{ path: string; redo: boolean }>();
  // Les états ne survivent pas non plus à un redémarrage : un secret du processus suffit.
  const secret = o.stateSecret ?? randomBytes(32).toString("base64url");
  const cookieBase = { httpOnly: true, secure: o.secure ?? o.baseUrl.startsWith("https://"), sameSite: "Lax" as const, path: STATE_PATH };
  const redirectUri = `${o.baseUrl}/auth/linkedin/callback`;
  const back = (id: string | null, result: "linkedin" | "error") =>
    id ? `${o.baseUrl}/c/${id}?photo=${result}` : `${o.baseUrl}/?photo=${result}`;

  app.get("/avatar/:file", async (c) => {
    const found = await readAvatar(o.avatarDir, c.req.param("file"));
    if (!found) return c.notFound();
    return c.body(new Uint8Array(found.bytes), 200, {
      "Content-Type": found.type,
      // L'URL porte ?v=… : une nouvelle photo change d'URL.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    });
  });

  app.get("/auth/linkedin/start", async (c) => {
    if (!o.config) return c.json({ ok: false, message: { fr: "Connexion LinkedIn désactivée.", en: "LinkedIn sign-in is disabled." } }, 404);
    const id = c.req.query("card") ?? "";
    const row = ID_RE.test(id) ? o.store.getCard(id) : null;
    if (!row) return c.json({ ok: false, message: { fr: "Fiche introuvable.", en: "Sheet not found." } }, 404);
    const login = o.store.loginOf(row);
    if (o.claim && login) {
      if (ownerFromRequest(c)?.login !== login.toLowerCase()) {
        return c.json(
          {
            ok: false,
            message: {
              fr: "Changer la photo est réservé au compte GitHub de la fiche : clique d'abord sur « C'est moi ».",
              en: "Only the sheet's GitHub account can change its photo: click “That's me” first.",
            },
          },
          403,
        );
      }
    } else if (!o.tokenMatches(c.req.query("token"), row.deleteToken) && !o.account?.owns(c, row)) {
      // Ni le jeton de la fiche, ni le compte dont c'est la fiche (§18.91).
      return c.json({ ok: false, message: { fr: "Changer la photo est réservé à qui a créé la fiche.", en: "Only the sheet's creator can change its photo." } }, 403);
    }
    c.header("Cache-Control", "no-store");
    // Sa propre fiche, déjà connectée par LinkedIn (§18.105) : la copie de la photo de sa connexion,
    // sans repasser chez LinkedIn. Jamais sur la fiche d'un autre dont ce navigateur tient le jeton.
    const acct = o.account?.fromRequest(c) ?? null;
    const memo = acct ? o.account!.linkedinOf(acct) : null;
    if (memo?.photo && o.account!.owns(c, row)) {
      const file = o.store.fileRow(id) ?? row;
      try {
        if (!showsLinkedinPhoto(file)) {
          const avatarUrl = await keepPhoto(memo.photo, file.id, o);
          await o.removeImages(applyPhoto(o.store, file, avatarUrl, memo.name));
        }
        o.account!.renew(c, acct!);
        return c.redirect(back(id, "linkedin"), 302);
      } catch (err) {
        // La copie a disparu : le passage chez LinkedIn d'aujourd'hui.
        console.warn(`[linkedin ${id}] copie de la photo du compte absente :`, (err as Error).message);
      }
    }
    const state = states.create(id);
    setCookie(c, LI_STATE_COOKIE, sign(secret, "linkedin", { s: state, e: Date.now() + STATE_TTL_MS }), { ...cookieBase, maxAge: STATE_TTL_MS / 1000 });
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", o.config.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", "openid profile");
    return c.redirect(url.toString(), 302);
  });

  // « Se connecter avec LinkedIn » (§18.80) : nom, photo et email vérifié, pour retrouver le profil.
  app.get("/auth/linkedin/enter", async (c) => {
    c.header("Cache-Control", "no-store");
    const returnPath = safeReturnPath(c.req.query("return")) ?? "/";
    if (!o.config || !o.enter) return c.json({ ok: false, message: { fr: "Connexion LinkedIn désactivée.", en: "LinkedIn sign-in is disabled." } }, 404);
    const redo = c.req.query("redo") === "1";
    // Déjà connectée par LinkedIn (§18.105) : jamais un second passage chez LinkedIn quand le compte suffit.
    const kit = o.account;
    const acct = kit?.fromRequest(c) ?? null;
    if (kit && acct?.linkedinKey) {
      const memo = kit.linkedinOf(acct);
      const mine = redo ? null : kit.cardOf(acct);
      if (mine) {
        kit.renew(c, acct);
        // Sa fiche n'a pas encore de photo LinkedIn : la copie de la connexion (§18.99).
        if (memo?.photo) await giveSignInPhoto(mine, memo.photo, o);
        return c.redirect(`${o.baseUrl}/c/${mine.id}`, 302);
      }
      // « Refaire ma fiche », ou sa fiche partie : le profil retenu, sans recherche.
      if (memo?.url && o.enter.resume) {
        kit.renew(c, acct);
        // Son GitHub déjà connu (le mémo, sinon le pseudo de sa fiche) : rien à lui redemander (§18.111).
        const had = memo.github ? null : kit.cardOf(acct);
        const login = had ? o.store.loginOf(had) : null;
        const github = memo.github ?? (login ? { login, how: "name" as const } : undefined);
        return o.enter.resume(c, returnPath, { ...memo, ...(github ? { github } : {}), url: memo.url, accountId: acct.id });
      }
    }
    if (!o.enter.allow(c)) {
      const u = new URL(returnPath, o.baseUrl);
      u.searchParams.set("li", "error");
      return c.redirect(`${o.baseUrl}${u.pathname}${u.search}`, 302);
    }
    const state = enterStates.create({ path: returnPath, redo });
    setCookie(c, LI_STATE_COOKIE, sign(secret, "linkedin", { s: state, e: Date.now() + STATE_TTL_MS }), { ...cookieBase, maxAge: STATE_TTL_MS / 1000 });
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", o.config.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", "openid profile email");
    return c.redirect(url.toString(), 302);
  });

  app.get("/auth/linkedin/callback", async (c) => {
    c.header("Cache-Control", "no-store");
    const given = c.req.query("state");
    const bound = unsign(secret, "linkedin", getCookie(c, LI_STATE_COOKIE));
    // Usage unique : le cookie d'état et l'état partent quoi qu'il arrive.
    deleteCookie(c, LI_STATE_COOKIE, cookieBase);
    const id = states.take(given);
    const entering = enterStates.take(given);
    const enterPath = entering?.path ?? null;
    // L'état de l'URL doit être celui que ce navigateur a reçu au départ, comparé en temps constant.
    const sameBrowser =
      typeof bound?.s === "string" && typeof bound.e === "number" && bound.e > Date.now() && o.tokenMatches(given, bound.s);
    // « Se connecter avec LinkedIn » : même retour, mais on revient sur la page de départ avec ?li=.
    if (enterPath !== null) {
      const home = (result: "1" | "error" | "cancel") => {
        const u = new URL(sameBrowser ? enterPath : "/", o.baseUrl);
        u.searchParams.set("li", result);
        return `${o.baseUrl}${u.pathname}${u.search}`;
      };
      if (!sameBrowser || !o.config || !o.enter) return c.redirect(home("error"), 302);
      const code = c.req.query("code");
      if (!code || c.req.query("error")) return c.redirect(home("cancel"), 302);
      try {
        const profile = await fetchProfile(code, o.config, redirectUri, o.fetchImpl);
        if (!profile.name) throw new PhotoError("pas de nom");
        // Connexion = compte (§18.91) : trouvé ou créé d'après l'empreinte du sub.
        const kit = o.account;
        const account = kit && profile.sub ? kit.signIn(c, { linkedinKey: linkedinKey(kit.secret, profile.sub) }) : null;
        // Ce qu'il faut pour ne plus la renvoyer ici (§18.105) : son nom, une copie de sa photo. En arrière-plan.
        if (account) void kit!.rememberSignIn(account.id, { name: profile.name, picture: profile.picture });
        // Sa fiche est en ligne : droit dessus, sans recherche ni calcul. « Refaire ma fiche » passe outre.
        const mine = account && !entering?.redo ? kit!.cardOf(account) : null;
        if (mine) {
          // Sa fiche n'a pas encore de photo LinkedIn : celle que LinkedIn vient de rendre (§18.99).
          await giveSignInPhoto(mine, profile.picture, o);
          return c.redirect(`${o.baseUrl}/c/${mine.id}`, 302);
        }
        const done = await o.enter.finish(c, enterPath, profile, account?.id);
        return done;
      } catch (err) {
        console.warn("[linkedin] entrée non aboutie :", (err as Error).message);
        return c.redirect(home("error"), 302);
      }
    }
    if (!id || !sameBrowser || !o.config) return c.redirect(back(null, "error"), 302);
    const code = c.req.query("code");
    // Annulation côté LinkedIn : ?error=user_cancelled_login, pas de code.
    if (!code || c.req.query("error")) return c.redirect(back(id, "error"), 302);
    // La fiche qui se montre à cette adresse (§18.99) : le dossier qui a remplacé la fiche, ou celui
    // d'une pièce. La photo posée sur la fiche remplacée ne se verrait pas.
    const row = o.store.fileRow(id);
    if (!row) return c.redirect(back(null, "error"), 302);
    const fileId = row.id;

    try {
      const profile = await fetchProfile(code, o.config, redirectUri, o.fetchImpl);
      if (!profile.picture) throw new PhotoError("pas de photo sur ce profil");
      const avatarUrl = await keepPhoto(profile.picture, fileId, o);
      const ids = applyPhoto(o.store, row, avatarUrl, profile.name);
      await o.removeImages(ids);
      return c.redirect(back(id, "linkedin"), 302);
    } catch (err) {
      // Jamais le token ni le code dans les logs : seulement le message.
      console.warn(`[linkedin ${id}] photo non récupérée :`, (err as Error).message);
      return c.redirect(back(id, "error"), 302);
    }
  });
}
