// Mesure (SPEC §9, §13, §16, §18.0) : cinq événements enregistrés dans la table
// `events`, pas d'outil d'analytics. shared_visit marque l'arrivée par un lien
// partagé (?r=), une fois par session, avec la fiche d'origine. L'email laissé
// sur une carte est relayé à LEADS_ENDPOINT au même format que la page Try de
// la landing.

import { randomUUID } from "node:crypto";
import { z } from "zod";

export const EVENT_NAMES = ["card_generated", "card_shared", "card_email", "cta_azerit_clicked", "shared_visit"] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/** Événements que le front peut envoyer. card_generated est posé par le serveur seul. */
export const clientEventSchema = z.object({
  event: z.enum(["card_shared", "card_email", "cta_azerit_clicked", "shared_visit"]),
  cardId: z.string().regex(/^[A-Za-z0-9]{6,32}$/).optional(),
  meta: z
    .record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean(), z.null()]))
    .refine((m) => Object.keys(m).length <= 10, "meta: 10 clés maximum")
    .optional(),
});

export interface Lead {
  id: string;
  email: string;
  role: string;
  event: "card_email";
  createdAt: string;
  cardId: string;
  cardUrl: string;
}

export function buildLead(email: string, cardId: string, baseUrl: string): Lead {
  return {
    id: randomUUID(),
    email,
    role: "",
    event: "card_email",
    createdAt: new Date().toISOString(),
    cardId,
    cardUrl: `${baseUrl}/c/${cardId}`,
  };
}

/** POST vers LEADS_ENDPOINT. Un échec est journalisé, jamais remonté à l'utilisateur. */
export async function sendLead(endpoint: string | undefined, lead: Lead, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!endpoint) return false;
  try {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(lead),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.warn(`[leads] LEADS_ENDPOINT a répondu ${res.status}`);
    return res.ok;
  } catch (err) {
    console.warn("[leads] envoi impossible :", (err as Error).message);
    return false;
  }
}
