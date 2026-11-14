// La saison côté front (data/season.json, servi par /api/config) : le seul
// endroit qui choisit la ligne de l'accueil sous le titre, et le texte du
// bandeau de saison. Sans prime ouverte, l'accueil ne promet pas d'entretien.
import { useEffect, useState } from "react";
import { seasonPhase, type SeasonDates } from "../../../shared/season";
import type { Lang } from "../../../shared/types";
import { api, SEASON_FILE, type AppConfig } from "./api";

/** La configuration du serveur : celle déjà connue d'abord, puis la réponse de /api/config. */
export function useAppConfig(): AppConfig | null {
  const [cfg, setCfg] = useState<AppConfig | null>(() => api.knownConfig());
  useEffect(() => {
    let alive = true;
    void api.getConfig().then((c) => alive && setCfg(c));
    return () => {
      alive = false;
    };
  }, []);
  return cfg;
}

interface HookLines {
  /** Une prime est ouverte : la ligne de l'entretien. */
  hookPrimes: string;
  /** Aucune prime ouverte : une phrase vraie, utile au jeu. */
  hookPlay: string;
}

/** La ligne sous le titre de l'accueil. Tant que le serveur n'a pas dit qu'une prime est ouverte, aucune promesse d'entretien. */
export function homeHook(h: HookLines, cfg: Pick<AppConfig, "primesOpen"> | null): string {
  return cfg?.primesOpen ? h.hookPrimes : h.hookPlay;
}

interface SeasonLines {
  soon: (n: number, day: string) => string;
  on: (n: number, day: string) => string;
  over: (n: number) => string;
}

/** « 31 décembre », « 1er décembre », « 31 December ». */
export function dayLabel(day: string, lang: Lang): string {
  const d = new Date(`${day}T00:00:00Z`);
  const month = new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { month: "long", timeZone: "UTC" }).format(d);
  const n = d.getUTCDate();
  return `${lang === "fr" && n === 1 ? "1er" : n} ${month}`;
}

/** Le texte du bandeau : « Saison 1 · dès le 19 novembre », « … · jusqu'au 31 décembre », « Saison 1 terminée ». */
export function seasonLine(s: SeasonLines, season: SeasonDates | null, lang: Lang, now: number): string | null {
  const dates = season ?? SEASON_FILE;
  if (!dates) return null;
  const phase = seasonPhase(dates, now);
  if (phase === "soon") return s.soon(dates.number, dayLabel(dates.start, lang));
  if (phase === "on") return s.on(dates.number, dayLabel(dates.end, lang));
  return s.over(dates.number);
}
