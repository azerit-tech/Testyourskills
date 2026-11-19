// « Se connecter avec LinkedIn » (SPEC §18.80, §18.85) : entrer sans rien taper.
//
// L'API de LinkedIn ne rend jamais l'adresse du profil sans accès partenaire :
// « Sign in with LinkedIn » donne un nom, une photo et un email vérifié. La
// certitude vient donc de l'email et de la photo :
//
//  1. le profil : recherche inverse par l'email, si un fournisseur la propose ;
//     sinon recherche par nom dans un index web (une seconde), avec l'employeur
//     que dit le domaine de l'email ; les trois premiers profils à ce nom sont
//     lus (quatre secondes, ensemble), et la photo rendue par LinkedIn comparée à
//     la leur (photoHash.ts). Un seul profil à la même photo : c'est lui, la
//     fiche part sans rien demander. À défaut, le seul profil qui porte le nom et
//     l'employeur. Sinon « C'est toi ? », trois candidats au plus ;
//  2. le GitHub : par l'email (un commit signé de cette adresse, une preuve),
//     sinon par le nom (le seul compte à ce nom, un indice), github/identity.ts.
//     Les liens GitHub du profil LinkedIn, lus plus tard par le pipeline,
//     passent entre les deux.
//
// Rien de LinkedIn n'est gardé : le jeton sert à un appel puis est jeté ; le nom,
// la photo et l'email vivent quinze minutes en mémoire, liés au navigateur par
// un cookie httpOnly signé (`tys_enter`). L'email ne quitte cette mémoire que
// pour la fiche que la personne lance (app.ts), jamais vers le front.
//
// Qui s'est connecté (§18.85) : un second cookie httpOnly signé, `tys_who`, 90
// jours, garde dans le navigateur le nom, puis l'adresse du profil sûr et
// l'identifiant de la fiche. Il ne donne aucun droit : il sert à montrer « Voir
// ma fiche » à la place des boutons de connexion (GET /api/entry/me), même quand
// le navigateur a vidé sa mémoire. Ni email, ni photo, rien côté serveur. À côté,
// `tys_known=1`, lisible par le front : il ne demande /api/entry/me que s'il est là.
// Sa fiche supprimée, les deux cookies partent.

