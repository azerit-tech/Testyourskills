// Le nom et la phrase d'un profil se lisent toujours dans data/profiles.json,
// par son identifiant : une fiche stockée avant un changement de libellé
// (« Faussaire » devenu « Sous couverture », 12 novembre 2026) s'affiche, se
// partage et se dessine avec le libellé du jour. Les règles et l'id ne bougent pas.
//
// À la lecture, chaque fiche prend un des noms de son profil et sa phrase à elle
// (§18.107, shared/punchline.ts) : la phrase écrite par l'IA, sinon une phrase du
// recueil tirée par son id. Rien n'est réécrit en base.

import profilesJson from "../data/profiles.json";
import { isAlias, personalProfile } from "./punchline";
import type { CardData, CardProfile, ComparisonData } from "./types";

const BY_ID = new Map(profilesJson.profiles.map((p) => [p.id, p]));

/** Le profil avec le nom et la phrase du catalogue ; un nom propre à la fiche (un des noms du profil) est gardé ; inchangé si l'id n'y est plus. */
export function catalogProfile(p: CardProfile): CardProfile {
  const d = BY_ID.get(p.id);
  return d ? { ...p, label: isAlias(p.id, p.label) ? p.label : d.label, tagline: d.tagline } : p;
}

function card<T extends Partial<CardData>>(c: T): T {
  if (!c || !c.profile) return c;
  const withCatalog = { ...c, profile: catalogProfile(c.profile) };
  const own = typeof c.id === "string" && c.position ? personalProfile(withCatalog as unknown as CardData) : undefined;
  return own ? { ...withCatalog, profile: own } : withCatalog;
}

/** Une fiche ou une comparaison lue en base : ses profils au catalogue, avec le nom et la phrase de chaque fiche. */
export function withCatalogProfiles<T>(data: T): T {
  if (!data || typeof data !== "object") return data;
  const d = data as unknown as Partial<ComparisonData> & Partial<CardData>;
  if (d.cv && d.github) return { ...d, cv: card(d.cv), github: card(d.github) } as unknown as T;
  return card(d) as unknown as T;
}
