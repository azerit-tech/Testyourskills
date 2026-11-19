// « Se connecter avec LinkedIn » (SPEC §18.80) : entrer sans rien taper.
//
// L'API de LinkedIn ne rend jamais l'adresse du profil sans accès partenaire :
// « Sign in with LinkedIn » donne un nom, une photo et un email vérifié. La
// certitude vient donc de l'email et de la photo :
//
//  1. le profil : recherche inverse par l'email, si un fournisseur la propose ;
//     sinon recherche par nom, et la photo rendue par LinkedIn comparée à celle
//     de chaque homonyme (photoHash.ts). Un seul profil à la même photo : c'est
//     lui, la fiche part sans rien demander. Sinon « C'est toi ? », trois
//     candidats au plus ;
//  2. le GitHub : par l'email (un commit signé de cette adresse, une preuve),
//     sinon par le nom (le seul compte à ce nom, un indice), github/identity.ts.
//     Les liens GitHub du profil LinkedIn, lus plus tard par le pipeline,
//     passent entre les deux.
//
// Rien de LinkedIn n'est gardé : le jeton sert à un appel puis est jeté ; le nom,
// la photo et l'email vivent quinze minutes en mémoire, liés au navigateur par
// un cookie httpOnly signé (`tys_enter`). L'email ne quitte cette mémoire que
// pour la fiche que la personne lance (app.ts), jamais vers le front.

