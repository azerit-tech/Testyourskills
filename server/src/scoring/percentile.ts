// Le rang qui parle (SPEC §18.3) : « Plus recherché que 83 % des devs Python
// sourcés par Azerit » et « Chef d'accusation rare : 2 % des fiches ».
//
// Pur : la table de référence (data/percentiles.json, écrite par
// scripts/percentiles.ts) arrive en argument ; index.ts la charge et l'applique.
//
// Définitions, toutes fixes et explicables :
//
// - Centile k (k de 1 à 99) d'un groupe de n notes triées v[0] ≤ … ≤ v[n−1] :
//   c_k = v[⌈(k − ½) · n / 100⌉ − 1].
// - Rang X d'une note s : la part des profils du groupe strictement en dessous
//   de s, en %, arrondie à l'entier (demi vers le haut), bornée de 1 à 99. Avec
//   les centiles ci-dessus, X = nombre de centiles strictement inférieurs à s :
//   c_k < s ⟺ ⌈(k − ½)·n/100⌉ ≤ B (B profils sous s) ⟺ k ≤ 100·B/n + ½,
//   donc le compte vaut exactement round(100·B/n). Les 99 nombres de la table
//   suffisent, sans perte.
// - Groupe affiché : le meilleur rang entre le groupe du langage principal et
//   celui du poste, parmi ceux qui comptent au moins 100 profils ; à égalité, le
//   langage. Aucun des deux : le rang global. Moins de 100 profils en tout : rien.
// - Rareté d'un statut : part des fiches de référence qui l'ont (en %), « rare »
//   sous 5 %.
// - Table absente, ou version du barème différente de celle de la carte : pas de
//   rang ni de rareté. Un rang calculé sur un autre barème mentirait.

import type { CardData, Source } from "../../../shared/types";

/** Taille minimale d'un groupe de référence pour afficher un rang (§18.3). */
export const MIN_GROUP = 100;
/** Un statut est rare sous cette part des fiches, en %. */
export const RARE_BELOW = 5;
/** Plus petite rareté affichée : une fiche qui a le statut ne peut pas dire « 0 % ». */
export const MIN_RARITY = 0.1;

export interface CentileGroup {
  /** Nombre de profils de référence du groupe. */
  n: number;
  /** Les 99 centiles de la note globale, `centiles[k − 1]` = c_k. */
  centiles: number[];
}

/** Contenu de data/percentiles.json : des agrégats seulement, jamais un pseudo ni un fait individuel. */
export interface PercentileTable {
  /** Version du barème (data/scoring.json) qui a noté les profils de référence. */
  scoringVersion: string;
  /** Source des cartes de référence : seules les cartes de cette source reçoivent un rang. */
  source: Source;
  /** Jour de génération, AAAA-MM-JJ. */
  generatedAt: string;
  /** Profils de référence notés. */
  profiles: number;
  /**
   * Lecture IA du code (§4.3) : `real` profils ont leur TEC réel. `imputedDelta` :
   * médiane de l'écart réel − repli sur les profils lus (null si aucun), une mesure
   * de la barre TEC ; depuis 0.4.0 elle ne touche plus la note de référence.
   */
  tec: { real: number; imputedDelta: number | null };
  /** Taille minimale des groupes écrits. */
  minGroup: number;
  overall: {
    all?: CentileGroup;
    /** Par langage principal (clé en minuscules, comme `CardData.mainLanguage`). */
    language: Record<string, CentileGroup>;
    /** Par poste (`CardData.position`). */
    position: Record<string, CentileGroup>;
  };
  /** Part des fiches qui portent chaque statut, en %, à une décimale. */
  statuses: Record<string, number>;
}

export type CardRank = NonNullable<CardData["rank"]>;

type RankedCard = Pick<CardData, "overall" | "scoringVersion" | "source" | "mainLanguage" | "position">;

/** Les 99 centiles d'une liste de notes (non vide), selon la définition en tête de fichier. */
export function centilesOf(values: number[]): number[] {
  if (!values.length) throw new Error("centilesOf : liste vide");
  const v = [...values].sort((a, b) => a - b);
  const n = v.length;
  const out: number[] = [];
  for (let k = 1; k <= 99; k++) {
    // ⌈(2k − 1)·n / 200⌉ en arithmétique entière, sans flottant.
    const rank = Math.floor(((2 * k - 1) * n + 199) / 200);
    out.push(v[Math.min(n, Math.max(1, rank)) - 1]!);
  }
  return out;
}

