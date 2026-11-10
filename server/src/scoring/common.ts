// Briques communes aux cartes GitHub et CV : faits lisibles, globale, fiabilité, nom.

import type { Fact, GridCriterion, Special, Stat, StatCode } from "../../../shared/types";
import { STAT_CODES } from "../../../shared/types";
import { SCORING } from "./config";
import { clampScore } from "./scale";

export const fact = (fr: string, en: string): Fact => ({ fr, en });

/** Entier avec séparateur de milliers (espace en fr, virgule en en). */
export function nf(n: number, lang: "fr" | "en"): string {
  const s = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, lang === "fr" ? " " : ",");
  return n < 0 ? "-" + s : s;
}

/** Décimal court : 3,4 en fr, 3.4 en en. */
export function df(n: number, lang: "fr" | "en"): string {
  const s = (Math.round(n * 10) / 10).toString();
  return lang === "fr" ? s.replace(".", ",") : s;
}

export const pct = (x: number) => Math.round(x * 100);

/**
 * Moyenne pondérée des six barres (barème 0.3.0 et avant). Depuis 0.4.0, la
 * note d'une fiche est celle de la grille (grid.ts) ; cette moyenne ne sert
 * plus qu'à la référence des rangs d'avant (percentiles.ts).
 */
export function overallOf(values: Record<StatCode, number>): number {
  const w = SCORING.weights;
  return clampScore(values.TEC * w.TEC + values.SHIP * w.SHIP + values.ARCH * w.ARCH + values.DOC * w.DOC + values.XP * w.XP);
}

/**
 * La barre XP (0.4.0) : le critère Expérience de la grille × 10, bornée à 1..99.
 * Sans note (aucun poste daté, GitHub trop mince) : au plancher, non suffisante.
 */
export function xpStatOf(c: GridCriterion): Stat {
  const facts: Fact[] = [c.reached, ...(c.evidence ? [c.evidence.text] : []), ...(c.next ? [c.next] : [])];
  if (facts.length < 2) facts.push(fact("Expérience non renseignée", "Experience not on file"));
  return { code: "XP", value: c.score === null ? SCORING.bounds.min : clampScore(c.score * 10), sufficient: c.score !== null, facts: facts.slice(0, 4) };
}

/** 19 points par axe suffisant (BUZZ exclue), plafonné à 95 (§3.5). */
export function reliabilityOf(stats: Stat[]): number {
  const n = stats.filter((s) => s.code !== "BUZZ" && s.sufficient).length;
  return Math.min(SCORING.reliability.max, n * SCORING.reliability.perAxis);
}

export function specialOf(values: Record<StatCode, number>, flashback: boolean): Special | undefined {
  const { wonderkid } = SCORING.special;
  if (values.XP < wonderkid.xpBelow && values.TEC >= wonderkid.tecAtLeast) return "wonderkid";
  if (flashback) return "flashback";
  return undefined;
}

export function valuesOf(stats: Stat[]): Record<StatCode, number> {
  return Object.fromEntries(stats.map((s) => [s.code, s.value])) as Record<StatCode, number>;
}

/** Stats dans l'ordre STAT_CODES, faits limités à 4. */
export function orderStats(byCode: Record<StatCode, Stat>): Stat[] {
  return STAT_CODES.map((c) => ({ ...byCode[c], facts: byCode[c].facts.slice(0, 4) }));
}

/** Initiales : deux premières parties du nom, sinon deux premières lettres. */
export function initialsOf(name: string): string {
  const parts = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[\s\-_.]+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const p = parts[0] ?? "?";
  return p.slice(0, 2).toUpperCase();
}

/** Entreprise GitHub nettoyée : sans @, espaces réduits, null si vide. */
export function cleanCompany(company: string | null | undefined): string | null {
  if (!company) return null;
  const c = company.replace(/@/g, "").replace(/\s+/g, " ").trim();
  return c || null;
}
