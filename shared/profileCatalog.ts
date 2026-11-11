// Le nom et la phrase d'un profil se lisent toujours dans data/profiles.json,
// par son identifiant : une fiche stockée avant un changement de libellé
// (« Faussaire » devenu « Sous couverture », 12 novembre 2026) s'affiche, se
// partage et se dessine avec le libellé du jour. Les règles et l'id ne bougent pas.

import profilesJson from "../data/profiles.json";
import type { CardData, CardProfile, ComparisonData } from "./types";

const BY_ID = new Map(profilesJson.profiles.map((p) => [p.id, p]));

/** Le profil avec le nom et la phrase du catalogue ; inchangé si l'id n'y est plus. */
export function catalogProfile(p: CardProfile): CardProfile {
  const d = BY_ID.get(p.id);
  return d ? { ...p, label: d.label, tagline: d.tagline } : p;
}

function card<T extends Partial<CardData>>(c: T): T {
  return c && c.profile ? { ...c, profile: catalogProfile(c.profile) } : c;
}

/** Une fiche ou une comparaison lue en base, ses profils remis au libellé du catalogue. */
export function withCatalogProfiles<T>(data: T): T {
  if (!data || typeof data !== "object") return data;
  const d = data as unknown as Partial<ComparisonData> & Partial<CardData>;
  if (d.cv && d.github) return { ...d, cv: card(d.cv), github: card(d.github) } as unknown as T;
  return card(d) as unknown as T;
}
