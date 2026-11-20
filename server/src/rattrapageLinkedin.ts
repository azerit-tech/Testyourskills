// Rattrapage du §18.125 : les fiches GitHub seules du top de la semaine, nées avant la nouvelle
// correspondance, cherchent leur LinkedIn par le nom (une recherche par fiche, en cache un
// jour). Un lien fort fait ce que fait « Ajoute ton LinkedIn » : le pipeline calcule le dossier
// LinkedIn + GitHub (prouvé « match »), qui remplace la fiche (`completedBy`) et suit ses bandes.
// Idempotent : une fiche remplacée sort du top, son dossier a son LinkedIn. Le script :
// ops/rattrapage-linkedin-github.ts.

import { colorwayOf } from "../../shared/card/colorways";
import type { CardData, Lang } from "../../shared/types";
import { autoJoinBands } from "./bands";
import type { Store } from "./db";
import type { GithubHints, LinkedinMatch } from "./match/linkedin";
import type { JobInput } from "./pipeline";
import { weekTop } from "./top";

export interface TopGithubCard {
  id: string;
  login: string;
  rank: number;
  lang: Lang;
}

/** Les fiches GitHub seules du haut du classement de la semaine, sans LinkedIn. */
export function topGithubOnly(store: Store, limit = 50, now = Date.now()): TopGithubCard[] {
  return weekTop(store.db, { limit, now }).entries.flatMap((e) => {
    const row = store.getCard(e.cardId);
    const facts = row?.facts as { linkedinUrl?: unknown } | null | undefined;
    if (!row || row.parentId || row.supersededBy || row.kind !== "card" || row.source !== "github" || !row.login || facts?.linkedinUrl) return [];
    return [{ id: row.id, login: row.login, rank: e.rank, lang: (row.data as CardData).lang ?? "fr" }];
  });
}

export interface BackfillLine {
  card: TopGithubCard;
  name: string | null;
  match: LinkedinMatch | null;
  ms: number;
  /** Le dossier qui remplace la fiche (--oui, lien fort), ou null. */
  dossier?: string | null;
}

export interface BackfillDeps {
  store: Store;
  /** Le profil GitHub frais (nom, entreprise, ville, site, bio) : les faits d'avant n'ont pas la ville. */
  hints(login: string): Promise<GithubHints | null>;
  /** La correspondance du §18.125 : une recherche au plus. */
  match(gh: GithubHints): Promise<LinkedinMatch | null>;
  /** Le pipeline de l'App (`Pipeline.start` et `wait`) ; absent : rien n'est écrit. */
  pipeline?: { start(input: JobInput): { id: string }; wait(id: string): Promise<void> };
}

/** Cherche, et avec un pipeline, attache les liens forts. Une fiche à la fois. */
export async function backfillLinkedin(d: BackfillDeps, cards: TopGithubCard[], log: (l: BackfillLine) => void = () => {}): Promise<BackfillLine[]> {
  const out: BackfillLine[] = [];
  for (const card of cards) {
    const t0 = Date.now();
    const gh = await d.hints(card.login).catch(() => null);
    const match = gh ? await d.match(gh).catch(() => null) : null;
    const line: BackfillLine = { card, name: gh?.name ?? null, match, ms: Date.now() - t0 };
    if (d.pipeline && match?.strength === "strong") line.dossier = await attach(d.store, d.pipeline, card, match.proposal.url);
    log(line);
    out.push(line);
  }
  return out;
}

/** « Ajoute ton LinkedIn », côté serveur : le dossier calculé par le pipeline remplace la fiche, garde son coloris, suit ses bandes. */
async function attach(store: Store, pipeline: NonNullable<BackfillDeps["pipeline"]>, card: TopGithubCard, url: string): Promise<string | null> {
  const old = store.getCard(card.id);
  if (!old || old.supersededBy) return null;
  const { id } = pipeline.start({ lang: card.lang, login: card.login, linkedinUrl: url, linkedinMatch: true, colorway: colorwayOf(old.data as CardData) });
  await pipeline.wait(id);
  const row = store.getCard(id);
  if (!row || row.kind !== "comparison") return null;
  store.completedBy(old, row);
  autoJoinBands(store, row, { from: old });
  return row.id;
}
