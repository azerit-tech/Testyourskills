// « C'est moi » (SPEC §18.1) : prouver par GitHub OAuth qu'une fiche est la
// sienne, sans compte ni mot de passe.
//
// Parcours : /auth/github/start?card={id} → GitHub, sans aucun scope (le profil
// public suffit à prouver l'identité) → /auth/github/callback. Si le login GitHub
// (sans tenir compte de la casse) est celui de la fiche, la personne devient
// propriétaire de toutes les fiches de ce login (table `owners`, §11 : elles
// n'expirent plus). Le token d'accès sert à un seul appel (GET /user) puis est
// jeté : ni stocké, ni loggué, comme le code OAuth et les secrets.
//
// Session : un cookie httpOnly `tys_owner`, SameSite=Lax, Secure en production,
// valable 30 jours, signé en HMAC-SHA256 avec SESSION_SECRET. Pas de table de
// sessions. Format : `{charge}.{signature}`, en base64url :
//   charge    = JSON { l: login en minuscules, i: identifiant GitHub numérique, e: expiration en ms epoch }
//   signature = HMAC-SHA256(SESSION_SECRET, "session." + charge)
// Le cookie d'état OAuth (`tys_oauth`, 10 min, chemin /auth/github) est signé de
// la même façon avec le préfixe "state." : l'un ne peut pas passer pour l'autre.
//
// ── Pour les fonctions qui s'appuient sur la revendication ──────────────────
// (garde à vue, concours, dénonciation en retour, §18.4, §18.6) :
//
//   import { ownerFromRequest } from "./auth";
//   const owner = ownerFromRequest(c); // { login, githubId } | null
//
// - null si l'OAuth n'est pas configuré, sans cookie, cookie falsifié ou expiré,
//   ou si la table `owners` ne connaît plus ce compte.
// - `login` vient de la table `owners` (en minuscules), retrouvée par l'identifiant
//   numérique : après un renommage du compte, c'est le nouveau nom.
// - Vaut pour les routes déclarées dans createApp après le montage (mountAuth est
//   appelé en tête : le middleware qui rend la configuration disponible doit
//   passer avant les routes).
// - Une route POST qui agit pour le propriétaire vérifie aussi l'origine
//   (`sameOrigin`) : SameSite=Lax couvre déjà les navigateurs récents.

