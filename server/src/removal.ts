// Demande de retrait d'une fiche sans pseudo GitHub (LinkedIn seule, CV) par la
// personne fichée. Une telle fiche ne se revendique ni ne se masque par GitHub
// (auth.ts) : quelqu'un fiché par un tiers depuis son LinkedIn n'a que ce canal.
//
// POST /api/removal { cardId, email } : la demande part par LEADS_ENDPOINT, au
// format des emails laissés sous une fiche (events.ts, `buildLead`), avec
// `event: "retrait"`, l'id et l'adresse de la fiche et l'email de contact saisi.
// Rien n'est gardé en base : ni l'email, ni la demande. Trois demandes par jour
// et par IP. Sans LEADS_ENDPOINT, ou s'il ne répond pas : `fallback`, le front
// affiche l'adresse de contact de la page Confidentialité.

import type { Hono } from "hono";
import { z } from "zod";
import type { Fact } from "../../shared/types";
import type { Store } from "./db";
import { buildLead, sendLead } from "./events";
import { ID_RE, MESSAGES } from "./pipeline";
import { clientIp, type RateLimiter } from "./ratelimit";

export const REMOVALS_PER_DAY = 3;

const removalSchema = z.object({
  cardId: z.string().regex(ID_RE),
  email: z.email().max(254),
});

const BAD_EMAIL: Fact = { fr: "Cet email n'a pas l'air valide.", en: "That email doesn't look valid." };
const HAS_GITHUB: Fact = {
  fr: "Cette fiche porte un pseudo GitHub : sa personne la masque ou la supprime avec « C'est moi ».",
  en: "This sheet has a GitHub username: its owner hides or deletes it with “It's me”.",
};
const LIMITED: Fact = { fr: "Trois demandes par jour, c'est le maximum. Reviens demain.", en: "Three requests a day is the limit. Come back tomorrow." };

export function mountRemoval(
  app: Hono,
  o: { store: Store; limiter: RateLimiter; leadsEndpoint?: string; baseUrl: string; fetchImpl?: typeof fetch },
) {
  app.post("/api/removal", async (c) => {
    c.header("Cache-Control", "no-store");
    const parsed = removalSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ ok: false, message: BAD_EMAIL }, 400);
    const { cardId, email } = parsed.data;
    const row = o.store.getCard(cardId);
    if (!row) return c.json({ ok: false, message: MESSAGES.not_found }, 404);
    if (o.store.loginOf(row)) return c.json({ ok: false, message: HAS_GITHUB }, 409);
    // Aucun relais configuré : l'adresse de contact, sans entamer le quota.
    if (!o.leadsEndpoint) return c.json({ ok: false, fallback: true }, 503);
    if (!o.limiter.take("removal", clientIp(c), REMOVALS_PER_DAY)) return c.json({ ok: false, message: LIMITED }, 429);
    const sent = await sendLead(o.leadsEndpoint, buildLead(email, row.id, o.baseUrl, "retrait"), o.fetchImpl);
    // Jamais l'email dans les journaux : l'id de la fiche suffit à la retrouver.
    console.log(`[retrait] demande pour la fiche ${row.id} : ${sent ? "relayée" : "relais en échec"}`);
    return sent ? c.json({ ok: true }) : c.json({ ok: false, fallback: true }, 502);
  });
}
