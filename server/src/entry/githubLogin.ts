// « Se connecter avec GitHub » (SPEC §18.80) : entrer par la porte GitHub sans
// taper son pseudo. GitHub OAuth sans aucun scope : le profil public suffit.
//
// /auth/github/enter?return= → GitHub → /auth/github/callback, le même retour
// que « C'est moi » (§18.1) : une application OAuth n'a qu'une adresse de
// retour, et la même application peut servir aux deux. Ce module passe devant
// la revendication : il ne prend que les retours dont ce navigateur porte le
// cookie d'état d'entrée (`tys_gh_enter`), et laisse les autres passer.
//
// Au retour, le jeton sert à un appel (GET /user) puis est jeté. Le pseudo
// attend dix minutes dans un cookie httpOnly signé (`tys_gh`), que le front
// échange une seule fois contre le pseudo (GET /api/entry/github) pour lancer
// la fiche : jamais dans l'adresse, un lien ne doit pas pouvoir lancer une
// fiche chez qui le suit. Si la revendication est configurée, la personne
// vient de prouver son compte : elle en est aussi propriétaire (§18.1).

import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { GH_AUTHORIZE_URL, SESSION_COOKIE, SESSION_TTL_MS, fetchGithubUser, safeReturnPath, sign, signSession, unsign, type GithubAuthConfig } from "../auth";
import type { Store } from "../db";
import { clientIp, type RateLimiter } from "../ratelimit";

export const GH_ENTER_STATE_COOKIE = "tys_gh_enter";
export const GH_ENTER_COOKIE = "tys_gh";
const STATE_PATH = "/auth/github";
const STATE_TTL_MS = 10 * 60_000;
const LOGIN_TTL_MS = 10 * 60_000;
/** Connexions lancées par IP et par jour. */
export const GH_ENTER_STARTS_PER_DAY = 20;

export interface GithubLoginConfig {
  clientId: string;
  clientSecret: string;
}

/** GITHUB_OAUTH_CLIENT_ID / _SECRET, sinon l'application de « C'est moi » (GITHUB_CLIENT_ID / _SECRET). */
export function githubLoginFromEnv(env: NodeJS.ProcessEnv): GithubLoginConfig | undefined {
  const clientId = env.GITHUB_OAUTH_CLIENT_ID?.trim() || env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = env.GITHUB_OAUTH_CLIENT_SECRET?.trim() || env.GITHUB_CLIENT_SECRET?.trim();
  // Les deux viennent de la même application : jamais l'identifiant de l'une avec le secret de l'autre.
  const own = !!env.GITHUB_OAUTH_CLIENT_ID?.trim() === !!env.GITHUB_OAUTH_CLIENT_SECRET?.trim();
  return clientId && clientSecret && own ? { clientId, clientSecret } : undefined;
}

export interface GithubEnterOptions {
  store: Store;
  config?: GithubLoginConfig;
  /** La revendication (§18.1), si elle est configurée : la connexion vaut « C'est moi ». */
  claim?: GithubAuthConfig;
  baseUrl: string;
  secure: boolean;
  limiter: RateLimiter;
  fetchImpl: typeof fetch;
}

function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** À monter AVANT mountAuth : les deux partagent /auth/github/callback. */
export function mountGithubEnter(app: Hono, o: GithubEnterOptions): void {
  const cfg = o.config;
  // Toujours là : le front demande sans savoir si la connexion est configurée.
  const secret = o.claim?.sessionSecret ?? randomBytes(32).toString("base64url");
  const cookieBase = { httpOnly: true, secure: o.secure, sameSite: "Lax" as const };
  const clearLogin = (c: Parameters<typeof deleteCookie>[0]) => deleteCookie(c, GH_ENTER_COOKIE, { ...cookieBase, path: "/" });

  // Le pseudo de la personne qui revient de GitHub, rendu une seule fois.
  app.get("/api/entry/github", (c) => {
    c.header("Cache-Control", "no-store");
    const p = unsign(secret, "gh-login", getCookie(c, GH_ENTER_COOKIE));
    if (getCookie(c, GH_ENTER_COOKIE)) clearLogin(c);
    if (!p || typeof p.l !== "string" || typeof p.e !== "number" || p.e < Date.now()) return c.json({ signedIn: false });
    return c.json({ signedIn: true, login: p.l });
  });

  if (!cfg) return;

  const redirectUri = `${o.baseUrl}/auth/github/callback`;
  const back = (path: string, result: "1" | "error" | "cancel") => {
    const u = new URL(path, o.baseUrl);
    u.searchParams.set("gh", result);
    return `${o.baseUrl}${u.pathname}${u.search}`;
  };

  app.get("/auth/github/enter", (c) => {
    c.header("Cache-Control", "no-store");
    const returnPath = safeReturnPath(c.req.query("return")) ?? "/";
    if (!o.limiter.take("gh-enter", clientIp(c), GH_ENTER_STARTS_PER_DAY)) return c.redirect(back(returnPath, "error"), 302);
    const state = randomBytes(24).toString("base64url");
    setCookie(c, GH_ENTER_STATE_COOKIE, sign(secret, "gh-enter", { s: state, r: returnPath, e: Date.now() + STATE_TTL_MS }), {
      ...cookieBase,
      path: STATE_PATH,
      maxAge: STATE_TTL_MS / 1000,
    });
    const url = new URL(GH_AUTHORIZE_URL);
    url.searchParams.set("client_id", cfg.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    // Aucun scope : volontairement absent.
    return c.redirect(url.toString(), 302);
  });

  app.get("/auth/github/callback", async (c, next) => {
    const raw = getCookie(c, GH_ENTER_STATE_COOKIE);
    const st = unsign(secret, "gh-enter", raw);
    const given = c.req.query("state");
    // Pas un retour d'entrée de ce navigateur : c'est une revendication, qui suit.
    if (!st || typeof st.s !== "string" || typeof st.r !== "string" || typeof st.e !== "number" || !given || !sameState(given, st.s)) return next();
    c.header("Cache-Control", "no-store");
    // Usage unique : le cookie d'état part quoi qu'il arrive.
    deleteCookie(c, GH_ENTER_STATE_COOKIE, { ...cookieBase, path: STATE_PATH });
    const returnPath = safeReturnPath(st.r) ?? "/";
    if (st.e < Date.now()) return c.redirect(back(returnPath, "error"), 302);
    const code = c.req.query("code");
    // Refus côté GitHub : ?error=access_denied, pas de code.
    if (!code || c.req.query("error")) return c.redirect(back(returnPath, "cancel"), 302);
    try {
      const user = await fetchGithubUser(code, { ...cfg, sessionSecret: secret }, redirectUri, o.fetchImpl);
      if (o.claim) {
        const owner = o.store.claimOwner(user.login, user.githubId);
        setCookie(c, SESSION_COOKIE, signSession(o.claim.sessionSecret, owner), { ...cookieBase, path: "/", maxAge: SESSION_TTL_MS / 1000 });
      }
      setCookie(c, GH_ENTER_COOKIE, sign(secret, "gh-login", { l: user.login, e: Date.now() + LOGIN_TTL_MS }), { ...cookieBase, path: "/", maxAge: LOGIN_TTL_MS / 1000 });
      return c.redirect(back(returnPath, "1"), 302);
    } catch (err) {
      // Jamais le jeton, le code ni les secrets dans les journaux : seulement le message.
      console.warn("[github] entrée non aboutie :", (err as Error).message);
      return c.redirect(back(returnPath, "error"), 302);
    }
  });
}
