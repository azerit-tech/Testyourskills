import { describe, expect, it } from "vitest";
import { detectEntry, linkedinSlug, normalizeLinkedinUrl, parseGithubLogin, resolveDoor } from "./entry";

describe("detectEntry : le champ unique de l'accueil (§18.24)", () => {
  it.each([
    ["lea", "lea"],
    ["@lea-m", "lea-m"],
    ["  Lea42  ", "Lea42"],
    ["github.com/lea", "lea"],
    ["https://github.com/lea", "lea"],
    ["https://github.com/lea/", "lea"],
    ["http://www.github.com/lea/repo?tab=readme", "lea"],
    ["https://github.com/lea#top", "lea"],
  ])("pseudo GitHub : %s", (raw, login) => {
    expect(detectEntry(raw)).toEqual({ kind: "github", login });
  });

  it.each([
    ["linkedin.com/in/camille-ardent", "https://www.linkedin.com/in/camille-ardent"],
    ["www.linkedin.com/in/camille-ardent", "https://www.linkedin.com/in/camille-ardent"],
    ["https://www.linkedin.com/in/camille-ardent/", "https://www.linkedin.com/in/camille-ardent"],
    ["https://fr.linkedin.com/in/Camille-Ardent?trk=public_profile&utm_source=x", "https://www.linkedin.com/in/camille-ardent"],
    ["http://linkedin.com/in/camille-ardent-123/details/experience/", "https://www.linkedin.com/in/camille-ardent-123"],
    ["https://www.linkedin.com/in/c%C3%A9line-dupr%C3%A9/", "https://www.linkedin.com/in/c%C3%A9line-dupr%C3%A9"],
    ["https://www.linkedin.com/in/céline-dupré", "https://www.linkedin.com/in/c%C3%A9line-dupr%C3%A9"],
  ])("profil LinkedIn : %s", (raw, url) => {
    expect(detectEntry(raw)).toEqual({ kind: "linkedin", url });
  });

  it.each([
    "",
    "   ",
    "linkedin.com/company/azerit",
    "https://www.linkedin.com/pub/camille/1/2/3",
    "https://www.linkedin.com/in/",
    "https://www.linkedin.com/in/ab",
    "https://evil.com/linkedin.com/in/camille",
    "https://linkedin.com.evil.com/in/camille",
    "https://user:pw@www.linkedin.com/in/camille",
    "javascript:alert(1)//linkedin.com/in/camille",
    "gitlab.com/lea",
    "https://example.com/lea",
    "-lea",
    "lea--m",
    "a".repeat(40),
  ])("rien d'utilisable : %j", (raw) => {
    expect(detectEntry(raw)).toBeNull();
  });

  it("ne lit que des chaînes", () => {
    expect(detectEntry(undefined)).toBeNull();
    expect(normalizeLinkedinUrl(42)).toBeNull();
    expect(parseGithubLogin(null)).toBeNull();
    expect(linkedinSlug(undefined)).toBeNull();
  });
});

describe("linkedinSlug : le lien collé devient ce qui suit linkedin.com/in/", () => {
  it.each([
    ["https://fr.linkedin.com/in/Camille-Ardent/?trk=x", "camille-ardent"],
    ["linkedin.com/in/camille-ardent-123/details/experience/", "camille-ardent-123"],
    ["https://www.linkedin.com/in/c%C3%A9line-dupr%C3%A9/", "céline-dupré"],
  ])("%s", (raw, slug) => {
    expect(linkedinSlug(raw)).toBe(slug);
  });

  it.each(["camille-ardent", "linkedin.com/company/azerit", "https://github.com/lea"])("pas un lien de profil : %s", (raw) => {
    expect(linkedinSlug(raw)).toBeNull();
  });
});

describe("resolveDoor : ce que donne le champ de chaque porte", () => {
  it.each([
    ["camille-ardent", "https://www.linkedin.com/in/camille-ardent"],
    ["  Camille-Ardent  ", "https://www.linkedin.com/in/camille-ardent"],
    ["/in/camille-ardent/", "https://www.linkedin.com/in/camille-ardent"],
    ["in/camille-ardent", "https://www.linkedin.com/in/camille-ardent"],
    ["céline-dupré", "https://www.linkedin.com/in/c%C3%A9line-dupr%C3%A9"],
    ["https://fr.linkedin.com/in/camille-ardent?trk=x", "https://www.linkedin.com/in/camille-ardent"],
    ["www.linkedin.com/in/camille-ardent", "https://www.linkedin.com/in/camille-ardent"],
  ])("porte LinkedIn, %j", (raw, url) => {
    expect(resolveDoor("linkedin", raw)).toEqual({ kind: "linkedin", url });
  });

  it.each(["ab", "jean dupont", "@lea", "linkedin.com/company/azerit", "https://www.linkedin.com/in/"])("porte LinkedIn, refusé : %j", (raw) => {
    expect(resolveDoor("linkedin", raw)).toEqual({ kind: "error", error: "linkedin" });
  });

  it("porte LinkedIn, une adresse GitHub bascule vers GitHub", () => {
    expect(resolveDoor("linkedin", "https://github.com/lea/repo")).toEqual({ kind: "github", login: "lea", switchTo: "github" });
    expect(resolveDoor("linkedin", "github.com/")).toEqual({ kind: "error", error: "linkedin" });
  });

  it.each([
    ["lea", "lea"],
    ["@lea-m", "lea-m"],
    ["https://github.com/lea", "lea"],
  ])("porte GitHub, %j", (raw, login) => {
    expect(resolveDoor("github", raw)).toEqual({ kind: "github", login });
  });

  it("porte GitHub, un lien LinkedIn bascule vers LinkedIn", () => {
    expect(resolveDoor("github", "https://www.linkedin.com/in/camille-ardent/")).toEqual({
      kind: "linkedin",
      url: "https://www.linkedin.com/in/camille-ardent",
      switchTo: "linkedin",
    });
    expect(resolveDoor("github", "linkedin.com/company/azerit")).toEqual({ kind: "error", error: "linkedin" });
  });

  it.each(["lea--m", "gitlab.com/lea", "-lea"])("porte GitHub, refusé : %j", (raw) => {
    expect(resolveDoor("github", raw)).toEqual({ kind: "error", error: "github" });
  });

  it.each(["linkedin", "github"] as const)("porte %s, champ vide", (door) => {
    expect(resolveDoor(door, "   ")).toEqual({ kind: "error", error: "empty" });
  });
});