import { randomBytes } from "node:crypto";
import type { Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { fileOf } from "../../shared/caseFile";
import type { CardData, ComparisonData } from "../../shared/types";
import { accountFromRequest, type AccountKit } from "./account";
import { sameString, sign, unsign } from "./signing";
import { autoJoinBands } from "./bands";
import type { CardRow, Store } from "./db";
import { ID_RE } from "./pipeline";
import { clientIp, type RateLimiter } from "./ratelimit";

export interface GithubAuthConfig {
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
}

export interface Owner {
  login: string;
  githubId: number;
}

export const GH_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
export const GH_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const GH_USER_URL = "https://api.github.com/user";
/** Les comptes sociaux de la personne connectée (§18.113) : son LinkedIn affiché, s'il y en a un. */
export const GH_SOCIAL_URL = "https://api.github.com/user/social_accounts";

/** Ce que GitHub dit d'elle à la connexion, pour chercher son LinkedIn avant le jugement (§18.113). */
export interface GithubSelf {
  name: string | null;
  company: string | null;
  /** Sa ville, son site, sa bio : ce qui départage les homonymes de son LinkedIn (§18.124). */
  location?: string | null;
  blog?: string | null;
  bio?: string | null;
  /** Un LinkedIn sur son GitHub (site, bio, comptes sociaux) : la fiche le trouvera d'elle-même. */
  linkedinShown: boolean;
}

export const SESSION_COOKIE = "tys_owner";
export const STATE_COOKIE = "tys_oauth";
const STATE_PATH = "/auth/github";
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;
const API_TIMEOUT_MS = 5000;
/** Lancements du flux par IP et par jour. */
export const CLAIM_STARTS_PER_DAY = 20;

const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

export function githubAuthFromEnv(env: NodeJS.ProcessEnv): GithubAuthConfig | undefined {
  const clientId = env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = env.GITHUB_CLIENT_SECRET?.trim();
  const sessionSecret = env.SESSION_SECRET?.trim();
  return clientId && clientSecret && sessionSecret ? { clientId, clientSecret, sessionSecret } : undefined;
}

// --- Signature HMAC (signing.ts) ---------------------------------------------

/** Aussi pour linkedin.ts et les entrées : chaque valeur signée a son préfixe d'usage. */
export { sign, unsign };

export function signSession(secret: string, owner: Owner, now = Date.now()): string {
  return sign(secret, "session", { l: owner.login.toLowerCase(), i: owner.githubId, e: now + SESSION_TTL_MS });
}

/** Contenu d'un cookie de session valide (signature, forme, expiration), sinon null. */
export function verifySession(secret: string, value: string | undefined, now = Date.now()): Owner | null {
  const p = unsign(secret, "session", value);
  if (!p) return null;
  const { l, i, e } = p;
  if (typeof l !== "string" || !LOGIN_RE.test(l)) return null;
  if (typeof i !== "number" || !Number.isSafeInteger(i) || i <= 0) return null;
  if (typeof e !== "number" || e <= now) return null;
  return { login: l, githubId: i };
}

interface OAuthState {
  /** Valeur aléatoire renvoyée par GitHub dans ?state=. */
  s: string;
  /** Fiche revendiquée. */
  c: string;
  /** Page de retour, chemin du site déjà validé. */
  r: string;
  e: number;
}

function verifyState(secret: string, value: string | undefined, now: number): OAuthState | null {
  const p = unsign(secret, "state", value);
  if (!p) return null;
  const { s, c, r, e } = p;
  if (typeof s !== "string" || typeof c !== "string" || typeof r !== "string" || typeof e !== "number") return null;
  if (e <= now || !ID_RE.test(c) || safeReturnPath(r) !== r) return null;
  return { s, c, r, e };
}

// --- Page de retour -----------------------------------------------------------

/**
 * Chemin de retour accepté : un chemin du site (« /c/abc?x=1 »), jamais une URL
 * externe ni « //hôte » ou « /\hôte » que les navigateurs prennent pour un
 * autre site. Pas de retour vers /auth ou /api. null sinon.
 */
export function safeReturnPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f\s]/.test(raw)) return null;
  let u: URL;
  try {
    u = new URL(raw, "https://placeholder.invalid");
  } catch {
    return null;
  }
  if (u.origin !== "https://placeholder.invalid") return null;
  if (/^\/(auth|api)(\/|$)/.test(u.pathname)) return null;
  return u.pathname + u.search + u.hash;
}

// --- Session dans les routes -------------------------------------------------

interface OwnerAuth {
  secret: string;
  store: Store;
}

declare module "hono" {
  interface ContextVariableMap {
    /** Posé par mountAuth quand l'OAuth GitHub est configuré. */
    ownerAuth?: OwnerAuth;
  }
}

/**
 * Propriétaire connecté (voir l'en-tête du module), sinon null. Le compte léger
 * (§18.91) dont le GitHub est prouvé le reste au-delà des 30 jours de `tys_owner`.
 */
export function ownerFromRequest(c: Context): Owner | null {
  const auth = c.get("ownerAuth");
  if (!auth) return null;
  const s = verifySession(auth.secret, getCookie(c, SESSION_COOKIE));
  const row = s ? auth.store.getOwnerById(s.githubId) : null;
  if (row) return { login: row.login, githubId: row.githubId };
  const githubId = accountFromRequest(c)?.githubId ?? null;
  const proven = githubId !== null ? auth.store.getOwnerById(githubId) : null;
  return proven ? { login: proven.login, githubId: proven.githubId } : null;
}

/** Une requête qui annonce une origine doit venir du site lui-même. */
export function sameOrigin(c: Context, baseUrl: string): boolean {
  const origin = c.req.header("origin");
  return !origin || origin === new URL(baseUrl).origin;
}

// --- Échanges avec GitHub ----------------------------------------------------

class ClaimError extends Error {}

