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
import type { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { CardData, ComparisonData } from "../../shared/types";
import { ownerFromRequest, sign, unsign } from "./auth";
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

export class StateStore {
  private states = new Map<string, { cardId: string; exp: number }>();

  create(cardId: string, now = Date.now()): string {
    for (const [k, v] of this.states) if (v.exp < now) this.states.delete(k);
    const state = randomBytes(24).toString("base64url");
    this.states.set(state, { cardId, exp: now + STATE_TTL_MS });
    return state;
  }

  /** Consomme l'état : un second appel avec le même state échoue. */
  take(state: string | undefined, now = Date.now()): string | null {
    if (!state) return null;
    const v = this.states.get(state);
    this.states.delete(state);
    return v && v.exp >= now ? v.cardId : null;
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
): Promise<{ picture?: string; name?: string }> {
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
  const info = (await infoRes.json()) as { picture?: unknown; name?: unknown };
  return {
    picture: typeof info.picture === "string" ? info.picture : undefined,
    name: typeof info.name === "string" && info.name.trim() ? info.name.trim().slice(0, 80) : undefined,
  };
}

// --- Mise à jour des cartes -------------------------------------------------

function withPhoto(card: CardData, avatarUrl: string, name?: string): CardData {
  // Pas de vrai nom (le bandeau affichait le pseudo) : on prend celui de LinkedIn.
  const useName = name && card.login && card.name === card.login;
  return { ...card, avatarUrl, photoSource: "linkedin", ...(useName ? { name } : {}) };
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
}

export function mountLinkedin(app: Hono, o: LinkedinRoutesOptions) {
  const states = new StateStore();
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

  app.get("/auth/linkedin/start", (c) => {
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
    } else if (!o.tokenMatches(c.req.query("token"), row.deleteToken)) {
      return c.json({ ok: false, message: { fr: "Changer la photo est réservé à qui a créé la fiche.", en: "Only the sheet's creator can change its photo." } }, 403);
    }
    const state = states.create(id);
    setCookie(c, LI_STATE_COOKIE, sign(secret, "linkedin", { s: state, e: Date.now() + STATE_TTL_MS }), { ...cookieBase, maxAge: STATE_TTL_MS / 1000 });
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", o.config.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", "openid profile");
    c.header("Cache-Control", "no-store");
    return c.redirect(url.toString(), 302);
  });

  app.get("/auth/linkedin/callback", async (c) => {
    c.header("Cache-Control", "no-store");
    const given = c.req.query("state");
    const bound = unsign(secret, "linkedin", getCookie(c, LI_STATE_COOKIE));
    // Usage unique : le cookie d'état et l'état partent quoi qu'il arrive.
    deleteCookie(c, LI_STATE_COOKIE, cookieBase);
    const id = states.take(given);
    // L'état de l'URL doit être celui que ce navigateur a reçu au départ, comparé en temps constant.
    const sameBrowser =
      typeof bound?.s === "string" && typeof bound.e === "number" && bound.e > Date.now() && o.tokenMatches(given, bound.s);
    if (!id || !sameBrowser || !o.config) return c.redirect(back(null, "error"), 302);
    const code = c.req.query("code");
    // Annulation côté LinkedIn : ?error=user_cancelled_login, pas de code.
    if (!code || c.req.query("error")) return c.redirect(back(id, "error"), 302);
    const row = o.store.getCard(id);
    if (!row) return c.redirect(back(null, "error"), 302);

    try {
      const profile = await fetchProfile(code, o.config, redirectUri, o.fetchImpl);
      if (!profile.picture) throw new PhotoError("pas de photo sur ce profil");
      const { bytes, ext } = await downloadPhoto(profile.picture, o.fetchImpl);

      await mkdir(o.avatarDir, { recursive: true });
      await removeAvatars(o.avatarDir, [id]);
      const path = join(o.avatarDir, `${id}.${ext}`);
      const tmp = `${path}.${process.pid}.tmp`;
      await writeFile(tmp, bytes);
      await rename(tmp, path);

      const avatarUrl = `${o.baseUrl}/avatar/${id}.${ext}?v=${Date.now().toString(36)}`;
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
