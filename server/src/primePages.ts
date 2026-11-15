// Le partage d'une prime (§18.4) : son image 1200 × 630 et les balises Open
// Graph de /primes et /primes/:id, que les robots de LinkedIn et X lisent sans
// exécuter de JS, en français ou en anglais. Même mécanique que les bandes (bandPages.ts) : l'adresse de
// l'image porte une clé de ce qu'elle dit (phase, jours restants, logo), l'image
// est gardée sur disque sous cette clé. Sans prime dans la saison, rien n'est
// monté : /primes ramène à l'accueil (primes.ts).

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Context, Hono } from "hono";
import { PRIME_ID_RE, type Season } from "../../shared/season";
import { IMAGE_QUERY } from "../../shared/images";
import type { PrimeView } from "../../shared/primes";
import type { Lang } from "../../shared/types";
import type { Store } from "./db";
import { pageTitle } from "../../shared/promise";
import { frTypo } from "../../shared/typo";
import { HOME_IMAGE_PATH, homeImageAlt, injectMeta, requestLang, standalonePage, type PageMeta } from "./html";
import { primeViewById } from "./primes";
import { primeJobs, primeWhen, type PrimeLogo } from "./render/prime";

/** Les logos des primes : web/public/primes/, servis tels quels par le front. */
export const PRIME_LOGO_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../web/public/primes");

const LOGO_RE = /^[a-z0-9][a-z0-9._-]{0,80}\.(png|svg)$/i;

