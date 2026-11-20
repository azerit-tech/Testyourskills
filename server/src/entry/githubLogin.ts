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
//
// Avant le jugement (§18.113) : son LinkedIn se cherche dès le retour de GitHub,
// par la recherche des propositions (§18.100, `match/linkedin.ts`, deux secondes au
// plus, aucun appel payé), sauf s'il est déjà connu (affiché sur son GitHub, au
// registre de l'App, à son compte). Trouvé : l'échange du pseudo le rend dans
// `found`, le front dit « J'ai trouvé ton LinkedIn » et valide seul au bout de 3 s.

import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { accountFromRequest, type AccountKit } from "../account";
import { GH_AUTHORIZE_URL, SESSION_COOKIE, SESSION_TTL_MS, fetchGithubUser, safeReturnPath, sign, signSession, unsign, type GithubAuthConfig } from "../auth";
import type { Store } from "../db";
import { SEARCHES_PER_IP } from "../linkedinProfile/search";
import { FIND_BUDGET_MS } from "../match/github";
import type { GithubHints, LinkedinProposal } from "../match/linkedin";
import { clientIp, type RateLimiter } from "../ratelimit";
import type { RegistryPort } from "../registry/index";
import type { LinkedinSuggestion } from "../../../shared/entry";

export const GH_ENTER_STATE_COOKIE = "tys_gh_enter";
export const GH_ENTER_COOKIE = "tys_gh";
const STATE_PATH = "/auth/github";
const STATE_TTL_MS = 10 * 60_000;
const LOGIN_TTL_MS = 10 * 60_000;
/** Connexions lancées par IP et par jour. */
export const GH_ENTER_STARTS_PER_DAY = 20;
/** Le registre de l'App, attendu au plus (ms), en même temps que la recherche par le nom. */
const REGISTRY_WAIT_MS = 800;

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
  /** Le compte léger (§18.91) : la connexion le trouve ou le crée. Absent : pas de compte. */
  account?: AccountKit | null;
  baseUrl: string;
  secure: boolean;
  limiter: RateLimiter;
  fetchImpl: typeof fetch;
  /** La recherche de son LinkedIn par le nom (§18.100) ; absente : rien n'est proposé avant le jugement. */
  findLinkedin?: (gh: GithubHints, opts: { spend?: () => boolean; signal: AbortSignal }) => Promise<{ kind: string } | null>;
  /** Le registre de l'App (§18.95) : un LinkedIn déjà relié à ce GitHub n'est pas proposé. */
  registry?: Pick<RegistryPort, "linkedinOf">;
}

/** Ce que l'entrée GitHub rend à la création de la fiche (§18.113). */
export interface GithubEnterKit {
  /** Le LinkedIn montré à ce compte pour ce pseudo, si c'est celui-là (usage unique) : sa force pour le registre. */
  takeAsked(accountId: string, login: string, url: string): { sure: boolean } | null;
}

/** La proposition telle que le front la montre : rien de plus que « C'est toi ? ». */
function shown(p: LinkedinProposal): LinkedinSuggestion {
  return { url: p.url, name: p.name, headline: p.headline, ...(p.photoUrl ? { photo: p.photoUrl } : {}) };
}

/** Une promesse bornée : null au-delà de `ms`, ou en cas d'erreur. */
function within<T>(p: Promise<T | null>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p.catch(() => null), new Promise<null>((res) => (timer = setTimeout(() => res(null), ms)))]).finally(() => clearTimeout(timer));
}

