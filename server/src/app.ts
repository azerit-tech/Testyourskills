// API Hono (SPEC §7, §9, §11, §12, §16). Construite par createApp pour que les
// tests l'appellent via app.request() avec des dépendances fausses.

import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { serveStatic } from "@hono/node-server/serve-static";
import { timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { CardData, ComparisonData, ErrorCode, Fact, JobState, Lang } from "../../shared/types";
import { stripToken, type CardRow, type Store } from "./db";
import { buildLead, clientEventSchema, sendLead } from "./events";
import { genericMeta, injectMeta, messagePage, metaFor, standalonePage } from "./html";
import { ID_RE, MAX_PDF_BYTES, MESSAGES, Pipeline, type Deps, type RenderInput } from "./pipeline";
import { CARDS_PER_DAY, RateLimiter, clientIp } from "./ratelimit";
import { inlineAvatar, mountLinkedin, removeAvatars, type LinkedinConfig } from "./linkedin";
import { mountAuth, ownerFromRequest, sameOrigin, type GithubAuthConfig } from "./auth";
import { DENOUNCE_LIMITED, DENOUNCE_PER_DAY, mountDenounce, parseDenunciation } from "./denounce";
import { mountJury } from "./jury";
import { aiStatus as budgetAiStatus, type AiStatus } from "./ai/budget";
import type { TokenPool } from "./github/tokens";
import { weekTop, withWeekSpecial } from "./top";
import { normalizeLinkedinUrl, PAID_CALLS_PER_IP, type LinkedinFinder } from "./linkedinProfile/index";
import { forgetLinkedinOfCard, recentLinkedinCard } from "./linkedinProfile/cards";

export interface AppOptions {
  store: Store;
  deps: Deps;
  /** Premier jeton GitHub (ou vide) : sert au diagnostic et de repli si `githubPool` est absent. */
  githubToken: string;
  /** Jetons GitHub en rotation (GITHUB_TOKENS). Absent : `githubToken` seul. */
  githubPool?: TokenPool;
  /** URL publique sans / final, ex. https://skills.azerit.tech */
  baseUrl: string;
  /** Cache disque des PNG (var/og en dev, /data/og en prod). */
  ogDir: string;
  leadsEndpoint?: string;
  timeoutMs?: number;
  /** File d'attente des fiches (voir PipelineOptions). */
  maxConcurrentCards?: number;
  queueTimeoutMs?: number;
  busyAfterMs?: number;
  cardsPerDay?: number;
  /** Sel du hash des IP pour les compteurs de limite. */
  ipSalt?: string;
  /** Prod : dossier du front buildé (dist/web), servi en statique avec repli SPA. */
  staticRoot?: string;
  /** index.html du front dans lequel injecter les balises OG de /c/:id. null : page autonome. */
  indexHtml?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  /** Photo LinkedIn (OpenID Connect). Absent : fonctionnalité désactivée. */
  linkedin?: LinkedinConfig;
  /** « C'est moi » par GitHub OAuth (§18.1). Absent : fonctionnalité désactivée, bouton caché. */
  githubAuth?: GithubAuthConfig;
  /** Cookies de session en Secure. Défaut : si baseUrl est en https. */
  secureCookies?: boolean;
  /** Photos LinkedIn sur disque. Défaut : à côté de ogDir, dans avatars/. */
  avatarDir?: string;
  /** Pseudo GitHub de la carte d'exemple de l'accueil (§6.1). Absent : pas de vitrine. */
  showcaseLogin?: string;
  /** Photo de la carte vitrine, à la place de l'avatar GitHub. */
  showcasePhoto?: string;
  /** État de l'IA (plafond du jour, crédit). Défaut : le suivi de ai/budget.ts. */
  aiStatus?: () => AiStatus;
  /** LinkedIn contre GitHub, et l'entrée LinkedIn (§18.24). Absent : pas de jeton de fournisseur, fonctionnalité absente. */
  linkedinProfiles?: LinkedinFinder;
}

/** La carte vitrine est recalculée au plus une fois par semaine. */
const SHOWCASE_MS = 7 * 24 * 3600 * 1000;
const SHOWCASE_DEGRADED_MS = 3600 * 1000;

export function defaultAvatarDir(ogDir: string): string {
  return join(dirname(ogDir), "avatars");
}

// --- Validation -------------------------------------------------------------

const GITHUB_LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/** Accepte « lea », « @lea », « github.com/lea », « https://github.com/lea/repo ». */
export function normalizeLogin(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "");
  s = s.replace(/^@/, "");
  s = s.split(/[/?#]/)[0] ?? "";
  return s;
}

const loginSchema = z
  .string()
  .max(200)
  .transform(normalizeLogin)
  .pipe(z.string().regex(GITHUB_LOGIN_RE));

const langSchema = z.enum(["fr", "en"]).catch("fr");

const jsonCardSchema = z.object({
  login: loginSchema.optional(),
  /** Adresse de profil LinkedIn (§18.24), validée à part pour un message clair. */
  linkedin: z.string().max(300).optional(),
  lang: langSchema.optional(),
});

/** Le champ unique de l'accueil envoie aussi une adresse LinkedIn dans `login` : on la range dans `linkedin`. */
function linkedinInLogin(raw: unknown): unknown {
  const o = raw as { login?: unknown; linkedin?: unknown } | null;
  if (!o || typeof o !== "object" || typeof o.login !== "string" || o.linkedin !== undefined) return raw;
  if (!/linkedin\.com/i.test(o.login)) return raw;
  const { login, ...rest } = o;
  return { ...rest, linkedin: login };
}

const emailSchema = z.object({
  cardId: z.string().regex(ID_RE),
  email: z.email().max(254),
  /** Jeton de la fiche, connu du navigateur qui l'a créée. Absent : il faut la session du propriétaire. */
  token: z.string().max(200).optional(),
});

/**
 * Origine d'une fiche (?r= du lien partagé, §18.0) : l'id d'une fiche existante,
 * sinon rien. Jamais d'erreur pour ça, une ref douteuse est ignorée en silence.
 */
function parseRef(raw: unknown, store: Store): string | undefined {
  if (typeof raw !== "string" || !ID_RE.test(raw)) return undefined;
  return store.getCard(raw) ? raw : undefined;
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

function isPdf(buf: Uint8Array): boolean {
  // La signature peut être précédée de quelques octets parasites.
  const head = buf.subarray(0, 1024);
  outer: for (let i = 0; i + PDF_MAGIC.length <= head.length; i++) {
    for (let j = 0; j < PDF_MAGIC.length; j++) if (head[i + j] !== PDF_MAGIC[j]) continue outer;
    return true;
  }
  return false;
}

function errorBody(code: ErrorCode, message: Fact): JobState {
  return { state: "error", code, message };
}

function tokenMatches(given: string | undefined, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// --- Images OG en cache disque ----------------------------------------------

const OG_FILE_RE = /^([A-Za-z0-9]{6,32})(-portrait|-card)?\.png$/;
const OG_SUFFIXES = ["", "-portrait", "-card"];
/** Fichier sur disque d'une image qui porte la spéciale « Top 5 de la semaine » (§18.22) : une autre clé de cache. */
const TOTW_TAG = "-totw";

export async function removeImages(ogDir: string, ids: string[]) {
  await Promise.all(
    ids.flatMap((id) =>
      OG_SUFFIXES.flatMap((s) => ["", TOTW_TAG].map((tag) => rm(join(ogDir, `${id}${tag}${s}.png`), { force: true }))),
    ),
  );
}

/** Purge §11 : cartes de plus de 90 jours sans email, leurs PNG et leurs photos. */
export async function purge(store: Store, ogDir: string, now = Date.now(), avatarDir = defaultAvatarDir(ogDir)): Promise<number> {
  const ids = store.purgeExpired(now);
  await Promise.all([removeImages(ogDir, ids), removeAvatars(avatarDir, ids)]);
  return ids.length;
}

// --- Application ------------------------------------------------------------

export function createApp(opts: AppOptions) {
  const { store, deps, baseUrl, ogDir } = opts;
  const pipeline = new Pipeline({
    store,
    deps,
    githubToken: opts.githubToken,
    githubPool: opts.githubPool,
    timeoutMs: opts.timeoutMs,
    maxConcurrent: opts.maxConcurrentCards,
    queueTimeoutMs: opts.queueTimeoutMs,
    busyAfterMs: opts.busyAfterMs,
    linkedin: opts.linkedinProfiles,
  });
  const limiter = new RateLimiter(store, opts.ipSalt ?? "testyourskills");
  const cardsPerDay = opts.cardsPerDay ?? CARDS_PER_DAY;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const rendering = new Map<string, Promise<Uint8Array>>();
  const avatarDir = opts.avatarDir ?? defaultAvatarDir(ogDir);
  const aiStatus = opts.aiStatus ?? budgetAiStatus;

  const app = new Hono();

  app.onError((err, c) => {
    console.error("[api]", err);
    return c.json(errorBody("internal", MESSAGES.internal), 500);
  });

  // Revendication GitHub (§18.1), montée en tête : son middleware doit passer
  // avant les routes qui demandent ownerFromRequest (fiches masquées).
  mountAuth(app, {
    store,
    config: opts.githubAuth,
    baseUrl,
    secure: opts.secureCookies ?? baseUrl.startsWith("https://"),
    limiter,
    fetchImpl,
    removeImages: (ids) => removeImages(ogDir, ids),
  });

  /** Login masqué par son propriétaire, vu par quelqu'un d'autre que lui (§18.1). */
  const hiddenFrom = (c: Context, login: string | null | undefined): boolean => {
    if (!login || !store.isHidden(login)) return false;
    return ownerFromRequest(c)?.login !== login.toLowerCase();
  };

  /**
   * La personne connectée est propriétaire revendiquée du login de cette fiche
   * (§18.1). Pour agir sur la fiche, la requête doit aussi venir du site.
   */
  const ownedBy = (c: Context, row: CardRow): boolean => {
    const login = store.loginOf(row);
    const owner = login ? ownerFromRequest(c) : null;
    return !!owner && owner.login === login!.toLowerCase() && sameOrigin(c, baseUrl);
  };

  // Public : jamais de montant. ai = ok | budget (plafond du jour atteint) |
  // credits (solde sous AI_MIN_CREDIT_USD, ou 402 / réponse tronquée vus dans
  // les 10 dernières minutes sans solde suffisant lu depuis) | off (pas de clé).
  app.get("/api/health", (c) =>
    c.json({ ok: true, ai: safeAiStatus(aiStatus) ?? "off", github: !!opts.githubToken, linkedin: !!opts.linkedin }),
  );

  // Ce que le front doit afficher ou masquer.
  // linkedinEntry : le champ de l'accueil accepte une adresse LinkedIn (§18.24).
  app.get("/api/config", (c) => c.json({ linkedin: !!opts.linkedin, claim: !!opts.githubAuth, linkedinEntry: !!opts.linkedinProfiles }));

  // GET /api/showcase : la vraie carte du pseudo vitrine, pour l'accueil (§6.1).
  // Hors quota. Null tant qu'aucune n'existe ; on en lance une si la dernière
  // date de plus d'une semaine.
  app.get("/api/showcase", (c) => {
    c.header("Cache-Control", "public, max-age=300");
    const login = opts.showcaseLogin;
    if (!login || store.isHidden(login)) return c.json({ card: null });
    const row = store.findLatestGithub(login);
    // Vitrine sortie sans lecture IA : on la retente au bout d'une heure, pas d'une semaine.
    const stale = !row || Date.now() - row.createdAt > (row.degraded ? SHOWCASE_DEGRADED_MS : SHOWCASE_MS);
    // Jetons GitHub épuisés : la vitrine attendra, elle ne prend pas la place d'une vraie fiche.
    if (stale && !pipeline.inflightFor(login) && !pipeline.githubBusy()) pipeline.start({ lang: "fr", login, noLinkedin: true });
    if (!row) return c.json({ card: null });
    const card = stripToken(row.data as CardData);
    return c.json({ card: opts.showcasePhoto ? { ...card, avatarUrl: opts.showcasePhoto, photoSource: "linkedin" } : card });
  });

  // GET /api/top : le haut du classement de la semaine (§18.22). Rien de privé,
  // ce qui est déjà sur les fiches publiques. Marche aussi sans crédit IA.
  app.get("/api/top", (c) => {
    c.header("Cache-Control", "public, max-age=60");
    return c.json(weekTop(store.db, { now: Date.now(), limit: 10 }));
  });

  // POST /api/card : JSON { login, lang, ref? } ou multipart (cv, login?, lang?, ref?).
  app.post(
    "/api/card",
    bodyLimit({
      maxSize: MAX_PDF_BYTES + 256 * 1024,
      onError: (c) => c.json(errorBody("pdf_too_large", MESSAGES.pdf_too_large), 413),
    }),
    async (c) => {
      const ct = c.req.header("content-type") ?? "";
      let login: string | undefined;
      let lang: Lang = "fr";
      let pdf: Uint8Array | undefined;
      let ref: string | undefined;
      // Fiche du dénonciateur (§18.6, denounce.ts) : JSON seulement, on dénonce un pseudo, pas un CV.
      let denouncedBy: unknown;
      let linkedinUrl: string | undefined;

      if (ct.startsWith("multipart/form-data")) {
        const body = await c.req.parseBody();
        const file = body["cv"];
        ref = parseRef(body["ref"], store);
        if (typeof body["lang"] === "string") lang = langSchema.parse(body["lang"]);
        const rawLogin = typeof body["login"] === "string" ? body["login"].trim() : "";
        if (rawLogin) {
          const parsed = loginSchema.safeParse(rawLogin);
          if (!parsed.success) return c.json(errorBody("unknown_user", MESSAGES.unknown_user), 400);
          login = parsed.data;
        }
        if (file instanceof File) {
          if (file.size > MAX_PDF_BYTES) return c.json(errorBody("pdf_too_large", MESSAGES.pdf_too_large), 413);
          pdf = new Uint8Array(await file.arrayBuffer());
          if (!isPdf(pdf)) return c.json(errorBody("not_a_pdf", MESSAGES.not_a_pdf), 400);
        } else if (file !== undefined) {
          return c.json(errorBody("not_a_pdf", MESSAGES.not_a_pdf), 400);
        }
      } else {
        const raw = linkedinInLogin(await c.req.json().catch(() => null));
        const parsed = jsonCardSchema.safeParse(raw);
        if (!parsed.success) {
          const hasLogin = typeof (raw as { login?: unknown } | null)?.login === "string";
          return hasLogin
            ? c.json(errorBody("unknown_user", MESSAGES.unknown_user), 400)
            : c.json(errorBody("internal", MESSAGES.bad_request), 400);
        }
        login = parsed.data.login;
        lang = parsed.data.lang ?? "fr";
        ref = parseRef((raw as { ref?: unknown }).ref, store);
        denouncedBy = (raw as { denouncedBy?: unknown }).denouncedBy;
        // Entrée LinkedIn (§18.24) : une adresse de profil, rien d'autre.
        if (parsed.data.linkedin !== undefined) {
          linkedinUrl = normalizeLinkedinUrl(parsed.data.linkedin) ?? undefined;
          if (!linkedinUrl) return c.json(errorBody("linkedin", MESSAGES.linkedin_bad_url), 400);
        }
      }

      if (!login && !pdf && !linkedinUrl) return c.json(errorBody("internal", MESSAGES.bad_request), 400);
      // Sans fournisseur de profils, l'entrée LinkedIn n'existe pas ; avec un pseudo, le lien est ignoré.
      if (linkedinUrl && !opts.linkedinProfiles) {
        if (!login) return c.json(errorBody("linkedin", MESSAGES.linkedin_off), 400);
        linkedinUrl = undefined;
      }
      if (linkedinUrl && !login) {
        const cached = recentLinkedinCard(store.db, { url: linkedinUrl });
        if (cached) return c.json({ id: cached, cached: true }, 200);
      }

      // Login masqué par son propriétaire : personne d'autre que lui n'en refait une fiche (§18.1).
      if (login && hiddenFrom(c, login)) return c.json(errorBody("gone", MESSAGES.gone), 410);

      // Dénonciation (§18.6) : cinq par jour et par IP, vérifiées avant tout calcul.
      const ip = clientIp(c);
      const denounce = login && !pdf ? parseDenunciation(denouncedBy, login, store, c) : undefined;
      if (denounce && !limiter.allowed("denounce", ip, DENOUNCE_PER_DAY)) {
        return c.json(errorBody("rate_limited", DENOUNCE_LIMITED), 429);
      }
      /** Compte la dénonciation et marque la fiche du complice, dès qu'elle existe. */
      const denounced = (id: string) => {
        if (!denounce) return;
        limiter.take("denounce", ip, DENOUNCE_PER_DAY);
        store.recordEvent("denounce_sent", id, { by: denounce.byCardId });
        const mark = () => store.markDenounced(id, denounce.byCardId, denounce.named);
        if (store.getCard(id)) mark();
        else void pipeline.wait(id).then(mark);
      };

      // Cache 24 h et déduplication des jobs en cours, pour GitHub seul (§4.7, §12).
      if (login && !pdf && !linkedinUrl) {
        // Une comparaison LinkedIn contre GitHub récente passe devant la fiche GitHub seule (§18.24).
        const compared = opts.linkedinProfiles ? recentLinkedinCard(store.db, { login }) : null;
        if (compared) {
          denounced(compared);
          return c.json({ id: compared, cached: true }, 200);
        }
        const cached = store.findRecentGithub(login);
        if (cached) {
          denounced(cached.id);
          return c.json({ id: cached.id, cached: true }, 200);
        }
        const running = pipeline.inflightFor(login);
        if (running) {
          denounced(running);
          return c.json({ id: running, cached: true }, 200);
        }
      }

      // Plafond IA du jour atteint, ou crédit OpenRouter sous le seuil (solde lu
      // toutes les 5 minutes, 402 ou réponse tronquée vus) : commissariat fermé,
      // sans lancer de job ni entamer le quota. Le cache ci-dessus reste servi.
      // Une recharge rouvre dès la lecture suivante du solde.
      const ai = safeAiStatus(aiStatus);
      if (ai === "budget" || ai === "credits") {
        return c.json(errorBody("closed", MESSAGES.closed), 503);
      }

      // 20 cartes par IP et par jour : seules les cartes réellement calculées comptent.
      // GitHub nous a coupé l'accès pour longtemps : on le dit tout de suite, sans entamer le quota de l'IP.
      if (login) {
        const busy = pipeline.githubBusy();
        if (busy) return c.json(errorBody(busy.code, busy.msg), 503);
      }

      if (!limiter.take("card", ip, cardsPerDay)) {
        return c.json(errorBody("rate_limited", MESSAGES.rate_limited), 429);
      }

      const { id, deleteToken } = pipeline.start({
        lang,
        login,
        pdf,
        linkedinUrl,
        // Lectures payantes de profils LinkedIn : une limite par IP en plus du budget du jour (§18.24).
        linkedinSpend: () => limiter.take("linkedin", ip, PAID_CALLS_PER_IP),
      });
      denounced(id);
      // L'insertion arrive toujours après ce retour (le pipeline attend au moins
      // une fois) : la ref est écrite dans la ligne, puis oubliée en fin de job.
      if (ref) {
        store.expectRef(id, ref);
        void pipeline.wait(id).finally(() => store.forgetRef(id));
      }
      return c.json({ id, deleteToken, cached: false }, 202);
    },
  );

  // GET /api/card/:id : JobState. Jamais le jeton de suppression.
  app.get("/api/card/:id", (c) => {
    c.header("Cache-Control", "no-store");
    const id = c.req.param("id");
    if (!ID_RE.test(id)) return c.json(errorBody("internal", MESSAGES.not_found), 404);
    const row = store.getCard(id);
    if (row && hiddenFrom(c, store.loginOf(row))) return c.json(errorBody("gone", MESSAGES.withdrawn), 410);
    const live = pipeline.jobState(id);
    if (live) return c.json(live);
    if (!row) return c.json(errorBody("internal", MESSAGES.not_found), 404);
    // Spéciale « Top 5 de la semaine » et rang de la semaine, relus à chaque fois (§18.22).
    const { data, week } = withWeekSpecial(store.db, stripToken(row.data));
    const rank = week ? { week } : {};
    // `mine` : la session est propriétaire du login de la fiche ; le front lui ouvre l'email, la photo et la suppression sans jeton.
    const extra = { ...rank, ...(ownedBy(c, row) ? { mine: true } : {}) };
    const state: JobState =
      row.kind === "comparison"
        ? { state: "done", kind: "comparison", comparison: data as ComparisonData, ...extra }
        : { state: "done", kind: "card", card: data as CardData, ...extra };
    return c.json(state);
  });

  // Suppression (§11) : DELETE pour le front, GET pour le lien d'un email.
  // Le jeton de la fiche, ou (`bySession`) la session du propriétaire revendiqué de son login.
  const deleteCard = async (c: Context, bySession = false): Promise<{ status: 200 | 403 | 404; ids?: string[] }> => {
    const id = c.req.param("id") ?? "";
    if (!ID_RE.test(id)) return { status: 404 };
    const row = store.getCard(id);
    if (!row) return { status: 404 };
    if (!tokenMatches(c.req.query("token"), row.deleteToken) && !(bySession && ownedBy(c, row))) return { status: 403 };
    // Fiche LinkedIn supprimée : le profil en cache part avec elle (§18.24).
    forgetLinkedinOfCard(store.db, (row.parentId ? store.getCard(row.parentId) : row)?.facts);
    const ids = store.deleteGroup(id);
    await Promise.all([removeImages(ogDir, ids), removeAvatars(avatarDir, ids)]);
    return { status: 200, ids };
  };

  app.delete("/api/card/:id", async (c) => {
    const r = await deleteCard(c, true);
    if (r.status === 200) return c.json({ ok: true, deleted: r.ids });
    if (r.status === 403)
      return c.json({ ok: false, message: { fr: "Jeton de suppression invalide.", en: "Invalid deletion token." } }, 403);
    return c.json({ ok: false, message: MESSAGES.not_found }, 404);
  });

  // Le lien GET ne vaut que par son jeton : un cookie de session part aussi sur un simple clic venu d'ailleurs.
  app.get("/api/card/:id/delete", async (c) => {
    const r = await deleteCard(c);
    if (r.status === 200)
      return c.html(messagePage("Ta fiche et ses images sont supprimées.", "Your sheet and its images are deleted."));
    if (r.status === 403)
      return c.html(messagePage("Ce lien de suppression n'est pas valide.", "This deletion link is not valid."), 403);
    return c.html(messagePage(MESSAGES.not_found.fr, MESSAGES.not_found.en), 404);
  });

  // POST /api/event : mesure sans outil d'analytics (§16).
  app.post("/api/event", async (c) => {
    const raw = await c.req.json().catch(() => null);
    if (raw && typeof raw === "object" && (raw as { event?: unknown }).event === "card_generated") {
      return c.json({ ok: true, ignored: true }, 202); // posé par le serveur lui-même
    }
    const parsed = clientEventSchema.safeParse(raw);
    if (!parsed.success) return c.json({ ok: false }, 400);
    if (!limiter.take("event", clientIp(c), 500)) return c.json({ ok: false }, 429);
    const { event, cardId, meta } = parsed.data;
    store.recordEvent(event, cardId ?? null, meta);
    return c.json({ ok: true }, 202);
  });

  // POST /api/email : email optionnel après la carte (§6.4). Prolonge la conservation (§11).
  // Réservé à qui a créé la fiche (son jeton) ou au propriétaire revendiqué de son login :
  // sinon n'importe qui écraserait l'email d'une fiche et lèverait son expiration.
  app.post("/api/email", async (c) => {
    const parsed = emailSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ ok: false, message: { fr: "Cet email n'a pas l'air valide.", en: "That email doesn't look valid." } }, 400);
    }
    const { cardId, email, token } = parsed.data;
    const row = store.getCard(cardId);
    if (!row) return c.json({ ok: false, message: MESSAGES.not_found }, 404);
    if (!tokenMatches(token, row.deleteToken) && !ownedBy(c, row)) {
      return c.json(
        { ok: false, message: { fr: "Seule la personne qui a créé cette fiche peut y laisser un email.", en: "Only the person who made this sheet can leave an email on it." } },
        403,
      );
    }
    if (!limiter.take("email", clientIp(c), 10)) {
      return c.json({ ok: false, message: MESSAGES.rate_limited }, 429);
    }
    store.setEmail(cardId, email);
    store.recordEvent("card_email", cardId);
    // Relais non bloquant : l'utilisateur n'attend pas le webhook.
    void sendLead(opts.leadsEndpoint, buildLead(email, cardId, baseUrl), fetchImpl);
    return c.json({ ok: true });
  });

  // Images : /og/:id.png (1200×630), /og/:id-portrait.png (1080×1350), /og/:id-card.png.
  app.get("/og/:file", async (c) => {
    const m = OG_FILE_RE.exec(c.req.param("file"));
    if (!m) return c.notFound();
    const id = m[1]!;
    const format: RenderInput["format"] = m[2] === "-portrait" ? "portrait" : m[2] === "-card" ? "card" : "og";
    const row = store.getCard(id);
    // Fiche masquée : aucune image, pour personne (les robots n'ont pas de session).
    if (!row || store.isHidden(store.loginOf(row))) return c.notFound();

    // La spéciale de la semaine change l'image : elle entre dans la clé du cache disque (§18.22).
    const week = withWeekSpecial(store.db, row.data);
    const tag = week.totw ? TOTW_TAG : "";
    const path = join(ogDir, `${id}${tag}${m[2] ?? ""}.png`);
    let png: Uint8Array | null = await readFile(path).catch(() => null);
    if (!png) {
      const key = `${id}${tag}:${format}`;
      let p = rendering.get(key);
      if (!p) {
        p = (async () => {
          // Photo servie par nous : data URI lu sur disque, sur une copie de la carte.
          const inline = (card: CardData) => inlineAvatar(card, baseUrl, avatarDir);
          let input: RenderInput;
          if (row.kind === "comparison") {
            const cmp = week.data as ComparisonData;
            input = { format, comparison: { ...cmp, cv: await inline(cmp.cv), github: await inline(cmp.github) }, lang: cmp.cv.lang };
          } else {
            const card = week.data as CardData;
            input = { format, card: await inline(card), lang: card.lang };
          }
          const buf = await deps.renderImage(input);
          await mkdir(ogDir, { recursive: true });
          const tmp = `${path}.${process.pid}.tmp`;
          await writeFile(tmp, buf);
          await rename(tmp, path);
          return buf;
        })().finally(() => rendering.delete(key));
        rendering.set(key, p);
      }
      png = await p;
    }
    return c.body(new Uint8Array(png), 200, {
      "Content-Type": "image/png",
      // Spéciale portée pendant la semaine en cours : elle peut encore partir, cache court.
      // Sinon cache long ; si elle arrive plus tard, og:image change d'adresse (?s=totw).
      "Cache-Control": week.totw && week.live ? "public, max-age=300" : "public, max-age=31536000, immutable",
    });
  });

  // GET /c/:id : page avec balises OG, qui charge le front.
  app.get("/c/:id", async (c) => {
    const id = c.req.param("id");
    const row = ID_RE.test(id) ? store.getCard(id) : null;
    const template = opts.indexHtml ? await opts.indexHtml().catch(() => null) : null;
    const login = row ? store.loginOf(row) : null;
    if (row && store.isHidden(login)) {
      // Masquée (§18.1) : balises génériques, sans image de la fiche ; 410 pour
      // tous, sauf le propriétaire, à qui le front montre la fiche et le bandeau.
      const generic = genericMeta(baseUrl, `/c/${id}`);
      const mine = !hiddenFrom(c, login);
      const page = template ?? messagePage(MESSAGES.withdrawn.fr, MESSAGES.withdrawn.en);
      c.header("Cache-Control", "private, no-store");
      return c.html(injectMeta(page, generic), mine ? 200 : 410);
    }
    const meta = row ? metaFor(withWeekSpecial(store.db, row.data).data, baseUrl) : genericMeta(baseUrl, `/c/${id}`);
    const html = template ? injectMeta(template, meta) : standalonePage(meta);
    c.header("Cache-Control", "public, max-age=300");
    return c.html(html, row ? 200 : 404);
  });

  // GET /api/card/:id/case : dénonciation et complices suggérés (§18.6, §18.7).
  // POST /api/vote : le jury de la page partagée (§18.27) ; son décompte part aussi avec /case.
  const jury = mountJury(app, { store, limiter, notFound: MESSAGES.not_found, withdrawn: MESSAGES.withdrawn });
  mountDenounce(app, { store, hiddenFrom, notFound: MESSAGES.not_found, withdrawn: MESSAGES.withdrawn, jury });

  mountLinkedin(app, {
    store,
    config: opts.linkedin,
    baseUrl,
    avatarDir,
    fetchImpl,
    tokenMatches,
    removeImages: (ids) => removeImages(ogDir, ids),
    claim: !!opts.githubAuth,
    secure: opts.secureCookies ?? baseUrl.startsWith("https://"),
    stateSecret: opts.githubAuth?.sessionSecret,
  });

  app.notFound((c) => {
    if (c.req.path.startsWith("/api/")) return c.json({ ok: false, message: MESSAGES.not_found }, 404);
    return c.text("Not found", 404);
  });

  // Prod : front statique, puis repli SPA sur index.html hors /api, /og, /c.
  if (opts.staticRoot) {
    const root = opts.staticRoot;
    // Fichiers fingerprintés par Vite : cache long.
    app.use("/assets/*", async (c, next) => {
      await next();
      if (c.res.status === 200) c.res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    });
    // Assets de la scène 3D (non fingerprintés) : une semaine.
    app.use("/3d/*", async (c, next) => {
      await next();
      if (c.res.status === 200) c.res.headers.set("Cache-Control", "public, max-age=604800");
    });
    app.use("*", serveStatic({ root }));
    app.get("*", async (c) => {
      const p = c.req.path;
      if (/^\/(api|og|c|auth|avatar)\//.test(p)) return c.notFound();
      const template = opts.indexHtml ? await opts.indexHtml().catch(() => null) : null;
      if (!template) return c.notFound();
      c.header("Cache-Control", "no-cache");
      return c.html(template);
    });
  }

  return { app, pipeline };
}

function safeAiStatus(status: () => AiStatus): AiStatus | null {
  try {
    return status();
  } catch {
    return null;
  }
}
