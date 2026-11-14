// Mesure (SPEC §9, §13, §16, §18.0, §18.6, §18.27, §18.36, §18.38) : la liste fermée ci-dessous, enregistrée dans la table
// `events`, pas d'outil d'analytics. shared_visit marque l'arrivée par un lien
// partagé (?r=), une fois par session, avec la fiche d'origine. L'email laissé
// sur une carte est relayé à LEADS_ENDPOINT au même format que la page Try de
// la landing.

import { randomUUID } from "node:crypto";
import { z } from "zod";

export const EVENT_NAMES = [
  "card_generated",
  "card_shared",
  "card_email",
  "cta_azerit_clicked",
  "shared_visit",
  // Dénonciation (§18.6) : envoyée et revendiquée sont posées par le serveur,
  // l'arrivée de la cible (ou de n'importe qui) sur la fiche dénoncée par le front.
  "denounce_sent",
  "denounce_landed",
  "denounce_claimed",
  // Le jury (§18.27) : un vote posé, par le serveur seul.
  "jury_vote",
  // Le pari (§18.27) : étoiles plaidées et écart avec le verdict, envoyé par le front quand le verdict s'affiche.
  "plea",
  // Le film (§18.36, docs/cinematique-poursuite.md §5.6) : une fois par lecture, ce qu'il en est advenu.
  "film",
  // Les bandes (§18.38) : entrer et sortir, par le serveur seul ; la page d'une bande vue et son partage, par le front.
  "band_join",
  "band_leave",
  "band_view",
  "band_share",
  // Les primes (§18.4) : la page d'une prime vue, par le front ; concourir et se retirer, par le serveur seul.
  "prime_view",
  "prime_join",
  "prime_withdraw",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/** Événements que le front peut envoyer. card_generated, denounce_sent, denounce_claimed et jury_vote sont posés par le serveur seul. */
const cardEventSchema = z.object({
  event: z.enum(["card_shared", "card_email", "cta_azerit_clicked", "shared_visit", "denounce_landed", "plea", "band_view", "band_share", "prime_view"]),
  cardId: z.string().regex(/^[A-Za-z0-9]{6,32}$/).optional(),
  meta: z
    .record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean(), z.null()]))
    .refine((m) => Object.keys(m).length <= 10, "meta: 10 clés maximum")
    .optional(),
});

/** Ce qu'il est advenu d'une lecture du film. */
export const FILM_OUTCOMES = ["played", "gesture", "timeout", "nocodec", "error", "skipped", "left"] as const;

const ms = (max: number) => z.number().int().min(0).max(max).nullable();

/**
 * Le film, une fois par lecture : dix clés fermées, que des nombres bornés,
 * des booléens et deux listes. Aucune donnée personnelle : ni fiche, ni
 * adresse, ni navigateur en clair (seulement « intégré ou non »).
 */
export const filmMetaSchema = z.strictObject({
  /** played : joué jusqu'au bout ; gesture : la pilule montrée, jamais touchée ; timeout : abandon au délai ;
   * nocodec : H.264 illisible ; error : chargement ou lecture en échec (flash) ; skipped : passé ; left : page quittée. */
  outcome: z.enum(FILM_OUTCOMES),
  /** La variante jouée ou chargée : « 720 » haute, « 540 » éco. */
  variant: z.enum(["720", "540"]).nullable(),
  /** Octets chargés par le film sur la page. */
  bytes: z.number().int().min(0).max(100_000_000),
  /** Du premier octet demandé aux deux fichiers en mémoire (ms). */
  loadMs: ms(3_600_000),
  /** De l'ordre de lecture à la première image qui bouge (ms). */
  startMs: ms(60_000),
  /** Images perdues par le décodeur. */
  dropped: z.number().int().min(0).max(100_000).nullable(),
  /** Bascule de la poursuite à la fin (ms). */
  switchMs: ms(60_000),
  /** Débit mesuré (kbit/s). */
  kbps: z.number().int().min(0).max(10_000_000).nullable(),
  /** Navigateur intégré d'une application (LinkedIn, Instagram…). */
  inApp: z.boolean(),
  /** La lecture a demandé un geste (la pilule « Ouvrir mon dossier »). */
  gesture: z.boolean(),
});
export type FilmMeta = z.infer<typeof filmMetaSchema>;

/** Le film ne porte pas d'identifiant de fiche : un cardId le fait refuser. */
const filmEventSchema = z.strictObject({ event: z.literal("film"), meta: filmMetaSchema });

export const clientEventSchema = z.union([cardEventSchema, filmEventSchema]);

export interface Lead {
  id: string;
  email: string;
  role: string;
  /** card_email : email laissé sous sa fiche ; retrait : demande de retrait d'une fiche (removal.ts). */
  event: "card_email" | "retrait";
  createdAt: string;
  cardId: string;
  cardUrl: string;
}

export function buildLead(email: string, cardId: string, baseUrl: string, event: Lead["event"] = "card_email"): Lead {
  return {
    id: randomUUID(),
    email,
    role: "",
    event,
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
