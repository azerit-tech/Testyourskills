// Une fiche stockée avec l'ancien libellé (« Faussaire ») se relit avec celui du
// catalogue : la fiche, la page partagée, l'image et le classement disent le même nom.
import { describe, expect, it } from "vitest";
import { FIXTURE_COMPARISON, FIXTURES } from "./fixtures";
import { catalogProfile, withCatalogProfiles } from "./profileCatalog";
import { aliasFor, aliasesOf, fallbackLine } from "./punchline";
import type { CardData, ComparisonData } from "./types";

const OLD = { id: "forger", label: { fr: "Faussaire", en: "Forger" }, tagline: { fr: "Le CV le plus convaincant de la ville", en: "The most convincing CV in town" } };

describe("le profil se relit au catalogue", () => {
  it("une fiche d'avant : un des noms du jour (« Sous couverture » et les siens, §18.107), sa phrase à elle, le même id", () => {
    const card = withCatalogProfiles<CardData>({ ...FIXTURES.gold, profile: OLD });
    expect(card.profile).toEqual({ id: "forger", label: aliasFor("forger", FIXTURES.gold.id), tagline: fallbackLine({ ...FIXTURES.gold, profile: OLD }) });
    expect(aliasesOf("forger")[0]).toEqual({ fr: "Sous couverture", en: "Undercover" });
    // Le nom du catalogue, pour qui le demande sans fiche (le mur des profils) ; un nom du profil est gardé tel quel.
    expect(catalogProfile(OLD).label).toEqual({ fr: "Sous couverture", en: "Undercover" });
    expect(catalogProfile({ ...OLD, label: aliasesOf("forger")[2]! }).label).toEqual(aliasesOf("forger")[2]);
  });

  it("une comparaison : ses deux fiches ; un id inconnu ou une fiche sans profil restent tels quels", () => {
    const cmp = withCatalogProfiles<ComparisonData>({ ...FIXTURE_COMPARISON, cv: { ...FIXTURE_COMPARISON.cv, profile: OLD }, github: { ...FIXTURE_COMPARISON.github, profile: OLD } });
    expect(cmp.cv.profile?.label).toEqual(aliasFor("forger", FIXTURE_COMPARISON.cv.id));
    expect(cmp.github.profile?.label).toEqual(aliasFor("forger", FIXTURE_COMPARISON.github.id));
    const gone = { id: "retired", label: { fr: "X", en: "X" }, tagline: { fr: "Y", en: "Y" } };
    expect(withCatalogProfiles<CardData>({ ...FIXTURES.gold, profile: gone }).profile).toEqual(gone);
    const bare = { ...FIXTURES.gold, profile: undefined };
    expect(withCatalogProfiles<CardData>(bare)).toEqual(bare);
  });

  it("aucun texte du site ne dit plus « Faussaire » ni « le CV le plus convaincant »", async () => {
    const { default: profiles } = await import("../data/profiles.json");
    expect(JSON.stringify(profiles)).not.toMatch(/Faussaire|Forger|plus convaincant|most convincing/);
  });
});