import { randomBytes } from "node:crypto";
import type { Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { LinkedinSuggestion } from "../../../shared/entry";
import type { ProfilePeek } from "../linkedinProfile/index";
import { confidenceFor } from "../linkedinProfile/webSearch";
import { sign, unsign } from "../auth";
import { resolveGithubIdentity, type GithubIdentity, type IdentityInput } from "../github/identity";
import type { GithubAuth } from "../github/http";
import { downloadPhoto, type LinkedinEnterHook, type OidcProfile } from "../linkedin";
import { PERSONAL_MAIL_RE, SEARCHES_PER_IP, type LinkedinCandidate, type LinkedinPeople } from "../linkedinProfile/search";
import { nameWords, samePublicFullName } from "../names";
import { clientIp, type RateLimiter } from "../ratelimit";
import { toSuggestion } from "./linkedinSearch";
import { licdnImageId, photoHash, samePhotoHash } from "./photoHash";

export const ENTER_COOKIE = "tys_enter";
export const ENTER_TTL_MS = 15 * 60_000;
export const WHO_COOKIE = "tys_who";
export const KNOWN_COOKIE = "tys_known";
export const WHO_TTL_MS = 90 * 24 * 3600_000;
/** Connexions lancées par IP et par jour. */
export const ENTER_STARTS_PER_DAY = 20;
/** Candidats montrés par « C'est toi ? ». */
export const PICKER_MAX = 3;
/** Homonymes dont la photo est comparée. */
const PHOTOS_COMPARED = 8;
/** Profils lus par IP et par jour pour reconnaître qui se connecte (trois par connexion). */
export const PEEKS_PER_IP = 30;
/** Une lecture de profil qui traîne n'est plus attendue. */
const PEEK_WAIT_MS = 20_000;
/** Une demande du front attend la recherche ce temps-là, puis répond « pending » : il redemande. */
export const POLL_WAIT_MS = 20_000;
/** Au-delà (l'index lent a 90 s), la recherche est dite en panne. */
export const RESOLVE_MAX_MS = 100_000;
const SESSIONS_MAX = 5000;

/** Ce que la recherche a établi pour une personne connectée. */
export interface Resolution {
  /** Le profil sûr (email ou photo), sinon null. */
  sure: LinkedinCandidate | null;
  /** « employer » : le seul profil au nom et à l'employeur de l'email. La fiche part, sans valoir une preuve. */
  how: "email" | "photo" | "employer" | null;
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
}

/** Ce que `tys_who` retient : le nom, puis le profil sûr et la fiche. */
export interface Who {
  name?: string;
  url?: string;
  cardId?: string;
}

/** La fiche de la personne, telle que le front la garde (« Ma fiche »). */
export interface KnownCard {
  id: string;
  login: string | null;
  overall: number;
}

/** Ce que la fiche lancée reçoit de la personne connectée (app.ts). */
export interface EntryIdentity {
  /** Email vérifié par LinkedIn : le contact de la fiche, rien d'autre. */
  email?: string;
  github: GithubIdentity | null;
  /** Le profil lancé est le profil sûr (email ou photo), pas un choix parmi des homonymes. */
  sureProfile: boolean;
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
  /** Le nom, le titre et la photo d'un profil (une lecture payée) ; absent : seules les photos que la recherche donne sont comparées. */
  peek?: (url: string, opts: { spend: () => boolean; signal?: AbortSignal }) => Promise<ProfilePeek | null>;
  /** « Même photo ? » ; les tests en donnent un faux. */
  samePhoto?: (a: string, b: string) => Promise<boolean>;
  /** La fiche de qui s'est connecté : celle du cookie si elle existe encore, sinon la dernière de son profil. */
  knownCard?: (who: Who) => KnownCard | null;
  /** Attente d'une demande du front avant « pending » (les tests la raccourcissent). */
  pollWaitMs?: number;
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

/**
 * L'employeur que dit un email vérifié : le nom de son domaine (« paysolde » pour
 * camille@paysolde.io), jamais celui d'une messagerie personnelle, ni un domaine
 * au nom de la personne (camille@ardent.dev ne départage aucune Camille Ardent).
 * Il ne sert qu'à classer les homonymes d'une recherche.
 */
export function employerFromEmail(email: string | undefined, name?: string): string | null {
  if (!email || PERSONAL_MAIL_RE.test(email)) return null;
  const parts = email
    .slice(email.lastIndexOf("@") + 1)
    .toLowerCase()
    .split(".")
    .filter(Boolean);
  if (parts.length < 2) return null;
  let i = parts.length - 2;
  // « acme.co.uk », « ecole.ac.jp » : le nom est un cran plus à gauche.
  if (i > 0 && parts[parts.length - 1]!.length === 2 && /^(co|com|ac|org|gov|edu|net)$/.test(parts[i]!)) i--;
  const label = parts[i]!;
  if (!/^[a-z0-9-]{2,40}$/.test(label)) return null;
  return nameWords(name).some((w) => w.length >= 3 && label.includes(w)) ? null : label;
}

export function createLinkedinEnter(app: Hono, o: LinkedinEnterOptions) {
  const secret = o.secret ?? randomBytes(32).toString("base64url");
  const now = o.now ?? (() => Date.now());
  const sessions = new Map<string, Session>();
  const cookieBase = { httpOnly: true, secure: o.secure, sameSite: "Lax" as const, path: "/" };
  const resolveGithub = o.resolveGithub ?? resolveGithubIdentity;
  const pollWait = o.pollWaitMs ?? POLL_WAIT_MS;

  const str = (v: unknown, max: number): string | undefined => (typeof v === "string" && v.length > 0 && v.length <= max ? v : undefined);
  const whoOf = (c: Context): Who | null => {
    const p = unsign(secret, "who", getCookie(c, WHO_COOKIE));
    if (!p || typeof p.e !== "number" || p.e < now()) return null;
    return { name: str(p.n, 120), url: str(p.u, 200), cardId: str(p.c, 40) };
  };
  /** Écrit `tys_who` : ce qu'on sait déjà de cette personne, complété. Une nouvelle connexion (`fresh`) repart de son seul nom. */
  const remember = (c: Context, patch: Who, fresh = false) => {
    const w = { ...(fresh ? {} : whoOf(c)), ...patch };
    const age = { maxAge: WHO_TTL_MS / 1000 };
    setCookie(c, WHO_COOKIE, sign(secret, "who", { n: w.name?.slice(0, 120), u: w.url, c: w.cardId, e: now() + WHO_TTL_MS }), { ...cookieBase, ...age });
    setCookie(c, KNOWN_COOKIE, "1", { ...cookieBase, httpOnly: false, ...age });
  };

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
      const found = await o.people.byName(who.name, { strict: true, company: employerFromEmail(who.email, who.name), spend });
      if (found.status === "off") out.off = true;
      const all = found.status === "ok" ? found.results : [];
      let same = all.filter((c) => samePublicFullName(who.name, c.name));
      // Un index web ne donne pas de photo : les premiers profils à ce nom sont lus, ensemble.
      // Leur lecture entre au cache : la fiche qui part ensuite ne la repaie pas.
      const peek = o.peek;
      if (peek) {
        const signal = AbortSignal.timeout(PEEK_WAIT_MS);
        const read = await Promise.all(
          same.map((c, i) =>
            i < PICKER_MAX && !c.photoUrl
              ? peek(c.url, { spend: () => o.limiter.take("li-peek", ip, PEEKS_PER_IP), signal }).catch(() => null)
              : null,
          ),
        );
        same = same.map((c, i) => {
          const p = read[i];
          return p ? { ...c, headline: c.headline || p.headline, ...(p.photoUrl ? { photoUrl: p.photoUrl } : {}) } : c;
        });
      }
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
      if (!out.sure) {
        // Le nom et l'employeur de l'email sur un seul profil (confiance haute de l'application Azerit).
        const strong = same.filter((c) => c.score !== undefined && confidenceFor(c.score) === "high");
        if (strong.length === 1) {
          out.sure = strong[0]!;
          out.how = "employer";
        }
      }
      out.candidates = (same.length ? same : all).slice(0, PICKER_MAX);
    }
    out.github = await githubP;
    return out;
  }

  const failed = (): Resolution => ({ sure: null, how: null, candidates: [], github: null, off: true });

  const hook: LinkedinEnterHook = {
    allow: (c) => o.limiter.take("li-enter", clientIp(c), ENTER_STARTS_PER_DAY),
    finish(c, returnPath, profile) {
      sweep();
      const id = randomBytes(18).toString("base64url");
      const who = { ...profile, name: profile.name ?? "" };
      const session: Session = {
        name: who.name,
        email: profile.email,
        picture: profile.picture,
        exp: now() + ENTER_TTL_MS,
        // La recherche part tout de suite : elle tourne pendant que la page se recharge.
        resolving: Promise.race([resolve(who, clientIp(c)), new Promise<Resolution>((res) => setTimeout(() => res(failed()), RESOLVE_MAX_MS).unref?.())]).catch(failed),
      };
      void session.resolving.then((r) => (session.resolved = r));
      sessions.set(id, session);
      setCookie(c, ENTER_COOKIE, sign(secret, "enter", { i: id, e: session.exp }), { ...cookieBase, maxAge: ENTER_TTL_MS / 1000 });
      remember(c, { name: who.name }, true);
      const u = new URL(returnPath, o.baseUrl);
      u.searchParams.set("li", "1");
      return c.redirect(`${o.baseUrl}${u.pathname}${u.search}`, 302);
    },
  };

  // GET /api/entry/linkedin : ce que le front fait au retour de LinkedIn. `auto` :
  // le profil est sûr, la fiche part. Sinon `candidates` pour « C'est toi ? ».
  // `pending` : la recherche tourne encore, le front redemande (son attente reste
  // à l'écran). Jamais l'email.
  app.get("/api/entry/linkedin", async (c) => {
    c.header("Cache-Control", "no-store");
    const found = sessionOf(c);
    if (!found) return c.json({ signedIn: false });
    const { session } = found;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const r = await Promise.race([session.resolving, new Promise<null>((res) => (timer = setTimeout(() => res(null), pollWait)))]);
    clearTimeout(timer);
    const show = (x: LinkedinCandidate): LinkedinSuggestion => toSuggestion(x);
    if (!r) return c.json({ signedIn: true, name: session.name, candidates: [], pending: true });
    // Le profil est sûr : le navigateur s'en souvient, sa fiche se retrouvera sans nouvelle connexion.
    if (r.sure) remember(c, { name: session.name, url: r.sure.url });
    return c.json({
      signedIn: true,
      name: session.name,
      ...(r.sure ? { auto: show(r.sure) } : {}),
      candidates: r.sure ? [] : r.candidates.map(show),
      ...(r.off ? { off: true } : {}),
    });
  });

  // GET /api/entry/me : la fiche de qui s'est connecté dans ce navigateur, pour « Voir ma fiche ».
  // Rien d'autre que ce que la fiche montre déjà à tous.
  app.get("/api/entry/me", (c) => {
    c.header("Cache-Control", "no-store");
    const w = whoOf(c);
    const card = w && (w.url || w.cardId) ? (o.knownCard?.(w) ?? null) : null;
    return c.json({ card });
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
      // Le profil au seul nom et employeur fait partir la fiche, sans valoir la preuve d'un email ou d'une photo.
      sureProfile: sure && r.how !== "employer",
      used() {
        sessions.delete(found.id);
        deleteCookie(c, ENTER_COOKIE, cookieBase);
      },
    };
  };

  /**
   * Une fiche vient de partir de ce navigateur (jamais une dénonciation). `own` : c'est le profil
   * de la personne connectée (`identityFor`), le navigateur retient son profil et sa fiche. Sinon,
   * connectée mais pas retrouvée, elle a collé son lien ou tapé son pseudo : sa première fiche
   * est retenue comme la sienne, les suivantes non.
   */
  const rememberCard = (c: Context, cardId: string, linkedinUrl: string | undefined, own: boolean) => {
    if (own && linkedinUrl) return remember(c, { url: linkedinUrl, cardId });
    const w = whoOf(c);
    if (!w || w.cardId || !sessionOf(c)) return;
    remember(c, { cardId, ...(linkedinUrl && !w.url ? { url: linkedinUrl } : {}) });
  };

  /** Fiche supprimée : si c'est celle que ce navigateur retient (ou celle de son profil), il l'oublie. */
  const forgetCard = (c: Context, ids: string[], linkedinUrl?: string) => {
    const w = whoOf(c);
    if (!w || !((w.cardId && ids.includes(w.cardId)) || (w.url && w.url === linkedinUrl))) return;
    deleteCookie(c, WHO_COOKIE, cookieBase);
    deleteCookie(c, KNOWN_COOKIE, { ...cookieBase, httpOnly: false });
  };

  return { hook, identityFor, rememberCard, forgetCard };
}
