// Profil criminel et peine (SPEC §18.2), pilotés par data/profiles.json et
// data/sentences.json. Pur et déterministe : même entrée, même profil, même peine.
// Les conditions réutilisent les règles des statuts (rules.ts) ; seules les trois
// qui n'existent pas encore sont écrites ici.

import type { CardProfile, CardSentence, Fact, StatCode, StatusInstance } from "../../../shared/types";
import { specialOf } from "./common";
import { PROFILES, SENTENCES, type ProfileCondition, type ProfileDef } from "./config";
import { RULES, type RuleCtx, type Vars } from "./rules";
import { fillTemplate } from "./statuses";

export interface ProfileCtx extends RuleCtx {
  /** Comparaison CV contre GitHub (§6.5) : notes globales et BUZZ du CV. `githubEmpty` : la fiche GitHub est un dossier vide. */
  comparison?: { cvOverall: number; githubOverall: number; cvBuzz: number; githubEmpty?: boolean };
}

type ProfileRule = (ctx: ProfileCtx, p: Record<string, number>) => Vars | null;

/** Règles propres aux profils, en plus de celles des statuts. */
export const PROFILE_RULES: Record<string, ProfileRule> = {
  /** Le CV vaut `atLeast` points de plus que le code : seulement en comparaison, et jamais face à un GitHub vide. */
  cv_ahead_of_code: (c, p) => {
    const x = c.comparison;
    if (!x || x.githubEmpty) return null;
    const n = x.cvOverall - x.githubOverall;
    return n >= p.atLeast ? { n, t: p.atLeast } : null;
  },
  /** Seuil sur une stat du CV : la fiche CV elle-même, ou le CV de la comparaison. */
  cv_stat_at_least: (c, p) => {
    const [code, t] = Object.entries(p)[0] as [StatCode, number];
    const v = c.cv ? c.stats[code] : code === "BUZZ" ? c.comparison?.cvBuzz : undefined;
    return v !== undefined && v >= t ? { n: v, t } : null;
  },
  /** La règle de la carte « Débarque en ville » (common.ts, specialOf). */
  wonderkid: (c) => (specialOf(c.stats, false) === "wonderkid" ? {} : null),
};

function ruleOf(key: string): ProfileRule {
  const r = PROFILE_RULES[key] ?? RULES[key];
  if (!r) throw new Error(`règle de profil inconnue : ${key}`);
  return r;
}

function holds(c: ProfileCondition, ctx: ProfileCtx): boolean {
  return ruleOf(c.rule)(ctx, c.params ?? {}) !== null;
}

/** Vrai si le profil s'applique (jamais pour le repli, qui ne se teste pas). */
export function matches(def: ProfileDef, ctx: ProfileCtx): boolean {
  if (def.fallback) return false;
  if (def.all && !def.all.every((c) => holds(c, ctx))) return false;
  if (def.any && !def.any.some((c) => holds(c, ctx))) return false;
  return !!(def.all?.length || def.any?.length);
}

function toProfile(def: ProfileDef): CardProfile {
  return { id: def.id, label: { ...def.label }, tagline: { ...def.tagline } };
}

function fallbackDef(): ProfileDef {
  return PROFILES.profiles.find((d) => d.fallback)!;
}

/** Le profil de la fiche : la première règle vraie dans l'ordre de priorité, sinon le repli. */
export function pickProfile(ctx: ProfileCtx): CardProfile {
  return toProfile(PROFILES.profiles.find((d) => matches(d, ctx)) ?? fallbackDef());
}

/**
 * Après la comparaison : seuls les profils classés avant le profil actuel peuvent
 * le remplacer, évalués avec la comparaison en plus. Les autres conditions de
 * ces profils, déjà fausses sur la fiche, le restent sans les faits ; le
 * résultat est donc celui d'une évaluation complète. Une fiche sans profil
 * (produite avant le barème 0.2.0) reste telle quelle.
 */
export function profileWithComparison(
  current: CardProfile | undefined,
  ctx: Pick<ProfileCtx, "stats" | "comparison">,
): CardProfile | undefined {
  if (!current) return current;
  const rank = PROFILES.profiles.findIndex((d) => d.id === current.id);
  const better = PROFILES.profiles.slice(0, rank < 0 ? 0 : rank).find((d) => matches(d, ctx));
  return better ? toProfile(better) : current;
}

function fill(f: Fact, n: number): Fact {
  return { fr: fillTemplate(f.fr, { n }, "fr")!, en: fillTemplate(f.en, { n }, "en")! };
}

/**
 * La peine (§18.2) : l'axe le plus faible parmi TEC, SHIP, ARCH et DOC (à égalité,
 * le premier de la liste) ; n = ⌈(80 − valeur) / 5⌉, au moins 1. Tous à 80 ou
 * plus : relaxe, sans caution. La caution : celle du premier chef d'accusation
 * de la fiche qui en a une, dans l'ordre de la fiche.
 */
export function sentenceFor(stats: Record<StatCode, number>, statuses: StatusInstance[]): CardSentence {
  const { threshold, step } = SENTENCES.params;
  let axis = SENTENCES.axes[0];
  for (const a of SENTENCES.axes) if (stats[a] < stats[axis]) axis = a;
  const v = stats[axis];
  if (v >= threshold) return { label: { ...SENTENCES.acquittal } };
  const n = Math.max(1, Math.ceil((threshold - v) / step));
  const def = SENTENCES.sentences[axis];
  const label = fill(n === 1 ? def.labelOne : def.label, n);
  const charge = statuses.find((s) => SENTENCES.bail[s.id]);
  return charge ? { label, bail: { ...SENTENCES.bail[charge.id] } } : { label };
}
