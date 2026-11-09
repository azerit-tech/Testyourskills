// « Dénonce un complice » (SPEC §18.6) et ce que la page partagée en montre (§18.7).
//
// Envoi : POST /api/card { login, lang, denouncedBy } où denouncedBy est l'id
// de la fiche du dénonciateur. La fiche du complice sort par le moteur habituel
// (le cache 24 h compris) ; elle est marquée `cards.denounced_by`, cinq
// dénonciations par jour et par IP au plus. Le login du dénonciateur n'est
// gardé que s'il était connecté comme propriétaire de sa propre fiche (§18.1) :
// sinon la dénonciation est anonyme, et personne ne peut signer au nom d'un autre
// en passant l'id de sa fiche.
//
// Lecture : GET /api/card/:id/case → { denounced, by, x, accomplices }.
//   denounced    la fiche est née d'une dénonciation (ou a été dénoncée depuis le cache) ;
//   by           le login du dénonciateur nommé, sinon null (« Dénonciation anonyme ») ;
//   x            le compte X de la personne de la fiche (twitter_username), sinon null ;
//   accomplices  au plus trois complices à suggérer, tirés des faits de la collecte.

import type { Context, Hono } from "hono";
import type { Fact } from "../../shared/types";
import { ownerFromRequest } from "./auth";
import type { CardRow, Store } from "./db";
import type { Accomplice } from "./github/accomplices";
import { ID_RE } from "./pipeline";

export const DENOUNCE_PER_DAY = 5;
/** Suggestions affichées sous « Dénonce un complice ». */
export const ACCOMPLICES_SHOWN = 3;

export const DENOUNCE_LIMITED: Fact = {
  fr: "Cinq dénonciations par jour, c'est le maximum. Reviens demain.",
  en: "Five tip-offs a day is the limit. Come back tomorrow.",
};

const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const X_RE = /^[A-Za-z0-9_]{1,15}$/;

export interface Denunciation {
  /** Fiche du dénonciateur. */
  byCardId: string;
  /** Login du dénonciateur s'il est connecté comme propriétaire de cette fiche, sinon null. */
  named: string | null;
}

/**
 * Lit `denouncedBy` d'une demande de fiche. Rien (fiche normale) si l'id est
 * absent, mal formé, inconnu, ou si c'est sa propre fiche qu'on dénonce.
 */
export function parseDenunciation(raw: unknown, target: string, store: Store, c: Context): Denunciation | undefined {
  if (typeof raw !== "string" || !ID_RE.test(raw)) return undefined;
  const row = store.getCard(raw);
  if (!row) return undefined;
  const byLogin = store.loginOf(row);
  if (byLogin && byLogin.toLowerCase() === target.toLowerCase()) return undefined;
  const owner = ownerFromRequest(c);
  const named = owner && byLogin && owner.login === byLogin.toLowerCase() ? owner.login : null;
  return { byCardId: row.id, named };
}

interface FactsLike {
  profile?: { twitterUsername?: unknown };
  accomplices?: unknown;
}

/** Les faits GitHub de la fiche ; pour une comparaison, ceux de la dernière fiche GitHub du login. */
function factsFor(store: Store, row: CardRow): FactsLike | null {
  if (row.facts && typeof row.facts === "object") return row.facts as FactsLike;
  const login = store.loginOf(row);
  const latest = login ? store.findLatestGithub(login) : null;
  return latest?.facts && typeof latest.facts === "object" ? (latest.facts as FactsLike) : null;
}

export interface CaseInfo {
  denounced: boolean;
  by: string | null;
  x: string | null;
  accomplices: Accomplice[];
}

export function caseInfo(store: Store, row: CardRow): CaseInfo {
  const facts = factsFor(store, row);
  const self = store.loginOf(row)?.toLowerCase() ?? null;
  const tw = facts?.profile?.twitterUsername;
  const list = Array.isArray(facts?.accomplices) ? (facts.accomplices as Accomplice[]) : [];
  const accomplices = list
    .filter(
      (a) =>
        a &&
        typeof a.login === "string" &&
        LOGIN_RE.test(a.login) &&
        a.login.toLowerCase() !== self &&
        typeof a.avatarUrl === "string" &&
        a.avatarUrl.startsWith("https://") &&
        // Qui a masqué ses fiches refuse aussi qu'on lui en fasse une (§18.1).
        !store.isHidden(a.login),
    )
    .slice(0, ACCOMPLICES_SHOWN)
    .map((a) => ({ login: a.login, avatarUrl: a.avatarUrl }));
  const by = row.denouncerLogin && store.getOwner(row.denouncerLogin) && !store.isHidden(row.denouncerLogin) ? row.denouncerLogin : null;
  return {
    denounced: !!row.denouncedBy,
    by,
    x: typeof tw === "string" && X_RE.test(tw) ? tw : null,
    accomplices,
  };
}

export function mountDenounce(app: Hono, o: { store: Store; hiddenFrom: (c: Context, login: string | null | undefined) => boolean; notFound: Fact; withdrawn: Fact }) {
  app.get("/api/card/:id/case", (c) => {
    c.header("Cache-Control", "no-store");
    const id = c.req.param("id");
    const row = ID_RE.test(id) ? o.store.getCard(id) : null;
    if (!row) return c.json({ state: "error", code: "internal", message: o.notFound }, 404);
    if (o.hiddenFrom(c, o.store.loginOf(row))) return c.json({ state: "error", code: "gone", message: o.withdrawn }, 410);
    return c.json(caseInfo(o.store, row));
  });
}
