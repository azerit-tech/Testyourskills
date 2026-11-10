// Plus d'écran noir (§18.27) : ce que fait l'écran d'attente une fois la fiche prête.

import { describe, expect, it } from "vitest";
import { holdStep, SCENE_WAIT_MS, type HoldFacts } from "./hold";

const facts = (f: Partial<HoldFacts>): HoldFacts => ({ animate: true, released: true, scene: "ready", needsGesture: false, ...f });

describe("l'écran d'attente, fiche prête", () => {
  it("reste tant que les pièces du dossier ne sont pas lues, scène prête ou non", () => {
    expect(holdStep(facts({ released: false }))).toBe("wait");
    expect(holdStep(facts({ released: false, scene: "off" }))).toBe("wait");
    expect(holdStep(facts({ released: false, animate: false }))).toBe("wait");
  });

  it("reste tant que la scène 3D se charge : jamais la page nue", () => {
    expect(holdStep(facts({ scene: "loading" }))).toBe("wait");
    expect(holdStep(facts({ scene: "loading", needsGesture: true }))).toBe("wait");
  });

  it("se lève seule dès que la scène a rendu sa première image", () => {
    expect(holdStep(facts({}))).toBe("lift");
  });

  it("demande un geste seulement si le son en a besoin", () => {
    expect(holdStep(facts({ needsGesture: true }))).toBe("tap");
  });

  it("le film qui ne peut pas se lancer sans geste (§18.36) demande la pilule, son coupé ou non", () => {
    expect(holdStep(facts({ scene: "gesture" }))).toBe("tap");
    expect(holdStep(facts({ scene: "gesture", needsGesture: true }))).toBe("tap");
    expect(holdStep(facts({ scene: "gesture", released: false }))).toBe("wait");
  });

  it("sans révélation (mouvement réduit) ou sans scène (WebGL absent), la fiche sort dès les pièces lues, sans geste", () => {
    expect(holdStep(facts({ animate: false, scene: "loading", needsGesture: true }))).toBe("lift");
    expect(holdStep(facts({ scene: "off", needsGesture: true }))).toBe("lift");
  });

  it("le filet est de 20 s", () => {
    expect(SCENE_WAIT_MS).toBe(20_000);
  });
});