function usable(g: CentileGroup | undefined): g is CentileGroup {
  return !!g && g.n >= MIN_GROUP && Array.isArray(g.centiles) && g.centiles.length === 99;
}

/** Rang X d'une note dans un groupe : nombre de centiles strictement inférieurs, borné de 1 à 99. */
export function percentIn(group: CentileGroup, overall: number): number {
  const below = group.centiles.filter((c) => c < overall).length;
  return Math.min(99, Math.max(1, below));
}

function sameReference(card: Pick<CardData, "scoringVersion" | "source">, table: PercentileTable | null | undefined): table is PercentileTable {
  return !!table && table.scoringVersion === card.scoringVersion && table.source === card.source;
}

/**
 * « Plus recherché que X % » : le meilleur des groupes langage et poste qui
 * comptent au moins 100 profils (le langage à égalité), sinon le global.
 * null sans table, sur un autre barème, ou sans groupe assez grand.
 */
export function rankFor(card: RankedCard, table: PercentileTable | null | undefined): CardRank | null {
  if (!sameReference(card, table)) return null;
  const lang = card.mainLanguage ? table.overall.language[card.mainLanguage] : undefined;
  const pos = table.overall.position[card.position];
  let best: CardRank | null = null;
  if (usable(lang)) best = { percent: percentIn(lang, card.overall), group: { kind: "language", key: card.mainLanguage } };
  if (usable(pos)) {
    const p = percentIn(pos, card.overall);
    // Strictement meilleur seulement : à égalité, le langage reste.
    if (!best || p > best.percent) best = { percent: p, group: { kind: "position", key: card.position } };
  }
  if (best) return best;
  const all = table.overall.all;
  return usable(all) ? { percent: percentIn(all, card.overall), group: { kind: "all" } } : null;
}

/** Part des fiches de référence qui portent ce statut, en %. null : table absente ou statut inconnu d'elle. */
export function rarityFor(statusId: string, table: PercentileTable | null | undefined): number | null {
  if (!table || table.profiles < MIN_GROUP) return null;
  const f = table.statuses[statusId];
  return typeof f === "number" && Number.isFinite(f) ? f : null;
}

/**
 * La carte avec son rang et la rareté de ses statuts rares. Sans table valable
 * pour cette carte (absente, autre barème, autre source), la carte telle quelle.
 */
export function withReference<C extends RankedCard & Pick<CardData, "statuses">>(
  card: C,
  table: PercentileTable | null | undefined,
): C & { rank?: CardRank } {
  if (!sameReference(card, table)) return card;
  const rank = rankFor(card, table);
  const statuses = card.statuses.map((s) => {
    const r = rarityFor(s.id, table);
    return r !== null && r < RARE_BELOW ? { ...s, rarity: Math.max(MIN_RARITY, r) } : s;
  });
  return { ...card, ...(rank ? { rank } : {}), statuses };
}

/** Vérifie la forme d'une table lue sur disque. null si elle ne ressemble pas à une table. */
export function parsePercentileTable(json: unknown): PercentileTable | null {
  const t = json as Partial<PercentileTable> | null;
  if (!t || typeof t !== "object") return null;
  if (typeof t.scoringVersion !== "string" || typeof t.source !== "string" || typeof t.profiles !== "number") return null;
  const o = t.overall;
  if (!o || typeof o !== "object" || typeof o.language !== "object" || typeof o.position !== "object") return null;
  if (!t.statuses || typeof t.statuses !== "object") return null;
  const groups = [o.all, ...Object.values(o.language ?? {}), ...Object.values(o.position ?? {})].filter(Boolean) as CentileGroup[];
  const ok = groups.every(
    (g) => typeof g.n === "number" && Array.isArray(g.centiles) && g.centiles.length === 99 && g.centiles.every((c) => typeof c === "number"),
  );
  return ok ? (t as PercentileTable) : null;
}
