// Le partage d'une bande (SPEC §18.38) : son image 1200 × 630 et les balises
// Open Graph de /bandes et /bandes/:type/:id, que les robots de LinkedIn et X
// lisent sans exécuter de JS. L'adresse de l'image porte une clé de ce qu'elle
// dit (score, dossiers, rang) : le score change, l'aperçu change. Jamais le rang
// d'école du barème, jamais le nom d'un membre.

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Context, Hono } from "hono";
import { BAND_ID_RE, isBandType, type BandStanding, type BandType } from "../../shared/bands";
import { IMAGE_QUERY } from "../../shared/images";
import type { Lang } from "../../shared/types";
import { bandStanding } from "./bands";
import type { Store } from "./db";
import { HOME_IMAGE_PATH, injectMeta, standalonePage, type PageMeta } from "./html";

const LEAGUE_FR: Record<BandType, string> = { ecole: "des écoles", boite: "des boîtes" };

/** « 3e des écoles », « n° 1 des boîtes » : rien ne s'accorde. Null en formation. */
export function rankFr(b: Pick<BandStanding, "rank" | "type">): string | null {
  if (!b.rank) return null;
  return `${b.rank === 1 ? "n° 1" : `${b.rank}e`} ${LEAGUE_FR[b.type]}`;
}

/** « Bande en formation : il manque 2 complices ». */
export function formingFr(missing: number): string {
  return `Bande en formation : il manque ${missing} ${missing > 1 ? "complices" : "complice"}`;
}

export const dossiersFr = (n: number): string => `${n} ${n > 1 ? "dossiers" : "dossier"}`;

/** La clé de l'image d'une bande : elle change avec tout ce que l'image dit. */
export function bandImageKey(b: BandStanding): string {
  const said = [b.label, b.score, b.members, b.rank, b.missing, b.gap, b.ahead?.rank ?? null];
  return createHash("sha256").update(JSON.stringify(said)).digest("hex").slice(0, 10);
}

/** Adresse de l'image d'une bande, clé comprise. */
export const bandImagePath = (b: BandStanding): string => `/og/b/${b.type}/${b.id}.png?${IMAGE_QUERY}&k=${bandImageKey(b)}`;

/** Les balises de la page d'une bande : son nom, son rang et son score. */
export function bandMeta(b: BandStanding, baseUrl: string): PageMeta {
  const where = rankFr(b) ?? "bande en formation";
  return {
    lang: "fr",
    url: `${baseUrl}/bandes/${b.type}/${b.id}`,
    image: `${baseUrl}${bandImagePath(b)}`,
    title: `${b.label} : ${where}, ★ ${b.score}`,
    description: b.rank
      ? `${dossiersFr(b.members)}. Viens gonfler la bande : fais ta fiche pour ${b.label}.`
      : `${formingFr(b.missing)}. Fais ta fiche pour ${b.label}.`,
    imageAlt: `${b.label}, ★ ${b.score}, ${dossiersFr(b.members)}`,
  };
}

/** Les balises de /bandes : l'image de l'accueil. */
export function boardMeta(baseUrl: string): PageMeta {
  return {
    lang: "fr",
    url: `${baseUrl}/bandes`,
    title: "Les bandes de Testyourskills : écoles et boîtes",
    description: "Les écoles et les boîtes classées aux étoiles de leurs dossiers. Fais ta fiche, et rapporte à ta bande.",
    image: `${baseUrl}${HOME_IMAGE_PATH}`,
    imageAlt: "Testyourskills, les bandes",
  };
}

export interface BandImageInput {
  format: "band";
  band: BandStanding;
  lang: Lang;
}

export interface BandPagesOptions {
  store: Store;
  baseUrl: string;
  /** Cache disque des PNG du dessin en cours ; les bandes ont leur dossier, `bands/`. */
  ogDir: string;
  render: (input: BandImageInput) => Promise<Uint8Array>;
  /** index.html du front, dans lequel injecter les balises ; null : page autonome. */
  indexHtml?: () => Promise<string | null>;
}

export function mountBandPages(app: Hono, o: BandPagesOptions): void {
  const { store, baseUrl } = o;
  const dir = join(o.ogDir, "bands");
  const rendering = new Map<string, Promise<Uint8Array>>();

  // GET /og/b/:type/:id.png : l'image d'une bande, en cache disque sous sa clé ; les anciennes partent.
  app.get("/og/b/:type/:file", async (c) => {
    const type = c.req.param("type");
    const m = /^([a-z0-9-]{1,60})\.png$/.exec(c.req.param("file"));
    const band = m && isBandType(type) && BAND_ID_RE.test(m[1]!) ? bandStanding(store.db, type, m[1]!) : null;
    if (!band) return c.notFound();
    const prefix = `${band.type}.${band.id}.`;
    const path = join(dir, `${prefix}${bandImageKey(band)}.png`);
    let png: Uint8Array | null = await readFile(path).catch(() => null);
    if (!png) {
      let p = rendering.get(path);
      if (!p) {
        p = (async () => {
          const buf = await o.render({ format: "band", band, lang: "fr" });
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
    // L'adresse change avec le score : un cache court suffit à qui l'appelle sans clé.
    return c.body(new Uint8Array(png), 200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=300" });
  });

  const page = async (c: Context, meta: PageMeta, status: 200 | 404) => {
    const template = o.indexHtml ? await o.indexHtml().catch(() => null) : null;
    c.header("Cache-Control", "public, max-age=300");
    return c.html(template ? injectMeta(template, meta) : standalonePage(meta), status);
  };

  // Pages du front, rendues ici pour leurs balises : /bandes et /bandes/:type/:id.
  app.get("/bandes", (c) => page(c, boardMeta(baseUrl), 200));
  app.get("/bandes/:type/:id", (c) => {
    const type = c.req.param("type");
    const id = c.req.param("id");
    const band = isBandType(type) && BAND_ID_RE.test(id) ? bandStanding(store.db, type, id) : null;
    if (!band) return page(c, { ...boardMeta(baseUrl), title: "Bande introuvable" }, 404);
    return page(c, bandMeta(band, baseUrl), 200);
  });
}