/** code → token d'accès → GET /user. Le token ne sort pas de cette fonction. */
export async function fetchGithubUser(
  code: string,
  cfg: GithubAuthConfig,
  redirectUri: string,
  fetchImpl: typeof fetch,
  opts: { self?: boolean } = {},
): Promise<Owner & { self?: GithubSelf }> {
  const tokenRes = await fetchImpl(GH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: redirectUri,
    }).toString(),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!tokenRes.ok) throw new ClaimError(`échange du code : HTTP ${tokenRes.status}`);
  // GitHub répond 200 avec { error } quand le code est mauvais ou expiré.
  const tokenBody = (await tokenRes.json().catch(() => ({}))) as { access_token?: unknown; error?: unknown };
  const accessToken = typeof tokenBody.access_token === "string" ? tokenBody.access_token : "";
  if (!accessToken) {
    const reason = typeof tokenBody.error === "string" ? tokenBody.error.slice(0, 40) : "pas de token";
    throw new ClaimError(`échange du code : ${reason}`);
  }

  const userRes = await fetchImpl(GH_USER_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "testyourskills",
    },
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!userRes.ok) throw new ClaimError(`GET /user : HTTP ${userRes.status}`);
  const user = (await userRes.json()) as { login?: unknown; id?: unknown; name?: unknown; company?: unknown; blog?: unknown; bio?: unknown; location?: unknown };
  if (typeof user.login !== "string" || !LOGIN_RE.test(user.login)) throw new ClaimError("GET /user : login invalide");
  if (typeof user.id !== "number" || !Number.isSafeInteger(user.id) || user.id <= 0) throw new ClaimError("GET /user : id invalide");
  const owner = { login: user.login.toLowerCase(), githubId: user.id };
  if (!opts.self) return owner;
  // Son LinkedIn affiché sur GitHub : le site, la bio, puis ses comptes sociaux (un appel, avec son jeton, jamais une erreur).
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null);
  const shows = (v: unknown) => typeof v === "string" && /linkedin\.com\/(in|pub)\//i.test(v);
  let linkedinShown = shows(user.blog) || shows(user.bio);
  if (!linkedinShown) {
    const social: unknown = await fetchImpl(GH_SOCIAL_URL, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "testyourskills" },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
    linkedinShown = Array.isArray(social) && social.some((a) => shows((a as { url?: unknown } | null)?.url));
  }
  return { ...owner, self: { name: str(user.name), company: str(user.company), location: str(user.location), blog: str(user.blog), bio: str(user.bio), linkedinShown } };
}

// --- Routes -----------------------------------------------------------------

export interface AuthRoutesOptions {
  store: Store;
  /** Absent : ni bouton, ni /auth/github/*, ni /api/owner/* ; /api/me répond null. */
  config?: GithubAuthConfig;
  baseUrl: string;
  /** Cookies Secure (production, en HTTPS). */
  secure: boolean;
  limiter: RateLimiter;
  fetchImpl: typeof fetch;
  /** Invalide les PNG en cache des ids donnés (fiches masquées). */
  removeImages(ids: string[]): Promise<void>;
  /** Une fiche vient d'être revendiquée par le GitHub `login` (registre de l'App, §18.95). */
  onClaimed?(row: CardRow, login: string): void;
  /** Efface les duels en cache de ces fiches (§18.94) : revendiquée, une fiche n'est plus scellée. */
  removeDuels?(ids: string[]): Promise<void>;
  /** Le compte léger (§18.91). Absent : /api/me ne parle que de la revendication. */
  account?: AccountKit | null;
  /** Le repli sans droit (`tys_who`, §18.90) : la fiche de qui s'est connecté, lue seulement sans compte valide. */
  known?: (c: Context) => { id: string; login: string | null; overall: number } | null;
  /** Efface les cookies de l'entrée LinkedIn (`tys_who`, `tys_known`, `tys_enter`). */
  forget?: (c: Context) => void;
}

/** Ce que /api/me dit de la fiche : son id, son pseudo et sa note (« Ma fiche »), et de quoi la montrer dans la barre du haut (photo ou initiale). */
function accountCard(row: CardRow | null): { cardId: string | null; cardLogin: string | null; cardLinkedin: boolean; overall: number | null; avatarUrl: string | null; initial: string | null } {
  if (!row) return { cardId: null, cardLogin: null, cardLinkedin: false, overall: null, avatarUrl: null, initial: null };
  const main = row.kind === "comparison" ? fileOf(row.data as ComparisonData) : (row.data as CardData);
  const initial = (main.name || main.login || "").trim().charAt(0).toLocaleUpperCase("fr") || null;
  // Les sources déjà sur sa fiche ne lui sont plus proposées (§18.111) : son GitHub (`cardLogin`), son LinkedIn.
  const cardLinkedin = !!main.linkedinUrl || (row.kind === "comparison" && (row.data as ComparisonData).declaredSource === "linkedin");
  return { cardId: row.id, cardLogin: main.login ? main.login.toLowerCase() : null, cardLinkedin, overall: main.overall, avatarUrl: main.avatarUrl || null, initial };
}

