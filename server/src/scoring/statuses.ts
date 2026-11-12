// Moteur de statuts générique piloté par data/statuses.json (SPEC §5.1).

import type { AIStatusId } from "../../../shared/readings";
import type { Fact, Lang, StatusInstance, StatusTone } from "../../../shared/types";
import { STATUSES, type StatusDef, type StatusSource } from "./config";
import { RULES, type RuleCtx, type Vars } from "./rules";

function fmt(v: number | string | Fact, lang: Lang): string {
  if (typeof v === "object") return v[lang];
  if (typeof v === "string") return v;
  if (Number.isInteger(v)) return String(v);
  const s = v.toFixed(1);
  return lang === "fr" ? s.replace(".", ",") : s;
}

/** Remplit {clé} ; rend null si un placeholder reste sans valeur. */
export function fillTemplate(tpl: string, vars: Vars, lang: Lang): string | null {
  let missing = false;
  const out = tpl.replace(/\{(\w+)\}/g, (_, k: string) => {
    if (vars[k] === undefined) {
      missing = true;
      return "";
    }
    return fmt(vars[k], lang);
  });
  return missing ? null : out;
}

function fillFact(main: Fact, alt: Fact | undefined, vars: Vars): Fact | null {
  for (const f of alt ? [main, alt] : [main]) {
    const fr = fillTemplate(f.fr, vars, "fr");
    const en = fillTemplate(f.en, vars, "en");
    if (fr !== null && en !== null) return { fr, en };
  }
  return null;
}

export function instantiate(def: StatusDef, vars: Vars, byAI = false): StatusInstance | null {
  const label = fillFact(def.label, def.labelAlt, vars);
  const rule = fillFact(def.ruleText, def.ruleTextAlt, vars);
  if (!label || !rule) return null;
  return { id: def.id, tone: def.tone, label, rule, ...(byAI ? { byAI: true } : {}) };
}

/** Évalue toutes les règles d'une source, dans l'ordre du catalogue. */
export function evaluateRules(sources: StatusSource[], ctx: RuleCtx): StatusInstance[] {
  const out: StatusInstance[] = [];
  for (const def of STATUSES.statuses) {
    if (def.retired || !sources.includes(def.source)) continue;
    const rule = RULES[def.rule];
    if (!rule) throw new Error(`règle inconnue : ${def.rule} (${def.id})`);
    const vars = rule(ctx, def.params ?? {});
    if (!vars) continue;
    const inst = instantiate(def, { ...vars }, false);
    if (inst) out.push(inst);
  }
  return out;
}

/** Statut posé par l'IA, uniquement s'il appartient à la liste fermée (source "ai"). */
export function aiStatus(id: AIStatusId | null | undefined): StatusInstance | null {
  if (!id) return null;
  const def = STATUSES.statuses.find((d) => d.id === id && d.source === "ai");
  return def ? instantiate(def, {}, true) : null;
}

export function fallbackStatus(): StatusInstance {
  const def = STATUSES.statuses.find((d) => d.source === "fallback")!;
  return instantiate(def, {})!;
}

/**
 * Composition (§5.1) : priorité spéciaux > écart > négatifs > positifs, au plus
 * `maxPerCard`, au moins un positif si un positif s'applique, au plus un statut IA.
 * Dans un même ton : statut IA d'abord, puis ordre du catalogue.
 */
export function composeStatuses(candidates: StatusInstance[], max = STATUSES.maxPerCard): StatusInstance[] {
  const prio = (t: StatusTone) => {
    const i = STATUSES.tonePriority.indexOf(t);
    return i < 0 ? STATUSES.tonePriority.length : i;
  };
  // Un seul statut IA, ids uniques.
  const seen = new Set<string>();
  let aiSeen = false;
  const pool = candidates.filter((s) => {
    if (seen.has(s.id)) return false;
    if (s.byAI) {
      if (aiSeen) return false;
      aiSeen = true;
    }
    seen.add(s.id);
    return true;
  });
  const sorted = pool
    .map((s, i) => ({ s, i }))
    .sort((a, b) => prio(a.s.tone) - prio(b.s.tone) || Number(!!b.s.byAI) - Number(!!a.s.byAI) || a.i - b.i)
    .map((x) => x.s);
  if (!sorted.length) return [fallbackStatus()];
  const picked = sorted.slice(0, max);
  if (!picked.some((s) => s.tone === "positive")) {
    const firstPositive = sorted.find((s) => s.tone === "positive");
    if (firstPositive) picked[picked.length - 1] = firstPositive;
  }
  return picked;
}
