// Une fiche stockée avec l'ancien libellé (« Faussaire ») se relit avec celui du
// catalogue : la fiche, la page partagée, l'image et le classement disent le même nom.
import { describe, expect, it } from "vitest";
import { FIXTURE_COMPARISON, FIXTURES } from "./fixtures";
import { withCatalogProfiles } from "./profileCatalog";
import type { CardData, ComparisonData } from "./types";

const OLD = { id: "forger", label: { fr: "Faussaire", en: "Forger" }, tagline: { fr: "Le CV le plus convaincant de la ville", en: "The most convincing CV in town" } };

describe("le profil se relit au catalogue", () => {
  it("une fiche d'avant : « Sous couverture », sa phrase du jour, le même id", () => {
    const card = withCatalogProfiles<CardData>({ ...FIXTURES.gold, profile: OLD });
    expect(card.profile).toEqual({
      id: "forger",
      label: { fr: "Sous couverture", en: "Undercover" },
      tagline: { fr: "Le gros du travail se fait hors caméra", en: "Most of the work happens off camera" },
    });
  });

  it("une comparaison : ses deux fiches ; un id inconnu ou une fiche sans profil restent tels quels", () => {
    const cmp = withCatalogProfiles<ComparisonData>({ ...FIXTURE_COMPARISON, cv: { ...FIXTURE_COMPARISON.cv, profile: OLD }, github: { ...FIXTURE_COMPARISON.github, profile: OLD } });
    expect(cmp.cv.profile?.label.fr).toBe("Sous couverture");
    expect(cmp.github.profile?.label.en).toBe("Undercover");
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
