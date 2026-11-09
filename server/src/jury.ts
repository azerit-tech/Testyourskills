// Le jury de la page partagée (SPEC §18.27) : « Coupable ou relaxe ? ».
//
// POST /api/vote { cardId, verdict } → { jury: { guilty, cleared, mine } }.
// Un vote par fiche et par IP : le premier reste, un second appel rend le
// décompte et le vote déjà posé. 60 votes par IP et par jour. Aucun vote sur
// une fiche inconnue, expirée (404) ou masquée par son propriétaire (410, pour
// tout le monde). L'IP n'est gardée que sous son hash salé, celui des compteurs
// de limite. Le vote porte sur le chef d'accusation, jamais sur la personne :
// deux valeurs fermées, aucun texte.
//
// Le même décompte part avec GET /api/card/:id/case (denounce.ts).

import type { Context, Hono } from "hono";
import { z } from "zod";
import type { Fact } from "../../shared/types";
import type { Jury, Store } from "./db";
import { ID_RE } from "./pipeline";
import { clientIp, type RateLimiter } from "./ratelimit";

export const VOTES_PER_DAY = 60;

export const VOTE_LIMITED: Fact = {
  fr: "Soixante votes par jour, c'est le maximum. Reviens demain.",
  en: "Sixty votes a day is the limit. Come back tomorrow.",
};

const voteSchema = z.object({
  cardId: z.string().regex(ID_RE),
  verdict: z.enum(["guilty", "cleared"]),
});

/** Monte POST /api/vote et rend la lecture du décompte pour qui demande. */
export function mountJury(app: Hono, o: { store: Store; limiter: RateLimiter; notFound: Fact; withdrawn: Fact }): (c: Context, cardId: string) => Jury {
  const { store, limiter } = o;
  const juryFor = (c: Context, cardId: string) => store.jury(cardId, limiter.hash(clientIp(c)));

  app.post("/api/vote", async (c) => {
    c.header("Cache-Control", "no-store");
    const parsed = voteSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ state: "error", code: "internal", message: o.notFound }, 400);
    const { cardId, verdict } = parsed.data;
    const row = store.getCard(cardId);
    // Expirée mais pas encore purgée : comme si elle n'existait plus.
    if (!row || (row.expiresAt !== null && row.expiresAt < Date.now())) {
      return c.json({ state: "error", code: "internal", message: o.notFound }, 404);
    }
    if (store.isHidden(store.loginOf(row))) return c.json({ state: "error", code: "gone", message: o.withdrawn }, 410);

    const ip = clientIp(c);
    const before = juryFor(c, cardId);
    if (before.mine) return c.json({ jury: before });
    if (!limiter.take("vote", ip, VOTES_PER_DAY)) {
      return c.json({ state: "error", code: "rate_limited", message: VOTE_LIMITED }, 429);
    }
    if (store.castVote(cardId, limiter.hash(ip), verdict)) store.recordEvent("jury_vote", cardId, { verdict });
    return c.json({ jury: juryFor(c, cardId) });
  });

  return juryFor;
}
