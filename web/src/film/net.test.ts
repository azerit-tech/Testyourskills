// Le film et le réseau (docs/cinematique-poursuite.md §5.3, §5.4).
import { describe, expect, it } from "vitest";
import { filmAssetUrl } from "./net";

describe("les adresses du film", () => {
  it("sans base : l'adresse à empreinte donnée par Vite", () => {
    expect(filmAssetUrl("", "/assets/poursuite-720-AbC123.mp4")).toBe("/assets/poursuite-720-AbC123.mp4");
    expect(filmAssetUrl("  ", "/assets/fin-540-x.mp4")).toBe("/assets/fin-540-x.mp4");
  });

  it("avec une base : le même nom à empreinte sous l'autre hôte, barre finale ou non", () => {
    expect(filmAssetUrl("https://media.example.net/film/", "/assets/fin6-720-Zz9.mp4")).toBe("https://media.example.net/film/fin6-720-Zz9.mp4");
    expect(filmAssetUrl("https://media.example.net/film", "/assets/fin6-720-Zz9.mp4")).toBe("https://media.example.net/film/fin6-720-Zz9.mp4");
  });
});
