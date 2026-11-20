// Les anciennes adresses des bandes (SPEC §18.100) : la page /bandes et la page
// d'une bande n'existent plus, le classement des écoles et des boîtes est sur
// l'accueil. Un lien déjà partagé ne tombe pas sur une page introuvable : 301
// vers l'ancre du classement, la langue gardée (« /?lang=en#classement »).

import type { Context, Hono } from "hono";
import { RANKING_ANCHOR } from "../../shared/routes";

/** L'adresse du classement de l'accueil, la langue demandée gardée. */
export function rankingUrl(lang?: string | null): string {
  return `/${lang === "en" || lang === "fr" ? `?lang=${lang}` : ""}#${RANKING_ANCHOR}`;
}

export function mountBandPages(app: Hono): void {
  const go = (c: Context) => {
    c.header("Cache-Control", "public, max-age=3600");
    return c.redirect(rankingUrl(c.req.query("lang")), 301);
  };
  app.get("/bandes", go);
  app.get("/bandes/*", go);
}