/** Largeur et hauteur d'un PNG (en-tête IHDR) ou d'un SVG (width/height ou viewBox). */
export function logoSize(buf: Buffer, ext: string): { width: number; height: number } | null {
  if (ext === "png") {
    if (buf.length < 24 || buf.readUInt32BE(12) !== 0x49484452) return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  const head = buf.subarray(0, 4096).toString("utf8");
  const svg = /<svg\b[^>]*>/i.exec(head)?.[0];
  if (!svg) return null;
  const num = (name: string) => Number(new RegExp(`\\b${name}="\\s*([0-9.]+)(?:px)?\\s*"`).exec(svg)?.[1]);
  const vb = /\bviewBox="\s*[-0-9.]+[\s,]+[-0-9.]+[\s,]+([0-9.]+)[\s,]+([0-9.]+)\s*"/.exec(svg);
  const width = num("width") || Number(vb?.[1]);
  const height = num("height") || Number(vb?.[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

/** Le logo d'une prime en data URI pour l'image, ou null (absent, illisible, format non pris). */
export async function readLogo(file: string | undefined, dir = PRIME_LOGO_DIR): Promise<PrimeLogo | null> {
  if (!file || !LOGO_RE.test(file)) return null;
  const ext = file.split(".").pop()!.toLowerCase();
  const buf = await readFile(join(dir, file)).catch(() => null);
  if (!buf || buf.length > 512 * 1024) return null;
  const size = logoSize(buf, ext);
  if (!size) return null;
  return { href: `data:${ext === "png" ? "image/png" : "image/svg+xml"};base64,${buf.toString("base64")}`, ...size };
}

/** La clé de l'image d'une prime : elle change avec tout ce que l'image dit. */
export function primeImageKey(p: PrimeView): string {
  const said = [p.company, p.logo ?? null, p.contract, p.positions, p.interviews, p.place ?? null, p.remote, p.phase, p.daysLeft, p.from];
  return createHash("sha256").update(JSON.stringify(said)).digest("hex").slice(0, 10);
}

export const primeImagePath = (p: PrimeView): string => `/og/p/${p.id}.png?${IMAGE_QUERY}&k=${primeImageKey(p)}`;

const CONTRACT_FR: Record<PrimeView["contract"], string> = { stage: "stage", alternance: "alternance", cdi: "CDI" };
const CONTRACT_EN: Record<PrimeView["contract"], string> = { stage: "internship", alternance: "apprenticeship", cdi: "full-time job" };

/** « J-12 » reste tel quel ; « Dernier jour », « Ouvre le 19 novembre » perdent leur majuscule au milieu d'une phrase. */
const inSentence = (s: string) => (/^[A-Z]-/.test(s) ? s : `${s.charAt(0).toLowerCase()}${s.slice(1)}`);

/** Les balises de la page d'une prime, dans la langue demandée. */
export function primeMeta(p: PrimeView, baseUrl: string, lang: Lang = "fr"): PageMeta {
  const jobs = primeJobs(p, lang);
  const when = inSentence(primeWhen(p, lang));
  const url = `${baseUrl}/primes/${p.id}`;
  const image = `${baseUrl}${primeImagePath(p)}`;
  if (lang === "en") {
    const interviews = `${p.interviews} ${p.interviews === 1 ? "interview" : "interviews"}`;
    return {
      lang,
      url,
      image,
      title: pageTitle(`${p.company}, ${jobs} ${CONTRACT_EN[p.contract]}`),
      description:
        p.phase === "closed"
          ? `Bounty closed: ${interviews} for the top-ranked sheets. Get your rap sheet for the next ones.`
          : `${interviews} for the top-ranked sheets, ${when}. Get your rap sheet and enter the race.`,
      imageAlt: `${p.company}, ${jobs} ${CONTRACT_EN[p.contract]}, ${interviews}`,
    };
  }
  const interviews = `${p.interviews} ${p.interviews > 1 ? "entretiens" : "entretien"}`;
  return {
    lang,
    url,
    image,
    title: pageTitle(`${p.company}, ${CONTRACT_FR[p.contract]} ${jobs}`),
    description: frTypo(
      p.phase === "closed"
        ? `Prime terminée : ${interviews} pour les fiches les mieux classées. Fais ta fiche pour les prochaines.`
        : `${interviews} pour les fiches les mieux classées, ${when}. Fais ta fiche et entre dans la course.`,
    ),
    imageAlt: `${p.company}, ${CONTRACT_FR[p.contract]} ${jobs}, ${interviews}`,
  };
}

/** Les balises de /primes : l'image de l'accueil. */
export function primesMeta(baseUrl: string, lang: Lang = "fr"): PageMeta {
  const fr = lang === "fr";
  return {
    lang,
    url: `${baseUrl}/primes`,
    title: frTypo(pageTitle(fr ? "Les primes : des entretiens pour le haut du classement" : "Bounties: interviews for the top of the board")),
    description: fr
      ? frTypo("Stage, alternance, CDI : des entreprises offrent des entretiens aux fiches les mieux classées. Fais ta fiche et entre dans la course.")
      : "Internship, apprenticeship, full-time: companies offer interviews to the top-ranked sheets. Get your rap sheet and enter the race.",
    image: `${baseUrl}${HOME_IMAGE_PATH}`,
    // l'image est celle de l'accueil : son texte aussi
    imageAlt: homeImageAlt(lang),
  };
}

/** Le titre d'une prime qui n'existe pas (404). */
export const primeNotFoundTitle = (lang: Lang): string => pageTitle(lang === "fr" ? "Prime introuvable" : "Bounty not found");

export interface PrimeImageInput {
  format: "prime";
  prime: PrimeView;
  logo: PrimeLogo | null;
  lang: Lang;
}

export interface PrimePagesOptions {
  store: Store;
  season: Season | null;
  baseUrl: string;
  /** Cache disque des PNG du dessin en cours ; les primes ont leur dossier, `primes/`. */
  ogDir: string;
  render: (input: PrimeImageInput) => Promise<Uint8Array>;
  indexHtml?: () => Promise<string | null>;
  logoDir?: string;
  now?: () => number;
}

export function mountPrimePages(app: Hono, o: PrimePagesOptions): void {
  const { store, season, baseUrl } = o;
  if (!season || season.primes.length === 0) return;
  const now = () => (o.now ? o.now() : Date.now());
  const dir = join(o.ogDir, "primes");
  const rendering = new Map<string, Promise<Uint8Array>>();

  // GET /og/p/:id.png : l'image d'une prime, en cache disque sous sa clé ; les anciennes partent.
  app.get("/og/p/:file", async (c) => {
    const m = /^([a-z0-9-]{1,60})\.png$/.exec(c.req.param("file"));
    const prime = m && PRIME_ID_RE.test(m[1]!) ? primeViewById(store, season, m[1]!, now()) : null;
    if (!prime) return c.notFound();
    const prefix = `${prime.id}.`;
    const path = join(dir, `${prefix}${primeImageKey(prime)}.png`);
    let png: Uint8Array | null = await readFile(path).catch(() => null);
    if (!png) {
      let p = rendering.get(path);
      if (!p) {
        p = (async () => {
          const logo = await readLogo(prime.logo, o.logoDir);
          const buf = await o.render({ format: "prime", prime, logo, lang: "fr" });
          await mkdir(dir, { recursive: true });
          const old = await readdir(dir).catch(() => [] as string[]);
          await Promise.all(old.filter((n) => n.startsWith(prefix)).map((n) => rm(join(dir, n), { force: true })));
          const tmp = `${path}.${process.pid}.tmp`;
          await writeFile(tmp, buf);
          await rename(tmp, path);
          return buf;
        })().finally(() => rendering.delete(path));
        rendering.set(path, p);
      }
      png = await p;
    }
    return c.body(new Uint8Array(png), 200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=300" });
  });

  const page = async (c: Context, meta: PageMeta, status: 200 | 404) => {
    const template = o.indexHtml ? await o.indexHtml().catch(() => null) : null;
    c.header("Cache-Control", "public, max-age=300");
    // Les balises suivent la langue demandée : un cache ne sert pas l'une pour l'autre.
    c.header("Vary", "Accept-Language");
    return c.html(template ? injectMeta(template, meta) : standalonePage(meta), status);
  };
  const langOf = (c: Context): Lang => requestLang(c.req.query("lang"), c.req.header("Accept-Language"));

  // Les pages du front, rendues ici pour leurs balises (après le garde de primes.ts).
  app.get("/primes", (c) => page(c, primesMeta(baseUrl, langOf(c)), 200));
  app.get("/primes/:id", (c) => {
    const lang = langOf(c);
    const prime = primeViewById(store, season, c.req.param("id"), now());
    if (!prime) return page(c, { ...primesMeta(baseUrl, lang), title: primeNotFoundTitle(lang) }, 404);
    return page(c, primeMeta(prime, baseUrl, lang), 200);
  });
}
