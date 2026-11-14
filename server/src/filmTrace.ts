// La trace du film, pour la mise au point sur un vrai téléphone (web/src/film/trace.ts) :
// POST /api/film-trace { session, lines } ajoute chaque ligne, en JSON, à un
// fichier (une ligne par entrée, avec l'heure du serveur). Montée seulement
// avec FILM_TRACE=1 (index.ts) : sinon la route n'existe pas (404). Rien en
// base, pas de limite par IP (elle écrirait en base) : le corps est borné à
// 128 Ko et le fichier à MAX_FILE_BYTES, au-delà la trace s'arrête.

import { appendFile, mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";

export const FILM_TRACE_MAX_BODY = 128 * 1024;
/** Le fichier ne grossit pas au-delà : une trace oubliée allumée ne remplit pas le disque. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

const lineSchema = z.looseObject({ t: z.number().finite(), k: z.string().min(1).max(32) });
const traceSchema = z.object({
  session: z.string().regex(/^[A-Za-z0-9-]{6,64}$/),
  lines: z.array(lineSchema).min(1).max(2000),
});

export function mountFilmTrace(app: Hono, o: { file: string; now?: () => Date }) {
  const now = o.now ?? (() => new Date());
  /** Les écritures se suivent : deux lots d'une même page ne s'entremêlent pas. */
  let chain: Promise<unknown> = Promise.resolve();
  let size: number | null = null;

  const write = (text: string) => {
    const run = chain.then(async () => {
      if (size === null) {
        await mkdir(dirname(o.file), { recursive: true });
        size = await stat(o.file).then((s) => s.size, () => 0);
      }
      const bytes = Buffer.byteLength(text);
      if (size + bytes > MAX_FILE_BYTES) return false;
      await appendFile(o.file, text);
      size += bytes;
      return true;
    });
    chain = run.catch(() => undefined);
    return run;
  };

  app.post(
    "/api/film-trace",
    bodyLimit({ maxSize: FILM_TRACE_MAX_BODY, onError: (c) => c.json({ ok: false }, 413) }),
    async (c) => {
      c.header("Cache-Control", "no-store");
      const parsed = traceSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ ok: false }, 400);
      const at = now().toISOString();
      const { session, lines } = parsed.data;
      // l'heure et la session en tête, jamais remplacées par une ligne
      const text = lines.map((l) => JSON.stringify(Object.assign({ at, session }, l, { at, session }))).join("\n") + "\n";
      const ok = await write(text).catch(() => false);
      return ok ? c.json({ ok: true }, 202) : c.json({ ok: false }, 507);
    },
  );
}