type ClaimResult = "ok" | "mismatch" | "error" | "limited";

export function mountAuth(app: Hono, o: AuthRoutesOptions) {
  const cookieBase = { httpOnly: true, secure: o.secure, sameSite: "Lax" as const };
  const clearSession = (c: Context) => deleteCookie(c, SESSION_COOKIE, { ...cookieBase, path: "/" });
  const cfg = o.config;

  // En premier : ownerFromRequest lit la configuration posée ici, dans toutes les routes.
  if (cfg) {
    const auth: OwnerAuth = { secret: cfg.sessionSecret, store: o.store };
    app.use("*", async (c, next) => {
      c.set("ownerAuth", auth);
      await next();
    });
  }

  // Toujours là : le front ne sait pas encore si l'OAuth est configuré quand il demande.
  // Se déconnecter efface tout : la revendication, le compte (§18.91) et ce que l'entrée LinkedIn retient (§18.90).
  app.post("/auth/logout", (c) => {
    c.header("Cache-Control", "no-store");
    if (!sameOrigin(c, o.baseUrl)) return c.json({ ok: false }, 403);
    clearSession(c);
    o.account?.clear(c);
    o.forget?.(c);
    return c.json({ ok: true });
  });

  // Qui est là, en un seul appel : le propriétaire revendiqué (login, hidden, comme avant), le
  // compte (§18.91) : sa fiche et ses sources, non nul dès qu'un compte est valide, LinkedIn seul
  // compris. Sans l'un ni l'autre, le repli sans droit de `tys_who` (§18.90) : sa fiche, `known`.
  app.get("/api/me", (c) => {
    c.header("Cache-Control", "no-store");
    const owner = ownerFromRequest(c);
    const kit = o.account ?? null;
    const account = kit?.fromRequest(c) ?? null;
    if (!owner && !account) {
      const k = o.known?.(c) ?? null;
      const row = k ? o.store.getCard(k.id) : null;
      return c.json(row && k ? { login: null, hidden: false, ...accountCard(row), cardLogin: k.login, overall: k.overall, sources: [], known: true } : null);
    }
    if (account) kit!.accounts.touch(account);
    const sources: ("linkedin" | "github")[] = [];
    if (account?.linkedinKey) sources.push("linkedin");
    if (owner || (account && account.githubId !== null)) sources.push("github");
    const card = account ? kit!.cardOf(account) : owner && kit ? kit.cardOfLogin(owner.login) : null;
    return c.json({
      login: owner?.login ?? null,
      hidden: owner ? o.store.isHidden(owner.login) : false,
      ...accountCard(card),
      sources,
    });
  });

  if (!cfg) return;

  const redirectUri = `${o.baseUrl}/auth/github/callback`;
  /** URL absolue de retour sur le site, avec le résultat pour le toast du front. */
  const back = (path: string, result: ClaimResult, as?: string) => {
    const u = new URL(path, o.baseUrl);
    u.searchParams.set("claim", result);
    if (as) u.searchParams.set("as", as);
    else u.searchParams.delete("as");
    return `${o.baseUrl}${u.pathname}${u.search}${u.hash}`;
  };

  app.get("/auth/github/start", (c) => {
    c.header("Cache-Control", "no-store");
    const id = c.req.query("card") ?? "";
    const row = ID_RE.test(id) ? o.store.getCard(id) : null;
    if (!row) return c.json({ ok: false, message: { fr: "Fiche introuvable.", en: "Sheet not found." } }, 404);
    if (!o.store.loginOf(row)) {
      return c.json({ ok: false, message: { fr: "Une fiche CV seule ne se revendique pas par GitHub.", en: "A résumé-only sheet can't be claimed with GitHub." } }, 400);
    }
    // Retour demandé s'il est sûr, sinon la fiche elle-même : jamais de redirection ouverte.
    const returnPath = safeReturnPath(c.req.query("return")) ?? `/c/${id}`;
    if (!o.limiter.take("claim", clientIp(c), CLAIM_STARTS_PER_DAY)) return c.redirect(back(returnPath, "limited"), 302);

    const state = randomBytes(24).toString("base64url");
    const now = Date.now();
    setCookie(c, STATE_COOKIE, sign(cfg.sessionSecret, "state", { s: state, c: id, r: returnPath, e: now + STATE_TTL_MS } satisfies OAuthState), {
      ...cookieBase,
      path: STATE_PATH,
      maxAge: STATE_TTL_MS / 1000,
    });
    const url = new URL(GH_AUTHORIZE_URL);
    url.searchParams.set("client_id", cfg.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    // La personne doit déjà avoir le compte de la fiche : pas d'inscription au passage.
    url.searchParams.set("allow_signup", "false");
    // Aucun scope : volontairement absent.
    return c.redirect(url.toString(), 302);
  });

  app.get("/auth/github/callback", async (c) => {
    c.header("Cache-Control", "no-store");
    const st = verifyState(cfg.sessionSecret, getCookie(c, STATE_COOKIE), Date.now());
    // Usage unique : le cookie d'état part quoi qu'il arrive.
    deleteCookie(c, STATE_COOKIE, { ...cookieBase, path: STATE_PATH });
    if (!st) return c.redirect(back("/", "error"), 302);
    const given = c.req.query("state");
    // Protection CSRF : le state de l'URL doit être celui du cookie, comparé en temps constant.
    if (!given || !sameString(given, st.s)) return c.redirect(back(st.r, "error"), 302);
    const code = c.req.query("code");
    // Refus côté GitHub : ?error=access_denied, pas de code.
    if (!code || c.req.query("error")) return c.redirect(back(st.r, "error"), 302);
    const row = o.store.getCard(st.c);
    const cardLogin = row ? o.store.loginOf(row) : null;
    if (!cardLogin) return c.redirect(back("/", "error"), 302);

    let user: Owner;
    try {
      user = await fetchGithubUser(code, cfg, redirectUri, o.fetchImpl);
    } catch (err) {
      // Jamais le token, le code ni les secrets dans les logs : seulement le message.
      console.warn(`[claim ${st.c}] revendication impossible :`, (err as Error).message);
      return c.redirect(back(st.r, "error"), 302);
    }

    // Connexion = compte (§18.91) : le GitHub vient d'être prouvé, quelle que soit la fiche.
    o.account?.signIn(c, { githubId: user.githubId });

    if (user.login !== cardLogin.toLowerCase()) return c.redirect(back(st.r, "mismatch", user.login), 302);

    const owner = o.store.claimOwner(user.login, user.githubId);
    // Ses duels d'avant (scellés, faits par un tiers) ne servent plus : l'état a changé (§18.94).
    await o.removeDuels?.(o.store.idsForLogin(user.login));
    // La cible d'une dénonciation a appelé son avocat (§18.6).
    if (row?.denouncedBy) o.store.recordEvent("denounce_claimed", row.id);
    // La fiche revendiquée entre d'office dans la bande de son école et de sa boîte (§18.82), si elle
    // n'y est pas déjà (une dénonciation y entre dès sa sortie, §18.119). Rien pour une fiche masquée ou sans lecture IA.
    if (row) autoJoinBands(o.store, row);
    if (row) o.onClaimed?.(row, user.login);
    setCookie(c, SESSION_COOKIE, signSession(cfg.sessionSecret, owner), { ...cookieBase, path: "/", maxAge: SESSION_TTL_MS / 1000 });
    return c.redirect(back(st.r, "ok", owner.login), 302);
  });

  // Masquer ou rendre visibles toutes les fiches de son login (§18.1).
  const setHidden = async (c: Context, hidden: boolean) => {
    c.header("Cache-Control", "no-store");
    if (!sameOrigin(c, o.baseUrl)) return c.json({ ok: false }, 403);
    const owner = ownerFromRequest(c);
    if (!owner) {
      return c.json({ ok: false, message: { fr: "Revendique d'abord ta fiche avec GitHub.", en: "Claim your sheet with GitHub first." } }, 401);
    }
    o.store.setOwnerHidden(owner.login, hidden);
    // Les PNG déjà rendus ne restent pas sur le disque d'une fiche masquée.
    if (hidden) await o.removeImages(o.store.idsForLogin(owner.login));
    return c.json({ ok: true, login: owner.login, hidden });
  };
  app.post("/api/owner/hide", (c) => setHidden(c, true));
  app.post("/api/owner/unhide", (c) => setHidden(c, false));
}
