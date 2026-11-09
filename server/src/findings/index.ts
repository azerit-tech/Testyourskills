// L'enquête en direct (SPEC §18.26) : les trouvailles de toutes les sources
// (GitHub ici ; LinkedIn et les autres témoins y poussent les leurs, §18.24,
// §18.25) se rangent dans une seule liste. Pendant l'attente, on en montre au
// plus huit, de la plus banale à la plus folle ; la fiche garde les trois plus
// fortes, la plus forte d'abord. Le tri ne dépend que du score, puis de l'ordre
// d'arrivée : deux appels sur les mêmes trouvailles rendent le même ordre.

import type { Finding } from "../../../shared/types";

export { githubFindings } from "./github";

/** Trouvailles montrées pendant l'attente. */
export const REVEAL_MAX = 8;
/** Trouvailles gardées dans la fiche (`CardData.findings`). */
export const CARD_MAX = 3;

/** Une trouvaille par source et par type : la plus forte gagne, à égalité la première arrivée. */
function dedupe(list: Finding[]): Finding[] {
  const best = new Map<string, Finding>();
  for (const f of list) {
    const k = `${f.source}:${f.kind}`;
    const prev = best.get(k);
    if (!prev || f.score > prev.score) best.set(k, f);
  }
  return list.filter((f) => best.get(`${f.source}:${f.kind}`) === f);
}

/** Du plus fort au plus faible ; à égalité, l'ordre d'arrivée. */
function byStrength(list: Finding[]): Finding[] {
  return dedupe(list)
    .map((f, i) => ({ f, i }))
    .sort((a, b) => b.f.score - a.f.score || a.i - b.i)
    .map((x) => x.f);
}

/** Les `max` plus fortes, dans l'ordre de l'attente : de la plus banale à la plus folle, qui tombe en dernier. */
export function forReveal(list: Finding[], max = REVEAL_MAX): Finding[] {
  return byStrength(list).slice(0, max).reverse();
}

/** Les `n` plus fortes, la plus forte d'abord : celles de la fiche et du texte de partage. */
export function strongest(list: Finding[], n = CARD_MAX): Finding[] {
  return byStrength(list).slice(0, n);
}