function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** À monter AVANT mountAuth : les deux partagent /auth/github/callback. */
export function mountGithubEnter(app: Hono, o: GithubEnterOptions): GithubEnterKit {
  const cfg = o.config;
  /** Les recherches de son LinkedIn, lancées au retour de GitHub, rendues une fois par l'échange du pseudo. */
  const finds = new Map<string, { p: Promise<LinkedinProposal | null>; exp: number }>();
  /** Le LinkedIn montré à un compte (« J'ai trouvé ton LinkedIn »), en attendant la fiche. */
  const asked = new Map<string, { login: string; url: string; sure: boolean; exp: number }>();
  const sweep = () => {
    const now = Date.now();
    for (const [k, v] of finds) if (v.exp < now) finds.delete(k);
    for (const [k, v] of asked) if (v.exp < now) asked.delete(k);
  };
  const kit: GithubEnterKit = {
    takeAsked(accountId, login, url) {
      const v = asked.get(accountId);
      if (!v || v.exp < Date.now() || v.login !== login.toLowerCase() || v.url !== url) return null;
      asked.delete(accountId);
      return { sure: v.sure };
    },
  };
  // Toujours là : le front demande sans savoir si la connexion est configurée.
  const secret = o.claim?.sessionSecret ?? randomBytes(32).toString("base64url");
  const cookieBase = { httpOnly: true, secure: o.secure, sameSite: "Lax" as const };
  const clearLogin = (c: Parameters<typeof deleteCookie>[0]) => deleteCookie(c, GH_ENTER_COOKIE, { ...cookieBase, path: "/" });

  // Le pseudo de la personne qui revient de GitHub, rendu une seule fois.
  // `found` : son LinkedIn trouvé avant le jugement (§18.113), la recherche attendue deux secondes au plus.
  app.get("/api/entry/github", async (c) => {
    c.header("Cache-Control", "no-store");
    const p = unsign(secret, "gh-login", getCookie(c, GH_ENTER_COOKIE));
    if (getCookie(c, GH_ENTER_COOKIE)) clearLogin(c);
    if (!p || typeof p.l !== "string" || typeof p.e !== "number" || p.e < Date.now()) return c.json({ signedIn: false });
    const login = p.l;
    // La fiche que le front lance pour ce pseudo est celle de l'entrée connectée : elle ira au compte (§18.91).
    const account = accountFromRequest(c);
    if (account) o.account?.expectGithub(account.id, login);
    const key = typeof p.k === "string" ? p.k : null;
    const find = key ? finds.get(key) : undefined;
    if (key) finds.delete(key);
    const found = find ? await within(find.p, FIND_BUDGET_MS + 200) : null;
    // Retenu pour son compte : la fiche lancée avec ce LinkedIn est la sienne, le lien va au registre.
    if (found && account) asked.set(account.id, { login: login.toLowerCase(), url: found.url, sure: found.sure, exp: Date.now() + LOGIN_TTL_MS });
    return c.json({ signedIn: true, login, ...(found ? { found: shown(found) } : {}) });
  });

  if (!cfg) return kit;

  const redirectUri = `${o.baseUrl}/auth/github/callback`;

  /**
   * Son LinkedIn, cherché pendant que la page se recharge (§18.113) : jamais quand il est déjà connu
   * (affiché sur son GitHub, une connexion LinkedIn à son compte, le registre de l'App qui le relie
   * à ce pseudo), ni sans nom complet. La clé de la recherche, ou null.
   */
  const startFind = (ip: string, user: Awaited<ReturnType<typeof fetchGithubUser>>, linkedinAccount: boolean): string | null => {
    const finder = o.findLinkedin;
    const self = user.self;
    if (!finder || !self || self.linkedinShown || linkedinAccount || !self.name) return null;
    sweep();
    const hints: GithubHints = { login: user.login, name: self.name, company: self.company };
    const signal = AbortSignal.timeout(FIND_BUDGET_MS);
    const known = o.registry ? within(o.registry.linkedinOf(user.login), REGISTRY_WAIT_MS) : Promise.resolve(null);
    const search = finder(hints, { spend: () => o.limiter.take("li-search", ip, SEARCHES_PER_IP), signal }).catch(() => null);
    const p = Promise.all([known, search]).then(([k, r]) => (k || !r || r.kind !== "linkedin" ? null : (r as LinkedinProposal)));
    p.catch(() => {});
    const k = randomBytes(12).toString("base64url");
    finds.set(k, { p, exp: Date.now() + LOGIN_TTL_MS });
    return k;
  };
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
    // `d` : « Refaire ma fiche » (§18.91), le retour ne mène pas droit à la fiche du compte.
    const redo = c.req.query("redo") === "1";
    setCookie(c, GH_ENTER_STATE_COOKIE, sign(secret, "gh-enter", { s: state, r: returnPath, e: Date.now() + STATE_TTL_MS, ...(redo ? { d: 1 } : {}) }), {
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
      const user = await fetchGithubUser(code, { ...cfg, sessionSecret: secret }, redirectUri, o.fetchImpl, { self: !!o.findLinkedin });
      if (o.claim) {
        const owner = o.store.claimOwner(user.login, user.githubId);
        setCookie(c, SESSION_COOKIE, signSession(o.claim.sessionSecret, owner), { ...cookieBase, path: "/", maxAge: SESSION_TTL_MS / 1000 });
      }
      // Connexion = compte (§18.91). Sa fiche est en ligne : droit dessus, sans nouveau calcul.
      const account = o.account?.signIn(c, { githubId: user.githubId }) ?? null;
      const mine = account && st.d !== 1 ? o.account!.cardOf(account) : null;
      if (mine) return c.redirect(`${o.baseUrl}/c/${mine.id}`, 302);
      const k = startFind(clientIp(c), user, !!account?.linkedinKey);
      setCookie(c, GH_ENTER_COOKIE, sign(secret, "gh-login", { l: user.login, e: Date.now() + LOGIN_TTL_MS, ...(k ? { k } : {}) }), { ...cookieBase, path: "/", maxAge: LOGIN_TTL_MS / 1000 });
      return c.redirect(back(returnPath, "1"), 302);
    } catch (err) {
      // Jamais le jeton, le code ni les secrets dans les journaux : seulement le message.
      console.warn("[github] entrée non aboutie :", (err as Error).message);
      return c.redirect(back(returnPath, "error"), 302);
    }
  });
  return kit;
}