import { randomBytes } from "node:crypto";
import type { Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { LinkedinSuggestion } from "../../../shared/entry";
import { sign, unsign } from "../auth";
import { resolveGithubIdentity, type GithubIdentity, type IdentityInput } from "../github/identity";
import type { GithubAuth } from "../github/http";
import { downloadPhoto, type LinkedinEnterHook, type OidcProfile } from "../linkedin";
import { SEARCHES_PER_IP, type LinkedinCandidate, type LinkedinPeople } from "../linkedinProfile/search";
import { samePublicFullName } from "../names";
import { clientIp, type RateLimiter } from "../ratelimit";
import { toSuggestion } from "./linkedinSearch";
import { licdnImageId, photoHash, samePhotoHash } from "./photoHash";

export const ENTER_COOKIE = "tys_enter";
export const ENTER_TTL_MS = 15 * 60_000;
/** Connexions lancées par IP et par jour. */
export const ENTER_STARTS_PER_DAY = 20;
/** Candidats montrés par « C'est toi ? ». */
export const PICKER_MAX = 3;
/** Homonymes dont la photo est comparée. */
const PHOTOS_COMPARED = 8;
/** Au-delà, la réponse part sans attendre : le front montre le champ. */
const RESOLVE_WAIT_MS = 28_000;
const SESSIONS_MAX = 5000;

/** Ce que la recherche a établi pour une personne connectée. */
export interface Resolution {
  /** Le profil sûr (email ou photo), sinon null. */
  sure: LinkedinCandidate | null;
  how: "email" | "photo" | null;
  /** Les homonymes à proposer quand rien n'est sûr. */
  candidates: LinkedinCandidate[];
  github: GithubIdentity | null;
  /** La recherche n'a pas pu se faire (plafond, panne) : le champ redevient un lien à coller. */
  off: boolean;
}

interface Session {
  name: string;
  email?: string;
  picture?: string;
  exp: number;
  resolving: Promise<Resolution>;
  resolved?: Resolution;
  /** Le compte de la personne connectée (§18.85) : la fiche qu'elle lance y sera liée. */
  accountId?: string;
}

/** Ce que la fiche lancée reçoit de la personne connectée (app.ts). */
export interface EntryIdentity {
  /** Email vérifié par LinkedIn : le contact de la fiche, rien d'autre. */
  email?: string;
  github: GithubIdentity | null;
  /** Le profil lancé est le profil sûr (email ou photo), pas un choix parmi des homonymes. */
  sureProfile: boolean;
  /** Le compte de la personne connectée (§18.85), sinon absent. */
  accountId?: string;
}

export interface LinkedinEnterOptions {
  people: LinkedinPeople;
  limiter: RateLimiter;
  baseUrl: string;
  secure: boolean;
  /** Secret du cookie (SESSION_SECRET). Absent : tiré au hasard, pour la durée du processus. */
  secret?: string;
  fetchImpl: typeof fetch;
  github: GithubAuth;
  /** Le GitHub d'après l'identité ; les tests en donnent un faux. */
  resolveGithub?: (auth: GithubAuth, who: IdentityInput) => Promise<GithubIdentity | null>;
  /** « Même photo ? » ; les tests en donnent un faux. */
  samePhoto?: (a: string, b: string) => Promise<boolean>;
  now?: () => number;
}

/** Deux adresses de photo LinkedIn montrent-elles la même image ? Le même identifiant, sinon la même empreinte. */
export function photoMatcher(fetchImpl: typeof fetch): (a: string, b: string) => Promise<boolean> {
  const hashes = new Map<string, Promise<Uint8Array | null>>();
  const hashOf = (url: string) => {
    let h = hashes.get(url);
    if (!h) {
      h = downloadPhoto(url, fetchImpl)
        .then((p) => photoHash(p.bytes, p.ext))
        .catch(() => null);
      hashes.set(url, h);
    }
    return h;
  };
  return async (a, b) => {
    const ia = licdnImageId(a);
    if (ia && ia === licdnImageId(b)) return true;
    const [ha, hb] = await Promise.all([hashOf(a), hashOf(b)]);
    return samePhotoHash(ha, hb);
  };
}

export function createLinkedinEnter(app: Hono, o: LinkedinEnterOptions) {
  const secret = o.secret ?? randomBytes(32).toString("base64url");
  const now = o.now ?? Date.now;
  const sessions = new Map<string, Session>();
  const cookieBase = { httpOnly: true, secure: o.secure, sameSite: "Lax" as const, path: "/" };
  const resolveGithub = o.resolveGithub ?? resolveGithubIdentity;

  const sweep = () => {
    for (const [k, s] of sessions) if (s.exp < now()) sessions.delete(k);
    while (sessions.size >= SESSIONS_MAX) sessions.delete(sessions.keys().next().value!);
  };

  const sessionOf = (c: Context): { id: string; session: Session } | null => {
    const p = unsign(secret, "enter", getCookie(c, ENTER_COOKIE));
    if (!p || typeof p.i !== "string" || typeof p.e !== "number" || p.e < now()) return null;
    const session = sessions.get(p.i);
    return session && session.exp >= now() ? { id: p.i, session } : null;
  };

  async function resolve(who: OidcProfile & { name: string }, ip: string): Promise<Resolution> {
    const spend = () => o.limiter.take("li-search", ip, SEARCHES_PER_IP);
    // Le GitHub se cherche pendant que le profil se cherche : aucun des deux n'attend l'autre.
    const githubP = resolveGithub(o.github, { name: who.name, email: who.email }).catch(() => null);
    const out: Resolution = { sure: null, how: null, candidates: [], github: null, off: false };
    const byEmail = who.email ? await o.people.byEmail(who.email, { spend }) : null;
    if (byEmail) {
      out.sure = byEmail;
      out.how = "email";
    } else {
      const found = await o.people.byName(who.name, { strict: true, spend });
      if (found.status === "off") out.off = true;
      const all = found.status === "ok" ? found.results : [];
      const same = all.filter((c) => samePublicFullName(who.name, c.name));
      if (who.picture && same.length) {
        const samePhoto = o.samePhoto ?? photoMatcher(o.fetchImpl);
        const picture = who.picture;
        const withPhoto = same.filter((c) => c.photoUrl).slice(0, PHOTOS_COMPARED);
        const hits = (await Promise.all(withPhoto.map((c) => samePhoto(picture, c.photoUrl!).catch(() => false)))).flatMap((ok, i) => (ok ? [withPhoto[i]!] : []));
        // Deux profils à la même photo (un doublon) : rien de sûr, la personne choisit.
        if (hits.length === 1) {
          out.sure = hits[0]!;
          out.how = "photo";
        }
      }
      out.candidates = (same.length ? same : all).slice(0, PICKER_MAX);
    }
    out.github = await githubP;
    return out;
  }

  const hook: LinkedinEnterHook = {
    allow: (c) => o.limiter.take("li-enter", clientIp(c), ENTER_STARTS_PER_DAY),
    finish(c, returnPath, profile, accountId) {
      sweep();
      const id = randomBytes(18).toString("base64url");
      const who = { ...profile, name: profile.name ?? "" };
      const session: Session = {
        name: who.name,
        email: profile.email,
        picture: profile.picture,
        exp: now() + ENTER_TTL_MS,
        // La recherche part tout de suite : elle tourne pendant que la page se recharge.
        resolving: resolve(who, clientIp(c)).catch((): Resolution => ({ sure: null, how: null, candidates: [], github: null, off: true })),
        ...(accountId ? { accountId } : {}),
      };
      void session.resolving.then((r) => (session.resolved = r));
      sessions.set(id, session);
      setCookie(c, ENTER_COOKIE, sign(secret, "enter", { i: id, e: session.exp }), { ...cookieBase, maxAge: ENTER_TTL_MS / 1000 });
      const u = new URL(returnPath, o.baseUrl);
      u.searchParams.set("li", "1");
      return c.redirect(`${o.baseUrl}${u.pathname}${u.search}`, 302);
    },
  };

  // GET /api/entry/linkedin : ce que le front fait au retour de LinkedIn. `auto` :
  // le profil est sûr, la fiche part. Sinon `candidates` pour « C'est toi ? ».
  // Jamais l'email.
  app.get("/api/entry/linkedin", async (c) => {
    c.header("Cache-Control", "no-store");
    const found = sessionOf(c);
    if (!found) return c.json({ signedIn: false });
    const { session } = found;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const r = await Promise.race([session.resolving, new Promise<null>((res) => (timer = setTimeout(() => res(null), RESOLVE_WAIT_MS)))]);
    clearTimeout(timer);
    const show = (x: LinkedinCandidate): LinkedinSuggestion => toSuggestion(x);
    if (!r) return c.json({ signedIn: true, name: session.name, candidates: [], off: true });
    return c.json({
      signedIn: true,
      name: session.name,
      ...(r.sure ? { auto: show(r.sure) } : {}),
      candidates: r.sure ? [] : r.candidates.map(show),
      ...(r.off ? { off: true } : {}),
    });
  });

  /**
   * La fiche qu'on lance pour `linkedinUrl` est-elle celle de la personne
   * connectée ? Oui si c'est le profil sûr ou l'un des candidats proposés : son
   * identité est rendue, avec `used()` à appeler quand la fiche part (la session
   * ne sert qu'une fois). Sinon null.
   */
  const identityFor = (c: Context, linkedinUrl: string): (EntryIdentity & { used(): void }) | null => {
    const found = sessionOf(c);
    const r = found?.session.resolved;
    if (!found || !r) return null;
    const sure = r.sure?.url === linkedinUrl;
    if (!sure && !r.candidates.some((x) => x.url === linkedinUrl)) return null;
    return {
      email: found.session.email,
      github: r.github,
      sureProfile: sure,
      ...(found.session.accountId ? { accountId: found.session.accountId } : {}),
      used() {
        sessions.delete(found.id);
        deleteCookie(c, ENTER_COOKIE, cookieBase);
      },
    };
  };

  return { hook, identityFor };
}
