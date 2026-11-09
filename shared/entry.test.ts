import { describe, expect, it } from "vitest";
import { detectEntry, normalizeLinkedinUrl, parseGithubLogin } from "./entry";

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
  });
});
